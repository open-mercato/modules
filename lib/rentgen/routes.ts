// API routes of a module, read statically (port of spikes/g2/scripts/scan.mjs, extended to the three
// layouts the OM generator registers in packages/cli/src/lib/generators/module-registry.ts:2380-2520):
//   1. `api/**/route.ts`: methods from exported GET/POST/..., path `/<moduleId>/<dirs>`;
//   2. plain files `api/**/<name>.ts` outside method folders: path `/<moduleId>/<dirs>/<name>`;
//   3. legacy `api/<method>/**/<name>.ts`: method from the folder, path `/<moduleId>/<dirs>/<name>`.
// `metadata.path` overrides the path in all three. Public URL = `/api` + path.
// Auth follows the runtime (apps/mercato/src/app/api/[...slug]/route.ts:105-157): the entry is
// `metadata[METHOD]` when it is an object, else `metadata`; a route is public only when
// `requireAuth === false`; no `metadata` export at all means auth is required.
import { join } from 'node:path'
import { ts } from 'ts-morph'
import {
  exportsOf,
  isDir,
  isLitObject,
  isTestFile,
  isUnknown,
  lineOf,
  parseSource,
  relPath,
  resolveRelative,
  stringList,
  walkFiles,
  evalLiteral,
  type Lit,
} from './ast.ts'

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export interface RouteFact {
  method: HttpMethod
  /** Public path, `/api/...`. */
  path: string
  /** true or false when known statically; null when the metadata needs execution. */
  requireAuth: boolean | null
  requireFeatures: string[]
  /** `requireRoles` is declared (deprecated, not enforced at runtime). */
  requireRoles: boolean
  hasOpenApi: boolean
  src: { file: string; line: number }
  layout: 'route-file' | 'plain' | 'legacy'
}

export interface RouteScan {
  routes: RouteFact[]
  /** Files in `api/<method>/` folders (old convention). */
  legacyRouteFiles: number
  /** Share of routes whose `requireAuth` is known statically (1 when there are no routes). */
  authResolved: number
  diagnostics: string[]
}

const METHOD_DIRS = new Set(HTTP_METHODS.map((m) => m.toLowerCase()))
const stem = (name: string): string => name.replace(/\.(tsx?|jsx?)$/, '')
const isRouteName = (name: string): boolean => stem(name) === 'route' && /\.(tsx?|jsx?)$/.test(name)
const isScript = (name: string): boolean => /\.(ts|js)$/.test(name) && !name.endsWith('.d.ts') && !isTestFile(name)

interface FileMeta {
  methods: HttpMethod[]
  methodNodes: Map<HttpMethod, ts.Node>
  /** undefined: no metadata export (auth required by default); UNKNOWN: not static. */
  metadata: Lit | undefined
  hasOpenApi: boolean
  firstLine: number
}

function readFile(file: string, depth = 0): FileMeta | null {
  const sf = parseSource(file)
  if (!sf) return null
  const ex = exportsOf(sf)
  const reexported = ex.from.get('metadata')
  const methods: HttpMethod[] = []
  const methodNodes = new Map<HttpMethod, ts.Node>()
  for (const m of HTTP_METHODS)
    if (ex.names.has(m)) {
      methods.push(m)
      const n = ex.nodes.get(m)
      if (n) methodNodes.set(m, n)
    }
  let metadata: Lit | undefined
  if (reexported && depth < 3) {
    // `export { metadata } from './other/route'`: follow the relative file statically
    const target = resolveRelative(file, reexported.spec)
    const inner = target ? readFile(target, depth + 1) : null
    metadata = inner && reexported.name === 'metadata' ? inner.metadata : evalLiteral(undefined, sf)
  } else if (ex.names.has('metadata')) {
    const init = ex.initializers.get('metadata')
    metadata = init ? evalLiteral(init, sf) : evalLiteral(undefined, sf)
  } else if (ex.reexports) {
    // `export * from` or `export { metadata } from` elsewhere: cannot tell statically
    metadata = evalLiteral(undefined, sf)
  }
  const first = sf.statements[0]
  return {
    methods,
    methodNodes,
    metadata,
    hasOpenApi: ex.names.has('openApi'),
    firstLine: first ? lineOf(sf, first) : 1,
  }
}

function lineFor(file: string, meta: FileMeta, method: HttpMethod | null): number {
  const sf = parseSource(file)
  const node = method ? meta.methodNodes.get(method) : undefined
  if (sf && node) return lineOf(sf, node)
  if (sf) {
    const def = exportsOf(sf).nodes.get('default')
    if (def) return lineOf(sf, def)
  }
  return meta.firstLine
}

function resolvePath(metadata: Lit | undefined, fallback: string): string {
  if (isLitObject(metadata) && typeof metadata.path === 'string' && metadata.path.length > 0) {
    // express-style `:param` segments are written as `[param]`, like file-based routes
    const p = metadata.path.replace(/:([A-Za-z0-9_]+)/g, '[$1]')
    return p.startsWith('/') ? p : `/${p}`
  }
  return fallback
}

