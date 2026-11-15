// Where the site sits on its origin, and what the Cloudflare Pages project answers outside it (decisions of 13 and
// 14 Nov: the catalog becomes the Run section of the main site, https://www.openmercato.com/run, behind its proxy).
// BASE_PATH picks one of two layouts at build time:
// - root (BASE_PATH `/`, the default): the site at the root of dist, as served at modules.openmercato.com since 28 Oct.
//   Functions run on `/` only and move just the root of templates.openmercato.com.
// - nested (any other base, e.g. `/run`): the site in dist/<base>/, so the Pages project serves the prefix itself
//   and the proxy passes /run/* through without cutting it. The root of dist keeps only what Pages and the fixed
//   addresses need (404.html, _routes.json, _redirects, schema/ and the FIXED_ROOT_FILES). On the production hosts
//   Functions answer every other path: a page (the old modules.openmercato.com/m/... links) with a redirect to the
//   same path on the site, a machine-readable file (isFilePath: llms.txt, m/<package>.md, badges, data files) with
//   the file itself, a 200 with the bytes of the copy under the base, because released tools and READMEs fetch
//   those addresses without following redirects.
//   A `*.pages.dev` deployment address is not redirected, so a new deployment can be looked at before the switch.
// HOME_PATH names the page of the catalog home under the base (`/`, the default, or one segment such as `/modules`,
// nested only): the home page is then built at <base><home> (`/run/modules`), the base itself has no page and
// dist/_redirects sends `/run` and `/run/` there.
// Functions learn the layout from functions/site.ts, which `yarn om pages-site` writes from SITE_URL, BASE_PATH and
// HOME_PATH. Isomorphic: no Node APIs.
import { DEFAULT_BASE_PATH, DEFAULT_HOME_PATH, DEFAULT_SITE_ORIGIN } from './home.ts'
import { TEMPLATES_HOST, templatesRedirect, templatesTarget } from './templates-host.ts'

/**
 * The configured site: its origin, its base path (`/`, or `/run` without a trailing slash) and the path of the home
 * page under the base (`/`, or `/modules`).
 */
export interface SiteConfig {
  origin: string
  base: string
  home: string
}

/** The default site: modules.openmercato.com at the domain root, the home page at `/`. */
export const DEFAULT_SITE: SiteConfig = {
  origin: DEFAULT_SITE_ORIGIN,
  base: DEFAULT_BASE_PATH,
  home: DEFAULT_HOME_PATH,
}

/** Folder of the published JSON Schemas at the root of the Pages project, in both layouts. */
export const SCHEMA_DIR = 'schema'

/**
 * Files that released tools fetch from https://modules.openmercato.com/<file> by a fixed address: templates.json and
 * picker.json by create-mercato-app, modules.json by `mercato module search` of @open-mercato/cli
 * (DEFAULT_MODULES_INDEX_URL). Nested, the Pages project keeps serving a copy at its root, without a redirect, as it
 * does for schema/. hostFile() would answer them too; the static copies keep the addresses with the most requests
 * away from Functions (no invocation, and an answer even when the Functions quota of the day is spent).
 */
export const FIXED_ROOT_FILES = ['templates.json', 'picker.json', 'modules.json'] as const

/** True for a path the Pages project serves from its root in both layouts: /schema/* and the FIXED_ROOT_FILES. */
export function isFixedPath(path: string): boolean {
  return path.startsWith(`/${SCHEMA_DIR}/`) || (FIXED_ROOT_FILES as readonly string[]).includes(path.slice(1))
}

/** Folders of the site whose every file is for machines: the Markdown index, the agent files and the README badges. */
export const FILE_DIRS = ['raw', '.well-known', 'badge', SCHEMA_DIR] as const

/** Extensions of the published files a tool, a README or a feed reader fetches: data, text, badges and images. */
const FILE_EXT = /\.(?:json|md|txt|svg|xml|png|webp|jpe?g|gif|ico)$/i

/** The sitemap files of @astrojs/sitemap and the /sitemap.xml crawlers ask for. */
const SITEMAP = /^\/sitemap(?:-[A-Za-z0-9]+)?\.xml$/

