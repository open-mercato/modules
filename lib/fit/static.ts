// Static fit (spec 6.2 SIG-FIT, 4.5 FitCell): do the `@open-mercato/*` imports of a module resolve against the
// published packages of one OM version? Port of spikes/g2/scripts/compat.mjs: subpaths through `exports`
// (conditions types, import, default, node, require), named symbols through the TypeScript checker over the
// package files only (no lib, no third-party types). Reads files, executes nothing.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ts } from 'ts-morph'
import type { BuiltForKind, FitCell, FitStatus } from '../schema/index.ts'
import { driftBetween, sigOf, symbolKey } from './drift.ts'
import type { PackageProgram } from './drift.ts'
import { satisfies, valid, validRange } from './semver.ts'
import { hostDuplicateText } from '../core/finding.ts'

/** `{ pkg: { subpath: [symbols] } }`, the shape of `ModuleFacts.omImports` (subpath `.` = package root). */
export type ImportMap = Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>

/** Unpacked `@open-mercato/*` packages of one OM version: package name -> package directory (null = not published). */
export interface OmTree {
  version: string
  dirs: ReadonlyMap<string, string | null>
}

export type Resolution =
  | { status: 'noPkg' }
  | { status: 'noSubpath' }
  | { status: 'noFile' }
  | { status: 'ok'; typesFile: string | null; runtimeFile: string | null }

export interface MissingRef {
  pkg: string
  subpath: string
  symbol: string | null
  kind: 'subpath' | 'symbol'
}

export interface StaticResult {
  /** Named symbols looked up (without `*`, side effects and dynamic imports; symbols of a missing subpath are not counted). */
  checked: number
  missing: MissingRef[]
  /** Symbols not found behind an unresolved `export *`: status `unknown`, not a miss. */
  unknown: MissingRef[]
  /** `symbolKey -> signature hash` of every symbol found (input of drift). */
  sigs: Record<string, string | null>
}

const OM_SPEC = /^(@open-mercato\/[^/]+)(\/.*)?$/

export function specParts(spec: string): [string, string] | null {
  const m = OM_SPEC.exec(spec)
  return m ? [m[1] as string, m[2] ? m[2].slice(1) : '.'] : null
}

/** Symbol names that are not looked up (compat.mjs: `*` and `(side-effect)`, `(dynamic/require)`). */
export const isLookupSymbol = (s: string): boolean => s !== '*' && !s.startsWith('(')

const isFile = (p: string): boolean => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

type ExportTarget = string | null | readonly ExportTarget[] | { readonly [cond: string]: ExportTarget }

function pickCond(t: ExportTarget | undefined, prefs: readonly string[]): string[] {
  if (t === null || t === undefined) return []
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return (t as readonly ExportTarget[]).flatMap((x) => pickCond(x, prefs))
  const obj = t as { readonly [cond: string]: ExportTarget }
  const out: string[] = []
  for (const c of prefs) if (c in obj) out.push(...pickCond(obj[c], prefs))
  return out
}

function matchExport(
  map: Record<string, ExportTarget>,
  sub: string,
): { target: ExportTarget; star: string | null } | null {
  if (map[sub] !== undefined) return { target: map[sub] as ExportTarget, star: null }
  let best: { pre: string; target: ExportTarget; star: string } | null = null
  for (const key of Object.keys(map)) {
    const i = key.indexOf('*')
    if (i < 0) continue
    const pre = key.slice(0, i)
    const suf = key.slice(i + 1)
    if (sub.startsWith(pre) && sub.endsWith(suf) && sub.length >= key.length - 1) {
      if (!best || pre.length > best.pre.length)
        best = { pre, target: map[key] as ExportTarget, star: sub.slice(pre.length, sub.length - suf.length) }
    }
  }
  return best ? { target: best.target, star: best.star } : null
}

const TYPES_PREFS = ['types']
const RUNTIME_PREFS = ['import', 'default', 'node', 'require']

