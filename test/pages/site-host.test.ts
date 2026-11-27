// The catalog as the Run section of the main site, www.openmercato.com/run (decisions of 13 and 14 Nov,
// lib/core/site-host.ts): the default build stays as it is (site at the domain root, Functions on `/` only), and a
// build under a base path lays dist out for the proxy of the main site, redirects the old addresses of the Pages hosts
// to the site, and keeps the schema addresses and the files released tools fetch fixed. With a home path the home page
// sits at <base><home> (`/run/modules`) and the base only redirects there.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answer, onRequest } from '../../functions/_middleware.ts'
import { SITE } from '../../functions/site.ts'
import pagesSite from '../../lib/commands/pages-site.ts'
import { schemaUrl, SCHEMA_ORIGIN } from '../../lib/core/home.ts'
import {
  DEFAULT_SITE,
  FILE_DIRS,
  fileResponse,
  FIXED_ROOT_FILES,
  hasHomePath,
  homeConfig,
  homeFile,
  homePath,
  homeUrl,
  hostFile,
  hostRedirect,
  isFilePath,
  isFixedPath,
  isNested,
  isPreviewHost,
  isSitemapPath,
  MOVED_STATUS,
  NOINDEX_HEADERS,
  NOINDEX_ROBOTS,
  noindexFromEnv,
  otherProductionOrigins,
  pagesHostProblem,
  pagesRedirects,
  pagesRoutes,
  redirectResponse,
  siteConfig,
  siteConfigFromEnv,
  siteDir,
  siteModule,
  siteRoot,
  type SiteConfig,
} from '../../lib/core/site-host.ts'
import { templatesRedirect } from '../../lib/core/templates-host.ts'
import {
  checkPagesLayout,
  cleanNestedRoot,
  finishNestedLayout,
  htmlRefs,
  linkProblem,
  markNoindex,
  nestedRootEntries,
  pagesLayout,
} from '../../lib/emit/pages-layout.ts'
import { PUBLISHED_SCHEMAS } from '../../lib/schema/json-schema.ts'
import { absoluteUrl, dataHref, href, siteRootUrl } from '../../site/src/lib/url.ts'
import { isBuilt, siteFolder, staticRedirects } from '../e2e/serve.ts'
import { ROOT } from '../emit/helpers.ts'

/** The target: the Run section of the main site, the home page at /run/modules. */
const WWW: SiteConfig = { origin: 'https://www.openmercato.com', base: '/run', home: '/modules' }
/** A site under a base whose home page is the base itself (no HOME_PATH). */
const PLAIN: SiteConfig = { origin: 'https://www.openmercato.com', base: '/run', home: '/' }
const read = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8')

describe('siteConfig', () => {
  it('normalizes SITE_URL to its origin and BASE_PATH to one leading slash', () => {
    expect(siteConfig('https://modules.openmercato.com', '/')).toEqual(DEFAULT_SITE)
    expect(siteConfig('https://www.openmercato.com/', 'run')).toEqual(PLAIN)
    expect(siteConfig('https://www.openmercato.com/ignored', '//run//')).toEqual(PLAIN)
    expect(siteConfig('https://x.example', '')).toEqual({ origin: 'https://x.example', base: '/', home: '/' })
    expect(siteConfig('https://x.example', '/a/b-1')).toEqual({
      origin: 'https://x.example',
      base: '/a/b-1',
      home: '/',
    })
  })

  it('takes HOME_PATH as one plain segment under a base, and the default is the base itself', () => {
    expect(siteConfig('https://www.openmercato.com', '/run', '/modules')).toEqual(WWW)
    expect(siteConfig('https://www.openmercato.com', 'run/', '//modules//')).toEqual(WWW)
    expect(siteConfig('https://www.openmercato.com', '/run', '')).toEqual(PLAIN)
    expect(siteConfig('https://www.openmercato.com', '/run', '/')).toEqual(PLAIN)
    expect(homeConfig('/', '/')).toBe('/')
    for (const h of ['/a/b', '/modules.json', '/.x', '/a b', '/a?x', '/a#b', '/..', '/*', '/a\\b'])
      expect(() => homeConfig(h, '/run'), h).toThrow(/HOME_PATH must be one plain path segment/)
    // at the domain root the redirect of the base would answer `/` of every host of the Pages project
    expect(() => homeConfig('/modules', '/')).toThrow(/needs a BASE_PATH/)
    expect(() => siteConfig('https://modules.openmercato.com', '/', '/modules')).toThrow(/HOME_PATH/)
  })

  it('reads the three variables of a build, with the defaults for the ones not set', () => {
    expect(siteConfigFromEnv({})).toEqual(DEFAULT_SITE)
    expect(siteConfigFromEnv({ SITE_URL: '', BASE_PATH: '', HOME_PATH: '' })).toEqual(DEFAULT_SITE)
    expect(siteConfigFromEnv({ SITE_URL: 'https://www.openmercato.com', BASE_PATH: '/run' })).toEqual(PLAIN)
    expect(
      siteConfigFromEnv({ SITE_URL: 'https://www.openmercato.com', BASE_PATH: '/run', HOME_PATH: '/modules' }),
    ).toEqual(WWW)
  })

  it('names the home page: its path, its address and its file in the site folder', () => {
    expect([hasHomePath(DEFAULT_SITE), homePath(DEFAULT_SITE), homeFile(DEFAULT_SITE)]).toEqual([
      false,
      '/',
      'index.html',
    ])
    expect(homeUrl(DEFAULT_SITE)).toBe('https://modules.openmercato.com/')
    expect([hasHomePath(PLAIN), homePath(PLAIN), homeFile(PLAIN)]).toEqual([false, '/run/', 'index.html'])
    expect([hasHomePath(WWW), homePath(WWW), homeFile(WWW)]).toEqual([true, '/run/modules', 'modules.html'])
    expect(homeUrl(WWW)).toBe('https://www.openmercato.com/run/modules')
  })

  it('refuses a nested site on a host of the Pages project: its old addresses would answer 404', () => {
    expect(pagesHostProblem(WWW)).toBeNull()
    expect(pagesHostProblem(DEFAULT_SITE)).toBeNull()
    for (const origin of [
      'https://modules.openmercato.com',
      'https://templates.openmercato.com',
      'https://open-mercato-modules.pages.dev',
      'https://abc123.open-mercato-modules.pages.dev',
    ]) {
      expect(pagesHostProblem({ origin, base: '/run', home: '/modules' }), origin).toMatch(
        /is a host of the Pages project/,
      )
      expect(pagesHostProblem({ origin, base: '/', home: '/' }), origin).toBeNull()
    }
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
    expect(siteRoot(WWW)).toBe('https://www.openmercato.com/run')
    expect(siteDir(WWW)).toBe('run')
  })
})

