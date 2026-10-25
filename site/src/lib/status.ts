// Cell states of the signal strip (spec 6.7) and the sentences built from them. Isomorphic.
import type { CellStatus, CellSummary, IndexEntry, Line } from '../../../lib/schema/index.ts'
import {
  brokenText,
  heldBack,
  isolationText,
  lineVersion,
  notJudgedText,
  notTestedText,
  QUARANTINE_TEXT,
  QUARANTINE_WHY,
  otherVersionShort,
  otherVersionText,
  presetShort,
  presetText,
  untestedText,
  type IsolationOf,
  type OtherReceipt,
} from '../../../lib/core/policy.ts'
import { day } from './format.ts'

/**
 * A line whose last receipt judged another version than the one a fresh app installs there (review r6,
 * `otherVersionCells` of lib/core/policy.ts): the entry passed to the helpers below has that cell left out
 * (`withJudgedLines`), and this map brings it back as words, never as a verdict.
 */
export interface OtherCell {
  installs: string
  other: OtherReceipt
}
export type Others = Readonly<Record<string, OtherCell>>

export interface StatusMeta {
  /** Word used in labels and sentences. */
  word: string
  /** Letter for screen readers and print (spec 6.7). */
  letter: string
  /** Whether a square is drawn at all (skipped has none, only a quiet tick that keeps its column). */
  drawn: boolean
}

export const STATUS: Record<CellStatus, StatusMeta> = {
  verified: { word: 'verified', letter: 'V', drawn: true },
  broken: { word: 'broken', letter: 'X', drawn: true },
  // Yarn's age gate held back a dependency (round 13): a run that judged nothing, never the module's release or fault
  quarantine: { word: 'not judged (age gate)', letter: 'Q', drawn: true },
  'harness-red': { word: 'not judged (test app failed)', letter: 'H', drawn: true },
  // the cell was not judged because our run did not finish (round 5): calm and true, never the module's fault
  'infra-error': { word: 'not judged (run did not finish)', letter: 'I', drawn: true },
  // one word for a line without a receipt yet (review r1): Queued, everywhere a state is named
  untested: { word: 'queued', letter: 'U', drawn: true },
  skipped: { word: 'skipped', letter: 'S', drawn: false },
}

/**
 * The secondary mark of the signal `in isolation` (decision of 24 Oct): a small dot beside a line's square for the last
 * receipt of the package in an app from the empty preset. It never changes the square, which is a new app's (classic).
 * `letter` for print and screen readers, `legend` for the legends of / and /compat.
 */
export const ISOLATION_MARK = {
  word: 'in isolation (empty preset)',
  // plain words (finding of 25 Oct: `a second signal, never the verdict` read as jargon next to a red dot)
  legend: 'dot: the module alone, in an app from the empty preset. The square is the verdict.',
} as const

/**
 * The isolation dot of a line in a few words for its label: `in isolation (empty preset): verified on 23 Oct`, with the
 * version when the receipt is about another one than the line's (`... 0.9.0 verified on 23 Oct`, as isolationText).
 */
export function isolationLabel(c: Pick<CellSummary, 'status' | 'step' | 'at'>, version: string | null = null): string {
  const when = c.at ? ` on ${day(c.at)}` : ''
  const word =
    c.status === 'verified'
      ? 'verified'
      : c.status === 'broken'
        ? `broken${c.step ? ` at ${c.step}` : ''}`
        : c.status === 'quarantine' && !heldBack(c)
          ? 'in the age gate'
          : 'not judged'
  return `in isolation (empty preset): ${version ? `${version} ` : ''}${word}${when}`
}

/** The status of an isolation dot: verified, broken, or not judged (any other state). */
export function isolationDot(c: Pick<CellSummary, 'status'>): 'verified' | 'broken' | 'other' {
  return c.status === 'verified' ? 'verified' : c.status === 'broken' ? 'broken' : 'other'
}

/**
 * The mark a cell draws (round 14, spec 6.7): its state, except a `quarantine` cell with a failed step, a run Yarn's age
 * gate stopped on a dependency (`held`), which draws the neutral plate of a run that judged nothing; a `quarantine` cell
 * without a step is a release of the module in the gate, the yellow square.
 */
export type Mark = CellStatus | 'held'

export function markOf(c: { status: CellStatus; step?: string | null } | null | undefined): Mark {
  return c && heldBack(c) ? 'held' : (c?.status ?? 'untested')
}

