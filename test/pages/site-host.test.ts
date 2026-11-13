// Move under www.openmercato.com/modules (decision of 13 Nov, lib/core/site-host.ts): the default build stays as it is
// (site at the domain root, Functions on `/` only), and a build under a base path lays dist out for the proxy of the
// main site, redirects the old addresses of the Pages hosts to the site, and keeps the schema addresses fixed.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '../../functions/_middleware.ts'
import { SITE } from '../../functions/site.ts'
import pagesSite from '../../lib/commands/pages-site.ts'
import { schemaUrl, SCHEMA_ORIGIN } from '../../lib/core/home.ts'
import {
  DEFAULT_SITE,
  FIXED_ROOT_FILES,
  hostRedirect,
  isFixedPath,
  isNested,
  isPreviewHost,
  MOVED_STATUS,
  otherProductionOrigins,
  pagesRedirects,
  pagesRoutes,
  redirectResponse,
  siteConfig,
  siteDir,
  siteModule,
  siteRoot,
  type SiteConfig,
} from '../../lib/core/site-host.ts'
import { templatesRedirect } from '../../lib/core/templates-host.ts'
import {
  checkPagesLayout,
  finishNestedLayout,
  htmlRefs,
  linkProblem,
  pagesLayout,
} from '../../lib/emit/pages-layout.ts'
import { PUBLISHED_SCHEMAS } from '../../lib/schema/json-schema.ts'
import { dataHref } from '../../site/src/lib/url.ts'
import { siteFolder } from '../e2e/serve.ts'
import { ROOT } from '../emit/helpers.ts'

const WWW: SiteConfig = { origin: 'https://www.openmercato.com', base: '/modules' }
const read = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8')

describe('siteConfig', () => {
  it('normalizes SITE_URL to its origin and BASE_PATH to one leading slash', () => {
    expect(siteConfig('https://modules.openmercato.com', '/')).toEqual(DEFAULT_SITE)
    expect(siteConfig('https://www.openmercato.com/', 'modules')).toEqual(WWW)
    expect(siteConfig('https://www.openmercato.com/ignored', '//modules//')).toEqual(WWW)
    expect(siteConfig('https://x.example', '')).toEqual({ origin: 'https://x.example', base: '/' })
    expect(siteConfig('https://x.example', '/a/b-1')).toEqual({ origin: 'https://x.example', base: '/a/b-1' })
  })

  it('refuses a base that is not plain path segments and a URL that is not http(s)', () => {
    for (const b of ['/../x', '/a/../b', '/a b', '/a?x', '/a#b', '/.hidden', '/a\\b', '/*'])
      expect(() => siteConfig('https://x.example', b), b).toThrow(/BASE_PATH/)
    expect(() => siteConfig('ftp://x.example', '/')).toThrow(/SITE_URL/)
    expect(() => siteConfig('not a url', '/')).toThrow()
  })

  it('names the layout, the site root and its folder in dist', () => {
    expect(isNested(DEFAULT_SITE)).toBe(false)
    expect(siteRoot(DEFAULT_SITE)).toBe('https://modules.openmercato.com')
    expect(siteDir(DEFAULT_SITE)).toBe('')
    expect(isNested(WWW)).toBe(true)
    expect(siteRoot(WWW)).toBe('https://www.openmercato.com/modules')
    expect(siteDir(WWW)).toBe('modules')
  })
})

describe('Pages config files', () => {
  it('at the domain root they are exactly the files in site/public', () => {
    expect(pagesRoutes('/')).toEqual(JSON.parse(read('site', 'public', '_routes.json')))
    expect(pagesRedirects('/')).toBe(read('site', 'public', '_redirects'))
  })

  it('under a base, Functions run on every path but the site and the fixed addresses', () => {
    const r = pagesRoutes('/modules')
    expect(r).toEqual({
      version: 1,
      include: ['/*'],
      exclude: ['/modules', '/modules/*', '/schema/*', '/templates.json', '/picker.json'],
    })
    // Pages limits: at least one include, at most 100 rules, each at most 100 characters
    expect(r.include.length).toBeGreaterThan(0)
    expect(r.include.length + r.exclude.length).toBeLessThanOrEqual(100)
    for (const rule of [...r.include, ...r.exclude]) expect(rule.length).toBeLessThanOrEqual(100)
  })

  it('under a base, /sitemap.xml of the site moves to its sitemap index', () => {
    const rules = pagesRedirects('/modules')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
    expect(rules).toEqual(['/modules/sitemap.xml /modules/sitemap-index.xml 301'])
  })
})

