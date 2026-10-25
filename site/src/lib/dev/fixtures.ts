// Dev only (design gallery): loads test/fixtures/** with node:fs at build time. Never imported by islands.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { assignSlots } from '../../../../lib/hive/layout.ts'
import type { HiveCandidate, HiveGroup, Wedge as HiveWedge } from '../../../../lib/hive/layout.ts'
import {
  BuiltinData,
  CategoriesFile,
  Facts,
  FitResult,
  Health,
  Lines,
  Presets,
  Radar,
  Receipt,
  SyncRecord,
} from '../../../../lib/schema/index.ts'
import type {
  BuiltInModule,
  CompatIndex,
  IndexEntry,
  InstallPlan,
  Line,
  Radar as RadarT,
  Surface,
} from '../../../../lib/schema/index.ts'
import { locatorToPath } from '../../../../lib/schema/locator.ts'
import { hasGenerated, realGallery } from './real.ts'
import { buildBuiltIn, buildCompat, buildEntries, buildLines, buildPlan } from './entries.ts'
import type { FixtureDescriptor, FixtureSnapshot } from './entries.ts'

const ROOT = process.cwd()
const FIX = join(ROOT, 'test', 'fixtures')
const DATA = join(FIX, 'data')

function walk(dir: string, ext: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, ext, acc)
    else if (e.name.endsWith(ext)) acc.push(p)
  }
  return acc.sort()
}
const json = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'))
const jsonl = (p: string): unknown[] =>
  readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))

export function loadSnapshot(): FixtureSnapshot {
  const descriptors = walk(join(FIX, 'descriptors', 'valid', 'modules'), '.yml').map(
    (f) => parseYaml(readFileSync(f, 'utf8')) as FixtureDescriptor,
  )
  const sync = new Map(
    walk(join(DATA, 'sync'), '.json').map((f) => {
      const r = SyncRecord.parse(json(f))
      return [r.locator, r] as const
    }),
  )
  const health = new Map(
    walk(join(DATA, 'health'), '.json').map((f) => {
      const h = Health.parse(json(f))
      return [h.locator, h] as const
    }),
  )
  const facts = new Map<string, Facts>()
  for (const f of walk(join(DATA, 'facts'), '.json')) {
    const x = Facts.parse(json(f))
    facts.set(x.package.locator, x)
  }
  const receipts = new Map<string, Receipt[]>()
  for (const f of walk(join(DATA, 'receipts'), '.jsonl')) {
    if (f.endsWith('_baseline.jsonl')) continue
    const rs = jsonl(f).map((r) => Receipt.parse(r))
    const loc = rs[0]?.module?.locator
    if (loc) receipts.set(loc, rs)
  }
  const stats = json(join(DATA, 'stats.json')) as {
    entries: Record<string, { downloads30d: number | null; stars: number | null }>
  }
  const categories = CategoriesFile.parse(parseYaml(readFileSync(join(ROOT, 'policy', 'categories.yml'), 'utf8')))
  return {
    descriptors,
    sync,
    health,
    facts,
    receipts,
    baseline: jsonl(join(DATA, 'receipts', '_baseline.jsonl')).map((r) => Receipt.parse(r)),
    fit: walk(join(DATA, 'fit'), '.json').map((f) => FitResult.parse(json(f))),
    lines: Lines.parse(json(join(DATA, 'lines.json'))),
    presets: Presets.parse(json(join(DATA, 'presets.json'))),
    builtin: BuiltinData.parse(json(join(DATA, 'builtin', '0.9.0.json'))),
    stats: new Map(Object.entries(stats.entries)),
    categories: categories.categories,
  }
}

export interface GalleryHiveCell {
  key: string
  q: number
  r: number
  group: HiveGroup
  wedge: HiveWedge
  href: string
  title: string
  type?: 'official' | 'community' | '3rd-party'
}

