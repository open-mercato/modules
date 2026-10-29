// Pages Function (decision B of 29 Oct): templates.openmercato.com/ redirects to the Templates section of the same
// site, at its canonical address on modules.openmercato.com; every other request, modules.openmercato.com included,
// goes on to the static files untouched. site/public/_routes.json limits Functions to `/`, so no other path ever runs
// this. `wrangler pages deploy dist` bundles this directory
// because the deploy job runs from the repository root (.github/workflows/pages.yml).
import { templatesRedirect } from '../lib/core/templates-host.ts'

/** The part of the Pages Functions context this middleware uses. */
export interface MiddlewareContext {
  request: Request
  next: () => Promise<Response>
}

export function onRequest(context: MiddlewareContext): Response | Promise<Response> {
  const target = templatesRedirect(context.request.url)
  return target ? Response.redirect(target, 302) : context.next()
}
