// Pages Function (decision B of 29 Oct, move of 13 and 14 Nov): hostRedirect() and hostFile() (lib/core/site-host.ts)
// decide from the layout in functions/site.ts. At the domain root (the default) it moves only
// templates.openmercato.com/ to the Templates section at its canonical address; every other request goes on to the
// static files untouched, and site/public/_routes.json limits Functions to `/`. Under a base path (BASE_PATH `/run`)
// dist/_routes.json runs Functions on every path outside the base and the fixed addresses (/schema/*,
// /templates.json, /picker.json, /modules.json). On the hosts of the Pages project a machine-readable file of the old
// addresses (/llms.txt, /m/<package>.md, /badge/<package>.svg, any *.json) is answered with the file under the base
// from the asset server (env.ASSETS), a 200 with the same bytes and the CORS header, because released tools fetch
// them without following redirects; on the production hosts every page is redirected to the same path on the site,
// the root to the home page (`/run/modules` with HOME_PATH `/modules`), and a `*.pages.dev` root leads to the home
// page on its own host. The base itself (`/run`, `/run/`) never reaches Functions: dist/_redirects answers it.
// `wrangler pages deploy dist` bundles this directory because the deploy job runs from the repository root
// (.github/workflows/pages.yml), after `yarn om pages-site` wrote functions/site.ts.
// With PAGES_SERVE_ORIGIN (functions/site.ts `serve`, owner's decision of 26 Nov 2026) the hosts of the Pages project
// serve the merged layout themselves (hostServe): the main site's pages answer first and an old catalog page address
// it does not serve moves with a 301 under the base on the same origin, a machine-readable file answers with the
// catalog's copy under the base first and the main site's own file next. Those redirects carry a one-hour Cache-Control,
// X-Robots-Tag: noindex and the security headers of _headers (serveRedirectHeaders), which a Function's answer lacks.
import {
  fileResponse,
  hostFile,
  hostRedirect,
  hostServe,
  redirectResponse,
  SERVE_MOVED_STATUS,
  serveRedirectHeaders,
  type SiteConfig,
} from '../lib/core/site-host.ts'
import { SITE } from './site.ts'

/** The part of the Pages Functions context this middleware uses. */
export interface MiddlewareContext {
  request: Request
  next: () => Promise<Response>
  /** The bindings of the project; ASSETS is the asset server of the upload (absent in a unit test without files). */
  env?: { ASSETS?: { fetch: (request: Request) => Promise<Response> } }
}

/** The answer for the layout `site`; onRequest() is this for the layout of functions/site.ts. */
export function answer(context: MiddlewareContext, site: SiteConfig): Response | Promise<Response> {
  if (site.serve) return serve(context, site)
  const file = hostFile(context.request.url, site)
  const assets = context.env?.ASSETS
  if (file && assets) {
    // the same request (method, conditional headers, query) for the copy under the base
    const url = new URL(context.request.url)
    url.pathname = file
    return assets.fetch(new Request(url, context.request)).then(fileResponse)
  }
  const target = hostRedirect(context.request.url, site)
  return target ? redirectResponse(target) : context.next()
}

/** The asset server's answer for `path` of the upload: the same request (method, conditional headers, query). */
function asset(
  context: MiddlewareContext,
  assets: { fetch: (request: Request) => Promise<Response> },
  path: string,
): Promise<Response> {
  const url = new URL(context.request.url)
  url.pathname = path
  return assets.fetch(new Request(url, context.request))
}

/** The answer on a serving host (hostServe); without the asset server (a unit test without files) the static files. */
async function serve(context: MiddlewareContext, site: SiteConfig): Promise<Response> {
  const step = hostServe(context.request.url, site)
  const assets = context.env?.ASSETS
  if (step?.kind === 'redirect') return redirectResponse(step.redirect, serveRedirectHeaders())
  if (!step || !assets) return context.next()
  if (step.kind === 'file') {
    const file = await asset(context, assets, step.file)
    if (file.status !== 404) return fileResponse(file)
    await file.body?.cancel()
    return context.next()
  }
  const page = await context.next()
  if (page.status !== 404) return page
  const old = await asset(context, assets, step.probe)
  await old.body?.cancel()
  if (old.status >= 400) return page
  await page.body?.cancel()
  return redirectResponse({ location: step.location, status: SERVE_MOVED_STATUS }, serveRedirectHeaders())
}

export function onRequest(context: MiddlewareContext): Response | Promise<Response> {
  return answer(context, SITE)
}
