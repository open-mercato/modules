// The Worker for the old hosts (workers/old-hosts/, spec www site migration Phase 1b) against a fake Pages project:
// every check of docs/RUNBOOK.md (Switch, in order, step 5) and of docs/proxy/check.sh that applies to the old hosts,
// the edge cases of the Functions (test/pages/site-host.test.ts), and the same answer as functions/_middleware.ts
// path by path. Never the network.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { answer } from '../../functions/_middleware.ts'
import { MOVED_STATUS, siteConfig } from '../../lib/core/site-host.ts'
import worker, {
  DEFAULTS,
  OLD_HOSTS,
  handle,
  oldHostsConfig,
  upstreamRequest,
  type OldHostsEnv,
} from '../../workers/old-hosts/worker.ts'
import { ROOT } from '../emit/helpers.ts'

const OLD = 'https://modules.openmercato.com'
const TPL = 'https://templates.openmercato.com'
const UPSTREAM = 'https://open-mercato-modules.pages.dev'
const RUN = 'https://www.openmercato.com/run'
const PKG = '@open-mercato/gateway-tpay'
/** The layout of the `pages` build after the move, as functions/site.ts holds it then. */
const WWW = siteConfig('https://www.openmercato.com', '/run', '/modules')

const SCHEMA = '{\n  "$id": "https://modules.openmercato.com/schema/modules-1.json",\n  "type": "object"\n}\n'
const CANONICAL = `<link rel="canonical" href="${RUN}/modules">`

/** The files of the nested build, by path of the upload. The root copies equal the site's, as the layout check proves. */
const SITE: Record<string, string> = {
  '/run/modules': `<html><head>${CANONICAL}</head></html>`,
  [`/run/m/${PKG}`]: '<html>gateway-tpay</html>',
  '/run/submit': '<html>submit</html>',
  '/run/compat': '<html>compat</html>',
  '/run/modules.json': '{"entries":[]}',
  '/run/templates.json': '{"templates":[]}',
  '/run/picker.json': '{"picker":[]}',
  '/run/built-in.json': '{"builtIn":[]}',
  '/run/llms.txt': '# Open Mercato Modules\n',
  '/run/robots.txt': 'User-agent: *\nAllow: /\n',
  '/run/raw/modules.md': '# Modules\n',
  [`/run/m/${PKG}.md`]: '# gateway-tpay\n',
  [`/run/badge/${PKG}.svg`]: '<svg/>',
  '/run/schema/modules-1.json': SCHEMA,
}
const ROOT_COPIES: Record<string, string> = {
  '/modules.json': SITE['/run/modules.json']!,
  '/templates.json': SITE['/run/templates.json']!,
  '/picker.json': SITE['/run/picker.json']!,
  '/schema/modules-1.json': SCHEMA,
}

const TYPES: [RegExp, string][] = [
  [/\.json$/, 'application/json'],
  [/\.md$/, 'text/markdown; charset=utf-8'],
  [/\.txt$/, 'text/plain; charset=utf-8'],
  [/\.svg$/, 'image/svg+xml'],
]

/**
 * A fake of the Pages project's static layer: dist/_redirects (`/run` and `/run/` to the home page, query kept), the
 * files with `Access-Control-Allow-Origin: *`, an ETag and a 304 for a matching If-None-Match, and a 404 page.
 */
