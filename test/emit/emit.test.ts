// Emitter on the data fixture (spec 4.6, 12.2 WP09): every published file, schemas, contract fields, budgets.
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'
import valid from 'semver/functions/valid.js'
import type { z } from 'zod'
import { loadSearchIndex, searchModules } from '../../lib/core/search.ts'
import {
  checkBudgets,
  ENTRY_AVG_MAX_BYTES,
  ENTRY_LABEL,
  ENTRY_MAX_BYTES,
  entrySizes,
  INDEX_MAX_GZIP_BYTES,
} from '../../lib/emit/budgets.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import { buildPicker } from '../../lib/emit/picker.ts'
import { dataVersion } from '../../lib/emit/modules-json.ts'
import { peersSentence } from '../../lib/emit/compat.ts'
import { Facts, Receipt } from '../../lib/schema/data/index.ts'
import { BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import { CompatIndex } from '../../lib/schema/published/compat.ts'
import {
  AgentSkillsIndex,
  Allowlist,
  ChangesFile,
  McpServerCard,
  ShieldsBadge,
} from '../../lib/schema/published/misc.ts'
import { ModuleDetail, ModuleReceipts, ModulesIndex } from '../../lib/schema/published/modules.ts'
import { PickerIndex } from '../../lib/schema/published/picker.ts'
import { Radar, Surface } from '../../lib/schema/published/radar.ts'
import type { SearchIndexData } from '../../lib/core/search.ts'
import { fixtureData, fixtureEmit, json, NOW, OPTS, SITE, SKILL, text, tmp } from './helpers.ts'

const KSEF = '@fastwhitecat/integration-ksef-direct'
const PATHS = [
  '@fastwhitecat/integration-ksef-direct',
  '@piotrkarwatka/marketing-consents',
  '@fullstackhouse/open-mercato-durable-work',
  '@fullstackhouse/open-mercato-data-sync-durable',
  '@open-mercato/gateway-stripe',
  '@open-mercato/gateway-tpay',
  '@open-mercato/enterprise',
  'github/chmarusso/open-mercato-enrichment-treg',
]

/** Schema of every JSON file the emitter publishes (spec 4.6). */
function schemaOf(path: string): z.ZodType | 'json' | null {
  if (path === 'modules.json') return ModulesIndex
  if (path === 'built-in.json') return BuiltInIndex
  if (path === 'picker.json') return PickerIndex
  if (path === 'compat.json') return CompatIndex
  if (path === 'changes.json') return ChangesFile
  if (path === 'allowlist.json') return Allowlist
  if (path === 'radar/next.json') return Radar
  if (path === 'surface.json') return Surface
  if (path === '.well-known/mcp/server-card.json') return McpServerCard
  if (path === '.well-known/agent-skills/index.json') return AgentSkillsIndex
  if (/^m\/.+\/v\/[^/]+\/facts\.json$/.test(path)) return Facts
  if (/^m\/.+\/receipts\.json$/.test(path)) return ModuleReceipts
  if (/^m\/.+\.json$/.test(path)) return ModuleDetail
  if (/^r\/r_\d{8}_[a-f0-9]{12}(?:_\d{1,3})?\.json$/.test(path)) return Receipt
  if (/^badge\/.+\.json$/.test(path)) return ShieldsBadge
  if (path === 'search-index.json' || /^schema\/.+-1\.json$/.test(path)) return 'json'
  return null
}

describe('published files (spec 4.6)', () => {
  const r = fixtureEmit()

  test('every file of 4.6 exists', () => {
    const want = [
      'modules.json',
      'built-in.json',
      'picker.json',
      'compat.json',
      'changes.json',
      'feed.xml',
      'radar/next.json',
      'radar/next.md',
      'surface.json',
      'search-index.json',
      'llms.txt',
      'llms-full.txt',
      'raw/modules.md',
      'allowlist.json',
      '.well-known/mcp/server-card.json',
      '.well-known/agent-skills/index.json',
      '.well-known/agent-skills/om-find-module/SKILL.md',
      'robots.txt',
      ...['descriptor', 'modules', 'compat', 'facts', 'receipt', 'tools'].map((n) => `schema/${n}-1.json`),
      ...PATHS.flatMap((p) => [
        `m/${p}.json`,
        `m/${p}.md`,
        `m/${p}/receipts.json`,
        `badge/${p}.svg`,
        `badge/${p}.json`,
      ]),
      `m/${KSEF}/v/0.1.8/facts.json`,
    ]
    for (const p of want) expect(r.public.has(p), p).toBe(true)
    // receipts of every module and the baselines, of both presets (the fixture's classic rows copy the empty ones)
    expect([...r.public.keys()].filter((p) => p.startsWith('r/')).length).toBe(14)
  })

  test('every JSON file validates with its schema', () => {
    let checked = 0
    for (const path of r.public.keys()) {
      if (!path.endsWith('.json')) continue
      const schema = schemaOf(path)
      expect(schema, `no schema for ${path}`).not.toBeNull()
      const value = json(r, path)
      if (schema !== 'json' && schema !== null) {
        const res = schema.safeParse(value)
        expect(res.success, `${path}: ${res.success ? '' : JSON.stringify(res.error.issues[0])}`).toBe(true)
      }
      checked++
    }
    expect(checked).toBeGreaterThan(50)
  })

  test('modules.json carries dataVersion, dataAsOf, features.cliSearch and officialCoverage', () => {
    const m = json<ModulesIndex>(r, 'modules.json')
    expect(m.$schema).toBe(`${SITE}/schema/modules-1.json`)
    expect(valid(m.dataVersion)).toBe(m.dataVersion)
    expect(m.dataVersion).toMatch(/^1\.0\.0-202610230305\.h[0-9a-f]{6}$/)
    expect(m.dataAsOf).toEqual({ nightly: '2026-10-23T02:17:00Z', npm: '2026-10-23T00:17:00Z', source: 'ci' })
    expect(m.features).toEqual({ cliSearch: false })
    expect(m.officialCoverage).toEqual({ listed: 3, missing: [] })
    expect(m.counts).toEqual({ entries: 8, listed: 8, modules: 8, verifiedOnLatest: 3, omQuality: 0, builtIn: 3 })
    expect(m.builtIn).toEqual({ coreVersion: '0.9.0', count: 3, href: `${SITE}/built-in.json` })
    // the baseline of a new app (classic: api_keys on, no patch) and the one of the empty preset (24 Oct)
    expect(m.lines.map((l) => [l.key, l.baseline?.status, l.baseline?.patches])).toEqual([
      ['0.9', 'verified', []],
      ['0.8', undefined, undefined],
      ['next', 'verified', []],
    ])
    expect(m.lines.map((l) => [l.key, l.isolationBaseline?.patches])).toEqual([
      ['0.9', ['api-keys']],
      ['0.8', undefined],
      ['next', []],
    ])
    // installable fallback of WP08 travels in _meta (plans and policies read it)
    const ksef = m.entries.find((e) => e.npm === KSEF)!
    expect(ksef._meta['com.openmercato.modules/installable']).toEqual({ '0.9': '0.1.8', '0.8': '0.1.8', next: '0.1.8' })
  })

  test('dataVersion with a hash starting with zeros is valid SemVer (h prefix, spec 4.7)', () => {
    const v = dataVersion('2026-10-24T03:41:00Z', '001234')
    expect(v).toBe('1.0.0-202610240341.h001234')
    expect(valid(v)).toBe(v)
    expect(valid('1.0.0-202610240341.001234')).toBeNull()
  })

  test('the hash covers the content, not the clock', () => {
    const data = fixtureData()
    const a = buildEmit(data, OPTS)
    const b = buildEmit(data, { ...OPTS, now: '2026-10-23T09:00:00Z' })
    const ha = json<ModulesIndex>(a, 'modules.json').dataVersion.split('.h')[1]
    const hb = json<ModulesIndex>(b, 'modules.json').dataVersion.split('.h')[1]
    expect(ha).toBe(hb)
  })

  test('features.cliSearch follows policy/site.yml cliSearchSince', () => {
    const data = fixtureData()
    expect(json<ModulesIndex>(buildEmit({ ...data, cliSearchSince: '0.9.0' }, OPTS), 'modules.json').features).toEqual({
      cliSearch: true,
    })
    expect(json<ModulesIndex>(buildEmit({ ...data, cliSearchSince: '0.9.1' }, OPTS), 'modules.json').features).toEqual({
      cliSearch: false,
    })
  })

  test('officialCoverage comes from data/official-coverage.json', () => {
    const data = fixtureData()
    const out = buildEmit(
      {
        ...data,
        coverage: { at: NOW, listed: 24, missing: ['@open-mercato/new-thing'], packages: [] },
      },
      OPTS,
    )
    expect(json<ModulesIndex>(out, 'modules.json').officialCoverage).toEqual({
      listed: 24,
      missing: ['@open-mercato/new-thing'],
    })
  })

  test('module detail = IndexEntry + facts of the judged version + receipt transitions', () => {
    const d = json<ModuleDetail>(r, `m/${KSEF}.json`)
    expect(d.facts?.package.version).toBe('0.1.8')
    expect(d.receipts.length).toBeGreaterThan(0)
    expect(d.receipts.every((x) => x.transition.from !== x.transition.to)).toBe(true)
    const rec = json<ModuleReceipts>(r, `m/${KSEF}/receipts.json`)
    expect(Object.keys(rec.lines).sort()).toEqual(['0.9', 'next'])
  })

  test('enterprise anatomy is not published: no facts in the detail, no facts files, no facts link', () => {
    const d = json<ModuleDetail>(r, 'm/@open-mercato/enterprise.json')
    expect(d.facts).toBeNull()
    expect(d.anatomy).toBeNull()
    expect(d.links.facts).toBeNull()
    expect([...r.public.keys()].some((p) => p.startsWith('m/@open-mercato/enterprise/v/'))).toBe(false)
    expect(text(r, 'm/@open-mercato/enterprise.md')).toContain('Anatomy not published. Commercial license.')
  })

  test('the old name of a renamed entry gets a redirect page that stays on the serving host (review r4)', () => {
    const html = text(r, 'm/@fast-white-cat/integration-ksef-direct.html')
    // m/@fast-white-cat/integration-ksef-direct sits two directories below the base
    expect(html).toContain(`<meta http-equiv="refresh" content="0; url=../../m/${KSEF}">`)
    expect(html).toContain(`<a href="../../m/${KSEF}">`)
    expect(html).toContain(`<link rel="canonical" href="${SITE}/m/${KSEF}">`)
  })

  test('allowlist.json has no refuse entries (spec 4.6)', () => {
    const m = json<ModulesIndex>(r, 'modules.json')
    const a = json<z.infer<typeof Allowlist>>(r, 'allowlist.json')
    expect(a.locators.length).toBeGreaterThan(0)
    for (const loc of a.locators) {
      const e = m.entries.find((x) => x.locator === loc)!
      expect(e.agentPolicy['0.9']?.decision).not.toBe('refuse')
      expect(e.status).toBe('active')
      expect(e.tier).not.toBeNull()
    }
    // consents is refuse BROKEN on 0.9 and the GitHub-only treg has no pinned tag: both stay out
    expect(a.locators).not.toContain('npm:@piotrkarwatka/marketing-consents')
    expect(a.locators).not.toContain('github:Chmarusso/open-mercato-enrichment-treg')
  })

  test('picker.json installByLine pins the version verified on each line, not the latest line (D46)', () => {
    const index = json<z.infer<typeof ModulesIndex>>(r, 'modules.json')
    const ksef = index.entries.find((e) => e.npm === KSEF)
    if (!ksef) throw new Error('missing ksef')
    const entry = {
      ...ksef,
      version: { ...ksef.version, latest: '0.2.0', recommended: { '0.9': '0.2.0', '0.8': '0.1.2', next: null } },
      compat: { ...ksef.compat, verifiedOn: ['0.9', '0.8'] },
    }
    const picker = buildPicker([entry], [], index.lines, null, NOW)
    const m = picker.modules[0]
    expect(m?.install).toBe(ksef.install.cli)
    expect(m?.installByLine).toEqual({
      '0.9': `yarn mercato module add ${KSEF}@0.2.0 --allow-third-party`,
      '0.8': `yarn mercato module add ${KSEF}@0.1.2 --allow-third-party`,
    })
  })

  test('picker.json maps 1:1 to CatalogModule (spec 9.2): only listed kind module, plus core', () => {
    const p = json<z.infer<typeof PickerIndex>>(r, 'picker.json')
    const keys = [
      'id',
      'from',
      'title',
      'description',
      'requires',
      'source',
      'locator',
      'license',
      'tier',
      'verifiedOn',
      'install',
      'installByLine',
    ]
    // `inPresets` (additive, 24 Oct) only where a new app already registers the module, and `presetNote` (round 13)
    // only when that includes the latest line, whose `install` is then the command of an app from the empty preset
    for (const m of p.modules) {
      expect(
        Object.keys(m)
          .filter((k) => k !== 'inPresets' && k !== 'presetNote')
          .sort(),
      ).toEqual([...keys].sort())
      const latestIn = (m.inPresets ?? []).includes(p.lines[0] ?? '')
      expect(m.presetNote).toBe(
        latestIn ? `Nothing to install: a new app already registers ${m.id} in src/modules.ts.` : undefined,
      )
    }
    // CatalogModule { id, from, title, description, requires, source } is a projection
    const catalogModule = p.modules.map(({ id, from, title, description, requires, source }) => ({
      id,
      from,
      title,
      description,
      requires,
      source,
    }))
    expect(catalogModule.length).toBe(p.modules.length)
    expect(new Set(p.modules.map((m) => `${m.from}#${m.id}`)).size).toBe(p.modules.length)
    expect(p.modules.find((m) => m.id === 'integration_ksef_direct')).toMatchObject({
      source: 'third-party',
      verifiedOn: ['0.9', 'next'],
      install: `yarn mercato module add ${KSEF}@0.1.8 --allow-third-party`,
    })
    // one command per verified line, with the version verified on that line (D46); the latest line repeats install;
    // none on a line whose new app (classic, what create-mercato-app makes) already registers the module (24 Oct)
    for (const m of p.modules) {
      const own = m.verifiedOn.filter((k) => !(m.inPresets ?? []).includes(k))
      expect(Object.keys(m.installByLine).sort()).toEqual([...own].sort())
      if (own.includes(p.lines[0] ?? '')) expect(m.installByLine[p.lines[0] ?? '']).toBe(m.install)
    }
    // gateway-stripe: verified on 0.9, where a new app already has it, so the picker offers no command there
    expect(p.modules.find((m) => m.id === 'gateway_stripe')).toMatchObject({
      verifiedOn: ['0.9'],
      installByLine: {},
      inPresets: ['0.8', '0.9', 'next'],
    })
    expect(p.modules.find((m) => m.id === 'integration_ksef_direct')?.installByLine).toEqual({
      '0.9': `yarn mercato module add ${KSEF}@0.1.8 --allow-third-party`,
      next: `yarn mercato module add ${KSEF}@0.1.8 --allow-third-party`,
    })
    // a module of the enterprise package is turned on in .env, as a new app does it (audit of 29 Oct, C02: `module add
    // --module sso` added it a second time, with no flag)
    expect(p.modules.find((m) => m.id === 'sso')?.install).toBe(
      'echo OM_ENABLE_ENTERPRISE_MODULES=true >> .env && echo OM_ENABLE_ENTERPRISE_MODULES_SSO=true >> .env && yarn generate',
    )
    expect(p.modules.find((m) => m.id === 'record_locks')?.install).toBe(
      'echo OM_ENABLE_ENTERPRISE_MODULES=true >> .env && yarn generate',
    )
    for (const m of p.modules.filter((x) => x.source === 'enterprise')) {
      expect(m.install, m.id).not.toContain('module add')
      for (const c of Object.values(m.installByLine)) expect(c, m.id).not.toContain('module add')
    }
    expect(p.modules.find((m) => m.id === 'sso')?.source).toBe('enterprise')
    expect(p.modules.filter((m) => m.source === 'core').map((m) => m.install)).toEqual([
      'yarn mercato module enable @open-mercato/core --module currencies',
      'yarn mercato module enable @open-mercato/core --module data_sync',
      'yarn mercato module enable @open-mercato/core --module wms',
    ])
    // GitHub-only entries have no npm name and cannot be picked
    expect(p.modules.some((m) => m.locator.startsWith('github:'))).toBe(false)
  })

  test('built-in.json uses module enable and the categories of policy/builtin-categories.yml', () => {
    const b = json<z.infer<typeof BuiltInIndex>>(r, 'built-in.json')
    expect(b.coreVersion).toBe('0.9.0')
    expect(b.modules.map((m) => [m.id, m.category, m.wedge])).toEqual([
      ['currencies', 'payments-finance', 'money'],
      ['data_sync', 'integrations-sync', 'connect'],
      ['wms', 'warehouse-shipping', 'operate'],
    ])
    for (const m of b.modules) {
      expect(m.install).toBe(`yarn mercato module enable @open-mercato/core --module ${m.id}`)
      expect(m.anatomy.counts.routes).toBeNull()
    }
  })

  test('compat.json: baseline, rows of listed modules, peers sentence from data', () => {
    const c = json<z.infer<typeof CompatIndex>>(r, 'compat.json')
    expect(Object.keys(c.baseline).sort()).toEqual(['0.9', 'next'])
    expect(c.rows.map((x) => x.path)).toContain(KSEF)
    const ksef = c.rows.find((x) => x.path === KSEF)!
    expect(ksef.cells['0.9']).toMatchObject({ status: 'verified', fit: 'ok' })
    expect(ksef.cells['0.8']).toMatchObject({ status: 'untested', receipt: null })
    expect(c.peersRejectFitting.fitting).toBeGreaterThanOrEqual(c.peersRejectFitting.rejected)
    expect(r.meta.peersSentence).toBe(peersSentence(c.peersRejectFitting))
  })

  test('peers sentence follows the data (spec 0.8, WP06 deviation 1)', () => {
    expect(peersSentence({ rejected: 53, fitting: 62 })).toBe(
      'Peer ranges reject 53 of 62 combinations that fit statically.',
    )
    expect(peersSentence({ rejected: 0, fitting: 5 })).toBe(
      'Peer ranges accept all 5 combinations that fit statically.',
    )
    expect(peersSentence({ rejected: 0, fitting: 0 })).toBe('No combination fits statically yet.')
  })

  test('search-index.json loads and answers with the core search', () => {
    const s = loadSearchIndex(json<SearchIndexData>(r, 'search-index.json'))
    const out = searchModules(s, { query: 'ksef' })
    expect(out.results[0]?.locator).toBe(`npm:${KSEF}`)
    expect(searchModules(s, { query: 'exchange rates' }).builtIn[0]?.id).toBe('currencies')
  })

  test('agent skills index: digest of the published SKILL.md bytes', () => {
    const idx = json<z.infer<typeof AgentSkillsIndex>>(r, '.well-known/agent-skills/index.json')
    expect(idx.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json')
    expect(idx.skills).toHaveLength(1)
    const s = idx.skills[0]!
    expect(s.name).toBe('om-find-module')
    expect(s.url).toBe(`${SITE}/.well-known/agent-skills/om-find-module/SKILL.md`)
    const published = r.public.get('.well-known/agent-skills/om-find-module/SKILL.md') as Uint8Array
    const digest = createHash('sha256').update(published).digest('hex')
    expect(s.digest).toBe(`sha256:${digest}`)
    expect(createHash('sha256').update(SKILL).digest('hex')).toBe(digest)
  })

  test('server card carries the five tools and the MCP URL', () => {
    const card = json<z.infer<typeof McpServerCard>>(r, '.well-known/mcp/server-card.json')
    expect(card.transport.url).toBe(OPTS.mcpUrl)
    expect(card.tools.map((t) => t.name)).toEqual([
      'search_modules',
      'get_module',
      'check_compat',
      'plan_install',
      'get_changes',
    ])
  })

  test('robots.txt: noindex phase on github.io, sitemap on the domain (D36)', () => {
    expect(text(r, 'robots.txt')).toBe('User-agent: *\nDisallow: /\n')
    const dom = buildEmit(fixtureData(), { ...OPTS, site: 'https://modules.openmercato.com', base: '/' })
    expect(text(dom, 'robots.txt')).toContain('Sitemap: https://modules.openmercato.com/sitemap-index.xml')
    expect(json<ModulesIndex>(dom, 'modules.json').entries[0]?.links.page).toMatch(
      /^https:\/\/modules\.openmercato\.com\/m\//,
    )
  })

  test('changes.json: last 90 days, newest first', () => {
    const c = json<{ at: string }[]>(r, 'changes.json')
    expect(c.length).toBeGreaterThan(0)
    const times = c.map((x) => Date.parse(x.at))
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    const later = buildEmit(fixtureData(), { ...OPTS, now: '2027-03-01T00:00:00Z' })
    expect(json<unknown[]>(later, 'changes.json')).toEqual([])
    expect(text(r, 'feed.xml')).toMatch(
      /^<\?xml version="1.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/,
    )
  })
})

describe('Fit per line (E5)', () => {
  test('the context Fit of every line is the Fit of the install version of that line, as in signals.fit', async () => {
    const { buildEntryContexts } = await import('../../lib/emit/modules-json.ts')
    const data = fixtureData()
    // gateway-stripe: 0.9.0 does not fit 0.8, its lockstep 0.8.0 does
    const loc = 'npm:@open-mercato/gateway-stripe'
    const f08 = data.fit.get('0.8.0')!
    const c09 = data.fit.get('0.9.0')!.cells[`${loc}@0.9.0`]!
    f08.cells[`${loc}@0.9.0`] = { ...c09, status: 'no-fit' }
    f08.cells[`${loc}@0.8.0`] = { ...c09, status: 'drift' }
    const ctxs = buildEntryContexts(data, OPTS, () => {})
    for (const c of ctxs)
      for (const [line, status] of Object.entries(c.entry.signals.fit))
        expect(c.fit[line]?.status ?? 'unknown', `${c.entry.locator} ${line}`).toBe(status)
    const stripe = ctxs.find((c) => c.entry.locator === loc)!
    expect(stripe.entry.signals.fit['0.8']).toBe('drift')
    expect(stripe.entry._meta['com.openmercato.modules/installable']).toMatchObject({ '0.8': '0.8.0' })
  })
})

describe('feed.xml entry IDs', () => {
  const entryIds = (xml: string): string[] => [...xml.matchAll(/<entry>\n {4}<id>([^<]+)<\/id>/g)].map((m) => m[1]!)

  test('an older change keeps its ID when a newer change arrives (no position in the ID)', () => {
    const opts = { ...OPTS, now: '2026-10-23T04:00:00Z' }
    const before = entryIds(text(buildEmit(fixtureData(), opts), 'feed.xml'))
    expect(before.length).toBeGreaterThan(1)
    const data = fixtureData()
    data.changes.push({ at: '2026-10-23T03:30:00Z', type: 'new-version', locator: `npm:${KSEF}`, version: '9.9.9' })
    const after = entryIds(text(buildEmit(data, opts), 'feed.xml'))
    expect(after).toHaveLength(before.length + 1)
    expect(after[0]).toBe(`${SITE}/changes.json#2026-10-23T03:30:00Z~new-version~npm:${KSEF}~version=9.9.9`)
    expect(after.slice(1)).toEqual(before)
    expect(new Set(after).size).toBe(after.length)
  })
})

describe('radar/next.md', () => {
  test('module titles in one cell are separated by semicolons, so a title with commas stays one module', async () => {
    const { radarMarkdown } = await import('../../lib/emit/radar.ts')
    const md = radarMarkdown(
      {
        next: '0.10.0-rc.1',
        base: '0.9.0',
        generatedAt: NOW,
        summary: 'One changed API.',
        changedApis: [{ symbol: 'X#y', change: 'signature', modules: ['npm:@a/cpq', 'npm:@a/billing'] }],
        staticBreaks: [],
        sameFailure: [{ step: 'build', signature: 'TS2345', modules: ['npm:@a/cpq', 'npm:@a/billing'] }],
        receiptsOnNext: { verified: 0, broken: 0 },
        loadBearing: [],
      } as unknown as z.infer<typeof Radar>,
      new Map([
        ['npm:@a/cpq', 'Configure, Price, Quote'],
        ['npm:@a/billing', 'Billing'],
      ]),
    )
    expect(md).toContain('| `X#y` | signature | Configure, Price, Quote; Billing |')
    expect(md).toContain('| build | `TS2345` | Configure, Price, Quote; Billing |')
  })
})

describe('radar receipts on next (review r3)', () => {
  test('radar/next.json counts the next cells of the listed entries, as the run panel on / does', async () => {
    const { lineVerdicts } = await import('../../lib/core/lines.ts')
    const r = fixtureEmit()
    const radar = json<z.infer<typeof Radar>>(r, 'radar/next.json')
    const index = json<z.infer<typeof ModulesIndex>>(r, 'modules.json')
    const v = lineVerdicts(index.entries, 'next')
    expect(radar.receiptsOnNext).toEqual({ verified: v.verified, broken: v.broken })
    for (const m of radar.summary.matchAll(/Receipts on next: (\d+) verified, (\d+) broken\./g))
      expect([Number(m[1]), Number(m[2])]).toEqual([v.verified, v.broken])
    expect(text(r, 'radar/next.md')).toContain(`Receipts on next: ${v.verified} verified, ${v.broken} broken.`)
  })

  test('a radar computed before the night is collected still shows the night', async () => {
    const { radarWithReceipts } = await import('../../lib/emit/radar.ts')
    const before = {
      summary: '1 of 2 modules use APIs that changed. 0 break statically. Receipts on next: 0 verified, 0 broken.',
      receiptsOnNext: { verified: 0, broken: 0 },
    } as z.infer<typeof Radar>
    const rows = [
      { listed: true, compat: { lines: { next: { status: 'verified' as const } } } },
      { listed: true, compat: { lines: { next: { status: 'broken' as const } } } },
      { listed: false, compat: { lines: { next: { status: 'verified' as const } } } },
    ]
    const after = radarWithReceipts(before, rows)
    expect(after.receiptsOnNext).toEqual({ verified: 1, broken: 1 })
    expect(after.summary).toBe(
      '1 of 2 modules use APIs that changed. 0 break statically. Receipts on next: 1 verified, 1 broken.',
    )
  })
})

describe('budgets (spec 4.6)', () => {
  test('the fixture stays within every file budget, including the per-entry one (E1)', () => {
    expect(checkBudgets(fixtureEmit().public)).toEqual([])
  })

  // Orchestrator decision E1 (curator errata), round 13: 6 KB per modules.json entry on average, 10 KB for the
  // largest one (the anatomy lists the install plan reads stay whole) and 60 KB gzip for the file.
  test('E1: entries at most 6 KB on average and 10 KB each, the file at most 60 KB gzip', () => {
    const r = fixtureEmit()
    const s = entrySizes(json<ModulesIndex>(r, 'modules.json'))
    expect(s.count).toBe(8)
    expect(ENTRY_MAX_BYTES).toBe(10 * 1024)
    expect(ENTRY_AVG_MAX_BYTES).toBe(6 * 1024)
    expect(INDEX_MAX_GZIP_BYTES).toBe(60 * 1024)
    expect(s.over).toBe(0)
    expect(s.max).toBeLessThanOrEqual(ENTRY_MAX_BYTES)
    expect(s.average).toBeLessThanOrEqual(ENTRY_AVG_MAX_BYTES)
    expect(gzipSync(text(r, 'modules.json')).length).toBeLessThanOrEqual(INDEX_MAX_GZIP_BYTES)
  })

  test('an entry over 10 KB is counted and reported in one line', () => {
    const r = fixtureEmit()
    const index = json<ModulesIndex>(r, 'modules.json')
    const big = { ...index.entries[0]!, summary: 'x'.repeat(11 * 1024) }
    const files = new Map(r.public)
    files.set('modules.json', JSON.stringify({ ...index, entries: [big, ...index.entries.slice(1)] }))
    const issue = checkBudgets(files).find((i) => i.label.startsWith(ENTRY_LABEL))!
    expect(issue.bytes).toBeGreaterThan(ENTRY_MAX_BYTES)
    expect(issue.max).toBe(ENTRY_MAX_BYTES)
    expect(issue.label.startsWith(`${ENTRY_LABEL}: 1 of 8 entries over, largest ${big.locator}, average `)).toBe(true)
  })

  test('cards stay under 20 KB: an oversized README is cut inside its fence with the marker', async () => {
    const { moduleCard } = await import('../../lib/emit/markdown.ts')
    const { buildEntryContexts } = await import('../../lib/emit/modules-json.ts')
    const data = fixtureData()
    const ctx = buildEntryContexts(data, OPTS, () => {}).find((c) => c.entry.npm === KSEF)!
    const big = { ...ctx, facts: { ...ctx.facts!, readmeExcerpt: 'line with ``` fence\n'.repeat(2000) } }
    const card = moduleCard({
      ctx: big,
      lines: data.lines!.lines,
      site: SITE,
      dataVersion: '1.0.0-1.h000000',
      plan: null,
    })
    expect(Buffer.byteLength(card)).toBeLessThanOrEqual(20 * 1024)
    expect(card).toContain(`[truncated, see ${SITE}/m/${KSEF}]`)
    // the fence is longer than any backtick run of the README, so the README cannot close it
    expect(card).toContain('````text\n')
    for (const [path, v] of fixtureEmit().public)
      if (path.endsWith('.md') && path.startsWith('m/'))
        expect(Buffer.byteLength(v as string)).toBeLessThanOrEqual(20 * 1024)
  })
})

describe('empty data (first day, spec 5.2 pages.yml)', () => {
  test('emit on a missing data branch gives valid files and empty states', () => {
    const empty = tmp()
    const out = buildEmit(fixtureData({ data: `${empty}/none` }), OPTS)
    const m = json<ModulesIndex>(out, 'modules.json')
    expect(ModulesIndex.safeParse(m).success).toBe(true)
    expect(m.lines).toEqual([])
    expect(m.dataAsOf).toEqual({ nightly: null, npm: null, source: null })
    expect(m.builtIn.coreVersion).toBe('0.9.0') // pinned @open-mercato/cli
    expect(m.entries).toHaveLength(8)
    expect(m.entries.every((e) => !e.listed)).toBe(true)
    expect(out.meta.firstNight).toBe(true)
    expect(out.public.has('radar/next.json')).toBe(false)
    expect(out.public.has('surface.json')).toBe(false)
    for (const p of ['built-in.json', 'picker.json', 'compat.json', 'changes.json', 'allowlist.json', 'llms.txt'])
      expect(out.public.has(p), p).toBe(true)
  })
})
