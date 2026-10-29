// templates.openmercato.com (decision B of 29 Oct): a second custom domain of the same Cloudflare Pages project, whose
// root leads straight to the Templates section. modules.openmercato.com and every other host are left alone.
// Cloudflare Pages `_redirects` cannot match on the host, so functions/_middleware.ts calls templatesRedirect() on the
// one path site/public/_routes.json sends to Functions (`/`). Isomorphic: no Node APIs.
import { CATALOG_REPO_URL, DEFAULT_SITE_ORIGIN } from './home.ts'

/** The host whose root leads to the Templates section. */
export const TEMPLATES_HOST = 'templates.openmercato.com'

/** Site path of the Templates section (site/src/pages/templates.astro). */
export const TEMPLATES_PATH = '/templates'

/** Where to follow the work (decision C of 29 Oct): the spec pull request and the two tracking issues. */
export const TEMPLATES_LINKS = {
  spec: `${CATALOG_REPO_URL}/pull/5`,
  tool: `${CATALOG_REPO_URL}/issues/6`,
  section: `${CATALOG_REPO_URL}/issues/7`,
} as const

/**
 * The address the templates host root leads to: the section on the main origin, which is also its canonical URL.
 * Not the same host (review of 29 Oct): the wordmark, the Modules item and "Browse modules" link to `/`, so on the
 * templates host they would land on its root and come straight back to the section, and the module home would be out
 * of reach. The site sits at the domain root there (BASE_PATH `/`, as pages.yml deploys it).
 */
export const TEMPLATES_TARGET = `${DEFAULT_SITE_ORIGIN}${TEMPLATES_PATH}`

/**
 * Where a request should be redirected, or null to serve it as is. Only the root of TEMPLATES_HOST moves, to
 * TEMPLATES_TARGET, keeping the query string (Pages itself redirects `/index.html` to `/`). The redirect is a 302: the
 * section is in a coming soon state and may later get a root of its own, and a cached 301 would outlive that change
 * in browsers.
 */
export function templatesRedirect(requestUrl: string | URL): string | null {
  const url = new URL(requestUrl)
  if (url.hostname !== TEMPLATES_HOST || url.pathname !== '/') return null
  return `${TEMPLATES_TARGET}${url.search}`
}
