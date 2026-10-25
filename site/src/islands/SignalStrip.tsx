// Signal strip (spec 6.7, 7.6): one 14 px square per line with its label. Same component in SSR and in islands.
import type { IndexEntry, Line } from '../../../lib/schema/index.ts'
import { stripCells } from '../lib/status.ts'
import type { StripCell } from '../lib/status.ts'
import { StripView } from '../lib/ui.tsx'

export interface SignalStripProps {
  /** Either ready cells or an entry plus the lines to show. */
  cells?: StripCell[]
  entry?: Pick<IndexEntry, 'compat'>
  lines?: Pick<Line, 'key' | 'source'>[]
  labels?: boolean
  /** One `Queued` label when every line is untested (registry rows, day 0). */
  collapse?: boolean
}

export default function SignalStrip({ cells, entry, lines, labels = true, collapse = false }: SignalStripProps) {
  const c = cells ?? (entry && lines ? stripCells(entry, lines) : [])
  return <StripView cells={c} labels={labels} collapse={collapse} />
}
