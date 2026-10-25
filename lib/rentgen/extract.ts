// Rentgen: static anatomy of an unpacked package (spec 1.1 "Anatomy", 4.5 `Facts`).
// Engine: `extractModuleFacts` from the pinned `@open-mercato/cli` (spec 3.3), loaded with a dynamic
// import through a variable (spec 3.4: the package maps subpath types to `.ts` sources that `tsc`
// would check), typed by ./om-cli.d.ts. Our own readers fill the engine's gaps: routes with auth,
// integration.ts, migrations, env, hosts, OM imports, license, lint. Module code is never imported
// or executed: everything is file listing, JSON and AST.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ModuleId } from '../schema/common.ts'
import { parseLocator } from '../schema/locator.ts'
import { Facts, type BuiltinData, type LintFinding, type ModuleFacts, type Src } from '../schema/data/facts.ts'
import {
  clearParseCache,
  codeFiles,
  escapeRe,
  evalLiteral,
  exportsOf,
  isDir,
  isFile,
  isLitObject,
  parseSource,
} from './ast.ts'
import { anatomyStatus, glyphOf } from './diff.ts'
import { scanEnv } from './env.ts'
import { hostDeclared, scanHosts } from './hosts.ts'
import { ImportCollector } from './imports.ts'
import { scanEntityTables, scanMigrationTables, type TableRead } from './entities.ts'
import { injectionWidgets, readIntegration, type IntegrationRead } from './integration.ts'
import { readGate, resolveKind } from './kind.ts'
import { licenseFileOf, resolveLicense } from './license.ts'
import { finding, lintModule, lintPackage } from './lint.ts'
import type { ExtractorModule, OmModuleFacts } from './om-cli.d.ts'
import { scanRoutes, type RouteScan } from './routes.ts'
import { Sanitizer, stripControl } from './sanitize.ts'
import {
  fetchGithubArchive,
  fetchNpmTarball,
  githubCommit,
  githubDefaultRef,
  npmManifest,
  removeDir,
  tempDir,
  unpackTarball,
  type UnpackReport,
} from './unpack.ts'

/**
 * Bump when Rentgen's own readers change what they write (cache key with the engine version). 2 (25 Oct): tables, the
 * bundle's credentials and injection widgets read through consts of the package, env names in key lists.
 */
export const RENTGEN_VERSION = 2

/** Official module package by name (spec 6.1: `npm:@open-mercato/*`). */
export function isOfficialName(name: string): boolean {
  return name.startsWith('@open-mercato/')
}
export const ENGINE_SPEC = '@open-mercato/cli/lib/generators/module-facts'

export interface Engine {
  mod: ExtractorModule
  /** e.g. `@open-mercato/cli@0.9.0 extractModuleFacts`. */
  engine: string
  cliVersion: string
}

let enginePromise: Promise<Engine> | null = null

/** Load the pinned extractor once per process. */
export function loadEngine(): Promise<Engine> {
  enginePromise ??= (async () => {
    const spec = ENGINE_SPEC
    const mod = (await import(spec)) as ExtractorModule
    if (typeof mod.extractModuleFacts !== 'function') throw new Error(`${spec} has no extractModuleFacts`)
    const cliVersion = engineVersion()
    return { mod, engine: `@open-mercato/cli@${cliVersion} extractModuleFacts`, cliVersion }
  })()
  return enginePromise
}

/** Version of the installed @open-mercato/cli (the engine), read from its package.json. */
export function engineVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.resolve('@open-mercato/cli')))
  for (let i = 0; i < 6; i++) {
    const pj = join(dir, 'package.json')
    if (isFile(pj)) {
      const p = JSON.parse(readFileSync(pj, 'utf8')) as { name?: string; version?: string }
      if (p.name === '@open-mercato/cli' && p.version) return p.version
    }
    dir = dirname(dir)
  }
  throw new Error('cannot find the version of @open-mercato/cli')
}

/** Descriptor fields Rentgen uses (all optional; scan works without a descriptor). */
export interface DescriptorHints {
  kind?: 'module' | 'provider' | 'library' | 'tool'
  extends?: string
  replaces?: string[]
  declares?: { hosts: string[]; env: string[] }
  scriptsRequired?: { reason: string }
  whenToUse?: string
}

