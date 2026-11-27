// The merged site served on modules.openmercato.com before the www switch (owner's decision of 26 Nov 2026,
// PAGES_SERVE_ORIGIN, docs/RUNBOOK.md, Main site on modules.openmercato.com): the Functions on the hosts of the Pages
// project against a small upload, with the variable set and unset.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answer } from '../../functions/_middleware.ts'
import pagesSite from '../../lib/commands/pages-site.ts'
import {
  DEFAULT_SITE,
  hostRedirect,
  hostServe,
  mergedPagesRoutes,
  noindexFromEnv,
  oldPagePath,
  otherProductionOrigins,
  routesLimitProblem,
  SECURITY_HEADERS,
  SERVE_REDIRECT_CACHE,
  serveOriginFromEnv,
  servingOrigins,
  siteModule,
  type SiteConfig,
} from '../../lib/core/site-host.ts'
import { analyticsFromEnv } from '../../www/src/lib/analytics.ts'
import { hereScript } from '../../site/src/lib/here.ts'

const MODULES = 'https://modules.openmercato.com'
const TEMPLATES = 'https://templates.openmercato.com'
const WWW = 'https://www.openmercato.com'
const PREVIEW = 'https://www-preview.open-mercato-modules.pages.dev'

/** The production config of the owner's variables, as `yarn om pages-site` writes it into functions/site.ts. */
const SERVED: SiteConfig = { origin: WWW, base: '/run', home: '/modules', merged: true, serve: MODULES }
/** The same without PAGES_SERVE_ORIGIN: the plan after the www switch. */
const MERGED: SiteConfig = { origin: WWW, base: '/run', home: '/modules', merged: true }

/**
 * A small merged upload: the main site at the root (with a page `/about` that the catalog also had at the root), the
 * catalog under /run, the fixed root copies. Values are the bodies.
 */
const UPLOAD: Record<string, string> = {
  '/index.html': 'main home',
  '/404.html': 'main 404',
  '/hubspot-alternative.html': 'main landing',
  '/blog.html': 'main blog',
  '/case-studies/acme.html': 'main case study',
  '/about.html': 'main about',
  '/media/hero.png': 'main image',
  '/robots.txt': 'User-agent: *\nDisallow: /\n',
  '/sitemap-index.xml': 'main sitemap index',
  '/picker.json': '{"picker":1}',
  '/modules.json': '{"modules":1}',
  '/templates.json': '{"templates":1}',
  '/schema/modules-1.json': '{"$id":"https://modules.openmercato.com/schema/modules-1.json"}',
  '/run/modules.html': 'catalog home',
  '/run/modules.json': '{"modules":1}',
  '/run/templates.html': 'catalog templates',
  '/run/compat.html': 'catalog compat',
  '/run/submit.html': 'catalog submit',
  '/run/about.html': 'catalog about',
  '/run/m/@x/y.html': 'catalog module',
  '/run/m/@x/y.md': '# y\n',
  '/run/badge/@x/y.svg': '<svg/>',
  '/run/llms.txt': '# Open Mercato Modules\n',
  '/run/robots.txt': 'User-agent: *\nDisallow: /\n',
  '/run/404.html': 'catalog 404',
}

/** Static rules of the upload's _redirects, as the fake asset server applies them before any file. */
const REDIRECTS: Record<string, { to: string; status: number }> = {
  '/sitemap.xml': { to: '/sitemap-index.xml', status: 301 },
  '/docs/intro': { to: 'https://docs.openmercato.com/intro', status: 301 },
  '/run': { to: '/run/modules', status: 302 },
}

/**
 * Pages' asset server for UPLOAD, closer to the real one: a _redirects rule first, then a file, `/x` as x.html or
 * x/index.html, `/x.html` and `/x/` with a 308 to `/x` where x.html exists, else the 404 page with a 404. A HEAD
 * request gets the same status and headers without a body.
 */
