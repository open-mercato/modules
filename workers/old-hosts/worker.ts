// Worker for the old hosts (spec docs/specs/2026-11-24-www-site-migration.md, Option B and Phase 1b): a Cloudflare
// Worker on the routes modules.openmercato.com/* and templates.openmercato.com/* that answers them as the Pages
// Functions of the nested layout do today (functions/_middleware.ts, docs/RUNBOOK.md, Old addresses), so the Pages
// project can run without Functions once the main site sits at its root (Phase 1c).
// - A page answers a 302 to the same path under https://www.openmercato.com/run (hostRedirect), the roots to the home
//   page and to the Templates section, with `Access-Control-Allow-Origin: *` (redirectResponse).
// - A machine-readable file (hostFile) answers a 200 with the bytes of the file under /run of the upstream, status,
//   ETag and cache headers as they come, plus the CORS header (fileResponse).
// - The fixed addresses (/schema/*, /templates.json, /picker.json, /modules.json) answer the same way from /run of the
//   upstream, so they no longer need copies at the root of the upload. Their `$id` stays on modules.openmercato.com.
// - A path under /run is passed to the upstream as it is, its answer untouched (redirects not followed).
// The upstream is the project's own address, https://open-mercato-modules.pages.dev, never www.openmercato.com: a
// rollback of the www record (spec C10) must not break the old hosts. Not deployed from this repository: the owner
// deploys it (docs/RUNBOOK.md, Old hosts on a Worker). The rules are those of lib/core/site-host.ts, bundled in.
import {
  PAGES_ORIGINS,
  fileResponse,
  hostFile,
  hostRedirect,
  isFixedPath,
  isNested,
  redirectResponse,
  siteConfig,
  type SiteConfig,
} from '../../lib/core/site-host.ts'

export interface OldHostsEnv {
  /** Origin of the Pages project, https and no path: `https://open-mercato-modules.pages.dev`. */
  UPSTREAM?: string
  /** Where pages move: the site origin, its base and its home page, as the `pages` build gets them. */
  SITE_URL?: string
  BASE_PATH?: string
  HOME_PATH?: string
}

/** The settings of wrangler.toml, used for any that is not set. */
export const DEFAULTS = {
  UPSTREAM: 'https://open-mercato-modules.pages.dev',
  SITE_URL: 'https://www.openmercato.com',
  BASE_PATH: '/run',
  HOME_PATH: '/modules',
} as const satisfies Required<OldHostsEnv>

/** Host names this Worker answers: the custom domains the Pages project had (PAGES_ORIGINS). */
export const OLD_HOSTS: readonly string[] = PAGES_ORIGINS.map((o) => new URL(o).hostname)

export interface OldHostsConfig {
  site: SiteConfig
  upstream: string
}

/**
 * The config from the settings, or the reason it cannot work. The site must be nested (pages move under a base) and
 * on a host the Worker does not answer. The upstream must be an https origin without a path, query or credentials, and
 * neither an old host (the Worker would call itself) nor the site's host (spec: never through www).
 */
export function oldHostsConfig(env: OldHostsEnv): OldHostsConfig | string {
  let site: SiteConfig
  try {
    site = siteConfig(
      env.SITE_URL || DEFAULTS.SITE_URL,
      env.BASE_PATH || DEFAULTS.BASE_PATH,
      env.HOME_PATH || DEFAULTS.HOME_PATH,
    )
  } catch (e) {
    return (e as Error).message
  }
  if (!isNested(site)) return `BASE_PATH must not be /: the old hosts move under a base`
  const siteHost = new URL(site.origin).hostname
  if (OLD_HOSTS.includes(siteHost)) return `SITE_URL ${site.origin} is an old host`
  const raw = (env.UPSTREAM || DEFAULTS.UPSTREAM).trim()
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return `UPSTREAM is not a URL: ${raw}`
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname))
    return `UPSTREAM must be an https origin without a path: ${raw}`
  if (OLD_HOSTS.includes(u.hostname)) return `UPSTREAM ${u.origin} is an old host: the Worker would call itself`
  if (u.hostname === siteHost) return `UPSTREAM ${u.origin} is the site's host: read the Pages project's own address`
  return { site, upstream: u.origin }
}

/**
 * Request headers that stay on this hop (RFC 9110 7.6.1), Host (the upstream URL sets it) and Cookie (the old hosts
 * set none, and the upstream reads none).
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

/**
 * The request for `path` (and the query of the incoming request) on the upstream: the method, body and conditional
 * headers of `request`, redirects not followed. Null when the URL would leave the upstream origin.
 */
export function upstreamRequest(request: Request, path: string, upstream: string): Request | null {
  const target = new URL(upstream)
  // the pathname setter keeps the origin: `//evil.example` stays a path of the upstream
  target.pathname = path
  target.search = new URL(request.url).search
  if (target.origin !== upstream) return null
  const headers = new Headers()
  for (const [name, value] of request.headers) if (!DROPPED.has(name.toLowerCase())) headers.append(name, value)
  const moved = new Request(target.toString(), request)
  return new Request(moved, { headers, redirect: 'manual' })
}

/** A short answer of the Worker itself, with the CORS header every answer of the Pages project carries. */
const text = (status: number, body: string): Response =>
  new Response(`${body}\n`, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })

type Fetch = (request: Request) => Promise<Response>

/**
 * The answer to one request, in the order of the Functions: a file of the old addresses, then a page redirect, then
 * the fixed addresses and the paths under the base from the upstream. Anything else (a host the Worker does not
 * answer, a path with `//` at the start, a backslash or a control character) is a 404 and fetches nothing.
 */
export async function handle(request: Request, env: OldHostsEnv, upstreamFetch: Fetch): Promise<Response> {
  const config = oldHostsConfig(env)
  if (typeof config === 'string') return text(502, `Old hosts Worker: ${config}. See docs/RUNBOOK.md.`)
  const { site, upstream } = config
  const url = new URL(request.url)
  if (!OLD_HOSTS.includes(url.hostname)) return text(404, 'Not found.')

  const file = hostFile(request.url, site)
  const redirect = file ? null : hostRedirect(request.url, site)
  if (redirect) return redirectResponse(redirect)

  const path = url.pathname
  const fixed = !file && isFixedPath(path)
  const underBase = path === site.base || path.startsWith(`${site.base}/`)
  const target = file ?? (fixed ? `${site.base}${path}` : underBase ? path : null)
  if (target === null) return text(404, 'Not found.')
  const req = upstreamRequest(request, target, upstream)
  if (!req) return text(404, 'Not found.')
  const res = await upstreamFetch(req)
  // a file answers as the Functions' asset did, with the CORS header; the site under the base passes as it is
  return file || fixed ? fileResponse(res) : res
}

export default {
  fetch(request: Request, env: OldHostsEnv): Promise<Response> {
    return handle(request, env, (r) => fetch(r))
  },
}
