// `yarn om pages-site [--check <dist>]` (move of 13 Nov, lib/core/site-host.ts): writes functions/site.ts, the layout
// the Pages Functions read at run time, from SITE_URL, BASE_PATH and HOME_PATH (defaults: modules.openmercato.com,
// `/` and `/`).
// pages.yml runs it in the build job before the Functions bundle is checked and in the deploy job before
// `wrangler pages deploy`, with the same variables the build used. `--check <dist>` changes nothing and fails when
// functions/site.ts or the layout of a built dist (root files, the home page and the redirect of the base, schema
// `$id`, links under the base) does not match.
// Both refuse a nested site whose SITE_URL is a host of the Pages project (pagesHostProblem): its old addresses would
// answer 404 instead of a redirect.
// With PAGES_NOINDEX=1 (the preview job of pages.yml) the check also wants the noindex files of the build (dist/_headers
// and a robots.txt that allows nothing, lib/emit/pages-layout.ts markNoindex); only a nested layout has them.
// With PAGES_MERGED=1 (the www-preview jobs of pages.yml, and production once the repository variable PAGES_MERGED
// is on) the layout is the merged one of lib/emit/pages-merge.ts: `--merge` composes dist/ from dist-www/ (the main
// site) and dist-run/ (the catalog, nested), functions/site.ts carries `merged: true`, and `--check` proves the
// merged layout, listing the main site addresses the pages link that Webflow still serves. The root _redirects of the
// merged layout ends with the rules of www/content/redirects.yaml (lib/emit/www-redirects.ts): `--merge` takes them
// from dist-www/_redirects, which the www build writes, and `--check` wants them equal to the yaml of this checkout,
// with no loop, no chain longer than one hop and within the Pages limits. `--merge` also makes every link to the main
// site's address of a page the upload serves root relative, and `--check` fails on one left absolute (the rule is in
// lib/emit/pages-merge.ts, localizeHrefs); the catalog-only layout keeps its absolute links.
// With PAGES_SERVE_ORIGIN (owner's decision of 26 Nov 2026: the merged site on modules.openmercato.com before the www
// switch) functions/site.ts carries `serve`, so the Pages hosts serve the merged layout themselves (hostServe in
// lib/core/site-host.ts), and the build is noindex (noindexFromEnv). It needs PAGES_MERGED=1 and
// https://modules.openmercato.com; both commands refuse anything else.
// `--settings` checks only that the variables make one of those layouts, in seconds: pages.yml runs it before the
// build, so a partial rollback (PAGES_MERGED left at 1 without BASE_PATH) fails fast with SETTINGS_HINT.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import {
  hasHomePath,
  homePath,
  isNested,
  mergedFromEnv,
  noindexFromEnv,
  pagesHostProblem,
  serveOriginFromEnv,
  siteConfigFromEnv,
  siteModule,
  siteRoot,
  type SiteConfig,
} from '../core/site-host.ts'
import { checkPagesLayout } from '../emit/pages-layout.ts'
import { checkMergedLayout, MERGE_DIRS, mergeConfigProblem, mergePagesSite } from '../emit/pages-merge.ts'
import { parseWwwRedirects, wwwRedirectsText } from '../emit/www-redirects.ts'

/** The main site's redirects, relative to the repository root. */
export const WWW_REDIRECTS_YAML = 'www/content/redirects.yaml'

export const description =
  'write functions/site.ts from SITE_URL, BASE_PATH and HOME_PATH; --merge composes dist/; --check <dist> checks the layout; --settings checks the variables only'

/**
 * Printed after a refused variable set (audit of 27 Nov 2026): the variables of the layout go together, so a partial
 * rollback fails the build instead of deploying.
 */
export const SETTINGS_HINT =
  'The layout variables go together: catalog only (none set), merged (PAGES_MERGED=1 with SITE_URL https://www.openmercato.com, BASE_PATH /run, HOME_PATH /modules), or merged and served (the same and PAGES_SERVE_ORIGIN https://modules.openmercato.com). A rollback deletes all five (docs/RUNBOOK.md, Main site on modules.openmercato.com).'

/** The generated module, relative to the repository root. */
export const SITE_MODULE = 'functions/site.ts'

export default function pagesSite(ctx: CommandContext): number {
  let check: string | null = null
  let merge = false
  let settings = false
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i] as string
    if (a === '--merge') merge = true
    else if (a === '--settings') settings = true
    else if (a === '--check' && ctx.args[i + 1]) check = ctx.args[++i] as string
    else if (a.startsWith('--check=') && a.length > 8) check = a.slice(8)
    else {
      console.error(`om pages-site: unknown argument: ${a}`)
      return EXIT_ENV
    }
  }
  if (merge && check !== null) {
    console.error('om pages-site: --merge and --check are two steps; run them one after the other')
    return EXIT_ENV
  }
  if (settings && (merge || check !== null)) {
    console.error('om pages-site: --settings checks the variables only; run it on its own')
    return EXIT_ENV
  }
  return run(ctx, merge, check, settings)
}