export interface ScanContext {
  locator: string
  source: 'npm-tarball' | 'github-archive'
  integrity: string | null
  gitRef: string | null
  descriptor?: DescriptorHints | null
  /** Facts of the core modules of the latest line (collision-core, acl-guards, requires). */
  builtin?: BuiltinData | null
  /** Version of the `latest` line, for peer-range-behind. */
  latestOm?: string | null
  /** create-mercato-app template dependencies of the latest line, for host-dependency-duplication. */
  templateDeps?: Record<string, string> | null
}

// ---------------------------------------------------------------- helpers

const lineCache = new Map<string, string[] | null>()
function lineIn(file: string, re: RegExp): number | null {
  let lines = lineCache.get(file)
  if (lines === undefined) {
    lines = isFile(file) ? readFileSync(file, 'utf8').split('\n') : null
    lineCache.set(file, lines)
  }
  if (!lines) return null
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i] as string)) return i + 1
  return null
}

function srcAt(pkgRoot: string | null, rel: string | null | undefined, re: RegExp | null, line?: number): Src | null {
  if (!pkgRoot || !rel || rel.startsWith('node_modules/') || rel.includes('..')) return null
  if (line && line > 0) return { file: rel.slice(0, 300), line }
  const l = re ? lineIn(join(pkgRoot, rel), re) : null
  return l ? { file: rel.slice(0, 300), line: l } : null
}

const quoted = (s: string): RegExp => new RegExp(`['"\`]${escapeRe(s)}['"\`]`)

function migrationsOf(moduleRoot: string | null): ModuleFacts['data']['migrations'] {
  if (!moduleRoot || !isDir(join(moduleRoot, 'migrations'))) return { count: 0, first: null, last: null }
  const names = readdirSync(join(moduleRoot, 'migrations'))
    .filter((n) => /^Migration\d{14}.*\.(ts|js)$/.test(n) && !n.endsWith('.d.ts'))
    .sort()
  const dates = names
    .map((n) => `${n.slice(9, 13)}-${n.slice(13, 15)}-${n.slice(15, 17)}`)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  return { count: names.length, first: dates[0] ?? null, last: dates.at(-1) ?? null }
}

/** `metadata` literal of a module's index.ts (ModuleInfo), statically. */
function moduleInfoOf(moduleRoot: string): { license: string | null; version: string | null; line: number } {
  const file = ['index.ts', 'index.tsx'].map((n) => join(moduleRoot, n)).find(isFile)
  const sf = file ? parseSource(file) : null
  if (!sf) return { license: null, version: null, line: 1 }
  const init = exportsOf(sf).initializers.get('metadata')
  const v = init ? evalLiteral(init, sf) : null
  const line = init ? sf.getLineAndCharacterOfPosition(init.getStart(sf)).line + 1 : 1
  if (!isLitObject(v)) return { license: null, version: null, line }
  return {
    license: typeof v.license === 'string' ? v.license : null,
    version: typeof v.version === 'string' ? v.version : null,
    line,
  }
}

function setupHasDefaultRoleFeatures(moduleRoot: string | null, raw: OmModuleFacts | null): boolean {
  if (moduleRoot) {
    const file = ['setup.ts', 'setup.tsx'].map((n) => join(moduleRoot, n)).find(isFile)
    if (file) return /\bdefaultRoleFeatures\b/.test(readFileSync(file, 'utf8'))
  }
  const setup = raw?.ownedContracts?.setup ?? []
  return setup.some((s) => Array.isArray(s.metadata?.roles) && (s.metadata?.roles as unknown[]).length > 0)
}

/** Facts pieces that only exist for a package on disk (absent for built-in modules). */
export interface ModuleExtras {
  pkgRoot: string | null
  moduleRoot: string | null
  routes: RouteScan | null
  integration: IntegrationRead | null
  env: { name: string; src: Src }[]
  hosts: { host: string; src: Src; confidence: 'high' | 'low' }[]
  imports: ModuleFacts['omImports']
  /** Tables of `@Entity` classes and migrations the engine did not list (raw, sanitized here); absent: none read. */
  tables?: TableRead[]
  /** Widgets of `widgets/injection-table.ts`, computed spot keys included; absent: not read. */
  injectionWidgets?: number
}