/**
 * Legend and counter words of the receipt layer (review r1: one name per state), one per mark: `status` and `step` draw
 * its square, `title` explains it where the word alone could mislead (round 14: `not judged (age gate)` read as a
 * release of the module in the gate).
 */
export const STATE_LEGEND: { mark: Mark; status: CellStatus; step?: string; text: string; title?: string }[] = [
  { mark: 'verified', status: 'verified', text: 'verified' },
  { mark: 'broken', status: 'broken', text: 'broken' },
  { mark: 'held', status: 'quarantine', step: 'install', text: 'not judged (age gate)', title: QUARANTINE_TEXT },
  { mark: 'quarantine', status: 'quarantine', text: 'new release (age gate)' },
  { mark: 'harness-red', status: 'harness-red', text: 'not judged (test app failed)' },
  { mark: 'infra-error', status: 'infra-error', text: 'not judged (run did not finish)' },
  { mark: 'untested', status: 'untested', text: 'queued' },
  { mark: 'skipped', status: 'skipped', text: 'skipped: not installed by the catalog' },
]

/** Display order of lines: previous, latest, next (`0.8 0.9 next`). */
export function orderLines<T extends { key: string; source?: string }>(lines: T[]): T[] {
  const rank = (l: T): number =>
    l.source === 'previous' ? 0 : l.source === 'latest' ? 1 : l.source === 'develop' ? 2 : l.key === 'next' ? 2 : 1
  return [...lines].sort((a, b) => rank(a) - rank(b) || (a.key < b.key ? -1 : 1))
}

export interface StripCell {
  key: string
  status: CellStatus
  /** Accessible text, e.g. "0.9: verified on 24 Oct". */
  label: string
  step: string | null
  receipt: string | null
  /** The line's receipt judged another version (review r6): an outlined square, the status stays `untested`. */
  other?: boolean
  /** The signal `in isolation` of the line (`compat.isolation`): the small dot beside the square, never its status. */
  isolation?: { dot: 'verified' | 'broken' | 'other'; label: string }
}

/** One cell per line, in display order. A missing cell is `untested`; a receipt of another version says so. */
export function stripCells(
  entry: Pick<IndexEntry, 'compat'>,
  lines: Pick<Line, 'key' | 'source'>[],
  others: Others = {},
): StripCell[] {
  return orderLines(lines).map((l) => {
    const c = entry.compat.lines[l.key]
    const status: CellStatus = c?.status ?? 'untested'
    const o = others[l.key]
    const iso = entry.compat.isolation?.[l.key] as
      (NonNullable<IndexEntry['compat']['isolation']>[string] & { named?: boolean }) | undefined
    // the version, when the receipt in isolation is about another one than the line's (the registry's slim entries
    // say it in `named`, a full entry is compared here)
    const named = iso
      ? 'named' in iso
        ? !!iso.named
        : !!iso.moduleVersion && iso.moduleVersion !== isoVersion(entry, l.key)
      : false
    const isoLabel = iso ? isolationLabel(iso, named ? iso.moduleVersion : null) : ''
    const main = o
      ? `${l.key}: ${otherVersionText(l.key, o.installs, o.other).replace(/\.$/, '')}`
      : cellLabel(l.key, status, c?.at ?? null, c?.step ?? null)
    return {
      key: l.key,
      status,
      label: iso ? `${main}; ${isoLabel}` : main,
      step: c?.step ?? null,
      receipt: c?.receipt ?? null,
      ...(o ? { other: true } : {}),
      ...(iso ? { isolation: { dot: isolationDot(iso), label: isoLabel } } : {}),
    }
  })
}

export function cellLabel(key: string, status: CellStatus, at: string | null, step: string | null): string {
  const when = at ? ` on ${day(at)}` : ''
  switch (status) {
    case 'verified':
      return `${key}: verified${when}`
    case 'broken':
      return `${key}: broken${step ? ` at ${step}` : ''}${when}`
    case 'quarantine':
      // a dependency held back (round 13), the day before the reason so it never reads as the day of the gate
      return step ? `${key}: not judged${when}, ${QUARANTINE_WHY}` : `${key}: new release in the install age gate`
    case 'harness-red':
      return `${key}: not judged, the test app failed${when}`
    case 'infra-error':
      return `${key}: not judged, the run did not finish${when}`
    case 'untested':
      return `${key}: queued`
    case 'skipped':
      return `${key}: not installed by the catalog`
  }
}

