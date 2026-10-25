// agentPolicy (spec 6.5, D23, D24, D46): allow | ask | refuse per line, with reasons from every rule that hit.
// The first group that matches decides (refuse, then ask, then allow). Isomorphic: no Node APIs.
import type { Policy } from '../schema/data/health.ts'
import type { CellSummary, IndexEntry } from '../schema/published/modules.ts'
import { AGE_GATE_DAYS, VERDICT_STATES, type VersionStatus } from './lines.ts'
import { compareVersions, isStable, isVersion, satisfiesRange } from './semver.ts'
import { clipText } from './text.ts'
import { collisionText } from './finding.ts'

/** IndexEntry fields the policy reads. IndexEntry itself satisfies it. */
export type PolicyEntry = Pick<
  IndexEntry,
  | 'locator'
  | 'npm'
  | 'kind'
  | 'type'
  | 'status'
  | 'license'
  | 'replaces'
  | 'moduleIds'
  | 'identity'
  | 'version'
  | 'compat'
  | 'signals'
> & {
  /** Open advisories (SyncRecord.advisories). Absent: carried over from `agentPolicy[line]`. */
  advisories?: readonly { id: string; severity: 'low' | 'moderate' | 'high' | 'critical'; fixedIn: string | null }[]
  /** Facts gate: the package has the src/dist pair. Absent: carried over from `agentPolicy[line]`. */
  installable?: boolean | null
  /** Raw license value (package.json), shown next to a non-OSI kind. */
  licenseValue?: string | null
  /** Curator reason for hold/delisted (descriptor `reason`). */
  statusReason?: string | null
  /** Precomputed policy (IndexEntry.agentPolicy); used only to carry facts the entry does not hold. */
  agentPolicy?: Record<string, Policy>
  /** Newest stable version past the age gate per line; absent: read from `_meta` (INSTALLABLE_META_KEY). */
  installableVersions?: Readonly<Record<string, string | null>>
  /**
   * Status of the install version per line (`versionStatus` of `installVersion`; null = no receipt for it).
   * Absent (a bare IndexEntry): BROKEN and NOT_VERIFIED are carried over from `agentPolicy[line]`, else read
   * from `compat.lines[line]`.
   */
  installStatus?: Readonly<Record<string, VersionStatus | null>>
  _meta?: Readonly<Record<string, unknown>>
}

export interface AppContext {
  enabledModules: readonly { id: string; from: string }[]
}

export interface PolicyOptions {
  /** Clock for the age gate (ISO date-time). Default: now. */
  now?: string
}

type Reason = Policy['reasons'][number]

export const POLICY_CODES = [
  'HOLD',
  'ADVISORY',
  'BROKEN',
  'QUARANTINE',
  'NOT_INSTALLABLE',
  'UNPINNED_GIT',
  'THIRD_PARTY',
  'NOT_VERIFIED',
  'ROUTE_COLLISION',
  'LICENSE',
  'REPLACES',
  'SLOT',
  'SUPPLY_CHAIN',
  'OFFICIAL_VERIFIED',
  'IN_PRESET',
] as const

/**
 * Words of the UI dictionary for the reason codes (review r4: `THIRD_PARTY` and `LICENSE License: ...` read like a
 * data dump). The code stays in JSON and MCP; people read the label and the text.
 */
export const REASON_LABELS: Record<(typeof POLICY_CODES)[number], string> = {
  HOLD: 'On hold',
  ADVISORY: 'Advisory',
  BROKEN: 'Broken',
  QUARANTINE: 'Age gate',
  NOT_INSTALLABLE: 'Not installable',
  UNPINNED_GIT: 'No tag',
  // review r8: `Third-party` stood next to the `02 Community` chip; the rule is about not being official
  THIRD_PARTY: 'Not official',
  NOT_VERIFIED: 'Not verified',
  ROUTE_COLLISION: 'Route collision',
  LICENSE: 'License',
  REPLACES: 'Replaces',
  SLOT: 'Module slot',
  SUPPLY_CHAIN: 'Supply chain',
  IN_PRESET: 'In a new app',
  OFFICIAL_VERIFIED: 'Official',
}

const REFUSE_CODES = new Set(['HOLD', 'ADVISORY', 'BROKEN', 'QUARANTINE', 'NOT_INSTALLABLE', 'UNPINNED_GIT'])
const CARRIED = ['ADVISORY', 'NOT_INSTALLABLE', 'BROKEN'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2026-10-09` -> `9 Oct` (UTC, no Intl, same output in Node, browsers and Workers). */
export function shortDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!m) return isoDate
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''}`.trim()
}

/**
 * The tail of every sentence that names a break (review r4: three places said one red night three ways): ` since 23 Oct`
 * once a second night confirmed it, `, one red night (23 Oct)` before. The same words in the agent policy, VER-1 and
 * on the module page; `since` only after the confirmation.
 */
export function breakTail(since: string | null, at: string | null, confirmed: boolean): string {
  if (confirmed) return since ? ` since ${shortDate(since)}` : ''
  return at ? `, one red night (${shortDate(at)})` : ', one red night'
}

