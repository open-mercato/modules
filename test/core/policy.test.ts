// agentPolicy (spec 6.5): every rule code and the required combinations, on fixture entries.
import { describe, expect, it } from 'vitest'
import {
  agentPolicy,
  builtInPolicy,
  INSTALLABLE_META_KEY,
  POLICY_CODES,
  strictestPolicy,
  type PolicyEntry,
} from '../../lib/core/policy.ts'
import { Policy } from '../../lib/schema/data/health.ts'
import type { IndexEntry } from '../../lib/schema/published/modules.ts'
import { consentsBrokenThenGated, fixtureEntries, fixtureEntry, LOC, loadFixture, NOW } from './helpers.ts'

const fx = loadFixture()
const entries = fixtureEntries(fx)
const entry = (loc: string) => structuredClone(entries.find((e) => e.locator === loc) as IndexEntry)
const codes = (p: { reasons: { code: string }[] }) => p.reasons.map((r) => r.code)
const opts = { now: NOW }
const preset09 = { enabledModules: fx.presets['0.9']!.empty! }

interface Case {
  name: string
  entry: () => PolicyEntry
  line: string
  app?: { enabledModules: { id: string; from: string }[] }
  now?: string
  decision: 'allow' | 'ask' | 'refuse'
  codes: string[]
  check?: (p: ReturnType<typeof agentPolicy>) => void
}