describe('hostRedirect at the domain root (the default)', () => {
  it('behaves as templatesRedirect did: the templates root only, with a 302', () => {
    expect(hostRedirect('https://templates.openmercato.com/?utm_source=x', DEFAULT_SITE)).toEqual({
      location: 'https://modules.openmercato.com/templates?utm_source=x',
      status: 302,
    })
    for (const u of [
      'https://modules.openmercato.com/',
      'https://modules.openmercato.com/m/@open-mercato/gateway-tpay',
      'https://modules.openmercato.com/templates',
      'https://templates.openmercato.com/m/@open-mercato/gateway-tpay',
      'https://open-mercato-modules.pages.dev/',
      'https://modules.openmercato.com//evil.example',
    ]) {
      expect(hostRedirect(u, DEFAULT_SITE), u).toBeNull()
      expect(templatesRedirect(u), u).toBeNull()
    }
  })

  it('the committed functions/site.ts is the default, as `yarn om pages-site` writes it', () => {
    expect(SITE).toEqual(DEFAULT_SITE)
    expect(read('functions', 'site.ts')).toBe(siteModule(DEFAULT_SITE))
  })

  it('the middleware answers the templates root and hands everything else on', async () => {
    let passed = 0
    const next = async (): Promise<Response> => {
      passed++
      return new Response('static')
    }
    const moved = await onRequest({ request: new Request('https://templates.openmercato.com/'), next })
    expect([moved.status, moved.headers.get('location')]).toEqual([302, 'https://modules.openmercato.com/templates'])
    expect(moved.headers.get('access-control-allow-origin')).toBe('*')
    const served = await onRequest({ request: new Request('https://modules.openmercato.com/m/x'), next })
    expect(await served.text()).toBe('static')
    expect(passed).toBe(1)
  })
})

