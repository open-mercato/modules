// Release lines, the Yarn age gate, receipts per line and `version.recommended` (spec 4.4, 4.6, 5.3, 8.2, D46).
// Isomorphic: no Node APIs.
import type { CellStatus } from '../schema/common.ts'
import type { Receipt } from '../schema/data/receipt.ts'
import type { CellSummary } from '../schema/published/modules.ts'
import { compareVersions, isPrerelease, isStable, isVersion, maxVersion } from './semver.ts'

/** Yarn age gate of a fresh Open Mercato app (`npmMinimalAgeGate` in the app template), in days. */
export const AGE_GATE_DAYS = 5
/** VER-1: a verified receipt older than this does not count. */
export const VERIFIED_MAX_AGE_DAYS = 14
const DAY_MS = 86_400_000

/** The part of a line the core needs: `data/lines.json` lines and `ModulesIndex.lines` both fit. */
export interface LineInfo {
  key: string
  version: string
  source: 'latest' | 'previous' | 'develop'
  /** npmPreapprovedPackages of the line's app template (data/lines.json); absent = none. */
  preapproved?: readonly string[]
}

export function latestLine<L extends LineInfo>(lines: readonly L[]): L | null {
  return lines.find((l) => l.source === 'latest') ?? null
}

export function lineByKey<L extends LineInfo>(lines: readonly L[], key: string | null | undefined): L | null {
  if (key === null || key === undefined) return null
  return lines.find((l) => l.key === key) ?? null
}

/** Display order: latest first, then previous, then next. */
export function orderedLines<L extends LineInfo>(lines: readonly L[]): L[] {
  const rank = { latest: 0, previous: 1, develop: 2 } as const
  return [...lines].sort((a, b) => rank[a.source] - rank[b.source] || compareVersions(b.version, a.version))
}

/**
 * Reading order of the pages and the cards: previous, latest, next (`0.8, 0.9 and next`, review r8: the prompt and the
 * card listed `0.9, 0.8, next` while the strip, /compat and the sentences read `0.8, 0.9 and next`).
 */
export function ascendingLines<L extends LineInfo>(lines: readonly L[]): L[] {
  const rank = { previous: 0, latest: 1, develop: 2 } as const
  return [...lines].sort((a, b) => rank[a.source] - rank[b.source] || compareVersions(a.version, b.version))
}

/** Line keys in reading order (`ascendingLines`); keys not among `lines` keep their place at the end. */
export function ascendingKeys(keys: readonly string[], lines: readonly LineInfo[]): string[] {
  const order = ascendingLines(lines).map((l) => l.key)
  const at = (k: string): number => (order.includes(k) ? order.indexOf(k) : order.length)
  return [...keys].sort((a, b) => at(a) - at(b))
}

