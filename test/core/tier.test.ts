// Levels (6.3), version.recommended (D46) and the quarantine cases of 5.3 on fixture data.
import { describe, expect, it } from 'vitest'
import { evaluateEntry, judgedFacts, judgedVersions } from '../../lib/core/health.ts'
import { cellSummary, decisiveReceipt, recommendedVersions, resolveLine } from '../../lib/core/lines.ts'
import {
  listedRules,
  newestInstallable,
  tierFrom,
  TIER_RULES,
  verifiedRules,
  VER5_NOT_READ,
} from '../../lib/core/tier.ts'
import type { Receipt, SyncRecord } from '../../lib/schema/data/index.ts'
import { Receipt as ReceiptSchema } from '../../lib/schema/data/index.ts'
import { durableGatedRelease, fixtureEntry, LOC, loadFixture, NOW, type Fixture } from './helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines

function evaluate(loc: string, o: { sync?: SyncRecord | null; receipts?: Receipt[]; now?: string } = {}) {
  return evaluateEntry(evaluateInput(loc, o))
}

function evaluateInput(
  loc: string,
  o: { sync?: SyncRecord | null; receipts?: Receipt[]; now?: string } = {},
): Parameters<typeof evaluateEntry>[0] {
  const sync = o.sync !== undefined ? o.sync : fx.sync(loc)
  const receipts = o.receipts ?? fx.receipts(loc)
  const now = o.now ?? NOW
  // facts and Fit of the judged version only, as `yarn om health` loads them (no copying between versions)
  const judged = judgedFacts({ locator: loc, sync, receipts, lines, now }, (v) => fx.facts(loc, v))
  return {
    locator: loc,
    descriptor: fx.descriptors.get(loc) ?? null,
    descriptorIssues: [],
    sync,
    facts: judged.facts,
    fit: fx.fit(loc, judged.version),
    receipts,
    lines,
    claims: fx.claims,
    now,
  }
}

/** A copy of a fixture receipt with changes (validated). */
function receipt(base: Receipt, patch: (r: Receipt) => void): Receipt {
  const r = structuredClone(base)
  patch(r)
  return ReceiptSchema.parse(r)
}

/** ksef with a new release 0.1.9 published `hoursAgo` hours before `now`. */
function ksefWithRelease(fxx: Fixture, publishedAt: string): SyncRecord {
  const s = structuredClone(fxx.sync(LOC.ksef) as SyncRecord)
  const n = s.npm!
  n.previousStable = '0.1.8'
  n.latestStable = '0.1.9'
  n.distTags = { latest: '0.1.9' }
  n.publishedAt = { '0.1.9': publishedAt, '0.1.8': '2026-10-15T09:45:06Z' }
  return s
}

// the receipt of a new app (classic), the main verdict since 24 Oct
const ksef09 = () => fx.receipts(LOC.ksef).find((r) => r.om.line === '0.9' && r.om.preset === 'classic') as Receipt