function pages(files: Record<string, string>, seen: Request[] = []) {
  return async (req: Request): Promise<Response> => {
    seen.push(req)
    const u = new URL(req.url)
    if (u.pathname === '/run' || u.pathname === '/run/')
      return new Response(null, { status: 302, headers: { Location: `/run/modules${u.search}` } })
    const body = files[u.pathname]
    if (body === undefined)
      return new Response('<h1>Not found</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } })
    const headers = {
      'Content-Type': TYPES.find(([re]) => re.test(u.pathname))?.[1] ?? 'text/html; charset=utf-8',
      ETag: '"e1"',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    }
    if (req.headers.get('if-none-match') === '"e1"') return new Response(null, { status: 304, headers })
    return new Response(req.method === 'HEAD' ? null : body, { headers })
  }
}

/** The Worker with the settings of wrangler.toml and the fake upstream; `seen` holds every upstream request. */
function setup(env: OldHostsEnv = { ...DEFAULTS }) {
  const seen: Request[] = []
  const up = pages(SITE, seen)
  const get = (u: string, init?: RequestInit): Promise<Response> => handle(new Request(u, init), env, up)
  return { get, seen }
}

const where = (r: Request): string => {
  const u = new URL(r.url)
  return `${r.method} ${u.origin}${u.pathname}${u.search}`
}

describe('the Worker for the old hosts: RUNBOOK step 5', () => {
  it('sends the pages to www.openmercato.com/run with a 302, query kept', async () => {
    const { get, seen } = setup()
    for (const [u, location] of [
      [`${OLD}/`, `${RUN}/modules`],
      [`${OLD}/m/${PKG}`, `${RUN}/m/${PKG}`],
      [`${OLD}/submit?npm=${PKG}`, `${RUN}/submit?npm=${PKG}`],
      [`${OLD}/sitemap-index.xml`, `${RUN}/sitemap-index.xml`],
      [`${TPL}/`, `${RUN}/templates`],
    ] as const) {
      const res = await get(u, { method: 'HEAD' })
      expect([res.status, res.headers.get('location')], u).toEqual([302, location])
    }
    expect(MOVED_STATUS).toBe(302)
    // a redirect fetches nothing
    expect(seen).toEqual([])
  })

  it('puts the CORS header on the 302, so a cross-origin fetch can follow it', async () => {
    const { get } = setup()
    const res = await get(`${OLD}/compat`, { headers: { Origin: 'https://example.com' } })
    expect([res.status, res.headers.get('access-control-allow-origin')]).toEqual([302, '*'])
    expect(await res.text()).toBe('')
  })

  it('serves the files itself: 200, no redirect, the same bytes as under /run of the upstream', async () => {
    const { get, seen } = setup()
    for (const p of ['llms.txt', 'raw/modules.md', `m/${PKG}.md`, `badge/${PKG}.svg`, 'built-in.json', 'robots.txt']) {
      const res = await get(`${OLD}/${p}`)
      expect([res.status, res.headers.get('location')], p).toEqual([200, null])
      expect(await res.text(), p).toBe(SITE[`/run/${p}`])
      expect(res.headers.get('access-control-allow-origin'), p).toBe('*')
    }
    expect(seen.map(where)).toEqual(
      ['llms.txt', 'raw/modules.md', `m/${PKG}.md`, `badge/${PKG}.svg`, 'built-in.json', 'robots.txt'].map(
        (p) => `GET ${UPSTREAM}/run/${p}`,
      ),
    )
    // `diff` of the old host's llms.txt and www's /run/llms.txt: the same bytes
    const old = await (await get(`${OLD}/llms.txt`)).text()
    const www = await (await pages(SITE)(new Request(`${RUN}/llms.txt`))).text()
    expect(old).toBe(www)
  })

  it('serves the fixed addresses from /run of the upstream: schema with its $id, templates, picker, modules', async () => {
    const { get, seen } = setup()
    const schema = await get(`${OLD}/schema/modules-1.json`)
    expect([schema.status, schema.headers.get('location')]).toEqual([200, null])
    expect(await schema.text()).toContain('"$id": "https://modules.openmercato.com/schema/modules-1.json"')
    for (const host of [OLD, TPL])
      for (const f of ['templates.json', 'picker.json', 'modules.json']) {
        const res = await get(`${host}/${f}`, { method: 'HEAD' })
        expect([res.status, res.headers.get('location')], `${host}/${f}`).toEqual([200, null])
        expect(res.headers.get('access-control-allow-origin'), f).toBe('*')
      }
    expect(seen.map(where)[0]).toBe(`GET ${UPSTREAM}/run/schema/modules-1.json`)
    expect(seen.map(where)[1]).toBe(`HEAD ${UPSTREAM}/run/templates.json`)
    // the query of a fixed address goes along, as to the static file today
    await get(`${OLD}/modules.json?x=1`)
    expect(seen.map(where).at(-1)).toBe(`GET ${UPSTREAM}/run/modules.json?x=1`)
  })
})

describe('the Worker for the old hosts: docs/proxy/check.sh on an old host', () => {
  it('passes /run through to the upstream: its redirects, pages, data, CORS and 404 as they are', async () => {
    const { get, seen } = setup()
    for (const [p, location] of [
      ['/run', '/run/modules'],
      ['/run/', '/run/modules'],
      ['/run?utm_source=check', '/run/modules?utm_source=check'],
    ] as const) {
      const res = await get(`${OLD}${p}`)
      expect([res.status, res.headers.get('location')], p).toEqual([302, location])
    }
    // the redirect of the base is the upstream's, not followed by the Worker
    for (const r of seen.slice(0, 3)) expect(r.redirect).toBe('manual')
    for (const [p, type] of [
      ['/run/modules', 'text/html'],
      ['/run/modules.json', 'application/json'],
      [`/run/m/${PKG}`, 'text/html'],
      [`/run/submit?npm=${PKG}`, 'text/html'],
    ] as const) {
      const res = await get(`${OLD}${p}`)
      expect(res.status, p).toBe(200)
      expect(res.headers.get('content-type'), p).toMatch(new RegExp(`^${type}`))
    }
    const json = await get(`${OLD}/run/modules.json`)
    expect(json.headers.get('access-control-allow-origin')).toBe('*')
    expect(await json.text()).toContain('"entries"')
    expect(await (await get(`${OLD}/run/modules`)).text()).toContain(CANONICAL)
    expect((await get(`${OLD}/run/no-such-page-1`)).status).toBe(404)
    expect(seen.map(where)).toContain(`GET ${UPSTREAM}/run/submit?npm=${PKG}`)
  })
})

describe('the Worker for the old hosts: edge cases of the Functions', () => {
  it('keeps the method, the query and the conditional headers of a file request; a 304 keeps the CORS header', async () => {
    const { get, seen } = setup()
    const head = await get(`${OLD}/llms.txt?v=2`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    const fresh = await get(`${OLD}/llms.txt`, { headers: { 'If-None-Match': '"e1"' } })
    expect([fresh.status, fresh.headers.get('access-control-allow-origin'), fresh.headers.get('etag')]).toEqual([
      304,
      '*',
      '"e1"',
    ])
    expect(seen.map(where)).toEqual([`HEAD ${UPSTREAM}/run/llms.txt?v=2`, `GET ${UPSTREAM}/run/llms.txt`])
    expect(seen[1]!.headers.get('if-none-match')).toBe('"e1"')
  })

  it('answers a missing file with the upstream 404, not a redirect', async () => {
    const { get } = setup()
    const res = await get(`${OLD}/m/@x/nope.json`)
    expect([res.status, res.headers.get('location')]).toEqual([404, null])
  })

  it('sends neither Cookie nor the hop headers upstream, and never follows a redirect', async () => {
    const { get, seen } = setup()
    await get(`${OLD}/llms.txt`, { headers: { Cookie: 'a=b', Connection: 'keep-alive', 'Accept-Encoding': 'gzip' } })
    const r = seen[0]!
    expect(r.headers.get('cookie')).toBeNull()
    expect(r.headers.get('connection')).toBeNull()
    expect(r.headers.get('accept-encoding')).toBe('gzip')
    expect(r.redirect).toBe('manual')
  })

  it('resolves `..` before the rule: the file stays under /run', async () => {
    const { get, seen } = setup()
    expect((await get(`${OLD}/a/../../llms.txt`)).status).toBe(200)
    expect((await get(`${OLD}/run/../llms.txt`)).status).toBe(200)
    expect(seen.map(where)).toEqual([`GET ${UPSTREAM}/run/llms.txt`, `GET ${UPSTREAM}/run/llms.txt`])
  })

  it('moves /index.html like the root, and the home path next to the fixed modules.json', async () => {
    const { get } = setup()
    expect((await get(`${OLD}/index.html`)).headers.get('location')).toBe(`${RUN}/modules`)
    expect((await get(`${TPL}/index.html?a=1`)).headers.get('location')).toBe(`${RUN}/templates?a=1`)
    expect((await get(`${OLD}/modules`)).headers.get('location')).toBe(`${RUN}/modules`)
    expect((await get(`${OLD}/templates`)).headers.get('location')).toBe(`${RUN}/templates`)
    expect((await get(`${TPL}/t/open-mercato/x`)).headers.get('location')).toBe(`${RUN}/t/open-mercato/x`)
  })

  it('is never an open redirect: `//`, a backslash or a control character answers 404 and fetches nothing', async () => {
    const { get, seen } = setup()
    for (const u of [
      `${OLD}//evil.example`,
      `${OLD}//evil.example/a.json`,
      `${OLD}/\\evil.example`,
      `${OLD}/%5Cevil.example/a.json`,
      `${OLD}/a%0d%0aLocation:%20https://evil.example`,
      `${OLD}/a%00b.json`,
      `${OLD}/a%7Fb`,
    ]) {
      const res = await get(u)
      expect([res.status, res.headers.get('location')], u).toEqual([404, null])
    }
    expect(seen).toEqual([])
  })

  it('never loops: every target is on www under /run, and a path under /run is never redirected', async () => {
    const { get } = setup()
    for (const p of ['/', '/m/@x/y', '/a/b/c?d=e', '/runx', '/modules', '/sitemap.xml', '/%2F%2Fevil.example']) {
      const loc = (await get(`${OLD}${p}`)).headers.get('location')
      expect(loc, p).not.toBeNull()
      const target = new URL(loc!)
      expect(target.origin, p).toBe('https://www.openmercato.com')
      expect(target.pathname.startsWith('/run/'), p).toBe(true)
    }
    for (const p of ['/run', '/run/m/x', '/run/llms.txt'])
      expect((await get(`${OLD}${p}`)).headers.get('location') ?? '', p).not.toMatch(/^https:/)
  })

  it('answers no other host: www, a pages.dev address or localhost get a 404 and fetch nothing', async () => {
    const { get, seen } = setup()
    for (const u of ['https://www.openmercato.com/m/x', `${UPSTREAM}/llms.txt`, 'http://localhost:8787/'])
      expect((await get(u)).status, u).toBe(404)
    expect(seen).toEqual([])
    expect(OLD_HOSTS).toEqual(['modules.openmercato.com', 'templates.openmercato.com'])
  })
})

describe('the Worker for the old hosts: settings', () => {
  it('takes an https origin as UPSTREAM, never an old host or www, and a nested site', () => {
    expect(oldHostsConfig({})).toEqual({ site: WWW, upstream: UPSTREAM })
    expect(oldHostsConfig({ ...DEFAULTS, UPSTREAM: `${UPSTREAM}/` })).toEqual({ site: WWW, upstream: UPSTREAM })
    for (const bad of [
      'http://open-mercato-modules.pages.dev',
      `${UPSTREAM}/run`,
      `${UPSTREAM}/?x=1`,
      'https://user:pw@open-mercato-modules.pages.dev',
      'https://modules.openmercato.com',
      'https://templates.openmercato.com',
      'https://www.openmercato.com',
      'not a url',
    ])
      expect(typeof oldHostsConfig({ ...DEFAULTS, UPSTREAM: bad }), bad).toBe('string')
    expect(typeof oldHostsConfig({ ...DEFAULTS, BASE_PATH: '/' })).toBe('string')
    expect(typeof oldHostsConfig({ ...DEFAULTS, SITE_URL: 'https://modules.openmercato.com' })).toBe('string')
    expect(typeof oldHostsConfig({ ...DEFAULTS, HOME_PATH: '/a/b' })).toBe('string')
  })

  it('answers a 502 with the reason and fetches nothing when a setting is wrong', async () => {
    const { get, seen } = setup({ ...DEFAULTS, UPSTREAM: 'https://www.openmercato.com' })
    const res = await get(`${OLD}/llms.txt`)
    expect(res.status).toBe(502)
    expect(await res.text()).toContain("UPSTREAM https://www.openmercato.com is the site's host")
    expect(seen).toEqual([])
  })

  it('builds the upstream request on the upstream origin only', () => {
    const r = upstreamRequest(new Request(`${OLD}/llms.txt?a=1`), '//evil.example/x', UPSTREAM)
    expect(r && new URL(r.url).origin).toBe(UPSTREAM)
    expect(r && new URL(r.url).search).toBe('?a=1')
  })

  it('wrangler.toml: the two routes, no workers.dev address, the pages.dev upstream and the site after the move', () => {
    const toml = readFileSync(join(ROOT, 'workers', 'old-hosts', 'wrangler.toml'), 'utf8')
    expect(toml).toMatch(/^main = "worker\.ts"$/m)
    expect(toml).toMatch(/^workers_dev = false$/m)
    expect(toml).toContain('pattern = "modules.openmercato.com/*"')
    expect(toml).toContain('pattern = "templates.openmercato.com/*"')
    expect(toml.match(/^pattern = /gm)).toHaveLength(2)
    for (const [k, v] of Object.entries(DEFAULTS)) expect(toml).toMatch(new RegExp(`^${k} = "${v}"$`, 'm'))
  })

  it('the default export fetches through the global fetch', async () => {
    const res = await worker.fetch(new Request(`${OLD}/m/x`), { ...DEFAULTS })
    expect([res.status, res.headers.get('location')]).toEqual([302, `${RUN}/m/x`])
  })
})

describe('the Worker answers as the Functions do today, path by path', () => {
  /** What a request gets: status, Location, CORS, type, ETag and body. */
  const shape = async (res: Response) => [
    res.status,
    res.headers.get('location'),
    res.headers.get('access-control-allow-origin'),
    res.headers.get('content-type'),
    res.headers.get('etag'),
    await res.text(),
  ]

  /** The Pages project today: Functions on every path but /run and the fixed ones, the static files with root copies. */
  const functions = (u: string, init?: RequestInit): Promise<Response> => {
    const request = new Request(u, init)
    const store = pages({ ...SITE, ...ROOT_COPIES })
    const path = new URL(u).pathname
    // dist/_routes.json: the base and the fixed addresses never reach the Function
    const excluded =
      path === '/run' || path.startsWith('/run/') || path.startsWith('/schema/') || ROOT_COPIES[path] !== undefined
    if (excluded) return store(request)
    return Promise.resolve(answer({ request, next: () => store(request), env: { ASSETS: { fetch: store } } }, WWW))
  }

  it('gives the same answer on both hosts for every kind of path', async () => {
    const { get } = setup()
    const paths = [
      '/',
      '/index.html',
      '/?q=ksef',
      `/m/${PKG}`,
      `/submit?npm=${PKG}`,
      '/compat',
      '/templates',
      '/modules',
      '/llms.txt',
      '/llms.txt?v=1',
      '/raw/modules.md',
      `/m/${PKG}.md`,
      `/badge/${PKG}.svg`,
      '/built-in.json',
      '/robots.txt',
      '/m/@x/nope.json',
      '/sitemap-index.xml',
      '/sitemap.xml',
      '/schema/modules-1.json',
      '/templates.json',
      '/picker.json',
      '/modules.json',
      '/modules.json?x=1',
      '/run',
      '/run/',
      '/run?utm_source=check',
      '/run/modules',
      '/run/modules.json',
      `/run/m/${PKG}`,
      '/run/no-such-page',
    ]
    for (const host of [OLD, TPL])
      for (const p of paths)
        for (const init of [undefined, { method: 'HEAD' }, { headers: { 'If-None-Match': '"e1"' } }]) {
          const label = `${host}${p} ${JSON.stringify(init ?? {})}`
          expect(await shape(await get(`${host}${p}`, init)), label).toEqual(
            await shape(await functions(`${host}${p}`, init)),
          )
        }
  })

  it('answers an unsafe path with a 404 as the static files do, without a request upstream', async () => {
    const { get, seen } = setup()
    for (const p of ['//evil.example', '/%5Cevil.example/a.json', '/a%00b.json']) {
      expect((await get(`${OLD}${p}`)).status, p).toBe(404)
      expect((await functions(`${OLD}${p}`)).status, p).toBe(404)
    }
    expect(seen).toEqual([])
  })
})
