// `yarn om scan`: Rentgen (static anatomy) of package versions and of the built-in core modules
// (spec 5.4). Reads tarballs only; module code is never executed.
//   scan <locator>[@<version>] [--to <dir>] [--force]
//   scan --queue <file> [--to <dir>] [--concurrency <n>] [--report <file>] [--force]
//   scan --builtin <coreVersion> [--to <dir>]
//   scan --dir <unpacked package or .tgz> --locator <locator> [--to <dir>]
// Output: <to>/facts/<locpath>/<version>.json or <to>/builtin/<coreVersion>.json (<to> = --data).
// A facts file with the same integrity, engine and Rentgen version is kept (cache, spec 3.2).
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import pLimit from 'p-limit'
import { parse as parseYaml } from 'yaml'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import {
  builtinCategories,
  builtinFromModuleFacts,
  loadModuleFactsJson,
  readBuiltinCategories,
  readBuiltinUpcoming,
} from '../rentgen/builtin.ts'
import { anatomyStatus } from '../rentgen/diff.ts'
import {
  loadEngine,
  parseTarget,
  RENTGEN_VERSION,
  scanPackageDir,
  scanRemote,
  scanTarballBuffer,
  type DescriptorHints,
  type ScanContext,
  type ScanTarget,
} from '../rentgen/extract.ts'
import { npmManifest, RentgenError } from '../rentgen/unpack.ts'
import { Descriptor } from '../schema/descriptor.ts'
import { BuiltinData, Facts } from '../schema/data/facts.ts'
import { Lines } from '../schema/data/lines.ts'
import { descriptorFile, locatorToPath, parseLocator } from '../schema/locator.ts'

export const description = 'Anatomy (static facts) of tarballs or built-in modules'

interface Opts {
  to: string
  queue: string | null
  builtin: string | null
  dir: string | null
  locator: string | null
  report: string | null
  concurrency: number
  force: boolean
  targets: string[]
}

