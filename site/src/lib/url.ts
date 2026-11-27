// Internal links (spec 3.4): every internal link goes through href() so the site works under a base path (`/run`)
// and on the domain (`/`), and so the home page can sit at a path of its own under the base (HOME_PATH `/modules`:
// `/run/modules`). Isomorphic: used by Astro components and Preact islands.
import { DEFAULT_HOME_PATH, SCHEMA_ORIGIN } from '../../../lib/core/home.ts'

const env = (import.meta as unknown as { env?: { BASE_URL?: string; OM_HOME_PATH?: string } }).env

/** Base path without a trailing slash: '' for '/', '/run' for '/run/'. */
export function normalizeBase(base: string | undefined): string {
  const b = (base ?? '/').trim()
  if (b === '' || b === '/') return ''
  return `/${b.replace(/^\/+|\/+$/g, '')}`
}

export const BASE = normalizeBase(env?.BASE_URL)

/**
 * Path of the home page under the base: `/`, or `/modules` (astro.config.ts defines it from HOME_PATH, checked by
 * homeConfig() of lib/core/site-host.ts).
 */
export const HOME = env?.OM_HOME_PATH ?? DEFAULT_HOME_PATH

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

/**
 * Site path to a link under the base path. `href('/m/@x/y')` -> `/run/m/@x/y`. `/` is the home page: `href('/')` ->
 * `/run/` (a directory index: Pages answers a bare `/run` with a 301; every other page has no slash), or
 * `/run/modules` when the home page has a path of its own (`home`); a query or a fragment on it is kept. External
 * URLs, `mailto:` and `#anchors` are returned unchanged.
 */
export function href(path: string, base: string = BASE, home: string = HOME): string {
  if (EXTERNAL.test(path)) return path
  const p = path.startsWith('/') ? path : `/${path}`
  const [pathname, rest] = splitSuffix(p)
  if (pathname === '/') return `${base}${home}${rest}`
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return `${base}${clean}${rest}`
}

function splitSuffix(p: string): [string, string] {
  const i = p.search(/[?#]/)
  return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i)]
}

/**
 * Link to a published data file. A JSON Schema (`/schema/...`) under a base path links to its fixed address on
 * SCHEMA_ORIGIN (decision of 13 Nov): the nested layout serves the schemas at the root of the Pages host, not under the
 * base. At the domain root it is href(), as before. Every other path is href().
 */
export function dataHref(path: string, base: string = BASE): string {
  if (base !== '' && path.startsWith('/schema/')) return `${SCHEMA_ORIGIN}${path}`
  return href(path, base)
}

/** Absolute URL of a site path on `site` (canonical links, OG). `/` is the home page, as for href(). */
export function absoluteUrl(site: string, path: string, base: string = BASE, home: string = HOME): string {
  return new URL(href(path, base, home), site.endsWith('/') ? site : `${site}/`).toString()
}

/**
 * Absolute root of the site on `site`, with its base path and a trailing slash: `https://www.openmercato.com/run/`.
 * Not the home page: with a home path that is absoluteUrl(site, '/').
 */
export function siteRootUrl(site: string, base: string = BASE): string {
  return new URL(`${base}/`, site.endsWith('/') ? site : `${site}/`).toString()
}

/** Page of an entry path (LocPath): `/m/<path>`. */
export const modulePage = (path: string): string => `/m/${path}`
/** Agent card of an entry path: `/m/<path>.md`. */
export const moduleMd = (path: string): string => `/m/${path}.md`
/** Built-in module page. */
export const builtInPage = (id: string): string => `/built-in/${id}`
/** Category page. */
export const categoryPage = (id: string): string => `/c/${id}`
/** Receipt page. */
export const receiptPage = (id: string): string => `/r/${id}`

/** Source link for a fact `file:line` (spec 7.6 AnatomyFilm). */
export function sourceLink(
  src: { npm: string | null; github: string | null; version: string | null; gitRef: string | null },
  file: string,
  line?: number | null,
): string | null {
  if (src.npm && src.version) return `https://cdn.jsdelivr.net/npm/${src.npm}@${src.version}/${file}`
  if (src.github && src.gitRef)
    return `https://github.com/${src.github}/blob/${src.gitRef}/${file}${line ? `#L${line}` : ''}`
  return null
}