const CASES: Case[] = [
  {
    // review r8: a module every new app of the line registers is judged by the baseline row
    // 24 Oct: a new app (classic) already registers it; the line keeps its verdict (stripe verified in a new app), and
    // IN_PRESET only informs
    name: 'IN_PRESET: a module a new app already registers keeps its verdict, IN_PRESET informs',
    entry: () => ({ ...entry(LOC.stripe), compat: { ...entry(LOC.stripe).compat, inPresets: ['0.9'] } }),
    line: '0.9',
    decision: 'allow',
    codes: ['OFFICIAL_VERIFIED', 'IN_PRESET'],
    check: (p) =>
      expect(p.reasons[1]?.text).toBe(
        'Nothing to install: a new app already registers gateway_stripe in src/modules.ts.',
      ),
  },
  {
    name: 'HOLD: curator hold refuses',
    entry: () => ({ ...entry(LOC.stripe), status: 'hold', statusReason: 'Orphaned canary.' }),
    line: '0.9',
    decision: 'refuse',
    codes: ['HOLD'],
    check: (p) => expect(p.reasons[0]?.text).toBe('On hold: Orphaned canary.'),
  },
  {
    name: 'ADVISORY: open high advisory refuses',
    entry: () => ({
      ...entry(LOC.stripe),
      advisories: [{ id: 'GHSA-xxxx-yyyy-zzzz', severity: 'high', fixedIn: null }],
    }),
    line: '0.9',
    decision: 'refuse',
    codes: ['ADVISORY'],
    check: (p) => expect(p.reasons[0]?.text).toBe('Open high severity advisory GHSA-xxxx-yyyy-zzzz.'),
  },
  {
    name: 'BROKEN: consents on 0.9',
    entry: () => entry(LOC.consents),
    line: '0.9',
    decision: 'refuse',
    codes: ['BROKEN', 'THIRD_PARTY', 'LICENSE'],
    check: (p) => {
      expect(p.reasons[0]?.text).toBe('Broken at typecheck on 0.9 since 23 Oct.')
      expect(p.consentText).toBeUndefined()
    },
  },
  {
    name: 'BROKEN: confirmed broken install version stays BROKEN while a newer release is in the age gate',
    entry: () => fixtureEntry(fx, LOC.consents, consentsBrokenThenGated(fx)),
    line: '0.9',
    decision: 'refuse',
    codes: ['BROKEN', 'THIRD_PARTY', 'LICENSE'],
    check: (p) => {
      expect(p.reasons[0]?.text).toBe('Broken at typecheck on 0.9 since 23 Oct.')
      expect(p.consentText).toBeUndefined()
    },
  },
  {
    name: 'BROKEN: a first red night says so, `since` only after a second night confirms it (review r4)',
    entry: () => ({
      ...entry(LOC.consents),
      installStatus: {
        '0.9': {
          version: '0.1.0',
          status: 'broken',
          step: 'typecheck',
          since: '2026-10-23',
          receipt: 'r_20261023_013ac0c20206',
          at: '2026-10-23',
          confirmed: false,
        },
      },
    }),
    line: '0.9',
    decision: 'refuse',
    codes: ['BROKEN', 'THIRD_PARTY', 'LICENSE'],
    check: (p) => expect(p.reasons[0]?.text).toBe('Broken at typecheck on 0.9, one red night (23 Oct).'),
  },
  {
    name: 'QUARANTINE: only candidate in the age gate, no recommended',
    entry: () => {
      const e = entry(LOC.ksef)
      e.version.recommended = { '0.9': null, '0.8': null, next: null }
      e.version.installableFrom = '2026-10-28'
      e._meta[INSTALLABLE_META_KEY] = { '0.9': null, '0.8': null, next: null }
      e.compat.lines = {}
      return e
    },
    line: '0.9',
    decision: 'refuse',
    codes: ['QUARANTINE', 'THIRD_PARTY', 'NOT_VERIFIED'],
    check: (p) => {
      expect(p.reasons[0]?.text).toBe('Installs from 28 Oct (Yarn 5-day age gate).')
      expect(p.until).toBe('2026-10-28')
    },
  },
  {
    name: 'NOT_INSTALLABLE: module without the src/dist pair',
    entry: () => ({ ...entry(LOC.ksef), installable: false }),
    line: '0.9',
    decision: 'refuse',
    codes: ['NOT_INSTALLABLE', 'THIRD_PARTY'],
  },
  {
    name: 'UNPINNED_GIT: GitHub-only without a tag',
    entry: () => entry(LOC.treg),
    line: '0.9',
    decision: 'refuse',
    codes: ['UNPINNED_GIT', 'THIRD_PARTY', 'NOT_VERIFIED'],
  },
  {
    name: 'THIRD_PARTY: ksef verified on 0.9',
    entry: () => entry(LOC.ksef),
    line: '0.9',
    decision: 'ask',
    codes: ['THIRD_PARTY'],
    check: (p) => expect(p.consentText).toBe('Install @fastwhitecat/integration-ksef-direct@0.1.8'),
  },
  {
    name: 'NOT_VERIFIED: tpay on next',
    entry: () => entry(LOC.tpay),
    line: 'next',
    decision: 'ask',
    codes: ['NOT_VERIFIED'],
    check: (p) => expect(p.consentText).toBe('Install @open-mercato/gateway-tpay@0.8.1-develop.7442.1.4c1dbf1f0e'),
  },
  {
    name: 'NOT_VERIFIED: harness-red is not judged',
    entry: () => {
      const e = entry(LOC.stripe)
      e.version.recommended = { '0.9': null }
      e.compat.lines['0.9'] = { ...e.compat.lines['0.9']!, status: 'harness-red', step: 'build' }
      return e
    },
    line: '0.9',
    decision: 'ask',
    codes: ['NOT_VERIFIED'],
    check: (p) =>
      expect(p.reasons[0]?.text).toMatch(/^Not judged on 0\.9: our test app failed( on \d+ [A-Z][a-z]{2})?\.$/),
  },
  {
    name: 'NOT_VERIFIED: a night that did not finish says so with its day, never as a fault (round 5)',
    entry: () => {
      const e = entry(LOC.stripe)
      e.version.recommended = { '0.9': null }
      e.compat.lines['0.9'] = {
        ...e.compat.lines['0.9']!,
        status: 'infra-error',
        step: null,
        at: '2026-10-23T09:27:06Z',
      }
      return e
    },
    line: '0.9',
    decision: 'ask',
    codes: ['NOT_VERIFIED'],
    check: (p) => expect(p.reasons[0]?.text).toBe('Not judged on 0.9: the run did not finish on 23 Oct.'),
  },
  {
    // round 14: lint `backend-route-collision` on a line without a verdict asks with its reason, never refuses
    name: 'ROUTE_COLLISION: a backend route a new app already has, on a line without a verdict',
    entry: () => {
      const e = entry(LOC.stripe)
      e.version.recommended = { '0.9': null }
      e.compat.lines['0.9'] = { ...e.compat.lines['0.9']!, status: 'quarantine', step: 'install' }
      e.compat.collisions = {
        '0.9': [{ route: '/backend/webhooks', module: 'webhooks', from: '@open-mercato/webhooks' }],
      }
      return e
    },
    line: '0.9',
    decision: 'ask',
    codes: ['NOT_VERIFIED', 'ROUTE_COLLISION'],
    check: (p) =>
      expect(p.reasons.find((r) => r.code === 'ROUTE_COLLISION')?.text).toBe(
        'Static check: the module adds the backend route /backend/webhooks, which a new app already has from the webhooks module (@open-mercato/webhooks).',
      ),
  },
  {
    name: 'LICENSE: consents on next (UNLICENSED)',
    entry: () => entry(LOC.consents),
    line: 'next',
    decision: 'ask',
    codes: ['THIRD_PARTY', 'NOT_VERIFIED', 'LICENSE'],
    check: (p) => expect(p.reasons.find((r) => r.code === 'LICENSE')?.text).toBe('License: proprietary (UNLICENSED).'),
  },
  {
    name: 'LICENSE: enterprise',
    entry: () => entry(LOC.enterprise),
    line: '0.9',
    decision: 'ask',
    codes: ['NOT_VERIFIED', 'LICENSE'],
    check: (p) => expect(p.reasons[1]?.text).toBe('License: enterprise (SEE LICENSE IN LICENSE.md).'),
  },
  {
    name: 'REPLACES: durable data sync',
    entry: () => entry(LOC.datasync),
    line: '0.9',
    decision: 'ask',
    codes: ['THIRD_PARTY', 'NOT_VERIFIED', 'REPLACES'],
    check: (p) =>
      expect(p.reasons.find((r) => r.code === 'REPLACES')?.text).toBe(
        'Replaces core data_sync. Remove the core registration first.',
      ),
  },
  {
    name: 'SLOT: the app already enables data_sync from core',
    entry: () => entry(LOC.datasync),
    line: '0.9',
    app: { enabledModules: [...preset09.enabledModules, { id: 'data_sync', from: '@open-mercato/core' }] },
    decision: 'ask',
    codes: ['THIRD_PARTY', 'NOT_VERIFIED', 'REPLACES', 'SLOT'],
    check: (p) =>
      expect(p.reasons.find((r) => r.code === 'SLOT')?.text).toBe(
        'Competes for slot data_sync with @open-mercato/core.',
      ),
  },
  {
    name: 'SUPPLY_CHAIN: declared install scripts',
    entry: () => {
      const e = entry(LOC.stripe)
      e.signals.supplyChain = { status: 'warn', reasons: ['Declares install scripts: postinstall.'] }
      return e
    },
    line: '0.9',
    decision: 'ask',
    codes: ['SUPPLY_CHAIN'],
    check: (p) => expect(p.reasons[0]?.text).toBe('Declares install scripts: postinstall.'),
  },
  {
    name: 'allow: official, verified on the line, OSI',
    entry: () => entry(LOC.stripe),
    line: '0.9',
    app: preset09,
    decision: 'allow',
    codes: ['OFFICIAL_VERIFIED'],
    check: (p) =>
      expect(p).toEqual({
        decision: 'allow',
        reasons: [{ code: 'OFFICIAL_VERIFIED', text: 'Official, verified on 0.9.' }],
      }),
  },
  {
    name: 'official on a line without a receipt asks',
    entry: () => entry(LOC.stripe),
    line: 'next',
    decision: 'ask',
    codes: ['NOT_VERIFIED'],
  },
  {
    name: 'a release in the age gate next to a verified recommended changes nothing',
    entry: () => {
      const e = entry(LOC.ksef)
      e.version.latest = '0.1.9'
      e.version.installableFrom = '2026-10-27'
      e.compat.lines['0.9'] = { ...e.compat.lines['0.9']!, status: 'quarantine', moduleVersion: '0.1.9', step: null }
      return e
    },
    line: '0.9',
    decision: 'ask',
    codes: ['THIRD_PARTY'],
    check: (p) => expect(p.consentText).toBe('Install @fastwhitecat/integration-ksef-direct@0.1.8'),
  },
  {
    name: 'an official release younger than 5 days has no QUARANTINE',
    entry: () => {
      const e = entry(LOC.stripe)
      e.version.latest = '0.9.1'
      e.version.installableFrom = '2026-10-22'
      e.version.recommended = { '0.9': null }
      e.compat.lines = {}
      return e
    },
    line: '0.9',
    decision: 'ask',
    codes: ['NOT_VERIFIED'],
  },
  {
    name: 'a third-party release younger than 5 days without recommended: the older stable version asks',
    entry: () => {
      const e = entry(LOC.durable)
      e.version.latest = '0.7.0'
      e.version.installableFrom = '2026-10-26'
      e.version.recommended = { '0.9': null }
      e._meta[INSTALLABLE_META_KEY] = { '0.9': '0.6.0' }
      e.compat.lines = {}
      return e
    },
    line: '0.9',
    decision: 'ask',
    codes: ['THIRD_PARTY', 'NOT_VERIFIED'],
    check: (p) => expect(p.consentText).toBe('Install @fullstackhouse/open-mercato-durable-work@0.6.0'),
  },
  {
    name: 'a third-party release younger than 5 days and no older stable version refuses',
    entry: () => {
      const e = entry(LOC.durable)
      e.version.latest = '0.7.0'
      e.version.installableFrom = '2026-10-26'
      e.version.recommended = { '0.9': null }
      e._meta[INSTALLABLE_META_KEY] = { '0.9': null }
      e.compat.lines = {}
      return e
    },
    line: '0.9',
    decision: 'refuse',
    codes: ['QUARANTINE', 'THIRD_PARTY', 'NOT_VERIFIED'],
    check: (p) => expect(p.until).toBe('2026-10-26'),
  },
  {
    name: 'ADVISORY carried from the precomputed policy when the entry has no advisories',
    entry: () => {
      const e = entry(LOC.stripe)
      e.agentPolicy['0.9'] = {
        decision: 'refuse',
        reasons: [{ code: 'ADVISORY', text: 'Open critical severity advisory GHSA-1.' }],
      }
      return e
    },
    line: '0.9',
    decision: 'refuse',
    codes: ['ADVISORY'],
  },
]