/** Sort compare of line keys in reading order without the line list: numeric keys ascending, `next` last. */
export function byLineKey(a: string, b: string): number {
  const num = (k: string): number[] | null => (/^\d+\.\d+$/.test(k) ? k.split('.').map(Number) : null)
  const x = num(a)
  const y = num(b)
  if (x && y) return x[0]! - y[0]! || x[1]! - y[1]!
  if (x) return -1
  if (y) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

export interface ResolvedLine {
  /** Line key, or null when the version is outside the tested lines. */
  line: string | null
  /** Exact Open Mercato version of that line. */
  version: string | null
  /** Human note when the line is null. */
  note: string | null
}

/**
 * Open Mercato version (exact, `major.minor`, a line key, or a develop prerelease) to a line key (spec 8.2).
 * No version: the latest line.
 */
export function resolveLine(omVersion: string | null | undefined, lines: readonly LineInfo[]): ResolvedLine {
  const found = (l: LineInfo | null): ResolvedLine =>
    l ? { line: l.key, version: l.version, note: null } : { line: null, version: null, note: null }
  const raw = (omVersion ?? '').trim()
  if (raw === '') return found(latestLine(lines))
  const byKey = lineByKey(lines, raw)
  if (byKey) return found(byKey)
  const v = raw.replace(/^(?:v|=|\^|~|>=)\s*/, '')
  const exact = lines.find((l) => l.version === v)
  if (exact) return found(exact)
  if (isVersion(v) && isPrerelease(v) && /(^|[.-])develop([.-]|$)/.test(v.split('-').slice(1).join('-'))) {
    const next = lines.find((l) => l.source === 'develop')
    if (next) return found(next)
  }
  const mm = /^(\d+)\.(\d+)(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?$/.exec(v)
  if (!mm) return { line: null, version: null, note: 'Unknown Open Mercato version.' }
  const key = `${Number(mm[1])}.${Number(mm[2])}`
  const l = lines.find((x) => x.key === key)
  if (l) return found(l)
  return { line: null, version: null, note: `Line ${key} is not tested by the catalog.` }
}

/** A module of a starter preset: an `{ id, from }` entry of src/modules.ts. */
export interface PresetModule {
  id: string
  from: string
}

/**
 * Starter presets of create-mercato-app (decision of 24 Oct). `classic` is what `npx create-mercato-app` makes without
 * `--preset` (`DEFAULT_PRESET_ID` in 0.8.0, 0.9.0 and develop, packages/create-app/src/lib/starter-presets.ts): every
 * sentence that says `a new app` means an app from it, and its receipts give the main verdict (the square, /compat,
 * the Verified seal, the agent policy, the badge, check_compat and plan_install). `empty` registers twelve modules;
 * its receipts are the signal `in isolation` (the module works without the rest of the platform), always named as
 * such and never the main verdict.
 */
export type PresetId = 'classic' | 'empty'
export const MAIN_PRESET: PresetId = 'classic'
export const ISOLATION_PRESET: PresetId = 'empty'
/** Main first: plans and pages list classic before empty. */
export const PRESET_IDS: readonly PresetId[] = ['classic', 'empty']

/** The preset of a receipt (`om.preset`); a receipt without the field scaffolded the empty preset. */
export function receiptPreset(r: { om: { preset?: string | null } }): PresetId {
  return r.om.preset === 'classic' ? 'classic' : 'empty'
}

/** Receipts of the main verdict (classic). */
export function mainReceipts<R extends { om: { preset?: string | null } }>(receipts: readonly R[]): R[] {
  return receipts.filter((r) => receiptPreset(r) === MAIN_PRESET)
}

/** Receipts of the signal `in isolation` (empty). */
export function isolationReceipts<R extends { om: { preset?: string | null } }>(receipts: readonly R[]): R[] {
  return receipts.filter((r) => receiptPreset(r) === ISOLATION_PRESET)
}

/** The classic preset of a line as lines.json may carry it (`defaultPreset`, written by `watch` from the template). */
export interface DefaultPreset {
  id: string
  modules: readonly PresetModule[]
}

/**
 * `data/presets.json` as the core reads it, the one source of the preset lists: per line the modules a new app (classic)
 * registers and the modules an app from the empty preset registers, both read from src/modules.ts of the line's
 * baselines (`collect`), else from the fallbacks below (`presetsOrFallback`). `classic` null or absent: not known.
 */
export type PresetMap = Readonly<
  Record<string, { empty?: readonly PresetModule[]; classic?: readonly PresetModule[] | null } | undefined>
>

/** The modules a preset of a line registers, or null when the catalog does not know them. */
export function presetModules(
  presets: PresetMap | null | undefined,
  line: string | null | undefined,
  preset: PresetId,
): readonly PresetModule[] | null {
  if (!line) return null
  const p = presets?.[line]
  return (preset === 'classic' ? p?.classic : p?.empty) ?? null
}

/**
 * Whether a preset of a line registers a package in src/modules.ts: every module ID of it from that package, or, with no
 * IDs read yet, any module from that package. False when the preset is not known.
 */
export function registeredIn(
  presets: PresetMap | null | undefined,
  line: string | null | undefined,
  preset: PresetId,
  from: string | null | undefined,
  ids: readonly string[] = [],
): boolean {
  const list = presetModules(presets, line, preset)
  if (!list || !from) return false
  return ids.length > 0
    ? ids.every((id) => list.some((m) => m.id === id && m.from === from))
    : list.some((m) => m.from === from)
}

/**
 * Lines (in the order of `lines`) whose new app, from the classic preset, already registers the package
 * (`compat.inPresets`): nothing to install there, and its receipts there test the version the app ships.
 */
export function newAppLines(
  presets: PresetMap | null | undefined,
  lines: readonly LineInfo[],
  from: string | null | undefined,
  ids: readonly string[] = [],
): string[] {
  return lines.filter((l) => registeredIn(presets, l.key, MAIN_PRESET, from, ids)).map((l) => l.key)
}

/** How often the cells of a line run (harness/lines.yml `cadence`, modules.json `lines[].cadence`). */
export type Cadence = 'nightly' | 'weekly'

/**
 * Whether the cells of a new app for the packages it already registers run on the weekly night only on a line (review
 * of 24 Oct): a new app on a line built from develop ships a new snapshot of them most nights, so no memo ever holds
 * such a cell, and a regular night tests the baseline and the packages outside the preset there. The nightly plan
 * (lib/receipts/plan.ts) skips by it, and every queue sentence of the site reads `cellCadence`, so the page never
 * promises a night the plan does not run.
 */
export function presetCellsWeekly(line: Pick<LineInfo, 'source'>): boolean {
  return line.source === 'develop'
}

/**
 * The cadence of one cell of a new app: the line's own, or weekly for a package a new app already registers on a line
 * where `presetCellsWeekly` holds. `inPreset`: the line is in the entry's `compat.inPresets`.
 */
export function cellCadence(line: Pick<LineInfo, 'source'> & { cadence: string }, inPreset: boolean): Cadence {
  return line.cadence === 'weekly' || (inPreset && presetCellsWeekly(line)) ? 'weekly' : 'nightly'
}

/** The id of the default preset of create-mercato-app the sentences name. */
export const DEFAULT_PRESET_ID = 'classic'

/**
 * The version of a package from the classic preset that a new app ships (review r10): create-mercato-app pins every
 * @open-mercato package of its template to its own version (`"@open-mercato/events": "{{PACKAGE_VERSION}}"`,
 * packages/create-app/template/package.json), so an app of Open Mercato 0.8.0 ships events 0.8.0. The nightly plan
 * tests that version in an app from the classic preset (`yarn add` of it, the note in-preset).
 */
export const shippedVersion = (omVersion: string): string => omVersion

/**
 * Packages outside @open-mercato/core that the `empty` preset of create-mercato-app registers in src/modules.ts, read
 * from the scaffolds of 0.8.0, 0.9.0 and 0.10.1-develop.7583 (the baselines of 23 Oct, test/fixtures/data/presets.json;
 * test/core/preset.test.ts keeps the two in step). Day 0 (review r9): before the first night writes data/presets.json,
 * the catalog still knows that an app from the empty preset has events and search. The first collected baseline
 * replaces this list for its line.
 */
export const NEW_APP_PACKAGES: readonly { id: string; from: string }[] = [
  { id: 'events', from: '@open-mercato/events' },
  { id: 'search', from: '@open-mercato/search' },
]

/**
 * The `enabledModules` array of template/src/modules.ts of create-mercato-app 0.9.0 and of the develop snapshot
 * 0.10.1-develop.7583 (the classic preset keeps it as it is), read on 23 Oct 2026: core module IDs first, then
 * `id:package` for the modules outside @open-mercato/core (`@open-mercato/<package>`). Entries in comments, the `@app`
 * probe and the modules pushed in `if (env)` blocks are not in a new app. 0.8.0 has the same list without telemetry.
 * Day 0 (review r11): before the first classic baseline writes `classic` into data/presets.json, the catalog still
 * knows that a new app enables currencies and checkout. test/core/review-r11.test.ts keeps it in step with the
 * template parser.
 */
const CLASSIC_CORE =
  'dashboards auth directory customers perspectives entities configs query_index audit_logs attachments catalog sales warranty_claims wms api_keys devices dictionaries api_docs business_rules feature_toggles workflows currencies planner resources staff notifications progress integrations data_sync sync_excel messages communication_channels push_notifications phone_calls translations inbox_ops payment_gateways shipping_carriers eudr customer_accounts portal'
const CLASSIC_PACKAGES =
  'content:content onboarding:onboarding search:search events:events ai_assistant:ai-assistant scheduler:scheduler checkout:checkout documents:documents gateway_stripe:gateway-stripe channel_resend:channel-resend channel_ses:channel-ses channel_imap:channel-imap channel_gmail:channel-gmail channel_apns:channel-apns channel_expo:channel-expo channel_fcm:channel-fcm sync_akeneo:sync-akeneo tillio:tillio webhooks:webhooks telemetry:telemetry'

function classicModules(without: readonly string[] = []): PresetModule[] {
  const core = CLASSIC_CORE.split(' ').map((id) => ({ id, from: '@open-mercato/core' }))
  const pkgs = CLASSIC_PACKAGES.split(' ').map((p) => {
    const [id, pkg] = p.split(':') as [string, string]
    return { id, from: `@open-mercato/${pkg}` }
  })
  return [...core, ...pkgs].filter((m) => !without.includes(m.id))
}

/**
 * `EMPTY_MODULES` of starter-presets.ts in create-mercato-app 0.8.0 and 0.9.0 (develop 0.10.1-develop.7583 adds
 * api_keys, OM #7473), the lists the baselines of 23 Oct wrote into data/presets.json.
 */
function emptyModules(extra: readonly string[] = []): PresetModule[] {
  const core = (ids: string) => ids.split(' ').map((id) => ({ id, from: '@open-mercato/core' }))
  return [
    ...core('auth directory configs entities query_index api_docs audit_logs notifications dashboards'),
    ...NEW_APP_PACKAGES.map((m) => ({ ...m })),
    ...core(['attachments', ...extra].join(' ')),
  ]
}

/** The empty preset of the create-mercato-app versions the catalog read by hand (day 0), by exact version. */
export const EMPTY_PRESET_FALLBACK: Readonly<Record<string, readonly PresetModule[]>> = {
  '0.8.0': emptyModules(),
  '0.9.0': emptyModules(),
  '0.10.1-develop.7583.1.0c886d0a14': emptyModules(['api_keys']),
}

/** The classic preset of the create-mercato-app versions the catalog read by hand (day 0), by exact version. */
export const CLASSIC_PRESET_FALLBACK: Readonly<Record<string, readonly PresetModule[]>> = {
  '0.8.0': classicModules(['telemetry']),
  '0.9.0': classicModules(),
  '0.10.1-develop.7583.1.0c886d0a14': classicModules(),
}

type PresetsEntry = {
  omVersion: string
  empty?: readonly PresetModule[]
  classic?: readonly PresetModule[]
  at: string
}
type FilledEntry = { omVersion: string; empty: PresetModule[]; classic?: PresetModule[]; at: string }

/**
 * data/presets.json with every line filled, the one place the preset lists come from (decision of 24 Oct). Per line and
 * preset: the list a baseline of that preset wrote (`collect`); else, for classic, lines.json `defaultPreset` when it
 * is `classic` (`watch` reads the template), else the list read by hand for that exact version (day 0); for empty,
 * the list read by hand, else `NEW_APP_PACKAGES`, whose core modules stay unknown. A line added since the last night
 * with a version nobody read keeps `classic` unknown until its baseline or `watch` runs.
 */
export function presetsOrFallback(
  presets: Readonly<Record<string, PresetsEntry>> | null | undefined,
  lines: readonly (LineInfo & { defaultPreset?: DefaultPreset | null })[],
  at: string,
): Record<string, FilledEntry> {
  const out: Record<string, FilledEntry> = {}
  for (const [k, v] of Object.entries(presets ?? {})) {
    const empty = v.empty ?? EMPTY_PRESET_FALLBACK[v.omVersion] ?? NEW_APP_PACKAGES
    out[k] = {
      omVersion: v.omVersion,
      empty: empty.map((m) => ({ ...m })),
      ...(v.classic ? { classic: v.classic.map((m) => ({ ...m })) } : {}),
      at: v.at,
    }
  }
  for (const l of lines) {
    if (!out[l.key]) {
      const empty = EMPTY_PRESET_FALLBACK[l.version] ?? NEW_APP_PACKAGES
      out[l.key] = { omVersion: l.version, empty: empty.map((m) => ({ ...m })), at }
    }
    if (!out[l.key]!.classic) {
      const d = l.defaultPreset?.id === 'classic' ? l.defaultPreset.modules : CLASSIC_PRESET_FALLBACK[l.version]
      if (d) out[l.key] = { ...out[l.key]!, classic: d.map((m) => ({ ...m })) }
    }
  }
  return out
}

/**
 * A tool tagged `cli` runs with npx (`packageCommand` in plan.ts), outside the app, so the age gate of a new app
 * (Yarn's `npmMinimalAgeGate` in its .yarnrc.yml) never applies to it (finding of 25 Oct: the agent refused
 * mercato-readiness-scanner until 27 Oct over a gate npx does not have).
 */
export function runsWithNpx(e: { kind?: string | null; tags?: readonly string[] | null }): boolean {
  return e.kind === 'tool' && !!e.tags?.includes('cli')
}

/** Yarn `npmPreapprovedPackages` match: exact name or a pattern ending in `*`. */
export function isPreapproved(name: string | null | undefined, patterns: readonly string[] | undefined): boolean {
  if (!name || !patterns) return false
  return patterns.some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : name === p))
}

