// Finding of 25 Oct: the agent refused mercato-readiness-scanner (`npx mercato-readiness-scanner@0.2.2`) until 27 Oct
// over Yarn's 5-day age gate, which npx never applies, and every tool, library and provider read `Not yet tested in a
// new app on 0.9`, a test the nightly run never makes (spec 5.3: it installs `kind: module` rows only).
import { describe, expect, it } from 'vitest'
import { agentPolicy, catalogSkipText } from '../../lib/core/policy.ts'
import { runsWithNpx } from '../../lib/core/lines.ts'
import { packageCommand } from '../../lib/core/plan.ts'
import { SyncRecord } from '../../lib/schema/data/sync.ts'
import type { Descriptor } from '../../lib/schema/descriptor.ts'
import { fixtureEntry, LOC, loadFixture, NOW } from './helpers.ts'

const fx = loadFixture()

/** durable-work turned into a package without a module: one release on 21 Oct, inside the age gate until 26 Oct. */
function packageOf(kind: 'tool' | 'library' | 'provider', tags: string[]) {
  const d = structuredClone(fx.descriptors.get(LOC.durable) as Descriptor)
  d.kind = kind
  d.tags = tags
  const sync = structuredClone(fx.sync(LOC.durable) as SyncRecord)
  const n = sync.npm!
  n.previousStable = null
  n.latestStable = '0.7.0'
  n.distTags = { latest: '0.7.0' }
  n.publishedAt = { '0.7.0': '2026-10-21T10:00:00Z' }
  return fixtureEntry(fx, LOC.durable, { descriptor: d, sync: SyncRecord.parse(sync), receipts: [] })
}

describe('runsWithNpx', () => {
  it('is a tool tagged cli, as the install command says', () => {
    expect(runsWithNpx({ kind: 'tool', tags: ['cli', 'security'] })).toBe(true)
    expect(runsWithNpx({ kind: 'tool', tags: ['dev-only'] })).toBe(false)
    expect(runsWithNpx({ kind: 'library', tags: ['cli'] })).toBe(false)
    expect(packageCommand({ kind: 'tool', tags: ['cli'] }, 'x@1.0.0')).toBe('npx x@1.0.0')
    expect(packageCommand({ kind: 'tool', tags: [] }, 'x@1.0.0')).toBe('yarn add x@1.0.0')
  })
})

describe('a tool that runs with npx', () => {
  const e = packageOf('tool', ['cli', 'security'])

  it('is installable from its publish day: no age gate, no QUARANTINE, no refuse', () => {
    expect(e.version.installableFrom).toBe('2026-10-21')
    expect(e.install.cli).toBe('npx @fullstackhouse/open-mercato-durable-work@0.7.0')
    for (const line of ['0.9', '0.8', 'next']) {
      const p = e.agentPolicy[line]!
      expect(p.decision, line).toBe('ask')
      expect(p.reasons.map((r) => r.code)).not.toContain('QUARANTINE')
      expect(p.until).toBeUndefined()
    }
  })

  it('says why the catalog never installs it, not that a test is coming', () => {
    expect(e.signals.receipt['0.9']).toBe('skipped')
    const texts = e.agentPolicy['0.9']!.reasons.map((r) => r.text)
    expect(texts).toContain('Not installed by the catalog: the nightly run installs modules, not tools.')
    expect(texts.join(' ')).not.toMatch(/Not yet tested/)
  })

  it('the bare IndexEntry gives the same policy (MCP recomputes from modules.json)', () => {
    const p = agentPolicy(e, '0.9', undefined, { now: NOW })
    expect(p.decision).toBe('ask')
    expect(p.reasons.map((r) => r.code)).not.toContain('QUARANTINE')
  })
})

describe('packages the app installs with yarn keep the gate', () => {
  it('a tool without the cli tag (yarn add) refuses until the gate opens', () => {
    const e = packageOf('tool', ['dev-only'])
    expect(e.version.installableFrom).toBe('2026-10-26')
    const p = e.agentPolicy['0.9']!
    expect(p.decision).toBe('refuse')
    expect(p.reasons[0]).toMatchObject({ code: 'QUARANTINE', text: 'Installs from 26 Oct (Yarn 5-day age gate).' })
    expect(p.reasons.map((r) => r.text)).toContain(
      'Not installed by the catalog: the nightly run installs modules, not tools.',
    )
  })

  it('a library and a provider name their kind', () => {
    expect(packageOf('library', []).agentPolicy['0.9']!.reasons.map((r) => r.text)).toContain(
      'Not installed by the catalog: the nightly run installs modules, not libraries.',
    )
    expect(packageOf('provider', []).agentPolicy['0.9']!.reasons.map((r) => r.text)).toContain(
      'Not installed by the catalog: the nightly run installs modules, not providers.',
    )
  })
})

describe('catalogSkipText', () => {
  it('is null for a module, and names the license of the enterprise bundle', () => {
    expect(catalogSkipText({ kind: 'module' })).toBeNull()
    expect(catalogSkipText({ kind: 'module', enterprise: true })).toBe(
      'Not installed by the catalog: commercial license.',
    )
  })
})