/** One OM version: package.json cache, programs per package, exports cache. */
export interface FitWorld {
  tree: OmTree
  pj: Map<string, Record<string, unknown> | null>
  progs: Map<string, PackageProgram>
  exportsCache: Map<string, { names: Set<string>; incomplete: boolean }>
}

export function createWorld(tree: OmTree): FitWorld {
  return { tree, pj: new Map(), progs: new Map(), exportsCache: new Map() }
}

function packageJson(world: FitWorld, pkg: string): Record<string, unknown> | null {
  if (!world.pj.has(pkg)) {
    const dir = world.tree.dirs.get(pkg) ?? null
    let v: Record<string, unknown> | null = null
    if (dir && isFile(join(dir, 'package.json')))
      v = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
    world.pj.set(pkg, v)
  }
  return world.pj.get(pkg) ?? null
}

/** Resolve `pkg/subpath` to a types file and a runtime file in the published package (compat.mjs resolveSubpath). */
export function resolveSubpath(world: FitWorld, pkg: string, subpath: string): Resolution {
  const p = packageJson(world, pkg)
  const root = world.tree.dirs.get(pkg) ?? null
  if (!p || !root) return { status: 'noPkg' }
  const sub = subpath === '.' ? '.' : `./${subpath}`
  const exp = p.exports as ExportTarget | Record<string, ExportTarget> | undefined
  if (exp !== undefined && exp !== null) {
    const map: Record<string, ExportTarget> =
      typeof exp === 'string' || Array.isArray(exp) || !Object.keys(exp).some((k) => k.startsWith('.'))
        ? { '.': exp as ExportTarget }
        : (exp as Record<string, ExportTarget>)
    const m = matchExport(map, sub)
    if (!m) return { status: 'noSubpath' }
    const cands = (prefs: readonly string[]): string[] =>
      pickCond(m.target, prefs).map((t) => join(root, m.star === null ? t : t.replaceAll('*', m.star)))
    const typesFile = cands(TYPES_PREFS).find(isFile) ?? null
    const runtime = cands(RUNTIME_PREFS)
    const runtimeFile = runtime.find(isFile) ?? null
    if (!typesFile && !runtimeFile) return { status: 'noFile' }
    // an export with runtime conditions whose files are all missing fails at runtime even when its types exist
    // (finding of 25 Oct: `types: ./src/*.ts` matched a src file the package ships without dist); a types-only
    // export has no runtime condition and stays ok
    if (runtime.length > 0 && !runtimeFile) return { status: 'noFile' }
    return { status: 'ok', typesFile, runtimeFile }
  }
  if (sub === '.') {
    const f = join(root, typeof p.main === 'string' ? p.main : 'index.js')
    return isFile(f) ? { status: 'ok', typesFile: null, runtimeFile: f } : { status: 'noFile' }
  }
  for (const ext of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.js']) {
    const f = join(root, subpath + ext)
    if (isFile(f))
      return { status: 'ok', typesFile: f.endsWith('.ts') || f.endsWith('.tsx') ? f : null, runtimeFile: f }
  }
  return { status: 'noSubpath' }
}

const fileOf = (r: Resolution): string | null => (r.status === 'ok' ? (r.typesFile ?? r.runtimeFile) : null)

function extOf(f: string): ts.Extension {
  if (f.endsWith('.d.ts')) return ts.Extension.Dts
  if (f.endsWith('.tsx')) return ts.Extension.Tsx
  if (f.endsWith('.ts')) return ts.Extension.Ts
  if (f.endsWith('.mjs')) return ts.Extension.Mjs
  if (f.endsWith('.cjs')) return ts.Extension.Cjs
  if (f.endsWith('.json')) return ts.Extension.Json
  return ts.Extension.Js
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  checkJs: false,
  noEmit: true,
  skipLibCheck: true,
  noLib: true,
  types: [],
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
  allowArbitraryExtensions: true,
}