function serveStatic(path: string, method = 'GET'): Response {
  const p = decodeURIComponent(path)
  const body = (text: string | null): string | null => (method === 'HEAD' ? null : text)
  const rule = REDIRECTS[p]
  if (rule) return new Response(null, { status: rule.status, headers: { location: rule.to } })
  const page = p.endsWith('.html') ? p.slice(0, -5) : p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : null
  if (page !== null && UPLOAD[`${page}.html`] !== undefined) {
    const to = page === '/index' ? '/' : page.replace(/\/index$/, '')
    return new Response(null, { status: 308, headers: { location: encodeURI(to).replace(/@/g, '%40') } })
  }
  for (const f of p === '/' ? ['/index.html'] : [p, `${p}.html`, `${p}/index.html`]) {
    const text = UPLOAD[f]
    if (text !== undefined) return new Response(body(text), { headers: { 'x-robots-tag': 'noindex' } })
  }
  return new Response(body(p.startsWith('/run/') ? UPLOAD['/run/404.html']! : UPLOAD['/404.html']!), { status: 404 })
}

/** One request through the Function of `site`: status, Location and body (HEAD: an empty body), and the headers. */
async function request(
  url: string,
  site: SiteConfig,
  method = 'GET',
): Promise<{ status: number; location: string | null; body: string; headers: Headers }> {
  const ASSETS = { fetch: async (req: Request) => serveStatic(new URL(req.url).pathname, req.method) }
  const next = async () => serveStatic(new URL(url).pathname, method)
  const res = await answer({ request: new Request(url, { method }), next, env: { ASSETS } }, site)
  return { status: res.status, location: res.headers.get('location'), body: await res.text(), headers: res.headers }
}

const shown = (r: { status: number; location: string | null; body: string }): string =>
  r.location ? `${r.status} ${r.location}` : `${r.status} ${r.body}`

describe('PAGES_SERVE_ORIGIN', () => {
  it('is an https origin of a host of the Pages project, or nothing', () => {
    expect(serveOriginFromEnv({})).toBeNull()
    expect(serveOriginFromEnv({ PAGES_SERVE_ORIGIN: ' ' })).toBeNull()
    expect(serveOriginFromEnv({ PAGES_SERVE_ORIGIN: MODULES })).toBe(MODULES)
    expect(serveOriginFromEnv({ PAGES_SERVE_ORIGIN: `${MODULES}/` })).toBe(MODULES)
    for (const bad of [
      // a cached 301 of every old address to another host than the one it came from
      TEMPLATES,
      'http://modules.openmercato.com',
      `${MODULES}/run`,
      `${MODULES}/?x=1`,
      `${MODULES}#x`,
      WWW,
      PREVIEW,
      'modules.openmercato.com',
    ])
      expect(() => serveOriginFromEnv({ PAGES_SERVE_ORIGIN: bad }), bad).toThrow(/PAGES_SERVE_ORIGIN/)
  })

  it('turns noindex on, and with it Google Analytics off (decision 1a)', () => {
    expect(noindexFromEnv({})).toBe(false)
    expect(noindexFromEnv({ PAGES_SERVE_ORIGIN: MODULES })).toBe(true)
    expect(noindexFromEnv({ PAGES_NOINDEX: '1' })).toBe(true)
    expect(analyticsFromEnv({ GITHUB_ACTIONS: 'true' })).toBe(true)
    expect(analyticsFromEnv({ GITHUB_ACTIONS: 'true', PAGES_SERVE_ORIGIN: MODULES })).toBe(false)
  })

  it('goes into functions/site.ts only when set', () => {
    expect(siteModule(SERVED)).toContain(
      "export const SITE: SiteConfig = { origin: 'https://www.openmercato.com', base: '/run', home: '/modules', merged: true, serve: 'https://modules.openmercato.com' }",
    )
    expect(siteModule(MERGED)).not.toContain('serve')
    expect(siteModule(DEFAULT_SITE)).not.toContain('serve')
  })
})

