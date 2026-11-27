// The deploy layout of dist for Cloudflare Pages (move of 13 Nov, lib/core/site-host.ts). At the domain root (the
// default) nothing here runs: Astro writes the site to dist as before. Under a base path the Astro integration
// pagesLayout() writes the site to dist/<base>/ (so the Pages project serves the prefix itself and the proxy of the main
// site passes /run/* through unchanged), then finishNestedLayout() leaves at the root of dist only what Pages and
// the fixed addresses need: 404.html, _routes.json, _redirects, schema/ and the FIXED_ROOT_FILES (templates.json,
// picker.json, modules.json). With a home path (HOME_PATH `/modules`) the home page is <base>/modules.html, the site
// folder has no index.html and _redirects sends the base there.
// checkPagesLayout() proves a built dist matches its config (`yarn om pages-site --check`, pages.yml).
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { AstroIntegration } from 'astro'
import { DEFAULT_SITE_ORIGIN, schemaUrl } from '../core/home.ts'
import { isMainSiteLink } from '../core/main-site.ts'
import {
  FIXED_ROOT_FILES,
  hasHomePath,
  homeFile,
  homePath,
  homeUrl,
  isFilePath,
  isNested,
  isSitemapPath,
  NOINDEX_HEADERS,
  NOINDEX_ROBOTS,
  noindexFromEnv,
  pagesRedirects,
  pagesRoutes,
  SCHEMA_DIR,
  siteConfigFromEnv,
  siteDir,
  type SiteConfig,
} from '../core/site-host.ts'
import { PUBLISHED_SCHEMAS } from '../schema/json-schema.ts'

/** Files of the Pages project root that the nested layout keeps outside the site folder. */
export const ROOT_FILES = ['404.html', '_routes.json', '_redirects'] as const

/** Folders of the site that hold what pages load (scripts, styles, fonts): they move with the pages. */
const PAGE_ASSETS = ['_astro/', 'fonts/'] as const

/** The root file of a noindex build only (PAGES_NOINDEX, the preview of pages.yml): `X-Robots-Tag: noindex`. */
export const NOINDEX_ROOT_FILE = '_headers'

/** Pages reads these only at the root of the upload; inside the site folder they would be stray files. */
const ROOT_ONLY = ['_routes.json', '_redirects'] as const

/**
 * Every name the nested layout may hold at the root of the upload: the first folder of the base, ROOT_FILES, schema/
 * and FIXED_ROOT_FILES. A build empties exactly these when it starts, and the check flags anything else.
 */
export function nestedRootEntries(c: SiteConfig): string[] {
  return [siteDir(c).split('/')[0] as string, ...ROOT_FILES, SCHEMA_DIR, ...FIXED_ROOT_FILES]
}

/**
 * Lays dist out for a nested site: `root` is the upload folder (dist), the site is already in root/<base>/. Moves the
 * Pages config files to the root (rewritten for the base), copies 404.html there (Pages needs a top-level 404.html, or
 * it treats the upload as a single-page app), and copies schema/ and the FIXED_ROOT_FILES there, so the fixed
 * $id addresses and the addresses released tools fetch answer on the Pages host. The site keeps
 * its own copies of all of them (the 404 page under the base, the WebMCP script fetching tools-1.json from its own
 * origin, and the data files of the site).
 */
export function finishNestedLayout(root: string, c: SiteConfig, noindex = false): void {
  const site = join(root, siteDir(c))
  if (noindex) markNoindex(root, c)
  for (const f of ROOT_ONLY) rmSync(join(site, f), { force: true })
  writeFileSync(join(root, '_routes.json'), `${JSON.stringify(pagesRoutes(c.base), null, 2)}\n`)
  writeFileSync(join(root, '_redirects'), pagesRedirects(c))
  if (existsSync(join(site, '404.html'))) cpSync(join(site, '404.html'), join(root, '404.html'))
  if (existsSync(join(site, SCHEMA_DIR))) cpSync(join(site, SCHEMA_DIR), join(root, SCHEMA_DIR), { recursive: true })
  for (const f of FIXED_ROOT_FILES) if (existsSync(join(site, f))) cpSync(join(site, f), join(root, f))
}

/**
 * Marks a nested build as not for search engines (PAGES_NOINDEX, the preview of pages.yml): dist/_headers sends
 * `X-Robots-Tag: noindex` with every static file, and the site's robots.txt allows nothing and names no sitemap. On a
 * `*.pages.dev` host `/robots.txt` answers with that file too (hostFile).
 */
