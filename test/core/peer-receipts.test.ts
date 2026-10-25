// A broken receipt of a cell that never installed a catalog library the package peers on judges the test, not the
// module (finding of 25 Oct: terminal-tracking and @freighttech/ui).
import { describe, expect, it } from 'vitest'
import { libraryPeers, withInstalledPeers } from '../../lib/core/entry.ts'
import { agentPolicy } from '../../lib/core/policy.ts'
import { fixtureEntry, LOC, loadFixture, NOW } from './helpers.ts'

const fx = loadFixture()
const catalog = [
  { locator: 'npm:@acme/ui', npm: '@acme/ui', kind: 'library' as const },
  { locator: 'npm:@acme/core-mod', npm: '@acme/core-mod', kind: 'module' as const },
]

describe('withInstalledPeers', () => {
  it('libraryPeers names the catalog libraries only, never a module peer or the package itself', () => {
    expect(
      libraryPeers('npm:@acme/x', { '@acme/ui': '^1.0.0', '@acme/core-mod': '^1.0.0', react: '^19' }, catalog),
    ).toEqual(['@acme/ui'])
    expect(libraryPeers('npm:@acme/ui', { '@acme/ui': '^1.0.0' }, catalog)).toEqual([])
    expect(libraryPeers('npm:@acme/x', null, catalog)).toEqual([])
  })

  it('a broken cell without the library reads as our test app failing; one that installed it keeps its verdict', () => {
    const receipts = fx.receipts(LOC.consents)
    const broken = receipts.filter((r) => r.result.status === 'broken')
    expect(broken.length).toBeGreaterThan(0)
    const read = withInstalledPeers(receipts, ['@acme/ui'])
    for (const r of read) {
      const was = receipts.find((x) => x.id === r.id)!
      if (was.result.status === 'broken') {
        expect(r.result.status).toBe('harness-red')
        expect(r.result.classification).toBe('harness-red')
        expect(r.transition.to).toBe('harness-red')
        // the steps stay as the run wrote them
        expect(r.steps).toEqual(was.steps)
      } else expect(r).toBe(was)
    }
    const installed = receipts.map((r) => ({ ...r, requiresInstalled: [...r.requiresInstalled, 'lib:@acme/ui@1.2.0'] }))
    expect(withInstalledPeers(installed, ['@acme/ui']).map((r) => r.result.status)).toEqual(
      installed.map((r) => r.result.status),
    )
    expect(withInstalledPeers(receipts, [])).toEqual(receipts)
  })

  it('the line is not judged and an agent does not refuse for a break the test caused', () => {
    const receipts = withInstalledPeers(fx.receipts(LOC.consents), ['@acme/ui'])
    const before = fixtureEntry(fx, LOC.consents)
    const after = fixtureEntry(fx, LOC.consents, { receipts })
    expect(before.agentPolicy['0.9']?.decision).toBe('refuse')
    expect(after.compat.lines['0.9']?.status).toBe('harness-red')
    expect(after.agentPolicy['0.9']?.decision).not.toBe('refuse')
    expect(agentPolicy(after, '0.9', undefined, { now: NOW }).reasons.map((r) => r.code)).not.toContain('BROKEN')
  })
})
