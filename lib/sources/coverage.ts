// Official coverage (spec 5.2 discover, 4.6 ModulesIndex.officialCoverage): published `@open-mercato/*` packages
// minus policy/ignore.yml minus catalog entries (and their `renamedFrom`). Written to `.data/official-coverage.json`.
//
// `npm search scope:open-mercato` alone is fuzzy and incomplete (23 of 51 scoped packages on 2026-10-23), so the
// package list is the union of the npm org listing (`/-/org/open-mercato/package`) and that search, both filtered
// to the `@open-mercato/` prefix. `@open-mercato/core` is the source of the built-in modules (spec 11.2), never an entry.
import { z } from 'zod'
import { IsoDateTime, NpmName } from '../schema/index.ts'
import { type Entry, isIgnored, type Policies } from './entries.ts'
import type { Http } from './http.ts'
import { orgPackages, searchNpm } from './npm.ts'

export const BUILT_IN_SOURCES = ['@open-mercato/core'] as const

export { OfficialCoverageFile, type OfficialCoverage } from '../schema/data/coverage.ts'
import type { OfficialCoverage } from '../schema/data/coverage.ts'
import { OfficialCoverageFile } from '../schema/data/coverage.ts'

export async function officialPackages(http: Http): Promise<string[]> {
  const names = new Set<string>()
  const errors: string[] = []
  try {
    for (const n of await orgPackages(http, 'open-mercato')) names.add(n)
  } catch (err) {
    errors.push((err as Error).message)
  }
  try {
    for (const h of await searchNpm(http, 'scope:open-mercato')) names.add(h.name)
  } catch (err) {
    errors.push((err as Error).message)
  }
  if (names.size === 0 && errors.length) throw new Error(errors.join('; '))
  return [...names].filter((n) => n.startsWith('@open-mercato/')).sort()
}

export function coverageOf(packages: string[], entries: Entry[], policies: Policies, at: string): OfficialCoverage {
  const covered = new Set<string>()
  for (const e of entries) {
    covered.add(e.locator)
    for (const r of e.d.renamedFrom ?? []) covered.add(r)
  }
  const considered = packages.filter(
    (n) => !isIgnored(policies.ignore, `npm:${n}`) && !(BUILT_IN_SOURCES as readonly string[]).includes(n),
  )
  const missing = considered.filter((n) => !covered.has(`npm:${n}`))
  return OfficialCoverageFile.parse({
    at,
    listed: considered.length - missing.length,
    missing: missing.slice(0, 50),
    packages: considered,
  })
}

export async function officialCoverage(
  http: Http,
  entries: Entry[],
  policies: Policies,
  at: string,
): Promise<OfficialCoverage> {
  return coverageOf(await officialPackages(http), entries, policies, at)
}