/** A refused variable set: the reason, then what goes together (SETTINGS_HINT). */
function refused(message: string): number {
  console.error(`om pages-site: ${message}`)
  console.error(`om pages-site: ${SETTINGS_HINT}`)
  return EXIT_ENV
}

function run(ctx: CommandContext, merge: boolean, check: string | null, settings: boolean): number {
  const merged = mergedFromEnv(process.env)
  let c: SiteConfig
  let serve: string | null
  try {
    c = siteConfigFromEnv(process.env)
    serve = serveOriginFromEnv(process.env)
  } catch (err) {
    return refused((err as Error).message)
  }
  if (merged) {
    const problem = mergeConfigProblem(c)
    if (problem) return refused(`PAGES_MERGED: ${problem}`)
    c = { ...c, merged: true, ...(serve ? { serve } : {}) }
  } else if (merge) {
    console.error('om pages-site: --merge needs PAGES_MERGED=1 (functions/site.ts and the check follow it)')
    return EXIT_ENV
  } else if (serve) {
    return refused(
      'PAGES_SERVE_ORIGIN needs PAGES_MERGED=1: a Pages host serves the merged layout, never the catalog alone',
    )
  }
  const hostProblem = pagesHostProblem(c)
  if (hostProblem) return refused(hostProblem)
  const noindex = noindexFromEnv(process.env)
  if (noindex && !isNested(c)) {
    console.error('om pages-site: PAGES_NOINDEX needs a BASE_PATH other than / (the preview of the nested layout)')
    return EXIT_ENV
  }
  if (settings) {
    console.log(
      `om pages-site: the variables make one layout: ${merged ? 'merged' : isNested(c) ? 'nested' : 'catalog only'} at ${siteRoot(c)}${c.serve ? `, served at ${c.serve}` : ''}${noindex ? ', noindex' : ''}`,
    )
    return EXIT_OK
  }
  if (merge) {
    try {
      const r = mergePagesSite(
        {
          www: join(ctx.root, MERGE_DIRS.www),
          run: join(ctx.root, MERGE_DIRS.run),
          out: join(ctx.root, MERGE_DIRS.out),
        },
        c,
        noindex,
      )
      console.log(
        `om pages-site: ${MERGE_DIRS.out}/ merged from ${MERGE_DIRS.www}/ (${r.wwwFiles} files) and ${MERGE_DIRS.run}/ (${r.runFiles} files), ${r.sitemaps.length} sitemaps, ${r.redirects} main site redirects, ${r.localLinks} links to its own pages made root relative in ${r.localFiles} files${noindex ? ', noindex' : ''}`,
      )
      return EXIT_OK
    } catch (err) {
      console.error(`om pages-site: ${(err as Error).message}`)
      return EXIT_VALIDATION
    }
  }
  const file = join(ctx.root, SITE_MODULE)
  const want = siteModule(c)
  const have = existsSync(file) ? readFileSync(file, 'utf8') : null

  if (check === null) {
    if (have !== want) writeFileSync(file, want)
    console.log(
      `om pages-site: ${SITE_MODULE} ${have === want ? 'already for' : 'written for'} ${siteRoot(c)}${c.serve ? `, served at ${c.serve}` : ''}`,
    )
    return EXIT_OK
  }

  const dist = isAbsolute(check) ? check : resolve(check)
  if (!existsSync(dist)) {
    console.error(`om pages-site: ${check} does not exist; build first`)
    return EXIT_ENV
  }
  let wwwRedirects: string | undefined
  if (merged) {
    const yaml = join(ctx.root, WWW_REDIRECTS_YAML)
    try {
      wwwRedirects = wwwRedirectsText(existsSync(yaml) ? parseWwwRedirects(readFileSync(yaml, 'utf8'), yaml) : [])
    } catch (err) {
      console.error(`om pages-site: ${(err as Error).message}`)
      return EXIT_VALIDATION
    }
  }
  const result = merged
    ? checkMergedLayout(dist, c, 50, noindex, wwwRedirects)
    : { problems: checkPagesLayout(dist, c, 50, noindex), pending: [] }
  const problems = result.problems
  if (have !== want) problems.unshift(`${SITE_MODULE} is not for ${siteRoot(c)}; run yarn om pages-site`)
  if (problems.length > 0) {
    for (const p of problems) console.error(`om pages-site: ${p}`)
    return EXIT_VALIDATION
  }
  console.log(
    `om pages-site: ${check} matches ${siteRoot(c)} (${merged ? 'merged, ' : ''}${c.serve ? `served at ${c.serve}, ` : ''}base ${c.base}${hasHomePath(c) ? `, home ${homePath(c)}` : ''}${noindex ? ', noindex' : ''})`,
  )
  if (result.pending.length > 0)
    console.log(
      `om pages-site: main site addresses linked but not in this build yet (Webflow serves them until the switch): ${result.pending.length}`,
    )
  return EXIT_OK
}