/** True for a sitemap of the site (`/sitemap-index.xml`, `/sitemap-0.xml`, `/sitemap.xml`), as a site path. */
export function isSitemapPath(path: string): boolean {
  return SITEMAP.test(path)
}

/**
 * True for a site path (without the base) that names a machine-readable file and not a page: a file in FILE_DIRS or
 * one with a FILE_EXT extension (`/llms.txt`, `/modules.json`, `/m/<package>.md`, `/m/<package>.json`,
 * `/badge/<package>.svg`, `/feed.xml`, `/robots.txt`, a screenshot). Not the sitemaps: they list addresses of the
 * site's own host, where a crawler must read them, so the old address moves like a page. A page never has one of
 * these extensions (`/m/socket.io` is a page), and `.html`, scripts, styles and fonts belong to pages.
 */
export function isFilePath(path: string): boolean {
  if (isSitemapPath(path)) return false
  if (FILE_DIRS.some((d) => path.startsWith(`/${d}/`))) return true
  return FILE_EXT.test(path)
}

/** A base path of one or more plain segments: it names a folder of dist and goes into _routes.json as is. */
const BASE_RE = /^(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/

/** A home path of one plain segment without a dot: it names the page <base>/<home> and the file <home>.html. */
const HOME_RE = /^\/[A-Za-z0-9][A-Za-z0-9_-]*$/

/** `/` for an empty or all-slash value, else the value with one leading slash and no trailing one. */
function normalPath(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? '/' : `/${trimmed}`
}

/**
 * The home path from HOME_PATH for a site at `base` (both as siteConfig() normalizes them). Throws on a home that is
 * not one plain segment, and on a home other than `/` at the domain root: there the base redirect would have to
 * answer `/` of every host of the Pages project, the root of templates.openmercato.com included.
 */
export function homeConfig(homeRaw: string, base: string): string {
  const home = normalPath(homeRaw)
  if (home === '/') return home
  if (!HOME_RE.test(home)) throw new Error(`HOME_PATH must be one plain path segment: ${homeRaw}`)
  if (base === '/') throw new Error(`HOME_PATH ${home} needs a BASE_PATH other than /`)
  return home
}

/**
 * The site config from SITE_URL, BASE_PATH and HOME_PATH as a build or the workflow gives them. The origin drops any
 * path of SITE_URL (as `yarn om emit` does); the base and the home lose their outer slashes. Throws on a URL that is
 * not http(s), a base that is not plain path segments or a home homeConfig() refuses.
 */
export function siteConfig(siteRaw: string, baseRaw: string, homeRaw: string = DEFAULT_HOME_PATH): SiteConfig {
  const u = new URL(siteRaw)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`SITE_URL must be an http(s) URL: ${siteRaw}`)
  const base = normalPath(baseRaw)
  if (base !== '/' && !BASE_RE.test(base)) throw new Error(`BASE_PATH must be plain path segments: ${baseRaw}`)
  return { origin: u.origin, base, home: homeConfig(homeRaw, base) }
}

/** The site config from the environment of a build (SITE_URL, BASE_PATH, HOME_PATH), with the defaults. */
export function siteConfigFromEnv(env: Record<string, string | undefined>): SiteConfig {
  return siteConfig(
    env.SITE_URL || DEFAULT_SITE_ORIGIN,
    env.BASE_PATH || DEFAULT_BASE_PATH,
    env.HOME_PATH || DEFAULT_HOME_PATH,
  )
}

/**
 * True when PAGES_NOINDEX asks for a build that search engines must not index: the preview of the nested layout that
 * pages.yml deploys to a Pages branch alias next to production (docs/RUNBOOK.md, Preview of the /run layout).
 */