export interface MappedModule {
  facts: Omit<ModuleFacts, 'lint' | 'glyph'>
  lintInput: Omit<Parameters<typeof lintModule>[0], 'facts' | 'builtin' | 'descriptor' | 'packageVersion'>
  sanitizer: Sanitizer
}

const cap = <T>(a: T[], n: number): T[] => a.slice(0, n)

/** Map engine output plus our readers into ModuleFacts (without lint and glyph). */
export function mapModule(
  id: string,
  raw: OmModuleFacts | null,
  x: ModuleExtras,
  coreIds: ReadonlySet<string>,
  declaredHosts: string[] | null,
): MappedModule {
  const san = new Sanitizer()
  const root = x.pkgRoot
  const sources = new Map<string, string>()
  for (const s of raw?.factSources ?? [])
    if (s.source?.sourcePath) sources.set(`${s.kind}|${s.id}`, s.source.sourcePath)
  const meta = raw?.ownedContracts?.['module-metadata']?.[0]?.metadata ?? {}
  const indexSrc = srcAt(root, `src/modules/${id}/index.ts`, null, 1)

  const requiresRaw = Array.isArray(meta.requires) ? meta.requires : []
  const requires = san
    .list('requires entry', requiresRaw, indexSrc)
    .map((r) => ({ raw: r, resolvesTo: coreIds.has(r) ? `core:${r}` : null }))

  const engineEntities = (raw?.entities ?? [])
    .filter((e) => san.ok('entity ID', e.id))
    .map((e) => ({
      id: e.id,
      table: san.ok('table name', e.table) ? e.table : null,
      src: srcAt(root, sources.get(`entity|${e.id}`), e.class ? new RegExp(`class\\s+${escapeRe(e.class)}\\b`) : null),
    }))
  // tables the engine leaves out: a table name in a const, a table only a migration creates (finding of 25 Oct)
  for (const t of x.tables ?? []) {
    if (engineEntities.some((e) => e.table === t.table || (e.id === t.id && e.table !== null))) continue
    if (!san.ok('entity ID', t.id, t.src) || !san.ok('table name', t.table, t.src)) continue
    const same = engineEntities.find((e) => e.id === t.id)
    if (same) same.table = t.table
    else engineEntities.push({ id: t.id, table: t.table, src: srcAt(root, t.src.file, null, t.src.line) })
  }
  const entities = cap(engineEntities, 200)

  const routes = x.routes?.routes ?? []
  const httpRoutes: ModuleFacts['http']['routes'] = []
  let requireRolesSrc: Src | null = null
  const referenced: { feature: string; src: Src | null }[] = []
  for (const r of routes) {
    if (!san.ok('route path', r.path, r.src)) continue
    if (r.requireRoles && !requireRolesSrc) requireRolesSrc = r.src
    for (const f of r.requireFeatures) referenced.push({ feature: f, src: r.src })
    httpRoutes.push({
      method: r.method,
      path: r.path,
      requireAuth: r.requireAuth,
      requireFeatures: cap(san.list('ACL feature', r.requireFeatures, r.src), 10),
      hasOpenApi: r.hasOpenApi,
      src: r.src,
    })
  }

  const aclFeatures = cap(
    san.list('ACL feature', raw?.aclFeatures ?? [], srcAt(root, `src/modules/${id}/acl.ts`, null, 1)),
    200,
  )

  const emits = cap(
    (raw?.events ?? [])
      .filter((e) => san.ok('event ID', e.id))
      .map((e) => ({
        id: e.id,
        src: srcAt(root, sources.get(`event|${e.id}`) ?? `src/modules/${id}/events.ts`, quoted(e.id)),
      })),
    200,
  )

  const contributions = raw?.extensionSurfaces?.contributions ?? []
  const subscribes: ModuleFacts['events']['subscribes'] = []
  for (const c of contributions) {
    if (c.kind !== 'subscriber') continue
    const ev = (c.details as { event?: unknown } | undefined)?.event
    const src = srcAt(root, c.source.path, typeof ev === 'string' ? quoted(ev) : null)
    if (!san.ok('subscribed event ID', ev, src)) continue
    if (!subscribes.some((s) => s.event === ev)) subscribes.push({ event: ev, src })
  }

  const pageList = (pages: OmModuleFacts['backendPages']) =>
    pages.filter((p) => {
      const src = srcAt(root, p.sourcePath, null, 1)
      for (const f of p.metadata?.requireFeatures ?? []) referenced.push({ feature: f, src })
      return san.ok('page path', p.path, src)
    })
  const backendPages = cap(
    pageList(raw?.backendPages ?? []).map((p) => ({
      path: p.path,
      requireFeatures: cap(san.list('ACL feature', p.metadata?.requireFeatures ?? []), 10),
    })),
    200,
  )
  const frontendPages = cap(
    pageList(raw?.frontendPages ?? []).map((p) => ({ path: p.path })),
    200,
  )

  const workers = cap(
    san
      .list(
        'queue name',
        // a queue name the engine could not resolve statically (null) is unknown, not invalid
        (raw?.ownedContracts?.worker ?? []).map((w) => w.metadata?.queue).filter((q) => q !== undefined && q !== null),
      )
      .map((queue) => ({ queue })),
    100,
  )
  const cli = cap(san.list('CLI command', raw?.cli ?? []), 100)
  const aiTools = cap(
    san.list(
      'AI tool',
      (raw?.aiTools ?? []).map((t) => t.name),
    ),
    100,
  )
  const aiAgents = cap(
    san.list(
      'AI agent',
      (raw?.aiAgents ?? []).map((a) => a.id),
    ),
    50,
  )

  const credentials: ModuleFacts['config']['credentials'] = []
  for (const d of x.integration?.definitions ?? [])
    for (const c of d.credentials)
      if (san.ok('credential key', c.key, d.src) && !credentials.some((k) => k.key === c.key))
        credentials.push({
          key: c.key,
          type: san.ok('credential type', c.type, d.src) ? c.type : 'text',
          required: c.required,
        })

  const env = cap(
    x.env.filter((e) => san.ok('env name', e.name, e.src)),
    100,
  )
  const hosts = cap(
    x.hosts.filter((h) => san.ok('host', h.host, h.src)),
    100,
  )
  const undeclared = declaredHosts
    ? hosts.filter((h) => h.confidence === 'high' && !hostDeclared(h.host, declaredHosts)).map((h) => h.host)
    : []

  // UMES contributions into other modules: registrations in core registries (integration
  // marketplace, payment providers, search, notifications) and targets that are not this module's own
  const ownEvents = new Set(emits.map((e) => e.id))
  const own = (t: string): boolean => t === id || t.startsWith(`${id}.`) || t.startsWith(`${id}:`) || ownEvents.has(t)
  const ext: ModuleFacts['extends'] = []
  const addExt = (kind: string, target: string): void => {
    if (!san.ok('extension target', target)) return
    if (!ext.some((e) => e.kind === kind && e.target === target)) ext.push({ kind: kind.slice(0, 40), target })
  }
  for (const c of contributions) {
    if (c.kind === 'specialized-registry') {
      const d = c.details as { registry?: unknown; registryId?: unknown } | undefined
      if (typeof d?.registry === 'string' && typeof d.registryId === 'string')
        addExt(c.kind, `${d.registry}:${d.registryId}`)
      continue
    }
    for (const t of c.targets) {
      const ownRef =
        t.resolution === 'fact-ref' &&
        ['events', 'entities', 'apiRoutes', 'commands'].includes(t.factRef?.factSection ?? '')
      if (ownRef || own(t.id)) continue
      addExt(c.kind, t.id)
    }
  }

  const unresolved = raw?.extensionSurfaces?.unresolved ?? []
  const setupFile =
    root && x.moduleRoot ? ['setup.ts', 'setup.tsx'].find((n) => isFile(join(x.moduleRoot as string, n))) : undefined
  const facts: MappedModule['facts'] = {
    id,
    title: san.text('title', raw?.title?.slice(0, 80), indexSrc),
    description: san.text('description', raw?.description?.slice(0, 300), indexSrc),
    requires: cap(requires, 30),
    ejectable: typeof meta.ejectable === 'boolean' ? meta.ejectable : null,
    data: {
      entities,
      migrations: migrationsOf(x.moduleRoot),
      customEntities: raw?.ownedContracts?.['custom-entity']?.length ?? 0,
    },
    http: {
      routes: cap(httpRoutes, 500),
      legacyRouteFiles: x.routes?.legacyRouteFiles ?? 0,
      authResolved: x.routes ? x.routes.authResolved : 0,
    },
    security: { aclFeatures, setupDefaultRoleFeatures: setupHasDefaultRoleFeatures(x.moduleRoot, raw) },
    events: { emits, subscribes: cap(subscribes, 200) },
    ui: {
      backendPages,
      frontendPages,
      // the injection table counts widgets under a computed spot key too (gateway-stripe, channel-discord)
      widgets: Math.max(contributions.filter((c) => c.kind === 'widget').length, x.injectionWidgets ?? 0),
      extensionHosts: raw?.extensionSurfaces?.hosts.length ?? 0,
    },
    background: { workers, cli },
    ai: { tools: aiTools, agents: aiAgents },
    config: { credentials: cap(credentials, 30), env },
    network: { hosts, undeclared: cap(undeclared, 100) },
    extends: cap(ext, 200),
    omImports: x.imports,
    collisionKeys: {
      moduleId: id,
      tables: [...new Set(entities.map((e) => e.table).filter((t): t is string => t !== null))],
      aclFeatures,
      eventIds: emits.map((e) => e.id),
      backendRoutes: backendPages.map((p) => p.path),
    },
    publicRoutes: httpRoutes.filter((r) => r.requireAuth === false).length,
  }
  const firstUnresolved = unresolved[0]
  return {
    facts,
    sanitizer: san,
    lintInput: {
      requireRolesSrc,
      referencedFeatures: referenced,
      declaredVersions: [],
      extensionUnresolved: unresolved.length,
      extensionUnresolvedSrc: firstUnresolved ? srcAt(root, firstUnresolved.source.path, null, 1) : null,
      hasApiDir: x.moduleRoot ? isDir(join(x.moduleRoot, 'api')) : true,
      hasDataDir: x.moduleRoot ? isDir(join(x.moduleRoot, 'data')) : true,
      firstEventSrc: emits[0]?.src ?? null,
      firstNoOpenApiSrc: httpRoutes.find((r) => !r.hasOpenApi)?.src ?? null,
      firstPublicSrc: httpRoutes.find((r) => r.requireAuth === false)?.src ?? null,
      setupSrc: setupFile ? srcAt(root, `src/modules/${id}/${setupFile}`, null, 1) : null,
    },
  }
}

