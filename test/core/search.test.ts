// search_modules (spec 8.2): golden queries of Appendix B (expected result in the top 3), filters, chips, contract.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import {
  ALIASES_META_KEY,
  buildSearchIndex,
  loadSearchIndex,
  relevanceCompare,
  SEARCH_DEFAULTS,
  searchAll,
  searchModules,
  swapVariants,
  tokenize,
  type SearchIndexData,
} from '../../lib/core/search.ts'
import { Descriptor } from '../../lib/schema/descriptor.ts'
import { SearchModulesInput, SearchModulesOutput } from '../../lib/schema/tools.ts'
import { DEFAULTS, passes, toRegistryEntry } from '../../site/src/islands/Registry.tsx'
import {
  corpusBuiltIn,
  corpusEntries,
  fixtureBuiltIn,
  fixtureEntries,
  fixtureEntry,
  LOC,
  loadFixture,
  NOW,
  ROOT,
  SITE,
} from './helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines
const meta = { lines, dataVersion: '1.0.0-202610230305.habcdef', generatedAt: NOW, site: SITE }
const fixtureData = buildSearchIndex({ entries: fixtureEntries(fx), builtIn: fixtureBuiltIn(fx), ...meta })
const fixtureIdx = loadSearchIndex(fixtureData)
// the 59 entries of spec 11.1 (real texts and anatomy, see test/core/fixtures/corpus.json) and the 46 core modules
const corpusIdx = loadSearchIndex(
  JSON.parse(
    JSON.stringify(buildSearchIndex({ entries: corpusEntries(), builtIn: corpusBuiltIn(), ...meta })),
  ) as SearchIndexData,
)

/** Appendix B: query -> expected modules (npm) and built-ins (core ID) in the top 3. */
const GOLDEN: [string, string[], string[]][] = [
  ['exchange rates', [], ['currencies']],
  ['ksef', ['@fastwhitecat/integration-ksef-direct'], []],
  ['e-invoicing poland', ['@fastwhitecat/integration-ksef-direct'], []],
  ['shopify', ['@northbound-run/sync-shopify'], []],
  ['stripe', ['@open-mercato/gateway-stripe'], []],
  ['card payments', ['@open-mercato/gateway-stripe'], []],
  ['tpay', ['@open-mercato/gateway-tpay'], []],
  ['container tracking', ['@freighttech/shipment-tracking'], []],
  ['durable jobs', ['@fullstackhouse/open-mercato-durable-work'], []],
  ['data_sync', ['@fullstackhouse/open-mercato-data-sync-durable'], ['data_sync']],
  ['google sheets', ['@northbound-run/sync-google-sheets'], []],
  ['quotes', ['@dainamite/cpq'], []],
  ['subscriptions billing', ['@dainamite/billing'], []],
  ['akeneo', ['@open-mercato/sync-akeneo'], []],
  ['warehouse', [], ['wms']],
  ['web search for agents', ['@open-mercato/web-research'], []],
  ['s3', ['@open-mercato/storage-s3'], []],
  ['health check', ['@fullstackhouse/open-mercato-health'], []],
  // hero chip of spec 7.6: core answers it (1.1 pt 5, matched: event customers.deal.won)
  ['when a deal is won', [], ['customers']],
]

const top3 = (r: ReturnType<typeof searchModules>) => ({
  modules: r.results.slice(0, 3).map((c) => c.locator.replace(/^npm:/, '')),
  builtIn: r.builtIn.slice(0, 3).map((b) => b.id),
})

describe('a swap of two letters (finding of 25 Oct)', () => {
  it('nothing matched: the results are for the spelling with the swap undone', () => {
    for (const [q, fixed, top] of [
      ['stirpe', 'stripe', '@open-mercato/gateway-stripe'],
      ['ksfe', 'ksef', '@fastwhitecat/integration-ksef-direct'],
      ['invocie', 'invoice', null],
    ] as const) {
      const r = searchModules(corpusIdx, { query: q })
      expect(SearchModulesOutput.safeParse(r).success).toBe(true)
      expect(r.didYouMean).toBe(fixed)
      if (top) expect(top3(r).modules).toContain(top)
      else expect(r.results.length).toBeGreaterThan(0)
    }
  })

  it('a query that matches keeps its own results, and noise finds nothing', () => {
    expect(searchModules(corpusIdx, { query: 'stripe' }).didYouMean).toBeUndefined()
    const none = searchModules(corpusIdx, { query: 'zzqqx' })
    expect([none.results.length, none.builtIn.length, none.didYouMean]).toEqual([0, 0, undefined])
  })

  it('variants swap one adjacent pair in one word, at most 60', () => {
    expect(swapVariants('ksfe')).toEqual(['skfe', 'kfse', 'ksef'])
    expect(swapVariants('web serach')).toContain('web search')
    expect(swapVariants('a b c d e f g')).toEqual([])
    expect(swapVariants('aa')).toEqual([])
  })
})