describe('newestInstallable per line (E5)', () => {
  const sync = {
    npm: {
      name: '@open-mercato/events',
      latestStable: '0.9.0',
      previousStable: '0.8.0',
      publishedAt: { '0.9.0': '2026-10-09T00:00:00Z', '0.8.0': '2026-09-01T00:00:00Z' },
    },
  } as unknown as Parameters<typeof newestInstallable>[0]
  const line08 = { key: '0.8', version: '0.8.0', source: 'previous' as const, preapproved: ['@open-mercato/*'] }
  const now = '2026-10-23T00:00:00Z'
  // a community package whose versions are not the line's Open Mercato version (no lockstep release)
  const community = {
    npm: {
      name: '@x/module',
      latestStable: '1.1.0',
      previousStable: '1.0.0',
      publishedAt: { '1.1.0': '2026-10-09T00:00:00Z', '1.0.0': '2026-09-01T00:00:00Z' },
    },
  } as unknown as Parameters<typeof newestInstallable>[0]
  it('picks the newest candidate that is not no-fit on the line', () => {
    expect(newestInstallable(sync, line08, now)).toBe('0.9.0')
    expect(newestInstallable(sync, line08, now, (v) => (v === '0.9.0' ? 'no-fit' : 'ok'))).toBe('0.8.0')
    expect(newestInstallable(community, line08, now, (v) => (v === '1.1.0' ? 'drift' : 'ok'))).toBe('1.1.0')
  })
  it('evaluateEntry judges each line on its own version: lockstep official 0.8.0 on 0.8 (gateway-stripe)', () => {
    const base = evaluateInput(LOC.stripe)
    const f09 = base.fit['0.9']!
    const fitOf = (v: string, line: string) =>
      line === '0.8'
        ? { ...f09, status: v === '0.8.0' ? ('ok' as const) : ('no-fit' as const) }
        : v === '0.9.0'
          ? (base.fit[line] ?? null)
          : null
    const ev = evaluateEntry({ ...base, fitOf })
    expect(ev.health.evaluated).toEqual({ '0.9': '0.9.0', '0.8': '0.8.0', next: '0.9.0' })
    expect(ev.health.signals.fit).toEqual({ '0.9': 'ok', '0.8': 'ok', next: base.fit.next?.status ?? 'unknown' })
    expect(ev.installableVersions['0.8']).toBe('0.8.0')
    expect(ev.health.agentPolicy['0.8']?.consentText).toBe('Install @open-mercato/gateway-stripe@0.8.0')
    // without fitOf: one judged version for every line, as before E5
    expect(evaluateEntry(base).health.evaluated?.['0.8']).toBe('0.9.0')
  })
  it('a fitting candidate whose peers accept the line wins over a newer one built for another line', () => {
    const cell = (status: 'ok' | 'drift', satisfied: boolean) => ({ status, declared: { satisfied } })
    expect(
      newestInstallable(community, line08, now, (v) => (v === '1.1.0' ? cell('drift', false) : cell('ok', true))),
    ).toBe('1.0.0')
    // no candidate's peers accept the line: the newest that fits, as before
    expect(newestInstallable(community, line08, now, () => cell('drift', false))).toBe('1.1.0')
    // both accept it: the newest
    expect(newestInstallable(community, line08, now, () => cell('ok', true))).toBe('1.1.0')
    // a no-fit candidate never wins, its peers aside
    expect(
      newestInstallable(community, line08, now, (v) =>
        v === '1.0.0' ? { status: 'no-fit' as const, declared: { satisfied: true } } : cell('drift', false),
      ),
    ).toBe('1.1.0')
  })
  it('the lockstep release of the line wins when it fits (storage-s3, telemetry, channel-discord 0.8.0 on 0.8)', () => {
    // 0.9.0 only drifts on 0.8; telemetry has no Open Mercato peers, so its peers say nothing about the line
    const missing = (status: 'ok' | 'drift') => ({ status, declared: { satisfied: true } })
    expect(newestInstallable(sync, line08, now, (v) => (v === '0.9.0' ? missing('drift') : missing('ok')))).toBe(
      '0.8.0',
    )
    expect(newestInstallable(sync, line08, now, (v) => (v === '0.9.0' ? 'drift' : 'ok'))).toBe('0.8.0')
    // a lockstep release that does not fit stays out
    expect(newestInstallable(sync, line08, now, (v) => (v === '0.8.0' ? 'no-fit' : 'drift'))).toBe('0.9.0')
  })
  it('a candidate without Fit counts as fitting; when every candidate is no-fit the newest stays', () => {
    expect(newestInstallable(community, line08, now, (v) => (v === '1.1.0' ? null : 'ok'))).toBe('1.1.0')
    expect(newestInstallable(sync, line08, now, () => 'no-fit')).toBe('0.9.0')
  })
})

describe('version.recommended (D46)', () => {
  it.each([
    [LOC.ksef, { '0.9': '0.1.8', '0.8': null, next: '0.1.8' }],
    [LOC.stripe, { '0.9': '0.9.0', '0.8': null, next: null }],
    [LOC.durable, { '0.9': '0.6.0', '0.8': null, next: null }],
    [LOC.consents, { '0.9': null, '0.8': null, next: null }],
    [LOC.datasync, { '0.9': null, '0.8': null, next: null }],
    [LOC.tpay, { '0.9': null, '0.8': null, next: null }],
    [LOC.treg, { '0.9': null, '0.8': null, next: null }],
  ])('%s', (loc, want) => {
    expect(evaluate(loc).version.recommended).toEqual(want)
  })

  it('ignores a version still in the age gate, harness-red, infra-error and an unconfirmed broken', () => {
    const base = ksef09()
    const young = receipt(base, (r) => {
      r.module!.version = '0.1.9'
      r.run.at = '2026-10-23T02:20:00Z'
    })
    const harness = receipt(base, (r) => {
      r.result.status = 'harness-red'
      r.result.classification = 'harness-red'
      r.run.at = '2026-10-24T02:17:00Z'
    })
    const unconfirmed = receipt(base, (r) => {
      r.result.status = 'broken'
      r.result.classification = 'module-fail'
      r.transition = { from: 'verified', to: 'broken', confirmed: false }
      r.run.at = '2026-10-25T02:17:00Z'
    })
    const rec = recommendedVersions({
      lines,
      receipts: [base, young, harness, unconfirmed],
      npm: '@fastwhitecat/integration-ksef-direct',
      publishedAt: { '0.1.8': '2026-10-15T09:45:06Z', '0.1.9': '2026-10-22T09:00:00Z' },
      now: '2026-10-25T03:00:00Z',
    })
    expect(rec['0.9']).toBe('0.1.8')
    expect(decisiveReceipt([base, harness, unconfirmed], '0.9', '0.1.8')?.result.status).toBe('verified')
  })
})

