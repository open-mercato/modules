// Internal links (spec 3.4): every internal link goes through href() so the site works under the Pages base path
// (`/modules`) and on the domain (`/`). Isomorphic: used by Astro components and Preact islands.
const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env

/** Base path without a trailing slash: '' for '/', '/modules' for '/modules/'. */
export function normalizeBase(base: string | undefined): string {
  const b = (base ?? '/').trim()
  if (b === '' || b === '/') return ''
  return `/${b.replace(/^\/+|\/+$/g, '')}`
}

export const BASE = normalizeBase(env?.BASE_URL)

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

/**
 * Site path to a link under the base path. `href('/m/@x/y')` -> `/modules/m/@x/y`; `href('/')` -> `/modules/`
 * (the home page is a directory index: Pages answers a bare `/modules` with a 301; every other page has no slash). External URLs, `mailto:` and `#anchors` are returned unchanged.
 */
export function href(path: string, base: string = BASE): string {
  if (EXTERNAL.test(path)) return path
  const p = path.startsWith('/') ? path : `/${path}`
  if (p === '/') return `${base}/`
  const [pathname, rest] = splitSuffix(p)
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return `${base}${clean}${rest}`
}

function splitSuffix(p: string): [string, string] {
  const i = p.search(/[?#]/)
  return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i)]
}

/** Absolute URL of a site path on `site` (canonical links, OG). */
export function absoluteUrl(site: string, path: string, base: string = BASE): string {
  return new URL(href(path, base), site.endsWith('/') ? site : `${site}/`).toString()
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