describe('weak hits are cut (finding of 25 Oct)', () => {
  // the sandbox test: `when a deal is won` gave total 52 (documents, email channels, onboarding for `when` and a
  // fuzzy `real`), `exchange rates` ranked scheduler, ai-assistant, web-research-serp and billing for `change`/`rated`
  it.each([
    ['when a deal is won', 'customers'],
    ['exchange rates', 'currencies'],
  ])('%s: only the built-in answers, no module', (query, builtIn) => {
    const r = searchModules(corpusIdx, { query })
    expect(r.builtIn[0]?.id).toBe(builtIn)
    expect(r.results).toEqual([])
    expect(r.total).toBe(0)
  })

  it('an OR hit with a word as typed stays, however low; `when` and `use` are stop words', () => {
    const r = searchModules(corpusIdx, { query: 'durable jobs' })
    expect(r.results.map((c) => c.locator)).toContain('npm:@open-mercato/scheduler')
    // `Use when` opens every whenToUse: it matched every module
    expect(searchModules(corpusIdx, { query: 'when' }).total).toBe(0)
    expect(searchModules(corpusIdx, { query: 'use when' }).total).toBe(0)
  })
})

describe('no query: the filters alone (finding of 25 Oct)', () => {
  it('a filter without query, or with query "", lists what the filter picks in relevance order', () => {
    const emits = searchModules(corpusIdx, { emits: 'customers.deal.won' })
    expect(SearchModulesOutput.safeParse(emits).success).toBe(true)
    expect(emits.builtIn.map((b) => b.id)).toEqual(['customers'])
    expect(emits.builtIn[0]?.matchedOn).toEqual(['event customers.deal.won'])
    expect(emits.results).toEqual([])
    // no listed module consumes it: an empty answer, not an input error
    const consumes = searchModules(corpusIdx, { consumes: 'customers.deal.won' })
    expect([consumes.total, consumes.results.length]).toEqual([0, 0])
    const blank = searchModules(corpusIdx, { query: '', category: 'payments-finance' })
    expect(blank).toEqual(searchModules(corpusIdx, { query: '  ', category: 'payments-finance' }))
    expect(blank.results.length).toBeGreaterThan(0)
    expect(
      blank.results.every((c) => c.category === 'payments-finance' && c.matchedOn[0] === 'category payments-finance'),
    ).toBe(true)
    expect(blank.results.map((c) => c.locator)).toContain('npm:@open-mercato/gateway-stripe')
  })

  it('a query of stop words only next to a filter is no query: the filter alone answers (review of 25 Oct)', () => {
    // `when` and `use` are stop words; with them a filter once gave nothing while the filter alone gave results
    const event = searchModules(corpusIdx, { query: 'when', emits: 'customers.deal.won' })
    expect(event).toEqual(searchModules(corpusIdx, { emits: 'customers.deal.won' }))
    expect(event.builtIn.map((b) => b.id)).toEqual(['customers'])
    const category = searchModules(corpusIdx, { query: 'use', category: 'payments-finance' })
    expect(category).toEqual(searchModules(corpusIdx, { category: 'payments-finance' }))
    expect(category.results.length).toBeGreaterThan(0)
    // a real word next to the filter still searches
    expect(searchModules(corpusIdx, { query: 'stripe', category: 'payments-finance' }).results[0]?.locator).toBe(
      'npm:@open-mercato/gateway-stripe',
    )
  })

  it('no query and no filter: every listed module, the limit applies, no built-in', () => {
    const all = searchModules(corpusIdx, { limit: 20 })
    expect(all.results).toHaveLength(20)
    expect(all.total).toBeGreaterThan(20)
    expect(all.builtIn).toEqual([])
    // a query of stop words only is still a query: it finds nothing
    expect(searchModules(corpusIdx, { query: 'the' }).total).toBe(0)
  })
})