/** Program over the given files of one package; `@open-mercato/*` specifiers resolve inside this OM version only. */
export function buildProgram(world: FitWorld, rootFiles: readonly string[]): PackageProgram {
  const opts = COMPILER_OPTIONS
  const host = ts.createCompilerHost(opts, true)
  const resolveOm = (spec: string): string | null => {
    const sp = specParts(spec)
    return sp ? fileOf(resolveSubpath(world, sp[0], sp[1])) : null
  }
  host.resolveModuleNameLiterals = (
    lits: readonly ts.StringLiteralLike[],
    containing: string,
  ): ts.ResolvedModuleWithFailedLookupLocations[] =>
    lits.map((l: ts.StringLiteralLike): ts.ResolvedModuleWithFailedLookupLocations => {
      const t = l.text
      if (t.startsWith('.')) return { resolvedModule: ts.resolveModuleName(t, containing, opts, host).resolvedModule }
      const f = resolveOm(t)
      if (f) return { resolvedModule: { resolvedFileName: f, extension: extOf(f), isExternalLibraryImport: false } }
      return { resolvedModule: undefined }
    })
  const program = ts.createProgram({ rootNames: [...rootFiles], options: opts, host })
  const checker = program.getTypeChecker()
  const resolveFromFile = (spec: string, from: string): string | null => {
    if (spec.startsWith('.'))
      return ts.resolveModuleName(spec, from, opts, host).resolvedModule?.resolvedFileName ?? null
    return resolveOm(spec)
  }
  return { program, checker, resolveFromFile }
}

/** True when an `export *` chain of the file reaches something that does not resolve (compat.mjs isIncomplete). */
function isIncomplete(prog: PackageProgram, file: string, seen: Set<string> = new Set()): boolean {
  if (seen.has(file)) return false
  seen.add(file)
  const sf = prog.program.getSourceFile(file)
  if (!sf) return true
  for (const st of sf.statements) {
    if (
      ts.isExportDeclaration(st) &&
      st.moduleSpecifier &&
      !st.exportClause &&
      ts.isStringLiteral(st.moduleSpecifier)
    ) {
      const f = prog.resolveFromFile(st.moduleSpecifier.text, file)
      if (!f) return true
      if (isIncomplete(prog, f, seen)) return true
    }
  }
  return false
}

function exportsOf(world: FitWorld, prog: PackageProgram, file: string): { names: Set<string>; incomplete: boolean } {
  const hit = world.exportsCache.get(file)
  if (hit) return hit
  const names = new Set<string>()
  const sf = prog.program.getSourceFile(file)
  if (sf) {
    const sym = prog.checker.getSymbolAtLocation(sf)
    if (sym) for (const e of prog.checker.getExportsOfModule(sym)) names.add(e.name)
  }
  const r = { names, incomplete: isIncomplete(prog, file) }
  world.exportsCache.set(file, r)
  return r
}

function* entries(imports: ImportMap): Generator<[string, string, readonly string[]]> {
  for (const pkg of Object.keys(imports).sort())
    for (const [subpath, symbols] of Object.entries(imports[pkg] ?? {}).sort(([a], [b]) => a.localeCompare(b)))
      yield [pkg, subpath, symbols]
}

/** `@open-mercato/*` package names a set of import maps refers to. */
export function omPackagesOf(all: readonly ImportMap[]): Set<string> {
  const out = new Set<string>()
  for (const imports of all) for (const [pkg] of entries(imports)) if (pkg.startsWith('@open-mercato/')) out.add(pkg)
  return out
}

/** Build the programs this world needs for the given modules (one per imported package, roots = resolved files). */
export function preparePrograms(world: FitWorld, all: readonly ImportMap[]): void {
  const need = new Map<string, Set<string>>()
  for (const imports of all)
    for (const [pkg, subpath] of entries(imports)) {
      if (!pkg.startsWith('@open-mercato/')) continue
      const f = fileOf(resolveSubpath(world, pkg, subpath))
      if (!f) continue
      const set = need.get(pkg) ?? new Set<string>()
      set.add(f)
      need.set(pkg, set)
    }
  for (const [pkg, files] of need) {
    const prev = world.progs.get(pkg)
    const known: Set<string> = prev ? new Set<string>(prev.program.getRootFileNames()) : new Set<string>()
    if (prev && [...files].every((f) => known.has(f))) continue
    world.progs.set(pkg, buildProgram(world, [...new Set<string>([...known, ...files])]))
  }
}

