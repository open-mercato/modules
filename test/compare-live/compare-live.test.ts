// `yarn om compare-live` against two local fixture servers (www site migration spec, Phase 8): one plays the live
// Webflow site, the other the candidate Pages deployment. Every request is recorded, so the tests also prove that no
// redirect is followed and that at most 4 requests run at a time.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CommandContext } from '../../lib/cli.ts'
import compareLiveCommand, { parseArgs, parsePlanned } from '../../lib/commands/compare-live.ts'
import {
  compareLive,
  countsByKind,
  defaultApex,
  kindOf,
  mergeTargets,
  reportMarkdown,
  sampleTarget,
  sitemapTargets,
  type Report,
  type Target,
} from '../../lib/compare-live/compare.ts'
import { similarity, snapshotHtml } from '../../lib/compare-live/page.ts'

interface Fixture {
  status: number
  /** A Location, or one built from the server's own origin. */
  location?: string | ((origin: string) => string)
  html?: string
  /** Milliseconds before the answer, to make requests overlap. */
  delay?: number
}

interface FixtureServer {
  origin: string
  /** Paths requested, in order. */
  hits: string[]
  /** The most requests open at once on this server. */
  peak: () => number
  close: () => Promise<void>
}

/** In-flight requests over both servers, to check the limit of the whole run. */
let inFlight = 0
let peakBoth = 0

async function serve(routes: Record<string, Fixture>): Promise<FixtureServer> {
  const hits: string[] = []
  let origin = ''
  let open = 0
  let peak = 0
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '')
    open++
    inFlight++
    peak = Math.max(peak, open)
    peakBoth = Math.max(peakBoth, inFlight)
    const f = routes[req.url ?? ''] ?? { status: 404, html: '<title>Not found</title><main>Not found</main>' }
    setTimeout(() => {
      open--
      inFlight--
      const headers: Record<string, string> = {}
      if (f.location) headers.location = typeof f.location === 'string' ? f.location : f.location(origin)
      if (f.html !== undefined) headers['content-type'] = 'text/html; charset=utf-8'
      res.writeHead(f.status, headers)
      res.end(f.html ?? '')
    }, f.delay ?? 0)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const { port } = server.address() as AddressInfo
  origin = `http://127.0.0.1:${port}`
  return {
    origin,
    hits,
    peak: () => peak,
    close: () => new Promise((r) => server.close(() => r())),
  }
}

const BODY = 'Open Mercato is an open source platform for teams that build their own business software and keep it. '
const LONG = BODY.repeat(12)

/** A page of the live site: Webflow navbar and footer around the main text. */
function livePage(o: { title: string; h1: string; text?: string; images?: number; landing?: boolean }): string {
  const imgs = '<img src="https://cdn.example/x.png" alt="">'.repeat(o.images ?? 1)
  return (
    `<html><head><title>${o.title}</title><meta name="description" content="About ${o.h1}."></head><body>` +
    '<div class="navbar_component w-nav"><a href="/">Home</a> Product Pricing Blog Partners</div>' +
    `<main class="main-wrapper"><h1>${o.h1}</h1>${o.landing ? '<section class="omlp-hero">' : '<section>'}` +
    `<p>${o.text ?? LONG}</p>${imgs}</section></main>` +
    '<footer class="footer_component">Terms Privacy Careers Copyright</footer></body></html>'
  )
}

/** The same page on the candidate: another header and footer, the SEO tags of the build. */
function candidatePage(o: {
  title: string
  h1: string
  text?: string
  images?: number
  seo?: boolean
  description?: string
}): string {
  const imgs = '<img src="/media/x.png" alt="">'.repeat(o.images ?? 1)
  const seo =
    o.seo === false
      ? ''
      : '<link rel="canonical" href="https://www.openmercato.com/x"><meta property="og:title" content="x">' +
        '<meta property="og:image" content="https://www.openmercato.com/og.png">' +
        '<script type="application/ld+json">{"@type":"WebPage"}</script>'
  return (
    `<html><head><title>${o.title}</title><meta name="description" content="${o.description ?? `About ${o.h1}.`}">${seo}</head><body>` +
    '<header class="navbar_wrapper site-header"><nav>Open Mercato Product Run Blog</nav></header>' +
    `<main id="main"><header class="post-head"><nav aria-label="Breadcrumb">Home / Blog</nav><h1>${o.h1}</h1></header>` +
    `<p>${o.text ?? LONG}</p>${imgs}<script>var tracking = 1</script></main>` +
    '<footer class="site-footer">Other footer words entirely</footer></body></html>'
  )
}