describe('golden queries (Appendix B) on the 59 entries and 46 built-ins', () => {
  it.each(GOLDEN)('%s', (query, modules, builtIn) => {
    const r = searchModules(corpusIdx, { query })
    expect(SearchModulesOutput.safeParse(r).success).toBe(true)
    const t = top3(r)
    for (const m of modules) expect(t.modules, query).toContain(m)
    for (const b of builtIn) expect(t.builtIn, query).toContain(b)
  })

  it('the hero chip `when a deal is won` names event customers.deal.won, the id with both words (review r4)', () => {
    const r = searchModules(corpusIdx, { query: 'when a deal is won' })
    const customers = r.builtIn.find((b) => b.id === 'customers')!
    expect(customers.matchedOn.find((m) => /^(event|entity|permission|env|setting|host|module) /.test(m))).toBe(
      'event customers.deal.won',
    )
  })

  it('top 3 of every golden query (snapshot)', async () => {
    const all = Object.fromEntries(GOLDEN.map(([q]) => [q, top3(searchModules(corpusIdx, { query: q }))]))
    await expect(`${JSON.stringify(all, null, 2)}\n`).toMatchFileSnapshot('golden/search/top3-corpus.json')
  })
})

describe('golden queries on the data fixture (entries present in test/fixtures/data)', () => {
  const present = new Set(fixtureEntries(fx).map((e) => e.npm))
  const builtIns = new Set(fixtureBuiltIn(fx).map((b) => b.id))
  const cases = GOLDEN.filter(([, m, b]) => m.every((x) => present.has(x)) && b.every((x) => builtIns.has(x)))

  it('covers the queries whose expected entries are in the fixture', () => {
    expect(cases.map(([q]) => q)).toEqual([
      'exchange rates',
      'ksef',
      'e-invoicing poland',
      'stripe',
      'card payments',
      'tpay',
      'durable jobs',
      'data_sync',
      'warehouse',
    ])
  })

  it.each(cases)('%s', (query, modules, builtIn) => {
    const r = searchModules(fixtureIdx, { query })
    const t = top3(r)
    for (const m of modules) expect(t.modules, query).toContain(m)
    for (const b of builtIn) expect(t.builtIn, query).toContain(b)
  })
})