describe('Verified and the quarantine (5.3, 6.3, D46)', () => {
  it('a release in the age gate next to a verified recommended keeps Verified, the command and the policy', () => {
    const now = '2026-10-23T03:05:00Z'
    const sync = ksefWithRelease(fx, '2026-10-22T12:00:00Z')
    const q = receipt(ksef09(), (r) => {
      r.module!.version = '0.1.9'
      r.steps = []
      r.result = {
        status: 'quarantine',
        failedStep: null,
        alsoFailed: [],
        classification: 'quarantine',
        quarantineUntil: '2026-10-27',
      }
      r.transition = { from: null, to: 'quarantine', confirmed: true }
      r.run.at = '2026-10-23T02:30:00Z'
    })
    const receipts = [...fx.receipts(LOC.ksef), q]
    const ev = evaluate(LOC.ksef, { sync, receipts, now })
    expect(ev.health.tier).toBe('verified')
    expect(ev.version.recommended['0.9']).toBe('0.1.8')
    expect(ev.cells['0.9']?.status).toBe('quarantine')
    expect(ev.version.installableFrom).toBe('2026-10-27')
    expect(ev.health.agentPolicy['0.9']).toEqual({
      decision: 'ask',
      reasons: [{ code: 'THIRD_PARTY', text: "Third-party code runs with access to all tenants' data." }],
      consentText: 'Install @fastwhitecat/integration-ksef-direct@0.1.8',
    })
    const e = fixtureEntry(fx, LOC.ksef, { sync, receipts, now })
    expect(e.install.cli).toBe(
      'yarn mercato module add @fastwhitecat/integration-ksef-direct@0.1.8 --allow-third-party',
    )
    expect(e.tier).toBe('verified')
  })

  it('a release in the age gate without facts, Fit or receipts keeps Verified (facts of the install version)', () => {
    // review round 2: only 0.6.0 has facts and Fit; nothing is copied to 0.7.0
    const sync = durableGatedRelease(fx)
    const input = evaluateInput(LOC.durable, { sync })
    expect(judgedVersions(input)).toEqual(['0.6.0', '0.7.0'])
    expect(input.facts?.package.version).toBe('0.6.0')
    expect(fx.facts(LOC.durable, '0.7.0')).toBeNull()
    const ev = evaluateEntry(input)
    expect(ev.health.tier).toBe('verified')
    expect(ev.listed).toBe(true)
    expect(ev.version.recommended['0.9']).toBe('0.6.0')
    expect(ev.health.rules.filter((r) => !r.pass)).toEqual([])
    expect(ev.health.signals.receipt['0.9']).toBe('verified')
    expect(ev.health.agentPolicy['0.9']?.consentText).toBe('Install @fullstackhouse/open-mercato-durable-work@0.6.0')
    // negative control: facts and Fit of the gated release (round 1 command) drop the entry
    const gated = evaluateEntry({ ...input, facts: fx.facts(LOC.durable, '0.7.0'), fit: fx.fit(LOC.durable, '0.7.0') })
    expect(gated.listed).toBe(false)
    expect(gated.health.tier).toBeNull()
    // once 0.7.0 is past the gate but untested, recommended 0.6.0 still counts and is still judged
    const later = evaluateInput(LOC.durable, { sync, now: '2026-10-27T01:00:00Z' })
    expect(judgedVersions(later)[0]).toBe('0.6.0')
    expect(evaluateEntry(later).health.tier).toBe('verified')
  })

  it('judgedFacts falls back to an older release when the install version has no facts yet', () => {
    const sync = durableGatedRelease(fx)
    const i = { locator: LOC.durable, sync, receipts: [], lines, now: NOW }
    // no receipts: no recommended, install version = 0.6.0 (newest past the gate)
    expect(judgedVersions(i)).toEqual(['0.6.0', '0.7.0'])
    const only07 = judgedFacts(i, (v) => (v === '0.7.0' ? fx.facts(LOC.durable, '0.6.0') : null))
    expect(only07.version).toBe('0.7.0')
    expect(judgedFacts(i, () => null)).toEqual({ version: '0.6.0', facts: null })
  })

  it('after the gate and before the first night, recommended still counts', () => {
    const sync = ksefWithRelease(fx, '2026-10-22T12:00:00Z')
    const ev = evaluate(LOC.ksef, { sync, now: '2026-10-28T01:00:00Z' })
    expect(ev.health.tier).toBe('verified')
    expect(ev.health.rules.find((r) => r.id === 'VER-1')?.detail).toBe('Receipt on 0.9: verified (0.1.8).')
  })

  it('a confirmed broken on the newest installable version takes Verified away', () => {
    const sync = ksefWithRelease(fx, '2026-10-15T12:00:00Z')
    const broken = receipt(ksef09(), (r) => {
      r.module!.version = '0.1.9'
      r.result = {
        status: 'broken',
        failedStep: 'typecheck',
        alsoFailed: [],
        classification: 'module-fail',
        quarantineUntil: null,
      }
      r.transition = { from: null, to: 'broken', confirmed: true }
      r.run.at = '2026-10-23T02:40:00Z'
    })
    const ev = evaluate(LOC.ksef, { sync, receipts: [...fx.receipts(LOC.ksef), broken] })
    expect(ev.health.tier).toBe('listed')
    expect(ev.version.recommended['0.9']).toBe('0.1.8')
  })

  it('an official release younger than 5 days has no quarantine and keeps Verified', () => {
    const s = structuredClone(fx.sync(LOC.stripe) as SyncRecord)
    s.npm!.previousStable = '0.9.0'
    s.npm!.latestStable = '0.9.1'
    s.npm!.publishedAt = { '0.9.1': '2026-10-22T10:00:00Z', '0.9.0': '2026-10-09T19:25:40Z' }
    const ev = evaluate(LOC.stripe, { sync: s })
    expect(ev.version.installableFrom).toBe('2026-10-22')
    expect(ev.health.tier).toBe('verified')
    for (const p of Object.values(ev.health.agentPolicy))
      expect(p.reasons.map((r) => r.code)).not.toContain('QUARANTINE')
  })

  it('a receipt older than 14 days or a red baseline does not count', () => {
    expect(evaluate(LOC.ksef, { now: '2026-11-06T02:00:00Z' }).health.tier).toBe('verified')
    const old = evaluate(LOC.ksef, { now: '2026-11-06T03:00:00Z' })
    expect(old.health.tier).toBe('listed')
    expect(old.health.rules.find((r) => r.id === 'VER-1')?.detail).toMatch(/verified 14 days ago \(max 14\)/)
    const redBase = fx
      .receipts(LOC.ksef)
      .map((r) => receipt(r, (x) => void (x.baseline = { status: 'harness-red', receipt: null })))
    expect(evaluate(LOC.ksef, { receipts: redBase }).health.tier).toBe('listed')
  })

  it('hold and delisted have no level; a failed LST rule has no level', () => {
    const rules = [...TIER_RULES.map((r) => ({ id: r.id, pass: true, detail: '' }))]
    expect(tierFrom(rules, 'active', false)).toBe('verified')
    expect(tierFrom(rules, 'hold', false)).toBeNull()
    expect(tierFrom(rules, 'delisted', false)).toBeNull()
    expect(tierFrom(rules, 'active', true)).toBeNull()
    expect(
      tierFrom(
        rules.map((r) => (r.id === 'LST-2' ? { ...r, pass: false } : r)),
        'active',
        false,
      ),
    ).toBeNull()
    expect(
      tierFrom(
        rules.map((r) => (r.id === 'VER-3' ? { ...r, pass: false } : r)),
        'active',
        false,
      ),
    ).toBe('listed')
  })

  it('LST-2: deprecated and stable-less third-party packages fail, official previews pass', () => {
    const s = structuredClone(fx.sync(LOC.ksef) as SyncRecord)
    s.npm!.deprecated = 'use something else'
    const base = {
      source: 'npm' as const,
      descriptorIssues: [],
      facts: null,
      kind: 'module' as const,
      license: { spdx: 'MIT', kind: 'osi' as const, mismatch: false },
    }
    expect(listedRules({ ...base, type: '3rd-party', sync: s }).find((r) => r.id === 'LST-2')?.pass).toBe(false)
    expect(
      listedRules({ ...base, type: 'official', sync: fx.sync(LOC.tpay) }).find((r) => r.id === 'LST-2')?.pass,
    ).toBe(true)
    const t = structuredClone(fx.sync(LOC.tpay) as SyncRecord)
    expect(listedRules({ ...base, type: '3rd-party', sync: t }).find((r) => r.id === 'LST-2')?.pass).toBe(false)
  })

  it('LST-3 without facts: an npm package fails until it is scanned, a GitHub entry without a tag passes', () => {
    const base = {
      descriptorIssues: [],
      facts: null,
      kind: 'module' as const,
      type: '3rd-party' as const,
      license: { spdx: 'MIT', kind: 'osi' as const, mismatch: false },
    }
    const lst3 = (r: ReturnType<typeof listedRules>) => r.find((x) => x.id === 'LST-3')
    expect(lst3(listedRules({ ...base, source: 'npm', sync: fx.sync(LOC.ksef) }))).toEqual({
      id: 'LST-3',
      pass: false,
      detail: 'Kind not confirmed: no facts yet.',
    })
    expect(lst3(listedRules({ ...base, source: 'github', sync: fx.sync(LOC.treg) }))?.pass).toBe(true)
    expect(lst3(listedRules({ ...base, source: 'github', sync: fx.sync(LOC.treg), githubTagged: true }))?.pass).toBe(
      false,
    )
    // an unscanned npm entry is not listed: no level
    const e = evaluate(LOC.durable, { now: NOW })
    expect(e.health.tier).toBe('verified')
    const unscanned = evaluateEntry({ ...evaluateInput(LOC.durable), facts: null })
    expect(unscanned.health.tier).toBeNull()
    expect(unscanned.listed).toBe(false)
  })

  it('E7: a GitHub-only module whose tag archive has no dist/modules fails LST-3 (client-auth stays off the list)', () => {
    const f = structuredClone(fx.facts(LOC.ksef, '0.1.8')!)
    f.gate = { ...f.gate, installable: false, reason: 'no dist/modules/client_auth' }
    const rules = listedRules({
      source: 'github',
      type: 'community',
      descriptorIssues: [],
      sync: fx.sync(LOC.treg),
      facts: f,
      kind: 'module',
      license: { spdx: 'MIT', kind: 'osi', mismatch: false },
      githubTagged: true,
    })
    expect(rules.find((r) => r.id === 'LST-3')).toEqual({
      id: 'LST-3',
      pass: false,
      detail: 'No src/modules and dist/modules pair: no dist/modules/client_auth',
    })
    expect(tierFrom(rules, 'active', false)).toBeNull()
  })

  it('VER-5: a repository.url that is not the descriptor repo fails', () => {
    const s = structuredClone(fx.sync(LOC.ksef) as SyncRecord)
    s.npm!.repositoryUrl = 'git+https://github.com/someone/else.git'
    const rules = verifiedRules({
      source: 'npm',
      npm: s.npm!.name,
      descriptorGithub: 'FastWhiteCat/openmercato-module-ksef',
      sync: s,
      receipts: fx.receipts(LOC.ksef),
      lines,
      recommended: { '0.9': '0.1.8' },
      githubVersion: null,
      signals: {
        receipt: { '0.9': 'verified' },
        fit: { '0.9': 'ok' },
        supplyChain: { status: 'ok', reasons: [] },
        hygiene: { status: 'ok', failing: [] },
      },
      now: NOW,
    })
    expect(rules.find((r) => r.id === 'VER-5')).toEqual({
      id: 'VER-5',
      pass: false,
      detail: 'Tarball repository.url is someone/else.',
    })
  })

  it('VER-5: no repository in the descriptor nor in the tarball is not checked, not a pass (finding of 25 Oct)', () => {
    const base = structuredClone(fx.sync(LOC.ksef) as SyncRecord)
    const ver5 = (repositoryUrl: string | null) => {
      const s = structuredClone(base)
      s.npm!.repositoryUrl = repositoryUrl
      const rules = verifiedRules({
        source: 'npm',
        npm: s.npm!.name,
        descriptorGithub: null,
        sync: s,
        receipts: fx.receipts(LOC.ksef),
        lines,
        recommended: { '0.9': '0.1.8' },
        githubVersion: null,
        signals: {
          receipt: { '0.9': 'verified' },
          fit: { '0.9': 'ok' },
          supplyChain: { status: 'ok', reasons: [] },
          hygiene: { status: 'ok', failing: [] },
        },
        now: NOW,
      })
      return { rule: rules.find((r) => r.id === 'VER-5'), tier: tierFrom(rules, 'active', false) }
    }
    const none = ver5(null)
    expect(none.rule).toEqual({
      id: 'VER-5',
      pass: false,
      detail: 'Not checked: neither the descriptor nor the tarball names a repository.',
    })
    expect(none.tier).toBe('listed')
    // a tarball that names its repository, with no descriptor repository to compare it to, keeps the pass
    for (const url of ['git+https://github.com/open-mercato/open-mercato.git', 'https://gitlab.com/acme/foo.git'])
      expect(ver5(url).rule).toEqual({
        id: 'VER-5',
        pass: true,
        detail: 'No repository in the descriptor to compare.',
      })
  })

  it('VER-5: a tarball the sync has not read is not claimed to name no repository (review of 25 Oct)', () => {
    const rules = verifiedRules({
      source: 'npm',
      npm: '@acme/never-synced',
      descriptorGithub: null,
      sync: null,
      receipts: [],
      lines,
      recommended: {},
      githubVersion: null,
      signals: {
        receipt: {},
        fit: {},
        supplyChain: { status: 'ok', reasons: [] },
        hygiene: { status: 'ok', failing: [] },
      },
      now: NOW,
    })
    expect(rules.find((r) => r.id === 'VER-5')).toEqual({ id: 'VER-5', pass: false, detail: VER5_NOT_READ })
    expect(VER5_NOT_READ).not.toContain('nor the tarball')
  })
})