/** Moment a version passes the age gate (ISO date-time), or the publish time when preapproved. */
export function installableAt(publishedAt: string | null | undefined, preapproved: boolean): string | null {
  if (!publishedAt) return null
  const t = Date.parse(publishedAt)
  if (Number.isNaN(t)) return null
  return new Date(preapproved ? t : t + AGE_GATE_DAYS * DAY_MS).toISOString()
}

/** `Installable from` date (IsoDate) of a version. */
export function installableFrom(publishedAt: string | null | undefined, preapproved: boolean): string | null {
  return installableAt(publishedAt, preapproved)?.slice(0, 10) ?? null
}

/** True when a fresh app can install the version at `now` (unknown publish time counts as installable). */
export function isInstallable(publishedAt: string | null | undefined, preapproved: boolean, now: string): boolean {
  const at = installableAt(publishedAt, preapproved)
  return at === null || Date.parse(now) >= Date.parse(at)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS
}

// ---------------------------------------------------------------------------------------------------------
// Receipts

/** Receipts in collection order: run time, then file order (the jsonl files are append-only). */
export function sortReceipts(receipts: readonly Receipt[]): Receipt[] {
  return receipts
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Date.parse(a.r.run.at) - Date.parse(b.r.run.at) || a.i - b.i)
    .map((x) => x.r)
}