let live: FixtureServer
let cand: FixtureServer
let tmp: string

const SITEMAP = [
  '/blog-posts/same',
  '/blog-posts/title-changed',
  '/blog-posts/no-seo',
  '/case-studies/moved',
  '/certified-partners/gone',
  '/careers-jobs/text-changed',
  '/hubspot-alternative',
  '/product',
  '/docs/cli-overview',
  '/docs/platform-overview',
]

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'om-compare-live-'))
  const page = { title: 'A post | Open Mercato', h1: 'A post' }
  const slow: Record<string, Fixture> = {}
  const slowCand: Record<string, Fixture> = {}
  for (let i = 0; i < 12; i++) {
    slow[`/blog-posts/slow-${i}`] = { status: 200, html: livePage(page), delay: 40 }
    slowCand[`/blog-posts/slow-${i}`] = { status: 200, html: candidatePage(page), delay: 40 }
  }
  live = await serve({
    '/blog-posts/same': { status: 200, html: livePage(page) },
    '/blog-posts/title-changed': { status: 200, html: livePage(page) },
    '/blog-posts/no-seo': { status: 200, html: livePage(page) },
    '/case-studies/moved': { status: 301, location: '/case-studies/acme' },
    '/certified-partners/gone': { status: 404, html: '<title>404</title>' },
    '/careers-jobs/text-changed': { status: 200, html: livePage(page) },
    '/hubspot-alternative': { status: 200, html: livePage({ ...page, landing: true }) },
    '/product': { status: 200, html: livePage(page) },
    '/docs/cli-overview': { status: 200, html: livePage(page) },
    '/docs/platform-overview': { status: 200, html: livePage(page) },
    '/old-pricing': { status: 301, location: '/product' },
    '/apex': { status: 301, location: 'https://www.openmercato.com/' },
    '/old-home': { status: 301, location: 'https://www.openmercato.com/' },
    '/old-blog/compare-live-sample': {
      status: 301,
      location: 'https://www.openmercato.com/blog-posts/compare-live-sample',
    },
    ...slow,
  })
  cand = await serve({
    '/blog-posts/same': { status: 200, html: candidatePage(page) },
    '/blog-posts/title-changed': {
      status: 200,
      html: candidatePage({ ...page, title: 'Another title | Open Mercato' }),
    },
    '/blog-posts/no-seo': { status: 200, html: candidatePage({ ...page, seo: false }) },
    // an absolute Location on the candidate's own origin is the same target as the live site's path
    '/case-studies/moved': { status: 301, location: (o) => `${o}/case-studies/acme` },
    '/certified-partners/gone': { status: 404, html: '<title>404</title>' },
    '/careers-jobs/text-changed': {
      status: 200,
      html: candidatePage({ ...page, text: 'Something else entirely, a different job. '.repeat(10), images: 2 }),
    },
    '/hubspot-alternative': { status: 404, html: '<title>404</title>' },
    '/product': { status: 200, html: candidatePage(page) },
    '/docs/cli-overview': { status: 301, location: 'https://docs.openmercato.com/cli/overview' },
    '/docs/platform-overview': { status: 302, location: '/docs' },
    '/docs/compare-live-sample': { status: 301, location: 'https://docs.openmercato.com/' },
    '/old-pricing': { status: 301, location: '/product' },
    '/old-blog/compare-live-sample': { status: 301, location: '/blog-posts/compare-live-sample' },
    // at C8 the candidate is www itself: Pages answers a rule to an absolute www address on its own origin
    '/old-home': { status: 301, location: (o) => `${o}/` },
    ...slowCand,
  })
})

afterAll(async () => {
  await live.close()
  await cand.close()
  rmSync(tmp, { recursive: true, force: true })
})

const targets = (paths: readonly string[]): Target[] => paths.map((path) => ({ path, sitemap: true }))

