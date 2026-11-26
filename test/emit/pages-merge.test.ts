// The merged layout of the Pages upload (www site migration spec, Phase 1a): fixture builds of the main site
// (dist-www/) and of the nested catalog (dist-run/, laid out by finishNestedLayout as a real build does), merged and
// checked as `yarn om pages-site --merge` and `--check dist` do in pages.yml.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answer } from '../../functions/_middleware.ts'
import pagesSite from '../../lib/commands/pages-site.ts'
import { schemaUrl } from '../../lib/core/home.ts'
import {
  hostFile,
  hostRedirect,
  MAIN_SITE_RUN,
  mainSiteRun,
  mergedFromEnv,
  NOINDEX_HEADERS,
  NOINDEX_ROBOTS,
  pagesRedirects,
  siteModule,
  type SiteConfig,
} from '../../lib/core/site-host.ts'
import { checkPagesLayout, finishNestedLayout } from '../../lib/emit/pages-layout.ts'
import {
  absoluteServedHrefs,
  checkMergedLayout,
  localizeHrefs,
  mergeConfigProblem,
  mergedRedirects,
  mergedRobots,
  mergePagesSite,
  REDIRECT_CHECK,
  redirectProblems,
  redirectRules,
  servedLocalHref,
  servesPath,
  sitemapIndexXml,
  sitemapLocs,
} from '../../lib/emit/pages-merge.ts'
import { wwwRedirectsText } from '../../lib/emit/www-redirects.ts'
import { PUBLISHED_SCHEMAS } from '../../lib/schema/json-schema.ts'

const WWW: SiteConfig = { origin: 'https://www.openmercato.com', base: '/run', home: '/modules', merged: true }
const ORIGIN = WWW.origin

