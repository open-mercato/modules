// IndexEntry and BuiltInModule from the data branch (spec 4.6), built on evaluateEntry so that health, emit,
// MCP and tests agree. The emitter (WP09) owns the published files; this module owns the per-entry logic.
// Isomorphic: no Node APIs.
import type { CategoryId, Wedge } from '../schema/common.ts'
import type { Descriptor } from '../schema/descriptor.ts'
import type { Facts, ModuleFacts } from '../schema/data/facts.ts'
import type { Receipt } from '../schema/data/receipt.ts'
import type { Presets } from '../schema/data/lines.ts'
import type { Stats } from '../schema/data/sync.ts'
import type { BuiltInModule } from '../schema/published/builtin.ts'
import type { AnatomySummary, IndexEntry } from '../schema/published/modules.ts'
import { locatorToPath } from '../schema/locator.ts'
import type { RouteFact } from './finding.ts'
import { evaluateEntry, type Evaluation, type HealthInput } from './health.ts'
import { byLineKey, latestLine, presetModules, registeredIn, type PresetMap } from './lines.ts'
import { builtInEnableCommand, newAppInstallInfo } from './plan.ts'
import { emptyPresetVersion, INSTALLABLE_META_KEY, otherVersionCells } from './policy.ts'
import { anatomySignal, unionGlyph } from './signals.ts'
import { serviceSdks } from './sdks.ts'
import type { Rule } from './tier.ts'
import { ALIASES_META_KEY } from './search.ts'

const uniq = <T>(xs: readonly T[]) => [...new Set(xs)]

function counts(modules: readonly ModuleFacts[], routesMeasured: boolean): AnatomySummary['counts'] {
  const sum = (f: (m: ModuleFacts) => number) => modules.reduce((n, m) => n + f(m), 0)
  return {
    entities: sum((m) => m.data.entities.length),
    tables: uniq(modules.flatMap((m) => m.data.entities.map((e) => e.table).filter((t): t is string => !!t))).length,
    migrations: sum((m) => m.data.migrations.count),
    routes: routesMeasured ? sum((m) => m.http.routes.length) : null,
    publicRoutes: routesMeasured ? sum((m) => m.publicRoutes) : null,
    aclFeatures: uniq(modules.flatMap((m) => m.security.aclFeatures)).length,
    eventsEmitted: uniq(modules.flatMap((m) => m.events.emits.map((e) => e.id))).length,
    eventsConsumed: uniq(modules.flatMap((m) => m.events.subscribes.map((e) => e.event))).length,
    backendPages: sum((m) => m.ui.backendPages.length),
    frontendPages: sum((m) => m.ui.frontendPages.length),
    widgets: sum((m) => m.ui.widgets),
    workers: sum((m) => m.background.workers.length),
    cli: sum((m) => m.background.cli.length),
    aiTools: sum((m) => m.ai.tools.length),
    aiAgents: sum((m) => m.ai.agents.length),
    extends: sum((m) => m.extends.length),
  }
}

/**
 * Env names split by use: `env` the settings the code uses the value of, `envIfSet` the names it only checks are set
 * (rentgen 4 `ifSet`; a name used both ways counts as used). First 20 each.
 */
export function splitEnv(reads: readonly { name: string; ifSet?: true }[]): { env: string[]; envIfSet: string[] } {
  const used = new Set(reads.filter((r) => !r.ifSet).map((r) => r.name))
  const names = uniq(reads.map((r) => r.name))
  return {
    env: names.filter((n) => used.has(n)).slice(0, 20),
    envIfSet: names.filter((n) => !used.has(n)).slice(0, 20),
  }
}