describe('Pages config files', () => {
  it('at the domain root they are exactly the files in site/public', () => {
    expect(pagesRoutes('/')).toEqual(JSON.parse(read('site', 'public', '_routes.json')))
    expect(pagesRedirects(DEFAULT_SITE)).toBe(read('site', 'public', '_redirects'))
  })

  it('under a base, Functions run on every path but the site and the fixed addresses', () => {
    const r = pagesRoutes('/run')
    expect(r).toEqual({
      version: 1,
      include: ['/*'],
      exclude: ['/run', '/run/*', '/schema/*', '/templates.json', '/picker.json', '/modules.json'],
    })
    // Pages limits: at least one include, at most 100 rules, each at most 100 characters
    expect(r.include.length).toBeGreaterThan(0)
    expect(r.include.length + r.exclude.length).toBeLessThanOrEqual(100)
    for (const rule of [...r.include, ...r.exclude]) expect(rule.length).toBeLessThanOrEqual(100)
  })

  it('under a base, /sitemap.xml of the site moves to its sitemap index', () => {
    const rules = pagesRedirects(PLAIN)
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
    expect(rules).toEqual(['/run/sitemap.xml /run/sitemap-index.xml 301'])
  })

  it('with a home path, the base and the base with a slash answer a 302 to the home page', () => {
    const rules = pagesRedirects(WWW)
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
    expect(rules).toEqual([
      '/run/sitemap.xml /run/sitemap-index.xml 301',
      '/run /run/modules 302',
      '/run/ /run/modules 302',
    ])
    // static rules on the same host, so they hold behind the proxy and on a *.pages.dev address; no rule names the
    // home page or a file of the site, so /run/modules and /run/modules.json are served as they are
    const parsed = staticRedirects(pagesRedirects(WWW))
    expect(parsed.get('/run')).toEqual({ to: '/run/modules', status: MOVED_STATUS })
    expect(parsed.get('/run/')).toEqual({ to: '/run/modules', status: MOVED_STATUS })
    expect([...parsed.keys()].sort()).toEqual(['/run', '/run/', '/run/sitemap.xml'])
    // the base is kept away from Functions, so the rule is the only answer there
    expect(pagesRoutes(WWW.base).exclude).toEqual(expect.arrayContaining(['/run', '/run/*']))
    expect(hostRedirect('https://modules.openmercato.com/run', WWW)).toBeNull()
    expect(hostRedirect('https://modules.openmercato.com/run/', WWW)).toBeNull()
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

  it('answers an old page address with a 302 a cross-origin fetch can follow (CORS on the redirect)', async () => {
    // Pages gives static files `Access-Control-Allow-Origin: *`; a browser checks CORS on the 302 itself
    for (const p of ['/built-in', '/compat', '/m/@open-mercato/gateway-tpay', '/t/open-mercato/x']) {
      const r = hostRedirect(`https://modules.openmercato.com${p}`, WWW)
      expect(r, p).not.toBeNull()
      const res = redirectResponse(r!)
      expect(res.status, p).toBe(MOVED_STATUS)
      expect(res.headers.get('location'), p).toBe(`https://www.openmercato.com/run${p}`)
      expect(res.headers.get('access-control-allow-origin'), p).toBe('*')
      expect(await res.text(), p).toBe('')
    }
  })

  it('sends every old address of the Pages hosts to the same path on the site, query kept', () => {
    expect(at('https://modules.openmercato.com/m/@open-mercato/gateway-tpay?tab=fit&x=1')).toBe(
      'https://www.openmercato.com/run/m/@open-mercato/gateway-tpay?tab=fit&x=1',
    )
    // the form link of the Open Mercato docs
    expect(at('https://modules.openmercato.com/submit?npm=@open-mercato/gateway-tpay')).toBe(
      'https://www.openmercato.com/run/submit?npm=@open-mercato/gateway-tpay',
    )
    for (const p of ['/templates', '/compat', '/radar', '/quality', '/for-agents', '/built-in', '/about'])
      expect(at(`https://modules.openmercato.com${p}`), p).toBe(`https://www.openmercato.com/run${p}`)
    // a page whose name ends like a domain or a version is still a page
    for (const p of ['/m/socket.io', '/m/@x/y.js', '/r/2026-11-14.0', '/m/@x/y.html', '/_astro/a.css'])
      expect(at(`https://modules.openmercato.com${p}`), p).toBe(`https://www.openmercato.com/run${p}`)
    expect(at('https://templates.openmercato.com/t/open-mercato/x')).toBe(
      'https://www.openmercato.com/run/t/open-mercato/x',
    )
    expect(hostRedirect('https://modules.openmercato.com/m/x', WWW)?.status).toBe(MOVED_STATUS)
    expect(MOVED_STATUS).toBe(302)
  })

  it('sends the root of the old host to the home page: /run/modules with a home path, the base without', () => {
    expect(at('https://modules.openmercato.com/')).toBe('https://www.openmercato.com/run/modules')
    expect(at('https://modules.openmercato.com')).toBe('https://www.openmercato.com/run/modules')
    expect(at('https://modules.openmercato.com/?q=ksef&tools=1')).toBe(
      'https://www.openmercato.com/run/modules?q=ksef&tools=1',
    )
    // Pages answered /index.html with a redirect to / while the site sat at the root
    expect(at('https://modules.openmercato.com/index.html')).toBe('https://www.openmercato.com/run/modules')
    expect(at('https://templates.openmercato.com/index.html?a=1')).toBe('https://www.openmercato.com/run/templates?a=1')
    expect(hostRedirect('https://modules.openmercato.com/', WWW)?.status).toBe(MOVED_STATUS)
    expect(hostRedirect('https://modules.openmercato.com/?q=x', PLAIN)?.location).toBe(
      'https://www.openmercato.com/run/?q=x',
    )
    // the middleware sends what hostRedirect says, for the layout in its config
    const res = redirectResponse(hostRedirect('https://modules.openmercato.com/', WWW)!)
    expect([res.status, res.headers.get('location'), res.headers.get('access-control-allow-origin')]).toEqual([
      302,
      'https://www.openmercato.com/run/modules',
      '*',
    ])
  })

  it('serves the fixed addresses released tools fetch, without a redirect', () => {
    // templates.json and picker.json: create-mercato-app; modules.json: `mercato module search` of @open-mercato/cli
    expect(FIXED_ROOT_FILES).toEqual(['templates.json', 'picker.json', 'modules.json'])
    for (const host of ['modules.openmercato.com', 'templates.openmercato.com'])
      for (const p of [
        '/templates.json',
        '/picker.json',
        '/modules.json',
        '/modules.json?x=1',
        '/templates.json?x=1',
        '/schema/modules-1.json',
      ])
        expect(at(`https://${host}${p}`), `${host}${p}`).toBeNull()
    expect(isFixedPath('/picker.json')).toBe(true)
    expect(isFixedPath('/modules.json')).toBe(true)
    // the home path next to the fixed file of the same name: a page, moved like any other old address
    expect(isFixedPath('/modules')).toBe(false)
    expect(at('https://modules.openmercato.com/modules')).toBe('https://www.openmercato.com/run/modules')
    expect(isFixedPath('/schema/tools-1.json')).toBe(true)
    // only those exact paths: the site's own copies and other data files still move
    for (const p of ['/run/picker.json', '/picker.json/x', '/t/acme/kiosk.json', '/templates'])
      expect(isFixedPath(p), p).toBe(false)
    expect(at('https://modules.openmercato.com/templates')).toBe('https://www.openmercato.com/run/templates')
  })

  it('leaves a *.pages.dev deployment address on its own host: only its root leads to the home page', () => {
    expect(isPreviewHost('abc123.open-mercato-modules.pages.dev')).toBe(true)
    expect(isPreviewHost('open-mercato-modules.pages.dev')).toBe(true)
    expect(isPreviewHost('modules.openmercato.com')).toBe(false)
    expect(isPreviewHost('pages.dev.evil.example')).toBe(false)
    expect(hostRedirect('https://abc123.open-mercato-modules.pages.dev/?a=1', WWW)).toEqual({
      location: 'https://abc123.open-mercato-modules.pages.dev/run/modules?a=1',
      status: 302,
    })
    expect(hostRedirect('https://abc123.open-mercato-modules.pages.dev/', PLAIN)?.location).toBe(
      'https://abc123.open-mercato-modules.pages.dev/run/',
    )
    for (const p of ['/about', '/m/@x/y', '/modules.json', '/llms.txt', '/templates', '//evil.example', '/run/m/x'])
      expect(at(`https://abc123.open-mercato-modules.pages.dev${p}`), p).toBeNull()
    // any other host (local `wrangler pages dev`, an unknown custom domain) is not sent to production either
    for (const u of ['http://localhost:8788/m/x', 'http://127.0.0.1:8788/', 'https://other.example/m/x'])
      expect(at(u), u).toBeNull()
  })

  it('the preview branch alias of pages.yml (run-preview) serves the nested site on its own host', () => {
    // the address `wrangler pages deploy --branch=run-preview` gets: an alias, not a deployment hash
    const alias = 'https://run-preview.open-mercato-modules.pages.dev'
    expect(isPreviewHost(new URL(alias).hostname)).toBe(true)
    // the root leads to the home page on the same host, query kept, never to production
    expect(hostRedirect(`${alias}/?utm=x`, WWW)).toEqual({ location: `${alias}/run/modules?utm=x`, status: 302 })
    // the site and the base are static files and _redirects; Functions leave them alone
    for (const p of ['/run', '/run/', '/run/modules', '/run/m/@open-mercato/gateway-tpay', '/run/modules.json']) {
      expect(hostRedirect(`${alias}${p}`, WWW), p).toBeNull()
      expect(hostFile(`${alias}${p}`, WWW), p).toBeNull()
    }
    // a page of the old addresses is not sent to www.openmercato.com from the preview
    for (const p of ['/m/@open-mercato/gateway-tpay', '/templates', '/submit?npm=x'])
      expect(hostRedirect(`${alias}${p}`, WWW), p).toBeNull()
    // a file of the old addresses answers from the copy under the base, robots.txt included
    expect(hostFile(`${alias}/llms.txt`, WWW)).toBe('/run/llms.txt')
    expect(hostFile(`${alias}/robots.txt`, WWW)).toBe('/run/robots.txt')
    expect(hostFile(`${alias}/m/@open-mercato/gateway-tpay.md`, WWW)).toBe('/run/m/@open-mercato/gateway-tpay.md')
  })

  it('sends the templates host root to the Templates section of the site', () => {
    expect(hostRedirect('https://templates.openmercato.com/?a=1', WWW)).toEqual({
      location: 'https://www.openmercato.com/run/templates?a=1',
      status: 302,
    })
  })

  it('never redirects the site itself, the schema files or a request that carries the site host (no loop)', () => {
    for (const u of [
      'https://modules.openmercato.com/run',
      'https://modules.openmercato.com/run/',
      'https://modules.openmercato.com/run/m/x',
      'https://modules.openmercato.com/schema/modules-1.json',
      'https://www.openmercato.com/m/x',
      'https://www.openmercato.com/',
    ])
      expect(at(u), u).toBeNull()
    // a target is always under the base, so it is never redirected again
    for (const p of ['/', '/m/@x/y', '/a/b/c?d=e', '/runx', '/modules', '/sitemap.xml', '/%2F%2Fevil.example']) {
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

describe('the old host serves machine-readable files itself (nested layout)', () => {
  const OLD = 'https://modules.openmercato.com'
  const TPL = 'https://templates.openmercato.com'
  const PREVIEW = 'https://abc123.open-mercato-modules.pages.dev'
  /** What the Pages project does with a request: the file it serves, where it redirects, or `static` (no Function answer). */
  const what = (u: string, c: SiteConfig = WWW): string => {
    const file = hostFile(u, c)
    if (file) return `file ${file}`
    const r = hostRedirect(u, c)
    return r ? `${r.status} ${r.location}` : 'static'
  }
  const WWW_RUN = 'https://www.openmercato.com/run'

  it('sorts a path into a file or a page', () => {
    for (const file of [
      '/llms.txt',
      '/llms-full.txt',
      '/robots.txt',
      '/modules.json',
      '/built-in.json',
      '/search-index.json',
      '/m/@open-mercato/gateway-tpay.md',
      '/m/@open-mercato/gateway-tpay.json',
      '/m/create-mercato-module.md',
      '/t/open-mercato/b2b.json',
      '/built-in/auth.json',
      '/badge/@open-mercato/gateway-tpay.svg',
      '/badge/create-mercato-module.svg',
      '/raw/modules.md',
      '/raw/anything',
      '/.well-known/agent-skills/index.json',
      '/.well-known/mcp/server-card.json',
      '/.well-known/agent-skills/om-find-module/SKILL.md',
      '/schema/modules-1.json',
      '/feed.xml',
      '/shots/@x/y/1.webp',
      '/og-default.png',
      '/favicon.png',
      '/M/X.JSON',
    ])
      expect(isFilePath(file), file).toBe(true)
    for (const page of [
      '/',
      '/index.html',
      '/templates',
      '/compat',
      '/submit',
      '/m/@open-mercato/gateway-tpay',
      '/m/socket.io',
      '/m/@x/y.js',
      '/m/@x/md',
      '/m/@x/y.html',
      '/c/payments',
      '/r/2026-11-14.0',
      '/built-in/auth',
      '/_astro/index.abc.js',
      '/_astro/index.abc.css',
      '/fonts/geist.woff2',
      // the sitemaps list addresses of the site's own host: they move like pages
      '/sitemap.xml',
      '/sitemap-index.xml',
      '/sitemap-0.xml',
    ])
      expect(isFilePath(page), page).toBe(false)
    expect(FILE_DIRS).toEqual(['raw', '.well-known', 'badge', 'schema'])
    expect(
      ['/sitemap.xml', '/sitemap-index.xml', '/sitemap-0.xml', '/feed.xml', '/m/sitemap.xml'].map(isSitemapPath),
    ).toEqual([true, true, true, false, false])
  })

  it('page or file, on each host of the Pages project', () => {
    const table: [path: string, modules: string, templates: string, preview: string][] = [
      // files: the copy under the base, on every host of the project
      ['/llms.txt', 'file /run/llms.txt', 'file /run/llms.txt', 'file /run/llms.txt'],
      ['/raw/modules.md', 'file /run/raw/modules.md', 'file /run/raw/modules.md', 'file /run/raw/modules.md'],
      ['/m/@x/y.md', 'file /run/m/@x/y.md', 'file /run/m/@x/y.md', 'file /run/m/@x/y.md'],
      ['/m/@x/y.json', 'file /run/m/@x/y.json', 'file /run/m/@x/y.json', 'file /run/m/@x/y.json'],
      ['/badge/@x/y.svg', 'file /run/badge/@x/y.svg', 'file /run/badge/@x/y.svg', 'file /run/badge/@x/y.svg'],
      ['/built-in.json', 'file /run/built-in.json', 'file /run/built-in.json', 'file /run/built-in.json'],
      ['/feed.xml', 'file /run/feed.xml', 'file /run/feed.xml', 'file /run/feed.xml'],
      ['/robots.txt', 'file /run/robots.txt', 'file /run/robots.txt', 'file /run/robots.txt'],
      [
        '/.well-known/agent-skills/index.json',
        'file /run/.well-known/agent-skills/index.json',
        'file /run/.well-known/agent-skills/index.json',
        'file /run/.well-known/agent-skills/index.json',
      ],
      // the fixed addresses: static files at the root of the upload, no Function answer
      ['/modules.json', 'static', 'static', 'static'],
      ['/templates.json', 'static', 'static', 'static'],
      ['/picker.json', 'static', 'static', 'static'],
      ['/schema/modules-1.json', 'static', 'static', 'static'],
      // pages: a 302 to the site on the production hosts, nothing on a deployment address
      ['/m/@x/y', `302 ${WWW_RUN}/m/@x/y`, `302 ${WWW_RUN}/m/@x/y`, 'static'],
      ['/m/socket.io', `302 ${WWW_RUN}/m/socket.io`, `302 ${WWW_RUN}/m/socket.io`, 'static'],
      ['/compat', `302 ${WWW_RUN}/compat`, `302 ${WWW_RUN}/compat`, 'static'],
      ['/submit?npm=@x/y', `302 ${WWW_RUN}/submit?npm=@x/y`, `302 ${WWW_RUN}/submit?npm=@x/y`, 'static'],
      ['/templates', `302 ${WWW_RUN}/templates`, `302 ${WWW_RUN}/templates`, 'static'],
      ['/sitemap-index.xml', `302 ${WWW_RUN}/sitemap-index.xml`, `302 ${WWW_RUN}/sitemap-index.xml`, 'static'],
      ['/sitemap.xml', `302 ${WWW_RUN}/sitemap.xml`, `302 ${WWW_RUN}/sitemap.xml`, 'static'],
      // the roots
      ['/', `302 ${WWW_RUN}/modules`, `302 ${WWW_RUN}/templates`, `302 ${PREVIEW}/run/modules`],
      // the site itself: static files under the base
      ['/run/modules', 'static', 'static', 'static'],
      ['/run/llms.txt', 'static', 'static', 'static'],
      ['/run/m/@x/y.md', 'static', 'static', 'static'],
    ]
    for (const [path, modules, templates, preview] of table) {
      expect(what(`${OLD}${path}`), `modules ${path}`).toBe(modules)
      expect(what(`${TPL}${path}`), `templates ${path}`).toBe(templates)
      expect(what(`${PREVIEW}${path}`), `preview ${path}`).toBe(preview)
      // the site's own host and any other host: never a Function answer
      expect(what(`https://www.openmercato.com${path}`), `www ${path}`).toBe('static')
      expect(what(`http://localhost:8788${path}`), `localhost ${path}`).toBe('static')
      // the standalone layout stays as it is: only the templates root moves
      expect(hostFile(`${OLD}${path}`, DEFAULT_SITE), `root layout ${path}`).toBeNull()
      expect(hostFile(`${TPL}${path}`, DEFAULT_SITE), `root layout ${path}`).toBeNull()
      expect(hostRedirect(`${OLD}${path}`, DEFAULT_SITE), `root layout ${path}`).toBeNull()
    }
    // the same rule without a home path
    expect(what(`${OLD}/llms.txt`, PLAIN)).toBe('file /run/llms.txt')
    expect(what(`${OLD}/`, PLAIN)).toBe(`302 ${WWW_RUN}/`)
  })

  it('keeps the query out of the file path and never serves an unsafe path', () => {
    expect(hostFile(`${OLD}/modules.json?x=1`, WWW)).toBeNull()
    expect(hostFile(`${OLD}/built-in.json?x=1#y`, WWW)).toBe('/run/built-in.json')
    for (const u of [
      `${OLD}//evil.example/a.json`,
      `${OLD}/\\evil.example/a.json`,
      `${OLD}/%5Cevil.example/a.json`,
      `${OLD}/a%0d%0ab.json`,
      `${OLD}/a%00b.json`,
      'not a url',
    ]) {
      expect(hostFile(u, WWW), u).toBeNull()
      expect(hostRedirect(u, WWW), u).toBeNull()
    }
    // `..` is resolved by the URL parser before the rule sees the path: the file stays under the base
    expect(hostFile(`${OLD}/a/../../llms.txt`, WWW)).toBe('/run/llms.txt')
    expect(hostFile(`${OLD}/run/../llms.txt`, WWW)).toBe('/run/llms.txt')
  })

  it('the Function answers a file with the asset under the base: same bytes, 200, the CORS header', async () => {
    const files: Record<string, string> = {
      '/run/llms.txt': '# Open Mercato Modules\n',
      '/run/m/@x/y.md': '# y\n',
      '/run/badge/@x/y.svg': '<svg/>',
    }
    const asked: string[] = []
    const ASSETS = {
      fetch: async (req: Request): Promise<Response> => {
        const u = new URL(req.url)
        asked.push(`${req.method} ${u.host}${u.pathname}${u.search}`)
        const body = files[u.pathname]
        if (body === undefined) return new Response('<h1>Not found</h1>', { status: 404 })
        if (req.headers.get('if-none-match') === '"e1"')
          return new Response(null, { status: 304, headers: { etag: '"e1"' } })
        return new Response(body, {
          headers: { 'content-type': 'text/plain', etag: '"e1"', 'cache-control': 'max-age=0' },
        })
      },
    }
    let passed = 0
    const next = async (): Promise<Response> => {
      passed++
      return new Response('static')
    }
    const get = (u: string, init?: RequestInit): Promise<Response> =>
      Promise.resolve(answer({ request: new Request(u, init), next, env: { ASSETS } }, WWW))

    for (const [u, path] of [
      [`${OLD}/llms.txt`, '/run/llms.txt'],
      [`${OLD}/m/@x/y.md`, '/run/m/@x/y.md'],
      [`${TPL}/badge/@x/y.svg`, '/run/badge/@x/y.svg'],
      [`${PREVIEW}/llms.txt`, '/run/llms.txt'],
    ] as const) {
      const res = await get(u)
      expect([res.status, res.headers.get('location')], u).toEqual([200, null])
      expect(await res.text(), u).toBe(files[path])
      expect(res.headers.get('access-control-allow-origin'), u).toBe('*')
      expect(res.headers.get('etag'), u).toBe('"e1"')
    }
    expect(asked).toEqual([
      'GET modules.openmercato.com/run/llms.txt',
      'GET modules.openmercato.com/run/m/@x/y.md',
      'GET templates.openmercato.com/run/badge/@x/y.svg',
      'GET abc123.open-mercato-modules.pages.dev/run/llms.txt',
    ])
    // the method, the query and the conditional headers of the request reach the asset server
    asked.length = 0
    const head = await get(`${OLD}/llms.txt?v=2`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    const fresh = await get(`${OLD}/llms.txt`, { headers: { 'if-none-match': '"e1"' } })
    expect([fresh.status, fresh.headers.get('access-control-allow-origin')]).toEqual([304, '*'])
    expect(asked).toEqual(['HEAD modules.openmercato.com/run/llms.txt?v=2', 'GET modules.openmercato.com/run/llms.txt'])
    // a file that does not exist: the 404 of the asset server, not a redirect
    const missing = await get(`${OLD}/m/@x/nope.json`)
    expect([missing.status, missing.headers.get('location')]).toEqual([404, null])
    expect(passed).toBe(0)

    // a page is redirected, a path of the site and a fixed address go on to the static files
    const page = await get(`${OLD}/m/@x/y`)
    expect([page.status, page.headers.get('location')]).toEqual([302, 'https://www.openmercato.com/run/m/@x/y'])
    expect(await (await get(`${OLD}/run/llms.txt`)).text()).toBe('static')
    expect(await (await get(`${OLD}/modules.json`)).text()).toBe('static')
    expect(await (await get('https://www.openmercato.com/llms.txt')).text()).toBe('static')
    expect(passed).toBe(3)

    // the standalone layout: the Function never asks the asset server
    asked.length = 0
    const root = await answer({ request: new Request(`${OLD}/llms.txt`), next, env: { ASSETS } }, DEFAULT_SITE)
    expect(await root.text()).toBe('static')
    const viaDefault = await onRequest({ request: new Request(`${OLD}/llms.txt`), next, env: { ASSETS } })
    expect(await viaDefault.text()).toBe('static')
    expect(asked).toEqual([])
  })

  it('fileResponse keeps the asset as it is and sets the CORS header', async () => {
    const res = fileResponse(
      new Response('{"a":1}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': 'x' },
      }),
    )
    expect([res.status, res.headers.get('content-type'), res.headers.get('access-control-allow-origin')]).toEqual([
      200,
      'application/json',
      '*',
    ])
    expect(await res.text()).toBe('{"a":1}')
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
    expect(dataHref('/schema/modules-1.json', '/run')).toBe('https://modules.openmercato.com/schema/modules-1.json')
    expect(dataHref('/modules.json', '/run')).toBe('/run/modules.json')
  })

  it('href(/) is the home page: the base with its slash, or the home path under the base', () => {
    expect(href('/', '', '/')).toBe('/')
    expect(href('/', '/run', '/')).toBe('/run/')
    expect(href('/', '/run', '/modules')).toBe('/run/modules')
    // a query or a fragment on the home page stays (the search link of /submit, the chips of the module browser)
    expect(href('/?q=ksef', '', '/')).toBe('/?q=ksef')
    expect(href('/?q=ksef', '/run', '/modules')).toBe('/run/modules?q=ksef')
    expect(href('/#top', '/run', '/modules')).toBe('/run/modules#top')
    // every other page keeps its path under the base, whatever the home path
    for (const p of ['/templates', '/compat', '/radar', '/quality', '/for-agents', '/m/@x/y', '/modules.json'])
      expect(href(p, '/run', '/modules'), p).toBe(`/run${p}`)
    expect(absoluteUrl('https://www.openmercato.com', '/', '/run', '/modules')).toBe(
      'https://www.openmercato.com/run/modules',
    )
    expect(absoluteUrl('https://modules.openmercato.com', '/', '', '/')).toBe('https://modules.openmercato.com/')
    // the site root is not the home page: the page script rewrites addresses that start with it
    expect(siteRootUrl('https://www.openmercato.com', '/run')).toBe('https://www.openmercato.com/run/')
    expect(siteRootUrl('https://modules.openmercato.com/', '')).toBe('https://modules.openmercato.com/')
  })

  it('functions/site.ts for a nested site', () => {
    expect(siteModule(WWW)).toContain(
      "export const SITE: SiteConfig = { origin: 'https://www.openmercato.com', base: '/run', home: '/modules' }",
    )
    expect(siteModule(PLAIN)).toContain("base: '/run', home: '/' }")
  })
})

describe('links of a built page', () => {
  it('reads href, src, srcset and the meta refresh URL, not script bodies', () => {
    const html =
      '<a href="/run/a">x</a><img src=\'/run/b.png\' srcset="/run/c.png 1x, /run/d.png 2x">' +
      '<meta http-equiv="refresh" content="0; url=../../m/x"><meta name="description" content="Plain text">' +
      '<script src="/run/_astro/e.js"></script><script>el.setAttribute("href", "/x")</script>'
    expect(htmlRefs(html)).toEqual([
      '/run/a',
      '/run/b.png',
      '/run/c.png',
      '/run/d.png',
      '../../m/x',
      '/run/_astro/e.js',
    ])
  })

  it('a link holds when it is absolute to another origin or resolves under the base', () => {
    const page = '/run/m/@x/y'
    for (const ok of [
      '/run/modules',
      '/run/modules?q=x',
      '/run/modules.json',
      '/run/m/z',
      '../z',
      '#top',
      'mailto:a@b.c',
      'https://github.com/x',
      'https://modules.openmercato.com/schema/modules-1.json',
      'https://www.openmercato.com/run/m/z',
      // the main site's pages that the header and the footer link on purpose
      'https://www.openmercato.com/',
      'https://www.openmercato.com/product',
      'https://www.openmercato.com/terms-conditions',
      // the rows of the navbar panels and the folded Other list of the footer
      'https://www.openmercato.com/crm',
      'https://www.openmercato.com/enterprise-level-support',
      'https://www.openmercato.com/case-studies',
      'https://www.openmercato.com/salesforce-alternative',
    ])
      expect(linkProblem(ok, page, WWW), ok).toBeNull()
    for (const bad of [
      '/m/z',
      '/',
      '/product',
      '../../../x',
      'https://www.openmercato.com/m/z',
      'https://www.openmercato.com/product/x',
      'https://www.openmercato.com/crm/x',
      '/crm',
      '//www.openmercato.com/x',
      '//www.openmercato.com/product',
    ])
      expect(linkProblem(bad, page, WWW), bad).not.toBeNull()
    // with a home path the base is no page: a link to it would cost a redirect on every click
    for (const bare of ['/run', '/run/', '/run/?q=x', 'https://www.openmercato.com/run/', '../..'])
      expect(linkProblem(bare, page, WWW), bare).toMatch(/the base, which only redirects to \/run\/modules/)
    for (const home of ['/run/', '/run', '/run/?q=x']) expect(linkProblem(home, page, PLAIN), home).toBeNull()
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

  /** What Astro and om-data write under the base before finishNestedLayout, for the home page of `c`. */
  function site(dist: string, c: SiteConfig = WWW): void {
    const s = join(dist, 'run')
    const home = homePath(c)
    mkdirSync(join(s, 'schema'), { recursive: true })
    mkdirSync(join(s, 'm'), { recursive: true })
    writeFileSync(
      join(s, homeFile(c)),
      `<link rel="canonical" href="${homeUrl(c)}"><a href="/run/m/x">x</a><link rel="icon" href="/run/favicon.svg">`,
    )
    writeFileSync(join(s, 'm', 'x.html'), `<a href="${home}">home</a><a href="../about">about</a>`)
    writeFileSync(join(s, '404.html'), `<a href="${home}">home</a>`)
    writeFileSync(join(s, '_routes.json'), read('site', 'public', '_routes.json'))
    writeFileSync(join(s, '_redirects'), read('site', 'public', '_redirects'))
    writeFileSync(join(s, 'modules.json'), `${JSON.stringify({ $schema: schemaUrl('modules') })}\n`)
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
    expect(before).toMatch(/dist\/run\/_routes\.json belongs at the root/)
    finishNestedLayout(dist, WWW)
    expect(JSON.parse(readFileSync(join(dist, '_routes.json'), 'utf8'))).toEqual(pagesRoutes('/run'))
    expect(readFileSync(join(dist, '_redirects'), 'utf8')).toBe(pagesRedirects(WWW))
    expect(readFileSync(join(dist, '404.html'), 'utf8')).toBe('<a href="/run/modules">home</a>')
    expect(JSON.parse(readFileSync(join(dist, 'schema', 'modules-1.json'), 'utf8')).$id).toBe(schemaUrl('modules'))
    expect(readFileSync(join(dist, 'templates.json'), 'utf8')).toBe('{"templates":[]}\n')
    expect(readFileSync(join(dist, 'picker.json'), 'utf8')).toBe('{"modules":[]}\n')
    expect(readFileSync(join(dist, 'run', 'picker.json'), 'utf8')).toBe('{"modules":[]}\n')
    // modules.json at the root for `mercato module search`, a copy of the site's
    expect(readFileSync(join(dist, 'modules.json'), 'utf8')).toBe(
      readFileSync(join(dist, 'run', 'modules.json'), 'utf8'),
    )
    expect(checkPagesLayout(dist, WWW)).toEqual([])
  })

  it('a noindex build (PAGES_NOINDEX, the preview) adds _headers and a robots.txt that allows nothing', () => {
    expect(noindexFromEnv({ PAGES_NOINDEX: '1' })).toBe(true)
    expect(noindexFromEnv({ PAGES_NOINDEX: 'true' })).toBe(true)
    for (const v of [undefined, '', '0', 'false', 'no'])
      expect(noindexFromEnv({ PAGES_NOINDEX: v }), String(v)).toBe(false)
    expect(NOINDEX_HEADERS).toMatch(/^\/\*\n {2}X-Robots-Tag: noindex\n$/m)
    expect(NOINDEX_ROBOTS).not.toMatch(/Allow|Sitemap/)
    const dist = join(tmp, 'dist')
    site(dist)
    writeFileSync(join(dist, 'run', 'robots.txt'), 'User-agent: *\nAllow: /\n')
    finishNestedLayout(dist, WWW, true)
    expect(readFileSync(join(dist, '_headers'), 'utf8')).toBe(NOINDEX_HEADERS)
    expect(readFileSync(join(dist, 'run', 'robots.txt'), 'utf8')).toBe(NOINDEX_ROBOTS)
    expect(checkPagesLayout(dist, WWW, 50, true)).toEqual([])
    // the same dist is not a production build: its _headers is named
    expect(checkPagesLayout(dist, WWW).join('\n')).toMatch(/dist\/_headers is for a noindex build/)
    // a noindex check of a build without the files names both
    rmSync(join(dist, '_headers'))
    writeFileSync(join(dist, 'run', 'robots.txt'), 'User-agent: *\nAllow: /\n')
    const problems = checkPagesLayout(dist, WWW, 50, true).join('\n')
    expect(problems).toMatch(/dist\/_headers is not NOINDEX_HEADERS/)
    expect(problems).toMatch(/dist\/run\/robots\.txt is not NOINDEX_ROBOTS/)
    // a production build in the same dist removes the _headers of the preview before it starts
    markNoindex(dist, WWW)
    expect(cleanNestedRoot(dist, WWW)).toEqual([])
    // the base folder goes too (Astro writes it again), and nothing of the preview is left at the root
    expect(readdirSync(dist)).toEqual([])
  })

  it('the home page and the data file of the same name sit side by side: modules.html and modules.json', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    finishNestedLayout(dist, WWW)
    expect(readdirSync(join(dist, 'run')).filter((f) => f.startsWith('modules') || f === 'index.html')).toEqual([
      'modules.html',
      'modules.json',
    ])
    expect(checkPagesLayout(dist, WWW)).toEqual([])
    // a page at the base would never be served, and a folder named as the home page would shadow it
    writeFileSync(join(dist, 'run', 'index.html'), '<a href="/run/modules">home</a>')
    mkdirSync(join(dist, 'run', 'modules'))
    const problems = checkPagesLayout(dist, WWW).join('\n')
    expect(problems).toMatch(/dist\/run\/index\.html exists, but the home page is \/run\/modules/)
    expect(problems).toMatch(/dist\/run\/modules collides with the home page \/run\/modules/)
    // a link to the base, a missing home page and the redirects of another layout are named too
    rmSync(join(dist, 'run', 'index.html'))
    rmSync(join(dist, 'run', 'modules'), { recursive: true })
    rmSync(join(dist, 'run', 'modules.html'))
    writeFileSync(join(dist, 'run', 'm', 'x.html'), '<a href="/run/">home</a>')
    writeFileSync(join(dist, '_redirects'), pagesRedirects(PLAIN))
    const more = checkPagesLayout(dist, WWW).join('\n')
    expect(more).toMatch(/dist\/run\/modules\.html is missing/)
    expect(more).toContain('m/x.html: the base, which only redirects to /run/modules: /run/')
    expect(more).toMatch(/_redirects differs from pagesRedirects\(\) for base \/run and home \/modules/)
  })

  it('the check sorts every file of the site by the file rule of the old host', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    finishNestedLayout(dist, WWW)
    mkdirSync(join(dist, 'run', '_astro'))
    mkdirSync(join(dist, 'run', 'fonts'))
    mkdirSync(join(dist, 'run', 'badge'))
    mkdirSync(join(dist, 'run', 'raw'))
    // what pages load, published files of every known kind and the sitemaps: all fine
    for (const f of ['_astro/a.js', 'fonts/g.woff2', 'badge/x.svg', 'raw/modules.md', 'llms.txt', 'm/x.md', 'm/x.json'])
      writeFileSync(join(dist, 'run', f), 'x')
    for (const f of ['sitemap-index.xml', 'sitemap-0.xml', 'feed.xml', 'robots.txt'])
      writeFileSync(join(dist, 'run', f), 'x')
    expect(checkPagesLayout(dist, WWW)).toEqual([])
    // a published file of a kind the rule does not know would answer a redirect on the old host
    writeFileSync(join(dist, 'run', 'export.csv'), 'a,b\n')
    // a page is not checked: its name comes from the data (a package called y.json), and a build must not stop for it
    writeFileSync(join(dist, 'run', 'm', 'y.json.html'), '<a href="/run/modules">home</a>')
    const problems = checkPagesLayout(dist, WWW)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/dist\/run\/export\.csv is not a file the old host serves \(isFilePath\)/)
    // the standalone layout has no such rule
    expect(checkPagesLayout(dist, DEFAULT_SITE).join('\n')).not.toContain('isFilePath')
  })

  it('the check wants the home file to be the home page, by its canonical link', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    finishNestedLayout(dist, WWW)
    expect(checkPagesLayout(dist, WWW)).toEqual([])
    // HOME_PATH named a page that exists already: the file is there, but it is that other page
    writeFileSync(
      join(dist, 'run', 'modules.html'),
      '<link rel="canonical" href="https://www.openmercato.com/run/templates"><a href="/run/m/x">x</a>',
    )
    expect(checkPagesLayout(dist, WWW).join('\n')).toMatch(
      /modules\.html: canonical is https:\/\/www\.openmercato\.com\/run\/templates, not the home page https:\/\/www\.openmercato\.com\/run\/modules/,
    )
  })

  it('without a home path the nested layout keeps the home page at the base', () => {
    const dist = join(tmp, 'dist')
    site(dist, PLAIN)
    finishNestedLayout(dist, PLAIN)
    expect(readFileSync(join(dist, '_redirects'), 'utf8')).toBe(pagesRedirects(PLAIN))
    expect(checkPagesLayout(dist, PLAIN)).toEqual([])
    // the same dist read with the home path: no home page there, and index.html in its place
    const problems = checkPagesLayout(dist, WWW).join('\n')
    expect(problems).toMatch(/dist\/run\/modules\.html is missing/)
    expect(problems).toMatch(/dist\/run\/index\.html exists/)
  })

  it('the check wants templates.json and picker.json at the root as copies of the site files', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    finishNestedLayout(dist, WWW)
    rmSync(join(dist, 'templates.json'))
    writeFileSync(join(dist, 'picker.json'), '{"modules":["stale"]}\n')
    const problems = checkPagesLayout(dist, WWW).join('\n')
    expect(problems).toContain('templates.json is missing (released tools fetch it there)')
    expect(problems).toMatch(/dist\/picker\.json differs from .*dist\/run\/picker\.json/)
    rmSync(join(dist, 'modules.json'))
    expect(checkPagesLayout(dist, WWW).join('\n')).toMatch(/dist\/modules\.json is missing \(released tools fetch it/)
  })

  it('a nested build empties only the known root entries and leaves anything else for the check to flag', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    finishNestedLayout(dist, WWW)
    writeFileSync(join(dist, 'notes.txt'), 'not ours')
    mkdirSync(join(dist, 'm'))
    expect(nestedRootEntries(WWW)).toEqual([
      'run',
      '404.html',
      '_routes.json',
      '_redirects',
      'schema',
      'templates.json',
      'picker.json',
      'modules.json',
    ])
    expect(cleanNestedRoot(dist, WWW).sort()).toEqual(['m', 'notes.txt'])
    expect(readdirSync(dist).sort()).toEqual(['m', 'notes.txt'])
    expect(readFileSync(join(dist, 'notes.txt'), 'utf8')).toBe('not ours')
    expect(nestedRootEntries({ origin: WWW.origin, base: '/a/b', home: '/' })[0]).toBe('a')
    expect(cleanNestedRoot(join(tmp, 'nothing-here'), WWW)).toEqual([])

    // the integration runs it when a build starts and warns about what it left
    site(dist)
    const integration = pagesLayout()
    const setup = integration.hooks['astro:config:setup'] as unknown as (a: unknown) => void
    const start = integration.hooks['astro:build:start'] as unknown as (a: unknown) => void
    setup({
      config: {
        base: '/run',
        site: WWW.origin,
        outDir: pathToFileURL(`${dist}/`),
        root: pathToFileURL(`${tmp}/`),
      },
      command: 'build',
      updateConfig: () => {},
    })
    const warn = vi.fn()
    start({ logger: { warn } })
    expect(readdirSync(dist).sort()).toEqual(['m', 'notes.txt'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('m, notes.txt'))
  })

  it('the check names a link outside the base, a stray root file, a wrong $id and a root layout mismatch', () => {
    const dist = join(tmp, 'dist')
    site(dist)
    finishNestedLayout(dist, WWW)
    writeFileSync(join(dist, 'run', 'm', 'x.html'), '<a href="/m/y">y</a>')
    writeFileSync(join(dist, 'index.html'), 'stale root page')
    writeFileSync(join(dist, 'schema', 'tools-1.json'), JSON.stringify({ $id: 'https://www.openmercato.com/x' }))
    const problems = checkPagesLayout(dist, WWW).join('\n')
    expect(problems).toContain('m/x.html: outside /run: /m/y')
    expect(problems).toContain('index.html sits outside the site')
    expect(problems).toContain('tools-1.json: $id is https://www.openmercato.com/x')
    // the same dist read as a root build: wrong routes and redirects
    expect(checkPagesLayout(dist, DEFAULT_SITE).join('\n')).toContain('_routes.json is not')
  })

  it('the e2e server serves a nested build from its site folder and a flat one from dist (no prefix cut)', () => {
    const dist = join(tmp, 'dist')
    // a build with a home path has no index.html in its site folder: 404.html tells where the site is
    site(dist)
    expect(siteFolder(dist, '/run')).toBe(join(dist, 'run'))
    expect(siteFolder(dist, '/')).toBe(dist)
    expect(siteFolder(join(dist, 'run'), '/run')).toBe(join(dist, 'run'))
    expect(isBuilt(dist, '/run')).toBe(true)
    expect(isBuilt(join(tmp, 'nothing-here'), '/run')).toBe(false)
  })

  it('the e2e server reads the static rules of _redirects and skips comments and splats', () => {
    const rules = staticRedirects('# a comment\n/a /b 301\n\n/c /d\n/e/* /f/:splat 302\n/a /z 302\n')
    expect([...rules]).toEqual([
      ['/a', { to: '/b', status: 301 }],
      ['/c', { to: '/d', status: 302 }],
    ])
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
    setup({ config: config('/run', join(tmp, 'dist')), command: 'build', updateConfig })
    expect(updateConfig).toHaveBeenCalledWith({ outDir: pathToFileURL(`${join(tmp, 'dist', 'run')}/`) })
    expect(() => setup({ config: config('/run', tmp), command: 'build', updateConfig })).toThrow(/holds the project/)
  })

  it('yarn om pages-site writes functions/site.ts and --check compares it and the layout', () => {
    const env = {
      SITE_URL: process.env.SITE_URL,
      BASE_PATH: process.env.BASE_PATH,
      HOME_PATH: process.env.HOME_PATH,
      PAGES_NOINDEX: process.env.PAGES_NOINDEX,
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mkdirSync(join(tmp, 'functions'))
      process.env.SITE_URL = 'https://www.openmercato.com'
      process.env.BASE_PATH = '/run'
      process.env.HOME_PATH = '/modules'
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
        'functions/site.ts is not for https://www.openmercato.com/run',
      )
      expect(pagesSite(ctx([]))).toBe(0)
      expect(readFileSync(join(tmp, 'functions', 'site.ts'), 'utf8')).toBe(siteModule(WWW))
      expect(pagesSite(ctx(['--check', dist]))).toBe(0)
      expect(log.mock.calls.flat().join('\n')).toContain('(base /run, home /run/modules)')
      // the same dist without HOME_PATH: functions/site.ts and the layout are for another home page
      delete process.env.HOME_PATH
      error.mockClear()
      expect(pagesSite(ctx(['--check', dist]))).toBe(1)
      expect(error.mock.calls.flat().join('\n')).toMatch(/run\/index\.html is missing/)
      // a home path the layout cannot hold
      process.env.HOME_PATH = '/a/b'
      expect(pagesSite(ctx([]))).toBe(2)
      process.env.HOME_PATH = '/modules'
      // a nested site on a host of the Pages project: refused, functions/site.ts left as it was
      error.mockClear()
      process.env.SITE_URL = 'https://modules.openmercato.com'
      expect(pagesSite(ctx([]))).toBe(2)
      expect(pagesSite(ctx(['--check', dist]))).toBe(2)
      expect(error.mock.calls.flat().join('\n')).toContain('is a host of the Pages project')
      expect(readFileSync(join(tmp, 'functions', 'site.ts'), 'utf8')).toBe(siteModule(WWW))
      process.env.SITE_URL = 'https://www.openmercato.com'
      // PAGES_NOINDEX: the check wants the noindex files, and the root layout has none
      error.mockClear()
      process.env.PAGES_NOINDEX = '1'
      expect(pagesSite(ctx(['--check', dist]))).toBe(1)
      expect(error.mock.calls.flat().join('\n')).toMatch(/_headers is not NOINDEX_HEADERS/)
      markNoindex(dist, WWW)
      expect(pagesSite(ctx(['--check', dist]))).toBe(0)
      expect(log.mock.calls.flat().join('\n')).toContain('home /run/modules, noindex)')
      process.env.BASE_PATH = '/'
      delete process.env.HOME_PATH
      expect(pagesSite(ctx([]))).toBe(2)
      expect(error.mock.calls.flat().join('\n')).toContain('PAGES_NOINDEX needs a BASE_PATH other than /')
      delete process.env.PAGES_NOINDEX
      process.env.HOME_PATH = '/modules'
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
