// `yarn om www-push --strapi <https url> [--content www/content] [--public www/public] [--only <collection>[,...]]
// [--dry-run] [--publish-as-files]` (Strapi CMS spec 2026-11-27-www-strapi-cms.md, API Contracts; Step 3.1): the files
// and media of the main site into Strapi, upserted by slug, idempotent (lib/www-cms/push.ts). The token is
// STRAPI_ADMIN_TOKEN from the environment, a full-access API token made for the import and deleted after it; the
// command runs only on Cezar or the Strapi host (AGENTS.md rule 5) and refuses to run in CI. Exit 0 done, 1 a value
// Strapi or the mapping refused, 2 environment (no token, CI, Strapi unreachable or refusing the token, a missing
// Media Library folder).
import { isAbsolute, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { push, type PushReport } from '../www-cms/push.ts'
import { createClient, StrapiError } from '../www-cms/rest.ts'

export const description =
  'push www/content and the media into Strapi, upserted by slug (STRAPI_ADMIN_TOKEN; never in CI)'

export interface Args {
  strapi?: string
  content: string
  public: string
  only?: Set<string>
  dryRun: boolean
  publishAsFiles: boolean
}

export function parseArgs(argv: readonly string[]): Args {
  const a: Args = { content: 'www/content', public: 'www/public', dryRun: false, publishAsFiles: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const eq = arg.indexOf('=')
    const key = eq > 0 ? arg.slice(0, eq) : arg
    if (key === '--dry-run' || key === '--publish-as-files') {
      if (eq > 0) throw new Error(`${key} takes no value`)
      if (key === '--dry-run') a.dryRun = true
      else a.publishAsFiles = true
      continue
    }
    if (!['--strapi', '--content', '--public', '--only'].includes(key)) throw new Error(`unknown argument ${arg}`)
    const v = eq > 0 ? arg.slice(eq + 1) : argv[++i]
    if (v === undefined || v === '') throw new Error(`${key} needs a value`)
    if (key === '--strapi') a.strapi = v
    else if (key === '--content') a.content = v
    else if (key === '--public') a.public = v
    else
      a.only = new Set(
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
  }
  if (!a.strapi) throw new Error('--strapi <https url> is required')
  return a
}

/** The report as the command prints it; `0 changed` on a run that writes nothing. */
export function reportLines(r: PushReport): string[] {
  const lines = [r.dryRun ? 'dry run: nothing written, the counts are what a run would do' : 'www-push']
  for (const [type, c] of Object.entries(r.types))
    lines.push(`  ${type}: ${c.created} created, ${c.updated} updated, ${c.unchanged} unchanged`)
  lines.push(`  media: ${r.media.uploaded} uploaded, ${r.media.replaced} replaced, ${r.media.unchanged} unchanged`)
  if (r.missingFolders.length > 0)
    lines.push(
      `  missing Media Library folders (create them in the admin, Media Library, before a run): ${r.missingFolders.join(', ')}`,
    )
  for (const x of r.refused) lines.push(`  refused: ${x}`)
  lines.push(`${r.changed} changed`)
  return lines
}

/** The command with its environment given: the tests pass their own and read what it printed. */
export async function runPush(
  ctx: Pick<CommandContext, 'args' | 'root'> & { flags: { json: boolean } },
  env: Readonly<Record<string, string | undefined>>,
  out: { log: (s: string) => void; error: (s: string) => void } = console,
): Promise<number> {
  let args: Args
  try {
    args = parseArgs(ctx.args)
  } catch (err) {
    out.error(`www-push: ${(err as Error).message}`)
    return EXIT_ENV
  }
  if (env.CI) {
    out.error('www-push: refused in CI; it runs only on Cezar or the Strapi host (spec, API Contracts)')
    return EXIT_ENV
  }
  const token = env.STRAPI_ADMIN_TOKEN
  if (!token) {
    out.error('www-push: set STRAPI_ADMIN_TOKEN to a full-access API token of the instance')
    return EXIT_ENV
  }
  const at = (p: string) => (isAbsolute(p) ? p : resolve(ctx.root, p))
  let report: PushReport
  try {
    const client = createClient({ url: args.strapi!, token })
    report = await push({
      client,
      contentDir: at(args.content),
      publicDir: at(args.public),
      only: args.only,
      dryRun: args.dryRun,
      publishAsFiles: args.publishAsFiles,
      log: (s) => {
        if (!ctx.flags.json) out.log(`  ${s}`)
      },
    })
  } catch (err) {
    out.error(`www-push: ${err instanceof StrapiError ? `Strapi ${err.kind}: ${err.message}` : (err as Error).message}`)
    return EXIT_ENV
  }
  if (ctx.flags.json) out.log(JSON.stringify(report, null, 2))
  else for (const l of reportLines(report)) out.log(l)
  if (report.missingFolders.length > 0) return EXIT_ENV
  return report.refused.length > 0 ? EXIT_VALIDATION : EXIT_OK
}

export default function run(ctx: CommandContext): Promise<number> {
  return runPush(ctx, process.env)
}