export function markNoindex(root: string, c: SiteConfig): void {
  writeFileSync(join(root, NOINDEX_ROOT_FILE), NOINDEX_HEADERS)
  writeFileSync(join(root, siteDir(c), 'robots.txt'), NOINDEX_ROBOTS)
}

/**
 * Empties the root of the upload for a nested build: removes only the names nestedRootEntries() lists (Astro empties
 * only its own outDir, and a root file of an earlier build must not ship). Returns the other names it left in place,
 * which checkPagesLayout() would flag.
 */
export function cleanNestedRoot(root: string, c: SiteConfig): string[] {
  if (!existsSync(root)) return []
  // the _headers of an earlier preview build goes too: a production build must not ship its noindex
  const known = new Set([...nestedRootEntries(c), NOINDEX_ROOT_FILE])
  for (const name of known) rmSync(join(root, name), { recursive: true, force: true })
  return readdirSync(root)
    .filter((name) => !known.has(name))
    .sort()
}

/**
 * Astro integration, listed last in astro.config.ts so it runs after the sitemap and the published files. Under a base
 * path it moves outDir to <outDir>/<base> (the configured outDir and `astro build --outDir` alike), removes the known
 * root entries of an earlier build when a build starts (cleanNestedRoot; anything else stays and gets a warning), and
 * finishes the layout when the build is done. At the domain root it changes nothing.
 */
