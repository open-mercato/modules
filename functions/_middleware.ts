// Pages Function (decision B of 29 Oct, move of 13 Nov): hostRedirect() (lib/core/site-host.ts) decides from the layout
// in functions/site.ts. At the domain root (the default) it moves only templates.openmercato.com/ to the Templates
// section at its canonical address; every other request goes on to the static files untouched, and
// site/public/_routes.json limits Functions to `/`. Under a base path (BASE_PATH `/modules`) dist/_routes.json runs
// Functions on every path outside the base and /schema/, and each of them is redirected to the same path on the site.
// `wrangler pages deploy dist` bundles this directory because the deploy job runs from the repository root
// (.github/workflows/pages.yml), after `yarn om pages-site` wrote functions/site.ts.
import { hostRedirect } from '../lib/core/site-host.ts'
import { SITE } from './site.ts'

/** The part of the Pages Functions context this middleware uses. */
export interface MiddlewareContext {
  request: Request
  next: () => Promise<Response>
}

export function onRequest(context: MiddlewareContext): Response | Promise<Response> {
  const target = hostRedirect(context.request.url, SITE)
  return target ? Response.redirect(target.location, target.status) : context.next()
}