describe('page snapshot', () => {
  it('reads title, description, h1, main text without navbar, footer and scripts, images and SEO tags', () => {
    const a = snapshotHtml(livePage({ title: 'T', h1: 'H', images: 2, landing: true }))
    expect(a).toMatchObject({ title: 'T', description: 'About H.', h1: 'H', images: 2, canonical: false })
    expect(a.landing).toBe(true)
    expect(a.words).not.toContain('pricing')
    expect(a.words).not.toContain('copyright')
    const b = snapshotHtml(candidatePage({ title: 'T', h1: 'H', images: 2 }))
    expect(b).toMatchObject({ canonical: true, ogTitle: true, ogImage: true, jsonLd: true, landing: false })
    expect(b.words).not.toContain('tracking')
    expect(b.words).not.toContain('breadcrumb')
    expect(similarity(a.words, b.words)).toBeGreaterThanOrEqual(0.97)
  })

  it('takes the body without its header and footer when a page has no main', () => {
    const s = snapshotHtml('<body><header>Menu words</header><h1>Title</h1><p>Text</p><footer>Foot</footer></body>')
    expect(s.words).toEqual(['title', 'text'])
  })

  it('similarity is the word edit distance over the longer length', () => {
    expect(similarity([], [])).toBe(1)
    expect(similarity(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'e'])).toBe(0.75)
    expect(similarity(['a'], [])).toBe(0)
  })
})

describe('targets and kinds', () => {
  it('reads the sitemap paths once each and adds every rule of redirects.yaml, splats as a sample', () => {
    const xml =
      '<urlset><url><loc>https://www.openmercato.com/</loc></url><url><loc>https://www.openmercato.com/docs/a</loc></url>' +
      '<url><loc>https://www.openmercato.com/</loc></url></urlset>'
    const t = mergeTargets(sitemapTargets(xml), [
      { from: '/docs/a', to: 'https://docs.openmercato.com/a', status: 301, source: 'docs-map' },
      { from: '/docs/*', to: 'https://docs.openmercato.com/', status: 301, source: 'docs-map' },
    ])
    expect(t.map((x) => x.path)).toEqual(['/', '/docs/a', '/docs/compare-live-sample'])
    expect(t[1]).toMatchObject({ sitemap: true, redirect: { to: 'https://docs.openmercato.com/a' } })
    expect(t[2]).toMatchObject({ sitemap: false, redirect: { from: '/docs/*' } })
  })

  it('names the kind of each URL', () => {
    const k = (path: string, landing = false, sitemap = true): string =>
      kindOf(
        { path, sitemap, ...(sitemap ? {} : { redirect: { from: path, to: '/', source: 'webflow-panel' as const } }) },
        landing ? { status: 200, location: null, page: { ...snapshotHtml(''), landing: true } } : null,
      )
    expect(k('/blog')).toBe('blog')
    expect(k('/blog-posts/x')).toBe('blog')
    expect(k('/case-studies/x')).toBe('case-studies')
    expect(k('/certified-partners')).toBe('partners')
    expect(k('/careers-jobs/x')).toBe('jobs')
    expect(k('/documentation')).toBe('docs')
    expect(k('/docs/x')).toBe('docs')
    expect(k('/hubspot-alternative', true)).toBe('landing')
    expect(k('/careers')).toBe('page')
    expect(k('/old-pricing', false, false)).toBe('redirect')
  })

  it('checks the apex of the first www. origin', () => {
    expect(defaultApex(['http://127.0.0.1:1', 'https://www.openmercato.com'])).toEqual({
      url: 'https://openmercato.com/',
      expected: 'https://www.openmercato.com/',
    })
    expect(defaultApex(['http://127.0.0.1:1', null])).toBeNull()
  })
})