export interface SentenceOptions {
  /** Queue sentence for a line without a receipt, e.g. `Queued for tonight's run (02:17 UTC).` */
  queued?: string
  /** Yarn age gate in days (quarantine sentence). */
  ageGateDays?: number
  /** Day a quarantined release becomes installable, per line key (IsoDate). */
  installableFrom?: string | null
  /** Lines whose break has one red night only (no second night confirmed it yet): line key -> day of that night. */
  unconfirmed?: Readonly<Record<string, string>>
  /** Lines whose receipt judged another version (review r6). */
  others?: Others
}

/** Lines that say the same thing: one status, and for a break the same step and first day (review r4). */
export interface StateGroup {
  status: CellStatus
  keys: string[]
  step: string | null
  /** IsoDate of the first red night of a break. */
  since: string | null
  /** IsoDate of a night that judged nothing (harness-red, infra-error), or of an unconfirmed break. */
  at: string | null
  /** False for a break with one red night only. */
  confirmed: boolean
  /** The receipt of another version these lines carry (status is then `untested`), or null. */
  other: OtherCell | null
  /**
   * Lines a new app has not tested yet while an app from the empty preset has (status `untested`): the one sentence of
   * `untestedText`, grouped by what the isolation receipt says.
   */
  isolation?: { text: string }
}

/** The lines of an entry grouped by what their cells say, in strip order of each group's first line. */
export function stateGroups(
  entry: Pick<IndexEntry, 'compat'>,
  lines: Pick<Line, 'key' | 'source'>[],
  unconfirmed: Readonly<Record<string, string>> = {},
  others: Others = {},
): StateGroup[] {
  const groups: StateGroup[] = []
  const otherKey = (o: OtherCell): string =>
    `${o.installs}|${o.other.moduleVersion}|${o.other.status}|${o.other.step}|${o.other.at?.slice(0, 10)}`
  for (const l of orderLines(lines)) {
    const o = others[l.key]
    if (o) {
      const g = groups.find((x) => x.other && otherKey(x.other) === otherKey(o))
      if (g) g.keys.push(l.key)
      else
        groups.push({ status: 'untested', keys: [l.key], step: null, since: null, at: null, confirmed: true, other: o })
      continue
    }
    const c = entry.compat.lines[l.key]
    const status: CellStatus = c?.status ?? 'untested'
    // no receipt from a new app yet, one from an app from the empty preset (24 Oct): its own sentence
    const iso = status === 'untested' ? entry.compat.isolation?.[l.key] : undefined
    if (iso) {
      const text = isolationText(iso, isoVersion(entry, l.key))
      const g = groups.find((x) => x.isolation?.text === text)
      if (g) g.keys.push(l.key)
      else
        groups.push({
          status,
          keys: [l.key],
          step: null,
          since: null,
          at: null,
          confirmed: true,
          other: null,
          isolation: { text },
        })
      continue
    }
    const step = status === 'broken' || status === 'quarantine' ? (c?.step ?? null) : null
    const confirmed = !(status === 'broken' && l.key in unconfirmed)
    const since = status === 'broken' && confirmed && c?.since ? c.since.slice(0, 10) : null
    const at =
      (status === 'infra-error' || status === 'harness-red' || (status === 'quarantine' && step)) && c?.at
        ? c.at.slice(0, 10)
        : !confirmed
          ? (unconfirmed[l.key] ?? null)
          : null
    const g = groups.find(
      (x) =>
        !x.other &&
        !x.isolation &&
        x.status === status &&
        x.step === step &&
        x.since === since &&
        x.at === at &&
        x.confirmed === confirmed,
    )
    if (g) g.keys.push(l.key)
    else groups.push({ status, keys: [l.key], step, since, at, confirmed, other: null })
  }
  return groups
}

/**
 * Sentence under the detailed strip, results first, one phrase per state, never one per line (review r4):
 * "Verified on 0.8 and 0.9. Broken at typecheck on next since 22 Oct." or
 * "Broken at typecheck on 0.8, 0.9 and next since 23 Oct."
 */