describe('the Pages hosts serve the merged layout (variable set)', () => {
  it('main site pages and /run pages answer 200; old catalog pages a 301 under /run, query kept', async () => {
    const table: [path: string, modules: string, templates: string][] = [
      // the main site, at the root of every Pages host
      ['/', '200 main home', `302 ${MODULES}/run/templates`],
      ['/?utm=x', '200 main home', `302 ${MODULES}/run/templates?utm=x`],
      // Pages answers /index.html with a 308 to / (the fake asset server does too)
      ['/index.html', '308 /', `302 ${MODULES}/run/templates`],
      ['/hubspot-alternative', '200 main landing', '200 main landing'],
      ['/blog', '200 main blog', '200 main blog'],
      ['/case-studies/acme', '200 main case study', '200 main case study'],
      // a collision: the catalog had /about at the root too, the main site wins
      ['/about', '200 main about', '200 main about'],
      // the catalog under /run
      ['/run/modules', '200 catalog home', '200 catalog home'],
      ['/run/m/@x/y', '200 catalog module', '200 catalog module'],
      // the old catalog page addresses: a 301 to the same path under /run on the serving origin
      ['/m/@x/y', `301 ${MODULES}/run/m/@x/y`, `301 ${MODULES}/run/m/@x/y`],
      ['/m/@x/y?tab=install', `301 ${MODULES}/run/m/@x/y?tab=install`, `301 ${MODULES}/run/m/@x/y?tab=install`],
      ['/templates', `301 ${MODULES}/run/templates`, `301 ${MODULES}/run/templates`],
      ['/compat', `301 ${MODULES}/run/compat`, `301 ${MODULES}/run/compat`],
      ['/submit?npm=@x/y', `301 ${MODULES}/run/submit?npm=@x/y`, `301 ${MODULES}/run/submit?npm=@x/y`],
      // neither has it: the main site's 404, no redirect
      ['/nope', '404 main 404', '404 main 404'],
      ['/m/@x/nope', '404 main 404', '404 main 404'],
    ]
    for (const [path, modules, templates] of table) {
      expect(shown(await request(`${MODULES}${path}`, SERVED)), `modules ${path}`).toBe(modules)
      expect(shown(await request(`${TEMPLATES}${path}`, SERVED)), `templates ${path}`).toBe(templates)
    }
  })

  it('machine-readable files keep answering 200 with the same bytes at their addresses', async () => {
    const table: [path: string, body: string][] = [
      // the catalog's files under /run, served at the old address with no redirect
      ['/llms.txt', UPLOAD['/run/llms.txt'] as string],
      ['/m/@x/y.md', UPLOAD['/run/m/@x/y.md'] as string],
      ['/badge/@x/y.svg', UPLOAD['/run/badge/@x/y.svg'] as string],
      // the main site's robots.txt wins at the root (audit of 27 Nov 2026); in a noindex build the texts are equal
      ['/robots.txt', UPLOAD['/robots.txt'] as string],
      // the fixed root copies: static files, the Function leaves them alone
      ['/picker.json', UPLOAD['/picker.json'] as string],
      ['/modules.json', UPLOAD['/modules.json'] as string],
      ['/templates.json', UPLOAD['/templates.json'] as string],
      ['/schema/modules-1.json', UPLOAD['/schema/modules-1.json'] as string],
      // a file only the main site has: its own
      ['/media/hero.png', UPLOAD['/media/hero.png'] as string],
    ]
    for (const [path, body] of table)
      for (const host of [MODULES, TEMPLATES]) {
        const r = await request(`${host}${path}`, SERVED)
        expect([r.status, r.location, r.body], `${host}${path}`).toEqual([200, null, body])
      }
    // a file nobody has: the 404
    expect((await request(`${MODULES}/m/@x/nope.json`, SERVED)).status).toBe(404)
  })

  it('a 3xx of the catalog probe is a page there; a 304 of the main site passes through', async () => {
    const run = (nextRes: () => Response, assetRes: () => Response, url: string) =>
      answer(
        {
          request: new Request(url),
          next: async () => nextRes(),
          env: { ASSETS: { fetch: async () => assetRes() } },
        },
        SERVED,
      )
    // a 308 of the probe (Pages' answer for a page address with a slash) means the catalog has the page
    const slash = await run(
      () => new Response('main 404', { status: 404 }),
      () => new Response(null, { status: 308, headers: { location: '/run/m/@x/y' } }),
      `${MODULES}/m/@x/y`,
    )
    expect([slash.status, slash.headers.get('location')]).toEqual([301, `${MODULES}/run/m/@x/y`])
    // a conditional request the main site answers with a 304 is its answer, no probe
    let probed = 0
    const fresh = await run(
      () => new Response(null, { status: 304 }),
      () => {
        probed++
        return new Response('x')
      },
      `${MODULES}/blog`,
    )
    expect([fresh.status, probed]).toEqual([304, 0])
    // a 304 of the catalog's file is passed on with the CORS header
    const file = await run(
      () => new Response('main', { status: 200 }),
      () => new Response(null, { status: 304, headers: { etag: '"e1"' } }),
      `${MODULES}/llms.txt`,
    )
    expect([file.status, file.headers.get('access-control-allow-origin')]).toEqual([304, '*'])
  })

  it('never a redirect to SITE_URL, never one off the serving origin, nothing on other hosts', async () => {
    for (const path of ['/', '/m/@x/y', '/templates', '/hubspot-alternative', '/llms.txt'])
      for (const host of [MODULES, TEMPLATES]) {
        const r = await request(`${host}${path}`, SERVED)
        expect(r.location ?? '', `${host}${path}`).not.toContain(WWW)
      }
    // a deployment address, www (after a switch) and a local server: static files only
    for (const host of [PREVIEW, WWW, 'http://127.0.0.1:8788']) {
      expect(hostServe(`${host}/m/@x/y`, SERVED), host).toBeNull()
      expect(shown(await request(`${host}/m/@x/y`, SERVED)), host).toBe('404 main 404')
      expect(shown(await request(`${host}/`, SERVED)), host).toBe('200 main home')
    }
    // paths a redirect must not be built from
    for (const path of ['/%5Cevil.example', '/a%0d%0aSet-Cookie:x'])
      expect(hostServe(`${MODULES}${path}`, SERVED), path).toBeNull()
    // a run of slashes moves to the single-slash path, absolute on the serving origin, never to another host
    expect(hostServe(`${MODULES}//evil.example/x`, SERVED)).toEqual({
      kind: 'redirect',
      redirect: { location: `${MODULES}/evil.example/x`, status: 301 },
    })
    // the steps themselves
    expect(hostServe(`${MODULES}/m/@x/y?q=1`, SERVED)).toEqual({
      kind: 'page',
      probe: '/run/m/@x/y',
      location: `${MODULES}/run/m/@x/y?q=1`,
    })
    expect(hostServe(`${MODULES}/llms.txt`, SERVED)).toEqual({ kind: 'file', file: '/run/llms.txt' })
    expect(hostServe(`${MODULES}/run/modules`, SERVED)).toBeNull()
    expect(hostServe(`${MODULES}/picker.json`, SERVED)).toBeNull()
  })

  it('the page script points links at the serving hosts, without the preview note', () => {
    expect(otherProductionOrigins(SERVED)).toEqual([])
    expect(servingOrigins(SERVED)).toEqual([MODULES, TEMPLATES])
    expect(servingOrigins(MERGED)).toEqual([])
    const js = hereScript(`${WWW}/run`, '/run', otherProductionOrigins(SERVED), servingOrigins(SERVED))
    const run = (origin: string) => {
      const notes = [{ hidden: true }]
      let selected = 0
      const document = {
        querySelectorAll: (sel: string) => {
          if (sel === '[data-preview-note]') return notes
          selected++
          return []
        },
        body: {},
      }
      new Function('location', 'document', 'MutationObserver', js)({ protocol: 'https:', origin }, document, undefined)
      return [notes[0]!.hidden, selected]
    }
    // rewrites (selected) without the note on a serving host; a preview host keeps its note
    expect(run(MODULES)).toEqual([true, 1])
    expect(run(PREVIEW)).toEqual([false, 1])
    // without serving origins the script is the one of every earlier build
    expect(hereScript(`${WWW}/run`, '/run', ['x'], [])).toBe(hereScript(`${WWW}/run`, '/run', ['x']))
  })
})

