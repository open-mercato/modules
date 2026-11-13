// `yarn om pages-site [--check <dist>]` (move of 13 Nov, lib/core/site-host.ts): writes functions/site.ts, the layout
// the Pages Functions read at run time, from SITE_URL and BASE_PATH (defaults: modules.openmercato.com and `/`).
// pages.yml runs it in the build job before the Functions bundle is checked and in the deploy job before
// `wrangler pages deploy`, with the same variables the build used. `--check <dist>` changes nothing and fails when
// functions/site.ts or the layout of a built dist (root files, schema `$id`, links under the base) does not match.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { DEFAULT_BASE_PATH, DEFAULT_SITE_ORIGIN } from '../core/home.ts'
import { siteConfig, siteModule, siteRoot, type SiteConfig } from '../core/site-host.ts'
import { checkPagesLayout } from '../emit/pages-layout.ts'

export const description = 'write functions/site.ts from SITE_URL and BASE_PATH; --check <dist> checks the layout'

/** The generated module, relative to the repository root. */
export const SITE_MODULE = 'functions/site.ts'

export default function pagesSite(ctx: CommandContext): number {
  let check: string | null = null
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i] as string
    if (a === '--check' && ctx.args[i + 1]) check = ctx.args[++i] as string
    else if (a.startsWith('--check=') && a.length > 8) check = a.slice(8)
    else {
      console.error(`om pages-site: unknown argument: ${a}`)
      return EXIT_ENV
    }
  }
  let c: SiteConfig
  try {
    c = siteConfig(process.env.SITE_URL || DEFAULT_SITE_ORIGIN, process.env.BASE_PATH || DEFAULT_BASE_PATH)
  } catch (err) {
    console.error(`om pages-site: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const file = join(ctx.root, SITE_MODULE)
  const want = siteModule(c)
  const have = existsSync(file) ? readFileSync(file, 'utf8') : null

  if (check === null) {
    if (have !== want) writeFileSync(file, want)
    console.log(`om pages-site: ${SITE_MODULE} ${have === want ? 'already for' : 'written for'} ${siteRoot(c)}`)
    return EXIT_OK
  }

  const dist = isAbsolute(check) ? check : resolve(check)
  if (!existsSync(dist)) {
    console.error(`om pages-site: ${check} does not exist; build first`)
    return EXIT_ENV
  }
  const problems = checkPagesLayout(dist, c)
  if (have !== want) problems.unshift(`${SITE_MODULE} is not for ${siteRoot(c)}; run yarn om pages-site`)
  if (problems.length > 0) {
    for (const p of problems) console.error(`om pages-site: ${p}`)
    return EXIT_VALIDATION
  }
  console.log(`om pages-site: ${check} matches ${siteRoot(c)} (base ${c.base})`)
  return EXIT_OK
}
