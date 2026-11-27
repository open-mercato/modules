// `yarn om compare-live (--live <origin> | --baseline <report.json>) --candidate <origin> --urls <sitemap.xml>
// [--redirects <file>] [--planned <file>]` (www site migration spec, API Contracts; cutover steps C6 and C8). Compares
// every URL of the sitemap (a file or an https address) and every rule of the redirects file (redirects.yaml) on the
// reference and the candidate, without following redirects, at most 4 requests at a time, and checks the apex.
// Writes <out>/compare-live/report.md and report.json (the JSON is a later run's --baseline). Exit 0 all passed,
// 1 any fail, 2 environment error. Read-only: GET requests to the two origins and the apex only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import {
  compareLive,
  FIELDS,
  mergeTargets,
  reportJson,
  reportMarkdown,
  reportPasses,
  sitemapTargets,
  USER_AGENT,
  type CompareOptions,
  type Planned,
  type Report,
} from '../compare-live/compare.ts'
import { parseWwwRedirects } from '../emit/www-redirects.ts'

export const description = 'compare every sitemap and redirect URL of the live main site with a candidate; read-only'

export interface Args {
  live?: string
  baseline?: string
  candidate?: string
  urls?: string
  redirects?: string
  planned?: string
}

const VALUE_FLAGS: Record<string, keyof Args> = {
  '--live': 'live',
  '--baseline': 'baseline',
  '--candidate': 'candidate',
  '--urls': 'urls',
  '--redirects': 'redirects',
  '--planned': 'planned',
}

export function parseArgs(argv: readonly string[]): Args {
  const a: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const eq = arg.indexOf('=')
    const key = eq > 0 ? arg.slice(0, eq) : arg
    const name = VALUE_FLAGS[key]
    if (!name) throw new Error(`unknown argument ${arg}`)
    const v = eq > 0 ? arg.slice(eq + 1) : argv[++i]
    if (v === undefined || v === '') throw new Error(`${key} needs a value`)
    a[name] = v
  }
  if (!a.live === !a.baseline) throw new Error('give exactly one of --live <origin> and --baseline <report.json>')
  if (!a.candidate) throw new Error('--candidate <origin> is required')
  if (!a.urls) throw new Error('--urls <sitemap.xml> is required')
  for (const k of ['live', 'candidate'] as const) {
    const v = a[k]
    if (v === undefined) continue
    let u: URL
    try {
      u = new URL(v)
    } catch {
      throw new Error(`--${k}: ${v} is not an origin`)
    }
    if (!/^https?:$/.test(u.protocol) || (u.pathname !== '/' && u.pathname !== '') || u.search)
      throw new Error(`--${k}: ${v} is not an origin (scheme and host only)`)
  }
  return a
}

const PlannedSchema = z.array(
  z.strictObject({ url: z.string().regex(/^\//), field: z.enum(FIELDS), note: z.string().optional() }),
)

/** The `--planned` file: a YAML or JSON list of `{ url, field, note? }`. */
export function parsePlanned(text: string, file: string): Planned[] {
  const r = PlannedSchema.safeParse(parse(text) ?? [])
  if (!r.success) {
    const i = r.error.issues[0]
    throw new Error(`${file}: ${i?.path.join('.') || 'the file'}: ${i?.message}`)
  }
  return r.data
}

async function readSource(source: string, fetchFn: typeof fetch): Promise<string> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetchFn(source, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`)
    return res.text()
  }
  return readFileSync(source, 'utf8')
}

export default async function compareLiveCommand(ctx: CommandContext, fetchFn: typeof fetch = fetch): Promise<number> {
  let args: Args
  try {
    args = parseArgs(ctx.args)
  } catch (err) {
    console.error(`compare-live: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const abs = (p: string): string => (/^https?:\/\//.test(p) || isAbsolute(p) ? p : resolve(process.cwd(), p))
  let opts: CompareOptions
  try {
    const sitemap = sitemapTargets(await readSource(abs(args.urls!), fetchFn))
    if (sitemap.length === 0) throw new Error(`${args.urls}: no <loc> entries`)
    const redirects = args.redirects ? parseWwwRedirects(readFileSync(abs(args.redirects), 'utf8'), args.redirects) : []
    const planned = args.planned ? parsePlanned(readFileSync(abs(args.planned), 'utf8'), args.planned) : []
    let baseline: CompareOptions['baseline']
    if (args.baseline) {
      const report = JSON.parse(readFileSync(abs(args.baseline), 'utf8')) as Report
      if (report.version !== 1 || !Array.isArray(report.urls))
        throw new Error(`${args.baseline}: not a compare-live report`)
      baseline = { file: args.baseline, report }
    }
    opts = {
      live: args.live,
      baseline,
      candidate: args.candidate!,
      targets: mergeTargets(sitemap, redirects),
      planned,
      fetch: fetchFn,
    }
  } catch (err) {
    console.error(`compare-live: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const report = await compareLive(opts)
  const dir = join(isAbsolute(ctx.flags.out) ? ctx.flags.out : resolve(process.cwd(), ctx.flags.out), 'compare-live')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.md'), reportMarkdown(report))
  writeFileSync(join(dir, 'report.json'), reportJson(report))
  const s = report.summary
  if (ctx.flags.json) console.log(JSON.stringify({ summary: s, apex: report.apex, passes: reportPasses(report) }))
  else {
    console.log(
      `compare-live: ${s.urls} URLs, ${s.passed} passed, ${s.failed} failed, ${s.planned} planned differences`,
    )
    if (report.apex) console.log(`compare-live: apex ${report.apex.url}: ${report.apex.result}`)
    console.log(`Report: ${join(dir, 'report.md')} and report.json`)
  }
  return reportPasses(report) ? EXIT_OK : EXIT_VALIDATION
}