describe('hostRedirect under a base path', () => {
  const at = (u: string): string | null => hostRedirect(u, WWW)?.location ?? null

  it('answers an old data address with a 302 a cross-origin fetch can follow (CORS on the redirect)', async () => {
    // Pages gives static files `Access-Control-Allow-Origin: *`; a browser checks CORS on the 302 itself
    for (const p of ['/modules.json', '/built-in.json', '/search-index.json', '/m/@open-mercato/gateway-tpay.json']) {
      const r = hostRedirect(`https://modules.openmercato.com${p}`, WWW)
      expect(r, p).not.toBeNull()
      const res = redirectResponse(r!)
      expect(res.status, p).toBe(MOVED_STATUS)
      expect(res.headers.get('location'), p).toBe(`https://www.openmercato.com/modules${p}`)
      expect(res.headers.get('access-control-allow-origin'), p).toBe('*')
      expect(await res.text(), p).toBe('')
    }
  })

  it('sends every old address of the Pages hosts to the same path on the site, query kept', () => {
    expect(at('https://modules.openmercato.com/')).toBe('https://www.openmercato.com/modules/')
    expect(at('https://modules.openmercato.com/m/@open-mercato/gateway-tpay?tab=fit&x=1')).toBe(
      'https://www.openmercato.com/modules/m/@open-mercato/gateway-tpay?tab=fit&x=1',
    )
    for (const p of ['/templates', '/llms.txt', '/modules.json', '/m/@x/y.md', '/.well-known/agent-skills/index.json'])
      expect(at(`https://modules.openmercato.com${p}`), p).toBe(`https://www.openmercato.com/modules${p}`)
    expect(at('https://templates.openmercato.com/t/open-mercato/x')).toBe(
      'https://www.openmercato.com/modules/t/open-mercato/x',
    )
    expect(hostRedirect('https://modules.openmercato.com/m/x', WWW)?.status).toBe(MOVED_STATUS)
    expect(MOVED_STATUS).toBe(302)
  })

  it('serves the fixed addresses released create-mercato-app versions fetch, without a redirect', () => {
    expect(FIXED_ROOT_FILES).toEqual(['templates.json', 'picker.json'])
    for (const host of ['modules.openmercato.com', 'templates.openmercato.com'])
      for (const p of ['/templates.json', '/picker.json', '/templates.json?x=1', '/schema/modules-1.json'])
        expect(at(`https://${host}${p}`), `${host}${p}`).toBeNull()
    expect(isFixedPath('/picker.json')).toBe(true)
    expect(isFixedPath('/schema/tools-1.json')).toBe(true)
    // only those exact paths: the site's own copies and other data files still move
    for (const p of ['/modules/picker.json', '/picker.json/x', '/t/acme/kiosk.json', '/templates'])
      expect(isFixedPath(p), p).toBe(false)
    expect(at('https://modules.openmercato.com/templates')).toBe('https://www.openmercato.com/modules/templates')
  })

  it('leaves a *.pages.dev deployment address on its own host: only its root leads to the base', () => {
    expect(isPreviewHost('abc123.open-mercato-modules.pages.dev')).toBe(true)
    expect(isPreviewHost('open-mercato-modules.pages.dev')).toBe(true)
    expect(isPreviewHost('modules.openmercato.com')).toBe(false)
    expect(isPreviewHost('pages.dev.evil.example')).toBe(false)
    expect(hostRedirect('https://abc123.open-mercato-modules.pages.dev/?a=1', WWW)).toEqual({
      location: 'https://abc123.open-mercato-modules.pages.dev/modules/?a=1',
      status: 302,
    })
    for (const p of ['/about', '/m/@x/y', '/modules.json', '/templates', '//evil.example', '/modules/m/x'])
      expect(at(`https://abc123.open-mercato-modules.pages.dev${p}`), p).toBeNull()
    // any other host (local `wrangler pages dev`, an unknown custom domain) is not sent to production either
    for (const u of ['http://localhost:8788/m/x', 'http://127.0.0.1:8788/', 'https://other.example/m/x'])
      expect(at(u), u).toBeNull()
  })

  it('sends the templates host root to the Templates section of the site', () => {
    expect(hostRedirect('https://templates.openmercato.com/?a=1', WWW)).toEqual({
      location: 'https://www.openmercato.com/modules/templates?a=1',
      status: 302,
    })
  })

  it('never redirects the site itself, the schema files or a request that carries the site host (no loop)', () => {
    for (const u of [
      'https://modules.openmercato.com/modules',
      'https://modules.openmercato.com/modules/',
      'https://modules.openmercato.com/modules/m/x',
      'https://modules.openmercato.com/schema/modules-1.json',
      'https://www.openmercato.com/m/x',
      'https://www.openmercato.com/',
    ])
      expect(at(u), u).toBeNull()
    // a target is always under the base, so it is never redirected again
    for (const p of ['/', '/m/@x/y', '/a/b/c?d=e', '/modulesx', '/modules.json', '/%2F%2Fevil.example']) {
      const target = at(`https://modules.openmercato.com${p}`)
      expect(target, p).not.toBeNull()
      expect(at(target as string), p).toBeNull()
      expect(new URL(target as string).origin).toBe(WWW.origin)
    }
  })

  it('is never an open redirect: `//`, a backslash or a control character is not redirected', () => {
    for (const u of [
      'https://modules.openmercato.com//evil.example',
      'https://modules.openmercato.com//evil.example/x?y',
      'https://modules.openmercato.com/\\evil.example',
      'https://modules.openmercato.com/%5Cevil.example',
      'https://modules.openmercato.com/a%0d%0aLocation:%20https://evil.example',
      'https://modules.openmercato.com/a%00b',
      'https://modules.openmercato.com/a%7Fb',
    ])
      expect(at(u), u).toBeNull()
    expect(hostRedirect('not a url', WWW)).toBeNull()
  })
})

describe('addresses that follow the configured site', () => {
  it('the page script leaves the other Pages hosts alone', () => {
    expect(otherProductionOrigins(DEFAULT_SITE)).toEqual(['https://templates.openmercato.com'])
    expect(otherProductionOrigins(WWW)).toEqual([
      'https://modules.openmercato.com',
      'https://templates.openmercato.com',
    ])
  })

  it('schema links: href() at the domain root, the fixed address under a base', () => {
    expect(SCHEMA_ORIGIN).toBe('https://modules.openmercato.com')
    expect(schemaUrl('tools')).toBe('https://modules.openmercato.com/schema/tools-1.json')
    expect(dataHref('/schema/modules-1.json', '')).toBe('/schema/modules-1.json')
    expect(dataHref('/schema/modules-1.json', '/modules')).toBe('https://modules.openmercato.com/schema/modules-1.json')
    expect(dataHref('/modules.json', '/modules')).toBe('/modules/modules.json')
  })

  it('functions/site.ts for a nested site', () => {
    expect(siteModule(WWW)).toContain(
      "export const SITE: SiteConfig = { origin: 'https://www.openmercato.com', base: '/modules' }",
    )
  })
})