/** Fit of one module's imports against the world's OM version (compat.mjs main loop, one version). */
export function checkImports(world: FitWorld, imports: ImportMap): StaticResult {
  preparePrograms(world, [imports])
  const missing: MissingRef[] = []
  const unknown: MissingRef[] = []
  const sigs: Record<string, string | null> = {}
  let checked = 0
  for (const [pkg, subpath, symbols] of entries(imports)) {
    if (!pkg.startsWith('@open-mercato/')) continue
    const r = resolveSubpath(world, pkg, subpath)
    if (r.status !== 'ok') {
      missing.push({ pkg, subpath, symbol: null, kind: 'subpath' })
      continue
    }
    const file = (r.typesFile ?? r.runtimeFile) as string
    const prog = world.progs.get(pkg)
    if (!prog) continue
    const ex = exportsOf(world, prog, file)
    for (const sym of [...symbols].sort()) {
      if (!isLookupSymbol(sym)) continue
      const base = sym.split('.')[0] as string
      checked++
      if (ex.names.has(base)) {
        sigs[symbolKey(pkg, subpath, base)] = sigOf(prog, file, base)
        continue
      }
      const rec: MissingRef = { pkg, subpath, symbol: sym, kind: 'symbol' }
      if (ex.incomplete) unknown.push(rec)
      else missing.push(rec)
    }
  }
  return { checked, missing, unknown, sigs }
}

/** Union of `omImports` over the modules of one package (facts are per module, Fit is per package). */
export function mergeImports(maps: readonly ImportMap[]): ImportMap {
  const out: Record<string, Record<string, Set<string>>> = {}
  for (const m of maps)
    for (const [pkg, subpath, symbols] of entries(m)) {
      const bySub = (out[pkg] ??= {})
      const set = (bySub[subpath] ??= new Set<string>())
      for (const s of symbols) set.add(s)
    }
  return Object.fromEntries(
    Object.entries(out).map(([pkg, subs]) => [
      pkg,
      Object.fromEntries(Object.entries(subs).map(([sub, set]) => [sub, [...set].sort()])),
    ]),
  )
}

// ---- declared compatibility (Built for)

/** Kind of a peer range (`BuiltForKind`, spec 4.1). */
export function builtForKind(range: string | null): BuiltForKind {
  if (range === null) return 'missing'
  const r = range.trim()
  if (r === '' || r === '*' || r === 'x' || r === 'X' || r === 'latest') return 'star'
  if (valid(r.replace(/^=\s*/, '').replace(/^v/, '')) && !/[<>~^|\s]/.test(r.replace(/^=\s*/, ''))) return 'exact-pin'
  if (/^\^0\.\d+\.\d+\S*$/.test(r)) return 'caret-0x'
  const norm = validRange(r)
  if (norm === null) return 'open'
  if (norm === '*') return 'star'
  return norm.split('||').every((part) => part.includes('<')) ? 'bounded' : 'open'
}

/** The range shown as "Built for": the `@open-mercato/core` peer, else `shared`, else the first by name. */
export function builtForRange(omPeers: Readonly<Record<string, string>>): string | null {
  const names = Object.keys(omPeers)
    .filter((n) => n.startsWith('@open-mercato/'))
    .sort()
  if (names.length === 0) return null
  const pick = names.includes('@open-mercato/core')
    ? '@open-mercato/core'
    : names.includes('@open-mercato/shared')
      ? '@open-mercato/shared'
      : (names[0] as string)
  return omPeers[pick] ?? null
}

/**
 * Do the module's `@open-mercato/*` peers accept this OM version? All of them must (OM packages ship in lockstep).
 * Prerelease snapshots count (`next` = `0.10.1-develop.*`). No peers: nothing rejects the version.
 */