export interface GalleryData {
  /** `real`: a `yarn om emit` run (site/.generated); `fixture`: test/fixtures through the dev adapter. */
  source: 'real' | 'fixture'
  entries: IndexEntry[]
  lines: Line[]
  compat: CompatIndex
  builtIn: BuiltInModule[]
  plan: InstallPlan
  radar: RadarT
  surface: Surface
  receiptsOf: (locator: string) => import('../../../../lib/schema/index.ts').Receipt[]
  baseline: import('../../../../lib/schema/index.ts').Receipt[]
  hive: GalleryHiveCell[]
  categories: { id: string; title: string; wedge: string }[]
  categoryTitle: (id: string) => string
  dataAsOf: { nightly: string | null; npm: string | null }
  coreVersion: string
  factsOf: (e: IndexEntry) => import('../../../../lib/schema/index.ts').Facts | null
  /** `owner/repo @ sha7` for the nameplate, or null. */
  builtFrom: (e: IndexEntry) => string | null
  /** The fixture gallery: receipts and verdicts for the sections that need a nightly run. */
  fixture: GalleryData
}

/**
 * Hive for the gallery: the 46 core modules of 0.9.0 (from module-facts.v2.json of @open-mercato/cli 0.9.0) and
 * the 48 listed modules and providers of spec 11.1 (test/design/fixtures/hive-entries.json), laid out by
 * assignSlots exactly as `yarn om hive` would on an empty data/hive.json. Categories map to wedges through
 * policy/categories.yml. Shared with scripts/og-default.ts, so the hero Hive and the OG image are the same map.
 */
export function galleryHive(
  categories: FixtureSnapshot['categories'] = CategoriesFile.parse(
    parseYaml(readFileSync(join(ROOT, 'policy', 'categories.yml'), 'utf8')),
  ).categories,
): GalleryHiveCell[] {
  const wedge = new Map(categories.map((c) => [c.id as string, c.wedge as HiveWedge]))
  const facts = json(join(ROOT, 'node_modules/@open-mercato/cli/dist/agentic/guides/module-facts.v2.json')) as Record<
    string,
    { sourcePackage: string; title?: string }
  >
  const hiveFix = json(join(ROOT, 'test', 'design', 'fixtures', 'hive-entries.json')) as {
    entries: { locator: string; kind: string; type: string; category: string; tags: string[] }[]
    builtinCategories: Record<string, string>
  }
  const core = Object.entries(facts).filter(([, m]) => m.sourcePackage === '@open-mercato/core')
  const cands: (HiveCandidate & { title: string; href: string; type?: 'official' | 'community' | '3rd-party' })[] = []
  for (const [id, m] of core.sort()) {
    const cat = hiveFix.builtinCategories[id] ?? 'operations'
    cands.push({
      key: `core:${id}`,
      group: 'core',
      wedge: wedge.get(cat) ?? 'operate',
      addedAt: '',
      title: `${m.title ?? id} · built into core 0.9.0`,
      href: `/built-in/${id}`,
    })
  }
  hiveFix.entries
    .filter((e) => !e.tags.includes('example'))
    .forEach((e, i) => {
      cands.push({
        key: e.locator,
        group: e.type === 'official' ? 'official' : 'ecosystem',
        wedge: wedge.get(e.category) ?? 'operate',
        addedAt: `2026-10-23T00:00:${String(i).padStart(2, '0')}Z`,
        title: `${e.locator.replace(/^npm:|^github:/, '')} · ${e.type}`,
        href: `/m/${locatorToPath(e.locator)}`,
        type: e.type as 'official' | 'community' | '3rd-party',
      })
    })
  const { file } = assignSlots({ version: 1, slots: {} }, cands, '2026-10-23')
  return cands.map((c) => ({ ...c, q: file.slots[c.key]!.q, r: file.slots[c.key]!.r }))
}

const cached = new Map<string, GalleryData>()

/**
 * Data of the design gallery. `auto` (default) renders the real published data when `yarn om emit` has written
 * site/.generated (OM_GALLERY_DATA=fixture forces the fixture); tests ask for `fixture`.
 */
