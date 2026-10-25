// Page helpers shared by `/`, `/c/*`, `/m/*`, `/r/*` and `/404` (WP12). The underscore keeps the file out of routing.
// Isomorphic (no Node API): the Registry island imports it too.
import type { CellSummary, IndexEntry, Line } from '../../../../lib/schema/index.ts'
import { catalogSkipText } from '../../../../lib/core/policy.ts'

type ReceiptLike = { id: string; run: { attempt?: number | null }; transition?: { confirmed?: boolean } }

/**
 * One record per receipt id. `collect` appends a confirmation (the retry) under the same id as the first record
 * (spec 4.5), so a list can hold the same receipt twice, in either order (data files are oldest first, the
 * published module receipts newest first). The record of the later attempt wins, then the confirmed one; the
 * position of the first appearance is kept.
 */
export function uniqueReceipts<T extends ReceiptLike>(list: readonly T[]): T[] {
  const rank = (r: T): number => (r.run.attempt ?? 0) * 2 + (r.transition?.confirmed ? 1 : 0)
  const byId = new Map<string, T>()
  for (const r of list) {
    const seen = byId.get(r.id)
    if (!seen || rank(r) >= rank(seen)) byId.set(r.id, r)
  }
  return [...byId.values()]
}

/** Held states that the registry hides behind its switch (6.4). */
export const HELD_STATES: ReadonlySet<string> = new Set(['hold', 'unmaintained', 'deprecated', 'archived', 'stale'])

/**
 * The default set of the registry, the Hive and every "N modules" on the site: listed modules and providers without
 * the `example` tag (7.5, 7.7 A.4). One definition, so the hero, the registry, the legend and the 404 agree.
 */
export function registryDefault<T extends Pick<IndexEntry, 'listed' | 'kind' | 'tags' | 'status'>>(
  entries: readonly T[],
): T[] {
  return entries.filter(
    (e) =>
      e.listed &&
      !HELD_STATES.has(e.status) &&
      (e.kind === 'module' || e.kind === 'provider') &&
      !e.tags.includes('example'),
  )
}

/**
 * Why the nightly run never installs this entry (spec 5.3: only `kind: module` rows, enterprise needs flags), or
 * null when it does. Such lines are `skipped`, not `untested`.
 */
export function catalogSkip(entry: Pick<IndexEntry, 'enterprise' | 'kind'>): string | null {
  // the words of the agent policy (lib/core/policy.ts), so the strip and the reason never part
  return catalogSkipText(entry)
}

/**
 * The entry's compat with `skipped` on every line that has no cell, for entries the nightly run never installs, and
 * on the lines the signals mark skipped (a preview-only release has no stable version for 0.8 and 0.9), so the
 * module page, the registry and /compat say the same thing per line.
 */
export function withSkipped<T extends Pick<IndexEntry, 'enterprise' | 'kind' | 'compat'>>(
  entry: T,
  lines: readonly Pick<Line, 'key' | 'version'>[],
): T {
  const signal = (entry as { signals?: { receipt?: Record<string, string> } }).signals?.receipt ?? {}
  const all = !!catalogSkip(entry)
  const filled: Record<string, CellSummary> = { ...entry.compat.lines }
  let changed = false
  for (const l of lines) {
    if (filled[l.key] || !(all || signal[l.key] === 'skipped')) continue
    changed = true
    filled[l.key] = {
      status: 'skipped',
      step: null,
      omVersion: l.version,
      moduleVersion: null,
      at: null,
      receipt: null,
      since: null,
      precheck: null,
      patches: [],
    }
  }
  return changed ? { ...entry, compat: { ...entry.compat, lines: filled } } : entry
}

/** True when the policy says the catalog cannot install this entry at all (no src/dist pair, no pinned tag). */
export function cannotInstall(entry: Pick<IndexEntry, 'agentPolicy'>): boolean {
  return Object.values(entry.agentPolicy).some((p) =>
    p.reasons.some((r) => r.code === 'NOT_INSTALLABLE' || r.code === 'UNPINNED_GIT'),
  )
}

const escHtml = (s: string): string => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/**
 * HTML of an identifier that wraps only at token boundaries: after `_`, `/` and `-`, before `.` and `:`. A table
 * name, an event or an extension target never breaks inside a word.
 */
export function idWrapHtml(text: string): string {
  return escHtml(text)
    .replace(/([_/-])(?=[^\s])/g, '$1<wbr>')
    .replace(/(?<=[^\s])([.:])/g, '<wbr>$1')
}

/**
 * Column spans of cells laid out in order in a grid of `cols` columns: a cell asks for 1 or 2, a cell that does not
 * fit the rest of its row moves down and the cell before it takes the rest, and the last row ends at the edge.
 */
export function rowSpans(
  ids: readonly string[],
  want: Readonly<Record<string, number>>,
  cols: number,
): Record<string, number> {
  const out: Record<string, number> = {}
  let col = 0
  let prev: string | null = null
  for (const id of ids) {
    const n = Math.min(cols, want[id] ?? 1)
    if (col + n > cols && prev) {
      out[prev] = (out[prev] ?? 1) + (cols - col)
      col = 0
    }
    out[id] = n
    col += n
    if (col >= cols) col = 0
    prev = id
  }
  if (col > 0 && prev) out[prev] = (out[prev] ?? 1) + (cols - col)
  return out
}