describe('compareLive against two servers', () => {
  let report: Report

  beforeAll(async () => {
    live.hits.length = 0
    cand.hits.length = 0
    peakBoth = 0
    report = await compareLive({
      live: live.origin,
      candidate: cand.origin,
      targets: mergeTargets(targets([...SITEMAP, ...Array.from({ length: 12 }, (_, i) => `/blog-posts/slow-${i}`)]), [
        { from: '/old-pricing', to: '/product', status: 301, source: 'webflow-panel' },
        {
          from: '/docs/cli-overview',
          to: 'https://docs.openmercato.com/cli/overview',
          status: 301,
          source: 'docs-map',
        },
        { from: '/docs/*', to: 'https://docs.openmercato.com/', status: 301, source: 'docs-map' },
      ]),
      apex: { url: `${live.origin}/apex`, expected: 'https://www.openmercato.com/' },
    })
  })

  const result = (path: string) => report.urls.find((u) => u.path === path)!

  it('passes a page whose text, title and tags match, with another navbar and footer', () => {
    expect(result('/blog-posts/same')).toMatchObject({ kind: 'blog', result: 'pass', failures: [] })
    expect(result('/product')).toMatchObject({ kind: 'page', result: 'pass' })
    for (let i = 0; i < 12; i++) expect(result(`/blog-posts/slow-${i}`).result).toBe('pass')
  })

  it('fails each compared field that differs', () => {
    expect(result('/blog-posts/title-changed').failures).toEqual([
      { field: 'title', reference: 'A post | Open Mercato', candidate: 'Another title | Open Mercato' },
    ])
    expect(result('/blog-posts/no-seo').failures.map((d) => d.field)).toEqual([
      'canonical',
      'og:title',
      'og:image',
      'json-ld',
    ])
    const job = result('/careers-jobs/text-changed')
    expect(job.kind).toBe('jobs')
    expect(job.failures.map((d) => d.field)).toEqual(['text', 'images'])
    expect(job.failures[0]!.candidate).toMatch(/similarity 0\.\d{3}/)
  })

  it('compares redirect targets and status classes without following any redirect', () => {
    expect(result('/certified-partners/gone')).toMatchObject({ kind: 'partners', result: 'pass' })
    expect(result('/hubspot-alternative')).toMatchObject({
      kind: 'landing',
      result: 'fail',
      failures: [{ field: 'status', reference: '200', candidate: '404' }],
    })
    // the live path and the candidate's absolute address on its own origin are the same target
    expect(result('/case-studies/moved')).toMatchObject({ kind: 'case-studies', result: 'pass' })
    // the redirect targets were never requested; each path once per origin
    expect(live.hits).not.toContain('/case-studies/acme')
    expect(cand.hits).not.toContain('/case-studies/acme')
    expect(cand.hits.filter((h) => h === '/product')).toHaveLength(1)
  })

  it('wants a docs URL to be a 301 to docs.openmercato.com on the candidate, the map target when known', () => {
    expect(result('/docs/cli-overview')).toMatchObject({ kind: 'docs', result: 'pass' })
    expect(result('/docs/platform-overview').failures).toEqual([
      { field: 'redirect', reference: '301 to https://docs.openmercato.com/...', candidate: '302 /docs' },
    ])
    expect(result('/docs/compare-live-sample')).toMatchObject({ kind: 'docs', result: 'pass' })
    // the live docs pages are not requested: Webflow's copy does not matter (D4)
    expect(live.hits.some((h) => h.startsWith('/docs'))).toBe(false)
  })

  it('checks a rule of the Webflow panel list on the candidate and against the live answer', () => {
    expect(result('/old-pricing')).toMatchObject({ kind: 'redirect', result: 'pass' })
  })

  it('checks the apex', () => {
    expect(report.apex).toMatchObject({ result: 'pass', status: 301, location: 'https://www.openmercato.com/' })
  })

  it('never has more than 4 requests open, over both origins', () => {
    expect(peakBoth).toBeLessThanOrEqual(4)
    expect(peakBoth).toBeGreaterThan(1)
    expect(live.peak()).toBeLessThanOrEqual(4)
  })

  it('reports counts per kind and every URL in Markdown', () => {
    expect(report.summary).toMatchObject({ urls: 24, failed: 5 })
    expect(countsByKind(report).find((k) => k.kind === 'blog')).toEqual({
      kind: 'blog',
      urls: 15,
      passed: 13,
      failed: 2,
    })
    const md = reportMarkdown(report)
    expect(md).toContain('| Blog | 15 | 13 | 2 |')
    expect(md).toContain(
      '| /blog-posts/title-changed | Blog | title | A post \\| Open Mercato | Another title \\| Open Mercato |',
    )
    expect(md).toContain('| /blog-posts/same | Blog | pass |  |')
    expect(md).toMatch(/Apex: .*\/apex answers 301 https:\/\/www\.openmercato\.com\/; expected 301/)
  })
})

describe('rules of redirects.yaml with a splat or an absolute target', () => {
  it('samples the splat and placeholders of a target path, never its query', () => {
    expect(sampleTarget('/blog-posts/:splat')).toBe('/blog-posts/compare-live-sample')
    expect(sampleTarget('/p/:id/x?q=a:b')).toBe('/p/sample/x?q=a:b')
  })

  it('expects the splat sample in the target, and an absolute target on the candidate as a path', async () => {
    const r = await compareLive({
      live: live.origin,
      candidate: cand.origin,
      targets: mergeTargets(
        [],
        [
          { from: '/old-blog/*', to: '/blog-posts/:splat', status: 301, source: 'webflow-panel' },
          { from: '/old-home', to: `${cand.origin}/`, status: 301, source: 'manual' },
        ],
      ),
      apex: null,
    })
    expect(r.urls.map((u) => [u.path, u.kind, u.result])).toEqual([
      ['/old-blog/compare-live-sample', 'redirect', 'pass'],
      ['/old-home', 'redirect', 'pass'],
    ])
  })
})

