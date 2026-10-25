// Finding of 25 Oct (F01): OSV is queried with the exact version the catalog lists, so every advisory of the sync
// affects that version. `fixedIn` names a release with the fix (another major, a prerelease); it never closes the
// advisory for the listed version in Supply chain, LST-5 or the agent policy.
import { describe, expect, it } from 'vitest'
import { agentPolicy } from '../../lib/core/policy.ts'
import { supplyChainSignal } from '../../lib/core/signals.ts'
import { listedRules } from '../../lib/core/tier.ts'
import type { SyncRecord } from '../../lib/schema/data/sync.ts'
import type { IndexEntry } from '../../lib/schema/published/modules.ts'
import { toAdvisory } from '../../lib/sources/osv.ts'
import { fixtureEntries, LOC, loadFixture, NOW } from './helpers.ts'

const fx = loadFixture()
type Advisory = SyncRecord['advisories'][number]

function withAdvisories(loc: string, advisories: Advisory[]): SyncRecord {
  const s = structuredClone(fx.sync(loc) as SyncRecord)
  s.advisories = advisories
  return s
}

const old = (id: string, severity: Advisory['severity'], fixedIn: string | null): Advisory => ({
  id,
  severity,
  publishedAt: '2026-08-01T00:00:00Z',
  fixedIn,
})

describe('an advisory with a fix elsewhere still affects the listed version (F01)', () => {
  it('Supply chain fails on a high advisory older than 30 days and names the fix', () => {
    const s = withAdvisories(LOC.ksef, [old('GHSA-aaaa-bbbb-cccc', 'high', '2.0.0')])
    expect(supplyChainSignal(s, null, NOW)).toEqual({
      status: 'fail',
      reasons: ['Open high advisory GHSA-aaaa-bbbb-cccc for more than 30 days (fixed in 2.0.0).'],
    })
  })

  it('Supply chain warns on a fresh critical and a moderate advisory with a fix', () => {
    const s = withAdvisories(LOC.ksef, [
      { ...old('GHSA-1', 'critical', '1.0.1'), publishedAt: '2026-10-20T00:00:00Z' },
      old('GHSA-2', 'moderate', '1.0.2'),
    ])
    expect(supplyChainSignal(s, null, NOW)).toEqual({
      status: 'warn',
      reasons: ['Open critical advisory GHSA-1 (fixed in 1.0.1).', 'Open moderate advisory GHSA-2 (fixed in 1.0.2).'],
    })
  })

  it('LST-5 fails on a critical advisory with fixedIn set', () => {
    const rules = listedRules({
      source: 'npm',
      type: '3rd-party',
      descriptorIssues: [],
      sync: withAdvisories(LOC.ksef, [old('GHSA-crit', 'critical', '2.0.0')]),
      facts: null,
      kind: 'module',
      license: { spdx: 'MIT', kind: 'osi', mismatch: false },
    })
    expect(rules.find((r) => r.id === 'LST-5')).toEqual({
      id: 'LST-5',
      pass: false,
      detail: 'Open critical advisory GHSA-crit (fixed in 2.0.0).',
    })
  })

  it('agentPolicy refuses with ADVISORY when the advisory has a fix', () => {
    const e = structuredClone(fixtureEntries(fx).find((x) => x.locator === LOC.stripe) as IndexEntry)
    const p = agentPolicy(
      { ...e, advisories: [{ id: 'GHSA-xxxx-yyyy-zzzz', severity: 'high', fixedIn: '2.0.0' }] },
      '0.9',
      undefined,
      { now: NOW },
    )
    expect(p.decision).toBe('refuse')
    expect(p.reasons[0]).toEqual({
      code: 'ADVISORY',
      text: 'Open high severity advisory GHSA-xxxx-yyyy-zzzz (fixed in 2.0.0).',
    })
  })
})

describe('toAdvisory names the fix of the queried version', () => {
  const vuln = {
    id: 'GHSA-x',
    published: '2026-08-01T00:00:00Z',
    database_specific: { severity: 'HIGH' },
    affected: [
      {
        package: { ecosystem: 'npm', name: 'pkg' },
        ranges: [{ events: [{ introduced: '0' }, { fixed: '1.4.2' }, { introduced: '2.0.0' }, { fixed: '2.1.0' }] }],
      },
    ],
  }
  it('a fix on 1.x does not stand for a vulnerable 2.0.3', () => {
    expect(toAdvisory(vuln, 'pkg', '2.0.3').fixedIn).toBe('2.1.0')
    expect(toAdvisory(vuln, 'pkg', '1.0.0').fixedIn).toBe('1.4.2')
  })
  it('no fix above the queried version gives null', () => {
    expect(toAdvisory(vuln, 'pkg', '3.0.0').fixedIn).toBeNull()
  })
})