export function peersAccept(omPeers: Readonly<Record<string, string>>, omVersion: string): boolean {
  const ranges = Object.entries(omPeers)
    .filter(([n]) => n.startsWith('@open-mercato/'))
    .map(([, r]) => r.trim())
  return ranges.every(
    (r) => r === '' || r === '*' || r === 'latest' || satisfies(omVersion, r, { includePrerelease: true }),
  )
}

export function declaredFor(omPeers: Readonly<Record<string, string>>, omVersion: string): FitCell['declared'] {
  const range = builtForRange(omPeers)
  return { range, kind: builtForKind(range), satisfied: peersAccept(omPeers, omVersion) }
}

/**
 * Input of the `/compat` sentence (spec D13, `CompatIndex.peersRejectFitting`): `fitting` = cells that fit
 * statically (`ok` or `drift`), `rejected` = those of them whose peers do not accept the OM version.
 */
export function peersRejectFitting(cells: readonly Pick<FitCell, 'status' | 'declared'>[]): {
  rejected: number
  fitting: number
} {
  const fit = cells.filter((c) => c.status === 'ok' || c.status === 'drift')
  return { rejected: fit.filter((c) => !c.declared.satisfied).length, fitting: fit.length }
}

// ---- cell

export const MAX_LIST = 50

export function fitStatus(
  missing: readonly unknown[],
  unknown: readonly unknown[],
  drift: readonly unknown[],
): FitStatus {
  if (missing.length > 0) return 'no-fit'
  if (unknown.length > 0) return 'unknown'
  return drift.length > 0 ? 'drift' : 'ok'
}

/**
 * FitCell for one module version against one OM version. `latest` is the result of the same module against the
 * `latest` line: drift is reported only against latest (spec 6.2), so pass null when this cell is latest.
 */
export function fitCell(args: {
  result: StaticResult
  latest: StaticResult | null
  omPeers: Readonly<Record<string, string>>
  omVersion: string
  hostDuplicates: FitCell['hostDuplicates']
}): FitCell {
  const drift = args.latest ? driftBetween(args.latest.sigs, args.result.sigs).changed : []
  return {
    status: fitStatus(args.result.missing, args.result.unknown, drift),
    checked: args.result.checked,
    missing: args.result.missing.slice(0, MAX_LIST),
    drift: drift.slice(0, MAX_LIST).map((d) => d.slice(0, 160)),
    declared: declaredFor(args.omPeers, args.omVersion),
    hostDuplicates: args.hostDuplicates.slice(0, 30),
  }
}

// ---- host-dependency-duplication (spec 6.6)

/** Packages a module must not bundle in `dependencies` when the app template has them (spec 6.6). */
export const HOST_PACKAGES: readonly RegExp[] = [
  /^@tanstack\//,
  /^react$/,
  /^react-dom$/,
  /^next$/,
  /^@mikro-orm\//,
  /^zod$/,
]

export const isHostPackage = (name: string): boolean => HOST_PACKAGES.some((re) => re.test(name))

/**
 * Host packages the module bundles in a version the app does not resolve to. `appVersion(name)` is the version
 * a fresh app of the line resolves (null: template does not have it or it cannot be resolved).
 */
export function hostDuplicates(
  dependencies: Readonly<Record<string, string>>,
  appVersion: (name: string) => string | null,
): FitCell['hostDuplicates'] {
  const out: FitCell['hostDuplicates'] = []
  for (const name of Object.keys(dependencies).sort()) {
    if (!isHostPackage(name)) continue
    const moduleRange = dependencies[name] as string
    const app = appVersion(name)
    if (app === null) continue
    if (!satisfies(app, moduleRange, { includePrerelease: true })) out.push({ name, moduleRange, appVersion: app })
  }
  return out
}

/** Lint text of spec 6.6 for one duplicate (lib/core/finding.ts hostDuplicateText, one line). */
export function hostDuplicateMessage(d: FitCell['hostDuplicates'][number], omVersion: string): string {
  return hostDuplicateText({ ...d, lines: [], om: [omVersion] })
}
