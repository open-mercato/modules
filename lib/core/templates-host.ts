// templates.openmercato.com (decision B of 29 Oct): a second custom domain of the same Cloudflare Pages project, whose
// root leads straight to the Templates section. modules.openmercato.com and every other host are left alone.
// Cloudflare Pages `_redirects` cannot match on the host, so functions/_middleware.ts calls templatesRedirect() on the
// one path site/public/_routes.json sends to Functions (`/`). Isomorphic: no Node APIs.
import { CATALOG_REPO_URL } from './home.ts'

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
 * Where a request should be redirected, or null to serve it as is. Only the root of TEMPLATES_HOST moves, to
 * TEMPLATES_PATH on the same host, keeping the query string (Pages itself redirects `/index.html` to `/`). The redirect
 * is a 302: the section is in a coming soon state and may later live at the root itself, and a cached 301 would
 * outlive that change in browsers. The target assumes the site at the domain root (BASE_PATH `/`, as pages.yml
 * deploys it).
 */
export function templatesRedirect(requestUrl: string | URL): string | null {
  const url = new URL(requestUrl)
  if (url.hostname !== TEMPLATES_HOST || url.pathname !== '/') return null
  return new URL(`${TEMPLATES_PATH}${url.search}`, url.origin).toString()
}