/** A baseline links to a module receipt of the same night: both runs started within this many hours. */
export const NIGHT_WINDOW_HOURS = 12

/**
 * Module receipts with `baseline: null` linked to the baseline of the same night (same line, Open Mercato version,
 * preset and runner, runs at most NIGHT_WINDOW_HOURS apart, nearest first). One night can arrive as several runs
 * (a preview host splits the lines), and `collect` links only the baselines already in the checkout, so a module
 * run collected before its baseline run kept `null` and VER-1 failed on a green night (review r3). health, emit and
 * the site read receipts through this function, so they agree. Receipts that already carry a baseline are kept.
 */
export function linkNightBaselines<R extends Receipt>(receipts: readonly R[], baselines: readonly Receipt[]): R[] {
  const window = NIGHT_WINDOW_HOURS * 3_600_000
  return receipts.map((r) => {
    if (r.baseline !== null || r.module === null) return r
    const at = Date.parse(r.run.at)
    let best: Receipt | null = null
    let bestGap = Infinity
    for (const b of baselines) {
      if (b.module !== null || b.om.line !== r.om.line || b.om.version !== r.om.version) continue
      if (b.harness.runner !== r.harness.runner || receiptPreset(b) !== receiptPreset(r)) continue
      const gap = Math.abs(Date.parse(b.run.at) - at)
      if (gap <= window && gap < bestGap) {
        best = b
        bestGap = gap
      }
    }
    return best
      ? {
          ...r,
          baseline: {
            status: best.result.status,
            receipt: best.id,
            ...(best.result.culprits?.length ? { culprits: best.result.culprits } : {}),
          },
        }
      : r
  })
}

