import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Radar, Receipt } from '../../lib/schema/index.ts'
import type { FitCell, Receipt as ReceiptT, Surface } from '../../lib/schema/index.ts'
import { buildRadar, latestReceipts, missingKey, sameFailure } from '../../lib/fit/radar.ts'
import { DATA_FIXTURE } from './helpers.ts'

const consentsReceipts = readFileSync(
  join(DATA_FIXTURE, 'receipts', '@piotrkarwatka', 'marketing-consents.jsonl'),
  'utf8',
)
  .split('\n')
  .filter(Boolean)
  .map((l) => Receipt.parse(JSON.parse(l)))
const broken = consentsReceipts[1] as ReceiptT

const NEXT = '0.10.1-develop.2'
// a classic realistic receipt of the `next` snapshot (the main verdict)
const onNext = (locator: string, at: string, attempt = 1): ReceiptT => ({
  ...broken,
  module: { ...(broken.module as NonNullable<ReceiptT['module']>), locator },
  om: { ...broken.om, line: 'next', version: NEXT, preset: 'classic' },
  run: { ...broken.run, at, attempt },
})

const cell = (over: Partial<FitCell>): FitCell => ({
  status: 'ok',
  checked: 1,
  missing: [],
  drift: [],
  declared: { range: null, kind: 'missing', satisfied: true },
  hostDuplicates: [],
  ...over,
})

const surface: Surface = {
  schemaVersion: 1,
  generatedAt: '2026-10-23T00:00:00Z',
  base: '0.9.0',
  externalPackages: 2,
  symbols: [],
}

describe('radar', () => {
  it('formats missing keys', () => {
    expect(missingKey({ pkg: '@open-mercato/ui', subpath: '.', symbol: 'A.B', kind: 'symbol' })).toBe(
      '@open-mercato/ui#A',
    )
    expect(missingKey({ pkg: '@open-mercato/ui', subpath: 'x/y', symbol: null, kind: 'subpath' })).toBe(
      '@open-mercato/ui/x/y',
    )
    expect(missingKey({ pkg: '@open-mercato/ui', subpath: '.', symbol: null, kind: 'subpath' })).toBe(
      '@open-mercato/ui',
    )
  })

  it('keeps the latest receipt per module on next and groups the same failure in 3 modules', () => {
    const rs = [
      onNext('npm:@a/one', '2026-10-20T00:00:00Z'),
      onNext('npm:@a/one', '2026-10-21T00:00:00Z', 2),
      onNext('npm:@a/two', '2026-10-21T00:00:00Z'),
    ]
    const latest = latestReceipts([...rs, broken], 'next')
    expect([...latest.keys()].sort()).toEqual(['npm:@a/one', 'npm:@a/two'])
    expect(latest.get('npm:@a/one')?.run.attempt).toBe(2)
    expect(sameFailure(latest)).toEqual([])
    const three = latestReceipts([...rs, onNext('npm:@a/three', '2026-10-21T00:00:00Z')], 'next')
    const sf = sameFailure(three)
    expect(sf).toHaveLength(1)
    expect(sf[0]).toMatchObject({ step: 'typecheck', modules: ['npm:@a/one', 'npm:@a/three', 'npm:@a/two'] })
  })

  describe('sameFailure reads the receipts of the main verdict on this snapshot (audit R8)', () => {
    const AT = '2026-10-21T00:00:00Z'
    const LOCS = ['npm:@a/one', 'npm:@a/three', 'npm:@a/two']
    const radarOf = (receipts: ReceiptT[], version: (loc: string) => string | null = () => '0.1.0') =>
      buildRadar({
        generatedAt: '2026-10-23T00:00:00.000Z',
        base: '0.9.0',
        next: NEXT,
        surface,
        receipts,
        modules: LOCS.map((locator) => ({ locator, version: version(locator), next: cell({}), latest: null })),
      })
    const three = LOCS.map((l) => onNext(l, AT))

    it('groups the same break of the snapshot in 3 modules', () => {
      expect(radarOf(three).sameFailure).toEqual([expect.objectContaining({ step: 'typecheck', modules: LOCS })])
    })

    it('an older snapshot does not group under a newer next', () => {
      const old = three.map((r) => ({ ...r, om: { ...r.om, version: '0.10.1-develop.1' } }))
      const r = radarOf(old)
      expect(r.sameFailure).toEqual([])
      expect(r.receiptsOnNext).toEqual({ verified: 0, broken: 0 })
    })

    it('a newer empty-preset or early-mode receipt does not replace the classic realistic one', () => {
      const green = (r: ReceiptT): ReceiptT => ({
        ...r,
        run: { ...r.run, at: '2026-10-22T00:00:00Z' },
        result: { ...r.result, status: 'verified', failedStep: null, alsoFailed: [] },
      })
      const empty = green({ ...(three[0] as ReceiptT), om: { ...(three[0] as ReceiptT).om, preset: 'empty' } })
      const early = green({ ...(three[1] as ReceiptT), harness: { ...(three[1] as ReceiptT).harness, mode: 'early' } })
      expect(radarOf([...three, empty, early]).sameFailure[0]?.modules).toEqual(LOCS)
    })

    it('a receipt of an outdated module version is left out', () => {
      const r = radarOf(three, (loc) => (loc === 'npm:@a/one' ? '0.2.0' : '0.1.0'))
      expect(r.sameFailure).toEqual([])
      expect(r.receiptsOnNext).toEqual({ verified: 0, broken: 2 })
    })
  })

  it('tells a removal on next from a miss that latest already had', () => {
    const r = buildRadar({
      generatedAt: '2026-10-23T00:00:00.000Z',
      base: '0.9.0',
      next: '0.10.1-develop.1',
      surface,
      receipts: [],
      modules: [
        {
          locator: 'npm:@a/old-miss',
          latest: cell({
            status: 'no-fit',
            missing: [{ pkg: '@open-mercato/shared', subpath: 'lib/x', symbol: null, kind: 'subpath' }],
          }),
          next: cell({
            status: 'no-fit',
            missing: [{ pkg: '@open-mercato/shared', subpath: 'lib/x', symbol: null, kind: 'subpath' }],
          }),
        },
        {
          locator: 'npm:@a/new-miss',
          latest: cell({}),
          next: cell({
            status: 'no-fit',
            missing: [{ pkg: '@open-mercato/shared', subpath: 'lib/y', symbol: 'Y', kind: 'symbol' }],
          }),
        },
      ],
    })
    expect(Radar.parse(r)).toEqual(r)
    expect(r.staticBreaks).toEqual([{ locator: 'npm:@a/new-miss', missing: ['@open-mercato/shared/lib/y#Y'] }])
    expect(r.changedApis).toEqual([
      { symbol: '@open-mercato/shared/lib/y#Y', change: 'removed', modules: ['npm:@a/new-miss'] },
    ])
    expect(r.summary.startsWith('1 of 2 modules')).toBe(true)
  })
})
