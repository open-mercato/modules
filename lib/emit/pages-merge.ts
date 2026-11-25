// The merged layout of the Pages upload (www site migration spec, Option B, Phase 1a): the main site's build
// (dist-www/, www/astro.config.ts) at the root of dist/, the catalog's nested build (dist-run/, BASE_PATH `/run`)
// under its base, and the root files composed from both. `yarn om pages-site --merge` writes it (mergePagesSite) and
// `yarn om pages-site --check dist` with PAGES_MERGED=1 proves it (checkMergedLayout).
// Until Phase 1c the catalog's Functions and their _routes.json stay in the upload for the old hosts; on a
// `*.pages.dev` address they leave the main site alone (SiteConfig.merged, lib/core/site-host.ts).
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { isMainSiteLink, MAIN_SITE_ORIGIN } from '../core/main-site.ts'
import {
  FIXED_ROOT_FILES,
  isNested,
  NOINDEX_HEADERS,
  NOINDEX_ROBOTS,
  pagesRedirects,
  SCHEMA_DIR,
  siteDir,
  type SiteConfig,
} from '../core/site-host.ts'
import { NON_PAGE_SEGMENTS } from '../schema/www-content.ts'
import { checkPagesLayout, htmlRefs, nestedRootEntries, NOINDEX_ROOT_FILE } from './pages-layout.ts'
import {
  pagesRules,
  redirectChainProblems,
  ruleTargetPath,
  sourcePattern,
  WWW_REDIRECTS_FILE,
  wwwRedirectsTextProblems,
} from './www-redirects.ts'

/** The folders of the two builds and of the upload, relative to the repository root (package.json `build`). */
export const MERGE_DIRS = { www: 'dist-www', run: 'dist-run', out: 'dist' } as const

/**
 * Pages of the main site that Webflow serves until their phase and that the www pages link on purpose: /careers, the
 * list of jobs, a unique page of Phase 6, which each job page's breadcrumb links on the live site. A noindex preview
 * lists them as pending, as the header's links; production fails on them. The detail pages of the collections (blog
 * posts, case studies, partners, jobs) are built since Phase 4, so a link to one must name a built page.
 */
export const PENDING_PAGE = /^\/careers$/

/**
 * Root files the merge writes itself: a build that brings its own would be overwritten without notice. The main site's
 * _redirects (its redirects.yaml, lib/emit/www-redirects.ts) and sitemap-index.xml are read and merged instead.
 */
export const MERGE_ROOT_FILES = ['_redirects', NOINDEX_ROOT_FILE, 'robots.txt', 'sitemap-index.xml'] as const

/** Root files of the main site's build that the merge reads and composes instead of copying. */
const WWW_MERGED_FILES = new Set<string>([WWW_REDIRECTS_FILE, 'sitemap-index.xml'])

/** Cloudflare Pages limits of _redirects (2,000 static and 100 dynamic rules) and the check's margin below them. */
export const REDIRECT_LIMITS = { static: 2000, dynamic: 100 } as const
export const REDIRECT_CHECK = { static: 1800, dynamic: 90 } as const

/** Names at the root of the upload that belong to the catalog in both layouts: the base folder and the fixed files. */
export function runRootNames(c: SiteConfig): string[] {
  return [siteDir(c).split('/')[0] as string, '_routes.json', SCHEMA_DIR, ...FIXED_ROOT_FILES]
}

/** Why `c` cannot be merged, or null: the catalog must be nested and live on the main site's origin. */
export function mergeConfigProblem(c: SiteConfig): string | null {
  if (!isNested(c)) return `the merged layout needs the catalog under a base path; BASE_PATH is ${c.base}`
  if (c.origin !== MAIN_SITE_ORIGIN) return `the merged layout serves ${MAIN_SITE_ORIGIN}; SITE_URL is ${c.origin}`
  return null
}

/**
 * dist/_redirects of the merged layout: the main site's /sitemap.xml, the catalog's own rules (pagesRedirects), then
 * the rules of the main site's www/content/redirects.yaml as its build wrote them to dist-www/_redirects (`www`, the
 * Webflow 301 list of D8, the docs map with its catch-all last). The fixed rules come first, so no content rule can
 * take a catalog address; a source given twice fails the check (redirectProblems).
 */
