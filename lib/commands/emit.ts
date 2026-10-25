// `yarn om emit [--site <url>] [--base <path>]` (spec 5.4): every published file of spec 4.6 into
// site/.generated/public and the page data into site/.generated/data, from `.data` (the `data` branch), the
// descriptors and policy. The only source of those files; the Astro integration (lib/emit/astro-integration.ts)
// copies public/ into dist/. Works on an empty or missing `.data` (first day: empty states).
// Extra flags: --to <dir> (default site/.generated), --modules <dir>, --policy <dir>, --skills <dir>,
// --now <iso> (clock), --mcp-url <url>. Environment: SITE_URL, BASE_PATH, MCP_URL, WEBMCP_OT_TOKENS, GITHUB_SHA
// (the build stamp in the footer; otherwise `git rev-parse` of the repo).
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { checkBudgets } from '../emit/budgets.ts'
import { buildEmit } from '../emit/index.ts'
import { loadEmitData } from '../emit/load.ts'
import { writeEmit } from '../emit/write.ts'
import { byteLength } from '../emit/util.ts'
import { DEFAULT_BASE_PATH, DEFAULT_SITE_ORIGIN } from '../core/home.ts'
import type { BuildStamp } from '../emit/types.ts'

export const description = 'published files and site data from .data'

const VALUE_FLAGS = ['--site', '--base', '--to', '--modules', '--policy', '--skills', '--now', '--mcp-url'] as const
type Flag = (typeof VALUE_FLAGS)[number]

function parseArgs(args: string[]): Partial<Record<Flag, string>> | string {
  const out: Partial<Record<Flag, string>> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const eq = a.indexOf('=')
    const key = (eq > 0 ? a.slice(0, eq) : a) as Flag
    if (!VALUE_FLAGS.includes(key)) return `unknown argument: ${a}`
    const v = eq > 0 ? a.slice(eq + 1) : args[++i]
    if (v === undefined || v === '') return `${key} needs a value`
    out[key] = v
  }
  return out
}

/** Site root plus base path without a trailing slash, and the normalized base path. */
export function siteUrl(siteRaw: string, baseRaw: string): { site: string; base: string } {
  const u = new URL(siteRaw)
  const basePath = `/${baseRaw.replace(/^\/+|\/+$/g, '')}`
  const base = basePath === '/' ? '/' : basePath
  const origin = u.origin
  return { site: base === '/' ? origin : `${origin}${base}`, base }
}

/**
 * The catalog commit a build comes from (footer stamp, finding of 25 Oct): GITHUB_SHA on Actions, else `git rev-parse`
 * of the repo, `dirty` when tracked files differ from that commit. Outside git: no commit.
 */
export function buildStamp(root: string, env: NodeJS.ProcessEnv = process.env): BuildStamp {
  const sha = env.GITHUB_SHA?.trim()
  if (sha && /^[0-9a-f]{7,40}$/.test(sha)) return { commit: sha.slice(0, 7), dirty: false }
  const git = (...args: string[]) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const head = git('rev-parse', '--short=7', 'HEAD')
  if (head.status !== 0 || !/^[0-9a-f]{7,40}$/.test(head.stdout.trim())) return { commit: null, dirty: false }
  const status = git('status', '--porcelain', '--untracked-files=no')
  return { commit: head.stdout.trim(), dirty: status.status === 0 && status.stdout.trim() !== '' }
}

export default function emit(ctx: CommandContext): number {
  const args = parseArgs(ctx.args)
  if (typeof args === 'string') {
    console.error(`om emit: ${args}`)
    return EXIT_ENV
  }
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(p))
  const fromRoot = (p: string | undefined, dflt: string): string => (p ? abs(p) : join(ctx.root, dflt))

  let site: { site: string; base: string }
  try {
    site = siteUrl(
      args['--site'] ?? process.env.SITE_URL ?? DEFAULT_SITE_ORIGIN,
      args['--base'] ?? process.env.BASE_PATH ?? DEFAULT_BASE_PATH,
    )
  } catch {
    console.error('om emit: --site / SITE_URL must be an absolute URL')
    return EXIT_ENV
  }
  // a build served anywhere else (a preview, a sandbox) keeps absolute links to the default address in llms.txt,
  // modules.json and the cards (finding of 25 Oct): say so, the pages fix their copy commands at run time only
  if (!args['--site'] && !process.env.SITE_URL)
    console.error(
      `om emit: warning: SITE_URL is not set; llms.txt, modules.json and the .md cards link to ${site.site}. For a preview, set SITE_URL and BASE_PATH to the address that serves it.`,
    )
  const nowRaw = args['--now'] ?? process.env.OM_NOW
  const now = new Date(nowRaw ?? Date.now())
  if (Number.isNaN(now.getTime())) {
    console.error(`om emit: --now: not a date: ${nowRaw}`)
    return EXIT_ENV
  }
  let mcpUrl = args['--mcp-url'] ?? process.env.MCP_URL ?? null
  if (mcpUrl !== null && mcpUrl.trim() === '') mcpUrl = null
  if (mcpUrl !== null && !/^https:\/\/[^\s]+$/.test(mcpUrl)) {
    console.error(`om emit: MCP_URL must be an https URL: ${mcpUrl}`)
    return EXIT_ENV
  }
  const policy = fromRoot(args['--policy'], 'policy')
  if (!existsSync(join(policy, 'categories.yml'))) {
    console.error(`om emit: ${join(policy, 'categories.yml')} not found`)
    return EXIT_ENV
  }
  const dataDir = abs(ctx.flags.data)
  const to = fromRoot(args['--to'], 'site/.generated')

  const data = loadEmitData({
    data: dataDir,
    modules: fromRoot(args['--modules'], 'modules'),
    policy,
    skills: fromRoot(args['--skills'], 'skills'),
    root: ctx.root,
  })
  if (!existsSync(dataDir)) data.warnings.unshift(`${dataDir} does not exist; emitting empty states`)
  let result: ReturnType<typeof buildEmit>
  try {
    result = buildEmit(data, {
      site: site.site,
      base: site.base,
      now: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      mcpUrl,
      originTrialTokens: process.env.WEBMCP_OT_TOKENS ?? null,
      build: buildStamp(ctx.root),
    })
  } catch (err) {
    console.error(`om emit: ${(err as Error).message}`)
    return EXIT_VALIDATION
  }
  writeEmit(to, result)
  const budgets = checkBudgets(result.public)
  const bytes = [...result.public.values()].reduce((n, c) => n + byteLength(c), 0)
  const m = result.meta
  if (ctx.flags.json)
    console.log(
      JSON.stringify(
        {
          to,
          files: result.public.size,
          bytes,
          dataVersion: m.dataVersion,
          counts: m.counts,
          warnings: result.warnings,
          overBudget: budgets,
        },
        null,
        2,
      ),
    )
  else {
    for (const w of result.warnings) console.error(`om emit: warning: ${w}`)
    for (const b of budgets)
      console.error(
        `om emit: over budget: ${b.path} ${(b.bytes / 1024).toFixed(1)} KB${b.gzip ? ' gzipped' : ''} > ${(b.max / 1024).toFixed(1)} KB (${b.label})`,
      )
    console.log(
      `om emit: ${result.public.size} files (${(bytes / 1024).toFixed(0)} KB) -> ${relative(process.cwd(), to) || to}; ` +
        `${m.counts.entries} entries, ${m.counts.listed} listed, ${m.counts.builtIn} built-in; ${m.dataVersion}`,
    )
  }
  return EXIT_OK
}
