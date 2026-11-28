// `yarn om www-pull --strapi <https url> [--out <dir>] [--drafts] [--status published|draft] [--check]
// [--snapshot <dir>]` (Strapi CMS spec 2026-11-27-www-strapi-cms.md, API Contracts; Step 3.2): Strapi back into the
// files of the main site (lib/www-cms/pull.ts). `--out` is a tree laid out as `www/` (content/, public/media/,
// public/files/, manifest.json); without it the pull replaces `www` of the repository. The token comes from the
// environment: STRAPI_READ_TOKEN for published content; with `--drafts` or `--status draft` STRAPI_DRAFTS_TOKEN and
// never the other, so the production build holds no token made for drafts. Exit 0 done (or no difference with
// --check), 1 invalid content or a difference with --check, 2 environment (no token, Strapi unreachable, refusing the
// token, answering anonymously or paging otherwise); on 1 and 2 nothing is replaced.
import { isAbsolute, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { pull, PullEnvError, type PullReport } from '../www-cms/pull.ts'
import { createClient, StrapiError, tokenProblem } from '../www-cms/rest.ts'
import { TYPES } from '../www-cms/model.ts'
import type { Status } from '../www-cms/strapi.ts'

export const description = 'pull Strapi into www/content and the media, validated first; --check compares only'

export interface Args {
  strapi?: string
  drafts: boolean
  status: Status
  check: boolean
  snapshot?: string
}

export function parseArgs(argv: readonly string[]): Args {
  const a: Args = { drafts: false, status: 'published', check: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const eq = arg.indexOf('=')
    const key = eq > 0 ? arg.slice(0, eq) : arg
    if (key === '--drafts' || key === '--check') {
      if (eq > 0) throw new Error(`${key} takes no value`)
      if (key === '--drafts') a.drafts = true
      else a.check = true
      continue
    }
    if (!['--strapi', '--status', '--snapshot'].includes(key)) throw new Error(`unknown argument ${arg}`)
    const v = eq > 0 ? arg.slice(eq + 1) : argv[++i]
    if (v === undefined || v === '') throw new Error(`${key} needs a value`)
    if (key === '--strapi') a.strapi = v
    else if (key === '--snapshot') a.snapshot = v
    else if (v === 'published' || v === 'draft') a.status = v
    else throw new Error(`--status is published or draft, not ${v}`)
  }
  if (!a.strapi) throw new Error('--strapi <https url> is required')
  return a
}

/** The name of the token a pull reads; the other one is never read. */
export const tokenName = (a: Pick<Args, 'drafts' | 'status'>): 'STRAPI_DRAFTS_TOKEN' | 'STRAPI_READ_TOKEN' =>
  a.drafts || a.status === 'draft' ? 'STRAPI_DRAFTS_TOKEN' : 'STRAPI_READ_TOKEN'

/** The report for the build summary: counts per type, media downloaded and reused, the newest change. */
export function reportLines(r: PullReport): string[] {
  const lines = ['www-pull']
  for (const t of TYPES) if (t.apiId in r.counts) lines.push(`  ${t.apiId}: ${r.counts[t.apiId]}`)
  lines.push(`  media: ${r.media.downloaded} downloaded, ${r.media.reused} reused`)
  lines.push(`  newest change in Strapi: ${r.newest ?? 'none'}`)
  for (const c of r.changedMedia) lines.push(`  media changed since the snapshot: ${c}`)
  for (const n of r.notes) lines.push(`  note: ${n}`)
  for (const p of r.problems) lines.push(`  invalid: ${p}`)
  if (r.problems.length > 0) lines.push(`${r.problems.length} problems, nothing replaced`)
  else if (r.differs) {
    for (const d of r.differs) lines.push(`  differs: ${d}`)
    lines.push(`${r.differs.length} files differ`)
  } else if (r.written) lines.push('replaced')
  return lines
}

/** The command with its environment given: the tests pass their own and read what it printed. */
export async function runPull(
  ctx: Pick<CommandContext, 'args' | 'root'> & { flags: { out: string; json: boolean } },
  env: Readonly<Record<string, string | undefined>>,
  out: { log: (s: string) => void; error: (s: string) => void } = console,
): Promise<number> {
  let args: Args
  try {
    args = parseArgs(ctx.args)
  } catch (err) {
    out.error(`www-pull: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const name = tokenName(args)
  const token = env[name]
  if (!token) {
    out.error(
      `www-pull: set ${name} to a ${name === 'STRAPI_READ_TOKEN' ? 'read-only' : 'drafts'} API token of the instance`,
    )
    return EXIT_ENV
  }
  const bad = tokenProblem(name, token)
  if (bad) {
    out.error(`www-pull: ${bad}`)
    return EXIT_ENV
  }
  const at = (p: string) => (isAbsolute(p) ? p : resolve(ctx.root, p))
  // --out is the CLI's common flag, `out` when not given: the pull's default is the site's own tree
  const target = ctx.flags.out === 'out' ? at('www') : at(ctx.flags.out)
  let report: PullReport
  try {
    report = await pull({
      client: createClient({ url: args.strapi!, token }),
      root: ctx.root,
      out: target,
      snapshot: args.snapshot === undefined ? undefined : at(args.snapshot),
      status: args.status,
      drafts: args.drafts,
      check: args.check,
    })
  } catch (err) {
    if (err instanceof StrapiError)
      out.error(
        `www-pull: Strapi ${err.kind === 'unreachable' ? 'unreachable' : err.kind === 'refused' ? 'refused the token' : 'answer unusable'}: ${err.message}`,
      )
    else if (err instanceof PullEnvError) out.error(`www-pull: ${err.message}`)
    else throw err
    return EXIT_ENV
  }
  if (ctx.flags.json) out.log(JSON.stringify(report, null, 2))
  else for (const l of reportLines(report)) out.log(l)
  if (report.problems.length > 0) return EXIT_VALIDATION
  return report.differs && report.differs.length > 0 ? EXIT_VALIDATION : EXIT_OK
}

export default function run(ctx: CommandContext): Promise<number> {
  return runPull(ctx, process.env)
}
