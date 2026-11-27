// Proxy of the main site for the Run section (docs/RUNBOOK.md, Contract for the proxy of the main site). A Cloudflare
// Worker on the route www.openmercato.com/run*: it sends /run and /run/* to the Pages project open-mercato-modules
// with the same path and query, /run kept, and gives the answer back as it is. Redirects are not followed, so the
// 302 of /run to /run/modules reaches the browser. One setting, UPSTREAM, names the Pages address: the preview
// (https://run-preview.open-mercato-modules.pages.dev) for the test, production
// (https://open-mercato-modules.pages.dev) after the switch. Optional, SHORT_REDIRECTS=on answers /modules and
// /templates with a 302 to /run/modules and /run/templates (they need routes of their own, see wrangler.toml).
// Self-contained: no imports, so it deploys as one file. docs/proxy/README.md says how.

export interface ProxyEnv {
  /** Origin of the Pages project, https and no path: `https://open-mercato-modules.pages.dev`. */
  UPSTREAM?: string
  /** `on` (or `true`, `1`) to answer /modules and /templates with a redirect into /run. Off by default. */
  SHORT_REDIRECTS?: string
}

/** The prefix the Pages project serves the site under. The proxy never cuts it. */
export const PREFIX = '/run'

/** Short addresses on the main site and where SHORT_REDIRECTS sends them. */
export const SHORT_PATHS: Readonly<Record<string, string>> = {
  '/modules': '/run/modules',
  '/templates': '/run/templates',
}

/**
 * Request headers that stay on this hop (RFC 9110 7.6.1), Host (the upstream URL sets it), and Cookie: the cookies of
 * the main site are not the catalog's business, and the catalog reads none.
 */
const DROPPED = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'cookie',
])

/** True for `/run` and `/run/...`; false for `/running`, `/run-x` and the rest of the main site. */
export function isRunPath(pathname: string): boolean {
  return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`)
}

/** The upstream origin from UPSTREAM, or null when it is not an https origin without a path, query or credentials. */
export function upstreamOrigin(raw: string | undefined): string | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null
  if (u.pathname !== '/' && u.pathname !== '') return null
  return u.origin
}

/** The upstream URL for a request URL: the same path and query on the upstream origin. */
export function upstreamUrl(requestUrl: string, origin: string): string {
  const u = new URL(requestUrl)
  return `${origin}${u.pathname}${u.search}`
}

/** The headers sent upstream: the request's own, without DROPPED, plus where the request came from. */
export function forwardHeaders(incoming: Headers, requestUrl: string): Headers {
  const out = new Headers()
  for (const [name, value] of incoming) if (!DROPPED.has(name.toLowerCase())) out.append(name, value)
  const u = new URL(requestUrl)
  out.set('X-Forwarded-Host', u.host)
  out.set('X-Forwarded-Proto', u.protocol.replace(/:$/, ''))
  return out
}

/** The request to the Pages project: method, body and forwarded headers of `request`, redirects not followed. */
export function upstreamRequest(request: Request, origin: string): Request {
  // `new Request(url, request)` carries method and body (a stream) over; the second step sets the headers and the
  // redirect mode on that same request
  const moved = new Request(upstreamUrl(request.url, origin), request)
  return new Request(moved, { headers: forwardHeaders(request.headers, request.url), redirect: 'manual' })
}

const on = (v: string | undefined): boolean => ['1', 'true', 'on', 'yes'].includes((v ?? '').trim().toLowerCase())

/** The redirect for a short address with SHORT_REDIRECTS on (query kept), or null. */
export function shortRedirect(requestUrl: string, env: ProxyEnv): string | null {
  if (!on(env.SHORT_REDIRECTS)) return null
  const u = new URL(requestUrl)
  const target = SHORT_PATHS[u.pathname.replace(/\/+$/, '') || '/']
  return target ? `${u.origin}${target}${u.search}` : null
}

type Fetch = (request: Request) => Promise<Response>

/**
 * The answer to one request. A /run path goes to the Pages project and its answer comes back untouched (status,
 * Location, Content-Type, Cache-Control, ETag, Access-Control-Allow-Origin). A short address answers a 302 when
 * SHORT_REDIRECTS is on. Anything else the route caught (`/running`) goes on to the main site unchanged.
 */
export async function handle(request: Request, env: ProxyEnv, upstreamFetch: Fetch, passFetch: Fetch = upstreamFetch) {
  const url = new URL(request.url)
  if (isRunPath(url.pathname)) {
    const origin = upstreamOrigin(env.UPSTREAM)
    if (!origin)
      return new Response('Proxy for /run: UPSTREAM is not an https origin. See docs/proxy/README.md.\n', {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    return upstreamFetch(upstreamRequest(request, origin))
  }
  const short = shortRedirect(request.url, env)
  if (short && (request.method === 'GET' || request.method === 'HEAD'))
    return new Response(null, { status: 302, headers: { Location: short } })
  // a Worker's fetch of its own route's URL goes to the origin of the zone (the main site), not back to the Worker
  return passFetch(request)
}

export default {
  fetch(request: Request, env: ProxyEnv): Promise<Response> {
    return handle(request, env, (r) => fetch(r))
  },
}
