// Plan of the nightly matrix on test/fixtures (spec 5.3, D6, D10, D46, 12.2 WP07).
import { describe, expect, it } from 'vitest'
import { Descriptor } from '../../lib/schema/descriptor.ts'
import { Facts, Receipt, SyncRecord } from '../../lib/schema/data/index.ts'
import { cellKey, receiptId } from '../../lib/receipts/cell-key.ts'
import { Matrix } from '../../lib/receipts/matrix.ts'
import { dueLines, MINUTES_PER_CELL, patchesFor, PARALLEL } from '../../lib/receipts/plan.ts'
import { fixturePlanEntries, harness, HASH, loadFixture, LOC, NIGHT, plan, SUNDAY, type Extra } from './helpers.ts'

const fx = loadFixture()
const labels = (m: Matrix) => m.cells.map((c) => c.label)

describe('lines and patches', () => {
  it('latest and next are due every night, previous on Sunday or on a dispatch', () => {
    const h = harness()
    expect([...dueLines({ lines: fx.lines, harness: h, now: NIGHT, event: 'schedule' })].sort()).toEqual([
      '0.9',
      'next',
    ])
    expect([...dueLines({ lines: fx.lines, harness: h, now: SUNDAY, event: 'schedule' })].sort()).toEqual([
      '0.8',
      '0.9',
      'next',
    ])
    expect(dueLines({ lines: fx.lines, harness: h, now: NIGHT, event: 'workflow_dispatch' }).has('0.8')).toBe(true)
  })

  it('api-keys covers exactly the 0.9 line, agent-examples-tsconfig the 0.8 line (develop has both fixes)', () => {
    const h = harness()
    expect(patchesFor(h, '0.9.0')).toEqual(['api-keys'])
    expect(patchesFor(h, '0.9.3')).toEqual(['api-keys'])
    expect(patchesFor(h, '0.8.0')).toEqual(['agent-examples-tsconfig'])
    expect(patchesFor(h, '0.8.5')).toEqual(['agent-examples-tsconfig'])
    expect(patchesFor(h, '0.10.0')).toEqual([])
    expect(patchesFor(h, '0.10.1-develop.7583.1.0c886d0a14')).toEqual([])
  })
})