export function mergedRedirects(c: Pick<SiteConfig, 'base' | 'home'>, www = ''): string {
  return (
    [
      '# Cloudflare Pages redirects of the merged layout (lib/emit/pages-merge.ts): the main site at the root.',
      '/sitemap.xml /sitemap-index.xml 301',
      pagesRedirects(c),
    ].join('\n') + www
  )
}

/** robots.txt at the root of the merged layout: all allowed and one sitemap, or nothing for a noindex preview. */
export function mergedRobots(c: Pick<SiteConfig, 'origin'>, noindex: boolean): string {
  return noindex ? NOINDEX_ROBOTS : `User-agent: *\nAllow: /\n\nSitemap: ${c.origin}/sitemap-index.xml\n`
}

const xml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unxml = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')

/** A sitemap index listing `locs` in order, in the shape @astrojs/sitemap writes. */
export function sitemapIndexXml(locs: readonly string[]): string {
  const items = locs.map((l) => `<sitemap><loc>${xml(l)}</loc></sitemap>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`
}

/** The `<loc>` addresses of a sitemap or a sitemap index. */
export function sitemapLocs(text: string): string[] {
  return [...text.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((m) => unxml(m[1] ?? ''))
}

/**
 * The sitemap index of the merged layout: the main site's sitemap files, then the catalog's (a sitemap index cannot
 * list another index, so the catalog's files and not its index), as their locs say.
 */
export function mergedSitemapLocs(wwwIndex: string, runIndex: string): string[] {
  return [...sitemapLocs(wwwIndex), ...sitemapLocs(runIndex)]
}

/** One rule of _redirects: its source, and whether Pages counts it as dynamic (a splat or a placeholder). */
export function redirectRules(text: string): { from: string; dynamic: boolean }[] {
  const rules: { from: string; dynamic: boolean }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const from = line.split(/\s+/)[0] as string
    rules.push({ from, dynamic: from.includes('*') || /\/:[A-Za-z]/.test(from) })
  }
  return rules
}

/** Why a _redirects text breaks the Pages limits with the check's margin, or a source is given twice. */
export function redirectProblems(text: string): string[] {
  const rules = redirectRules(text)
  const problems: string[] = []
  const stat = rules.filter((r) => !r.dynamic).length
  const dyn = rules.length - stat
  if (stat > REDIRECT_CHECK.static)
    problems.push(
      `${stat} static redirects; the check allows ${REDIRECT_CHECK.static} (Pages ${REDIRECT_LIMITS.static})`,
    )
  if (dyn > REDIRECT_CHECK.dynamic)
    problems.push(
      `${dyn} dynamic redirects; the check allows ${REDIRECT_CHECK.dynamic} (Pages ${REDIRECT_LIMITS.dynamic})`,
    )
  const seen = new Set<string>()
  for (const r of rules) {
    if (seen.has(r.from)) problems.push(`the redirect from ${r.from} is given twice`)
    seen.add(r.from)
  }
  return problems
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

const toPosix = (p: string): string => p.split(sep).join('/')

export interface MergeResult {
  /** Files of the main site's build laid at the root. */
  wwwFiles: number
  /** Files of the catalog's build. */
  runFiles: number
  /** Addresses of the merged sitemap index. */
  sitemaps: string[]
  /** Rules of the main site's redirects.yaml in the root _redirects. */
  redirects: number
}

/**
 * Composes `out` from the two builds: the catalog's nested build `run` as it is, then every file of `www` at the root
 * (its 404.html replaces the catalog's root copy, which keeps its own under the base), then the merged root files
 * (mergedRedirects, mergedRobots, the sitemap index, _headers for a noindex build). Throws, before touching `out`, on
 * a config mergeConfigProblem() refuses, a missing build, a catalog build that is not nested, or a name the main site
 * would take from the catalog or from the merge.
 */
export function mergePagesSite(
  dirs: { www: string; run: string; out: string },
  c: SiteConfig,
  noindex = false,
): MergeResult {
  const problem = mergeConfigProblem(c)
  if (problem) throw new Error(problem)
  const www = resolve(dirs.www)
  const run = resolve(dirs.run)
  const out = resolve(dirs.out)
  for (const [name, dir] of [
    ['the main site build', www],
    ['the catalog build', run],
  ] as const)
    if (!existsSync(dir))
      throw new Error(`${name} ${dirs[name === 'the catalog build' ? 'run' : 'www']} does not exist`)
  for (const d of [www, run])
    if (out === d || !relative(out, d).startsWith('..'))
      throw new Error(`the upload folder ${dirs.out} holds a build; refusing to empty it`)
  for (const f of ['index.html', '404.html'])
    if (!existsSync(join(www, f))) throw new Error(`${dirs.www}/${f} is missing`)
  if (!existsSync(join(run, siteDir(c))))
    throw new Error(`${dirs.run}/${siteDir(c)} is missing; build the catalog with BASE_PATH ${c.base}`)
  const runAllowed = new Set([...nestedRootEntries(c), NOINDEX_ROOT_FILE])
  const stray = readdirSync(run).filter((n) => !runAllowed.has(n))
  if (stray.length > 0) throw new Error(`${dirs.run} holds ${stray.join(', ')} outside the nested layout`)
  const taken = new Set<string>([...runRootNames(c), ...MERGE_ROOT_FILES.filter((f) => !WWW_MERGED_FILES.has(f))])
  const clash = readdirSync(www).filter((n) => taken.has(n))
  if (clash.length > 0)
    throw new Error(`${dirs.www} writes ${clash.join(', ')}, which the catalog or the merge owns at the root`)
  // a catalog built for the other kind of upload: its /run/robots.txt would contradict the root files
  if (existsSync(join(run, NOINDEX_ROOT_FILE)) !== noindex)
    throw new Error(
      `${dirs.run} is ${noindex ? 'not ' : ''}a noindex build (PAGES_NOINDEX), and this merge is ${noindex ? '' : 'not '}one`,
    )

  const read = (f: string): string => (existsSync(f) ? readFileSync(f, 'utf8') : '')
  const wwwRedirects = read(join(www, WWW_REDIRECTS_FILE))
  const bad = wwwRedirectsTextProblems(wwwRedirects)
  if (bad.length > 0) throw new Error(`${dirs.www}/${WWW_REDIRECTS_FILE} ${bad.join('; ')}`)
  const redirects = mergedRedirects(c, wwwRedirects)
  const redirectsBad = [...redirectProblems(redirects), ...redirectChainProblems(redirects, c.origin)]
  if (redirectsBad.length > 0) throw new Error(`the merged _redirects: ${redirectsBad.join('; ')}`)

  rmSync(out, { recursive: true, force: true })
  cpSync(run, out, { recursive: true })
  for (const name of readdirSync(www)) {
    if (WWW_MERGED_FILES.has(name)) continue
    cpSync(join(www, name), join(out, name), { recursive: true, force: true })
  }
  const sitemaps = mergedSitemapLocs(
    read(join(www, 'sitemap-index.xml')),
    read(join(run, siteDir(c), 'sitemap-index.xml')),
  )
  writeFileSync(join(out, 'sitemap-index.xml'), sitemapIndexXml(sitemaps))
  writeFileSync(join(out, '_redirects'), redirects)
  writeFileSync(join(out, 'robots.txt'), mergedRobots(c, noindex))
  if (noindex) writeFileSync(join(out, NOINDEX_ROOT_FILE), NOINDEX_HEADERS)
  else rmSync(join(out, NOINDEX_ROOT_FILE), { force: true })
  return {
    wwwFiles: walk(www).length,
    runFiles: walk(run).length,
    sitemaps,
    redirects: pagesRules(wwwRedirects).length,
  }
}

/** A _redirects source as a pattern: `*` matches the rest of the path, `:name` one segment. */
export const redirectSourcePattern = sourcePattern

/**
 * Whether `pathname` (a path of the origin) answers in the upload `root`: a file, a page as Pages serves HTML files
 * (`/x` as x.html or x/index.html, `/x/` as x/index.html or x.html, the last two through the redirect Pages adds),
 * or the source of a rule of _redirects (`rules`, static and dynamic).
 */
export function servesPath(root: string, pathname: string, rules: readonly { from: string }[]): boolean {
  let p: string
  try {
    p = decodeURIComponent(pathname)
  } catch {
    return false
  }
  if (rules.some((r) => r.from === p || redirectSourcePattern(r.from).test(p))) return true
  if (p.split('/').includes('..')) return false
  const at = (rel: string): boolean => {
    const f = join(root, rel)
    return existsSync(f) && statSync(f).isFile()
  }
  if (p.endsWith('/')) return at(`${p}index.html`) || (p.length > 1 && at(`${p.slice(0, -1)}.html`))
  return at(p) || at(`${p}.html`) || at(`${p}/index.html`)
}

/** Path of a page of the main site on its origin: `index.html` is `/`, other pages lose `.html`. */
function wwwPagePath(rel: string): string {
  if (rel === 'index.html') return '/'
  return `/${rel.replace(/(?:^|\/)index\.html$/, '/').replace(/\.html$/, '')}`
}

const NOT_A_PAGE = /^(?:#|mailto:|tel:|data:|javascript:|about:)/i

/** A _redirects target that takes the splat or a placeholder of its source. */
const DYNAMIC_TARGET = /:splat|\/:[A-Za-z]/

export interface MergedCheck {
  problems: string[]
  /**
   * Main site addresses the pages link that this build does not serve yet: the header and footer links of
   * lib/core/main-site.ts that Webflow serves until the switch (step C8 of the spec), and the unique pages the www
   * pages link before their phase (PENDING_PAGE). Only a noindex preview may
   * have any; in a production upload each is a problem, since there Pages and not Webflow answers them.
   */
  pending: string[]
}

/**
 * What in `root` (a merged upload) does not match the merged layout of `c`, at most `max` problems. The catalog part
 * as checkPagesLayout() checks a nested build, except that its links to the main site must name a page or a file this
 * build serves (or, in a noindex preview only, a header or footer link of lib/core/main-site.ts still on Webflow,
 * listed in `pending`); then the merged root files (_redirects with the Pages limits, robots.txt, the sitemap index
 * naming every sitemap file and no index, the home page's canonical), the pages the main site must not write
 * (NON_PAGE_SEGMENTS) and every link of its pages.
 * The main site's part of _redirects (after mergedRedirects(c)) must be a dist-www/_redirects text, equal to
 * `wwwRedirects` when given (wwwRedirectsText() of www/content/redirects.yaml), with no loop, no chain longer than one
 * hop, no source that hides a file of the upload, and every target on this origin a page or a file of it.
 */
export function checkMergedLayout(
  root: string,
  c: SiteConfig,
  max = 50,
  noindex = false,
  wwwRedirects?: string,
): MergedCheck {
  const problems: string[] = []
  const pending = new Set<string>()
  const say = (m: string): void => {
    if (problems.length < max) problems.push(m)
  }
  const configProblem = mergeConfigProblem(c)
  if (configProblem) return { problems: [configProblem], pending: [] }
  if (!existsSync(root)) return { problems: [`${root} does not exist`], pending: [] }
  const shown = (f: string): string => toPosix(relative(process.cwd(), f)) || '.'
  const read = (f: string): string | null => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null)

  const redirectsText = read('_redirects')
  const rules = redirectRules(redirectsText ?? '')
  const serves = (pathname: string): boolean => servesPath(root, pathname, rules)
  const onMainSite = (ref: string, url: URL): boolean => {
    if (serves(url.pathname)) return true
    if (noindex && /^https:\/\//.test(ref) && (isMainSiteLink(ref) || PENDING_PAGE.test(url.pathname))) {
      pending.add(`${url.origin}${url.pathname}`)
      return true
    }
    return false
  }

  // the fixed rules of the merge, then the main site's: checkPagesLayout() wants the whole text, so the main site's part
  // is taken from the upload when the fixed part matches and checked on its own below
  const fixed = mergedRedirects(c)
  const wwwPart = redirectsText !== null && redirectsText.startsWith(fixed) ? redirectsText.slice(fixed.length) : ''
  for (const p of checkPagesLayout(root, c, max, noindex, {
    redirects: fixed + wwwPart,
    mainSite: (ref, url) => onMainSite(ref, url),
  }))
    say(p)

  for (const f of ['index.html', '404.html', '_redirects', 'robots.txt', 'sitemap-index.xml'])
    if (!existsSync(join(root, f))) say(`${shown(join(root, f))} is missing`)
  if (redirectsText !== null) {
    const at = shown(join(root, '_redirects'))
    for (const p of redirectProblems(redirectsText)) say(`${at}: ${p}`)
    for (const p of wwwRedirectsTextProblems(wwwPart)) say(`${at}: the main site's rules ${p}`)
    if (wwwRedirects !== undefined && wwwPart !== wwwRedirects)
      say(`${at}: the main site's rules differ from www/content/redirects.yaml; build www and merge again`)
    for (const p of redirectChainProblems(redirectsText, c.origin)) say(`${at}: ${p}`)
    for (const r of pagesRules(wwwPart)) {
      if (!/[*:]/.test(r.from) && servesPath(root, r.from, []))
        say(`${at}: the redirect from ${r.from} hides the file of the upload it would serve`)
      // a target with the splat or a placeholder names many pages: only a fixed target can be looked up
      const target = DYNAMIC_TARGET.test(r.to) ? null : ruleTargetPath(r, c.origin)
      if (target !== null && !onMainSite(r.to, new URL(target, c.origin)))
        say(`${at}: the redirect from ${r.from} sends to ${r.to}, which is not a page or a file of this build`)
    }
  }
  const robots = read('robots.txt')
  if (robots !== null && robots !== mergedRobots(c, noindex))
    say(`${shown(join(root, 'robots.txt'))} is not mergedRobots()${noindex ? ' of a noindex build' : ''}`)

  const index = read('sitemap-index.xml')
  if (index !== null) {
    const locs = sitemapLocs(index)
    const want = new Set<string>()
    for (const name of readdirSync(root)) if (/^sitemap-\d+\.xml$/.test(name)) want.add(`${c.origin}/${name}`)
    const runIndex = read(`${siteDir(c)}/sitemap-index.xml`)
    for (const l of sitemapLocs(runIndex ?? '')) want.add(l)
    for (const l of locs) {
      const u = new URL(l)
      if (u.origin !== c.origin) say(`${shown(join(root, 'sitemap-index.xml'))}: ${l} is not on ${c.origin}`)
      else if (/sitemap-index\.xml$/.test(u.pathname))
        say(`${shown(join(root, 'sitemap-index.xml'))}: lists the index ${l}; a sitemap index cannot list one`)
      else if (!serves(u.pathname)) say(`${shown(join(root, 'sitemap-index.xml'))}: ${l} is not in the build`)
    }
    for (const l of want) if (!locs.includes(l)) say(`${shown(join(root, 'sitemap-index.xml'))} does not list ${l}`)
  }

  const home = read('index.html')
  const canonical = home === null ? null : /<link rel="canonical" href="([^"]*)"/.exec(home)?.[1]
  if (home !== null && canonical !== `${c.origin}/`)
    say(`${shown(join(root, 'index.html'))}: canonical is ${String(canonical)}, not ${c.origin}/`)

  // the main site's pages: everything at the root but the catalog's names
  const runNames = new Set(runRootNames(c))
  const reserved = new Set<string>(NON_PAGE_SEGMENTS)
  const pages: string[] = []
  for (const name of readdirSync(root)) {
    if (runNames.has(name)) continue
    if (name.endsWith('.html') && reserved.has(name.slice(0, -5)))
      say(`${shown(join(root, name))}: /${name.slice(0, -5)} is not a page of the main site`)
    const p = join(root, name)
    if (statSync(p).isDirectory()) pages.push(...walk(p).filter((f) => f.endsWith('.html')))
    else if (name.endsWith('.html')) pages.push(p)
  }
  for (const f of pages.sort()) {
    const page = wwwPagePath(toPosix(relative(root, f)))
    for (const ref of htmlRefs(readFileSync(f, 'utf8'))) {
      if (NOT_A_PAGE.test(ref)) continue
      let url: URL
      try {
        url = new URL(ref, `${c.origin}${page}`)
      } catch {
        say(`${shown(f)}: not a URL: ${ref}`)
        continue
      }
      if (url.origin !== c.origin) continue
      if (!onMainSite(ref, url)) say(`${shown(f)}: ${ref} is not a page or a file of this build`)
    }
  }
  return { problems, pending: [...pending].sort() }
}
