// /compat.json (spec 4.6, 7.7 D): baseline per line, one row per listed `kind: module` entry with its last receipt
// and static fit per line, and `peersRejectFitting`, the input of the D13 sentence. The cells are a new app (the classic
// preset); `isolationBaseline` is the row of an app from the empty preset (24 Oct), the signal `in isolation` of each
// cell stays in modules.json (`compat.isolation`), so the matrix keeps its budget. Pure.
import { lineVersion, otherVersionCells } from '../core/policy.ts'
import { latestLine } from '../core/lines.ts'
import { peersRejectFitting } from '../fit/static.ts'
import type { FitCell } from '../schema/data/index.ts'
import type { CompatIndex } from '../schema/published/compat.ts'
import type { CellSummary, Line } from '../schema/published/modules.ts'
import type { EntryContext } from './types.ts'

/**
 * The /compat sentence from data (spec 0.8, 7.7 D), e.g. `Peer ranges reject 53 of 62 combinations that fit
 * statically.` (`fitting` counts the module and line combinations that fit statically, `rejected` those of them
 * whose peer ranges do not accept the line's version).
 */
export function peersSentence(p: CompatIndex['peersRejectFitting']): string {
  if (p.fitting === 0) return 'No combination fits statically yet.'
  if (p.rejected === 0)
    return `Peer ranges accept all ${p.fitting} ${p.fitting === 1 ? 'combination' : 'combinations'} that fit statically.`
  return `Peer ranges reject ${p.rejected} of ${p.fitting} ${p.fitting === 1 ? 'combination' : 'combinations'} that fit statically.`
}

/** Placeholder cell for a line without a receipt: the signal state (untested or skipped). */
function emptyCell(status: CellSummary['status'], omVersion: string): CellSummary {
  return {
    status,
    step: null,
    omVersion,
    moduleVersion: null,
    at: null,
    receipt: null,
    since: null,
    precheck: null,
    patches: [],
  }
}

export function buildCompat(
  ctxs: readonly EntryContext[],
  lines: readonly Line[],
  baseline: Record<string, CellSummary>,
  now: string,
  /** `dataAsOf` of modules.json (review r8): a preview run is named as one in the matrix too. */
  dataAsOf?: CompatIndex['dataAsOf'],
  /** The Open Mercato itself row of an app from the empty preset (24 Oct). */
  isolationBaseline?: Record<string, CellSummary>,
): CompatIndex {
  const latest = latestLine(lines)
  const fitCells: FitCell[] = []
  const rows: CompatIndex['rows'] = []
  for (const c of ctxs) {
    const e = c.entry
    if (!e.listed || e.kind !== 'module') continue
    const cells: CompatIndex['rows'][number]['cells'] = {}
    // a receipt of another version than a fresh app installs (finding of 25 Oct: storage-s3 on 0.8 read `broken` here
    // while the page and modules.json say untested): the cell names the version it is not about
    const others = otherVersionCells(e)
    for (const l of lines) {
      const cell = e.compat.lines[l.key] ?? emptyCell(e.signals.receipt[l.key] ?? 'untested', l.version)
      const other = others[l.key]
      cells[l.key] = { ...cell, fit: e.signals.fit[l.key] ?? 'unknown', ...(other ? { installs: other.installs } : {}) }
      const f = c.fit[l.key]
      if (f) fitCells.push(f)
    }
    rows.push({
      locator: e.locator,
      path: e.path,
      title: e.title,
      // the version a new app has on the latest line, and per line where it ships the package (review of 24 Oct: a
      // cell of checkout on 0.8 named 0.9.0 and its peers, where a new 0.8 app has 0.8.0)
      version: lineVersion(e, latest?.key ?? null),
      builtFor: e.compat.builtFor,
      cells,
      ...(e.compat.inPresets?.length ? { inPresets: e.compat.inPresets } : {}),
      ...(e.compat.ships && Object.keys(e.compat.ships).length ? { ships: e.compat.ships } : {}),
    })
  }
  rows.sort((a, b) => a.title.localeCompare(b.title) || a.locator.localeCompare(b.locator))
  return {
    schemaVersion: 1,
    generatedAt: now,
    ...(dataAsOf ? { dataAsOf } : {}),
    lines: [...lines],
    baseline,
    ...(isolationBaseline && Object.keys(isolationBaseline).length ? { isolationBaseline } : {}),
    rows,
    peersRejectFitting: peersRejectFitting(fitCells),
  }
}
