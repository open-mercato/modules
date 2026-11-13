// Where the site sits on its origin, and what the Cloudflare Pages project answers outside it (decision of 13 Nov: the
// catalog moves to https://www.openmercato.com/modules, behind the proxy of the main site). BASE_PATH picks one of two
// layouts at build time:
// - root (BASE_PATH `/`, the default): the site at the root of dist, as served at modules.openmercato.com since 28 Oct.
//   Functions run on `/` only and move just the root of templates.openmercato.com.
// - nested (any other base, e.g. `/modules`): the site in dist/<base>/, so the Pages project serves the prefix itself
//   and the proxy passes /modules/* through without cutting it. The root of dist keeps only what Pages and the fixed
//   addresses need (404.html, _routes.json, _redirects, schema/, templates.json, picker.json), and Functions send every
//   other path of the production hosts (the old modules.openmercato.com/m/... links) to the same path on the site.
//   A `*.pages.dev` deployment address is not redirected, so a new deployment can be looked at before the switch.
// Functions learn the layout from functions/site.ts, which `yarn om pages-site` writes from SITE_URL and BASE_PATH.
// Isomorphic: no Node APIs.
import { DEFAULT_BASE_PATH, DEFAULT_SITE_ORIGIN } from './home.ts'
import { TEMPLATES_HOST, templatesRedirect, templatesTarget } from './templates-host.ts'

/** The configured site: its origin and its base path (`/`, or `/modules` without a trailing slash). */
export interface SiteConfig {
  origin: string
  base: string
}

/** The default site: modules.openmercato.com at the domain root. */
export const DEFAULT_SITE: SiteConfig = { origin: DEFAULT_SITE_ORIGIN, base: DEFAULT_BASE_PATH }

/** Folder of the published JSON Schemas at the root of the Pages project, in both layouts. */
export const SCHEMA_DIR = 'schema'

/**
 * Files that released create-mercato-app versions fetch from https://modules.openmercato.com/<file> by a fixed address.
 * Nested, the Pages project keeps serving a copy at its root, without a redirect, as it does for schema/.
 */
export const FIXED_ROOT_FILES = ['templates.json', 'picker.json'] as const

/** True for a path the Pages project serves from its root in both layouts: /schema/* and the FIXED_ROOT_FILES. */
export function isFixedPath(path: string): boolean {
  return path.startsWith(`/${SCHEMA_DIR}/`) || (FIXED_ROOT_FILES as readonly string[]).includes(path.slice(1))
}

/** A base path of one or more plain segments: it names a folder of dist and goes into _routes.json as is. */
const BASE_RE = /^(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/

/**
 * The site config from SITE_URL and BASE_PATH as a build or the workflow gives them. The origin drops any path of
 * SITE_URL (as `yarn om emit` does); the base loses its outer slashes. Throws on a URL that is not http(s) or a base
 * that is not plain path segments.
 */
export function siteConfig(siteRaw: string, baseRaw: string): SiteConfig {
  const u = new URL(siteRaw)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`SITE_URL must be an http(s) URL: ${siteRaw}`)
  const trimmed = baseRaw.trim().replace(/^\/+|\/+$/g, '')
  const base = trimmed === '' ? '/' : `/${trimmed}`
  if (base !== '/' && !BASE_RE.test(base)) throw new Error(`BASE_PATH must be plain path segments: ${baseRaw}`)
  return { origin: u.origin, base }
}

/** True when the site sits under a base path, so dist holds it in dist/<base>/ (the nested layout). */
export function isNested(c: SiteConfig): boolean {
  return c.base !== '/'
}

/** Site root with its base path and without a trailing slash: `https://www.openmercato.com/modules`. */
export function siteRoot(c: SiteConfig): string {
  return isNested(c) ? `${c.origin}${c.base}` : c.origin
}

/** Folder of the site inside dist: '' at the root, `modules` for `/modules`. */
export function siteDir(c: SiteConfig): string {
  return c.base.replace(/^\/+/, '')
}

/** dist/_routes.json: which paths run Functions (Pages allows at most 100 rules of at most 100 characters). */
export interface PagesRoutes {
  version: 1
  include: string[]
  exclude: string[]
}

/**
 * The Functions route list. At the root, `/` only (site/public/_routes.json). Nested, every path but the site and the
 * fixed addresses (schema files, templates.json, picker.json), so a path outside the prefix reaches hostRedirect()
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
 */
export function pagesRedirects(base: string): string {
  const b = base === '/' ? '' : base
  return (
    '# Cloudflare Pages redirects (live review of 30 Oct): crawlers ask for /sitemap.xml; @astrojs/sitemap writes sitemap-index.xml.\n' +
    `${b}/sitemap.xml ${b}/sitemap-index.xml 301\n`
  )
}

/**
 * Status of the redirects from the Pages hosts to the nested site. A 302 while the move is new: rolling back is
 * removing two repository variables, and a 301 cached in browsers would keep sending people to an address that then
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

/** Control characters, a backslash and their percent-encoded forms; a path with one is never redirected. */
const UNSAFE = /[\u0000-\u001f\u007f\\]|%(?:[01][0-9a-f]|7f|5c)/i

/**
 * Where a request to the Pages project should go, or null to serve it as a static file.
 * - Root layout: only the root of templates.openmercato.com moves (templatesRedirect, 302), as before the move.
 * - Nested layout, production hosts (PAGES_ORIGINS): the root of templates.openmercato.com goes to the Templates
 *   section of the site; any other path outside the base and the fixed addresses (isFixedPath) goes to the same path
 *   under the base on the site's origin, query kept.
 * - Nested layout, a `*.pages.dev` address: nothing moves to production, so a deployment can be looked at before the
 *   switch; only its root leads to the base on the same host. Any other host (local `wrangler pages dev`): nothing.
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
    return path === '/' ? { location: `${url.origin}${c.base}/${url.search}`, status: 302 } : null
  if (!PAGES_HOSTS.includes(url.hostname)) return null
  if (url.hostname === TEMPLATES_HOST && path === '/')
    return { location: `${templatesTarget(siteRoot(c))}${url.search}`, status: 302 }
  if (path.startsWith('//') || UNSAFE.test(path) || UNSAFE.test(String(requestUrl).split('?')[0] ?? '')) return null
  const location = `${c.origin}${c.base}${path}${url.search}`
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
    '// Generated by `yarn om pages-site` from SITE_URL and BASE_PATH (lib/core/site-host.ts); do not edit by hand.',
    '// pages.yml writes it before Functions are bundled; the committed copy is the default (root layout).',
    "import type { SiteConfig } from '../lib/core/site-host.ts'",
    '',
    `export const SITE: SiteConfig = { origin: ${quote(c.origin)}, base: ${quote(c.base)} }`,
    '',
  ].join('\n')
}

const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