describe('agentPolicy (6.5)', () => {
  it('covers at least 16 cases and every rule code', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(16)
    const hit = new Set(CASES.flatMap((c) => c.codes))
    for (const code of POLICY_CODES) expect(hit, code).toContain(code)
  })

  it.each(CASES.map((c) => [c.name, c]))('%s', (_n, c) => {
    const p = agentPolicy(c.entry(), c.line, c.app, { now: c.now ?? opts.now })
    expect(Policy.safeParse(p).success).toBe(true)
    expect(p.decision).toBe(c.decision)
    expect(codes(p)).toEqual(c.codes)
    if (p.decision === 'ask') expect(p.consentText).toMatch(/^Install \S+@\S+$/)
    c.check?.(p)
  })

  it('built-in: allow on the core line, ask on another line', () => {
    expect(builtInPolicy('0.9', '0.9').decision).toBe('allow')
    expect(builtInPolicy('0.9', null).decision).toBe('allow')
    expect(builtInPolicy('0.9', 'next').decision).toBe('ask')
  })

  it('strictestPolicy: refuse wins, consent texts join', () => {
    const ask1 = agentPolicy(entry(LOC.ksef), '0.9', undefined, opts)
    const ask2 = agentPolicy(entry(LOC.durable), '0.9', undefined, opts)
    expect(strictestPolicy([ask1, ask2]).consentText).toBe(
      'Install @fastwhitecat/integration-ksef-direct@0.1.8, @fullstackhouse/open-mercato-durable-work@0.6.0',
    )
    const refuse = agentPolicy(entry(LOC.consents), '0.9', undefined, opts)
    const s = strictestPolicy([ask1, refuse, builtInPolicy('0.9', '0.9')])
    expect(s.decision).toBe('refuse')
    expect(s.consentText).toBeUndefined()
    expect(strictestPolicy([builtInPolicy('0.9', '0.9')]).decision).toBe('allow')
  })

  it('strictestPolicy names the packages of each reason when it merges several (finding of 25 Oct)', () => {
    const broken = (since: string): Policy => ({
      decision: 'refuse',
      reasons: [{ code: 'BROKEN', text: `Broken at typecheck on 0.9 since ${since}.` }],
    })
    // three broken modules once read as two `Broken ... since` lines that named none of them
    const s = strictestPolicy(
      [broken('24 Oct'), broken('25 Oct'), broken('25 Oct'), builtInPolicy('0.9', 'next')],
      ['@dainamite/cpq', '@dainamite/billing', '@dainamite/cpq-billing-connector', null],
    )
    expect(s.reasons).toEqual([
      { code: 'BROKEN', text: '@dainamite/cpq: Broken at typecheck on 0.9 since 24 Oct.' },
      {
        code: 'BROKEN',
        text: '@dainamite/billing, @dainamite/cpq-billing-connector: Broken at typecheck on 0.9 since 25 Oct.',
      },
    ])
    // one package: its reasons as they are
    expect(strictestPolicy([broken('24 Oct')], ['@dainamite/cpq']).reasons[0]?.text).toBe(
      'Broken at typecheck on 0.9 since 24 Oct.',
    )
    // past 160 characters the names go on more lines, each still naming its packages (review of 25 Oct)
    const long = Array.from({ length: 6 }, (_, i) => `@some-long-scope/package-number-${i}`)
    const many = strictestPolicy(
      long.map(() => broken('25 Oct')),
      long,
    )
    expect(many.reasons).toEqual([
      { code: 'BROKEN', text: `${long.slice(0, 3).join(', ')}: Broken at typecheck on 0.9 since 25 Oct.` },
      { code: 'BROKEN', text: `${long.slice(3).join(', ')}: Broken at typecheck on 0.9 since 25 Oct.` },
    ])
    expect(Policy.safeParse(many).success).toBe(true)
    // no room for more lines within the 10 reasons: the line names what fits and counts the rest
    const others = Array.from({ length: 9 }, (_, i) => `@acme/other-${i}`)
    const full = strictestPolicy(
      [...long.map(() => broken('25 Oct')), ...others.map((_, i) => broken(`${i + 1} Oct`))],
      [...long, ...others],
    )
    expect(full.reasons).toHaveLength(10)
    expect(full.reasons[0]?.text).toBe(
      `${long.slice(0, 3).join(', ')} and 3 more: Broken at typecheck on 0.9 since 25 Oct.`,
    )
    expect(full.reasons.slice(1).map((r) => r.text)).toEqual(
      others.map((p, i) => `${p}: Broken at typecheck on 0.9 since ${i + 1} Oct.`),
    )
    expect(Policy.safeParse(full).success).toBe(true)
  })

  it('BROKEN on the install version, not on the last receipt of the line (review round 2)', () => {
    const e = fixtureEntry(fx, LOC.consents, consentsBrokenThenGated(fx))
    // the last receipt of the line is the quarantine entry of 0.1.1; the install version is 0.1.0
    expect(e.compat.lines['0.9']).toMatchObject({ status: 'quarantine', moduleVersion: '0.1.1' })
    expect(e._meta[INSTALLABLE_META_KEY]).toMatchObject({ '0.9': '0.1.0' })
    expect(e.signals.receipt['0.9']).toBe('broken')
    const stored = e.agentPolicy['0.9']!
    expect(stored.decision).toBe('refuse')
    expect(codes(stored)).toEqual(['BROKEN', 'THIRD_PARTY', 'LICENSE'])
    expect(stored.consentText).toBeUndefined()
    expect(stored.reasons.some((r) => r.text.startsWith('Not installed'))).toBe(false)
    // a bare IndexEntry (plan_install, check_compat) carries BROKEN from agentPolicy[line]
    expect(agentPolicy(e, '0.9', undefined, opts)).toEqual(stored)
    // a harness-red after the confirmed broken does not hide it either
    const { sync, receipts } = consentsBrokenThenGated(fx)
    const red = structuredClone(receipts.find((r) => r.module?.version === '0.1.0' && r.transition.confirmed)!)
    red.id = 'r_20261023_00000000aa02'
    red.result = { ...red.result, status: 'harness-red', classification: 'harness-red', failedStep: null }
    red.transition = { from: 'broken', to: 'harness-red', confirmed: true }
    red.run.at = '2026-10-23T02:55:00Z'
    const withRed = fixtureEntry(fx, LOC.consents, { sync, receipts: [...receipts, red] })
    expect(withRed.agentPolicy['0.9']?.reasons[0]?.code).toBe('BROKEN')
  })

  it('health stored the same decisions as a fresh computation on the IndexEntry', () => {
    for (const e of entries)
      for (const line of Object.keys(e.agentPolicy))
        expect(agentPolicy(e, line, undefined, opts), `${e.locator} ${line}`).toEqual(e.agentPolicy[line])
  })
})