describe('lines', () => {
  it.each([
    [undefined, '0.9', null],
    ['0.9.0', '0.9', null],
    ['0.9.3', '0.9', null],
    ['0.9', '0.9', null],
    ['next', 'next', null],
    ['0.10.1-develop.7583.1.0c886d0a14', 'next', null],
    ['0.10.1-develop.9999.1.abc', 'next', null],
    ['^0.8.0', '0.8', null],
    ['0.7.0', null, 'Line 0.7 is not tested by the catalog.'],
    ['banana', null, 'Unknown Open Mercato version.'],
  ])('resolveLine(%s)', (v, line, note) => {
    const r = resolveLine(v, lines)
    expect(r.line).toBe(line)
    expect(r.note).toBe(note)
  })

  it('cellSummary carries since, patches and the failing step', () => {
    // the empty-preset row of the fixture carries the api-keys patch (a new app has api_keys on)
    const c = cellSummary(
      fx.receipts(LOC.consents).filter((r) => r.om.preset === 'empty'),
      '0.9',
    )
    expect(c).toMatchObject({
      status: 'broken',
      step: 'typecheck',
      since: '2026-10-23',
      patches: ['api-keys'],
      moduleVersion: '0.1.0',
    })
  })
})

describe('VER-1 without a deciding receipt (review r4)', () => {
  const ver1 = (receipts: Receipt[]) =>
    evaluate(LOC.ksef, { receipts }).health.rules.find((r) => r.id === 'VER-1')?.detail ?? ''
  const others = () => fx.receipts(LOC.ksef).filter((r) => r.om.line !== '0.9')

  it('a single red night names the step, the day and the confirmation it needs, never `untested`', () => {
    const red = receipt(ksef09(), (r) => {
      r.result = {
        status: 'broken',
        failedStep: 'typecheck',
        alsoFailed: [],
        classification: 'module-fail',
        quarantineUntil: null,
      }
      r.transition = { from: null, to: 'broken', confirmed: false }
    })
    const d = ver1([...others(), red])
    expect(d).not.toMatch(/untested/)
    expect(d).toBe(
      `Broken at typecheck on 0.9, one red night (${Number(red.run.at.slice(8, 10))} Oct); a second night confirms it.`,
    )
  })

  it('a night that judged nothing says so; `untested` only without any receipt for the version', () => {
    const infra = receipt(ksef09(), (r) => {
      r.result = {
        status: 'infra-error',
        failedStep: 'install',
        alsoFailed: [],
        classification: 'infra',
        quarantineUntil: null,
      }
      r.transition = { from: null, to: 'infra-error', confirmed: false }
    })
    // the sentence of the strip and the agent policy (review r6)
    expect(ver1([...others(), infra])).toMatch(/^Not judged on 0\.9: the run did not finish on \d+ Oct\.$/)
    expect(ver1(others())).toBe('Not yet tested in a new app on 0.9.')
  })
})
