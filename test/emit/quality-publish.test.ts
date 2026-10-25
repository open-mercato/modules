// Finding of 25 Oct (F04): the emitter published health.quality as it stood after the last `yarn om health`, so a
// revocation merged into quality/ (or an expiry) stayed on the site until the next scheduled watch. It now publishes
// the seal only for the judged version, before `until`, and not in quality/revocations.yml of the checkout.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEmit } from '../../lib/emit/index.ts'
import { loadEmitData } from '../../lib/emit/load.ts'
import { publishedQuality } from '../../lib/emit/modules-json.ts'
import type { Health } from '../../lib/schema/data/index.ts'
import type { ModulesIndex } from '../../lib/schema/published/modules.ts'
import { DATA, DESCRIPTORS, json, OPTS, POLICY, ROOT, fixtureData } from './helpers.ts'

const KSEF = 'npm:@fastwhitecat/integration-ksef-direct'
const SEAL = {
  version: '0.1.8',
  integrity: 'sha512-x',
  reviewedAt: '2026-10-20',
  until: '2027-10-20',
  report: 'https://github.com/open-mercato/modules/issues/1',
  reviewers: ['alice', 'bob'],
}

function emitWith(quality: Health['quality'], revocations?: string) {
  let dir: string | null = null
  if (revocations !== undefined) {
    dir = mkdtempSync(join(tmpdir(), 'om-quality-emit-'))
    writeFileSync(join(dir, 'revocations.yml'), revocations)
  }
  try {
    const data = dir
      ? loadEmitData({
          data: DATA,
          modules: DESCRIPTORS,
          policy: POLICY,
          skills: join(ROOT, 'test', 'emit', 'no-skills'),
          root: ROOT,
          quality: dir,
        })
      : fixtureData()
    const h = data.health.get(KSEF)!
    expect(h.tier).toBe('verified')
    data.health.set(KSEF, { ...h, quality })
    const index = json<ModulesIndex>(buildEmit(data, OPTS), 'modules.json')
    return index.entries.find((e) => e.locator === KSEF)!.quality
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

describe('OM Quality on the next publish', () => {
  it('a valid seal of the judged version is published', () => {
    expect(emitWith(SEAL)).toEqual({ version: '0.1.8', until: '2027-10-20', report: SEAL.report })
  })

  it('an expired seal or one of another version is not', () => {
    expect(emitWith({ ...SEAL, until: '2026-10-22' })).toBeNull()
    expect(emitWith({ ...SEAL, version: '0.1.7' })).toBeNull()
  })

  it('a revocation in quality/revocations.yml drops it before health runs again', () => {
    const revoked = `- { locator: "${KSEF}", version: 0.1.8, reason: Leaked a key., at: 2026-10-22 }\n`
    expect(emitWith(SEAL, revoked)).toBeNull()
    expect(emitWith(SEAL, '[]\n')).not.toBeNull()
  })

  it('publishedQuality needs Verified', () => {
    const h = { tier: 'listed', quality: SEAL } as unknown as Health
    expect(publishedQuality(h, '0.1.8', KSEF, [], OPTS.now)).toBeNull()
  })
})
