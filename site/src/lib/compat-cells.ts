// Texts and states of the /compat matrix cells (spec 7.7 D, 7.8), shared by CompatMatrix and the page header.
// Isomorphic. One predicate decides the day-0 form, so the matrix and every count above it agree.
import type { CellStatus, CompatIndex } from '../../../lib/schema/index.ts'
import { brokenText, declaredOn, heldBack, notJudgedText, notTestedText } from '../../../lib/core/policy.ts'
import { STATUS, cellLabel } from './status.ts'
import { day } from './format.ts'

/** Static fit on /compat (D14): drift counts as a fit here; the tilde lives on /radar only. */
export type Fit = 'fit' | 'no-fit' | 'unknown'
export const fitOf = (f: string | null | undefined): Fit =>
  f === 'ok' || f === 'drift' ? 'fit' : f === 'no-fit' ? 'no-fit' : 'unknown'

/** One glyph per fit, so the fit never rests on colour alone (spec 7.9). */
export const FIT_GLYPH: Record<Fit, string> = { fit: 'F', 'no-fit': '×', unknown: '?' }
export const FIT_WORD: Record<Fit, string> = {
  fit: 'Fits statically',
  'no-fit': 'Does not fit statically',
  unknown: 'Static fit not analyzed',
}
/** Legend and counter words of the fit layer, in glyph order. */
export const FIT_LEGEND: { fit: Fit; text: string }[] = [
  { fit: 'fit', text: 'fits statically' },
  { fit: 'no-fit', text: 'no fit' },
  { fit: 'unknown', text: 'not analyzed' },
]

/** Legend and counter words of the receipt layer: one list for /compat and the registry (status.ts). */
export { STATE_LEGEND } from './status.ts'

type Rows = CompatIndex['rows']
type Baseline = CompatIndex['baseline']

/**
 * Day 0: no baseline on any line and no module cell judged yet. The pinned row is one queue sentence instead of
 * cells, so its popovers do not exist; every consumer of the matrix asks this one predicate.
 */
export function isDayZero(compat: { rows: Rows; baseline: Baseline }, lineKeys: readonly string[]): boolean {
  return (
    !lineKeys.some((k) => compat.baseline[k]) &&
    compat.rows.every((r) => lineKeys.every((k) => ['untested', 'skipped'].includes(r.cells[k]?.status ?? 'untested')))
  )
}

/** More than half of the cells have no receipt: the static fit is the measured layer, so it starts switched on. */
export function fitByDefault(compat: { rows: Rows }, lineKeys: readonly string[]): boolean {
  let untested = 0
  let all = 0
  for (const r of compat.rows)
    for (const k of lineKeys) {
      all += 1
      if ((r.cells[k]?.status ?? 'untested') === 'untested') untested += 1
    }
  return all > 0 && untested * 2 > all
}

/** A develop snapshot version without its build suffix: 0.10.1-develop.7583.1.0c886d0a14 -> 0.10.1-develop.7583. */
export const shortV = (s: string): string => s.replace(/(\d+\.\d+\.\d+-[a-z]+\.\d+)[.\w]*/g, '$1')

export interface CellText {
  line: string
  status: CellStatus
  fit: Fit
  /** Module version of the cell, or null when there is no release for the line. */
  moduleVersion: string | null
  omVersion: string
  /** Peer range the cell's version declares (`builtFor.ranges[line]`, else `builtFor.range`), null when it declares none. */
  range: string | null
  declared: boolean
  /** False when the catalog has not read the peers of the cell's version (a develop snapshot a new app ships on next). */
  read?: boolean
  /** Why the cell is skipped, as a sentence. */
  skipped: string | null
  step: string | null
  /** First red night of a break (IsoDate), formatted by the sentence. */
  since: string | null
  at: string | null
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The state sentence of a popover (spec 7.8). `queued` is the queue sentence of the cell's line. A break and a night
 * that judged nothing are the sentences of lib/core/policy.ts with the line (review r7: the popover said `Broken at
 * typecheck since 23 Oct.`, a third form): `Broken at typecheck on 0.8 since 23 Oct.`
 */
export function stateSentence(
  c: Pick<CellText, 'line' | 'status' | 'skipped' | 'step' | 'since'> & { at?: string | null },
  queued: string,
  /** The signal `in isolation` of the cell (`isolationText`), said after `not yet tested in a new app` (24 Oct). */
  iso: string | null = null,
): string {
  if (c.status === 'untested') return iso ? `${notTestedText(c.line)} ${iso} ${queued}` : queued
  if (c.status === 'skipped') return c.skipped ?? 'Skipped. The catalog does not install it on this line.'
  if (c.status === 'broken') return brokenText(c.line, c.step, c.since)
  // a night that judged nothing, calmly and with its day (round 5): never the module's fault
  if (c.status === 'infra-error' || c.status === 'harness-red') return notJudgedText(c.line, c.status, c.at ?? null)
  // Yarn's age gate held back a dependency (round 13): not judged, never the module's fault
  if (heldBack(c)) return notJudgedText(c.line, 'quarantine', c.at ?? null)
  // the shape of the break sentence, with the line and the first verified night (review r8)
  if (c.status === 'verified') return `Verified on ${c.line}${c.since ? ` since ${day(c.since)}` : ''}.`
  return `${cap(STATUS[c.status].word)}.`
}

/**
 * The version a cell is about before its receipt (review of 24 Oct: a cell of checkout on 0.8 named 0.9.0, where a new
 * 0.8 app has 0.8.0): the version a new app ships on the line (`ships`), else the row's, the latest line's.
 */
export function cellVersion(row: Pick<Rows[number], 'version' | 'ships'>, line: string): string | null {
  return row.ships?.[line] ?? row.version
}

/** What the peers of a cell's version declare (`declaredOn`): the range, whether it accepts the line, and `read`. */
export function cellPeers(
  row: Pick<Rows[number], 'builtFor'>,
  line: string,
): Pick<CellText, 'range' | 'declared' | 'read'> {
  const d = declaredOn(row.builtFor, line)
  return { range: d.range, declared: d.accepts, read: d.read }
}

/** The meta line of a module popover: version, Open Mercato, what the peers say, the fit. */
export function metaLine(
  c: Pick<CellText, 'range' | 'declared' | 'read' | 'line' | 'moduleVersion' | 'omVersion' | 'fit'>,
): string {
  const peers =
    c.read === false
      ? 'Peers not read yet'
      : c.range
        ? `Built for ${shortV(c.range)} (peers ${c.declared ? 'accept' : 'reject'} ${c.line})`
        : 'No peer range'
  return [
    c.moduleVersion ? `Module ${shortV(c.moduleVersion)}` : 'No release for this line',
    `OM ${shortV(c.omVersion)}`,
    peers,
    FIT_WORD[c.fit],
  ].join(' · ')
}

/** Accessible name of a cell button: the receipt state, then the fit. */
export function cellAria(c: Pick<CellText, 'line' | 'status' | 'at' | 'step' | 'fit'>, withFit: boolean): string {
  const base = cellLabel(c.line, c.status, c.at, c.step)
  return withFit ? `${base}, ${FIT_WORD[c.fit].toLowerCase()}` : base
}
