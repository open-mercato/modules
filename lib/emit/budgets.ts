// Size budgets of the published files (spec 4.6, 6.7, 7.11). `emit` reports every file over its budget as a
// warning; tests assert that the fixture stays within all of them.
import { gzipSync } from 'node:zlib'
import type { ModulesIndex } from '../schema/published/modules.ts'
import type { FileMap } from './types.ts'
import { byteLength } from './util.ts'

const KB = 1024

/**
 * `modules.json` budget, orchestrator decision E1 (errata to spec 4.6 and 12.2), changed in round 13:
 * at most 6 KB per entry on average, at most 10 KB for any one entry, and at most 60 KB gzip for the whole file
 * (instead of 3.5 KB per entry and 40 KB gzip). The index carries the anatomy lists the install plan reads (tables,
 * permissions, settings, hosts: `plan_install` and the consent card are computed from them), so a module with a
 * large but real anatomy (freighttech: 9 tables, 14 permissions, 18 hosts) cannot be cut to an even 6 KB without
 * an incomplete consent card; the average and the gzip size are what grow the file. Above 150 entries the lists move
 * to `/m/<path>.json` (spec 4.6). One issue names how many entries are over, the largest one and the average.
 */
export const ENTRY_LABEL = 'modules.json per entry'
export const ENTRY_MAX_BYTES = 10 * KB
export const ENTRY_AVG_MAX_BYTES = 6 * KB
export const INDEX_MAX_GZIP_BYTES = 60 * KB

export interface Budget {
  /** Glob-like test on the published path. */
  test: (path: string) => boolean
  label: string
  maxBytes?: number
  maxGzipBytes?: number
}

export const BUDGETS: readonly Budget[] = [
  { label: 'modules.json', test: (p) => p === 'modules.json', maxGzipBytes: INDEX_MAX_GZIP_BYTES },
  { label: 'built-in.json', test: (p) => p === 'built-in.json', maxBytes: 80 * KB },
  { label: 'picker.json', test: (p) => p === 'picker.json', maxBytes: 60 * KB },
  { label: 'compat.json', test: (p) => p === 'compat.json', maxBytes: 60 * KB },
  { label: 'changes.json', test: (p) => p === 'changes.json', maxBytes: 60 * KB },
  { label: 'radar/next.json', test: (p) => p === 'radar/next.json', maxBytes: 30 * KB },
  { label: 'surface.json', test: (p) => p === 'surface.json', maxBytes: 60 * KB },
  {
    label: 'm/<path>.json',
    test: (p) => /^m\/.+\.json$/.test(p) && !/\/(receipts|facts)\.json$/.test(p),
    maxBytes: 120 * KB,
  },
  { label: 'm/<path>.md', test: (p) => /^m\/.+\.md$/.test(p), maxBytes: 20 * KB },
  { label: 'badge/<path>.svg', test: (p) => /^badge\/.+\.svg$/.test(p), maxBytes: 2 * KB },
  { label: 'badge/<path>.json', test: (p) => /^badge\/.+\.json$/.test(p), maxBytes: 2 * KB },
  { label: 'search-index.json', test: (p) => p === 'search-index.json', maxGzipBytes: 100 * KB },
]

export interface BudgetIssue {
  path: string
  label: string
  bytes: number
  max: number
  gzip: boolean
}

export function checkBudgets(files: FileMap): BudgetIssue[] {
  const out: BudgetIssue[] = []
  for (const [path, content] of files) {
    for (const b of BUDGETS) {
      if (!b.test(path)) continue
      if (b.maxBytes !== undefined) {
        const bytes = byteLength(content)
        if (bytes > b.maxBytes) out.push({ path, label: b.label, bytes, max: b.maxBytes, gzip: false })
      }
      if (b.maxGzipBytes !== undefined) {
        const bytes = gzipSync(typeof content === 'string' ? Buffer.from(content) : content).length
        if (bytes > b.maxGzipBytes) out.push({ path, label: b.label, bytes, max: b.maxGzipBytes, gzip: true })
      }
    }
  }
  const index = files.get('modules.json')
  if (typeof index === 'string') {
    const s = entrySizes(JSON.parse(index) as ModulesIndex)
    if (s.over > 0)
      out.push({
        path: 'modules.json',
        label: `${ENTRY_LABEL}: ${s.over} of ${s.count} entries over, largest ${s.largest}, average ${s.average} B`,
        bytes: s.max,
        max: ENTRY_MAX_BYTES,
        gzip: false,
      })
    if (s.average > ENTRY_AVG_MAX_BYTES)
      out.push({
        path: 'modules.json',
        label: `${ENTRY_LABEL} on average: ${s.count} entries, largest ${s.largest}`,
        bytes: s.average,
        max: ENTRY_AVG_MAX_BYTES,
        gzip: false,
      })
  }
  return out
}

export function gzipSize(content: string | Uint8Array): number {
  return gzipSync(typeof content === 'string' ? Buffer.from(content) : content).length
}

/** Bytes per entry of a ModulesIndex: average, the largest one and how many are over ENTRY_MAX_BYTES. */
export function entrySizes(index: ModulesIndex): {
  count: number
  average: number
  max: number
  largest: string | null
  over: number
} {
  let total = 0
  let max = 0
  let over = 0
  let largest: string | null = null
  for (const e of index.entries) {
    const b = byteLength(JSON.stringify(e))
    total += b
    if (b > ENTRY_MAX_BYTES) over++
    if (b > max) {
      max = b
      largest = e.locator
    }
  }
  const count = index.entries.length
  return { count, average: count ? Math.round(total / count) : 0, max, largest, over }
}