const NOT_JUDGED: readonly CellStatus[] = ['harness-red', 'infra-error', 'quarantine', 'untested', 'skipped']

/**
 * Receipt that decides a version's status on a line: the last realistic receipt that judged the module
 * (verified, or a confirmed broken). harness-red, infra-error and quarantine never take Verified away,
 * an unconfirmed broken waits for its retry (spec 5.3, 6.3).
 */
export function decisiveReceipt(
  receipts: readonly Receipt[],
  line: string,
  version: string | null | undefined,
): Receipt | null {
  let out: Receipt | null = null
  for (const r of sortReceipts(receipts)) {
    if (r.om.line !== line || r.harness.mode !== 'realistic') continue
    if (version != null && r.module?.version !== version) continue
    const s = r.result.status
    if (NOT_JUDGED.includes(s)) continue
    if (s === 'broken' && !r.transition.confirmed) continue
    out = r
  }
  return out
}

/** Status of one module version on a line (`agentPolicy` BROKEN and NOT_VERIFIED, `signals.receipt`). */
export interface VersionStatus {
  version: string
  status: CellStatus
  step: string | null
  /** First day of the run of receipts with this status for this version (IsoDate). */
  since: string
  receipt: string
  /** Day of the deciding receipt (IsoDate). */
  at: string
  /** A break a second night confirmed (any receipt of the run has `transition.confirmed`); true for other states. */
  confirmed: boolean
}