export function stateSentence(
  entry: Pick<IndexEntry, 'compat'>,
  lines: Pick<Line, 'key' | 'source'>[],
  opts: SentenceOptions = {},
): string {
  const groups = stateGroups(entry, lines, opts.unconfirmed, opts.others)
  const keysOf = (status: CellStatus): string[] =>
    groups.filter((g) => g.status === status && !g.other && !g.isolation).flatMap((g) => g.keys)
  const all = orderLines(lines).length
  if (keysOf('skipped').length === all) return 'Not installed by the catalog.'
  if (keysOf('untested').length === all) return opts.queued ?? "Queued for tonight's run."
  const parts: string[] = []
  // a line whose new app already registers the package first: what a reader of an official package needs to know
  const shipped = orderLines(lines)
    .map((l) => l.key)
    .filter((k) => entry.compat.inPresets?.includes(k))
  if (shipped.length) parts.push(presetText(shipped))
  const verified = keysOf('verified')
  if (verified.length) parts.push(`Verified on ${listAnd(verified)}.`)
  for (const g of groups) {
    // the sentences of lib/core/policy.ts, so the strip, the drawer, VER-1, the card and the agent policy agree (r6)
    if (g.other || g.isolation) continue
    if (g.status === 'broken') parts.push(brokenText(g.keys, g.step, g.since, g.at, g.confirmed))
    if (g.status === 'quarantine' && g.step) parts.push(notJudgedText(g.keys, 'quarantine', g.at))
    else if (g.status === 'quarantine')
      parts.push(
        `New release on ${listAnd(g.keys)}.${opts.installableFrom ? ` A fresh app installs it from ${day(opts.installableFrom)}${opts.ageGateDays ? ` (Yarn ${opts.ageGateDays}-day age gate)` : ''}.` : ''}`,
      )
    if (g.status === 'harness-red' || g.status === 'infra-error') parts.push(notJudgedText(g.keys, g.status, g.at))
  }
  // results first: a receipt of another version comes after the verdicts, before the queue
  for (const g of groups) if (g.other) parts.push(otherVersionText(g.keys, g.other.installs, g.other.other))
  // the signal `in isolation` where a new app has no receipt yet, in the one sentence of lib/core/policy.ts
  for (const g of groups) if (g.isolation) parts.push(`${notTestedText(listAnd(g.keys))} ${g.isolation.text}`)
  const untested = keysOf('untested')
  if (untested.length) parts.push(`Queued on ${listAnd(untested)}.`)
  return parts.join(' ')
}

/**
 * The note of the nameplate's `Recommended` row on a line without a recommended version (review r7: `No receipt on 0.9
 * yet.` stood under a red strip): the line's state in the strip's words, `No receipt on <line> yet.` only while the
 * line waits for its first receipt.
 */
export function noRecommendedNote(
  entry: Pick<IndexEntry, 'compat'>,
  line: Pick<Line, 'key' | 'source'>,
  opts: SentenceOptions = {},
): string {
  const status = entry.compat.lines[line.key]?.status ?? 'untested'
  if (status === 'untested' && !opts.others?.[line.key])
    return untestedText(line.key, entry.compat.isolation?.[line.key] ?? null, isoVersion(entry, line.key))
  return stateSentence(entry, [line], opts)
}

/**
 * The receipt results of the module header, one short phrase per state without steps or dates (the sentence under
 * the strip carries them): `Verified on 0.8 and 0.9`, `Broken on next`, `Not judged on 0.9` (review r4).
 */