describe('plan on the fixture (Friday night)', () => {
  const m = plan(fx)

  it('validates and lists one baseline per due line first, with the api-keys patch on 0.9 only', () => {
    expect(Matrix.safeParse(m).success).toBe(true)
    const base = m.cells.filter((c) => c.baseline)
    expect(base.map((c) => [c.line, c.patches])).toEqual([
      ['0.9', ['api-keys']],
      ['next', []],
    ])
    expect(m.cells.slice(0, 2).every((c) => c.baseline)).toBe(true)
  })

  it('plans ksef on 0.9 and next with the core requires closure and smoke targets from facts', () => {
    const ksef = m.cells.filter((c) => c.locator === LOC.ksef)
    expect(ksef.map((c) => c.line).sort()).toEqual(['0.9', 'next'])
    const c = ksef.find((x) => x.line === '0.9')!
    expect(c.moduleSpec).toBe('@fastwhitecat/integration-ksef-direct@0.1.8')
    expect(c.thirdParty).toBe(true)
    expect(c.requiresSpecs).toEqual(['core:integrations'])
    expect(c.moduleIds).toEqual(['integration_ksef_direct'])
    expect(c.smokeApi).toBe('/api/integration-ksef-direct/documents')
    expect(c.backendPage).toMatch(/^\/backend\/integration-ksef-direct\//)
  })

  it('closes data-sync-durable over its catalog peer durable-work, deepest first', () => {
    const c = m.cells.find((x) => x.locator === LOC.datasync && x.line === '0.9')!
    expect(c.requiresSpecs).toEqual(['@fullstackhouse/open-mercato-durable-work@0.6.0'])
  })

  it('a catalog library the module peers on is installed with yarn add (lib:), never module add', () => {
    // terminal-tracking peers on @freighttech/ui (kind library): here durable-work stands in as that library
    const entries = fixturePlanEntries(fx).map((e) =>
      e.locator === LOC.durable ? { ...e, d: { ...e.d, kind: 'library' as const } } : e,
    )
    const c = plan(fx, { entries }).cells.find((x) => x.locator === LOC.datasync && x.line === '0.9')!
    expect(c.requiresSpecs).toEqual(['lib:@fullstackhouse/open-mercato-durable-work@0.6.0'])
    expect(Matrix.safeParse(plan(fx, { entries })).success).toBe(true)
  })

  it('runs the official preview without a stable release only on next', () => {
    expect(m.cells.filter((c) => c.locator === LOC.tpay).map((c) => c.line)).toEqual(['next'])
    const skipped = m.notRun.find((n) => n.locator === LOC.tpay && n.line === '0.9')!
    expect(skipped.status).toBe('skipped')
  })

  it('skips enterprise and leaves a GitHub-only entry without a usable tag untested', () => {
    expect(m.cells.some((c) => c.locator === LOC.enterprise || c.locator === LOC.treg)).toBe(false)
    expect(m.notRun.filter((n) => n.locator === LOC.enterprise).map((n) => n.status)).toEqual(['skipped', 'skipped'])
    expect(m.notRun.filter((n) => n.locator === LOC.treg).map((n) => n.status)).toEqual(['untested', 'untested'])
  })

  it('a GitHub-only tag without dist/modules is untested: needs build from source', () => {
    const sync = structuredClone(fx.sync(LOC.treg)!) as SyncRecord
    sync.github!.tags = [{ name: 'v0.2.0', sha: 'a'.repeat(40) }]
    const facts = structuredClone(fx.facts(LOC.ksef, '0.1.8')!) as Facts
    facts.package = {
      ...facts.package,
      locator: LOC.treg,
      name: 'open-mercato-enrichment-treg',
      version: '0.2.0',
      source: 'github-archive',
    }
    facts.gate.modules = facts.gate.modules.map((x) => ({ ...x, dist: false }))
    const entries = fixturePlanEntries(fx).map((e) =>
      e.locator === LOC.treg ? { ...e, sync, facts: (v: string) => (v === '0.2.0' ? facts : null) } : e,
    )
    const p = plan(fx, { entries })
    const nr = p.notRun.find((n) => n.locator === LOC.treg && n.line === '0.9')!
    expect([nr.status, nr.reason, nr.version]).toEqual(['untested', 'needs build from source', '0.2.0'])
    // With dist in the tag the cell runs from the tag archive.
    facts.gate.modules = facts.gate.modules.map((x) => ({ ...x, dist: true }))
    const q = plan(fx, { entries })
    const cell = q.cells.find((c) => c.locator === LOC.treg && c.line === '0.9')!
    expect(cell.moduleSpec).toBe(
      'open-mercato-enrichment-treg@https://codeload.github.com/Chmarusso/open-mercato-enrichment-treg/tar.gz/v0.2.0',
    )
  })

  it('previous line joins on Sunday', () => {
    const s = plan(fx, { now: SUNDAY })
    expect(
      s.cells
        .filter((c) => c.baseline)
        .map((c) => c.line)
        .sort(),
    ).toEqual(['0.8', '0.9', 'next'])
    expect(s.cells.some((c) => c.line === '0.8' && c.baseline)).toBe(true)
    expect(s.estimate.budgetMin).toBe(150)
  })
})

describe('memo and selection', () => {
  it('a confirmed receipt with the same key younger than 7 days skips the cell; a second run the same night plans nothing new', () => {
    const first = plan(fx, { runner: 'ubuntu-latest' })
    const ksef = first.cells.find((c) => c.locator === LOC.ksef && c.line === '0.9')!
    const base = fx.receipts(LOC.ksef).find((r) => r.om.line === '0.9')!
    const done = (key: string, at: string): Receipt =>
      Receipt.parse({
        ...base,
        cellKey: key,
        transition: { ...base.transition, confirmed: true },
        run: { ...base.run, at },
      })
    const receipts = (loc: string) => (loc === LOC.ksef ? [done(ksef.key, NIGHT)] : [])
    const second = plan(fx, { entries: fixturePlanEntries(fx, { receipts }) })
    expect(second.cells.some((c) => c.key === ksef.key)).toBe(false)
    expect(second.memo).toBe(1)
    // 7 days later it runs again.
    const later = plan(fx, { entries: fixturePlanEntries(fx, { receipts }), now: '2026-10-30T02:17:00Z' })
    expect(later.cells.some((c) => c.key === ksef.key)).toBe(true)
    // An unconfirmed receipt never memoizes.
    const unconf = (loc: string) =>
      loc === LOC.ksef
        ? [Receipt.parse({ ...done(ksef.key, NIGHT), transition: { from: null, to: 'broken', confirmed: false } })]
        : []
    expect(
      plan(fx, { entries: fixturePlanEntries(fx, { receipts: unconf }) }).cells.some((c) => c.key === ksef.key),
    ).toBe(true)
    // A preview receipt does not memoize an ubuntu-latest plan.
    const preview = (loc: string) =>
      loc === LOC.ksef
        ? [Receipt.parse({ ...done(ksef.key, NIGHT), harness: { ...base.harness, runner: 'preview-docker' } })]
        : []
    expect(
      plan(fx, { entries: fixturePlanEntries(fx, { receipts: preview }) }).cells.some((c) => c.key === ksef.key),
    ).toBe(true)
  })

  it('explicit cells (key, key12 or locator) ignore memo and the line cadence', () => {
    const all = plan(fx, { now: SUNDAY })
    const c08 = all.cells.find((c) => c.locator === LOC.ksef && c.line === '0.8')!
    const sel = plan(fx, { cells: [c08.key12], now: NIGHT })
    expect(sel.cells.map((c) => c.key)).toEqual([c08.key])
    expect(plan(fx, { cells: [LOC.consents] }).cells.every((c) => c.locator === LOC.consents)).toBe(true)
  })

  it('the cell key changes with the harness hash, the Open Mercato version and the mode', () => {
    const base = {
      locator: LOC.ksef,
      version: '0.1.8',
      integrity: 'sha512-x',
      omVersion: '0.9.0',
      harnessHash: HASH,
      node: '24.21.0',
    }
    const k = cellKey({ ...base, mode: 'realistic' })
    expect(cellKey({ ...base, mode: 'realistic', harnessHash: 'b'.repeat(64) })).not.toBe(k)
    expect(cellKey({ ...base, mode: 'realistic', omVersion: '0.8.0' })).not.toBe(k)
    expect(cellKey({ ...base, mode: 'early' })).not.toBe(k)
    expect(cellKey({ ...base, mode: 'realistic' })).toBe(k)
    expect(cellKey({ ...base, mode: 'realistic', runner: 'ubuntu-latest' })).toBe(k)
  })

  it('a preview cell has its own key, so its receipt id never equals the CI one of the same day', () => {
    const ci = plan(fx, { runner: 'ubuntu-latest' })
    const pv = plan(fx, { runner: 'preview-docker' })
    const pick = (mx: typeof ci) => mx.cells.find((c) => c.locator === LOC.ksef && c.line === '0.9')!
    expect(pick(pv).key).not.toBe(pick(ci).key)
    expect(receiptId(NIGHT, pick(pv).key)).not.toBe(receiptId(NIGHT, pick(ci).key))
    expect(pv.cells.length).toBe(ci.cells.length)
  })
})

describe('age gate (spec 5.3, D46)', () => {
  it('an official release younger than 5 days is not quarantined (preapproved @open-mercato/*)', () => {
    const sync = structuredClone(fx.sync(LOC.stripe)!) as SyncRecord
    sync.npm!.latestStable = '0.9.1'
    sync.npm!.previousStable = '0.9.0'
    sync.npm!.publishedAt['0.9.1'] = '2026-10-22T10:00:00Z'
    const facts = fx.facts(LOC.stripe, '0.9.0')!
    const entries = fixturePlanEntries(fx).map((e) =>
      e.locator === LOC.stripe
        ? { ...e, sync, facts: () => ({ ...facts, package: { ...facts.package, version: '0.9.1' } }) }
        : e,
    )
    const m = plan(fx, { entries })
    expect(m.cells.some((c) => c.locator === LOC.stripe && c.version === '0.9.1' && c.mode === 'realistic')).toBe(true)
    expect(m.notRun.some((n) => n.locator === LOC.stripe && n.status === 'quarantine')).toBe(false)
  })

  it('a third-party release in the age gate: quarantine entry, one early cell, and the installable version still runs', () => {
    const sync = structuredClone(fx.sync(LOC.durable)!) as SyncRecord
    sync.npm!.previousStable = '0.6.0'
    sync.npm!.latestStable = '0.7.0'
    sync.npm!.publishedAt['0.7.0'] = '2026-10-21T10:00:00Z'
    const f6 = fx.facts(LOC.durable, '0.6.0')!
    const facts = (v: string) =>
      v === '0.6.0' ? f6 : v === '0.7.0' ? { ...f6, package: { ...f6.package, version: '0.7.0' } } : null
    const entries = fixturePlanEntries(fx).map((e) => (e.locator === LOC.durable ? { ...e, sync, facts } : e))
    const m = plan(fx, { entries })
    const q = m.notRun.find((n) => n.locator === LOC.durable && n.line === '0.9' && n.status === 'quarantine')!
    expect([q.version, q.quarantineUntil]).toEqual(['0.7.0', '2026-10-26'])
    const durable = m.cells.filter((c) => c.locator === LOC.durable && c.line === '0.9')
    expect(durable.map((c) => `${c.version}:${c.mode}`).sort()).toEqual(['0.6.0:realistic', '0.7.0:early'])
    // Once an early receipt exists for 0.7.0 on the line, no second early cell.
    const early = Receipt.parse({
      ...fx.receipts(LOC.durable)[0]!,
      module: { locator: LOC.durable, version: '0.7.0', integrity: null },
      harness: { ...fx.receipts(LOC.durable)[0]!.harness, mode: 'early' },
    })
    const again = plan(fx, {
      entries: entries.map((e) => (e.locator === LOC.durable ? { ...e, receipts: [early] } : e)),
    })
    expect(again.cells.some((c) => c.locator === LOC.durable && c.mode === 'early' && c.line === '0.9')).toBe(false)
  })
})

describe('install version per line (E5)', () => {
  it('on Sunday the 0.8 line installs the newest stable that fits 0.8 (lockstep official 0.8.0), 0.9 stays on 0.9.0', () => {
    const sync = structuredClone(fx.sync(LOC.stripe)!) as SyncRecord
    sync.npm!.latestStable = '0.9.0'
    sync.npm!.previousStable = '0.8.0'
    sync.npm!.publishedAt['0.8.0'] = '2026-09-01T10:00:00Z'
    const f = fx.facts(LOC.stripe, '0.9.0')!
    const facts = (v: string) =>
      v === '0.9.0' || v === '0.8.0' ? { ...f, package: { ...f.package, version: v } } : null
    const fit = (v: string, line: string) => (line === '0.8' ? (v === '0.8.0' ? 'ok' : 'no-fit') : 'ok') as 'ok'
    const entries = fixturePlanEntries(fx).map((e) => (e.locator === LOC.stripe ? { ...e, sync, facts, fit } : e))
    const m = plan(fx, { entries, now: SUNDAY })
    const stripe = m.cells.filter((c) => c.locator === LOC.stripe && c.mode === 'realistic')
    expect(Object.fromEntries(stripe.map((c) => [c.line, c.version]))).toMatchObject({ '0.8': '0.8.0', '0.9': '0.9.0' })
    // without Fit the plan keeps the old behaviour: one version for every line
    const plain = plan(fx, {
      entries: entries.map((e) => (e.locator === LOC.stripe ? { ...e, fit: undefined } : e)),
      now: SUNDAY,
    })
    expect(plain.cells.find((c) => c.locator === LOC.stripe && c.line === '0.8')?.version).toBe('0.9.0')
  })
})

describe('kinds other than module (review round 2)', () => {
  it('a provider with a release in the age gate is skipped, without a quarantine entry or an early cell', () => {
    const sync = structuredClone(fx.sync(LOC.durable)!) as SyncRecord
    sync.npm!.previousStable = '0.6.0'
    sync.npm!.latestStable = '0.7.0'
    sync.npm!.publishedAt['0.7.0'] = '2026-10-21T10:00:00Z'
    const f6 = fx.facts(LOC.durable, '0.6.0')!
    const facts = (v: string) =>
      v === '0.6.0' ? f6 : v === '0.7.0' ? { ...f6, package: { ...f6.package, version: '0.7.0' } } : null
    const entries = fixturePlanEntries(fx).map((e) =>
      e.locator === LOC.durable ? { ...e, d: { ...e.d, kind: 'provider' as const }, sync, facts: () => null } : e,
    )
    const m = plan(fx, { entries })
    const own = m.notRun.filter((n) => n.locator === LOC.durable)
    expect(own.map((n) => [n.line, n.version, n.mode, n.status]).sort()).toEqual([
      ['0.9', '0.7.0', 'realistic', 'skipped'],
      ['next', '0.7.0', 'realistic', 'skipped'],
    ])
    expect(m.cells.some((c) => c.locator === LOC.durable)).toBe(false)
    // The kind the CI confirmed in the facts of the release wins over the descriptor.
    const confirmed = fixturePlanEntries(fx).map((e) =>
      e.locator === LOC.durable
        ? { ...e, sync, facts: (v: string) => (v === '0.7.0' ? { ...f6, kind: 'library' as const } : facts(v)) }
        : e,
    )
    const m2 = plan(fx, { entries: confirmed })
    expect(m2.notRun.filter((n) => n.locator === LOC.durable).map((n) => n.status)).toEqual(['skipped', 'skipped'])
  })
})

describe('budget', () => {
  it('caps a night at the budget window (<= 70 min) and defers by priority: baseline, latest, official, rest', () => {
    const extra: Extra[] = []
    const ksefD = fx.descriptors.get(LOC.ksef)!
    const ksefSync = fx.sync(LOC.ksef)!
    const ksefFacts = fx.facts(LOC.ksef, '0.1.8')!
    for (let i = 0; i < 70; i++) {
      const name = `@fixture/mod-${String(i).padStart(2, '0')}`
      const locator = `npm:${name}`
      extra.push({
        locator,
        d: Descriptor.parse({ ...ksefD, npm: name, github: undefined, renamedFrom: undefined }),
        sync: SyncRecord.parse({ ...ksefSync, locator, npm: { ...ksefSync.npm!, name } }),
        facts: () => ({ ...ksefFacts, package: { ...ksefFacts.package, locator, name } }),
      })
    }
    const m = plan(fx, { entries: fixturePlanEntries(fx, { extra }) })
    expect(m.estimate.windowMin).toBeLessThanOrEqual(70)
    expect(m.cells.length).toBe(Math.floor(70 / MINUTES_PER_CELL) * PARALLEL)
    expect(m.deferred.length).toBeGreaterThan(0)
    const prio = m.cells.map((c) => c.priority)
    expect([...prio].sort((a, b) => a - b)).toEqual(prio)
    expect(m.cells.filter((c) => c.baseline).length).toBe(2)
    expect(
      labels(m)
        .filter((l) => !l.startsWith('baseline'))
        .every((l) => l.endsWith('on 0.9')),
    ).toBe(true)
  })
})

describe('modules registered by the empty preset (D10)', () => {
  it('plans @open-mercato/search like any official module; the add step turns it into yarn add (note in-preset)', () => {
    const stripe = fx.sync(LOC.stripe)!
    const sf = fx.facts(LOC.stripe, '0.9.0')!
    const name = '@open-mercato/search'
    const locator = `npm:${name}`
    const facts = {
      ...sf,
      package: { ...sf.package, locator, name },
      gate: { ...sf.gate, modules: [{ id: 'search', src: true, dist: true }] },
      modules: sf.modules.map((x) => ({ ...x, id: 'search', requires: [] })),
    }
    const extra: Extra[] = [
      {
        locator,
        d: Descriptor.parse({
          npm: name,
          category: 'search-analytics',
          summary: 'Full text search for every module of the app.',
          whenToUse: 'Use when the app needs search across records of several modules.',
        }),
        sync: SyncRecord.parse({ ...stripe, locator, npm: { ...stripe.npm!, name } }),
        facts: () => facts,
      },
    ]
    const m = plan(fx, { entries: fixturePlanEntries(fx, { extra }) })
    const c = m.cells.find((x) => x.locator === locator && x.line === '0.9')!
    expect([c.moduleSpec, c.moduleNpm, c.moduleIds, c.thirdParty, c.requiresSpecs]).toEqual([
      '@open-mercato/search@0.9.0',
      name,
      ['search'],
      false,
      [],
    ])
    // The preset of the line registers { id: 'search', from: '@open-mercato/search' }: steps.sh `add` checks exactly that.
    expect(fx.presets['0.9']!.empty).toContainEqual({ id: 'search', from: name })
  })
})

describe('requires of core modules (review r4)', () => {
  /** An official adapter like @open-mercato/sync-akeneo: module `sync_akeneo` that requires core data_sync. */
  function adapter(resolvesTo: string | null): Extra {
    const stripe = fx.sync(LOC.stripe)!
    const sf = fx.facts(LOC.stripe, '0.9.0')!
    const name = '@open-mercato/sync-akeneo'
    const locator = `npm:${name}`
    return {
      locator,
      d: Descriptor.parse({
        npm: name,
        category: 'integrations-sync',
        summary: 'Imports products and categories from Akeneo PIM through data_sync.',
        whenToUse: 'Use when the product catalog is mastered in Akeneo and has to flow into the app.',
      }),
      sync: SyncRecord.parse({ ...stripe, locator, npm: { ...stripe.npm!, name } }),
      facts: () => ({
        ...sf,
        package: { ...sf.package, locator, name },
        gate: { ...sf.gate, modules: [{ id: 'sync_akeneo', src: true, dist: true }] },
        modules: sf.modules.map((x) => ({ ...x, id: 'sync_akeneo', requires: [{ raw: 'data_sync', resolvesTo }] })),
      }),
    }
  }

  it.each([['core:data_sync'], [null]])(
    'a module that requires data_sync (resolvesTo %s) gets core data_sync, never the catalog replacement',
    (resolvesTo) => {
      const extra = [adapter(resolvesTo)]
      const m = plan(fx, { entries: fixturePlanEntries(fx, { extra }) })
      const c = m.cells.find((x) => x.locator === extra[0]!.locator && x.line === '0.9')!
      expect(c.requiresSpecs).toEqual(['core:data_sync'])
      expect(c.requiresSpecs.join(' ')).not.toContain('data-sync-durable')
    },
  )
})