function authOf(
  metadata: Lit | undefined,
  method: HttpMethod,
  legacy: boolean,
): { requireAuth: boolean | null; requireFeatures: string[]; requireRoles: boolean } {
  if (metadata === undefined) return { requireAuth: true, requireFeatures: [], requireRoles: false }
  if (isUnknown(metadata) || !isLitObject(metadata))
    return { requireAuth: null, requireFeatures: [], requireRoles: false }
  // runtime: entry = metadata[METHOD] when it is an object, else metadata (legacy files are wrapped
  // as { [METHOD]: metadata } first, which resolves to the same entry)
  void legacy
  let entry: Lit | undefined = metadata
  const e = metadata[method]
  if (isLitObject(e)) entry = e
  else if (e !== undefined && isUnknown(e)) return { requireAuth: null, requireFeatures: [], requireRoles: false }
  else if (e === undefined && '...' in metadata) return { requireAuth: null, requireFeatures: [], requireRoles: false }
  if (!isLitObject(entry)) return { requireAuth: null, requireFeatures: [], requireRoles: false }
  const ra = entry.requireAuth
  const hidden = '...' in entry
  const requireAuth = ra === undefined ? (hidden ? null : true) : typeof ra === 'boolean' ? ra : null
  const rf = entry.requireFeatures
  const requireFeatures = rf === undefined ? [] : stringList(rf)
  return { requireAuth, requireFeatures, requireRoles: entry.requireRoles !== undefined }
}

/** Route facts of `src/modules/<moduleId>` (paths relative to `pkgRoot` in `src`). */
export function scanRoutes(pkgRoot: string, moduleRoot: string, moduleId: string): RouteScan {
  const apiRoot = join(moduleRoot, 'api')
  const out: RouteScan = { routes: [], legacyRouteFiles: 0, authResolved: 1, diagnostics: [] }
  if (!isDir(apiRoot)) return out
  const seen = new Set<string>()
  const push = (file: string, meta: FileMeta, method: HttpMethod, path: string, layout: RouteFact['layout']): void => {
    const key = `${method} ${path}`
    if (seen.has(key)) return
    seen.add(key)
    const auth = authOf(meta.metadata, method, layout === 'legacy')
    out.routes.push({
      method,
      path: `/api${path === '/' ? '' : path}`,
      ...auth,
      hasOpenApi: meta.hasOpenApi,
      src: { file: relPath(pkgRoot, file), line: lineFor(file, meta, layout === 'legacy' ? null : method) },
      layout,
    })
  }
  const segsOf = (file: string, base: string): string[] => relPath(base, file).split('/')

  // 1. route files anywhere under api/ (the generator does not skip method folders here)
  for (const file of walkFiles(apiRoot)) {
    const segs = segsOf(file, apiRoot)
    const name = segs.pop() as string
    if (!isRouteName(name)) continue
    const meta = readFile(file)
    if (!meta) {
      out.diagnostics.push(`routes: cannot parse ${relPath(pkgRoot, file)}`)
      continue
    }
    if (meta.methods.length === 0) continue
    const path = resolvePath(meta.metadata, '/' + [moduleId, ...segs].filter(Boolean).join('/'))
    for (const m of meta.methods) push(file, meta, m, path, 'route-file')
  }

  // 2. plain files outside method folders
  for (const file of walkFiles(apiRoot, (dir) => METHOD_DIRS.has(dir.toLowerCase()))) {
    const segs = segsOf(file, apiRoot)
    const name = segs.pop() as string
    if (isRouteName(name) || !isScript(name)) continue
    const meta = readFile(file)
    if (!meta || meta.methods.length === 0) continue
    const path = resolvePath(meta.metadata, '/' + [moduleId, ...segs, stem(name)].filter(Boolean).join('/'))
    for (const m of meta.methods) push(file, meta, m, path, 'plain')
  }

  // 3. legacy per-method folders
  for (const method of HTTP_METHODS) {
    const dir = join(apiRoot, method.toLowerCase())
    if (!isDir(dir)) continue
    for (const file of walkFiles(dir)) {
      const segs = segsOf(file, dir)
      const name = segs.pop() as string
      if (!/\.(ts|js)$/.test(name) || name.endsWith('.d.ts') || /\.(test|spec)\.[jt]s$/.test(name)) continue
      out.legacyRouteFiles++
      const meta = readFile(file)
      if (!meta) {
        out.diagnostics.push(`routes: cannot parse ${relPath(pkgRoot, file)}`)
        continue
      }
      const path = resolvePath(meta.metadata, '/' + [moduleId, ...segs, stem(name)].filter(Boolean).join('/'))
      push(file, meta, method, path, 'legacy')
    }
  }

  const resolved = out.routes.filter((r) => r.requireAuth !== null).length
  out.authResolved = out.routes.length === 0 ? 1 : Math.round((resolved / out.routes.length) * 10000) / 10000
  out.routes.sort((a, b) =>
    a.path === b.path ? HTTP_METHODS.indexOf(a.method) - HTTP_METHODS.indexOf(b.method) : a.path < b.path ? -1 : 1,
  )
  return out
}

export const _internal = { authOf, resolvePath }