export function pagesLayout(): AstroIntegration {
  let config: SiteConfig | null = null
  let root = ''
  let building = false
  let noindex = false
  return {
    name: 'om-pages-layout',
    hooks: {
      'astro:config:setup': ({ config: astro, command, updateConfig }) => {
        if (astro.base.replace(/^\/+|\/+$/g, '') === '') return
        // the same three variables astro.config.ts read; astro.site and astro.base win when a caller overrode them
        config = siteConfigFromEnv({
          SITE_URL: astro.site ?? DEFAULT_SITE_ORIGIN,
          BASE_PATH: astro.base,
          HOME_PATH: process.env.HOME_PATH,
        })
        noindex = noindexFromEnv(process.env)
        root = fileURLToPath(astro.outDir)
        const project = fileURLToPath(astro.root)
        if (resolve(project) === resolve(root) || !relative(resolve(root), resolve(project)).startsWith('..'))
          throw new Error(`om-pages-layout: outDir ${root} holds the project; refusing to lay the site out there`)
        building = command === 'build'
        updateConfig({ outDir: pathToFileURL(`${join(root, siteDir(config))}/`) })
      },
      'astro:build:start': ({ logger }) => {
        if (!config || !building) return
        const left = cleanNestedRoot(root, config)
        if (left.length > 0)
          logger.warn(`left at the root of the upload, outside the layout (remove before a deploy): ${left.join(', ')}`)
      },
      'astro:build:done': ({ logger }) => {
        if (!config) return
        finishNestedLayout(root, config, noindex)
        logger.info(
          `site in ${siteDir(config)}/; ${[...ROOT_FILES, ...FIXED_ROOT_FILES].join(', ')} and ${SCHEMA_DIR}/ at the root of the upload`,
        )
      },
    },
  }
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

/** Values of href, src, srcset, poster and action, and the URL of a meta refresh, outside script and style bodies. */
export function htmlRefs(html: string): string[] {
  const tags = html
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi, '<script$1></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
  const refs: string[] = []
  for (const m of tags.matchAll(/\s(href|src|srcset|poster|action|content)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const name = (m[1] ?? '').toLowerCase()
    const value = (m[2] ?? m[3] ?? '').replace(/&amp;/g, '&')
    if (name === 'srcset') refs.push(...value.split(',').map((s) => s.trim().split(/\s+/)[0] ?? ''))
    else if (name === 'content') {
      const refresh = /^\s*\d+\s*;\s*url\s*=\s*(.+)$/i.exec(value)?.[1]
      if (refresh) refs.push(refresh.trim())
    } else refs.push(value)
  }
  return refs.filter((r) => r !== '')
}

const NOT_A_PAGE = /^(?:#|mailto:|tel:|data:|javascript:|about:)/i
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/**
 * Why a link of a page breaks under the base, or null when it holds. `page` is the page's path on the site's origin
 * (`/run/m/@x/y`). A link is fine when it is absolute to another origin, or when it resolves under the base. With a
 * home path the base itself is no page (it only redirects), so a link to it is a problem too.
 */
export function linkProblem(
  ref: string,
  page: string,
  c: SiteConfig,
  mainSite?: MergedLayout['mainSite'],
): string | null {
  if (NOT_A_PAGE.test(ref)) return null
  let resolved: URL
  try {
    resolved = new URL(ref, `${c.origin}${page}`)
  } catch {
    return `not a URL: ${ref}`
  }
  if (ABSOLUTE.test(ref) && resolved.origin !== c.origin) return null
  if (!isNested(c)) return null
  const under = resolved.pathname === c.base || resolved.pathname.startsWith(`${c.base}/`)
  // merged with the main site: a link outside the base names one of its pages or files
  if (mainSite && !under) return mainSite(ref, resolved) ? null : `not a page or a file of this build: ${ref}`
  // the main site's own pages that the header and the footer link (Product, Blog, the logo): written out in full
  if (/^https:\/\//.test(ref) && isMainSiteLink(ref)) return null
  if (hasHomePath(c) && (resolved.pathname === c.base || resolved.pathname === `${c.base}/`))
    return `the base, which only redirects to ${homePath(c)}: ${ref}`
  if (resolved.pathname === c.base || resolved.pathname.startsWith(`${c.base}/`)) return null
  return `outside ${c.base}: ${ref}`
}

/** Path of an HTML file of the site on its origin: `index.html` is the folder, other pages lose `.html`. */
function pagePath(rel: string, c: SiteConfig): string {
  const b = isNested(c) ? c.base : ''
  if (rel === 'index.html') return `${b}/`
  return `${b}/${rel.replace(/(?:^|\/)index\.html$/, '/').replace(/\.html$/, '')}`
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * The merged layout (lib/emit/pages-merge.ts): the main site at the root of the upload around the nested catalog.
 * `redirects` is the _redirects the root must hold; `mainSite` tells whether a link of a catalog page outside the
 * base reaches the main site (a page or a file it serves).
 */
export interface MergedLayout {
  redirects: string
  mainSite: (ref: string, url: URL) => boolean
}

/**
 * What in `root` (a built dist) does not match the layout of `c`, as one line per problem (at most `max`). Checks the
 * root files and their content, the fixed `$id` of every schema at the root, the site files in their folder (the home
 * page at its home path and, with a home path, no index.html and no folder of that name), the `$schema` of
 * modules.json and, nested, that the FIXED_ROOT_FILES sit at the root as copies of the site's, that nothing else sits
 * at the root, every link of every page stays under the base, and the file rule of the old host (isFilePath) knows
 * every published file of the site. The home file must carry the canonical link of the home page.
 */
export function checkPagesLayout(
  root: string,
  c: SiteConfig,
  max = 50,
  noindex = false,
  merged?: MergedLayout,
): string[] {
  const problems: string[] = []
  const say = (m: string): void => {
    if (problems.length < max) problems.push(m)
  }
  if (!existsSync(root)) return [`${root} does not exist`]
  const site = join(root, siteDir(c))
  const shown = (f: string): string => toPosix(relative(process.cwd(), f)) || '.'

  for (const f of ROOT_FILES) if (!existsSync(join(root, f))) say(`${shown(join(root, f))} is missing`)
  const routes = readJson(join(root, '_routes.json'))
  if (routes !== undefined && JSON.stringify(routes) !== JSON.stringify(pagesRoutes(c.base)))
    say(`${shown(join(root, '_routes.json'))} is not ${JSON.stringify(pagesRoutes(c.base))}`)
  if (
    existsSync(join(root, '_redirects')) &&
    readFileSync(join(root, '_redirects'), 'utf8') !== (merged?.redirects ?? pagesRedirects(c))
  )
    say(
      `${shown(join(root, '_redirects'))} differs from ${merged ? 'mergedRedirects()' : 'pagesRedirects()'} for base ${c.base} and home ${c.home}`,
    )
  for (const name of PUBLISHED_SCHEMAS) {
    const file = join(root, SCHEMA_DIR, `${name}-1.json`)
    if (!existsSync(file)) {
      say(`${shown(file)} is missing`)
      continue
    }
    const id = (readJson(file) as { $id?: unknown } | undefined)?.$id
    if (id !== schemaUrl(name)) say(`${shown(file)}: $id is ${String(id)}, not ${schemaUrl(name)}`)
  }
  for (const f of [homeFile(c), 'modules.json', '404.html'])
    if (!existsSync(join(site, f))) say(`${shown(join(site, f))} is missing`)
  // the file at the home path is the home page itself, not another page that owns that name (HOME_PATH `/templates`)
  if (existsSync(join(site, homeFile(c)))) {
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(readFileSync(join(site, homeFile(c)), 'utf8'))?.[1]
    if (canonical !== homeUrl(c))
      say(`${shown(join(site, homeFile(c)))}: canonical is ${String(canonical)}, not the home page ${homeUrl(c)}`)
  }
  if (hasHomePath(c)) {
    // the base only redirects (pagesRedirects): a page there would never be served, and a folder named as the home
    // page would make /<home> ambiguous for Pages
    if (existsSync(join(site, 'index.html')))
      say(`${shown(join(site, 'index.html'))} exists, but the home page is ${homePath(c)}`)
    if (existsSync(join(site, c.home.slice(1))))
      say(`${shown(join(site, c.home.slice(1)))} collides with the home page ${homePath(c)}`)
  }
  const index = readJson(join(site, 'modules.json')) as { $schema?: unknown } | undefined
  if (index && index.$schema !== schemaUrl('modules'))
    say(`${shown(join(site, 'modules.json'))}: $schema is ${String(index.$schema)}, not ${schemaUrl('modules')}`)

  if (!isNested(c)) return problems
  for (const f of FIXED_ROOT_FILES) {
    const copy = join(root, f)
    if (!existsSync(join(site, f))) say(`${shown(join(site, f))} is missing`)
    if (!existsSync(copy)) say(`${shown(copy)} is missing (released tools fetch it there)`)
    else if (existsSync(join(site, f)) && !readFileSync(copy).equals(readFileSync(join(site, f))))
      say(`${shown(copy)} differs from ${shown(join(site, f))}`)
  }
  const allowed = new Set<string>(nestedRootEntries(c))
  if (noindex) {
    allowed.add(NOINDEX_ROOT_FILE)
    const headers = join(root, NOINDEX_ROOT_FILE)
    if (!existsSync(headers) || readFileSync(headers, 'utf8') !== NOINDEX_HEADERS)
      say(`${shown(headers)} is not NOINDEX_HEADERS; a noindex build sends X-Robots-Tag: noindex`)
    const robots = join(site, 'robots.txt')
    if (!existsSync(robots) || readFileSync(robots, 'utf8') !== NOINDEX_ROBOTS)
      say(`${shown(robots)} is not NOINDEX_ROBOTS; a noindex build allows no crawling`)
  } else if (existsSync(join(root, NOINDEX_ROOT_FILE))) {
    say(`${shown(join(root, NOINDEX_ROOT_FILE))} is for a noindex build (PAGES_NOINDEX), and this build is not one`)
    allowed.add(NOINDEX_ROOT_FILE)
  }
  // merged, the rest of the root is the main site's (checkMergedLayout)
  if (!merged)
    for (const name of readdirSync(root))
      if (!allowed.has(name)) say(`${shown(join(root, name))} sits outside the site`)
  for (const f of ROOT_ONLY) if (existsSync(join(site, f))) say(`${shown(join(site, f))} belongs at the root`)
  // the old host serves the machine-readable files itself and redirects the pages (hostFile, hostRedirect): a
  // published file of a kind the rule does not know would answer a redirect there. Pages are not checked the other
  // way round: their names come from the data (a package may be called `x.json`), and a build must not stop for one.
  for (const f of walk(site)) {
    const rel = toPosix(relative(site, f))
    if (rel.endsWith('.html') || PAGE_ASSETS.some((d) => rel.startsWith(d))) continue
    if (!isFilePath(`/${rel}`) && !isSitemapPath(`/${rel}`))
      say(`${shown(f)} is not a file the old host serves (isFilePath); its old address would answer a redirect`)
  }
  // merged, the root 404.html is the main site's page
  const pages = [...walk(site).filter((f) => f.endsWith('.html')), ...(merged ? [] : [join(root, '404.html')])].filter(
    (f) => existsSync(f),
  )
  for (const f of pages) {
    const page = f === join(root, '404.html') ? '/404' : pagePath(toPosix(relative(site, f)), c)
    for (const ref of htmlRefs(readFileSync(f, 'utf8'))) {
      const p = linkProblem(ref, page, c, merged?.mainSite)
      if (p) say(`${shown(f)}: ${p}`)
    }
  }
  return problems
}