describe('one hop, bounded and noindex (audit of 27 Nov 2026)', () => {
  it('an old address with a trailing slash, .html, %40 or a run of slashes reaches /run in one 301', async () => {
    const table: [path: string, want: string][] = [
      ['/modules/', `301 ${MODULES}/run/modules`],
      ['/modules.html', `301 ${MODULES}/run/modules`],
      ['/modules/index.html', `301 ${MODULES}/run/modules`],
      ['/modules/?q=crm', `301 ${MODULES}/run/modules?q=crm`],
      ['/m/@x/y/', `301 ${MODULES}/run/m/@x/y`],
      ['/m/%40x/y', `301 ${MODULES}/run/m/@x/y`],
      ['/m/@x/y.html?tab=install', `301 ${MODULES}/run/m/@x/y?tab=install`],
      ['//run/modules', `301 ${MODULES}/run/modules`],
      ['/m//@x/y', `301 ${MODULES}/m/@x/y`],
      // the main site's own pages keep Pages' answer: a 308 to the address without the slash or .html
      ['/about/', '308 /about'],
      ['/blog.html', '308 /blog'],
    ]
    for (const [path, want] of table) {
      const r = await request(`${MODULES}${path}`, SERVED)
      expect(shown(r), path).toBe(want)
      // the target answers 200 (or, for the run of slashes, its single-slash form is one more old address)
      if (r.status === 301 && r.location?.startsWith(`${MODULES}/run/`)) {
        const target = new URL(r.location)
        expect(serveStatic(target.pathname).status, r.location).toBe(200)
        expect(r.location, path).not.toContain('%40')
      }
    }
  })

  it('normalizes an old page path, and keeps the templates root on a run of slashes', async () => {
    const table: [path: string, want: string][] = [
      ['/compat', '/compat'],
      ['/compat/', '/compat'],
      ['/compat.html', '/compat'],
      ['/compat.html/', '/compat'],
      ['/compat/index.html', '/compat'],
      ['/m/%40x/y//', '/m/@x/y'],
      ['/index.html', '/'],
      // a package named like a file keeps its name: only `.html` goes
      ['/m/socket.io', '/m/socket.io'],
    ]
    for (const [path, want] of table) expect(oldPagePath(path), path).toBe(want)
    expect(shown(await request(`${MODULES}/compat.html/`, SERVED))).toBe(`301 ${MODULES}/run/compat`)
    expect(shown(await request(`${TEMPLATES}//`, SERVED))).toBe(`302 ${MODULES}/run/templates`)
    expect(shown(await request(`${TEMPLATES}//?utm=x`, SERVED))).toBe(`302 ${MODULES}/run/templates?utm=x`)
  })

  it('keeps _routes.json of the merged layout within the Pages limits', () => {
    const r = mergedPagesRoutes('/run', ['sitemap-0.xml', 'sitemap-index.xml'])
    expect(r.exclude).toEqual(
      expect.arrayContaining(['/run/*', '/_astro/*', '/media/*', '/files/*', '/og/*', '/robots.txt', '/sitemap-0.xml']),
    )
    expect(routesLimitProblem(r)).toBeNull()
    const many = { ...r, exclude: Array.from({ length: 100 }, (_, i) => `/x${i}`) }
    expect(routesLimitProblem(many)).toBe('101 rules; Pages allows 100')
    const long = { ...r, exclude: [`/${'a'.repeat(100)}`] }
    expect(routesLimitProblem(long)).toBe(`the rule /${'a'.repeat(100)} is longer than 100 characters`)
  })

  it('the redirects a serving host builds are noindex, cached an hour and carry the security headers', async () => {
    for (const url of [`${MODULES}/m/@x/y`, `${TEMPLATES}/`, `${MODULES}//run/modules`]) {
      const r = await request(url, SERVED)
      expect(r.status, url).toBeGreaterThanOrEqual(301)
      expect(r.headers.get('x-robots-tag'), url).toBe('noindex')
      expect(r.headers.get('cache-control'), url).toBe(SERVE_REDIRECT_CACHE)
      expect(r.headers.get('access-control-allow-origin'), url).toBe('*')
      for (const [k, v] of SECURITY_HEADERS) expect(r.headers.get(k), `${url} ${k}`).toBe(v)
    }
    // without the variable (the plan after the switch) the redirect to SITE_URL is as before: no bounded cache
    const after = await request(`${MODULES}/m/@x/y`, MERGED)
    expect([after.status, after.headers.get('cache-control'), after.headers.get('x-robots-tag')]).toEqual([
      302,
      null,
      null,
    ])
  })

  it('HEAD gets the same answer as GET, without a body', async () => {
    for (const path of [
      '/',
      '/m/@x/y',
      '/modules/',
      '/llms.txt',
      '/robots.txt',
      '/run/modules',
      '/nope',
      '/sitemap.xml',
    ])
      for (const host of [MODULES, TEMPLATES]) {
        const get = await request(`${host}${path}`, SERVED)
        const head = await request(`${host}${path}`, SERVED, 'HEAD')
        expect([head.status, head.location], `HEAD ${host}${path}`).toEqual([get.status, get.location])
        expect(head.body, `HEAD ${host}${path}`).toBe('')
      }
  })

  it('a rule of the root _redirects answers before the catalog is asked', async () => {
    let probed = 0
    const ASSETS = {
      fetch: async (req: Request) => {
        probed++
        return serveStatic(new URL(req.url).pathname)
      },
    }
    for (const [path, want] of [
      ['/docs/intro', '301 https://docs.openmercato.com/intro'],
      ['/sitemap.xml', '301 /sitemap-index.xml'],
    ] as const) {
      const res = await answer(
        { request: new Request(`${MODULES}${path}`), next: async () => serveStatic(path), env: { ASSETS } },
        SERVED,
      )
      expect(`${res.status} ${res.headers.get('location')}`, path).toBe(want)
    }
    expect(probed).toBe(0)
  })
})