/**
 * Status of a version on a line from its realistic receipts: the last receipt when it judged the module
 * (verified or broken, also an unconfirmed broken, as `compat.lines[line]` shows it), else the decisive
 * receipt, so harness-red, infra-error or a quarantine entry after a confirmed broken keep it broken
 * (spec 5.3, 6.5). Null when the version has no realistic receipt on the line.
 */
export function versionStatus(
  receipts: readonly Receipt[],
  line: string,
  version: string | null | undefined,
): VersionStatus | null {
  if (version == null) return null
  const list = sortReceipts(receipts).filter(
    (r) => r.om.line === line && r.harness.mode === 'realistic' && r.module?.version === version,
  )
  const last = list.at(-1)
  if (!last) return null
  const judged = (r: Receipt) => r.result.status === 'verified' || r.result.status === 'broken'
  const pick = judged(last) ? last : (decisiveReceipt(list, line, version) ?? last)
  let since = pick.run.at
  let confirmed = pick.result.status !== 'broken' || pick.transition.confirmed
  for (let i = list.indexOf(pick) - 1; i >= 0; i--) {
    const r = list[i] as Receipt
    if (r.result.status === pick.result.status) {
      since = r.run.at
      if (r.transition.confirmed) confirmed = true
    } else if (judged(r)) break
  }
  return {
    version,
    status: pick.result.status,
    step: pick.result.failedStep,
    since: since.slice(0, 10),
    receipt: pick.id,
    at: pick.run.at.slice(0, 10),
    confirmed,
  }
}

/** Last realistic receipt on a line (any status, any version), or null. */
export function lastReceipt(receipts: readonly Receipt[], line: string): Receipt | null {
  const list = sortReceipts(receipts).filter((r) => r.om.line === line && r.harness.mode === 'realistic')
  return list.at(-1) ?? null
}

/** Pre-check (early mode, preapproved for the run) of a version on a line. */
export function precheck(receipts: readonly Receipt[], line: string, version: string | null): 'pass' | 'fail' | null {
  const early = sortReceipts(receipts).filter(
    (r) => r.om.line === line && r.harness.mode === 'early' && (version === null || r.module?.version === version),
  )
  const last = early.at(-1)
  if (!last) return null
  return last.result.status === 'verified' ? 'pass' : 'fail'
}

/** Summary of the last receipt on a line (`IndexEntry.compat.lines[line]`, `/compat`). */
export function cellSummary(receipts: readonly Receipt[], line: string): CellSummary | null {
  const sorted = sortReceipts(receipts).filter((r) => r.om.line === line && r.harness.mode === 'realistic')
  const last = sorted.at(-1)
  if (!last) return null
  let since = last.run.at
  for (let i = sorted.length - 2; i >= 0; i--) {
    const r = sorted[i] as Receipt
    if (r.result.status !== last.result.status || r.module?.version !== last.module?.version) break
    since = r.run.at
  }
  const version = last.module?.version ?? null
  return {
    status: last.result.status,
    step: last.result.failedStep,
    omVersion: last.om.version,
    moduleVersion: version,
    at: last.run.at,
    receipt: last.id,
    since: since.slice(0, 10),
    precheck: precheck(receipts, line, version),
    patches: last.harness.patches.map((p) => p.id),
  }
}

/**
 * States of a receipt that judged (or tried to judge) one module version. Quarantine is about a newer release by
 * definition, and untested or skipped cells carry no verdict, so they are never re-read as another version's.
 */
export const VERDICT_STATES: ReadonlySet<CellStatus> = new Set<CellStatus>([
  'verified',
  'broken',
  'harness-red',
  'infra-error',
])