export function headerResults(
  entry: Pick<IndexEntry, 'compat'>,
  lines: Pick<Line, 'key' | 'source'>[],
  others: Others = {},
): string[] {
  const groups = stateGroups(entry, lines, {}, others)
  const keysOf = (...st: CellStatus[]): string[] =>
    orderLines(lines)
      .map((l) => l.key)
      .filter((k) => groups.some((g) => !g.other && !g.isolation && st.includes(g.status) && g.keys.includes(k)))
  const out: string[] = []
  const shipped = orderLines(lines)
    .map((l) => l.key)
    .filter((k) => entry.compat.inPresets?.includes(k))
  if (shipped.length) out.push(presetShort(shipped))
  const verified = keysOf('verified')
  const broken = keysOf('broken')
  // a run the age gate stopped on a dependency is `Not judged` (round 13); only a release in the gate is `New release`
  const heldKeys = groups
    .filter((g) => g.status === 'quarantine' && g.step && !g.other && !g.isolation)
    .flatMap((g) => g.keys)
  const gate = keysOf('quarantine').filter((k) => !heldKeys.includes(k))
  const notJudged = orderLines(lines)
    .map((l) => l.key)
    .filter((k) => keysOf('harness-red', 'infra-error').includes(k) || heldKeys.includes(k))
  if (verified.length) out.push(`Verified on ${listAnd(verified)}`)
  if (broken.length) out.push(`Broken on ${listAnd(broken)}`)
  if (gate.length) out.push(`New release in the age gate on ${listAnd(gate)}`)
  if (notJudged.length) out.push(`Not judged on ${listAnd(notJudged)}`)
  // a receipt of another version, in the first words of its sentence (review r6): `No receipt for 0.8.0 on 0.8 yet`
  for (const g of groups) if (g.other) out.push(otherVersionShort(g.keys, g.other.installs))
  const iso = groups.filter((g) => g.isolation).flatMap((g) => g.keys)
  if (iso.length) out.push(notTestedText(listAnd(iso)).replace(/\.$/, ''))
  return out
}

/** `0.8 and next`, `0.8, 0.9 and next`. */
export function listAnd(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/**
 * The sub line of the phone bar on a line whose new app already registers the package (review r10, 24 Oct): under
 * `Nothing to install`, what the receipts say first (`installBarText`), then the lines, apart from any status glyph
 * (the bar read `V In a new app 0.8, 0.9 and next`, as if all three were verified): `verified on 0.9 · queued on 0.8
 * and next · already on in a new app on 0.8, 0.9 and next`.
 */
export function presetBarText(cells: readonly { key: string; preset?: boolean }[], receipts: string): string {
  const keys = cells.filter((c) => c.preset).map((c) => c.key)
  if (keys.length === 0) return receipts
  const on = presetShort(keys)
  return `${receipts} · ${on.charAt(0).toLowerCase()}${on.slice(1)}`
}

/** The version the isolation sentence compares with: the line's main version (`lineVersion`). */
function isoVersion(entry: Pick<IndexEntry, 'compat'>, line: string): string | null {
  const e = entry as Partial<Pick<IndexEntry, 'version' | '_meta'>> & Pick<IndexEntry, 'compat'>
  return e.version ? lineVersion({ version: e.version, _meta: e._meta, compat: e.compat }, line) : null
}

/**
 * The phone install bar (review r4, P1): what the receipts say, the same states as the header in a few words, so the
 * main action on a phone never says `queued` under a red strip. `queued` only for lines without any receipt, skipped
 * lines are left out, and an agent policy of `refuse` on the chosen line is named last.
 */
export function installBarText(
  cells: readonly { key: string; status: CellStatus; step?: string | null; noReceiptFor?: string | null }[],
  o: { refuse?: boolean; blocked?: 'hold' | 'not-installable' | null } = {},
): string {
  if (o.blocked === 'hold') return 'on hold, do not install'
  if (o.blocked === 'not-installable') return 'not installable'
  // `noReceiptFor`: the line's receipt judged another version (review r6), named apart from the queue; the lines are
  // listed with `and` like the strip's sentence (review r8: `verified on 0.8, 0.9, next` under `0.8, 0.9 and next`)
  const keys = (...st: CellStatus[]): string =>
    listAnd(
      cells
        .filter((c) => !c.noReceiptFor && (st.includes(c.status) || (st.includes('infra-error') && heldBack(c))))
        .filter((c) => !(heldBack(c) && !st.includes('infra-error')))
        .map((c) => c.key),
    )
  const parts: string[] = []
  const add = (label: string, k: string): void => {
    if (k) parts.push(`${label} on ${k}`)
  }
  add('verified', keys('verified'))
  add('broken', keys('broken'))
  add('in the age gate', keys('quarantine'))
  add('not judged', keys('harness-red', 'infra-error'))
  for (const v of [...new Set(cells.flatMap((c) => (c.noReceiptFor ? [c.noReceiptFor] : [])))])
    add(`no receipt for ${v}`, listAnd(cells.filter((c) => c.noReceiptFor === v).map((c) => c.key)))
  const queued = keys('untested')
  if (queued) parts.push(parts.length ? `queued on ${queued}` : 'queued')
  if (parts.length === 0) parts.push('not tested by the catalog')
  if (o.refuse) parts.push('agent refuses')
  return parts.join(' · ')
}