/** `0.8`, `0.8 and next`, `0.8, 0.9 and next`. */
export function listAnd(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/**
 * The one sentence of a break (review r6: people read `Broken at`, the agent policy said `Fails at`): `Broken at
 * typecheck on 0.9 since 23 Oct.` The strip, the drawer, VER-1, the card and the agent policy all print it.
 */
export function brokenText(
  lines: string | readonly string[],
  step: string | null,
  since: string | null,
  at: string | null = null,
  confirmed = true,
): string {
  const on = typeof lines === 'string' ? lines : listAnd(lines)
  return `Broken${step ? ` at ${step}` : ''} on ${on}${breakTail(since, at, confirmed)}.`
}

/**
 * The one sentence of a night that judged nothing (review r6: three wordings of one state): `Not judged on 0.9: the
 * run did not finish on 23 Oct.` or `... our test app failed on 23 Oct.` Never the module's fault.
 */
export function notJudgedText(
  lines: string | readonly string[],
  status: 'infra-error' | 'harness-red' | 'quarantine',
  at: string | null,
): string {
  const on = typeof lines === 'string' ? lines : listAnd(lines)
  // the age gate held back a dependency (round 13): the day first, so it never reads as the day of the gate
  if (status === 'quarantine') return `Not judged on ${on}: ${at ? `on ${shortDate(at)}, ` : ''}${QUARANTINE_WHY}.`
  return `Not judged on ${on}: ${NOT_JUDGED_WHY[status]}${at ? ` on ${shortDate(at)}` : ''}.`
}

/**
 * Why a run held back by Yarn's age gate judged nothing (round 13, the classic night of 24 Oct: `YN0016
 * @aws-sdk/credential-provider-http@npm:^3.972.77 ... are quarantined` in `install`): a dependency of the app or the
 * module was younger than the gate, which says nothing about the module. One sentence everywhere: the strip, the
 * drawer, /compat, /r, the card, llms*.txt, `check_compat` and the agent policy.
 */
export const QUARANTINE_WHY = 'Yarn held back a dependency younger than its age gate'

/** The sentence of that state where the line is named already (the drawer's row, the receipt's result). */
export const QUARANTINE_TEXT = `Not judged: ${QUARANTINE_WHY}.`

/**
 * A `quarantine` cell of a run whose install or add step Yarn's age gate stopped (a dependency held back), as opposed
 * to the plan's own `quarantine` entry for a release of the module still in the gate (no failed step).
 */
export function heldBack(c: { status: string; step?: string | null } | null | undefined): boolean {
  return !!c && c.status === 'quarantine' && !!c.step
}

/** Why a night judged nothing, the words of `notJudgedText` (and of /for-agents, review r7: no `harness red`). */
export const NOT_JUDGED_WHY: Readonly<Record<'infra-error' | 'harness-red', string>> = {
  'harness-red': 'our test app failed',
  'infra-error': 'the run did not finish',
}

/**
 * The second sentence of a night that judged nothing, where a receipt stands alone (/r/<id>, review r7): the first is
 * always `notJudgedText`, so the receipt page and the strip say the same state the same way.
 */
export const NOT_JUDGED_TAIL = 'Nothing here counts against the module.'

/**
 * The one sentence of a line whose new app already registers the package (D10; decision of 24 Oct: a new app is one
 * from the classic preset, what `npx create-mercato-app` makes): `Already on in a new app on 0.8, 0.9 and next.` The
 * line keeps its own verdict, the receipt of the version a new app ships there (`compat.ships`); the strip, the drawer,
 * the install box, /compat, the card and the tools say it this way.
 */
export function presetText(lines: string | readonly string[]): string {
  return `${presetShort(lines)}.`
}

/** `presetText` without the period, for places that continue it (the module header, the phone install bar). */
export function presetShort(lines: string | readonly string[]): string {
  const on = typeof lines === 'string' ? lines : listAnd(lines)
  return `Already on in a new app on ${on}`
}

/**
 * The one install sentence of a line whose new app already registers the package (review r10): the install box,
 * raw/modules.md, the agent card, llms-full.txt, `plan_install` and `check_compat` print it; the page sets the IDs in
 * mono. An app from the empty preset follows with `emptyPresetTail` when that preset does not register it.
 */
export function presetInstallText(moduleIds: readonly string[]): string {
  return `Nothing to install: a new app already registers ${moduleIds.length ? listAnd(moduleIds) : 'it'} in src/modules.ts.`
}

/** The preset of the signal `in isolation`, always named (decision of 24 Oct: `a new app` is classic). */
export const EMPTY_PRESET_NAME = 'the empty preset'

/** The lead before the command or the steps of an app from the empty preset. */
export const EMPTY_PRESET_LEAD = 'In an app from the empty preset:'

/** What an app from the empty preset runs: `In an app from the empty preset: <command>`. */
export function emptyPresetTail(command: string): string {
  return `${EMPTY_PRESET_LEAD} ${command}`
}

/**
 * The note of an app from the empty preset that registers the package too (events, search), in the steps of that
 * preset (review of 24 Oct: the block of the empty preset said `a new app already registers events`): `An app from
 * the empty preset registers events too: nothing to install.`
 */
export function emptyPresetHasText(moduleIds: readonly string[]): string {
  return `An app from the empty preset registers ${moduleIds.length ? listAnd(moduleIds) : 'it'} too: nothing to install.`
}

/**
 * The one sentence of a line whose new app already registers a module and whose empty preset does not (checkout,
 * currencies): `Nothing to install: a new app already registers checkout in src/modules.ts. In an app from the empty
 * preset: yarn mercato module add @open-mercato/checkout@0.9.0`. The page, the card, raw/modules.md, llms-full.txt,
 * `plan_install` and `check_compat` print it.
 */
export function newAppInstallText(moduleIds: readonly string[], emptyCommand: string | null): string {
  return emptyCommand
    ? `${presetInstallText(moduleIds)} ${emptyPresetTail(emptyCommand)}`
    : presetInstallText(moduleIds)
}

/**
 * The claim word of an entry (review r11): claims are for authors outside the Open Mercato org, so an official package
 * (the open-mercato org on npm and GitHub) has none, never `Unclaimed`. The page header and the card's Trust line read
 * it from here, so Human and Agent say the same.
 */
export function claimLabel(e: { type: string; identity: { claimed: boolean } }): 'Claimed' | 'Unclaimed' | null {
  if (e.type === 'official') return null
  return e.identity.claimed ? 'Claimed' : 'Unclaimed'
}

/** Lines whose new app (classic) already registers the package (`compat.inPresets`). */
export function presetOn(e: { compat: { inPresets?: readonly string[] } }, line: string | null): boolean {
  return line !== null && (e.compat.inPresets ?? []).includes(line)
}

/** Lines whose app from the empty preset registers the package too (`compat.inEmptyPreset`: events, search). */
export function emptyPresetOn(e: { compat: { inEmptyPreset?: readonly string[] } }, line: string | null): boolean {
  return line !== null && (e.compat.inEmptyPreset ?? []).includes(line)
}

// ---------------------------------------------------------------------------------------------------------
// The signal `in isolation` (decision of 24 Oct)

/** What the isolation sentences read: a cell of the empty preset, with what its failed step found. */
export type IsolationOf = Pick<CellSummary, 'status' | 'step' | 'at' | 'moduleVersion'> & { finding?: string | null }

/** The lead of every isolation sentence, the same on the page, in the card, in llms*.txt and in the tools. */
export const ISOLATION_LEAD = 'In isolation (empty preset):'

/**
 * The one sentence of the signal `in isolation` on a line (an app from the empty preset, the module without the rest of
 * the platform): `In isolation (empty preset): verified on 23 Oct.`, `... broken at smoke on 23 Oct. GET /api/events
 * needs the workflows.view feature, and the empty preset does not enable the workflows module.` or `... not
 * judged on 23 Oct.` A receipt of another version than the line's main version names it (`0.9.0 broken at typecheck
 * on 23 Oct.`). It never says what a new app does: that is the main verdict, from the classic preset.
 */
export function isolationText(c: IsolationOf, installs?: string | null): string {
  const v = installs && c.moduleVersion && c.moduleVersion !== installs ? `${c.moduleVersion} ` : ''
  const on = c.at ? ` on ${shortDate(c.at)}` : ''
  const word =
    c.status === 'verified'
      ? 'verified'
      : c.status === 'broken'
        ? `broken${c.step ? ` at ${c.step}` : ''}`
        : c.status === 'quarantine' && !heldBack(c)
          ? 'in the age gate'
          : 'not judged'
  const found =
    c.status === 'broken' && c.finding
      ? ` ${c.finding.charAt(0).toUpperCase()}${c.finding.slice(1)}`
      : heldBack(c)
        ? ` ${QUARANTINE_WHY}.`
        : ''
  return `${ISOLATION_LEAD} ${v}${word}${on}.${found}`
}

/**
 * The reason of its own for what a failed isolation step found (review of 24 Oct): `In isolation (empty preset): GET
 * /api/events needs the workflows.view feature, ...`, with the version the receipt is about when it is not the line's
 * (`In isolation (empty preset): in 0.9.0, GET /api/events needs ...`), as the state reason before it names it.
 */
export function isolationFindingReason(c: IsolationOf, installs?: string | null): string {
  const f = c.finding ?? ''
  const v = installs && c.moduleVersion && c.moduleVersion !== installs ? c.moduleVersion : null
  // a word keeps its case after `in 0.9.0, ` only when it is an acronym or a path (GET, /api)
  const head = v
    ? `in ${v}, ${/^[A-Z][a-z]/.test(f) ? `${f.charAt(0).toLowerCase()}${f.slice(1)}` : f}`
    : `${f.charAt(0).toUpperCase()}${f.slice(1)}`
  return `${ISOLATION_LEAD} ${head}`
}

/**
 * Reason texts of a policy as one paragraph (the card, review of 24 Oct: `In isolation (empty preset): ... In isolation
 * (empty preset): ...`): a finding reason that follows the isolation state reason continues that sentence under one
 * lead, `In isolation (empty preset): 0.9.0 broken at smoke on 23 Oct. GET /api/events needs ...`.
 */
export function reasonsText(reasons: readonly { text: string }[]): string {
  const out: string[] = []
  for (const r of reasons) {
    const prev = out.at(-1)
    if (prev?.includes(ISOLATION_LEAD) && r.text.startsWith(`${ISOLATION_LEAD} `)) {
      const rest = r.text.slice(ISOLATION_LEAD.length + 1).replace(/^in [^\s,]+, /, '')
      out[out.length - 1] = `${prev} ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`
    } else out.push(r.text)
  }
  return out.join(' ')
}

/** The main verdict of a line with no receipt from the classic preset yet. */
export function notTestedText(line: string): string {
  return `Not yet tested in a new app on ${line}.`
}

/**
 * The one sentence of a line that a new app has not tested yet while an app from the empty preset has (decision of 24
 * Oct): `Not yet tested in a new app on 0.9. In isolation (empty preset): verified on 23 Oct.` The empty receipt never
 * becomes the main verdict.
 */
export function untestedText(line: string, iso?: IsolationOf | null, installs?: string | null): string {
  return iso ? `${notTestedText(line)} ${isolationText(iso, installs)}` : notTestedText(line)
}

function clip(s: string, max = 160): string {
  return clipText(s, max)
}

/** `IndexEntry._meta` key of the newest stable version past the Yarn age gate, per line (spec 4.6). */
export const INSTALLABLE_META_KEY = 'com.openmercato.modules/installable'

/** What `installVersion` reads: the version block plus the per-line installable fallback. */
export type VersionSource = Pick<IndexEntry, 'version'> & {
  /** Newest stable version a fresh app can install today, per line (age gate applied). Wins over `_meta`. */
  installableVersions?: Readonly<Record<string, string | null>>
  _meta?: Readonly<Record<string, unknown>>
}

/**
 * Newest stable version past the age gate on a line: a string, null when none is installable yet, or
 * undefined when the entry does not say (an IndexEntry built without it).
 */
export function installableOn(e: VersionSource, line: string | null): string | null | undefined {
  if (line === null) return undefined
  const map = e.installableVersions ?? e._meta?.[INSTALLABLE_META_KEY]
  if (!map || typeof map !== 'object') return undefined
  const v = (map as Record<string, unknown>)[line]
  return typeof v === 'string' ? v : v === null ? null : undefined
}

/**
 * Version a fresh app would install on the line (spec 4.6, D46): `recommended`, else the highest stable version
 * past the age gate, else the newest release (shown with `Installable from <date>`), else the preview.
 */
export function installVersion(e: VersionSource, line: string | null): string | null {
  return (
    (line !== null ? e.version.recommended[line] : null) ??
    installableOn(e, line) ??
    e.version.latest ??
    e.version.preview ??
    null
  )
}

/**
 * The version an app from the empty preset installs on a line (review of 24 Oct): `installVersion`, except on a line a
 * new app ships the package (`compat.ships`) when that version is a bad pick there: the empty preset's own receipt
 * there broke on it, or, with no receipt of it in isolation, its declared peers reject the line (round 15: on day 0 the
 * command for checkout on 0.8 was 0.9.0, whose peers pin 0.9.0, in an app that has 0.8.0). Then the version a new app
 * ships. A receipt that verified the version in isolation wins over its declaration. A develop snapshot is never
 * proposed (next keeps the stable version). `emptyCommandCaution` still speaks when no other version is left (the
 * version a new app ships is the broken one). The install plan's `emptyPreset`, the install box, the card,
 * `search_modules` and `IndexEntry.install` read it.
 */
export function emptyPresetVersion(
  e: VersionSource & {
    compat?: {
      ships?: Readonly<Record<string, string>>
      isolation?: Readonly<Record<string, IsolationOf>>
      builtFor?: IndexEntry['compat']['builtFor']
    }
  },
  line: string | null,
): string | null {
  const v = installVersion(e, line)
  if (line === null || !v) return v
  const ships = e.compat?.ships?.[line]
  if (!ships || ships === v) return v
  const iso = e.compat?.isolation?.[line]
  if (iso?.moduleVersion === v) return iso.status === 'broken' ? ships : v
  // no receipt of it in isolation: its declaration decides; `ships` is the line's own version (create-mercato-app pins
  // its @open-mercato packages to itself, lib/core/lines.ts shippedVersion)
  const range = e.compat?.builtFor ? declaredRangeOf(e as JudgedEntry, v) : null
  return isStable(ships) && range !== null && !satisfiesRange(ships, range) ? ships : v
}

/**
 * The declared peer range of one version of the entry, as far as `compat.builtFor` tells it: `ranges` names the range
 * of the version each line is judged on, so a line judged on `version` gives its range; without `ranges`, `range` is
 * the declaration of the version every line is judged on. Null when the catalog has not read it (or it declares none).
 */
export function declaredRangeOf(e: JudgedEntry, version: string): string | null {
  const b = e.compat.builtFor
  if (b.kind === 'missing' || b.kind === 'star') return null
  if (b.ranges) {
    for (const [k, r] of Object.entries(b.ranges)) if (lineVersion(e, k) === version) return r
    return null
  }
  const keys = new Set([...Object.keys(e.compat.lines), ...Object.keys(e.compat.ships ?? {})])
  return [...keys].some((k) => lineVersion(e, k) === version) ? b.range : null
}

/**
 * The version a line's main verdict is about (decision of 24 Oct): on a line whose new app already registers the
 * package, the version that app ships (`compat.ships`, create-mercato-app pins its @open-mercato packages to its own
 * version); elsewhere the version a fresh app installs (`installVersion`).
 */
export function lineVersion(
  e: VersionSource & { compat?: { ships?: Readonly<Record<string, string>> } },
  line: string | null,
): string | null {
  return (line !== null ? e.compat?.ships?.[line] : undefined) ?? installVersion(e, line)
}

/**
 * `Built for` in one sentence, the same on the module page, in the agent card and in `check_compat` (review r9: the
 * page said `Built for 0.8 and 0.9 (peers of 0.8.0 and 0.9.0)` and the card `Built for: 0.9.0 (exact-pin)`). Each
 * line is judged on the peers of the version a new app has there (`lineVersion`, E5): lines of different versions name
 * their versions.
 */
export function builtForText(e: VersionSource & Pick<IndexEntry, 'compat'>): string {
  const b = e.compat.builtFor
  if (b.kind === 'missing' || !b.range) return 'Built for: no Open Mercato peer range'
  if (b.kind === 'star') return `Built for any version (peers ${b.range})`
  const minor = /(\d+\.\d+)/.exec(b.range)?.[1] ?? b.range
  if (b.kind === 'open') return `Built for ${minor} and later (peers ${b.range})`
  const versions = [...new Set(b.lines.map((k) => lineVersion(e, k)).filter((v): v is string => !!v))]
  if (b.lines.length && versions.length > 1) return `Built for ${listAnd(b.lines)} (peers of ${listAnd(versions)})`
  return `Built for ${b.lines.length ? listAnd(b.lines) : minor} (peers ${b.range})`
}

/**
 * The declaration of the version a new app has on a line (`lineVersion`), for `check_compat` and the /compat popover
 * (review of 24 Oct: both named the peers of checkout 0.9.0 in a cell about the 0.8.0 a new 0.8 app has): its range
 * and whether it accepts the line, or `read: false` when the catalog has not read that version's peers (the develop
 * snapshot a new app ships on next). `range: null` with `read: true`: the version declares no Open Mercato peers.
 */
export function declaredOn(
  b: IndexEntry['compat']['builtFor'],
  line: string,
): { range: string | null; accepts: boolean; read: boolean } {
  if (b.ranges) {
    const r = b.ranges[line]
    return r ? { range: r, accepts: b.lines.includes(line), read: true } : { range: null, accepts: false, read: false }
  }
  if (b.kind === 'missing' || !b.range) return { range: null, accepts: false, read: true }
  return { range: b.range, accepts: b.lines.includes(line), read: true }
}

// ---------------------------------------------------------------------------------------------------------
// The version a line's receipt judged (review r6)

/**
 * A receipt of another version than the one a fresh app installs on its line. `ahead`: a stable release newer than
 * the newest one the catalog's npm data lists (review r7: the preview run installed akeneo 1.0.1 hours after the npm
 * sync saw 0.9.0 as latest), said in the sentence so the page never reads as if the catalog picked an old version.
 */
export type OtherReceipt = Pick<CellSummary, 'moduleVersion' | 'status' | 'step' | 'at'> & { ahead?: boolean }

/** What the line of an entry says about the version a fresh app installs there. */
export interface LineJudgement {
  /** Version the line's verdict is about (`lineVersion`): the version a new app ships there, else the one it installs. */
  installs: string | null
  /** The line's cell when it is about that version (or about no version), else null. */
  cell: CellSummary | null
  /**
   * The line's last receipt when it judged another version than `installs` (a release came or went since that
   * night, or the run picked another release): shown with its version, never counted as the line's verdict.
   */
  other: (CellSummary & { ahead?: boolean }) | null
}

export type JudgedEntry = VersionSource & Pick<IndexEntry, 'compat'>

/**
 * The cell of a line as a verdict on the version a fresh app installs there (spec 6.5: BROKEN is judged on the
 * install version). A verdict of another version is moved to `other`, so the line reads as not judged for its own
 * version. No exception for `recommended` (review r7): the emitter puts the recommended version's own receipt in the
 * cell (`cellSummaries` with the install versions), so a cell of another version is never that version's verdict.
 */
export function judgeLine(e: JudgedEntry, line: string): LineJudgement {
  const cell = e.compat.lines[line] ?? null
  const installs = lineVersion(e, line)
  if (
    !cell ||
    cell.moduleVersion === null ||
    installs === null ||
    cell.moduleVersion === installs ||
    !VERDICT_STATES.has(cell.status)
  )
    return { installs, cell, other: null }
  const latest = e.version.latest
  const v = cell.moduleVersion
  const ahead = !!latest && isVersion(v) && isStable(v) && compareVersions(v, latest) > 0
  return { installs, cell: null, other: ahead ? { ...cell, ahead } : cell }
}

/**
 * `compat.lines` as verdicts on the install versions: a cell of another version is left out, so the line counts as
 * having no receipt yet (the hero, /compat, the radar, the registry and the strip count these).
 */
export function judgedLines(e: JudgedEntry): Record<string, CellSummary> {
  const out: Record<string, CellSummary> = {}
  for (const k of Object.keys(e.compat.lines)) {
    const j = judgeLine(e, k)
    if (j.cell) out[k] = j.cell
  }
  return out
}

/** The entry with `compat.lines` read by `judgedLines` (same object when nothing changes). */
export function withJudgedLines<T extends JudgedEntry>(e: T): T {
  const lines = judgedLines(e)
  if (Object.keys(lines).length === Object.keys(e.compat.lines).length) return e
  return { ...e, compat: { ...e.compat, lines } }
}

/** A receipt of another version per line key, with the version a fresh app installs there. */
export function otherVersionCells(
  e: JudgedEntry,
): Record<string, { installs: string; other: CellSummary & { ahead?: boolean } }> {
  const out: Record<string, { installs: string; other: CellSummary & { ahead?: boolean } }> = {}
  for (const k of Object.keys(e.compat.lines)) {
    const j = judgeLine(e, k)
    if (j.other && j.installs) out[k] = { installs: j.installs, other: j.other }
  }
  return out
}

/** The verdict of another version's receipt in a few words: `broken at typecheck, 23 Oct`. */
function otherVerdict(c: Pick<CellSummary, 'status' | 'step' | 'at'>): string {
  const on = c.at ? `, ${shortDate(c.at)}` : ''
  if (c.status === 'broken') return `broken${c.step ? ` at ${c.step}` : ''}${on}`
  if (c.status === 'verified') return `verified${on}`
  return `not judged${on}`
}

/**
 * The first half of the other-version sentence, for places that name no step or day (the module header):
 * `No receipt for 0.8.0 on 0.8 yet`.
 */
export function otherVersionShort(lines: string | readonly string[], installs: string): string {
  const on = typeof lines === 'string' ? lines : listAnd(lines)
  return `No receipt for ${installs} on ${on} yet`
}

/**
 * The one sentence for a line whose receipt judged another version (review r6), the same in the module header, the
 * strip, the install box, the drawer, the /compat popover, the agent card and the agent policy:
 * `No receipt for 0.8.0 on 0.8 yet; the receipt is for 0.9.0 (broken at typecheck, 23 Oct).`
 */
export function otherVersionText(lines: string | readonly string[], installs: string, other: OtherReceipt): string {
  const many = typeof lines !== 'string' && lines.length > 1
  const ahead = other.ahead ? `, ${AHEAD_TEXT}` : ''
  return `${otherVersionShort(lines, installs)}; the receipt${many ? 's are' : ' is'} for ${other.moduleVersion} (${otherVerdict(other)})${ahead}.`
}

/**
 * The tail of the other-version sentence for a release above npm's `latest` tag (`OtherReceipt.ahead`, review r7).
 * Review r9: akeneo 1.0.1 was published in March, before 0.9.0, and npm still tags 0.9.0 latest; `does not list yet`
 * read like a sync that had not run, so the sentence says what npm says.
 */
export const AHEAD_TEXT = 'a version above the latest tag on npm'

/**
 * A newer break of another version on a line whose install version has its own verdict (review r7: webhooks and
 * scheduler 0.9.0 broke at typecheck on 0.8 after 0.8.0 was verified there): why the line's command pins the install
 * version. `0.9.0 is broken at typecheck on 0.8 (23 Oct), so the install command for 0.8 pins 0.8.0.`
 */
export function pinnedText(
  line: string,
  installs: string,
  other: Pick<CellSummary, 'moduleVersion' | 'step' | 'at'>,
): string {
  const step = other.step ? ` at ${other.step}` : ''
  const at = other.at ? ` (${shortDate(other.at)})` : ''
  return `${other.moduleVersion} is broken${step} on ${line}${at}, so the install command for ${line} pins ${installs}.`
}

/**
 * The install sentence of an entry on a line, the same on the page, in the card, in llms-full.txt, raw/modules.md and
 * the tools (decision of 24 Oct): where a new app already registers it, `presetInstallText` and the command of an app
 * from the empty preset when that preset does not; elsewhere `Install: <command>`.
 */
export function installSentence(
  e: Pick<IndexEntry, 'moduleIds'> & { compat: { inPresets?: readonly string[]; inEmptyPreset?: readonly string[] } },
  line: string | null,
  command: string,
): string {
  if (!presetOn(e, line)) return `Install: ${command}`
  return newAppInstallText(e.moduleIds, emptyPresetOn(e, line) ? null : command)
}

/**
 * The signal `in isolation` of the command an app from the empty preset runs, when that very version broke there
 * (review of 24 Oct: on 0.8 the empty-preset steps of checkout recommended 0.9.0, the version its own isolation receipt
 * shows broken at typecheck in that app): the isolation sentence, said right after the command (the install plan's
 * `emptyPreset.then`, the install box, the card). Null otherwise. Never part of the main verdict or the policy.
 */
export function emptyCommandCaution(e: JudgedEntry, line: string | null, version: string | null): string | null {
  if (!line || !version) return null
  const iso = e.compat.isolation?.[line]
  if (!iso) return null
  // the night of the empty preset tested another version than the one this command installs (round 13: checkout on
  // 0.8, the command installs 0.8.0, the receipt in isolation is of 0.9.0): no receipt for it, said plainly
  if (iso.moduleVersion && iso.moduleVersion !== version)
    return `${ISOLATION_LEAD} no receipt for ${version} yet; ${isolationText(iso, version).slice(ISOLATION_LEAD.length + 1)}`
  if (iso.status !== 'broken') return null
  return isolationText(iso, lineVersion(e, line))
}

/**
 * The signal `in isolation` of an entry on a line in one sentence, or null (decision of 24 Oct): with no receipt from
 * a new app yet, `Not yet tested in a new app on 0.9. In isolation (empty preset): verified on 23 Oct.`; next to a
 * verdict that says something else, `In isolation (empty preset): ...`; null when both presets say the same of the same
 * version. The page, the card, llms-full.txt, raw/modules.md and check_compat print it.
 */
export function isolationLineText(e: JudgedEntry, line: string): string | null {
  const iso = e.compat.isolation?.[line]
  if (!iso) return null
  const v = lineVersion(e, line)
  const cell = judgeLine(e, line).cell
  if (!cell) return untestedText(line, iso, v)
  // the same state of the same version in both presets adds nothing to the verdict
  if (cell.status === iso.status && cell.moduleVersion === iso.moduleVersion) return null
  return isolationText(iso, v)
}

// ---------------------------------------------------------------------------------------------------------
// Lint `backend-route-collision` (round 14): a warning on a line without a verdict, never a verdict

/** The backend route a finding of `duplicate-route` names (`... adds the backend route /backend/webhooks, ...`). */
export function findingRoute(finding: string | null | undefined): string | null {
  const m = finding ? /\bbackend route (\/\S*?)[,:]/.exec(finding) : null
  return m ? (m[1] as string) : null
}

/** A line whose receipts give no verdict on the version a new app has there (the static warning speaks there only). */
function noVerdict(e: JudgedEntry, line: string): boolean {
  if (e.version.recommended[line]) return false
  const c = judgeLine(e, line).cell
  return !c || (c.status !== 'verified' && c.status !== 'broken')
}

/**
 * The static warning of a line without a verdict (round 14): `Static check: the module adds the backend route
 * /backend/webhooks, which a new app already has from the webhooks module (@open-mercato/webhooks).` Null on a line
 * with a verdict (its receipt says what happened) or without a collision.
 */
export function collisionStatic(e: JudgedEntry, line: string | null): string | null {
  if (!line || !noVerdict(e, line)) return null
  return collisionText(e.compat.collisions?.[line] ?? [])
}

/**
 * What the receipts of the same version found on the other lines (review r13, item 13: freighttech 0.7.2 is not judged
 * on 0.9, and broke at add on 0.8 and next on the route of the webhooks module): `0.7.2 broke at add on 0.8 and next
 * for this reason.` after the static warning, or the finding itself without one. Null otherwise. Round 15: `broke`,
 * so the static warning and this sentence fit one note of `check_compat` (200 characters), as the card prints them.
 */
export function collisionEvidence(e: JudgedEntry, line: string | null): string | null {
  if (!line || !noVerdict(e, line)) return null
  const v = lineVersion(e, line)
  const own = (e.compat.collisions?.[line] ?? []).map((c) => c.route)
  const hits: { key: string; step: string | null; finding: string }[] = []
  for (const k of Object.keys(e.compat.lines)) {
    if (k === line) continue
    const c = judgeLine(e, k).cell
    const route = findingRoute(c?.finding)
    if (!c || c.status !== 'broken' || c.moduleVersion !== v || !route || (own.length > 0 && !own.includes(route)))
      continue
    hits.push({ key: k, step: c.step, finding: c.finding as string })
  }
  const first = hits[0]
  if (!first || !v) return null
  const keys = ascending(hits.filter((h) => h.step === first.step).map((h) => h.key))
  const head = `${v} broke${first.step ? ` at ${first.step}` : ''} on ${listAnd(keys)}`
  if (own.length > 0) return `${head} for this reason.`
  return `${head}: ${first.finding.replace(/^(An|In|The|Two) /, (w) => w.toLowerCase())}`
}

/**
 * The route collision of a given app (round 16: plan_install for an app without the webhooks module named
 * ROUTE_COLLISION while its `conflicts` had none): the static check of the modules the app registers, in its words
 * (`which this app already has`), as plan_install.conflicts says it; the evidence of the other lines only when the
 * module it names is on in the app. Null otherwise.
 */
function appCollision(e: JudgedEntry, line: string, app: AppContext): string | null {
  if (!noVerdict(e, line)) return null
  const has = (id: string) => app.enabledModules.some((m) => m.id === id)
  const all = e.compat.collisions?.[line] ?? []
  if (all.length > 0)
    return collisionText(
      all.filter((c) => has(c.module)),
      'this app',
    )
  const evidence = collisionEvidence(e, line)
  const named = evidence ? /\bthe (?:built-in )?([a-z0-9_]+) module\b/.exec(evidence) : null
  return evidence && named && has(named[1] as string) ? evidence : null
}

/** The order of the strip (`0.8, 0.9, next`) for line keys: numbers first by value, `next` last. */
function ascending(keys: readonly string[]): string[] {
  const rank = (k: string): number[] => (/^\d+(\.\d+)*$/.test(k) ? k.split('.').map(Number) : [Infinity])
  return [...keys].sort((a, b) => {
    const x = rank(a)
    const y = rank(b)
    for (let i = 0; i < Math.max(x.length, y.length); i++)
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
    return 0
  })
}

/**
 * The warning of a line in one paragraph: the static check, then what the same version did on the other lines. The
 * strip, the install box, the card and `check_compat` (one note) print it.
 */
export function collisionNote(e: JudgedEntry, line: string | null): string | null {
  const parts = [collisionStatic(e, line), collisionEvidence(e, line)].filter((x): x is string => !!x)
  return parts.length > 0 ? parts.join(' ') : null
}

/** Package reference used in consent and install texts: npm name, or owner/repo for GitHub-only entries. */
export function packageRef(e: Pick<IndexEntry, 'npm' | 'locator'>): string {
  return e.npm ?? e.locator.replace(/^github:/, '')
}

/**
 * Status of the install version on a line: `recommended` is verified by definition (D46); else the status of
 * the install version (`installStatus`), or, on a bare IndexEntry, the last receipt of the line.
 */
export function effectiveStatus(
  e: Pick<IndexEntry, 'version' | 'compat'> & Pick<PolicyEntry, 'installStatus' | 'installableVersions' | '_meta'>,
  line: string,
): string {
  if (e.version.recommended[line]) return 'verified'
  if (e.installStatus !== undefined) return e.installStatus[line]?.status ?? 'untested'
  // a receipt of another version is no verdict on the install version (review r6)
  return judgeLine(e, line).cell?.status ?? 'untested'
}

/** A line of a package that publishes preview builds only (review r9): the words of the strip and the policy. */
export const PREVIEW_ONLY_TEXT = 'No stable release for this line yet. Only preview builds are published.'

function notVerifiedText(
  status: string,
  line: string,
  at: string | null = null,
  iso: IsolationOf | null = null,
  installs: string | null = null,
  step: string | null = null,
): string {
  // a night that judged nothing (round 5): calm, with its day, never the module's fault; one sentence (review r6)
  if (status === 'harness-red' || status === 'infra-error') return notJudgedText(line, status, at)
  // Yarn's age gate held back a dependency (round 13): not judged either, never a release of the module
  if (heldBack({ status, step })) return notJudgedText(line, 'quarantine', at)
  if (status === 'broken') return `Not verified on ${line}.`
  // no receipt from a new app (classic) yet: the empty preset's receipt is named as such, never the verdict (24 Oct)
  return untestedText(line, iso ? { ...iso, finding: null } : null, installs)
}

/**
 * Agent policy of an entry on a line (spec 6.5). `app` adds the SLOT rule. Reasons come from every rule that
 * hit, the decision from the first group (refuse > ask > allow). `ask` carries `consentText`.
 */
export function agentPolicy(e: PolicyEntry, line: string, app?: AppContext, opts: PolicyOptions = {}): Policy {
  const now = opts.now ?? new Date().toISOString()
  const reasons: Reason[] = []
  const add = (code: string, text: string) => {
    if (!reasons.some((r) => r.code === code && r.text === text)) reasons.push({ code, text: clip(text) })
  }
  const carried = e.agentPolicy?.[line]?.reasons ?? []

  // refuse
  if (e.status === 'hold' || e.status === 'delisted') {
    const prior = carried.find((r) => r.code === 'HOLD')?.text
    const why = e.statusReason ? ` ${e.statusReason}` : ''
    if (e.statusReason === undefined && prior) add('HOLD', prior)
    else add('HOLD', e.status === 'hold' ? `On hold:${why || ' see the card.'}` : `Delisted:${why || ' see the card.'}`)
  }
  if (e.advisories) {
    for (const a of e.advisories)
      if ((a.severity === 'high' || a.severity === 'critical') && a.fixedIn === null)
        add('ADVISORY', `Open ${a.severity} severity advisory ${a.id}.`)
  }
  const cell = e.compat.lines[line]
  const recommended = e.version.recommended[line] ?? null
  const target = lineVersion(e, line)
  // a new app of the line already registers the package (D10): informs, never asks; the line keeps its verdict, the
  // receipt of the version a new app ships there (decision of 24 Oct)
  const preset = presetOn(e, line)
  // the dictionary word, as on the page (review r6): `Broken at typecheck on 0.9 since 23 Oct.`
  const broken = (step: string | null, since: string | null, at: string | null = null, confirmed = true) =>
    add('BROKEN', brokenText(line, step, since, at, confirmed))
  // BROKEN is judged on the install version (spec 6.5): a newer release in the age gate does not hide a
  // confirmed broken of the version a fresh app would install
  if (e.installStatus !== undefined) {
    const s = e.installStatus[line]
    if (s?.status === 'broken') broken(s.step, s.since, s.at ?? null, s.confirmed ?? true)
  } else if (!carried.some((r) => r.code === 'BROKEN')) {
    if (cell?.status === 'broken' && (cell.moduleVersion === null || cell.moduleVersion === target))
      broken(cell.step, cell.since)
  }
  // QUARANTINE only when nothing stable is installable today: an older stable release past the gate is the
  // install version instead (spec 4.6, 6.5)
  if (!preset && recommended === null && !installableOn(e, line)) {
    const until = e.version.installableFrom
    // a run the gate stopped on a dependency (heldBack) is not the module's release in the gate (round 13)
    const gated =
      cell?.status === 'quarantine' && !heldBack(cell) && (cell.moduleVersion === null || cell.moduleVersion === target)
    if (gated || (until !== null && now.slice(0, 10) < until)) {
      if (until) add('QUARANTINE', `Installs from ${shortDate(until)} (Yarn ${AGE_GATE_DAYS}-day age gate).`)
      else add('QUARANTINE', `New release in the Yarn ${AGE_GATE_DAYS}-day age gate.`)
    }
  }
  if (e.installable === false && e.kind === 'module')
    add('NOT_INSTALLABLE', 'Package has no src/modules and dist/modules pair.')
  if (e.identity.source === 'github' && !e.version.gitRef) add('UNPINNED_GIT', 'GitHub source without a pinned tag.')
  for (const code of CARRIED) {
    if (code === 'ADVISORY' && e.advisories) continue
    if (code === 'NOT_INSTALLABLE' && e.installable !== undefined) continue
    if (code === 'BROKEN' && e.installStatus !== undefined) continue
    for (const r of carried) if (r.code === code) add(r.code, r.text)
  }

  // ask
  if (e.type !== 'official') add('THIRD_PARTY', "Third-party code runs with access to all tenants' data.")
  const status = effectiveStatus(e, line)
  if (preset) add('IN_PRESET', presetInstallText(e.moduleIds))
  if (status !== 'verified' && !reasons.some((r) => r.code === 'BROKEN')) {
    const prior = e.installStatus === undefined ? carried.find((r) => r.code === 'NOT_VERIFIED')?.text : undefined
    const at = e.installStatus?.[line]?.at ?? e.compat.lines[line]?.at ?? null
    const step = e.installStatus?.[line]?.step ?? e.compat.lines[line]?.step ?? null
    // the line's only receipt is for another version: the same sentence as the page and the card (review r6)
    const j = status === 'untested' ? judgeLine(e, line) : null
    const other = j?.other && j.installs ? otherVersionText(line, j.installs, j.other) : null
    // a package with preview builds only (tpay): the strip's sentence, not a queue that never comes (review r9)
    // on the lines the nightly run skips for it (0.8 and 0.9; next installs the preview build and gets a receipt)
    const previewOnly = e.version.latest === null && e.version.preview !== null && e.signals.receipt[line] === 'skipped'
    const iso = e.compat.isolation?.[line] ?? null
    add(
      'NOT_VERIFIED',
      other ?? (previewOnly ? PREVIEW_ONLY_TEXT : (prior ?? notVerifiedText(status, line, at, iso, target, step))),
    )
    // why the signal in isolation broke, in a reason of its own, when its finding explains it (review of 24 Oct: the
    // reason above has room for the state only, so an agent read `broken at smoke` without the workflows.view cause);
    // a bare error line (`typecheck failed: TS2307 ...`) stays in the receipt; never a reason to refuse
    if (
      !other &&
      !previewOnly &&
      status === 'untested' &&
      iso?.status === 'broken' &&
      iso.finding &&
      !/^[a-z]+ failed\b/i.test(iso.finding)
    )
      add('NOT_VERIFIED', isolationFindingReason(iso, target))
    // a backend route a new app already has (round 14): the static check, else what the same version did on the
    // other lines; asks with a reason, never refuses (NOT_VERIFIED asks already, so the decision is the same)
    // an app without enabledModules is a new app of the line, as plan_install reads it
    const collide =
      app && app.enabledModules.length > 0
        ? appCollision(e, line, app)
        : (collisionStatic(e, line) ?? collisionEvidence(e, line))
    if (collide) add('ROUTE_COLLISION', collide)
  }
  if (e.license.kind !== 'osi') {
    const prior = carried.find((r) => r.code === 'LICENSE')?.text
    if (e.licenseValue === undefined && prior) add('LICENSE', prior)
    else {
      const raw = e.license.spdx ?? e.licenseValue ?? null
      const spdx = raw && raw !== e.license.kind ? ` (${raw})` : ''
      add('LICENSE', `License: ${e.license.kind}${spdx}.`)
    }
  }
  for (const r of e.replaces) {
    const id = r.replace(/^core:/, '')
    add('REPLACES', `Replaces core ${id}. Remove the core registration first.`)
  }
  if (app) {
    for (const id of e.moduleIds) {
      const other = app.enabledModules.find((m) => m.id === id && m.from !== e.npm)
      if (other) add('SLOT', `Competes for slot ${id} with ${other.from}.`)
    }
  }
  if (e.signals.supplyChain.status !== 'ok')
    add('SUPPLY_CHAIN', e.signals.supplyChain.reasons[0] ?? `Supply chain: ${e.signals.supplyChain.status}.`)

  const refuse = reasons.some((r) => REFUSE_CODES.has(r.code))
  if (refuse) {
    const out: Policy = { decision: 'refuse', reasons: ordered(reasons).slice(0, 10) }
    if (reasons.some((r) => r.code === 'QUARANTINE') && e.version.installableFrom) out.until = e.version.installableFrom
    return out
  }
  // IN_PRESET informs, it never asks: an official package verified in a new app that already registers it is allowed
  if (reasons.some((r) => r.code !== 'IN_PRESET')) {
    const out: Policy = { decision: 'ask', reasons: ordered(reasons).slice(0, 10) }
    const v = target
    // nothing to install in a new app that registers it: no `Install ...` to type next to `Nothing to install`
    if (v && !preset) out.consentText = clip(`Install ${packageRef(e)}@${v}`)
    return out
  }
  return {
    decision: 'allow',
    reasons: ordered([{ code: 'OFFICIAL_VERIFIED', text: `Official, verified on ${line}.` }, ...reasons]).slice(0, 10),
  }
}

/** Reasons in the order of the rule table. */
function ordered(reasons: Reason[]): Reason[] {
  const rank = (c: string) => {
    const i = (POLICY_CODES as readonly string[]).indexOf(c)
    return i < 0 ? POLICY_CODES.length : i
  }
  return reasons
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r.code) - rank(b.r.code) || a.i - b.i)
    .map((x) => x.r)
}

