// Anatomy arithmetic on Facts: the 7-organ glyph (spec 7.4), package counts (AnatomySummary.counts,
// spec 4.6), the Anatomy signal (SIG-ANA, spec 6.2) and the diff between two versions of the same
// package (D31, "Versions": current vs previous only). Pure functions, no I/O.
import type { BuiltinData, Facts, ModuleFacts } from '../schema/data/facts.ts'

type Organs = { D: number; A: number; U: number; E: number; B: number; I: number; X: number }
type GlyphInput = Pick<ModuleFacts, 'data' | 'http' | 'ui' | 'events' | 'background' | 'ai' | 'extends'>

/** Organ sizes in glyph order D, A, U, E, B, I, X. */
export function organs(m: GlyphInput): Organs {
  return {
    D: m.data.entities.length + m.data.customEntities + (m.data.migrations.count > 0 ? 1 : 0),
    A: m.http.routes.length,
    U: m.ui.backendPages.length + m.ui.frontendPages.length + m.ui.widgets,
    E: m.events.emits.length + m.events.subscribes.length,
    B: m.background.workers.length + m.background.cli.length,
    I: m.ai.tools.length + m.ai.agents.length,
    X: m.extends.length,
  }
}

const level = (n: number): number => (n <= 0 ? 0 : n === 1 ? 1 : n < 10 ? 2 : 3)

/** `glyph` = 7 digits 0-3 (0 none, 1 one, 2 two to nine, 3 ten or more), order D A U E B I X. */
export function glyphOf(m: GlyphInput): string {
  const o = organs(m)
  return [o.D, o.A, o.U, o.E, o.B, o.I, o.X].map(level).join('')
}

export interface AnatomyCounts {
  entities: number
  tables: number
  migrations: number
  routes: number | null
  publicRoutes: number | null
  aclFeatures: number
  eventsEmitted: number
  eventsConsumed: number
  backendPages: number
  frontendPages: number
  widgets: number
  workers: number
  cli: number
  aiTools: number
  aiAgents: number
  extends: number
}

/** Sum over modules; routes are null when not measured (built-in modules). */
export function anatomyCounts(modules: readonly ModuleFacts[], routesMeasured = true): AnatomyCounts {
  const sum = (f: (m: ModuleFacts) => number): number => modules.reduce((a, m) => a + f(m), 0)
  return {
    entities: sum((m) => m.data.entities.length),
    tables: new Set(modules.flatMap((m) => m.data.entities.map((e) => e.table).filter((t) => t !== null))).size,
    migrations: sum((m) => m.data.migrations.count),
    routes: routesMeasured ? sum((m) => m.http.routes.length) : null,
    publicRoutes: routesMeasured ? sum((m) => m.publicRoutes) : null,
    aclFeatures: sum((m) => m.security.aclFeatures.length),
    eventsEmitted: sum((m) => m.events.emits.length),
    eventsConsumed: sum((m) => m.events.subscribes.length),
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
 * SIG-ANA (spec 6.2): `none` without facts, `partial` when no src or fewer than 3 non-zero organs,
 * `full` with facts and `authResolved >= 0.9`. An integration.ts Rentgen could not read is `partial` too (finding of 25
 * Oct: sync-shopify read as full while its credentials were missing). `hidden` (enterprise) is decided by the caller,
 * which knows the entry; Rentgen withholds enterprise anatomy and returns `none` for it.
 */
export function anatomyStatus(facts: Facts | null): 'full' | 'partial' | 'none' {
  if (!facts || facts.modules.length === 0) return 'none'
  const nonZero = Math.max(...facts.modules.map((m) => [...m.glyph].filter((d) => d !== '0').length))
  if (nonZero < 3 || facts.coverage.integrationTs === 'unparsed') return 'partial'
  return facts.coverage.routesAuthResolved >= 0.9 ? 'full' : 'partial'
}

export interface AnatomyDiff {
  from: string
  added: { tables: number; routes: number; publicRoutes: number; aclFeatures: number; env: string[]; hosts: string[] }
  removed: { tables: number; routes: number; aclFeatures: number }
}

function keys(f: Pick<Facts, 'modules'>) {
  const tables = new Set<string>()
  const routes = new Set<string>()
  const publicRoutes = new Set<string>()
  const acl = new Set<string>()
  const env = new Set<string>()
  const hosts = new Set<string>()
  for (const m of f.modules) {
    for (const e of m.data.entities) if (e.table) tables.add(e.table)
    for (const r of m.http.routes) {
      routes.add(`${r.method} ${r.path}`)
      if (r.requireAuth === false) publicRoutes.add(`${r.method} ${r.path}`)
    }
    for (const a of m.security.aclFeatures) acl.add(a)
    for (const e of m.config.env) env.add(e.name)
    for (const h of m.network.hosts) hosts.add(h.host)
  }
  return { tables, routes, publicRoutes, acl, env, hosts }
}

const minus = <T>(a: Set<T>, b: Set<T>): T[] => [...a].filter((x) => !b.has(x))

/** What `current` adds and removes against `previous` (AnatomySummary.diff); null without a previous version. */
export function anatomyDiff(previous: Facts | null, current: Facts): AnatomyDiff | null {
  if (!previous || previous.package.version === current.package.version) return null
  const a = keys(previous)
  const b = keys(current)
  return {
    from: previous.package.version,
    added: {
      tables: minus(b.tables, a.tables).length,
      routes: minus(b.routes, a.routes).length,
      publicRoutes: minus(b.publicRoutes, a.publicRoutes).length,
      aclFeatures: minus(b.acl, a.acl).length,
      env: minus(b.env, a.env).sort().slice(0, 20),
      hosts: minus(b.hosts, a.hosts).sort().slice(0, 20),
    },
    removed: {
      tables: minus(a.tables, b.tables).length,
      routes: minus(a.routes, b.routes).length,
      aclFeatures: minus(a.acl, b.acl).length,
    },
  }
}

/** True when the diff changes what an installer must grant or trust (permissions label, D31). */
export function changesPermissions(d: AnatomyDiff | null): boolean {
  if (!d) return false
  return (
    d.added.aclFeatures > 0 ||
    d.added.publicRoutes > 0 ||
    d.added.env.length > 0 ||
    d.added.hosts.length > 0 ||
    d.added.tables > 0
  )
}

/** Built-in counts helper: core modules have no measured routes. */
export function builtinCounts(data: BuiltinData, id: string): AnatomyCounts | null {
  const m = data.modules.find((x) => x.id === id)
  return m ? anatomyCounts([m], data.routesMeasured) : null
}