describe('links of a built page', () => {
  it('reads href, src, srcset and the meta refresh URL, not script bodies', () => {
    const html =
      '<a href="/modules/a">x</a><img src=\'/modules/b.png\' srcset="/modules/c.png 1x, /modules/d.png 2x">' +
      '<meta http-equiv="refresh" content="0; url=../../m/x"><meta name="description" content="Plain text">' +
      '<script src="/modules/_astro/e.js"></script><script>el.setAttribute("href", "/x")</script>'
    expect(htmlRefs(html)).toEqual([
      '/modules/a',
      '/modules/b.png',
      '/modules/c.png',
      '/modules/d.png',
      '../../m/x',
      '/modules/_astro/e.js',
    ])
  })

  it('a link holds when it is absolute to another origin or resolves under the base', () => {
    const page = '/modules/m/@x/y'
    for (const ok of [
      '/modules/',
      '/modules/m/z',
      '../z',
      '#top',
      'mailto:a@b.c',
      'https://github.com/x',
      'https://modules.openmercato.com/schema/modules-1.json',
      'https://www.openmercato.com/modules/m/z',
    ])
      expect(linkProblem(ok, page, WWW), ok).toBeNull()
    for (const bad of ['/m/z', '/', '../../../x', 'https://www.openmercato.com/m/z', '//www.openmercato.com/x'])
      expect(linkProblem(bad, page, WWW), bad).not.toBeNull()
    expect(linkProblem('/m/z', '/m/x', DEFAULT_SITE)).toBeNull()
  })
})

