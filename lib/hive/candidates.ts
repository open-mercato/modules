// Which entries get a Hive cell (spec 7.5), from descriptors, sync records and built-in facts. Pure and isomorphic.
import type { HiveCandidate, HiveGroup, Wedge } from './layout.ts'

export interface HiveDescriptorInput {
  locator: string
  kind: 'module' | 'provider' | 'library' | 'tool'
  category: string
  tags: string[]
  status: 'active' | 'hold' | 'unmaintained' | 'delisted'
}
export interface HiveSyncInput {
  type: 'official' | 'community' | '3rd-party'
  firstSeenAt: string
}

export interface CandidateInputs {
  descriptors: HiveDescriptorInput[]
  /** SyncRecord by locator (type, firstSeenAt). Missing: official when npm:@open-mercato/*, else ecosystem. */
  sync: Map<string, HiveSyncInput>
  /** Listed state by locator from data/health (LST rules pass and state not hold or delisted), when known. */
  listed?: Map<string, boolean>
  /** Built-in module IDs of the latest core line. */
  builtIn: string[]
  /** Built-in release date (IsoDate) used as their addedAt. */
  builtInAddedAt: string
  /** category id -> wedge (policy/categories.yml). */
  categoryWedge: Map<string, Wedge>
  /** core module ID -> category (policy/builtin-categories.yml). */
  builtinCategories: Map<string, string>
}

export interface CandidateResult {
  candidates: HiveCandidate[]
  warnings: string[]
}

/** Built-in modules + listed entries of kind module or provider without the `example` tag. */
export function hiveCandidates(inp: CandidateInputs): CandidateResult {
  const warnings: string[] = []
  const out: HiveCandidate[] = []
  for (const id of inp.builtIn) {
    let cat = inp.builtinCategories.get(id)
    if (!cat) {
      warnings.push(`core module ${id} is not in policy/builtin-categories.yml; placed in operations`)
      cat = 'operations'
    }
    const wedge = inp.categoryWedge.get(cat) ?? 'operate'
    out.push({ key: `core:${id}`, group: 'core', wedge, addedAt: inp.builtInAddedAt })
  }
  for (const d of inp.descriptors) {
    if (d.kind !== 'module' && d.kind !== 'provider') continue
    if (d.tags.includes('example')) continue
    if (d.status === 'hold' || d.status === 'delisted') continue
    if (inp.listed?.get(d.locator) === false) continue
    const wedge = inp.categoryWedge.get(d.category)
    if (!wedge) {
      warnings.push(`${d.locator}: unknown category ${d.category}`)
      continue
    }
    const s = inp.sync.get(d.locator)
    const type = s?.type ?? (d.locator.startsWith('npm:@open-mercato/') ? 'official' : '3rd-party')
    const group: HiveGroup = type === 'official' ? 'official' : 'ecosystem'
    out.push({ key: d.locator, group, wedge, addedAt: s?.firstSeenAt ?? '9999-12-31' })
  }
  return { candidates: out, warnings }
}