/** Sorted lint, errors first, at most 100. */
export function sortLint(list: LintFinding[]): LintFinding[] {
  const rank = { error: 0, warn: 1, info: 2 } as const
  const seen = new Set<string>()
  return list
    .filter((f) => {
      const k = `${f.code}|${f.message}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => rank[a.severity] - rank[b.severity] || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .slice(0, 100)
}

function hasTestFiles(pkgRoot: string): boolean {
  try {
    const all = readdirSync(pkgRoot, { recursive: true }) as string[]
    return all.some((p) => {
      const s = String(p)
      if (s.startsWith('node_modules')) return false
      return s.split(/[\\/]/).includes('__tests__') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(s)
    })
  } catch {
    return false
  }
}

function rootFile(pkgRoot: string, re: RegExp): string | null {
  try {
    const n = readdirSync(pkgRoot)
      .sort()
      .find((x) => re.test(x))
    return n ? join(pkgRoot, n) : null
  } catch {
    return null
  }
}

const strRecord = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {}
  if (v && typeof v === 'object' && !Array.isArray(v))
    for (const [k, x] of Object.entries(v)) if (typeof x === 'string') out[k] = x
  return out
}

/** Packages whose anatomy is not published (license forbids it; i1 §5, spec 11.1 nr 13). */
export const WITHHELD = new Set(['@open-mercato/enterprise'])

/**
 * Facts of one unpacked package (`pkgRoot` holds package.json). Throws only on a missing or broken
 * package.json; engine failures degrade to our own readers with a diagnostic.
 */
export async function scanPackageDir(pkgRoot: string, ctx: ScanContext): Promise<Facts> {
  const t0 = performance.now()
  const { mod, engine } = await loadEngine()
  clearParseCache()
  lineCache.clear()
  const pjFile = join(pkgRoot, 'package.json')
  if (!isFile(pjFile)) throw new Error('package.json missing in the package')
  const pj = JSON.parse(readFileSync(pjFile, 'utf8')) as Record<string, unknown>
  const name = typeof pj.name === 'string' ? pj.name : ''
  const version =
    typeof pj.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pj.version) ? pj.version : '0.0.0'
  const diagnostics: string[] = []
  if (version === '0.0.0' && pj.version !== '0.0.0') diagnostics.push('package.json version is not semver')

  const gate = readGate(pkgRoot)
  const kind = resolveKind(gate, pj, { proposed: ctx.descriptor?.kind, extends: ctx.descriptor?.extends })
  if (kind.note) diagnostics.push(kind.note)
  if (gate.skippedDirs > 0)
    diagnostics.push(`${gate.skippedDirs} folders under src/modules are not module IDs and were skipped`)
  if (!isDir(join(pkgRoot, 'src'))) diagnostics.push('No src/ in the tarball: anatomy is not available.')

  const coreIds = new Set(ctx.builtin?.modules.map((m) => m.id) ?? [])
  const srcRoot = join(pkgRoot, 'src')
  const modulesRoot = join(srcRoot, 'modules')
  const sharedFiles = isDir(srcRoot) ? codeFiles(srcRoot).filter((f) => !f.startsWith(modulesRoot + sep)) : []
  const sharedImports = new ImportCollector().scanFiles(sharedFiles)

  const withheld = WITHHELD.has(name)
  if (withheld) diagnostics.push('Anatomy withheld: the enterprise license does not allow publishing it.')

  const scriptsRec = strRecord(pj.scripts)
  const omPeers = Object.fromEntries(
    Object.entries(strRecord(pj.peerDependencies)).filter(([k]) => k.startsWith('@open-mercato/')),
  )
  const dependencies = strRecord(pj.dependencies)

  const mapped: { m: MappedModule; info: ReturnType<typeof moduleInfoOf>; integration: IntegrationRead }[] = []
  const badIds: string[] = []
  for (const id of withheld ? [] : gate.sourceModules) {
    if (!ModuleId.safeParse(id).success) {
      badIds.push(id)
      continue
    }
    const moduleRoot = join(modulesRoot, id)
    let raw: OmModuleFacts | null = null
    try {
      raw = mod.extractModuleFacts({
        moduleId: id,
        moduleRoot,
        sourcePackage: name,
        sourceVersion: version,
        coreVersion: null,
        portableSourceRoot: `src/modules/${id}`,
        factsContractVersion: 2,
      })
    } catch (err) {
      diagnostics.push(`engine failed on ${id}: ${String((err as Error).message ?? err).slice(0, 200)}`)
    }
    for (const w of raw?.warnings ?? [])
      if (!/module registry unavailable/.test(w))
        diagnostics.push(`${id}: ${w.split(pkgRoot + sep).join('')}`.slice(0, 300))
    const files = codeFiles(moduleRoot)
    const all = [...files, ...sharedFiles]
    const routes = scanRoutes(pkgRoot, moduleRoot, id)
    diagnostics.push(...routes.diagnostics)
    const integration = readIntegration(pkgRoot, moduleRoot)
    const entityTables = scanEntityTables(pkgRoot, moduleRoot, id)
    const tables = [
      ...entityTables,
      ...scanMigrationTables(pkgRoot, moduleRoot, id).filter((t) => !entityTables.some((e) => e.table === t.table)),
    ]
    const imports = new ImportCollector().scanFiles(files).merge(sharedImports).toJSON()
    const m = mapModule(
      id,
      raw,
      {
        pkgRoot,
        moduleRoot,
        routes,
        integration,
        env: scanEnv(pkgRoot, all),
        hosts: scanHosts(pkgRoot, all),
        imports,
        tables,
        injectionWidgets: injectionWidgets(moduleRoot),
      },
      coreIds,
      ctx.descriptor?.declares?.hosts ?? null,
    )
    mapped.push({ m, info: moduleInfoOf(moduleRoot), integration })
  }

  const firstInfo = mapped.find((x) => x.info.license)?.info.license ?? null
  const firstIntegration = mapped.flatMap((x) => x.integration.definitions).find((d) => d.license)?.license ?? null
  const license = resolveLicense({
    packageName: name,
    packageJson: pj.license,
    licenseFile: licenseFileOf(pkgRoot),
    moduleInfo: firstInfo,
    integrationTs: firstIntegration,
  })

  const agentsMd = rootFile(pkgRoot, /^AGENTS\.md$/i) !== null
  const pkgLint = lintPackage({
    packageName: name,
    packageVersion: version,
    scripts: scriptsRec,
    source: ctx.source,
    bindingGyp: isFile(join(pkgRoot, 'binding.gyp')),
    omPeers,
    dependencies,
    license,
    shipsTests: hasTestFiles(pkgRoot),
    agentsMd,
    descriptor: ctx.descriptor ?? null,
    latestOm: ctx.latestOm ?? null,
    templateDeps: ctx.templateDeps ?? null,
    templateOm: ctx.latestOm ?? null,
  })
  if (badIds.length > 0) {
    pkgLint.push(
      finding(
        'module-id-format',
        `Module folder ${badIds[0]} is not a valid module ID (lower snake_case, starts with a letter).`,
      ),
    )
    diagnostics.push(`${badIds.length} module folders fail the module ID pattern`)
  }

  const modules: ModuleFacts[] = mapped.map(({ m, info, integration }) => {
    const declaredVersions = [
      ...integration.definitions
        .filter((d) => d.version)
        .map((d) => ({ where: 'integration.ts', version: d.version as string, src: d.src })),
      ...(info.version
        ? [
            {
              where: 'ModuleInfo',
              version: info.version,
              src: srcAt(pkgRoot, `src/modules/${m.facts.id}/index.ts`, null, info.line),
            },
          ]
        : []),
    ]
    const lint = lintModule({
      ...m.lintInput,
      declaredVersions,
      facts: m.facts,
      packageVersion: version,
      official: isOfficialName(name),
      builtin: ctx.builtin ?? null,
      descriptor: ctx.descriptor ?? null,
    })
    return { ...m.facts, glyph: glyphOf(m.facts), lint: sortLint([...m.sanitizer.findings(), ...lint, ...pkgLint]) }
  })

  const allRoutes = modules.flatMap((m) => m.http.routes)
  const integrationStates = mapped.map((x) => x.integration.status)
  const readme = rootFile(pkgRoot, /^README(\.md|\.markdown|\.txt)?$/i)
  const facts = {
    factsVersion: 1 as const,
    extractor: {
      engine,
      factsContractVersion: 2 as const,
      catalog: `om-modules rentgen ${RENTGEN_VERSION}`,
      durationMs: 0,
    },
    package: { locator: ctx.locator, name, version, integrity: ctx.integrity, source: ctx.source, gitRef: ctx.gitRef },
    gate: {
      installable: gate.installable,
      needsModuleFlag: gate.needsModuleFlag,
      reason: gate.reason,
      modules: gate.modules,
    },
    kind: kind.kind,
    license,
    omPeers,
    dependencies,
    agentsMd,
    readmeExcerpt: readme ? stripControl(readFileSync(readme, 'utf8')).slice(0, 4000) : null,
    modules,
    coverage: {
      routesAuthResolved:
        allRoutes.length === 0
          ? 1
          : Math.round((allRoutes.filter((r) => r.requireAuth !== null).length / allRoutes.length) * 10000) / 10000,
      integrationTs: integrationStates.includes('unparsed')
        ? ('unparsed' as const)
        : integrationStates.includes('expanded')
          ? ('expanded' as const)
          : ('absent' as const),
    },
    diagnostics: [...new Set(diagnostics)].map((d) => d.slice(0, 300)).slice(0, 50),
  }
  facts.extractor.durationMs = Math.round(performance.now() - t0)
  const parsed = Facts.safeParse(facts)
  if (!parsed.success)
    throw new Error(
      `Rentgen produced invalid Facts for ${ctx.locator}: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    )
  return parsed.data
}

/**
 * Package-level lint recomputed from Facts, for packages without modules (providers, libraries,
 * tools have no ModuleFacts to carry findings). Install scripts and shipped tests are not in Facts;
 * Supply chain reads scripts from the sync record (spec 6.2 SIG-SUP).
 */
export function packageFindings(
  facts: Facts,
  opts: { latestOm?: string | null; templateDeps?: Record<string, string> | null } = {},
): LintFinding[] {
  return lintPackage({
    packageName: facts.package.name,
    packageVersion: facts.package.version,
    scripts: {},
    bindingGyp: false,
    omPeers: facts.omPeers,
    dependencies: facts.dependencies,
    license: facts.license,
    shipsTests: false,
    agentsMd: facts.agentsMd,
    latestOm: opts.latestOm ?? null,
    templateDeps: opts.templateDeps ?? null,
    templateOm: opts.latestOm ?? null,
  })
}

export { anatomyStatus }

// ---------------------------------------------------------------- tarballs and the network

export interface ScanTarget {
  locator: string
  /** npm version or GitHub ref (tag or commit). Omitted: latest stable (npm) or newest tag (GitHub). */
  version?: string | undefined
}

/** `npm:@a/b@1.2.3`, `npm:b`, `github:o/r@v1.0.0` into locator and version. */
export function parseTarget(s: string): ScanTarget {
  const at = s.startsWith('npm:@') ? s.indexOf('@', 5) : s.indexOf('@')
  if (at < 0) return { locator: s }
  return { locator: s.slice(0, at), version: s.slice(at + 1) || undefined }
}

/** Facts of a tarball held in memory (npm tarball or GitHub archive), unpacked with the spec 5.5 filter. */
export async function scanTarballBuffer(
  buf: Uint8Array,
  ctx: ScanContext,
): Promise<{ facts: Facts; unpack: UnpackReport }> {
  const dir = tempDir()
  try {
    const unpack = await unpackTarball(buf, dir, { strip: 1 })
    const facts = await scanPackageDir(dir, ctx)
    const rejected = unpack.rejected.link + unpack.rejected.path + unpack.rejected.type
    if (rejected > 0) {
      const note = `Rejected ${rejected} tar entries (links: ${unpack.rejected.link}, unsafe paths: ${unpack.rejected.path}, other types: ${unpack.rejected.type}).`
      return { facts: Facts.parse({ ...facts, diagnostics: [note, ...facts.diagnostics].slice(0, 50) }), unpack }
    }
    return { facts, unpack }
  } finally {
    removeDir(dir)
  }
}

/** Download and scan one package version (read-only network: registry.npmjs.org, codeload.github.com, api.github.com). */
export async function scanRemote(
  target: ScanTarget,
  base: Omit<ScanContext, 'locator' | 'source' | 'integrity' | 'gitRef'>,
): Promise<Facts> {
  const loc = parseLocator(target.locator)
  if (loc.source === 'npm') {
    const m = await npmManifest(loc.name, target.version)
    const buf = await fetchNpmTarball(m)
    const { facts } = await scanTarballBuffer(buf, {
      ...base,
      locator: loc.locator,
      source: 'npm-tarball',
      integrity: m.dist.integrity ?? null,
      gitRef: typeof m.gitHead === 'string' && /^[0-9a-f]{7,40}$/.test(m.gitHead) ? m.gitHead : null,
    })
    return facts
  }
  const repo = `${loc.owner}/${loc.repo}`
  const ref = target.version ?? (await githubDefaultRef(repo))
  const buf = await fetchGithubArchive(repo, ref)
  const commit = await githubCommit(repo, ref)
  const { facts } = await scanTarballBuffer(buf, {
    ...base,
    locator: loc.locator,
    source: 'github-archive',
    integrity: null,
    gitRef: commit ?? ref,
  })
  return facts
}
