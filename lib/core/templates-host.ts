// templates.openmercato.com (decision B of 29 Oct): a second custom domain of the same Cloudflare Pages project, whose
// root leads straight to the Templates section. Cloudflare Pages `_redirects` cannot match on the host, so
// functions/_middleware.ts calls templatesRedirect() through hostRedirect() (lib/core/site-host.ts) on the paths
// site/public/_routes.json sends to Functions (`/` at the domain root). Isomorphic: no Node APIs.
import { CATALOG_REPO_URL, DEFAULT_SITE_URL } from './home.ts'

/** The host whose root leads to the Templates section. */
export const TEMPLATES_HOST = 'templates.openmercato.com'

/** Site path of the Templates section (site/src/pages/templates.astro). */
export const TEMPLATES_PATH = '/templates'

/**
 * Where to follow the work (decision C of 29 Oct): the spec pull request and the two tracking issues; the save tool's
 * repository (on GitHub, not on npm yet) and the Templates section of CONTRIBUTING (Phase 1a step 8).
 */
export const TEMPLATES_LINKS = {
  spec: `${CATALOG_REPO_URL}/pull/5`,
  tool: `${CATALOG_REPO_URL}/issues/6`,
  section: `${CATALOG_REPO_URL}/issues/7`,
  toolRepo: 'https://github.com/open-mercato/create-mercato-template',
  contributing: `${CATALOG_REPO_URL}/blob/main/CONTRIBUTING.md#templates`,
} as const

/**
 * The address the templates host root leads to: the section on the configured site (`site` is the site root with its
 * base path and no trailing slash, as SITE_URL and BASE_PATH give it), which is also its canonical URL. Not the same
 * host (review of 29 Oct): the Modules row of the Run menu and "Browse modules" link to the site home, so on the
 * templates host they would land on its root and come straight back to the section, and the module home would be out
 * of reach. By default `https://modules.openmercato.com/templates`.
 */
export function templatesTarget(site: string = DEFAULT_SITE_URL): string {
  return `${site.replace(/\/+$/, '')}${TEMPLATES_PATH}`
}

/**
 * Where a request should be redirected, or null to serve it as is. Only the root of TEMPLATES_HOST moves, to
 * templatesTarget(site), keeping the query string (Pages itself redirects `/index.html` to `/`). The redirect is a
 * 302: the section may later get a root of its own, and a cached 301 would outlive that change in browsers.
 */
export function templatesRedirect(requestUrl: string | URL, site: string = DEFAULT_SITE_URL): string | null {
  const url = new URL(requestUrl)
  if (url.hostname !== TEMPLATES_HOST || url.pathname !== '/') return null
  return `${templatesTarget(site)}${url.search}`
}