describe('without the variable (today and after the www switch)', () => {
  it('the Pages hosts redirect pages to SITE_URL as before', async () => {
    expect(hostServe(`${MODULES}/m/@x/y`, MERGED)).toBeNull()
    expect(shown(await request(`${MODULES}/`, MERGED))).toBe(`302 ${WWW}/run/modules`)
    expect(shown(await request(`${MODULES}/m/@x/y?q=1`, MERGED))).toBe(`302 ${WWW}/run/m/@x/y?q=1`)
    expect(shown(await request(`${TEMPLATES}/`, MERGED))).toBe(`302 ${WWW}/run/templates`)
    expect(shown(await request(`${MODULES}/llms.txt`, MERGED))).toBe(`200 ${UPLOAD['/run/llms.txt']}`)
    expect(shown(await request(`${MODULES}/picker.json`, MERGED))).toBe(`200 ${UPLOAD['/picker.json']}`)
    // the root layout of production today: only the templates root moves
    expect(shown(await request(`${TEMPLATES}/`, DEFAULT_SITE))).toBe(`302 ${MODULES}/templates`)
    expect(shown(await request(`${MODULES}/`, DEFAULT_SITE))).toBe('200 main home')
    expect(hostRedirect(`${MODULES}/m/@x/y`, DEFAULT_SITE)).toBeNull()
    // `serve` without the merged layout changes nothing either
    expect(hostServe(`${MODULES}/m/@x/y`, { ...MERGED, merged: false })).toBeNull()
  })
})