/**
 * Built-in modules (spec 6.5): `allow` when the line is the app's core line. A built-in of another core
 * version is `ask`, because enabling it does not change the installed core.
 */
export function builtInPolicy(coreLine: string, appLine: string | null): Policy {
  if (appLine === null || appLine === coreLine)
    return { decision: 'allow', reasons: [{ code: 'BUILT_IN', text: 'Ships with Open Mercato core.' }] }
  return {
    decision: 'ask',
    reasons: [
      {
        code: 'BUILT_IN_LINE',
        text: `Built-in facts come from core ${coreLine}. Check that this app's core has the module before enabling it.`,
      },
    ],
  }
}

const RANK = { allow: 0, ask: 1, refuse: 2 } as const

/** Strictest decision of several policies; reasons merged (deduplicated, max 10), consent texts joined. */
export function strictestPolicy(policies: readonly Policy[]): Policy {
  if (policies.length === 0) return { decision: 'allow', reasons: [] }
  const decision = policies.reduce<Policy['decision']>((d, p) => (RANK[p.decision] > RANK[d] ? p.decision : d), 'allow')
  const reasons: Reason[] = []
  for (const p of policies)
    if (p.decision === decision)
      for (const r of p.reasons) if (!reasons.some((x) => x.code === r.code && x.text === r.text)) reasons.push(r)
  const out: Policy = { decision, reasons: ordered(reasons).slice(0, 10) }
  if (decision === 'ask') {
    const parts = policies.flatMap((p) => (p.decision === 'ask' && p.consentText ? [p.consentText] : []))
    if (parts.length > 0) {
      const text = `Install ${parts.map((t) => t.replace(/^Install /, '')).join(', ')}`
      if (text.length <= 160) out.consentText = text
    }
  }
  const until = policies.map((p) => p.until).filter((u): u is string => !!u)
  if (until.length > 0) out.until = until.sort().at(-1) as string
  return out
}