describe('search behaviour (8.2)', () => {
  it('tokenizer keeps whole dotted, underscored and hyphenated identifiers', () => {
    expect(tokenize('customers.deal.won data_sync E-Invoicing')).toEqual([
      'customers',
      'deal',
      'won',
      'data',
      'sync',
      'e',
      'invoicing',
      'customers.deal.won',
      'data_sync',
      'e-invoicing',
    ])
  })

  it('matchedOn translates anatomy hits into chips', () => {
    const r = searchModules(fixtureIdx, { query: 'ksef_direct.document.created' })
    expect(r.results[0]?.locator).toBe(LOC.ksef)
    expect(r.results[0]?.matchedOn).toContain('event ksef_direct.document.created')
    const p = searchModules(fixtureIdx, { query: 'stripe' })
    expect(p.results[0]?.matchedOn).toEqual(expect.arrayContaining(['name', 'provider Stripe']))
  })

  it('cards carry level, line status, policy and the exact install command for the requested line', () => {
    const r = searchModules(fixtureIdx, { query: 'ksef', omVersion: '0.9.0' })
    expect(r.line).toBe('0.9')
    expect(r.results[0]).toMatchObject({
      tier: 'verified',
      verifiedOn: ['0.9', 'next'],
      status: 'verified',
      agentPolicy: { decision: 'ask' },
      install: 'yarn mercato module add @fastwhitecat/integration-ksef-direct@0.1.8 --allow-third-party',
      card: `${SITE}/m/@fastwhitecat/integration-ksef-direct`,
      installableFrom: '2026-10-20',
    })
    const next = searchModules(fixtureIdx, { query: 'ksef', omVersion: '0.10.1-develop.7583.1.0c886d0a14' })
    expect(next.line).toBe('next')
    const old = searchModules(fixtureIdx, { query: 'ksef', omVersion: '0.7.0' })
    expect(old.line).toBeNull()
    expect(old.results[0]?.status).toBeNull()
  })

  it('verifiedOnly, type, kind, category and provider filter; hold entries and examples stay hidden', () => {
    expect(searchModules(fixtureIdx, { query: 'payments', verifiedOnly: true }).results.map((c) => c.locator)).toEqual([
      LOC.stripe,
    ])
    expect(searchModules(fixtureIdx, { query: 'durable', type: ['official'] }).results).toEqual([])
    expect(searchModules(fixtureIdx, { query: 'stripe', provider: 'stripe' }).results[0]?.locator).toBe(LOC.stripe)
    expect(searchModules(fixtureIdx, { query: 'stripe', provider: 'tpay' }).results).toEqual([])
    expect(
      searchModules(fixtureIdx, { query: 'jobs', category: 'storage-infrastructure' }).results.map((c) => c.locator),
    ).toEqual([LOC.durable])
    const holds = searchModules(corpusIdx, { query: 'payu', limit: 20 }).results.map((c) => c.locator)
    expect(holds).not.toContain('npm:@open-mercato/gateway-payu')
    expect(searchModules(corpusIdx, { query: 'visits' }).results.map((c) => c.locator)).not.toContain(
      'npm:@piotrkarwatka/visits',
    )
    expect(searchModules(corpusIdx, { query: 'visits', includeExamples: true }).results[0]?.locator).toBe(
      'npm:@piotrkarwatka/visits',
    )
    expect(
      searchModules(corpusIdx, { query: 'web research', kind: ['provider'], limit: 20 }).results.every(
        (c) => c.kind === 'provider',
      ),
    ).toBe(true)
  })

  it('emits and consumes filter on event IDs', () => {
    const r = searchModules(fixtureIdx, { query: 'ksef', emits: 'ksef_direct.document.created' })
    expect(r.results.map((c) => c.locator)).toEqual([LOC.ksef])
    expect(searchModules(fixtureIdx, { query: 'ksef', emits: 'customers.deal.won' }).results).toEqual([])
  })

  it('emits matches only emitted events and consumes only consumed ones', () => {
    // ksef as a pure subscriber of sales.order.created
    const entries = fixtureEntries(fx).map((e) => {
      if (e.locator !== LOC.ksef || !e.anatomy) return e
      const c = structuredClone(e)
      c.anatomy!.lists.eventsEmitted = []
      c.anatomy!.lists.eventsConsumed = ['sales.order.created']
      return c
    })
    const idx = loadSearchIndex(buildSearchIndex({ entries, builtIn: fixtureBuiltIn(fx), ...meta }))
    const locs = (input: Record<string, string>) =>
      searchModules(idx, { query: 'ksef', ...input }).results.map((c) => c.locator)
    expect(locs({ emits: 'sales.order.created' })).toEqual([])
    expect(locs({ consumes: 'sales.order.created' })).toEqual([LOC.ksef])
    expect(locs({ consumes: 'ksef_direct.document.created' })).toEqual([])
  })

  it('built-in group: max 5, shown for a strong or exact match, hidden by includeBuiltIn: false', () => {
    const r = searchModules(corpusIdx, { query: 'exchange rates' })
    expect(r.builtIn[0]).toMatchObject({
      id: 'currencies',
      install: 'yarn mercato module enable @open-mercato/core --module currencies',
      page: `${SITE}/built-in/currencies`,
      enabled: null,
    })
    expect(searchModules(corpusIdx, { query: 'sales' }).builtIn.length).toBeLessThanOrEqual(5)
    expect(searchModules(corpusIdx, { query: 'exchange rates', includeBuiltIn: false }).builtIn).toEqual([])
    expect(searchModules(corpusIdx, { query: 'warehouse', type: ['3rd-party'] }).builtIn).toEqual([])
  }, 15000) // review r12: past 5 s under a parallel astro build)

  it('AND first, OR when nothing matches; unknown words return nothing', () => {
    const r = searchModules(fixtureIdx, { query: 'stripe zzzzqqq' })
    expect(r.results[0]?.locator).toBe(LOC.stripe)
    expect(searchModules(fixtureIdx, { query: 'zzzzqqq' }).total).toBe(0)
  })

  it('verified and official entries get the score boost', () => {
    const r = searchModules(fixtureIdx, { query: 'payments sales documents' })
    expect(r.results.slice(0, 2).map((c) => c.locator)).toEqual([LOC.stripe, LOC.tpay])
  })

  it('relevance order without a query: level, featured, receipt freshness, name', () => {
    const list = Object.values(fixtureData.modules).sort(relevanceCompare('0.9'))
    expect(list.slice(0, 3).map((m) => m.tier)).toEqual(['verified', 'verified', 'verified'])
    expect(list.at(-1)?.tier).toBeNull()
  })

  it('the serialized index answers like the live one and stays small', () => {
    const json = JSON.stringify(fixtureData)
    const again = loadSearchIndex(JSON.parse(json) as SearchIndexData)
    expect(searchModules(again, { query: 'durable jobs' })).toEqual(
      searchModules(fixtureIdx, { query: 'durable jobs' }),
    )
    const corpusJson = JSON.stringify(buildSearchIndex({ entries: corpusEntries(), builtIn: corpusBuiltIn(), ...meta }))
    expect(corpusJson.length).toBeLessThan(600_000)
  })

  it('input is validated by SearchModulesInput before the search (MCP, WebMCP, CLI); the search applies defaults', () => {
    expect(SearchModulesInput.parse({ query: '' }).query).toBe('')
    expect(SearchModulesInput.parse({ consumes: 'customers.deal.won' }).query).toBeUndefined()
    expect(() => SearchModulesInput.parse({ query: 'x'.repeat(201) })).toThrow()
    expect(searchModules(fixtureIdx, { query: 'ksef', limit: 1 }).results).toHaveLength(1)
    // the same defaults as the schema, without Zod in the browser search chunk
    const parsed = SearchModulesInput.parse({ query: 'ksef' })
    expect(SEARCH_DEFAULTS).toEqual({
      verifiedOnly: parsed.verifiedOnly,
      includeBuiltIn: parsed.includeBuiltIn,
      includeExamples: parsed.includeExamples,
      limit: parsed.limit,
    })
  })
})

