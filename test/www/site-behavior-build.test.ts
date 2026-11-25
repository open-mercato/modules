// The built main site's behavior (www site migration spec, Phase 7, D9), read from dist-www/ after `yarn build:www`:
// every page loads GA4 G-64ZQGMNZKB in its head with no Consent Mode call, the CTA tracker and the cookie banner, and
// carries the site-wide Organization and WebSite JSON-LD; every CTA declares a live event name within 40 characters;
// the 404 is the live utility page; the catalog's own pages (when built) load none of it. Runs only with
// WWW_BUILD=1, right after `yarn build:www` (validate.yml does so); with the flag a missing build is a failure.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CTA_EVENT_LENGTH, GA_MEASUREMENT_ID } from '../../lib/core/cta.ts'
import { ROOT } from '../emit/helpers.ts'

const DIST = join(ROOT, 'dist-www')
// the catalog's own build: dist-run/ locally (yarn build:run), dist/ in validate.yml (RUN_DIST=dist)
const RUN = join(ROOT, process.env.RUN_DIST ?? 'dist-run')
const required = process.env.WWW_BUILD === '1'
const built = required && existsSync(join(DIST, '404.html'))
const read = (...p: string[]): string => readFileSync(join(DIST, ...p), 'utf8')

function htmlFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...htmlFiles(join(dir, e.name)))
    else if (e.name.endsWith('.html')) out.push(join(dir, e.name))
  }
  return out
}

function jsFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...jsFiles(join(dir, e.name)))
    else if (e.name.endsWith('.js')) out.push(join(dir, e.name))
  }
  return out
}

/** The bundled scripts a page loads, read from dist-www. */
function pageScripts(html: string): string {
  return [...html.matchAll(/<script type="module" src="([^"]+)"/g)]
    .map((m) => readFileSync(join(DIST, m[1]!), 'utf8'))
    .join('\n')
}

describe('the built behavior of the main site', () => {
  it('exists when the test is required', () => {
    if (required) expect(existsSync(join(DIST, '404.html')), 'run `yarn build:www` first').toBe(true)
  })

  describe.skipIf(!built)('dist-www', () => {
    // a skipped describe still runs its body at collection, so read dist-www only when it is built
    const pages = built ? htmlFiles(DIST) : []

    it('every page loads GA4 in its head, with no Consent Mode call, the CTA tracker and the cookie banner', () => {
      expect(pages.length).toBeGreaterThan(50)
      for (const file of pages) {
        const html = readFileSync(file, 'utf8')
        const head = html.slice(0, html.indexOf('</head>'))
        const name = relative(DIST, file)
        expect(head, name).toContain(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`)
        expect(head, name).toContain(`gtag('config',"${GA_MEASUREMENT_ID}")`)
        expect(html, name).not.toMatch(/gtag\(\s*['"]consent/)
        const js = pageScripts(html)
        expect(js, name).toContain('cookieAccepted')
        expect(js, name).toContain('cookie-banner_component')
        expect(js, name).toContain('data-cta-action')
      }
    })

    it('every page carries the Organization and WebSite JSON-LD', () => {
      for (const file of pages) {
        const html = readFileSync(file, 'utf8')
        const graphs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
          (m) => JSON.parse(m[1]!) as { '@graph'?: { '@type': string }[] },
        )
        const types = graphs.flatMap((g) => (g['@graph'] ?? []).map((n) => n['@type']))
        expect(types, relative(DIST, file)).toEqual(expect.arrayContaining(['Organization', 'WebSite']))
      }
    })

    it('every CTA names a live event within 40 characters', () => {
      const placements = new Set<string>()
      const actions = new Set<string>()
      for (const file of pages) {
        const html = readFileSync(file, 'utf8')
        for (const m of html.matchAll(/data-cta-placement="([^"]*)"/g)) placements.add(m[1]!)
        for (const m of html.matchAll(/data-cta-action="([^"]*)"/g)) actions.add(m[1]!)
      }
      expect(placements).toContain('nav')
      expect(placements).toContain('cases')
      for (const a of ['home', 'menu_toggle', 'product_menu', 'github', 'launch_sandbox', 'open_story'])
        expect(actions).toContain(a)
      for (const name of [...placements, ...actions]) expect(name).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/)
      // the longest placement with every action: no event name the tracker would have to cut
      const longest = Math.max(...[...placements].map((p) => p.length))
      for (const a of actions) expect(`cta_${'x'.repeat(longest)}_${a}`.length, a).toBeLessThanOrEqual(CTA_EVENT_LENGTH)
    })

    it('the 404 is the live utility page: no navbar, no footer, no canonical, noindex', () => {
      const html = read('404.html')
      expect(html).toContain('<title>Not Found</title>')
      expect(html).toContain('<h3>Page Not Found</h3>')
      expect(html).toContain('The page you are looking for doesn&#x27;t exist or has been moved')
      expect(html).toContain('<a href="/" class="button w-button">Go Home</a>')
      expect(html).toContain('src="/files/page-not-found.svg"')
      expect(existsSync(join(DIST, 'files', 'page-not-found.svg'))).toBe(true)
      expect(html).not.toContain('navbar_component')
      expect(html).not.toContain('site-footer')
      expect(html).not.toContain('rel="canonical"')
      expect(html).toContain('<meta name="robots" content="noindex">')
    })

    it('the sitemap leaves the 404 out', () => {
      const sitemaps = readdirSync(DIST).filter((f) => /^sitemap-\d+\.xml$/.test(f))
      expect(sitemaps.length).toBeGreaterThan(0)
      for (const s of sitemaps) expect(read(s)).not.toMatch(/\/404(\.html)?<\/loc>/)
    })
  })

  describe.skipIf(!required || !existsSync(RUN))('dist-run', () => {
    it('the catalog loads no analytics, no tracker and no banner, in its pages or their scripts', () => {
      for (const file of htmlFiles(RUN)) {
        const html = readFileSync(file, 'utf8')
        const name = relative(RUN, file)
        expect(html, name).not.toContain('googletagmanager')
        expect(html, name).not.toContain('cookie-banner')
        expect(html, name).not.toMatch(/\bgtag\(/)
      }
      for (const file of jsFiles(RUN)) {
        const js = readFileSync(file, 'utf8')
        const name = relative(RUN, file)
        expect(js, name).not.toContain('cookieAccepted')
        expect(js, name).not.toContain('googletagmanager')
        expect(js, name).not.toContain('data-cta-action')
      }
    })
  })
})
