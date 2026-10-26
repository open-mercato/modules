// IndexEntry and BuiltInModule built by lib/core from the data fixture (inputs for emit, WP09).
import { describe, expect, it } from 'vitest'
import { anatomyCallout, catalogPeerRequires, entryTitle, withSlotConflicts } from '../../lib/core/entry.ts'
import { BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import { IndexEntry } from '../../lib/schema/published/modules.ts'
import { builtInIndex, fixtureBuiltIn, fixtureEntries, LOC, loadFixture } from './helpers.ts'

const fx = loadFixture()
const entries = fixtureEntries(fx)
const get = (loc: string) => entries.find((e) => e.locator === loc) as IndexEntry

describe('IndexEntry from the fixture', () => {
  it('all 8 entries validate and match the golden snapshot', async () => {
    for (const e of entries) expect(IndexEntry.safeParse(e).success, e.locator).toBe(true)
    await expect(`${JSON.stringify(entries, null, 2)}\n`).toMatchFileSnapshot('golden/entries.json')
  })

  it('ksef: anatomy callout, verified lines, recommended per line, links', () => {
    const k = get(LOC.ksef)
    expect(k.anatomy?.callout).toBe('ADDS 3 TABLES · 8 ROUTES (0 PUBLIC) · 7 PERMISSIONS · EMITS 9 EVENTS')
    expect(k.compat.verifiedOn).toEqual(['0.9', 'next'])
    expect(k.version.recommended).toEqual({ '0.9': '0.1.8', '0.8': null, next: '0.1.8' })
    expect(k.title).toBe('KSeF Integration')
    expect(k.links).toMatchObject({
      md: 'https://wojciechszyjka.github.io/modules/m/@fastwhitecat/integration-ksef-direct.md',
      facts: 'https://wojciechszyjka.github.io/modules/m/@fastwhitecat/integration-ksef-direct/v/0.1.8/facts.json',
      repo: 'https://github.com/FastWhiteCat/openmercato-module-ksef',
    })
    expect(k.stats).toEqual({ downloads30d: 42, stars: 1 })
    expect(k.addedAt).toBe('2026-10-23')
  })

  it('official stats are shown; enterprise has no anatomy; hold entries are not listed', () => {
    // decision A of 26 Oct: official modules show their downloads too
    expect(get(LOC.stripe).stats).not.toBeNull()
    expect(get(LOC.enterprise).anatomy).toBeNull()
    expect(get(LOC.enterprise).listed).toBe(true)
    expect(get(LOC.enterprise).tier).toBeNull()
    for (const e of entries) expect(e.listed).toBe(true)
  })

  it('slot conflicts: two entries with the same module ID see each other', () => {
    const a = get(LOC.datasync)
    const b = { ...get(LOC.durable), locator: 'npm:@x/other-sync', path: '@x/other-sync', moduleIds: ['data_sync'] }
    const [x, y] = withSlotConflicts([a, b])
    expect(x?.slotConflicts).toEqual(['npm:@x/other-sync'])
    expect(y?.slotConflicts).toEqual([LOC.datasync])
  })

  it('a peer that is another catalog module becomes requires (data-sync-durable -> durable-work, 5.3)', () => {
    expect(get(LOC.datasync).requires).toEqual([
      { raw: '@fullstackhouse/open-mercato-durable-work', resolvesTo: LOC.durable },
    ])
    // real peers (npm latest, 23 Oct): optional peers and packages outside the catalog stay out; a catalog library is
    // required too (25 Oct: terminal-tracking failed every cell without @freighttech/ui)
    const catalog = [
      { locator: 'npm:@dainamite/cpq', npm: '@dainamite/cpq', kind: 'module' as const },
      { locator: 'npm:@dainamite/billing', npm: '@dainamite/billing', kind: 'module' as const },
      { locator: 'npm:@freighttech/ui', npm: '@freighttech/ui', kind: 'library' as const },
      { locator: 'npm:@open-mercato/scheduler', npm: '@open-mercato/scheduler', kind: 'module' as const },
      { locator: 'npm:@open-mercato/events', npm: '@open-mercato/events', kind: 'module' as const },
    ]
    expect(
      catalogPeerRequires(
        'npm:@dainamite/cpq-billing-connector',
        { '@dainamite/cpq': '^0.4.0', '@dainamite/billing': '^0.19.0', '@open-mercato/core': '>=0.9.0' },
        catalog,
      ),
    ).toEqual([
      { raw: '@dainamite/billing', resolvesTo: 'npm:@dainamite/billing' },
      { raw: '@dainamite/cpq', resolvesTo: 'npm:@dainamite/cpq' },
    ])
    expect(
      catalogPeerRequires(
        'npm:@freighttech/shipment-tracking',
        { '@freighttech/ui': '^0.3.0', '@open-mercato/scheduler': '>=0.7.0', '@open-mercato/events': '>=0.7.0' },
        catalog,
        ['@open-mercato/scheduler'],
      ),
    ).toEqual([
      { raw: '@freighttech/ui', resolvesTo: 'npm:@freighttech/ui' },
      { raw: '@open-mercato/events', resolvesTo: 'npm:@open-mercato/events' },
    ])
    expect(catalogPeerRequires('npm:@dainamite/cpq', { '@dainamite/cpq': '*' }, catalog)).toEqual([])
    expect(catalogPeerRequires('npm:@dainamite/cpq', { '@dainamite/billing': '*' }, undefined)).toEqual([])
  })

  it('callout and title helpers', () => {
    expect(entryTitle('npm:@fullstackhouse/open-mercato-health', null)).toBe('Health Checks')
    expect(entryTitle('npm:@open-mercato/web-research-searxng', null)).toBe('Web Research SearXNG')
    const zero = {
      entities: 0,
      tables: 0,
      migrations: 0,
      routes: 2,
      publicRoutes: 1,
      aclFeatures: 0,
      eventsEmitted: 0,
      eventsConsumed: 0,
      backendPages: 0,
      frontendPages: 0,
      widgets: 0,
      workers: 0,
      cli: 0,
      aiTools: 0,
      aiAgents: 0,
      extends: 0,
    }
    expect(anatomyCallout(zero)).toBe('ADDS 2 ROUTES (1 PUBLIC)')
    expect(anatomyCallout({ ...zero, routes: null })).toBe('FEW CONTRACTS')
  })
})

describe('BuiltInModule from the fixture', () => {
  it('validates, uses module enable, keeps routes unmeasured', () => {
    const idx = BuiltInIndex.parse(builtInIndex(fixtureBuiltIn(fx)))
    const wms = idx.modules.find((m) => m.id === 'wms')!
    expect(wms).toMatchObject({
      title: 'Warehouse Management System',
      category: 'warehouse-shipping',
      wedge: 'operate',
      requires: ['catalog', 'sales', 'feature_toggles'],
      install: 'yarn mercato module enable @open-mercato/core --module wms',
      page: '/built-in/wms',
    })
    expect(wms.anatomy.counts.routes).toBeNull()
    expect(wms.anatomy.coverage).toBe('partial')
  })
})