function parseArgs(args: string[], dataDir: string): Opts {
  const o: Opts = {
    to: dataDir,
    queue: null,
    builtin: null,
    dir: null,
    locator: null,
    report: null,
    concurrency: 4,
    force: false,
    targets: [],
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const eq = a.indexOf('=')
    const key = a.startsWith('--') && eq > 0 ? a.slice(0, eq) : a
    const val = (): string => {
      const v = eq > 0 && a.startsWith('--') ? a.slice(eq + 1) : args[++i]
      if (v === undefined || v === '') throw new Error(`${key} needs a value`)
      return v
    }
    if (key === '--to') o.to = val()
    else if (key === '--queue') o.queue = val()
    else if (key === '--builtin') o.builtin = val()
    else if (key === '--dir') o.dir = val()
    else if (key === '--locator') o.locator = val()
    else if (key === '--report') o.report = val()
    else if (key === '--concurrency') o.concurrency = Math.max(1, Math.min(16, Number(val()) || 4))
    else if (key === '--force') o.force = true
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`)
    else o.targets.push(a)
  }
  return o
}

const abs = (root: string, p: string): string => (isAbsolute(p) ? p : resolve(root, p))

function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

/** Queue file of `watch` (WP04): array of "locator@version" strings or {locator, version} objects, bare or under queue/items/entries. */
export function readQueue(file: string): ScanTarget[] {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as Record<string, unknown>).queue ??
        (raw as Record<string, unknown>).items ??
        (raw as Record<string, unknown>).entries ??
        [])
      : []
  if (!Array.isArray(list)) throw new Error(`${file}: expected a list`)
  const out: ScanTarget[] = []
  for (const item of list) {
    if (typeof item === 'string') out.push(parseTarget(item))
    else if (item && typeof item === 'object' && typeof (item as { locator?: unknown }).locator === 'string') {
      const it = item as { locator: string; version?: unknown; gitRef?: unknown }
      // GitHub items of `watch` carry the tag in `gitRef` (`v0.4.0`) and the bare SemVer in `version` (`0.4.0`);
      // the archive is fetched by the tag, so the ref wins for github: locators.
      const ref = it.locator.startsWith('github:') && typeof it.gitRef === 'string' ? it.gitRef : undefined
      out.push({ locator: it.locator, version: ref ?? (typeof it.version === 'string' ? it.version : undefined) })
    }
  }
  return out
}

/** Descriptor hints from modules/<path>.yml, when the entry exists in the repo. */
export function descriptorHints(root: string, locator: string): DescriptorHints | null {
  let file: string
  try {
    file = join(root, descriptorFile(locator))
  } catch {
    return null
  }
  if (!existsSync(file)) return null
  const parsed = Descriptor.safeParse(parseYaml(readFileSync(file, 'utf8')))
  if (!parsed.success) return null
  const d = parsed.data
  return {
    kind: d.kind,
    extends: d.extends,
    replaces: d.replaces,
    declares: d.declares,
    scriptsRequired: d.scriptsRequired,
    whenToUse: d.whenToUse,
  }
}

/** Line context from the data branch: core facts of the latest line and its version. */
export function lineContext(dataDir: string): Pick<ScanContext, 'builtin' | 'latestOm'> {
  const linesFile = join(dataDir, 'lines.json')
  if (!existsSync(linesFile)) return { builtin: null, latestOm: null }
  const lines = Lines.safeParse(JSON.parse(readFileSync(linesFile, 'utf8')))
  if (!lines.success) return { builtin: null, latestOm: null }
  const latest = lines.data.lines.find((l) => l.source === 'latest')?.version ?? null
  const bfile = join(dataDir, 'builtin', `${lines.data.coreLatest}.json`)
  const builtin = existsSync(bfile) ? BuiltinData.safeParse(JSON.parse(readFileSync(bfile, 'utf8'))) : null
  return { builtin: builtin?.success ? builtin.data : null, latestOm: latest }
}

export function factsFile(to: string, locator: string, version: string): string {
  return join(to, 'facts', `${locatorToPath(locator)}`, `${version}.json`)
}

interface Row {
  target: string
  status: 'scanned' | 'cached' | 'failed'
  ms: number
  version?: string
  modules?: number
  routes?: number
  resolved?: number
  installable?: boolean
  hasSrc?: boolean
  anatomy?: string
  error?: string
  code?: number
}

function errorCode(err: unknown): number {
  if (err instanceof RentgenError) return err.code === 'network' ? EXIT_ENV : EXIT_VALIDATION
  return EXIT_VALIDATION
}

function summarize(rows: Row[], wallMs: number) {
  const ok = rows.filter((r) => r.status !== 'failed')
  const withSrc = ok.filter((r) => r.hasSrc)
  const routes = ok.reduce((a, r) => a + (r.routes ?? 0), 0)
  const resolved = ok.reduce((a, r) => a + (r.resolved ?? 0), 0)
  return {
    packages: rows.length,
    scanned: rows.filter((r) => r.status === 'scanned').length,
    cached: rows.filter((r) => r.status === 'cached').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    withSrc: withSrc.length,
    withModuleFacts: withSrc.filter((r) => (r.modules ?? 0) > 0).length,
    installable: ok.filter((r) => r.installable).length,
    routes,
    authResolved: routes === 0 ? 1 : Math.round((resolved / routes) * 10000) / 10000,
    wallMs: Math.round(wallMs),
  }
}

function rowOf(target: string, f: Facts, ms: number, status: Row['status']): Row {
  const routes = f.modules.flatMap((m) => m.http.routes)
  return {
    target,
    status,
    ms: Math.round(ms),
    version: f.package.version,
    modules: f.modules.length,
    routes: routes.length,
    resolved: routes.filter((r) => r.requireAuth !== null).length,
    installable: f.gate.installable,
    hasSrc: !f.diagnostics.some((d) => d.startsWith('No src/')),
    anatomy: anatomyStatus(f),
  }
}

async function runBuiltin(ctx: CommandContext, o: Opts): Promise<number> {
  const version = o.builtin as string
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`scan: --builtin needs a stable version, got ${version}`)
    return EXIT_VALIDATION
  }
  let json
  try {
    json = await loadModuleFactsJson(version, { offline: ctx.flags.offline })
  } catch (err) {
    console.error(`scan: ${(err as Error).message}`)
    return errorCode(err)
  }
  const data = builtinFromModuleFacts(json, version, version, new Date().toISOString())
  const map = readBuiltinCategories(ctx.root)
  const { warnings } = builtinCategories(data, map, readBuiltinUpcoming(ctx.root))
  const out = join(abs(ctx.root, o.to), 'builtin', `${version}.json`)
  const final = BuiltinData.parse({
    ...data,
    diagnostics: [...data.diagnostics, ...warnings].map((d) => d.slice(0, 300)).slice(0, 50),
  })
  writeJson(out, final)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary && warnings.length > 0)
    appendFileSync(summary, `\n### Built-in ${version}\n\n${warnings.map((w) => `- ${w}`).join('\n')}\n`)
  if (ctx.flags.json)
    console.log(JSON.stringify({ coreVersion: version, modules: final.modules.length, warnings, file: out }))
  else {
    console.log(`built-in ${version}: ${final.modules.length} core modules -> ${out}`)
    for (const w of warnings) console.warn(`warning: ${w}`)
  }
  return EXIT_OK
}

async function runDir(ctx: CommandContext, o: Opts): Promise<number> {
  if (!o.locator) {
    console.error('scan: --dir needs --locator')
    return EXIT_VALIDATION
  }
  parseLocator(o.locator)
  const base: ScanContext = {
    locator: o.locator,
    source: o.locator.startsWith('github:') ? 'github-archive' : 'npm-tarball',
    integrity: null,
    gitRef: null,
    descriptor: descriptorHints(ctx.root, o.locator),
    ...lineContext(abs(ctx.root, ctx.flags.data)),
  }
  const p = abs(ctx.root, o.dir as string)
  const t0 = performance.now()
  let facts: Facts
  try {
    facts = statSync(p).isDirectory()
      ? await scanPackageDir(p, base)
      : (await scanTarballBuffer(readFileSync(p), base)).facts
  } catch (err) {
    console.error(`scan: ${(err as Error).message}`)
    return errorCode(err)
  }
  const out = factsFile(abs(ctx.root, o.to), o.locator, facts.package.version)
  writeJson(out, facts)
  const row = rowOf(o.locator, facts, performance.now() - t0, 'scanned')
  console.log(
    ctx.flags.json
      ? JSON.stringify({ ...row, file: out })
      : `${o.locator}@${facts.package.version}: ${row.modules} modules, ${row.routes} routes -> ${out}`,
  )
  return EXIT_OK
}

async function runTargets(ctx: CommandContext, o: Opts, targets: ScanTarget[]): Promise<number> {
  if (ctx.flags.offline) {
    console.error('scan: downloading tarballs needs the network; use --dir for a local package')
    return EXIT_ENV
  }
  await loadEngine()
  const to = abs(ctx.root, o.to)
  const line = lineContext(abs(ctx.root, ctx.flags.data))
  const limit = pLimit(o.concurrency)
  const t0 = performance.now()
  const rows = await Promise.all(
    targets.map((target) =>
      limit(async (): Promise<Row> => {
        let t = target
        const label = target.version ? `${target.locator}@${target.version}` : target.locator
        const s = performance.now()
        try {
          const loc = parseLocator(t.locator)
          // resolve a missing npm version first, so the cache check below can apply
          if (!t.version && loc.source === 'npm') t = { ...t, version: (await npmManifest(loc.name)).version }
          if (t.version && !o.force) {
            const file = factsFile(to, t.locator, t.version)
            if (existsSync(file)) {
              const prev = Facts.safeParse(JSON.parse(readFileSync(file, 'utf8')))
              const { engine } = await loadEngine()
              // npm versions are immutable: same version + engine + Rentgen version = same facts
              if (
                prev.success &&
                prev.data.extractor.engine === engine &&
                prev.data.extractor.catalog.endsWith(` ${RENTGEN_VERSION}`)
              )
                return rowOf(label, prev.data, performance.now() - s, 'cached')
            }
          }
          const facts = await scanRemote(t, { descriptor: descriptorHints(ctx.root, t.locator), ...line })
          writeJson(factsFile(to, t.locator, facts.package.version), facts)
          const row = rowOf(label, facts, performance.now() - s, 'scanned')
          if (!ctx.flags.json) console.log(`${label}: ${row.modules} modules, ${row.routes} routes, ${row.ms} ms`)
          return row
        } catch (err) {
          const msg = String((err as Error).message ?? err).slice(0, 300)
          if (!ctx.flags.json) console.error(`${label}: failed: ${msg}`)
          return {
            target: label,
            status: 'failed',
            ms: Math.round(performance.now() - s),
            error: msg,
            code: errorCode(err),
          }
        }
      }),
    ),
  )
  const summary = summarize(rows, performance.now() - t0)
  if (o.report) writeJson(abs(ctx.root, o.report), { summary, rows })
  if (ctx.flags.json) console.log(JSON.stringify({ summary, rows }))
  else
    console.log(
      `scan: ${summary.scanned} scanned, ${summary.cached} cached, ${summary.failed} failed; routes ${summary.routes}, auth resolved ${summary.authResolved}; ${summary.wallMs} ms`,
    )
  return rows.reduce((code, r) => Math.max(code, r.code ?? EXIT_OK), EXIT_OK)
}

export default async function scan(ctx: CommandContext): Promise<number> {
  let o: Opts
  try {
    o = parseArgs(ctx.args, ctx.flags.data)
  } catch (err) {
    console.error(`scan: ${(err as Error).message}`)
    return EXIT_VALIDATION
  }
  try {
    if (o.builtin) return await runBuiltin(ctx, o)
    if (o.dir) return await runDir(ctx, o)
    const targets = [...(o.queue ? readQueue(abs(ctx.root, o.queue)) : []), ...o.targets.map(parseTarget)]
    if (targets.length === 0) {
      console.error(
        'Usage: yarn om scan (<locator>[@<version>] | --queue <file> | --builtin <coreVersion> | --dir <path> --locator <locator>) [--to <dir>]',
      )
      return EXIT_VALIDATION
    }
    return await runTargets(ctx, o, targets)
  } catch (err) {
    console.error(`scan: ${(err as Error).message}`)
    return errorCode(err)
  }
}
