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
  noindexFromEnv,
  otherProductionOrigins,
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

/** Pages' asset server for UPLOAD: a file, `/x` as x.html or x/index.html, else the 404 page with a 404. */
function serveStatic(path: string): Response {
  const p = decodeURIComponent(path)
  for (const f of p === '/' ? ['/index.html'] : [p, `${p}.html`, `${p}/index.html`]) {
    const body = UPLOAD[f]
    if (body !== undefined) return new Response(body, { headers: { 'x-robots-tag': 'noindex' } })
  }
  return new Response(p.startsWith('/run/') ? UPLOAD['/run/404.html'] : UPLOAD['/404.html'], { status: 404 })
}

/** One request through the Function of `site`: status, Location and body. */
async function request(
  url: string,
  site: SiteConfig,
): Promise<{ status: number; location: string | null; body: string }> {
  const ASSETS = { fetch: async (req: Request) => serveStatic(new URL(req.url).pathname) }
  const next = async () => serveStatic(new URL(url).pathname)
  const res = await answer({ request: new Request(url), next, env: { ASSETS } }, site)
  return { status: res.status, location: res.headers.get('location'), body: await res.text() }
}

const shown = (r: { status: number; location: string | null; body: string }): string =>
  r.location ? `${r.status} ${r.location}` : `${r.status} ${r.body}`

describe('PAGES_SERVE_ORIGIN', () => {
  it('is an https origin of a host of the Pages project, or nothing', () => {
    expect(serveOriginFromEnv({})).toBeNull()
    expect(serveOriginFromEnv({ PAGES_SERVE_ORIGIN: ' ' })).toBeNull()
    expect(serveOriginFromEnv({ PAGES_SERVE_ORIGIN: MODULES })).toBe(MODULES)
    expect(serveOriginFromEnv({ PAGES_SERVE_ORIGIN: `${MODULES}/` })).toBe(MODULES)
    expect(serveOriginFromEnv({ PAGES_SERVE_ORIGIN: TEMPLATES })).toBe(TEMPLATES)
    for (const bad of [
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
      ['/index.html', '200 main home', `302 ${MODULES}/run/templates`],
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
      // the catalog's robots.txt first; in a noindex build it is the same text as the root one
      ['/robots.txt', UPLOAD['/run/robots.txt'] as string],
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
    for (const path of ['//evil.example/x', '/%5Cevil.example', '/a%0d%0aSet-Cookie:x'])
      expect(hostServe(`${MODULES}${path}`, SERVED), path).toBeNull()
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
    expect(error.mock.calls.flat().join('\n')).toContain('PAGES_SERVE_ORIGIN must be a host of the Pages project')
    // the owner's variables
    process.env.PAGES_SERVE_ORIGIN = MODULES
    expect(pagesSite(ctx([]))).toBe(0)
    expect(readFileSync(join(tmp, 'functions', 'site.ts'), 'utf8')).toBe(siteModule(SERVED))
  })
})
