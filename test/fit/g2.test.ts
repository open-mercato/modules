// The g2 numbers (spec 12.2 WP06) from a recorded run of lib/fit on Cezar (test/fit/g2-repro.ts, real tarballs
// from registry.npmjs.org), compared with the original g2 measurement (research/g2-dane.json, g2-expected.json).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FitCell } from '../../lib/schema/index.ts'
import type { FitCell as FitCellT } from '../../lib/schema/index.ts'
import { peersRejectFitting } from '../../lib/fit/static.ts'
import type { MissingRef } from '../../lib/fit/static.ts'
import { FIT_FIXTURES } from './helpers.ts'

interface Run {
  versions: string[]
  latest: string
  external: Record<string, Record<string, FitCellT>>
  control: Record<string, Record<string, { checked: number; missing: MissingRef[]; unknown: number }>>
}
interface Expected {
  matrix: Record<
    string,
    {
      cells: Record<string, { fits: boolean; peersAccept: boolean; checked: number; typeIssues: number }>
      driftToNext: number
    }
  >
  control090: Record<string, { checked: number; issues: number }>
  negativeControl: Record<string, Record<string, { issues: number; checked: number }>>
}

const run = JSON.parse(readFileSync(join(FIT_FIXTURES, 'g2-run.json'), 'utf8')) as Run
const expected = JSON.parse(readFileSync(join(FIT_FIXTURES, 'g2-expected.json'), 'utf8')) as Expected
const NEXT = run.versions[3] as string
const CONSENTS = 'npm:@piotrkarwatka/marketing-consents@0.1.0'
const allCells = run.versions.flatMap((v) => Object.values(run.external[v] ?? {}))

describe('recorded g2 run', () => {
  it('has valid FitCells for 16 packages x 4 OM versions', () => {
    expect(run.versions).toEqual(['0.7.0', '0.8.0', '0.9.0', '0.10.1-develop.7583.1.0c886d0a14'])
    expect(allCells).toHaveLength(64)
    for (const c of allCells) expect(FitCell.safeParse(c).success).toBe(true)
  })

  it('0 false alarms on 1948 symbols: official 0.9.0 packages against 0.9.0', () => {
    const control = Object.values(run.control['0.9.0'] ?? {})
    expect(control).toHaveLength(23)
    expect(control.reduce((n, c) => n + c.checked, 0)).toBe(1948)
    const misses = Object.entries(run.control['0.9.0'] ?? {}).flatMap(([k, c]) => c.missing.map((m) => ({ k, ...m })))
    expect(misses.filter((m) => m.kind === 'symbol')).toEqual([])
    // The only two hits are real: test helpers that the published core does not ship (g2 found the same two).
    expect(misses.map((m) => `${m.k} ${m.subpath}`)).toEqual([
      'npm:@open-mercato/checkout@0.9.0 modules/core/__integration__/helpers/api',
      'npm:@open-mercato/checkout@0.9.0 modules/core/__integration__/helpers/generalFixtures',
    ])
    expect(control.reduce((n, c) => n + c.unknown, 0)).toBe(0)
  })

  it('consents does not fit 0.8 (no lib/encryption/migration-backfill), fits 0.9 and next', () => {
    const on08 = run.external['0.8.0']?.[CONSENTS]
    expect(on08?.status).toBe('no-fit')
    expect(on08?.missing).toEqual([
      { pkg: '@open-mercato/shared', subpath: 'lib/encryption/migration-backfill', symbol: null, kind: 'subpath' },
    ])
    expect(run.external['0.7.0']?.[CONSENTS]?.status).toBe('no-fit')
    expect(run.external['0.9.0']?.[CONSENTS]?.status).toBe('ok')
    expect(run.external[NEXT]?.[CONSENTS]?.status).toBe('drift')
  })

  it('peers reject 53 of the 62 combinations that fit statically (64 combinations in all)', () => {
    expect(peersRejectFitting(allCells)).toEqual({ rejected: 53, fitting: 62 })
  })

  it('drift: 9 of 16 packages use symbols that changed between 0.9.0 and next', () => {
    const next = Object.values(run.external[NEXT] ?? {})
    expect(next).toHaveLength(16)
    expect(next.filter((c) => c.drift.length > 0)).toHaveLength(9)
    expect(run.external['0.9.0'] && Object.values(run.external['0.9.0']).every((c) => c.drift.length === 0)).toBe(true)
  })

  it('finds @tanstack/react-table 9.2.6 vs 9.3.1 in consents on 0.9.0', () => {
    expect(run.external['0.9.0']?.[CONSENTS]?.hostDuplicates).toContainEqual({
      name: '@tanstack/react-table',
      moduleRange: '9.2.6',
      appVersion: '9.3.1',
    })
  })
})

describe('recorded run equals the g2 measurement', () => {
  it('every cell: fits statically, peers accept, symbols checked', () => {
    for (const [key, row] of Object.entries(expected.matrix))
      for (const [v, e] of Object.entries(row.cells)) {
        const c = run.external[v]?.[key]
        expect({
          key,
          v,
          fits: c?.status === 'ok' || c?.status === 'drift',
          peersAccept: c?.declared.satisfied,
          checked: c?.checked,
        }).toEqual({
          key,
          v,
          fits: e.fits,
          peersAccept: e.peersAccept,
          checked: e.checked,
        })
      }
  })
  it('drift count per package against next', () => {
    for (const [key, row] of Object.entries(expected.matrix))
      expect({ key, n: run.external[NEXT]?.[key]?.drift.length }).toEqual({ key, n: row.driftToNext })
  })
  it('control: same symbols checked on every version; misses differ only by type-only imports', () => {
    const typeOnlyExtra: Record<string, number> = {
      'npm:@open-mercato/documents@0.9.0 0.7.0': 1,
      'npm:@open-mercato/enterprise@0.9.0 0.7.0': 2,
      'npm:@open-mercato/events@0.9.0 0.7.0': 1,
    }
    for (const [key, byVersion] of Object.entries(expected.negativeControl))
      for (const [v, e] of Object.entries(byVersion)) {
        const c = run.control[v]?.[key]
        expect({ key, v, checked: c?.checked, issues: c?.missing.length }).toEqual({
          key,
          v,
          checked: e.checked,
          issues: e.issues + (typeOnlyExtra[`${key} ${v}`] ?? 0),
        })
      }
  })
})