function put(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/** A nested catalog build in `dir` (dist-run): pages, data files and sitemaps under /run, then its root files. */
function runBuild(dir: string, noindex = false): void {
  const s = join(dir, 'run')
  put(
    join(s, 'modules.html'),
    `<link rel="canonical" href="${ORIGIN}/run/modules"><a href="/run/m/x">x</a>` +
      `<a href="${ORIGIN}/product">Product</a><a href="${ORIGIN}/">Open Mercato</a>`,
  )
  put(join(s, 'm', 'x.html'), '<a href="/run/modules">home</a>')
  put(join(s, '404.html'), '<a href="/run/modules">home</a>')
  put(join(s, 'fonts', 'Geist-Regular.woff2'), 'font')
  put(join(s, 'favicon.png'), 'png')
  put(join(s, 'modules.json'), `${JSON.stringify({ $schema: schemaUrl('modules') })}\n`)
  put(join(s, 'templates.json'), '{"templates":[]}\n')
  put(join(s, 'picker.json'), '{"modules":[]}\n')
  put(join(s, 'robots.txt'), 'User-agent: *\nAllow: /\n')
  put(join(s, 'sitemap-index.xml'), sitemapIndexXml([`${ORIGIN}/run/sitemap-0.xml`]))
  put(join(s, 'sitemap-0.xml'), `<urlset><url><loc>${ORIGIN}/run/modules</loc></url></urlset>`)
  for (const n of PUBLISHED_SCHEMAS) put(join(s, 'schema', `${n}-1.json`), JSON.stringify({ $id: schemaUrl(n) }))
  finishNestedLayout(dir, WWW, noindex)
}

/** A main site build in `dir` (dist-www): the home page, the 404 page, a stylesheet and its sitemaps. */
function wwwBuild(dir: string): void {
  put(
    join(dir, 'index.html'),
    `<link rel="canonical" href="${ORIGIN}/"><link rel="stylesheet" href="/_astro/Base.css">` +
      '<link rel="preload" href="/run/fonts/Geist-Regular.woff2"><link rel="icon" href="/run/favicon.png">' +
      `<a href="/run/modules">Run</a><a href="${ORIGIN}/product">Product</a><a href="https://github.com/x">GitHub</a>`,
  )
  put(join(dir, '404.html'), '<a href="/">home</a><a href="/run/modules">Run</a>')
  put(join(dir, '_astro', 'Base.css'), 'body{}')
  put(join(dir, 'sitemap-index.xml'), sitemapIndexXml([`${ORIGIN}/sitemap-0.xml`]))
  put(join(dir, 'sitemap-0.xml'), `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`)
}

describe('the merged layout (pages-site --merge)', () => {
  let tmp: string
  let dirs: { www: string; run: string; out: string }
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'om-pages-merge-'))
    dirs = { www: join(tmp, 'dist-www'), run: join(tmp, 'dist-run'), out: join(tmp, 'dist') }
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('lays the main site at the root and the catalog under /run, and the check passes', () => {
    runBuild(dirs.run)
    wwwBuild(dirs.www)
    const r = mergePagesSite(dirs, WWW)
    expect(r.sitemaps).toEqual([`${ORIGIN}/sitemap-0.xml`, `${ORIGIN}/run/sitemap-0.xml`])
    const at = (f: string): string => readFileSync(join(dirs.out, f), 'utf8')
    expect(at('index.html')).toBe(readFileSync(join(dirs.www, 'index.html'), 'utf8'))
    // the main site's 404 at the root; the catalog keeps its own under the base
    expect(at('404.html')).toBe(readFileSync(join(dirs.www, '404.html'), 'utf8'))
    expect(at('run/404.html')).toBe('<a href="/run/modules">home</a>')
    expect(at('_redirects')).toBe(mergedRedirects(WWW))
    expect(at('_redirects')).toContain('/sitemap.xml /sitemap-index.xml 301\n')
    expect(at('_redirects').endsWith(pagesRedirects(WWW))).toBe(true)
    expect(at('robots.txt')).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap-index.xml\n`)
    expect(sitemapLocs(at('sitemap-index.xml'))).toEqual(r.sitemaps)
    // the catalog's fixed root files and Functions route list stay until Phase 1c
    for (const f of ['_routes.json', 'modules.json', 'templates.json', 'picker.json', 'schema/modules-1.json'])
      expect(existsSync(join(dirs.out, f)), f).toBe(true)
    expect(existsSync(join(dirs.out, '_headers'))).toBe(false)
    // a production upload: every main site page the header links must be in the build (Pages answers it, not Webflow)
    const before = checkMergedLayout(dirs.out, WWW)
    expect(before.pending).toEqual([])
    expect(before.problems).toHaveLength(2)
    expect(before.problems[0]).toMatch(
      /dist\/run\/modules\.html: not a page or a file of this build: https:\/\/www\.openmercato\.com\/product$/,
    )
    expect(before.problems[1]).toMatch(
      /dist\/index\.html: https:\/\/www\.openmercato\.com\/product is not a page or a file of this build$/,
    )
    put(join(dirs.www, 'product.html'), '<a href="/">home</a>')
    mergePagesSite(dirs, WWW)
    expect(checkMergedLayout(dirs.out, WWW)).toEqual({ problems: [], pending: [] })
  })

  it('a noindex preview may link main site pages Webflow still serves, and lists them', () => {
    runBuild(dirs.run, true)
    wwwBuild(dirs.www)
    mergePagesSite(dirs, WWW, true)
    // the header's link to a page Webflow still serves; the home page is in this build
    expect(checkMergedLayout(dirs.out, WWW, 50, true)).toEqual({ problems: [], pending: [`${ORIGIN}/product`] })
    // a link to a unique page the main site does not build is a problem even in a preview (Phase 6 built them all)
    put(join(dirs.www, 'careers-jobs', 'j.html'), `<a href="${ORIGIN}/careers">x</a>`)
    mergePagesSite(dirs, WWW, true)
    expect(checkMergedLayout(dirs.out, WWW, 50, true).problems.join('\n')).toMatch(/\/careers is not a page/)
    rmSync(join(dirs.www, 'careers-jobs', 'j.html'))
    // the detail pages of the collections are built since Phase 4: a link to one that is not built is a problem even
    // in a preview
    put(join(dirs.www, 'blog-posts', 'p.html'), `<a href="${ORIGIN}/case-studies/acme-erp">x</a>`)
    mergePagesSite(dirs, WWW, true)
    expect(checkMergedLayout(dirs.out, WWW, 50, true).problems.join('\n')).toMatch(
      /\/case-studies\/acme-erp is not a page/,
    )
    rmSync(join(dirs.www, 'blog-posts', 'p.html'))
    // a link that no header or footer of lib/core/main-site.ts names is a problem even in a preview
    put(join(dirs.www, 'team.html'), `<a href="${ORIGIN}/not-on-webflow">x</a>`)
    mergePagesSite(dirs, WWW, true)
    expect(checkMergedLayout(dirs.out, WWW, 50, true).problems.join('\n')).toMatch(/\/not-on-webflow is not a page/)
  })

  it('refuses a catalog build made for the other kind of upload (PAGES_NOINDEX)', () => {
    runBuild(dirs.run, true)
    wwwBuild(dirs.www)
    expect(() => mergePagesSite(dirs, WWW)).toThrow(
      /dist-run is a noindex build \(PAGES_NOINDEX\), and this merge is not one/,
    )
    rmSync(dirs.run, { recursive: true })
    runBuild(dirs.run)
    expect(() => mergePagesSite(dirs, WWW, true)).toThrow(
      /dist-run is not a noindex build \(PAGES_NOINDEX\), and this merge is one/,
    )
  })

  it('a noindex preview gets _headers and a robots.txt that allows nothing at the root', () => {
    runBuild(dirs.run, true)
    wwwBuild(dirs.www)
    mergePagesSite(dirs, WWW, true)
    expect(readFileSync(join(dirs.out, '_headers'), 'utf8')).toBe(NOINDEX_HEADERS)
    expect(readFileSync(join(dirs.out, 'robots.txt'), 'utf8')).toBe(NOINDEX_ROBOTS)
    expect(readFileSync(join(dirs.out, 'run', 'robots.txt'), 'utf8')).toBe(NOINDEX_ROBOTS)
    expect(checkMergedLayout(dirs.out, WWW, 50, true).problems).toEqual([])
    expect(checkMergedLayout(dirs.out, WWW).problems.join('\n')).toMatch(/_headers is for a noindex build/)
  })

  it('a new merge empties the upload folder first', () => {
    runBuild(dirs.run)
    wwwBuild(dirs.www)
    put(join(dirs.out, 'stale.html'), 'old')
    mergePagesSite(dirs, WWW)
    expect(existsSync(join(dirs.out, 'stale.html'))).toBe(false)
  })

  it('refuses a config the merged layout cannot hold', () => {
    expect(mergeConfigProblem({ ...WWW, base: '/', home: '/' })).toMatch(/needs the catalog under a base path/)
    expect(mergeConfigProblem({ ...WWW, origin: 'https://example.com' })).toMatch(/serves https:\/\/www/)
    expect(mergeConfigProblem(WWW)).toBeNull()
    runBuild(dirs.run)
    wwwBuild(dirs.www)
    expect(() => mergePagesSite(dirs, { ...WWW, origin: 'https://example.com' })).toThrow(/serves/)
  })

  it('refuses builds that would overwrite each other, before touching the upload', () => {
    runBuild(dirs.run)
    wwwBuild(dirs.www)
    put(join(dirs.out, 'keep.txt'), 'kept')
    for (const name of ['run/x.html', 'modules.json', 'schema/x.json', '_routes.json', 'robots.txt']) {
      put(join(dirs.www, name), 'x')
      expect(() => mergePagesSite(dirs, WWW), name).toThrow(/the catalog or the merge owns at the root/)
      rmSync(join(dirs.www, name.split('/')[0] as string), { recursive: true })
    }
    expect(readFileSync(join(dirs.out, 'keep.txt'), 'utf8')).toBe('kept')
    put(join(dirs.run, 'about.html'), 'a root build left behind')
    expect(() => mergePagesSite(dirs, WWW)).toThrow(/about\.html outside the nested layout/)
    rmSync(join(dirs.run, 'about.html'))
    rmSync(join(dirs.www, 'index.html'))
    expect(() => mergePagesSite(dirs, WWW)).toThrow(/dist-www\/index\.html is missing/)
    expect(() => mergePagesSite({ ...dirs, out: dirs.www }, WWW)).toThrow(/holds a build/)
    expect(() => mergePagesSite({ ...dirs, out: tmp }, WWW)).toThrow(/holds a build/)
    rmSync(dirs.run, { recursive: true })
    expect(() => mergePagesSite(dirs, WWW)).toThrow(/does not exist/)
  })

  it('checks links from /run to the main site against the routes the main site build wrote', () => {
    runBuild(dirs.run)
    wwwBuild(dirs.www)
    put(join(dirs.www, 'product.html'), '<a href="/">home</a>')
    // a root-relative link from a catalog page reaches this deployment: only a page the main site built answers
    put(join(dirs.run, 'run', 'about.html'), '<a href="/blog">Blog</a><a href="/sitemap.xml">sitemap</a>')
    mergePagesSite(dirs, WWW)
    const problems = checkMergedLayout(dirs.out, WWW).problems
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/dist\/run\/about\.html: not a page or a file of this build: \/blog$/)
    put(join(dirs.www, 'blog.html'), '<a href="/">home</a>')
    mergePagesSite(dirs, WWW)
    expect(checkMergedLayout(dirs.out, WWW).problems).toEqual([])
  })

  it('checks every link of the main site pages, its reserved names and its home canonical', () => {
    runBuild(dirs.run)
    wwwBuild(dirs.www)
    put(join(dirs.www, 'team.html'), '<a href="/nowhere">x</a><a href="/run/missing">y</a><img src="/media/a.png">')
    put(join(dirs.www, 'docs.html'), '<a href="/">home</a>')
    // a collection's list page and its detail pages (spec, Routing) are pages
    put(join(dirs.www, 'case-studies.html'), '<a href="/case-studies/acme">Acme</a>')
    put(join(dirs.www, 'case-studies', 'acme.html'), '<a href="/case-studies">all</a>')
    put(join(dirs.www, 'index.html'), '<link rel="canonical" href="https://www.openmercato.com/home">')
    mergePagesSite(dirs, WWW)
    const problems = checkMergedLayout(dirs.out, WWW).problems.join('\n')
    expect(problems).toMatch(/team\.html: \/nowhere is not a page or a file of this build/)
    expect(problems).toMatch(/team\.html: \/run\/missing is not a page or a file of this build/)
    expect(problems).toMatch(/team\.html: \/media\/a\.png is not a page or a file of this build/)
    expect(problems).toMatch(/docs\.html: \/docs is not a page of the main site/)
    expect(problems).not.toMatch(/case-studies/)
    expect(problems).toMatch(/index\.html: canonical is https:\/\/www\.openmercato\.com\/home, not https:\/\/www/)
  })

  it('checks the merged root files: _redirects, robots.txt and the sitemap index', () => {
    runBuild(dirs.run)
    wwwBuild(dirs.www)
    mergePagesSite(dirs, WWW)
    writeFileSync(join(dirs.out, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
    writeFileSync(join(dirs.out, '_redirects'), `${mergedRedirects(WWW)}/a /b 301\n`)
    writeFileSync(
      join(dirs.out, 'sitemap-index.xml'),
      sitemapIndexXml([`${ORIGIN}/run/sitemap-index.xml`, 'https://example.com/sitemap-0.xml', `${ORIGIN}/x.xml`]),
    )
    const problems = checkMergedLayout(dirs.out, WWW).problems.join('\n')
    expect(problems).toMatch(/_redirects: the main site's rules does not begin with/)
    expect(problems).toMatch(/robots\.txt is not mergedRobots\(\)/)
    expect(problems).toMatch(/lists the index https:\/\/www\.openmercato\.com\/run\/sitemap-index\.xml/)
    expect(problems).toMatch(/https:\/\/example\.com\/sitemap-0\.xml is not on https:\/\/www/)
    expect(problems).toMatch(/https:\/\/www\.openmercato\.com\/x\.xml is not in the build/)
    expect(problems).toMatch(/does not list https:\/\/www\.openmercato\.com\/sitemap-0\.xml/)
    expect(problems).toMatch(/does not list https:\/\/www\.openmercato\.com\/run\/sitemap-0\.xml/)
    rmSync(join(dirs.out, 'robots.txt'))
    expect(checkMergedLayout(dirs.out, WWW).problems.join('\n')).toMatch(/robots\.txt is missing/)
  })

  it('counts _redirects rules as Pages does and keeps a margin below its limits', () => {
    expect(redirectRules('# c\n/a /b 301\n/x/* /y/:splat 301\n/p/:id /q 301\n\n')).toEqual([
      { from: '/a', dynamic: false },
      { from: '/x/*', dynamic: true },
      { from: '/p/:id', dynamic: true },
    ])
    expect(redirectProblems(mergedRedirects(WWW))).toEqual([])
    const statics = Array.from({ length: REDIRECT_CHECK.static + 1 }, (_, i) => `/s${i} /t 301`).join('\n')
    expect(redirectProblems(statics)).toEqual(['1801 static redirects; the check allows 1800 (Pages 2000)'])
    const dynamics = Array.from({ length: REDIRECT_CHECK.dynamic + 1 }, (_, i) => `/d${i}/* /t 301`).join('\n')
    expect(redirectProblems(dynamics)).toEqual(['91 dynamic redirects; the check allows 90 (Pages 100)'])
    expect(redirectProblems('/a /b 301\n/a /c 301\n')).toEqual(['the redirect from /a is given twice'])
  })

  it('serves a path as Pages does: files, pages with or without the trailing slash, and redirect sources', () => {
    put(join(tmp, 'blog.html'), 'x')
    put(join(tmp, 'careers', 'index.html'), 'x')
    put(join(tmp, 'media', 'a.png'), 'x')
    const rules = redirectRules(
      '/sitemap.xml /sitemap-index.xml 301\n/docs/* https://docs.openmercato.com/ 301\n/p/:id /q 301\n',
    )
    for (const p of ['/blog', '/blog/', '/careers', '/careers/', '/media/a.png', '/sitemap.xml', '/docs/x/y', '/p/1'])
      expect(servesPath(tmp, p, rules), p).toBe(true)
    for (const p of ['/nope', '/media/b.png', '/docs', '/p/1/2', '/../etc/passwd', '/%E0%A4%A'])
      expect(servesPath(tmp, p, rules), p).toBe(false)
  })

  it('writes the sitemap index in the shape @astrojs/sitemap does and reads it back', () => {
    const text = sitemapIndexXml([`${ORIGIN}/sitemap-0.xml`, `${ORIGIN}/a&b.xml`])
    expect(text).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        `<sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap><sitemap><loc>${ORIGIN}/a&amp;b.xml</loc></sitemap>` +
        '</sitemapindex>',
    )
    expect(sitemapLocs(text)).toEqual([`${ORIGIN}/sitemap-0.xml`, `${ORIGIN}/a&b.xml`])
    expect(mergedRobots(WWW, true)).toBe(NOINDEX_ROBOTS)
  })

  it('yarn om pages-site --merge needs PAGES_MERGED, and --check then proves the merged layout', () => {
    const keys = ['SITE_URL', 'BASE_PATH', 'HOME_PATH', 'PAGES_NOINDEX', 'PAGES_MERGED'] as const
    const env = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = (args: string[]) => ({
      args,
      root: tmp,
      flags: { data: '.data', out: 'out', offline: false, json: false },
    })
    try {
      mkdirSync(join(tmp, 'functions'))
      // the www-preview job: a noindex preview, where the header may still link Webflow
      Object.assign(process.env, { SITE_URL: ORIGIN, BASE_PATH: '/run', HOME_PATH: '/modules', PAGES_NOINDEX: '1' })
      delete process.env.PAGES_MERGED
      runBuild(dirs.run, true)
      wwwBuild(dirs.www)
      expect(pagesSite(ctx(['--merge']))).toBe(2)
      expect(error.mock.calls.flat().join('\n')).toContain('--merge needs PAGES_MERGED=1')
      process.env.PAGES_MERGED = '1'
      expect(pagesSite(ctx(['--merge', '--check', 'dist']))).toBe(2)
      expect(pagesSite(ctx(['--merge']))).toBe(0)
      expect(log.mock.calls.flat().join('\n')).toMatch(/dist\/ merged from dist-www\/ \(\d+ files\) and dist-run\//)
      // functions/site.ts first carries the merged flag; the check wants it
      expect(pagesSite(ctx(['--check', dirs.out]))).toBe(1)
      expect(pagesSite(ctx([]))).toBe(0)
      expect(readFileSync(join(tmp, 'functions', 'site.ts'), 'utf8')).toBe(siteModule(WWW))
      log.mockClear()
      expect(pagesSite(ctx(['--check', dirs.out]))).toBe(0)
      const out = log.mock.calls.flat().join('\n')
      expect(out).toContain('(merged, base /run, home /run/modules, noindex)')
      expect(out).toContain(
        'main site addresses linked but not in this build yet (Webflow serves them until the switch): 1',
      )
      // the merged layout lives on the main site's origin only
      process.env.SITE_URL = 'https://example.com'
      error.mockClear()
      expect(pagesSite(ctx([]))).toBe(2)
      expect(error.mock.calls.flat().join('\n')).toContain('PAGES_MERGED: the merged layout serves')
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

describe('the Functions in the merged layout (until Phase 1c)', () => {
  const preview = 'https://www-preview.open-mercato-modules.pages.dev'

  it('leave a *.pages.dev address alone: its root and its files are the main site', () => {
    const nested: SiteConfig = { ...WWW, merged: undefined }
    expect(hostRedirect(`${preview}/`, nested)?.location).toBe(`${preview}/run/modules`)
    expect(hostFile(`${preview}/robots.txt`, nested)).toBe('/run/robots.txt')
    expect(hostRedirect(`${preview}/`, WWW)).toBeNull()
    expect(hostFile(`${preview}/robots.txt`, WWW)).toBeNull()
    expect(hostFile(`${preview}/media/a.png`, WWW)).toBeNull()
  })

  it('still move the old hosts as in the nested layout', () => {
    expect(hostRedirect('https://modules.openmercato.com/', WWW)).toEqual({
      location: `${ORIGIN}/run/modules`,
      status: 302,
    })
    expect(hostRedirect('https://modules.openmercato.com/m/x', WWW)?.location).toBe(`${ORIGIN}/run/m/x`)
    expect(hostFile('https://modules.openmercato.com/llms.txt', WWW)).toBe('/run/llms.txt')
  })

  it('the middleware passes a preview request through to the static files', async () => {
    const next = vi.fn(async () => new Response('static'))
    const res = await answer({ request: new Request(`${preview}/`), next }, WWW)
    expect(await res.text()).toBe('static')
  })

  it('functions/site.ts names the merged layout only when it is one', () => {
    expect(siteModule(WWW)).toContain("home: '/modules', merged: true }")
    expect(siteModule({ ...WWW, merged: undefined })).toContain("home: '/modules' }")
    expect(mergedFromEnv({ PAGES_MERGED: '1' })).toBe(true)
    expect(mergedFromEnv({ PAGES_MERGED: ' 1 ' })).toBe(true)
    // only the value the steps of pages.yml test for
    for (const v of [undefined, '', '0', 'no', 'true']) expect(mergedFromEnv({ PAGES_MERGED: v })).toBe(false)
  })

  it('the main site links the catalog where the build nests it, else at /run/modules', () => {
    expect(mainSiteRun({})).toEqual(MAIN_SITE_RUN)
    expect(mainSiteRun({ BASE_PATH: '/' })).toEqual(MAIN_SITE_RUN)
    expect(mainSiteRun({ BASE_PATH: '/run', HOME_PATH: '/modules' })).toEqual({ base: '/run', home: '/modules' })
    expect(mainSiteRun({ BASE_PATH: '/apps' })).toEqual({ base: '/apps', home: '/' })
  })
})

describe('links of the merged layout to pages it serves (owner decision of 26 Nov 2026)', () => {
  const served = new Set(['/', '/crm', '/contact', '/blog-posts/x', '/run/modules'])
  const serves = (p: string): boolean => served.has(p)

  it('makes a main site address of a served path root relative, query and fragment kept', () => {
    expect(servedLocalHref(`${ORIGIN}/crm`, serves)).toBe('/crm')
    expect(servedLocalHref(`${ORIGIN}/contact?interest=hubspot-alternative`, serves)).toBe(
      '/contact?interest=hubspot-alternative',
    )
    expect(servedLocalHref(`${ORIGIN}/contact?a=1&amp;b=2#form`, serves)).toBe('/contact?a=1&amp;b=2#form')
    expect(servedLocalHref(`${ORIGIN}/run/modules`, serves)).toBe('/run/modules')
    expect(servedLocalHref(ORIGIN, serves)).toBe('/')
    expect(servedLocalHref(`${ORIGIN}?x=1`, serves)).toBe('/?x=1')
    // the apex, plain http and a scheme-relative address name the same site
    expect(servedLocalHref('https://openmercato.com/', serves)).toBe('/')
    expect(servedLocalHref('http://www.openmercato.com/crm', serves)).toBe('/crm')
    expect(servedLocalHref('//www.openmercato.com/blog-posts/x', serves)).toBe('/blog-posts/x')
    expect(servedLocalHref('HTTPS://WWW.OPENMERCATO.COM/crm', serves)).toBe('/crm')
  })

  it('leaves alone paths it does not serve, other hosts and paths a browser reads as a host', () => {
    expect(servedLocalHref(`${ORIGIN}/pricing`, serves)).toBeNull()
    expect(servedLocalHref('https://docs.openmercato.com/', serves)).toBeNull()
    expect(servedLocalHref('https://www.openmercato.com.example.com/crm', serves)).toBeNull()
    expect(servedLocalHref('https://github.com/open-mercato/open-mercato', serves)).toBeNull()
    expect(servedLocalHref('/crm', serves)).toBeNull()
    expect(servedLocalHref(`${ORIGIN}//evil.example/`, () => true)).toBeNull()
    expect(servedLocalHref(`${ORIGIN}/\\evil.example/`, () => true)).toBeNull()
  })

  it('rewrites hrefs of the markup only: not canonical, alternate, scripts, styles or other attributes', () => {
    const html =
      `<link rel="canonical" href="${ORIGIN}/crm"><link rel="alternate" hreflang="pl" href="${ORIGIN}/crm">` +
      `<meta property="og:url" content="${ORIGIN}/crm">` +
      `<script type="application/ld+json">{"url":"${ORIGIN}/crm","x":"<a href=\\"${ORIGIN}/crm\\">"}</script>` +
      `<style>a[href="${ORIGIN}/crm"]{}</style>` +
      `<a class="navbar_link" data-x="a>b" href="${ORIGIN}/crm" data-om-cta="nav">CRM</a>` +
      `<a href='${ORIGIN}/contact?interest=x&amp;y=1'>Contact</a>` +
      `<a href="${ORIGIN}/pricing">Pricing</a><a title="${ORIGIN}/crm" href="https://github.com/x">GitHub</a>`
    const r = localizeHrefs(html, serves)
    expect(r.links).toBe(2)
    expect(r.html).toBe(
      html
        .replace(`data-x="a>b" href="${ORIGIN}/crm"`, 'data-x="a>b" href="/crm"')
        .replace(`href='${ORIGIN}/contact?interest=x&amp;y=1'`, "href='/contact?interest=x&amp;y=1'"),
    )
    expect(absoluteServedHrefs(r.html, serves)).toEqual([])
    expect(absoluteServedHrefs(html, serves)).toEqual([
      { ref: `${ORIGIN}/crm`, local: '/crm' },
      { ref: `${ORIGIN}/contact?interest=x&y=1`, local: '/contact?interest=x&y=1' },
    ])
  })

  it('never turns a link into one a browser reads as another host', () => {
    // the URL parser drops tabs and newlines: `/\t/evil.example` would be `//evil.example`
    expect(servedLocalHref(`${ORIGIN}/\t/evil.example/`, () => true)).toBeNull()
    expect(servedLocalHref(`${ORIGIN}/\n/evil.example/`, () => true)).toBeNull()
    expect(servedLocalHref(`${ORIGIN}/cr\tm`, () => true)).toBeNull()
    // the spaces a browser trims around a value
    expect(servedLocalHref(` ${ORIGIN}/crm `, serves)).toBe('/crm')
  })

  it('reads the href attribute itself, in any tag, quoted or not, and keeps comments as they are', () => {
    const html =
      `<a title="see href='${ORIGIN}/crm'" href="${ORIGIN}/crm">CRM</a>` +
      `<a href=${ORIGIN}/crm>CRM</a><A HREF="${ORIGIN}/crm">CRM</A>` +
      `<LINK REL="Canonical" HREF="${ORIGIN}/crm"><link rel=alternate href=${ORIGIN}/crm>` +
      `<link rel="stylesheet" href="${ORIGIN}/crm">` +
      `<template><a href="${ORIGIN}/crm">CRM</a></template><svg><use href="${ORIGIN}/crm#icon"></use></svg>` +
      `<!-- <script> --><a href="${ORIGIN}/contact">Contact</a><!-- <a href="${ORIGIN}/crm"> -->`
    const r = localizeHrefs(html, serves)
    expect(r.html).toBe(
      `<a title="see href='${ORIGIN}/crm'" href="/crm">CRM</a>` +
        '<a href="/crm">CRM</a><A HREF="/crm">CRM</A>' +
        `<LINK REL="Canonical" HREF="${ORIGIN}/crm"><link rel=alternate href=${ORIGIN}/crm>` +
        '<link rel="stylesheet" href="/crm">' +
        '<template><a href="/crm">CRM</a></template><svg><use href="/crm#icon"></use></svg>' +
        `<!-- <script> --><a href="/contact">Contact</a><!-- <a href="${ORIGIN}/crm"> -->`,
    )
    expect(r.links).toBe(7)
  })

  it('the check reads hrefs more loosely than the rewrite, so a doubt fails it', () => {
    // a value the rewrite would not take as it is, and the text of another attribute
    expect(absoluteServedHrefs(`<a href="${ORIGIN}/crm" title="x href=${ORIGIN}/contact">x</a>`, serves)).toEqual([
      { ref: `${ORIGIN}/crm`, local: '/crm' },
      { ref: `${ORIGIN}/contact`, local: '/contact' },
    ])
    // canonical and alternate, comments, scripts and styles are not links of the page
    expect(
      absoluteServedHrefs(
        `<link rel="canonical" data-x="a>b" href="${ORIGIN}/crm"><LINK REL=ALTERNATE HREF=${ORIGIN}/crm>` +
          `<!-- <a href="${ORIGIN}/crm"> --><script>x='<a href="${ORIGIN}/crm">'</script>`,
        serves,
      ),
    ).toEqual([])
  })

  describe('in an upload', () => {
    let tmp: string
    let dirs: { www: string; run: string; out: string }
    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'om-pages-links-'))
      dirs = { www: join(tmp, 'dist-www'), run: join(tmp, 'dist-run'), out: join(tmp, 'dist') }
    })
    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true })
    })

    it('merged: the merge decides from the files it composed, on both parts of the upload', () => {
      runBuild(dirs.run)
      wwwBuild(dirs.www)
      put(join(dirs.www, 'product.html'), `<a href="${ORIGIN}/run/modules">Run</a><a href="${ORIGIN}/pricing">x</a>`)
      const r = mergePagesSite(dirs, WWW)
      const at = (f: string): string => readFileSync(join(dirs.out, f), 'utf8')
      // the shared header's links on a catalog page and on a main site page
      expect(at('run/modules.html')).toBe(
        `<link rel="canonical" href="${ORIGIN}/run/modules"><a href="/run/m/x">x</a>` +
          '<a href="/product">Product</a><a href="/">Open Mercato</a>',
      )
      expect(at('index.html')).toContain('<a href="/product">Product</a><a href="https://github.com/x">GitHub</a>')
      expect(at('index.html')).toContain(`<link rel="canonical" href="${ORIGIN}/">`)
      // a page of the catalog, and a page this upload does not serve, which stays absolute
      expect(at('product.html')).toBe(`<a href="/run/modules">Run</a><a href="${ORIGIN}/pricing">x</a>`)
      expect(r).toMatchObject({ localLinks: 4, localFiles: 3 })
    })

    it('merged: a path is served by a file, a directory index or a rule of _redirects', () => {
      runBuild(dirs.run)
      wwwBuild(dirs.www)
      put(join(dirs.www, 'product.html'), '<a href="/">home</a>')
      put(join(dirs.www, 'blog', 'index.html'), '<a href="/">home</a>')
      put(
        join(dirs.www, '_redirects'),
        wwwRedirectsText([
          { from: '/docs/*', to: 'https://docs.openmercato.com/:splat', status: 301, source: 'docs-map' },
        ]),
      )
      put(
        join(dirs.www, 'team.html'),
        `<a href="${ORIGIN}/blog/">Blog</a><a href="${ORIGIN}/docs/start">Docs</a>` +
          `<a href="${ORIGIN}/_astro/Base.css">css</a><a href="${ORIGIN}/nowhere">x</a>`,
      )
      mergePagesSite(dirs, WWW)
      expect(readFileSync(join(dirs.out, 'team.html'), 'utf8')).toBe(
        `<a href="/blog/">Blog</a><a href="/docs/start">Docs</a><a href="/_astro/Base.css">css</a>` +
          `<a href="${ORIGIN}/nowhere">x</a>`,
      )
    })

    it('catalog only: the builds the merge reads keep their absolute links, and their check accepts them', () => {
      runBuild(dirs.run)
      wwwBuild(dirs.www)
      put(join(dirs.www, 'product.html'), '<a href="/">home</a>')
      const before = readFileSync(join(dirs.run, 'run', 'modules.html'), 'utf8')
      mergePagesSite(dirs, WWW)
      // dist-run/ is the catalog-only upload as it is (pages.yml moves it to dist/): the merge only reads it
      expect(readFileSync(join(dirs.run, 'run', 'modules.html'), 'utf8')).toBe(before)
      expect(before).toContain(`<a href="${ORIGIN}/product">Product</a><a href="${ORIGIN}/">Open Mercato</a>`)
      expect(readFileSync(join(dirs.www, 'index.html'), 'utf8')).toContain(`<a href="${ORIGIN}/product">`)
      // the catalog-only check of a nested build, which links the main site by its address
      expect(checkPagesLayout(dirs.run, { ...WWW, merged: undefined })).toEqual([])
    })

    it('the merged check names each file and absolute link to a page this build serves', () => {
      runBuild(dirs.run)
      wwwBuild(dirs.www)
      put(join(dirs.www, 'product.html'), '<a href="/">home</a>')
      mergePagesSite(dirs, WWW)
      expect(checkMergedLayout(dirs.out, WWW)).toEqual({ problems: [], pending: [] })
      // as an upload that missed the merge's rewrite would be
      put(join(dirs.out, 'product.html'), `<a href="${ORIGIN}/run/modules?x=1#y">Run</a>`)
      put(join(dirs.out, 'run', 'm', 'x.html'), '<a href="https://openmercato.com/">home</a>')
      const problems = checkMergedLayout(dirs.out, WWW).problems
      expect(problems).toHaveLength(2)
      expect(problems[0]).toMatch(
        /dist\/product\.html: https:\/\/www\.openmercato\.com\/run\/modules\?x=1#y is a page or a file of this build; link it root relative, \/run\/modules\?x=1#y$/,
      )
      expect(problems[1]).toMatch(
        /dist\/run\/m\/x\.html: https:\/\/openmercato\.com\/ is a page or a file of this build; link it root relative, \/$/,
      )
      // a link to a path the build does not serve is not this check's business
      put(join(dirs.out, 'product.html'), `<a href="${ORIGIN}/pricing">x</a>`)
      put(join(dirs.out, 'run', 'm', 'x.html'), '<a href="/run/modules">home</a>')
      expect(checkMergedLayout(dirs.out, WWW).problems.join('\n')).not.toMatch(/root relative/)
    })
  })
})
