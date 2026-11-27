// `yarn om import-webflow --export <dir> [--media-cache <dir>] [--offline] [--only <collection>[,...]] [--check]
// [--force <path>] [--target <dir>] [--docs-sitemap <file>]`: the deterministic importer from a Webflow export to
// www/content/ and www/public/media/ (spec 2026-11-24-www-site-migration.md of PR #23, API Contracts). Writes the run
// report to <out>/import-webflow/report.md. Exit 0 ok, 1 stopped items, conflicts or (with --check) a difference,
// 2 environment error. `--target` (default: the repository root) writes the output under another folder, for a trial run.
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV } from '../cli.ts'
import { ExportError } from '../import-webflow/export.ts'
import { renderReport } from '../import-webflow/report.ts'
import { ImportEnvError, runImport } from '../import-webflow/run.ts'
import { NOT_IMPORTED } from '../import-webflow/landing-template.ts'
import { WWW_COLLECTIONS, type WwwCollection } from '../schema/www-content.ts'

export const description = 'import a Webflow export into www/content and www/public/media; --check compares only'

interface Args {
  exportDir?: string
  mediaCache?: string
  only?: Set<WwwCollection>
  check: boolean
  force: string[]
  target?: string
  docsSitemap?: string
}

export function parseArgs(argv: readonly string[]): Args {
  const a: Args = { check: false, force: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const eq = arg.indexOf('=')
    const key = eq > 0 ? arg.slice(0, eq) : arg
    const value = () => {
      const v = eq > 0 ? arg.slice(eq + 1) : argv[++i]
      if (v === undefined || v === '') throw new Error(`${key} needs a value`)
      return v
    }
    switch (key) {
      case '--export':
        a.exportDir = value()
        break
      case '--media-cache':
        a.mediaCache = value()
        break
      case '--only': {
        const names = value()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        for (const n of names)
          if (!(WWW_COLLECTIONS as readonly string[]).includes(n))
            throw new Error(`--only: ${n} is not a collection (${WWW_COLLECTIONS.join(', ')})`)
          else if (NOT_IMPORTED.has(n as WwwCollection)) throw new Error(`--only: ${n} is not a collection of Webflow`)
        a.only = new Set([...(a.only ?? []), ...(names as WwwCollection[])])
        break
      }
      case '--check':
        a.check = true
        break
      case '--force':
        a.force.push(
          ...value()
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
        break
      case '--target':
        a.target = value()
        break
      case '--docs-sitemap':
        a.docsSitemap = value()
        break
      default:
        throw new Error(`unknown argument ${arg}`)
    }
  }
  return a
}

export default async function importWebflow(ctx: CommandContext): Promise<number> {
  let args: Args
  try {
    args = parseArgs(ctx.args)
  } catch (err) {
    console.error(`import-webflow: ${(err as Error).message}`)
    return EXIT_ENV
  }
  if (!args.exportDir) {
    console.error('import-webflow: --export <dir> is required')
    return EXIT_ENV
  }
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p))
  const out = abs(ctx.flags.out)
  const target = abs(args.target ?? ctx.root)
  try {
    const result = await runImport({
      exportDir: abs(args.exportDir),
      target,
      repoRoot: ctx.root,
      mediaCache: abs(args.mediaCache ?? join(ctx.flags.out, 'webflow-media')),
      offline: ctx.flags.offline,
      only: args.only,
      check: args.check,
      force: new Set(args.force.map((p) => p.replace(/^\.\//, ''))),
      docsSitemap: args.docsSitemap ? abs(args.docsSitemap) : undefined,
    })
    const report = renderReport(result, { check: args.check, offline: ctx.flags.offline })
    mkdirSync(join(out, 'import-webflow'), { recursive: true })
    writeFileSync(join(out, 'import-webflow', 'report.md'), report)
    const counts = [...result.report.counts.values()].reduce((n, c) => n + c.entries, 0)
    const summary = `import-webflow: ${counts} entries, ${result.report.stopped.length} stopped, ${result.media.files} media files (${result.media.bytes} bytes)`
    if (ctx.flags.json)
      console.log(
        JSON.stringify({
          exitCode: result.exitCode,
          differs: result.differs,
          stopped: result.report.stopped,
          counts: Object.fromEntries(result.report.counts),
          media: result.media,
        }),
      )
    else {
      console.log(summary)
      if (result.fatal) console.error(`import-webflow: ${result.fatal}`)
      if (args.check)
        console.log(
          result.differs ? 'import-webflow --check: the output would change.' : 'import-webflow --check: up to date.',
        )
      console.log(`Report: ${join(out, 'import-webflow', 'report.md')}`)
    }
    return result.exitCode
  } catch (err) {
    if (err instanceof ExportError || err instanceof ImportEnvError) {
      console.error(`import-webflow: ${err.message}`)
      return EXIT_ENV
    }
    throw err
  }
}