/**
 * `compat.lines`: one summary per line that has a receipt. With `installs` (the version a fresh app installs per
 * line, `installVersion`), a line whose last receipt judged another version takes the last receipt of its install
 * version instead (spec 6.5, review r7: webhooks 0.8.0 verified at 14:47 on 0.8, then 0.9.0 broken there at 15:39;
 * the line's verdict is 0.8.0's). A line without a receipt for its install version keeps its last receipt, which
 * readers show as another version's (`judgeLine`), never as the line's verdict.
 */
export function cellSummaries(
  receipts: readonly Receipt[],
  lines: readonly LineInfo[],
  installs?: Readonly<Record<string, string | null | undefined>>,
): Record<string, CellSummary> {
  const out: Record<string, CellSummary> = {}
  for (const l of lines) {
    const c = cellSummary(receipts, l.key)
    if (!c) continue
    const v = installs?.[l.key] ?? null
    if (v !== null && c.moduleVersion !== null && c.moduleVersion !== v && VERDICT_STATES.has(c.status)) {
      const own = cellSummary(
        receipts.filter((r) => r.module?.version === v),
        l.key,
      )
      if (own) {
        out[l.key] = own
        continue
      }
    }
    out[l.key] = c
  }
  return out
}

/** A newer break of another version on a line (`IndexEntry.compat.newerBreaks`, review r8). */
export interface NewerBreak {
  moduleVersion: string
  step: Receipt['result']['failedStep']
  at: string
  receipt: string
}

/**
 * The line's last receipt when it is a break of another, newer-run version than the one its cell judged (review r7:
 * webhooks 0.8.0 verified on 0.8 at 14:47, then 0.9.0 broke there at 15:39). The module page, the card and
 * `check_compat` say it with `pinnedText`; null when the last receipt is the cell's own or no break.
 */
export function newerBreak(
  cell: Pick<CellSummary, 'moduleVersion' | 'at'> | null | undefined,
  last: Pick<Receipt, 'id' | 'module' | 'result' | 'run'> | null | undefined,
): NewerBreak | null {
  if (!cell?.moduleVersion || !last?.module) return null
  const v = last.module.version
  if (v === cell.moduleVersion || last.result.status !== 'broken') return null
  if (cell.at && Date.parse(last.run.at) <= Date.parse(cell.at)) return null
  return { moduleVersion: v, step: last.result.failedStep, at: last.run.at, receipt: last.id }
}

export interface RecommendedInput {
  lines: readonly LineInfo[]
  receipts: readonly Receipt[]
  /** npm name (age gate preapproval); null for GitHub-only entries. */
  npm: string | null
  /** Publish times of versions (SyncRecord.npm.publishedAt). */
  publishedAt: Readonly<Record<string, string>>
  now: string
}

/**
 * `version.recommended[line]` (D46): highest stable version past the age gate whose decisive realistic receipt
 * on the line is verified. Null when there is none.
 */
export function recommendedVersions(input: RecommendedInput): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const l of input.lines) {
    const pre = isPreapproved(input.npm, l.preapproved)
    const versions = new Set<string>()
    for (const r of input.receipts) if (r.om.line === l.key && r.module) versions.add(r.module.version)
    const ok = [...versions].filter(
      (v) =>
        isStable(v) &&
        isInstallable(input.publishedAt[v], pre, input.now) &&
        decisiveReceipt(input.receipts, l.key, v)?.result.status === 'verified',
    )
    out[l.key] = maxVersion(ok)
  }
  return out
}

/** The part of an index entry the verdict count reads (`IndexEntry`, `RegistryEntry` and test rows all fit). */
export interface VerdictRow {
  listed: boolean
  compat: { lines: Readonly<Record<string, { status: CellStatus } | undefined>> }
}

/**
 * Verdicts of the listed entries on one line, from their cell summaries: the run panel on / and the `Receipts on
 * next` tile of /radar count the same rows, so the two pages never disagree (review r3).
 */
export function lineVerdicts(rows: readonly VerdictRow[], key: string): Record<CellStatus, number> {
  const out = {
    verified: 0,
    broken: 0,
    quarantine: 0,
    'harness-red': 0,
    'infra-error': 0,
    untested: 0,
    skipped: 0,
  } as Record<CellStatus, number>
  for (const r of rows) {
    if (!r.listed) continue
    const st = r.compat.lines[key]?.status
    if (st) out[st] += 1
  }
  return out
}