describe('planned differences, the baseline and the command', () => {
  it('a planned difference passes; an unused one is listed', async () => {
    const planned = parsePlanned(
      '- url: /blog-posts/title-changed\n  field: title\n  note: A5 dash\n- url: /blog-posts/no-*\n  field: og:image\n- url: /x\n  field: h1\n',
      'planned.yaml',
    )
    const r = await compareLive({
      live: live.origin,
      candidate: cand.origin,
      targets: targets(['/blog-posts/title-changed', '/blog-posts/no-seo']),
      planned,
      apex: null,
    })
    expect(r.urls[0]).toMatchObject({ result: 'pass', planned: [{ field: 'title' }] })
    expect(r.urls[1]!.failures.map((d) => d.field)).toEqual(['canonical', 'og:title', 'json-ld'])
    expect(r.summary.planned).toBe(2)
    expect(r.unusedPlanned).toEqual([{ url: '/x', field: 'h1' }])
    expect(() => parsePlanned('- url: /x\n  field: colour\n', 'p.yaml')).toThrow(/p\.yaml: 0\.field/)
  })

  it('parses the arguments of the contract', () => {
    expect(
      parseArgs(['--live', 'https://www.openmercato.com', '--candidate=https://x.pages.dev', '--urls', 's.xml']),
    ).toEqual({
      live: 'https://www.openmercato.com',
      candidate: 'https://x.pages.dev',
      urls: 's.xml',
    })
    expect(() => parseArgs(['--candidate', 'https://x', '--urls', 's'])).toThrow(/exactly one of --live/)
    expect(() =>
      parseArgs(['--live', 'https://a', '--baseline', 'r.json', '--candidate', 'https://x', '--urls', 's']),
    ).toThrow(/exactly one/)
    expect(() => parseArgs(['--live', 'https://a/blog', '--candidate', 'https://x', '--urls', 's'])).toThrow(/origin/)
    expect(() => parseArgs(['--live', 'https://a', '--candidate', 'https://x', '--urls', 's', '--follow'])).toThrow(
      /unknown argument --follow/,
    )
  })

  it('writes report.md and report.json, exits 1 on a fail and 0 when all pass; the JSON is a baseline', async () => {
    const sitemap = join(tmp, 'sitemap.xml')
    const loc = (p: string): string => `<url><loc>https://www.openmercato.com${p}</loc></url>`
    writeFileSync(sitemap, `<urlset>${loc('/blog-posts/same')}${loc('/product')}</urlset>`)
    const out = join(tmp, 'out')
    const ctx = (args: string[]): CommandContext => ({
      args,
      root: tmp,
      flags: { data: '.data', out, offline: false, json: false },
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(
        await compareLiveCommand(ctx(['--live', live.origin, '--candidate', cand.origin, '--urls', sitemap])),
      ).toBe(0)
      const json = JSON.parse(readFileSync(join(out, 'compare-live', 'report.json'), 'utf8')) as Report
      expect(json.summary).toMatchObject({ urls: 2, passed: 2, failed: 0 })
      expect(json.urls[0]!.candidate.page!.words.length).toBeGreaterThan(10)
      expect(readFileSync(join(out, 'compare-live', 'report.md'), 'utf8')).toContain(
        '| /product | Unique pages | pass |',
      )
      // C8: the candidate against the snapshot of an earlier run, no live request
      const baseline = join(tmp, 'c6.json')
      writeFileSync(baseline, readFileSync(join(out, 'compare-live', 'report.json')))
      const before = live.hits.length
      expect(
        await compareLiveCommand(ctx(['--baseline', baseline, '--candidate', cand.origin, '--urls', sitemap])),
      ).toBe(0)
      expect(live.hits.length).toBe(before)
      writeFileSync(sitemap, `<urlset>${loc('/blog-posts/title-changed')}</urlset>`)
      expect(
        await compareLiveCommand(ctx(['--live', live.origin, '--candidate', cand.origin, '--urls', sitemap])),
      ).toBe(1)
      // a path the baseline does not have fails
      expect(
        await compareLiveCommand(ctx(['--baseline', baseline, '--candidate', cand.origin, '--urls', sitemap])),
      ).toBe(1)
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(
        await compareLiveCommand(
          ctx(['--live', live.origin, '--candidate', cand.origin, '--urls', join(tmp, 'none.xml')]),
        ),
      ).toBe(2)
      errors.mockRestore()
    } finally {
      log.mockRestore()
    }
  })
})