describe('yarn om pages-site with PAGES_SERVE_ORIGIN', () => {
  const keys = ['SITE_URL', 'BASE_PATH', 'HOME_PATH', 'PAGES_NOINDEX', 'PAGES_MERGED', 'PAGES_SERVE_ORIGIN'] as const
  let env: Record<string, string | undefined>
  let tmp: string
  beforeEach(() => {
    env = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
    tmp = mkdtempSync(join(tmpdir(), 'om-serve-'))
    mkdirSync(join(tmp, 'functions'))
  })
  afterEach(() => {
    for (const k of keys) {
      if (env[k] === undefined) delete process.env[k]
      else process.env[k] = env[k]
    }
    rmSync(tmp, { recursive: true, force: true })
    vi.restoreAllMocks()
  })
  const ctx = (args: string[]) => ({
    args,
    root: tmp,
    flags: { data: '.data', out: 'out', offline: false, json: false },
  })

  it('writes serve into functions/site.ts with the merged layout, and refuses it without', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const k of keys) delete process.env[k]
    Object.assign(process.env, {
      SITE_URL: WWW,
      BASE_PATH: '/run',
      HOME_PATH: '/modules',
      PAGES_SERVE_ORIGIN: MODULES,
    })
    // the catalog alone on a Pages host is not what this variable is for
    expect(pagesSite(ctx([]))).toBe(2)
    expect(error.mock.calls.flat().join('\n')).toContain('PAGES_SERVE_ORIGIN needs PAGES_MERGED=1')
    // a value that is not a Pages host
    process.env.PAGES_MERGED = '1'
    process.env.PAGES_SERVE_ORIGIN = WWW
    expect(pagesSite(ctx([]))).toBe(2)
    expect(error.mock.calls.flat().join('\n')).toContain('PAGES_SERVE_ORIGIN must be https://modules.openmercato.com')
    // the owner's variables
    process.env.PAGES_SERVE_ORIGIN = MODULES
    expect(pagesSite(ctx([]))).toBe(0)
    expect(readFileSync(join(tmp, 'functions', 'site.ts'), 'utf8')).toBe(siteModule(SERVED))
  })

  it('--settings fails fast on a variable set that makes no layout, naming what goes together', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const k of keys) delete process.env[k]
    // none set: the catalog alone
    expect(pagesSite(ctx(['--settings']))).toBe(0)
    expect(log.mock.calls.flat().join('\n')).toContain('catalog only')
    // the rollback of the old RUNBOOK text: SITE_URL, BASE_PATH and HOME_PATH deleted, PAGES_MERGED left at 1
    Object.assign(process.env, { PAGES_MERGED: '1', PAGES_SERVE_ORIGIN: MODULES })
    expect(pagesSite(ctx(['--settings']))).toBe(2)
    const said = error.mock.calls.flat().join('\n')
    expect(said).toContain('PAGES_MERGED: the merged layout needs the catalog under a base path; BASE_PATH is /')
    expect(said).toContain('A rollback deletes all five')
    // the owner's five variables
    Object.assign(process.env, { SITE_URL: WWW, BASE_PATH: '/run', HOME_PATH: '/modules' })
    expect(pagesSite(ctx(['--settings']))).toBe(0)
    expect(log.mock.calls.flat().join('\n')).toContain(
      'merged at https://www.openmercato.com/run, served at https://modules.openmercato.com, noindex',
    )
    // it writes nothing
    expect(() => readFileSync(join(tmp, 'functions', 'site.ts'), 'utf8')).toThrow()
    expect(pagesSite(ctx(['--settings', '--merge']))).toBe(2)
  })
})