describe('the nested layout of dist', () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'om-pages-layout-'))
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  /** What Astro and om-data write under the base before finishNestedLayout. */
  function site(dist: string): void {
    const s = join(dist, 'modules')
    mkdirSync(join(s, 'schema'), { recursive: true })
    mkdirSync(join(s, 'm'), { recursive: true })
    writeFileSync(join(s, 'index.html'), '<a href="/modules/m/x">x</a><link rel="icon" href="/modules/favicon.svg">')
    writeFileSync(join(s, 'm', 'x.html'), '<a href="/modules/">home</a><a href="../about">about</a>')
    writeFileSync(join(s, '404.html'), '<a href="/modules/">home</a>')
    writeFileSync(join(s, '_routes.json'), read('site', 'public', '_routes.json'))
    writeFileSync(join(s, '_redirects'), read('site', 'public', '_redirects'))
    writeFileSync(join(s, 'modules.json'), JSON.stringify({ $schema: schemaUrl('modules') }))
    writeFileSync(join(s, 'templates.json'), '{"templates":[]}\n')
    writeFileSync(join(s, 'picker.json'), '{"modules":[]}\n')
    for (const n of PUBLISHED_SCHEMAS)
      writeFileSync(join(s, 'schema', `${n}-1.json`), JSON.stringify({ $id: schemaUrl(n) }))
  }

  it('finishNestedLayout leaves the Pages files and the schemas at the root, and the check passes', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    const before = checkPagesLayout(dist, WWW).join('\n')
    expect(before).toMatch(/dist\/404\.html is missing/)
    expect(before).toMatch(/dist\/modules\/_routes\.json belongs at the root/)
    finishNestedLayout(dist, WWW)
    expect(JSON.parse(readFileSync(join(dist, '_routes.json'), 'utf8'))).toEqual(pagesRoutes('/modules'))
    expect(readFileSync(join(dist, '_redirects'), 'utf8')).toBe(pagesRedirects('/modules'))
    expect(readFileSync(join(dist, '404.html'), 'utf8')).toBe('<a href="/modules/">home</a>')
    expect(JSON.parse(readFileSync(join(dist, 'schema', 'modules-1.json'), 'utf8')).$id).toBe(schemaUrl('modules'))
    expect(readFileSync(join(dist, 'templates.json'), 'utf8')).toBe('{"templates":[]}\n')
    expect(readFileSync(join(dist, 'picker.json'), 'utf8')).toBe('{"modules":[]}\n')
    expect(readFileSync(join(dist, 'modules', 'picker.json'), 'utf8')).toBe('{"modules":[]}\n')
    expect(checkPagesLayout(dist, WWW)).toEqual([])
  })

  it('the check wants templates.json and picker.json at the root as copies of the site files', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    finishNestedLayout(dist, WWW)
    rmSync(join(dist, 'templates.json'))
    writeFileSync(join(dist, 'picker.json'), '{"modules":["stale"]}\n')
    const problems = checkPagesLayout(dist, WWW).join('\n')
    expect(problems).toContain('templates.json is missing (released create-mercato-app versions fetch it there)')
    expect(problems).toMatch(/dist\/picker\.json differs from .*dist\/modules\/picker\.json/)
  })

  it('the check names a link outside the base, a stray root file, a wrong $id and a root layout mismatch', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    finishNestedLayout(dist, WWW)
    writeFileSync(join(dist, 'modules', 'm', 'x.html'), '<a href="/m/y">y</a>')
    writeFileSync(join(dist, 'index.html'), 'stale root page')
    writeFileSync(join(dist, 'schema', 'tools-1.json'), JSON.stringify({ $id: 'https://www.openmercato.com/x' }))
    const problems = checkPagesLayout(dist, WWW).join('\n')
    expect(problems).toContain('m/x.html: outside /modules: /m/y')
    expect(problems).toContain('index.html sits outside the site')
    expect(problems).toContain('tools-1.json: $id is https://www.openmercato.com/x')
    // the same dist read as a root build: wrong routes and redirects
    expect(checkPagesLayout(dist, DEFAULT_SITE).join('\n')).toContain('_routes.json is not')
  })

  it('the e2e server serves a nested build from its site folder and a flat one from dist (no prefix cut)', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    expect(siteFolder(dist, '/modules')).toBe(join(dist, 'modules'))
    expect(siteFolder(dist, '/')).toBe(dist)
    expect(siteFolder(join(dist, 'modules'), '/modules')).toBe(join(dist, 'modules'))
  })

  it('pagesLayout moves outDir under the base for a build, and does nothing at the root', () => {
    const integration = pagesLayout()
    const setup = integration.hooks['astro:config:setup'] as unknown as (a: unknown) => void
    const updateConfig = vi.fn()
    const config = (base: string, outDir: string) => ({
      base,
      site: 'https://www.openmercato.com',
      outDir: pathToFileURL(`${outDir}/`),
      root: pathToFileURL(`${tmp}/`),
    })
    setup({ config: config('/', join(tmp, 'dist')), command: 'build', updateConfig })
    expect(updateConfig).not.toHaveBeenCalled()
    setup({ config: config('/modules', join(tmp, 'dist')), command: 'build', updateConfig })
    expect(updateConfig).toHaveBeenCalledWith({ outDir: pathToFileURL(`${join(tmp, 'dist', 'modules')}/`) })
    expect(() => setup({ config: config('/modules', tmp), command: 'build', updateConfig })).toThrow(
      /holds the project/,
    )
  })

  it('yarn om pages-site writes functions/site.ts and --check compares it and the layout', () => {
    const env = { SITE_URL: process.env.SITE_URL, BASE_PATH: process.env.BASE_PATH }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mkdirSync(join(tmp, 'functions'))
      process.env.SITE_URL = 'https://www.openmercato.com'
      process.env.BASE_PATH = '/modules'
      const ctx = (args: string[]) => ({
        args,
        root: tmp,
        flags: { data: '.data', out: 'out', offline: false, json: false },
      })
      const dist = join(tmp, 'dist')
      site(dist)
      finishNestedLayout(dist, WWW)
      expect(pagesSite(ctx(['--check', dist]))).toBe(1)
      expect(error.mock.calls.flat().join('\n')).toContain(
        'functions/site.ts is not for https://www.openmercato.com/modules',
      )
      expect(pagesSite(ctx([]))).toBe(0)
      expect(readFileSync(join(tmp, 'functions', 'site.ts'), 'utf8')).toBe(siteModule(WWW))
      expect(pagesSite(ctx(['--check', dist]))).toBe(0)
      process.env.BASE_PATH = '/../x'
      expect(pagesSite(ctx([]))).toBe(2)
      expect(pagesSite(ctx(['--bogus']))).toBe(2)
    } finally {
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
      log.mockRestore()
      error.mockRestore()
    }
  })
})
