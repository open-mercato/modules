// Fixture loading for test/core: IndexEntry and BuiltInModule built from test/fixtures/data through lib/core,
// plus the 59-entry corpus of test/core/fixtures/corpus.json for search and plans.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { buildIndexEntry, builtInModule, withSlotConflicts, type CatalogRef } from '../../lib/core/entry.ts'
import { judgedFacts } from '../../lib/core/health.ts'
import type { LineInfo } from '../../lib/core/lines.ts'
import { CategoriesFile } from '../../lib/schema/policy.ts'
import { Descriptor } from '../../lib/schema/descriptor.ts'
import { descriptorLocator, locatorToPath } from '../../lib/schema/locator.ts'
import {
  BuiltinData,
  Claims,
  Facts,
  FitResult,
  Lines,
  Presets,
  Receipt,
  Stats,
  SyncRecord,
  type FitCell,
} from '../../lib/schema/data/index.ts'
import { BuiltInModule, type BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import { IndexEntry, type AnatomySummary } from '../../lib/schema/published/modules.ts'
import type { CategoryId, Wedge } from '../../lib/schema/common.ts'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DATA = join(ROOT, 'test', 'fixtures', 'data')
export const DESCRIPTORS = join(ROOT, 'test', 'fixtures', 'descriptors', 'valid', 'modules')
export const GOLDEN = join(ROOT, 'test', 'core', 'golden')
export const SITE = 'https://wojciechszyjka.github.io/modules'
/** Clock of the fixture (`computedAt` of the WP01 snapshot). */
export const NOW = '2026-10-23T03:05:00Z'

export const LOC = {
  ksef: 'npm:@fastwhitecat/integration-ksef-direct',
  consents: 'npm:@piotrkarwatka/marketing-consents',
  durable: 'npm:@fullstackhouse/open-mercato-durable-work',
  datasync: 'npm:@fullstackhouse/open-mercato-data-sync-durable',
  stripe: 'npm:@open-mercato/gateway-stripe',
  tpay: 'npm:@open-mercato/gateway-tpay',
  enterprise: 'npm:@open-mercato/enterprise',
  treg: 'github:Chmarusso/open-mercato-enrichment-treg',
} as const

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

export const rel = (from: string, p: string) => relative(from, p).split(sep).join('/')
export const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'))
export const readJsonl = (p: string): unknown[] =>
  existsSync(p)
    ? readFileSync(p, 'utf8')
        .split('\n')
        .filter((l) => l.trim() !== '')
        .map((l) => JSON.parse(l) as unknown)
    : []

/** Spec 4.4 categories of the three fixture built-ins. */
const BUILTIN_CATEGORY: Record<string, CategoryId> = {
  currencies: 'payments-finance',
  data_sync: 'integrations-sync',
  wms: 'warehouse-shipping',
}

export function wedges(): Record<string, Wedge> {
  const file = CategoriesFile.parse(parse(readFileSync(join(ROOT, 'policy', 'categories.yml'), 'utf8')))
  return Object.fromEntries(file.categories.map((c) => [c.id, c.wedge]))
}

export interface Fixture {
  lines: Lines
  presets: Presets
  claims: Claims
  stats: Stats
  builtin: BuiltinData
  descriptors: Map<string, Descriptor>
  sync: (loc: string) => SyncRecord | null
  facts: (loc: string, version: string | null) => Facts | null
  fit: (loc: string, version: string | null) => Record<string, FitCell | null>
  receipts: (loc: string) => Receipt[]
}

export function loadFixture(data = DATA): Fixture {
  const lines = Lines.parse(readJson(join(data, 'lines.json')))
  const descriptors = new Map<string, Descriptor>()
  for (const f of walk(DESCRIPTORS).filter((p) => p.endsWith('.yml'))) {
    const d = Descriptor.parse(parse(readFileSync(f, 'utf8')))
    descriptors.set(descriptorLocator(d), d)
  }
  return {
    lines,
    presets: Presets.parse(readJson(join(data, 'presets.json'))),
    claims: Claims.parse(readJson(join(data, 'claims.json'))),
    stats: Stats.parse(readJson(join(data, 'stats.json'))),
    builtin: BuiltinData.parse(readJson(join(data, 'builtin', '0.9.0.json'))),
    descriptors,
    sync: (loc) => {
      const p = join(data, 'sync', `${locatorToPath(loc)}.json`)
      return existsSync(p) ? SyncRecord.parse(readJson(p)) : null
    },
    facts: (loc, version) => {
      if (!version) return null
      const p = join(data, 'facts', locatorToPath(loc), `${version}.json`)
      return existsSync(p) ? Facts.parse(readJson(p)) : null
    },
    fit: (loc, version) => {
      const out: Record<string, FitCell | null> = {}
      for (const l of lines.lines) {
        const p = join(data, 'fit', `${l.version}.json`)
        out[l.key] = version && existsSync(p) ? (FitResult.parse(readJson(p)).cells[`${loc}@${version}`] ?? null) : null
      }
      return out
    },
    receipts: (loc) => readJsonl(join(data, 'receipts', `${locatorToPath(loc)}.jsonl`)).map((r) => Receipt.parse(r)),
  }
}

export const currentVersion = (s: SyncRecord | null): string | null =>
  s?.npm ? (s.npm.latestStable ?? s.npm.preview) : null

export interface EntryOverrides {
  sync?: SyncRecord | null
  receipts?: Receipt[]
  descriptor?: Descriptor
  now?: string
}

/** IndexEntry of a fixture entry through lib/core (health + entry), validated. */
export function fixtureEntry(fx: Fixture, loc: string, o: EntryOverrides = {}): IndexEntry {
  const d = o.descriptor ?? fx.descriptors.get(loc)
  if (!d) throw new Error(`no descriptor for ${loc}`)
  const sync = o.sync !== undefined ? o.sync : fx.sync(loc)
  const receipts = o.receipts ?? fx.receipts(loc)
  // facts and Fit of the judged version, as `yarn om health` loads them (no copying between versions)
  const judged = judgedFacts({ locator: loc, sync, receipts, lines: fx.lines.lines, now: o.now ?? NOW }, (v) =>
    fx.facts(loc, v),
  )
  return IndexEntry.parse(
    buildIndexEntry({
      locator: loc,
      descriptor: d,
      descriptorIssues: [],
      sync,
      facts: judged.facts,
      fit: fx.fit(loc, judged.version),
      receipts,
      lines: fx.lines.lines,
      claims: fx.claims,
      presets: fx.presets,
      stats: fx.stats,
      site: SITE,
      now: o.now ?? NOW,
      catalog: fixtureCatalog(fx),
    }),
  )
}

/**
 * Review round 2 scenario: consents 0.1.0 is confirmed broken on 0.9 (fixture), then 0.1.1 is published on
 * 21 Oct and gets a quarantine receipt (installable from 26 Oct). No facts or Fit exist for 0.1.1.
 */
export function consentsBrokenThenGated(fx: Fixture): { sync: SyncRecord; receipts: Receipt[] } {
  const sync = structuredClone(fx.sync(LOC.consents) as SyncRecord)
  const n = sync.npm!
  n.previousStable = '0.1.0'
  n.latestStable = '0.1.1'
  n.distTags = { latest: '0.1.1' }
  n.publishedAt = { '0.1.1': '2026-10-21T10:00:00Z', '0.1.0': '2026-10-14T11:49:41Z' }
  const base = fx.receipts(LOC.consents)
  const q = structuredClone(base.find((r) => r.om.line === '0.9' && r.om.preset === 'classic') as Receipt)
  q.id = 'r_20261023_00000000aa01'
  q.module!.version = '0.1.1'
  q.steps = []
  q.result = {
    status: 'quarantine',
    failedStep: null,
    alsoFailed: [],
    classification: 'quarantine',
    quarantineUntil: '2026-10-26',
  }
  q.transition = { from: null, to: 'quarantine', confirmed: true }
  q.run.at = '2026-10-23T02:50:00Z'
  return { sync: SyncRecord.parse(sync), receipts: [...base, Receipt.parse(q)] }
}

/**
 * Review round 2 scenario: durable-work 0.7.0 published on 21 Oct (age gate until 26 Oct), 0.6.0 verified on
 * 0.9 (fixture). No facts, Fit or receipts exist for 0.7.0 yet.
 */
export function durableGatedRelease(fx: Fixture): SyncRecord {
  const sync = structuredClone(fx.sync(LOC.durable) as SyncRecord)
  const n = sync.npm!
  n.previousStable = '0.6.0'
  n.latestStable = '0.7.0'
  n.distTags = { ...n.distTags, latest: '0.7.0' }
  n.publishedAt['0.7.0'] = '2026-10-21T10:00:00Z'
  return SyncRecord.parse(sync)
}

/** Catalog references of the fixture descriptors (peer requires). */
export function fixtureCatalog(fx: Fixture): CatalogRef[] {
  return [...fx.descriptors.entries()].map(([locator, d]) => ({ locator, npm: d.npm ?? null, kind: d.kind }))
}

export function fixtureEntries(fx: Fixture): IndexEntry[] {
  return withSlotConflicts([...fx.descriptors.keys()].sort().map((loc) => fixtureEntry(fx, loc)))
}

export function fixtureBuiltIn(fx: Fixture): BuiltInModule[] {
  const w = wedges()
  return fx.builtin.modules.map((m) => {
    const category = BUILTIN_CATEGORY[m.id] ?? 'operations'
    return BuiltInModule.parse(
      builtInModule({
        module: m,
        coreVersion: fx.builtin.coreVersion,
        category,
        wedge: w[category] ?? 'operate',
        presets: fx.presets,
        routesMeasured: fx.builtin.routesMeasured,
      }),
    )
  })
}

export function builtInIndex(mods: BuiltInModule[]): BuiltInIndex {
  return { schemaVersion: 1, coreVersion: '0.9.0', generatedAt: NOW, modules: mods }
}

export const lineInfo = (fx: Fixture): LineInfo[] => fx.lines.lines

// ---------------------------------------------------------------------------------------------------------
// corpus (test/core/fixtures/corpus.json)

interface CorpusRow {
  locator: string
  path: string
  npm: string | null
  kind: IndexEntry['kind']
  type: IndexEntry['type']
  category: CategoryId
  status: 'active' | 'hold'
  title: string
  summary: string
  whenToUse: string
  tags: string[]
  providers: { name: string; label: string }[]
  renamedFrom: string[]
  replaces: string[]
  supersededBy: string | null
  moduleIds: string[]
  requires: { raw: string; resolvesTo: string | null }[]
  license: { spdx: string | null; kind: IndexEntry['license']['kind'] }
  version: string | null
  anatomy: { tables: string[]; eventsEmitted: string[]; aclFeatures: string[] } | null
}

interface CorpusBuiltIn {
  id: string
  title: string
  description: string
  category: CategoryId
  tables: string[]
  eventsEmitted: string[]
  aclFeatures: string[]
  requires: string[]
}

const corpus = () =>
  readJson(join(ROOT, 'test', 'core', 'fixtures', 'corpus.json')) as { entries: CorpusRow[]; builtIn: CorpusBuiltIn[] }

function summaryOf(
  a: { tables: string[]; eventsEmitted: string[]; aclFeatures: string[] },
  version: string,
): AnatomySummary {
  return {
    version,
    coverage: 'partial',
    counts: {
      entities: a.tables.length,
      tables: a.tables.length,
      migrations: a.tables.length > 0 ? 1 : 0,
      routes: null,
      publicRoutes: null,
      aclFeatures: a.aclFeatures.length,
      eventsEmitted: a.eventsEmitted.length,
      eventsConsumed: 0,
      backendPages: 0,
      frontendPages: 0,
      widgets: 0,
      workers: 0,
      cli: 0,
      aiTools: 0,
      aiAgents: 0,
      extends: 0,
    },
    lists: {
      aclFeatures: a.aclFeatures.slice(0, 20),
      eventsEmitted: a.eventsEmitted.slice(0, 20),
      eventsConsumed: [],
      env: [],
      hosts: [],
      tables: a.tables.slice(0, 20),
      publicRoutes: [],
      credentials: [],
    },
    callout: '',
    diff: null,
  }
}

/** Corpus row to a listed IndexEntry (no receipts: Listed on every line). */
export function corpusEntry(r: CorpusRow): IndexEntry {
  const version = r.version && /^\d+\.\d+\.\d+$/.test(r.version) ? r.version : null
  const preview = r.version && !version ? r.version : null
  const listed = r.status !== 'hold'
  const install = r.npm
    ? `yarn mercato module add ${r.npm}@${version ?? preview ?? '0.0.0'}${r.npm.startsWith('@open-mercato/') ? '' : ' --allow-third-party'}`
    : `npx create-mercato-module install ${r.locator.slice(7)}`
  const policy = {
    decision: 'ask' as const,
    reasons: [{ code: 'NOT_VERIFIED', text: 'Not installed on 0.9 by the catalog yet.' }],
  }
  return IndexEntry.parse({
    locator: r.locator,
    path: r.path,
    npm: r.npm,
    github: r.npm ? null : r.locator.slice(7),
    repoPath: null,
    kind: r.kind,
    type: r.type,
    enterprise: r.locator === 'npm:@open-mercato/enterprise',
    title: r.title,
    summary: r.summary,
    whenToUse: r.whenToUse,
    whenNotToUse: null,
    category: r.category,
    tags: r.tags,
    providers: r.providers,
    moduleIds: r.moduleIds,
    requires: r.requires,
    replaces: r.replaces,
    slotConflicts: [],
    renamedFrom: r.renamedFrom,
    supersededBy: r.supersededBy,
    alternatives: [],
    status: r.status,
    listed,
    featured: false,
    license: { ...r.license, mismatch: false },
    version: {
      latest: version,
      preview,
      publishedAt: '2026-10-01',
      integrity: null,
      installableFrom: '2026-10-06',
      gitRef: null,
      recommended: { '0.9': null, '0.8': null, next: null },
    },
    identity: { builtFrom: 'none', claimed: false, source: r.npm ? 'npm' : 'github' },
    compat: { builtFor: { range: null, kind: 'missing', lines: [] }, lines: {}, verifiedOn: [] },
    anatomy: r.anatomy && version ? summaryOf(r.anatomy, version) : null,
    signals: {
      receipt: { '0.9': 'untested' },
      fit: { '0.9': 'unknown' },
      anatomy: r.anatomy ? 'partial' : 'none',
      supplyChain: { status: 'ok', reasons: [] },
      hygiene: { status: 'ok', failing: [] },
      maintenance: { status: 'current', lastRelease: '2026-10-01', catchUpDays: null },
      declaredVsObserved: { status: 'match', notes: [] },
    },
    tier: listed ? 'listed' : null,
    quality: null,
    agentPolicy: { '0.9': policy, next: policy, '0.8': policy },
    install: {
      cli: install,
      cmm: null,
      needsAllowThirdParty: !!r.npm && !r.npm.startsWith('@open-mercato/'),
      moduleFlag: null,
    },
    stats: null,
    sigil: { glyph: '0000000', phase: 0, publicRoutes: false },
    links: {
      page: `${SITE}/m/${r.path}`,
      md: `${SITE}/m/${r.path}.md`,
      json: `${SITE}/m/${r.path}.json`,
      facts: null,
      npm: null,
      repo: null,
      docs: null,
    },
    addedAt: '2026-10-23',
    updatedAt: NOW,
    _meta: {},
  })
}

export function corpusEntries(): IndexEntry[] {
  return corpus().entries.map(corpusEntry)
}

export function corpusBuiltIn(): BuiltInModule[] {
  const w = wedges()
  return corpus().builtIn.map((b) =>
    BuiltInModule.parse({
      id: b.id,
      title: b.title,
      description: b.description,
      category: b.category,
      wedge: w[b.category] ?? 'operate',
      requires: b.requires,
      inPresets: [],
      anatomy: summaryOf(b, '0.9.0'),
      install: `yarn mercato module enable @open-mercato/core --module ${b.id}`,
      page: `/built-in/${b.id}`,
    }),
  )
}