export function galleryData(mode: 'auto' | 'real' | 'fixture' = 'auto'): GalleryData {
  const env = process.env.OM_GALLERY_DATA
  const want = mode !== 'auto' ? mode : env === 'fixture' || env === 'real' ? env : hasGenerated() ? 'real' : 'fixture'
  const hit = cached.get(want)
  if (hit) return hit
  const out = want === 'real' ? realData(fixtureData()) : fixtureData()
  cached.set(want, out)
  return out
}

function realData(fixture: GalleryData): GalleryData {
  const r = realGallery()
  const titles = new Map(r.categories.map((c) => [c.id, c.title]))
  const latest = r.lines.find((l) => l.source === 'latest')?.key ?? '0.9'
  const ksef =
    r.entries.find((e) => e.locator === 'npm:@fastwhitecat/integration-ksef-direct') ?? (r.entries[0] as IndexEntry)
  const surface: Surface = r.surface ?? {
    schemaVersion: 1,
    generatedAt: r.dataAsOf.npm ?? '2026-10-23T00:00:00Z',
    base: r.lines.find((l) => l.source === 'latest')?.version ?? '0.9.0',
    externalPackages: 0,
    symbols: [],
  }
  return {
    source: 'real',
    entries: r.entries,
    lines: r.lines,
    compat: r.compat,
    builtIn: r.builtIn,
    plan: r.planOf(ksef, latest) ?? fixture.plan,
    radar: r.radar ?? fixture.radar,
    surface,
    receiptsOf: (loc) => r.receipts.filter((x) => x.module?.locator === loc),
    baseline: r.receipts.filter((x) => !x.module),
    hive: r.hive,
    categories: r.categories,
    categoryTitle: (id) => titles.get(id) ?? id,
    dataAsOf: r.dataAsOf,
    coreVersion: r.coreVersion,
    factsOf: r.factsOf,
    builtFrom: (e) =>
      e.github ? `${e.github}${e.version.gitRef ? ` @\u00A0${e.version.gitRef.slice(0, 7)}` : ''}` : null,
    fixture,
  }
}

function fixtureData(): GalleryData {
  const hit = cached.get('fixture')
  if (hit) return hit
  const snapshot = loadSnapshot()
  const entries = buildEntries(snapshot)
  const compat = buildCompat(snapshot, entries)
  const ksef = entries.find((e) => e.locator === 'npm:@fastwhitecat/integration-ksef-direct') as IndexEntry
  const radar = Radar.parse(json(join(DATA, 'radar', 'next.json')))
  const surface: Surface = {
    schemaVersion: 1,
    generatedAt: radar.generatedAt,
    base: radar.base,
    externalPackages: 16,
    symbols: radar.changedApis.map((c) => ({ symbol: c.symbol, modules: c.modules })),
  }
  const titles = new Map(snapshot.categories.map((c) => [c.id as string, c.title]))
  const nightly = [...snapshot.baseline].sort((a, b) => (a.run.at < b.run.at ? 1 : -1))[0]?.run.at ?? null
  const out: GalleryData = {
    source: 'fixture',
    entries,
    lines: buildLines(snapshot),
    compat,
    builtIn: buildBuiltIn(snapshot),
    plan: buildPlan(snapshot, ksef),
    radar,
    surface,
    receiptsOf: (loc) => snapshot.receipts.get(loc) ?? [],
    baseline: snapshot.baseline,
    hive: galleryHive(snapshot.categories),
    categories: snapshot.categories,
    categoryTitle: (id) => titles.get(id) ?? id,
    dataAsOf: { nightly, npm: snapshot.lines.resolvedAt },
    coreVersion: snapshot.builtin.coreVersion,
    factsOf: (e) => snapshot.facts.get(e.locator) ?? null,
    builtFrom: (e) => {
      const repo = snapshot.sync.get(e.locator)?.github?.repo
      return repo ? `${repo} @\u00A0${(e.version.gitRef ?? '').slice(0, 7)}` : null
    },
    fixture: undefined as unknown as GalleryData,
  }
  out.fixture = out
  cached.set('fixture', out)
  return out
}

/** Repo-relative path, for captions. */
export const rel = (p: string): string => relative(ROOT, p).split(sep).join('/')