describe('the registry page searches without the cap of the tools (finding of 25 Oct)', () => {
  it('searchAll returns every match, searchModules still at most 20', () => {
    const all = searchAll(corpusIdx, { query: 'open mercato' })
    expect(all.results.length).toBeGreaterThan(20)
    expect(all.results.length).toBe(all.total)
    const capped = searchModules(corpusIdx, { query: 'open mercato', limit: 50 })
    expect(capped.results).toHaveLength(20)
    expect(capped.total).toBe(all.total)
    // the same ranking: the capped list is the head of the full one
    expect(capped.results.map((r) => r.locator)).toEqual(all.results.slice(0, 20).map((r) => r.locator))
  })

  it('a level filter applied after the search keeps every matching entry of that level', () => {
    const entries = corpusEntries()
    const rows = new Map(entries.map((e) => [e.locator, toRegistryEntry(e, lines)]))
    const listed = { ...DEFAULTS, tier: ['listed'] }
    const want = searchAll(corpusIdx, { query: 'open mercato', includeBuiltIn: false, kind: ['module', 'provider'] })
      .results.map((r) => rows.get(r.locator)!)
      .filter((e) => passes(e, listed))
    expect(want.length).toBeGreaterThan(0)
    // what the page showed before: the top 20, then the filter
    const before = searchModules(corpusIdx, {
      query: 'open mercato',
      limit: 20,
      includeBuiltIn: false,
      kind: ['module', 'provider'],
    })
      .results.map((r) => rows.get(r.locator)!)
      .filter((e) => passes(e, listed))
    expect(before.length).toBeLessThan(want.length)
  })
})

describe('single sign-on finds the enterprise entry (audit C05)', () => {
  // the corpus row of @open-mercato/enterprise with the searchable fields of the real descriptor; the aliases reach
  // `_meta` through buildIndexEntry, as `yarn om generate` writes them
  const ENTERPRISE = 'npm:@open-mercato/enterprise'
  const d = Descriptor.parse(parseYaml(readFileSync(join(ROOT, 'modules', '@open-mercato', 'enterprise.yml'), 'utf8')))
  const built = fixtureEntry(fx, ENTERPRISE, { descriptor: d })
  const entries = corpusEntries().map((e) =>
    e.locator === ENTERPRISE
      ? { ...e, summary: built.summary, whenToUse: built.whenToUse, tags: built.tags, _meta: built._meta }
      : e,
  )
  const idx = loadSearchIndex(
    JSON.parse(JSON.stringify(buildSearchIndex({ entries, builtIn: corpusBuiltIn(), ...meta }))) as SearchIndexData,
  )

  it('the built entry carries the aliases of the descriptor', () => {
    expect(built._meta[ALIASES_META_KEY]).toEqual(d.aliases)
  })

  it.each(['single sign on', 'single sign-on', 'oidc', 'openid connect', 'sso', 'two-factor', 'totp', '2fa'])(
    '%s ranks the enterprise entry first',
    (query) => {
      expect(searchModules(idx, { query }).results[0]?.locator).toBe(ENTERPRISE)
    },
  )

  it('no saml alias: the enterprise SSO wizard marks SAML as coming soon', () => {
    expect(d.aliases ?? []).not.toContain('saml')
  })
})