function lists(modules: readonly ModuleFacts[]): AnatomySummary['lists'] {
  const env = splitEnv(modules.flatMap((m) => m.config.env))
  return {
    aclFeatures: uniq(modules.flatMap((m) => m.security.aclFeatures)).slice(0, 20),
    eventsEmitted: uniq(modules.flatMap((m) => m.events.emits.map((e) => e.id))).slice(0, 20),
    eventsConsumed: uniq(modules.flatMap((m) => m.events.subscribes.map((e) => e.event))).slice(0, 20),
    env: env.env,
    ...(env.envIfSet.length > 0 ? { envIfSet: env.envIfSet } : {}),
    hosts: uniq(modules.flatMap((m) => m.network.hosts.map((h) => h.host))).slice(0, 20),
    tables: uniq(modules.flatMap((m) => m.data.entities.map((e) => e.table).filter((t): t is string => !!t))).slice(
      0,
      20,
    ),
    publicRoutes: uniq(
      modules.flatMap((m) => m.http.routes.filter((r) => r.requireAuth === false).map((r) => `${r.method} ${r.path}`)),
    ).slice(0, 10),
    credentials: modules
      .flatMap((m) => m.config.credentials)
      .filter((c, i, all) => all.findIndex((x) => x.key === c.key) === i)
      .slice(0, 10),
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `ADDS 3 TABLES · 8 ROUTES (0 PUBLIC) · 7 PERMISSIONS · EMITS 9 EVENTS` (only non-zero parts). */
export function anatomyCallout(c: AnatomySummary['counts']): string {
  const parts: string[] = []
  if (c.tables > 0) parts.push(`ADDS ${plural(c.tables, 'TABLE', 'TABLES')}`)
  if (c.routes !== null && c.routes > 0)
    parts.push(`${plural(c.routes, 'ROUTE', 'ROUTES')} (${c.publicRoutes ?? 0} PUBLIC)`)
  if (c.aclFeatures > 0) parts.push(plural(c.aclFeatures, 'PERMISSION', 'PERMISSIONS'))
  if (c.eventsEmitted > 0) parts.push(`EMITS ${plural(c.eventsEmitted, 'EVENT', 'EVENTS')}`)
  if (parts.length > 0 && !parts[0]!.startsWith('ADDS')) parts[0] = `ADDS ${parts[0]}`
  return (parts.length > 0 ? parts.join(' · ') : 'FEW CONTRACTS').slice(0, 240)
}

/** Anatomy summary of a package version; `previous` adds the diff (D31). Null for enterprise or no facts. */
export function anatomySummary(
  facts: Facts | null,
  enterprise: boolean,
  previous?: Facts | null,
): AnatomySummary | null {
  if (!facts || enterprise) return null
  const signal = anatomySignal(facts, enterprise)
  const c = counts(facts.modules, true)
  const l = lists(facts.modules)
  // a package without a module: the env names and hosts its own src/ uses (rentgen 3, `packageCode`)
  if (facts.packageCode) {
    const env = splitEnv([...facts.modules.flatMap((m) => m.config.env), ...facts.packageCode.env])
    l.env = env.env
    if (env.envIfSet.length > 0) l.envIfSet = env.envIfSet
    else delete l.envIfSet
    l.hosts = uniq([...l.hosts, ...facts.packageCode.hosts.map((h) => h.host)]).slice(0, 20)
  }
  let diff: AnatomySummary['diff'] = null
  if (previous) {
    const pc = counts(previous.modules, true)
    const pl = lists(previous.modules)
    const prevTables = new Set(previous.modules.flatMap((m) => m.data.entities.map((e) => e.table)))
    const curTables = new Set(facts.modules.flatMap((m) => m.data.entities.map((e) => e.table)))
    const prevAcl = new Set(previous.modules.flatMap((m) => m.security.aclFeatures))
    const curAcl = new Set(facts.modules.flatMap((m) => m.security.aclFeatures))
    diff = {
      from: previous.package.version,
      added: {
        tables: [...curTables].filter((t) => t && !prevTables.has(t)).length,
        routes: Math.max(0, (c.routes ?? 0) - (pc.routes ?? 0)),
        publicRoutes: Math.max(0, (c.publicRoutes ?? 0) - (pc.publicRoutes ?? 0)),
        aclFeatures: [...curAcl].filter((a) => !prevAcl.has(a)).length,
        env: l.env.filter((e) => !pl.env.includes(e)),
        hosts: l.hosts.filter((h) => !pl.hosts.includes(h)),
      },
      removed: {
        tables: [...prevTables].filter((t) => t && !curTables.has(t)).length,
        routes: Math.max(0, (pc.routes ?? 0) - (c.routes ?? 0)),
        aclFeatures: [...prevAcl].filter((a) => !curAcl.has(a)).length,
      },
    }
  }
  // the backend pages `plan_install` lists (round 15), on catalog entries only
  const backendPages = uniq(facts.modules.flatMap((m) => m.ui.backendPages.map((p) => p.path))).slice(0, 20)
  // the services it reaches through an SDK, with no URL in the code (finding of 25 Oct: gateway-stripe)
  const sdks = serviceSdks(Object.keys(facts.dependencies))
  return {
    version: facts.package.version,
    coverage: signal === 'full' ? 'full' : signal === 'partial' ? 'partial' : 'none',
    counts: c,
    lists: {
      ...l,
      ...(sdks.length > 0 ? { sdks } : {}),
      ...(backendPages.length > 0 ? { backendPages } : {}),
    },
    callout: anatomyCallout(c),
    diff,
  }
}

/** The anatomy of a package without a module: its code is not read, so settings and hosts are not measured. */
export const NO_MODULE_TEXT = 'No module in the package, so its code is not read: settings and hosts are not measured.'
/** The anatomy of a package without a module whose src/ was read for settings and hosts (rentgen 3). */
export const NO_MODULE_READ_TEXT = 'No module in the package. Settings and hosts are read from its src/.'
/** The value of a settings or hosts row of such a package (the card, the film). */
export const NOT_MEASURED_TEXT = 'not measured (no module in the package)'

/**
 * The sentence under a `partial` anatomy (spec 7.8 `ubogie fakty`), on the page and in the agent card (review r9). A
 * partial anatomy has fewer than 3 organs, no src/, or route auth that did not resolve (signals.ts anatomySignal), so
 * the sentence names the case the facts show: `Few contracts. This package mostly plugs into an existing host
 * module.` only when it extends or requires another module and has no tables and no routes of its own; `Few contracts
 * read from src/.` for a small module that plugs into nothing (events, the core event bus); `Partly read: some
 * contracts could not be resolved statically.` when there are three organs or more. `plugs` keeps the warning tone for
 * the first only. Null for a full anatomy.
 */
export function anatomyNote(
  e: {
    anatomy: AnatomySummary | null
    requires: readonly unknown[]
    moduleIds?: readonly string[]
  },
  /** The facts read the package's own src/ (rentgen 3 `packageCode`): its settings and hosts are measured. */
  codeRead = false,
): { text: string; plugs: boolean } | null {
  const a = e.anatomy
  if (!a || a.coverage === 'full') return null
  // a package with no module (a provider, library or tool): before rentgen 3 its code was not read, so nothing below
  // is a finding about it (finding of 25 Oct: the web-research adapters read `Talks to: no hosts found in the code`
  // while their code calls api.exa.ai and the like)
  if (e.moduleIds && e.moduleIds.length === 0)
    return { text: codeRead ? NO_MODULE_READ_TEXT : NO_MODULE_TEXT, plugs: false }
  const c = a.counts
  const organs = [
    c.entities + c.tables + c.migrations,
    c.routes ?? 0,
    c.backendPages + c.frontendPages + c.widgets,
    c.eventsEmitted + c.eventsConsumed,
    c.workers + c.cli,
    c.aiTools + c.aiAgents,
    c.extends,
  ].filter((n) => n > 0).length
  if (organs >= 3) return { text: 'Partly read: some contracts could not be resolved statically.', plugs: false }
  const plugs = (c.extends > 0 || e.requires.length > 0) && c.tables === 0 && (c.routes ?? 0) === 0
  return plugs
    ? { text: 'Few contracts. This package mostly plugs into an existing host module.', plugs }
    : { text: 'Few contracts read from src/.', plugs }
}

/**
 * Titles for entries whose package name reads badly as a title and whose module declares none (`Ui`, `Channel Ses`,
 * `Enrichment Treg`). Until the descriptor has a `title` field, this short list is the curated exception.
 */
export const TITLE_OVERRIDES: Readonly<Record<string, string>> = {
  'npm:@freighttech/ui': 'FreightTech UI Kit',
  'npm:open-mercato-generator': 'Rust API Client Generator',
  'npm:@open-mercato/channel-ses': 'Amazon SES Email Channel',
  'npm:@open-mercato/channel-resend': 'Resend Email Channel',
  'npm:@open-mercato/web-research-searxng': 'Web Research SearXNG',
  'npm:@open-mercato/web-research-serp': 'Web Research DuckDuckGo',
  'npm:@fullstackhouse/open-mercato-data-sync-durable': 'Durable Data Sync',
  'npm:create-mercato-module': 'create-mercato-module',
  'npm:mercato-readiness-scanner': 'Readiness Scanner',
  'github:Chmarusso/open-mercato-enrichment-treg': 'treg.to Enrichment',
  'npm:@fullstackhouse/open-mercato-health': 'Health Checks',
}

/** Title: a curated override, else the single module's title, else a readable package name. */
export function entryTitle(locator: string, facts: Facts | null): string {
  const curated = TITLE_OVERRIDES[locator]
  if (curated) return curated
  const one = facts?.modules.length === 1 ? facts.modules[0]?.title : null
  if (one) return one.slice(0, 80)
  const base =
    locator
      .replace(/^(npm|github):/, '')
      .split('/')
      .at(-1) ?? locator
  const words = base
    .replace(/^open-?mercato-/, '')
    .split(/[-_.]+/)
    .filter(Boolean)
  return (
    words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .slice(0, 80) || base
  )
}

/** Sigil phase from the locator (FNV-1a, 0..359). WP11 may pass its own. */
export function sigilPhase(locator: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < locator.length; i++) {
    h ^= locator.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 360
}

export interface EntryInput extends HealthInput {
  descriptor: Descriptor
  /** Facts of the previous stable version, for the anatomy diff. */
  previousFacts?: Facts | null
  stats?: Stats | null
  /** Site root plus base path, no trailing slash (e.g. https://open-mercato.github.io/modules). */
  site: string
  /** Sigil from lib/sigil (WP11); default: union glyph of the facts and an FNV phase. */
  sigil?: IndexEntry['sigil']
  /**
   * Every catalog entry (descriptors are enough). A peer dependency on another catalog module becomes a
   * `requires` item resolving to that entry (`data-sync-durable` -> `durable-work`, spec 5.3): Yarn does not
   * install peers, so the plan has to.
   */
  catalog?: readonly CatalogRef[]
  /**
   * Peer names marked `peerDependenciesMeta[name].optional` in the package.json of this version. SyncRecord has
   * no such field yet, so the caller passes it when it has it; optional peers never become `requires`.
   */
  optionalPeers?: readonly string[]
}

export interface CatalogRef {
  locator: string
  npm: string | null
  kind: IndexEntry['kind']
}

/**
 * `requires` items from peer dependencies that are other catalog modules or libraries (kind `module` or `library`,
 * listed or not). A library peer is installed with `yarn add` (finding of 25 Oct: terminal-tracking peers on
 * @freighttech/ui, which neither its receipts nor its install plan installed, so every cell failed at TS2307).
 */
export function catalogPeerRequires(
  self: string,
  peers: Readonly<Record<string, string>> | null | undefined,
  catalog: readonly CatalogRef[] | undefined,
  optionalPeers: readonly string[] = [],
): IndexEntry['requires'] {
  if (!peers || !catalog) return []
  const out: IndexEntry['requires'] = []
  for (const name of Object.keys(peers).sort()) {
    if (optionalPeers.includes(name)) continue
    const hit = catalog.find(
      (c) => c.npm === name && c.locator !== self && (c.kind === 'module' || c.kind === 'library'),
    )
    if (hit) out.push({ raw: name, resolvesTo: hit.locator })
  }
  return out
}

/** npm names of the catalog libraries a package peers on: the cells install them first (`lib:<npm>@<v>`, spec 5.3). */
export function libraryPeers(
  self: string,
  peers: Readonly<Record<string, string>> | null | undefined,
  catalog: readonly CatalogRef[] | undefined,
): string[] {
  return catalogPeerRequires(self, peers, catalog)
    .filter((r) => catalog?.find((c) => c.locator === r.resolvesTo)?.kind === 'library')
    .map((r) => r.raw)
}

/**
 * A broken receipt of a cell that did not install a catalog library the package peers on, whose failed step names
 * that library (finding of 25 Oct: the receipts of terminal-tracking before cbf74c7 never installed @freighttech/ui,
 * so every cell failed at TS2307 on `@freighttech/ui/...` imports): the test was wrong, not the module. It reads as `harness-red` (`our test app
 * failed`, never the module's fault) until a receipt that installed the library judges it, so the page, the policy
 * and the counts never call the module broken for it. Only libraries: a cell always adds them (`yarn add`), while a
 * module peer a new app registers is left out on purpose (`resolveRequires`).
 */
export function withInstalledPeers<
  R extends Pick<Receipt, 'requiresInstalled' | 'result' | 'transition'> & {
    steps: readonly Pick<Receipt['steps'][number], 'status' | 'excerpt'>[]
  },
>(receipts: readonly R[], libraries: readonly string[]): R[] {
  if (libraries.length === 0) return [...receipts]
  return receipts.map((r) => {
    if (r.result.status !== 'broken') return r
    const installed = r.requiresInstalled.map((s) => s.replace(/^lib:/, '').replace(/(.)@[^@/]+$/, '$1'))
    const missing = libraries.filter((name) => !installed.includes(name))
    // only a break that names the missing library (TS2307 on its imports): shipment-tracking breaks at add on a route
    // that a new app already has, which has nothing to do with @freighttech/ui and stays its own break
    const named = r.steps.some((st) => st.status === 'fail' && missing.some((name) => st.excerpt?.includes(name)))
    if (missing.length === 0 || !named) return r
    return {
      ...r,
      result: { ...r.result, status: 'harness-red', classification: 'harness-red' },
      transition: { ...r.transition, to: 'harness-red', confirmed: false },
    }
  })
}

/** One `modules.json` entry. `slotConflicts` is filled by `withSlotConflicts` over the whole list. */
export function buildIndexEntry(i: EntryInput): IndexEntry {
  return buildIndexEntryWithRules(i).entry
}

/** The entry and the LST/VER rules its `tier` comes from (`/m/<path>.json`, the Quality tab, review r3). */
export function buildIndexEntryWithRules(i: EntryInput): { entry: IndexEntry; rules: Rule[] } {
  // the route of an old smoke excerpt comes from the facts of the installed version (the judged or the previous one),
  // else from the judged facts, matched by the refused features (review r9)
  const routesOf = (v: string) =>
    routesOfFacts([i.facts, i.previousFacts].find((f) => f && f.package.version === v) ?? i.facts)
  const ev = evaluateEntry({ ...i, routesOf: i.routesOf ?? routesOf })
  return { entry: withInstalls(indexEntryOf(i, ev)), rules: ev.health.rules }
}

/**
 * A cell whose receipt is of another version names the version a fresh app installs there (`installs`, finding of 25
 * Oct: compat.json said so, while modules.json gave storage-s3 on 0.8 a bare `broken` of its 0.9.0 receipt).
 */
function withInstalls(e: IndexEntry): IndexEntry {
  const others = otherVersionCells(e)
  if (Object.keys(others).length === 0) return e
  const lines = { ...e.compat.lines }
  for (const [k, o] of Object.entries(others)) {
    const cell = lines[k]
    if (cell) lines[k] = { ...cell, installs: o.installs }
  }
  return { ...e, compat: { ...e.compat, lines } }
}

function indexEntryOf(i: EntryInput, ev: Evaluation): IndexEntry {
  const d = i.descriptor
  const h = ev.health
  const path = locatorToPath(i.locator)
  const npm = d.npm ?? null
  const enterprise = h.identity.enterprise
  const latest = latestLine(i.lines)
  const facts = i.facts
  const anatomy = anatomySummary(facts, enterprise, i.previousFacts)
  const moduleFlag =
    d.module ?? (facts?.gate.needsModuleFlag && ev.moduleIds.length === 1 ? (ev.moduleIds[0] ?? null) : null)
  const preset = presetModules(i.presets, latest?.key, 'empty')
  // the command of an app that does not register the package yet: where a new app ships it, the one of an app from the
  // empty preset, with the version that preset does not break on (`emptyPresetVersion`, review of 24 Oct); where a new
  // app registers it behind an env flag, the plan of a new app (`newAppInstallInfo`, audit of 29 Oct, C01)
  const target = {
    npm,
    locator: i.locator,
    moduleIds: ev.moduleIds,
    version: ev.version,
    installableVersions: ev.installableVersions,
    moduleFlag,
    kind: ev.kind,
    tags: d.tags ?? [],
  }
  const install = newAppInstallInfo(
    target,
    latest?.key ?? null,
    preset,
    emptyPresetVersion({ ...target, compat: { ships: ev.ships, isolation: ev.isolation } }, latest?.key ?? null),
  )
  const requires = (facts?.modules ?? [])
    .flatMap((m) => m.requires)
    .filter((r, idx, all) => all.findIndex((x) => x.raw === r.raw) === idx)
    .filter((r) => !ev.moduleIds.includes(r.raw))
  for (const r of catalogPeerRequires(i.locator, i.sync?.npm?.peerDependencies, i.catalog, i.optionalPeers))
    if (!requires.some((x) => x.resolvesTo === r.resolvesTo)) requires.push(r)
  const stat = i.stats?.entries[i.locator]
  const repo = d.github ?? (d.repo ? (d.repo.split('#')[0] ?? null) : (i.sync?.github?.repo ?? null))
  const page = `${i.site}/m/${path}`
  const meta: Record<string, unknown> = {}
  if (d.aliases && d.aliases.length > 0) meta[ALIASES_META_KEY] = d.aliases
  if (npm) meta[INSTALLABLE_META_KEY] = ev.installableVersions
  return {
    locator: i.locator,
    path,
    npm,
    github: d.github ?? (i.locator.startsWith('github:') ? i.locator.slice(7) : null),
    repoPath: d.repo ?? null,
    kind: ev.kind,
    type: h.identity.type,
    enterprise,
    title: entryTitle(i.locator, facts),
    summary: d.summary,
    whenToUse: d.whenToUse,
    whenNotToUse: d.whenNotToUse ?? null,
    category: d.category,
    tags: d.tags,
    providers: d.providers,
    moduleIds: ev.moduleIds,
    requires,
    replaces: d.replaces ?? [],
    slotConflicts: [],
    renamedFrom: d.renamedFrom ?? [],
    supersededBy: d.supersededBy ?? null,
    alternatives: d.alternatives ?? [],
    status: h.state,
    listed: ev.listed,
    featured: d.featured,
    license: h.identity.license,
    version: ev.version,
    identity: { builtFrom: h.identity.builtFrom.status, claimed: h.identity.claimed.value, source: h.identity.source },
    compat: {
      builtFor: ev.builtFor,
      lines: ev.cells,
      verifiedOn: ev.verifiedOn,
      ...(ev.inPresets.length > 0 ? { inPresets: ev.inPresets, ships: ev.ships } : {}),
      ...(ev.inEmptyPreset.length > 0 ? { inEmptyPreset: ev.inEmptyPreset } : {}),
      ...(Object.keys(ev.isolation).length > 0 ? { isolation: ev.isolation } : {}),
      ...(Object.keys(ev.newerBreaks).length > 0 ? { newerBreaks: ev.newerBreaks } : {}),
      ...(Object.keys(ev.collisions).length > 0 ? { collisions: ev.collisions } : {}),
    },
    anatomy,
    signals: h.signals,
    tier: h.tier,
    quality: h.quality ? { version: h.quality.version, until: h.quality.until, report: h.quality.report } : null,
    agentPolicy: h.agentPolicy,
    install,
    // official modules too (decision A of 26 Oct): a person compares modules by use, whoever made them
    stats: {
      downloads30d: stat?.downloads30d ?? i.sync?.downloads30d ?? null,
      // an official module lives in the monorepo: its stars are the platform's, the same on every page
      stars: h.identity.type === 'official' ? null : (stat?.stars ?? i.sync?.github?.stars ?? null),
    },
    sigil: i.sigil ?? {
      glyph: unionGlyph(facts),
      phase: sigilPhase(i.locator),
      publicRoutes: (anatomy?.counts.publicRoutes ?? 0) > 0,
    },
    links: {
      page,
      md: `${page}.md`,
      json: `${page}.json`,
      facts: facts ? `${page}/v/${facts.package.version}/facts.json` : null,
      npm: npm ? `https://www.npmjs.com/package/${npm}` : null,
      repo: repo ? `https://github.com/${repo}` : null,
      docs: d.links.docs ?? null,
    },
    addedAt: (i.sync?.firstSeenAt ?? i.now).slice(0, 10),
    updatedAt: i.now,
    _meta: meta,
  }
}

/** Routes of a facts file, for naming the route of a smoke 403 (lib/core/finding.ts). */
function routesOfFacts(f: Facts | null | undefined): RouteFact[] | undefined {
  return f ? f.modules.flatMap((m) => m.http.routes) : undefined
}

/** Fills `slotConflicts`: listed entries that share a runtime module ID (#7289). */
export function withSlotConflicts(entries: readonly IndexEntry[]): IndexEntry[] {
  return entries.map((e) => ({
    ...e,
    slotConflicts: entries
      .filter((o) => o.locator !== e.locator && o.listed && o.moduleIds.some((id) => e.moduleIds.includes(id)))
      .map((o) => o.locator),
  }))
}

export interface BuiltInInput {
  module: ModuleFacts
  coreVersion: string
  category: CategoryId
  wedge: Wedge
  presets?: Presets | PresetMap | null
  /** BuiltinData.routesMeasured (false for module-facts.v2.json of CLI 0.9.0). */
  routesMeasured: boolean
}

/** One `/built-in.json` module (spec 4.6): `module enable`, never `module add`. */
export function builtInModule(i: BuiltInInput): BuiltInModule {
  const m = i.module
  const c = counts([m], i.routesMeasured)
  // on in a new app (the classic preset, decision of 24 Oct), and on in an app from the empty preset too
  const on = (preset: 'classic' | 'empty') =>
    Object.keys(i.presets ?? {})
      .filter((k) => registeredIn(i.presets, k, preset, '@open-mercato/core', [m.id]))
      .sort(byLineKey)
  const inPresets = on('classic')
  const inEmptyPreset = on('empty')
  return {
    id: m.id,
    title: m.title ?? m.id,
    description: m.description ?? '',
    category: i.category,
    wedge: i.wedge,
    requires: m.requires.map((r) => (r.resolvesTo?.startsWith('core:') ? r.resolvesTo.slice(5) : r.raw)),
    inPresets,
    ...(inEmptyPreset.length > 0 ? { inEmptyPreset } : {}),
    anatomy: {
      version: i.coreVersion,
      coverage: i.routesMeasured ? 'full' : 'partial',
      counts: c,
      lists: lists([m]),
      callout: anatomyCallout(c),
      diff: null,
    },
    install: builtInEnableCommand(m.id),
    page: `/built-in/${m.id}`,
  }
}