export function noindexFromEnv(env: Record<string, string | undefined>): boolean {
  const v = (env.PAGES_NOINDEX ?? '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

/** dist/_headers of a noindex build: every static file of the upload answers with `X-Robots-Tag: noindex`. */
export const NOINDEX_HEADERS =
  '# A preview build (PAGES_NOINDEX): not for search engines.\n/*\n  X-Robots-Tag: noindex\n'

/** robots.txt of a noindex build: nothing to crawl, and no sitemap to follow. */
export const NOINDEX_ROBOTS = 'User-agent: *\nDisallow: /\n'

/** True when the site sits under a base path, so dist holds it in dist/<base>/ (the nested layout). */
export function isNested(c: SiteConfig): boolean {
  return c.base !== '/'
}

/** Site root with its base path and without a trailing slash: `https://www.openmercato.com/run`. */
export function siteRoot(c: SiteConfig): string {
  return isNested(c) ? `${c.origin}${c.base}` : c.origin
}

/** Folder of the site inside dist: '' at the root, `run` for `/run`. */
export function siteDir(c: SiteConfig): string {
  return c.base.replace(/^\/+/, '')
}

/** True when the home page has a path of its own under the base (`/run/modules`), so the base only redirects. */
export function hasHomePath(c: Pick<SiteConfig, 'home'>): boolean {
  return c.home !== '/'
}

/**
 * Path of the home page on the site's origin: `/` at the domain root, `/run/` under a base (a directory index), or
 * `/run/modules` with a home path.
 */
export function homePath(c: Pick<SiteConfig, 'base' | 'home'>): string {
  const b = c.base === '/' ? '' : c.base
  return hasHomePath(c) ? `${b}${c.home}` : `${b}/`
}

/** Absolute address of the home page: `https://www.openmercato.com/run/modules`. */
export function homeUrl(c: SiteConfig): string {
  return `${c.origin}${homePath(c)}`
}

/** File of the home page inside the site folder: `index.html`, or `modules.html` for the home path `/modules`. */
export function homeFile(c: Pick<SiteConfig, 'home'>): string {
  return hasHomePath(c) ? `${c.home.slice(1)}.html` : 'index.html'
}

/** dist/_routes.json: which paths run Functions (Pages allows at most 100 rules of at most 100 characters). */
export interface PagesRoutes {
  version: 1
  include: string[]
  exclude: string[]
}

/**
 * The Functions route list. At the root, `/` only (site/public/_routes.json). Nested, every path but the site and the
 * fixed addresses (schema files and the FIXED_ROOT_FILES), so a path outside the prefix reaches hostRedirect()
 * while the site and the fixed files stay plain static files.
 */
export function pagesRoutes(base: string): PagesRoutes {
  if (base === '/') return { version: 1, include: ['/'], exclude: [] }
  return {
    version: 1,
    include: ['/*'],
    exclude: [base, `${base}/*`, `/${SCHEMA_DIR}/*`, ...FIXED_ROOT_FILES.map((f) => `/${f}`)],
  }
}

/**
 * dist/_redirects. Crawlers ask for /sitemap.xml and @astrojs/sitemap writes sitemap-index.xml (live review of 30 Oct).
 * Nested, both sit under the base: the main site's own /sitemap.xml is not ours to answer.
 * With a home path the base has no page of its own: `/run` and `/run/` answer a redirect to the home page. A static
 * rule and not the Function: _routes.json keeps the whole base away from Functions, the target is a path on the same
 * host, so the rule holds behind the proxy, on the Pages hosts and on a `*.pages.dev` address alike. MOVED_STATUS
 * (302) for the reason given there.
 */
export function pagesRedirects(c: Pick<SiteConfig, 'base' | 'home'>): string {
  const b = c.base === '/' ? '' : c.base
  const lines = [
    '# Cloudflare Pages redirects (live review of 30 Oct): crawlers ask for /sitemap.xml; @astrojs/sitemap writes sitemap-index.xml.',
    `${b}/sitemap.xml ${b}/sitemap-index.xml 301`,
  ]
  if (hasHomePath(c))
    lines.push(
      `# The base has no page of its own: the home of the catalog is ${homePath(c)}.`,
      `${b} ${homePath(c)} ${MOVED_STATUS}`,
      `${b}/ ${homePath(c)} ${MOVED_STATUS}`,
    )
  return `${lines.join('\n')}\n`
}

/**
 * Status of the redirects from the Pages hosts to the nested site. A 302 while the move is new: rolling back is
 * removing the repository variables, and a 301 cached in browsers would keep sending people to an address that then
 * serves nothing. Switch to 301 once the new address is settled (docs/RUNBOOK.md, Move under www.openmercato.com).
 */
export const MOVED_STATUS = 302

export interface HostRedirect {
  location: string
  status: 301 | 302
}

/** The custom domains of the Pages project. */
export const PAGES_ORIGINS: readonly string[] = [DEFAULT_SITE_ORIGIN, `https://${TEMPLATES_HOST}`]

/** Host names of PAGES_ORIGINS: the production hosts whose old addresses move to a nested site. */
const PAGES_HOSTS: readonly string[] = PAGES_ORIGINS.map((o) => new URL(o).hostname)

/** A deployment or branch address of a Pages project (`<hash>.<project>.pages.dev`, `<project>.pages.dev`). */
export function isPreviewHost(hostname: string): boolean {
  return /\.pages\.dev$/i.test(hostname)
}

/**
 * Why a nested site cannot live at SITE_URL, or null when it can. Its origin must not be a host of the Pages project
 * (a custom domain or a `*.pages.dev` address): hostRedirect() never moves a request that carries the site's host, so
 * the old addresses there (modules.openmercato.com/m/...) would answer 404 instead of a redirect.
 */
export function pagesHostProblem(c: SiteConfig): string | null {
  if (!isNested(c)) return null
  const host = new URL(c.origin).hostname
  if (!PAGES_HOSTS.includes(host) && !isPreviewHost(host)) return null
  return (
    `SITE_URL ${c.origin} is a host of the Pages project; under BASE_PATH ${c.base} its old addresses would answer 404 ` +
    'instead of a redirect. Set SITE_URL to the site behind the proxy (https://www.openmercato.com), or BASE_PATH to /'
  )
}

/** Control characters, a backslash and their percent-encoded forms; a path with one is never redirected. */
const UNSAFE = /[\u0000-\u001f\u007f\\]|%(?:[01][0-9a-f]|7f|5c)/i

/**
 * Where a request to the Pages project should go, or null to serve it as a static file.
 * - Root layout: only the root of templates.openmercato.com moves (templatesRedirect, 302), as before the move.
 * - Nested layout, production hosts (PAGES_ORIGINS): a machine-readable file (isFilePath) is not redirected, the
 *   Function serves it (hostFile); the root of templates.openmercato.com goes to the Templates
 *   section of the site; the root of modules.openmercato.com goes to the home page (homePath: `/run/modules` with
 *   a home path); any other path outside the base and the fixed addresses (isFixedPath) goes to the same path under
 *   the base on the site's origin. The query is kept in each case.
 * - Nested layout, a `*.pages.dev` address: nothing moves to production, so a deployment can be looked at before the
 *   switch; only its root leads to the home page on the same host. Any other host (local `wrangler pages dev`):
 *   nothing.
 * Never a loop: a path under the base or a fixed address is never redirected (whatever _routes.json says), and neither
 * is a request that already carries the site's host (a proxy that cut the prefix would otherwise bounce it forever).
 * Never an open redirect: the target is built from the configured origin and base and checked to stay there, and a
 * path with `//` at the start, a backslash or a control character (also percent-encoded) is not redirected at all.
 */
export function hostRedirect(requestUrl: string | URL, c: SiteConfig): HostRedirect | null {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (!isNested(c)) {
    const target = templatesRedirect(url, siteRoot(c))
    return target ? { location: target, status: 302 } : null
  }
  const path = url.pathname
  if (path === c.base || path.startsWith(`${c.base}/`) || isFixedPath(path)) return null
  if (url.host === new URL(c.origin).host) return null
  if (isPreviewHost(url.hostname))
    return path === '/' ? { location: `${url.origin}${homePath(c)}${url.search}`, status: 302 } : null
  if (!PAGES_HOSTS.includes(url.hostname)) return null
  // `/index.html` is the root too: Pages answered it with a redirect to `/` while the site sat at the root
  const root = path === '/' || path === '/index.html'
  if (url.hostname === TEMPLATES_HOST && root)
    return { location: `${templatesTarget(siteRoot(c))}${url.search}`, status: 302 }
  if (path.startsWith('//') || UNSAFE.test(path) || UNSAFE.test(String(requestUrl).split('?')[0] ?? '')) return null
  if (isFilePath(path)) return null
  const location = `${c.origin}${root ? homePath(c) : `${c.base}${path}`}${url.search}`
  let target: URL
  try {
    target = new URL(location)
  } catch {
    return null
  }
  if (target.origin !== c.origin || !target.pathname.startsWith(`${c.base}/`)) return null
  return { location, status: MOVED_STATUS }
}

/**
 * The file of the site a request to the Pages project should be answered with, as a path of the upload
 * (`/run/llms.txt` for `/llms.txt`), or null when the request is not for a file of the old addresses.
 * Nested layout only, on the hosts of the Pages project (the production hosts and, so the rule can be looked at before
 * the switch, a `*.pages.dev` address): a machine-readable file (isFilePath) outside the base answers with the copy
 * under the base, a 200 with the same bytes and no redirect. Released tools and pages that cannot be updated fetch
 * these addresses without following redirects: the om-find-module skill inside generated apps (`curl -s` of
 * /llms.txt, /raw/modules.md and /m/<package>.md), README badges (/badge/<package>.svg), `mercato module search`
 * (/modules.json). Never for a path under the base, a fixed address (served as a static file), a request that carries
 * the site's host, another host, or a path hostRedirect() would not touch either (`//`, a backslash, a control
 * character). At the domain root (the default layout) always null: the files are where they always were.
 */
export function hostFile(requestUrl: string | URL, c: SiteConfig): string | null {
  if (!isNested(c)) return null
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  const path = url.pathname
  if (path === c.base || path.startsWith(`${c.base}/`) || isFixedPath(path)) return null
  if (url.host === new URL(c.origin).host) return null
  if (!PAGES_HOSTS.includes(url.hostname) && !isPreviewHost(url.hostname)) return null
  if (path.startsWith('//') || UNSAFE.test(path) || UNSAFE.test(String(requestUrl).split('?')[0] ?? '')) return null
  return isFilePath(path) ? `${c.base}${path}` : null
}

/**
 * The answer for hostFile(): what the asset server gave for the file under the base (status, body, type, ETag and
 * cache headers as they are, a 404 for a file that does not exist), with `Access-Control-Allow-Origin: *` set, as
 * every static file of the project has it.
 */
export function fileResponse(asset: Response): Response {
  const res = new Response(asset.body, asset)
  res.headers.set('Access-Control-Allow-Origin', '*')
  return res
}

/**
 * The redirect as the Function sends it. Pages adds `Access-Control-Allow-Origin: *` to every static file (checked on
 * modules.json and llms.txt, 13 Nov), but not to a Function's answer, and a browser checks CORS on each redirect: a
 * cross-origin fetch of an old data address (modules.json, m/*.json) would fail at the 302 without the header.
 */
export function redirectResponse(r: HostRedirect): Response {
  return new Response(null, {
    status: r.status,
    headers: { Location: r.location, 'Access-Control-Allow-Origin': '*' },
  })
}

/**
 * Origins that serve this same build in production besides the site's own: the page script (site/src/lib/here.ts)
 * leaves its links alone there. At the root, templates.openmercato.com; nested, also modules.openmercato.com, which
 * serves the site under the base as the source of the proxy.
 */
export function otherProductionOrigins(c: SiteConfig): string[] {
  return PAGES_ORIGINS.filter((o) => o !== c.origin)
}

/**
 * Source of functions/site.ts, the layout the Functions read at run time. `yarn om pages-site` writes it before
 * `wrangler pages` bundles functions/ (pages.yml, both jobs); the committed copy is the default.
 */
export function siteModule(c: SiteConfig): string {
  return [
    '// Generated by `yarn om pages-site` from SITE_URL, BASE_PATH and HOME_PATH (lib/core/site-host.ts); do not edit by',
    '// hand.',
    '// pages.yml writes it before Functions are bundled; the committed copy is the default (root layout).',
    "import type { SiteConfig } from '../lib/core/site-host.ts'",
    '',
    `export const SITE: SiteConfig = { origin: ${quote(c.origin)}, base: ${quote(c.base)}, home: ${quote(c.home)} }`,
    '',
  ].join('\n')
}

const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
