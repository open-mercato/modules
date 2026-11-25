// The built case studies, partners and jobs (www site migration spec, Phase 4), read from dist-www/ after
// `yarn build:www`: every published entry routes with its canonical, og tags and JSON-LD, no draft is routed, listed,
// linked or in the sitemap, the list pages are complete without JavaScript, and the partner filter's data is inlined
// into the page. Runs only with WWW_BUILD=1, right after `yarn build:www` (validate.yml does so), so a stale local
// dist-www/ never fails `yarn test`; with the flag a missing build is a failure.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { caseStudyPath, publishedCaseStudies } from '../../www/src/lib/case-studies.ts'
import { jobPath, publishedJobs } from '../../www/src/lib/jobs.ts'
import { partnerPath, publishedPartners } from '../../www/src/lib/partners.ts'
import { ROOT } from '../emit/helpers.ts'
import { caseStudyEntries, jobEntries, partnerEntries } from './collections-content.ts'

const DIST = join(ROOT, 'dist-www')
const ORIGIN = 'https://www.openmercato.com'
const required = process.env.WWW_BUILD === '1'
const built = required && existsSync(join(DIST, 'certified-partners.html'))
const read = (...p: string[]): string => readFileSync(join(DIST, ...p), 'utf8')

const caseStudies = caseStudyEntries()
const partners = partnerEntries()
const jobs = jobEntries()
const routes = [
  {
    dir: 'case-studies',
    path: caseStudyPath,
    published: publishedCaseStudies(caseStudies).map((e) => e.id),
    drafts: caseStudies.filter((e) => e.data.draft).map((e) => e.id),
  },
  {
    dir: 'certified-partners',
    path: partnerPath,
    published: publishedPartners(partners).map((e) => e.id),
    drafts: partners.filter((e) => e.data.draft).map((e) => e.id),
  },
  {
    dir: 'careers-jobs',
    path: jobPath,
    published: publishedJobs(jobs).map((e) => e.id),
    drafts: jobs.filter((e) => e.data.draft).map((e) => e.id),
  },
]

function htmlFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...htmlFiles(join(dir, e.name)))
    else if (e.name.endsWith('.html')) out.push(join(dir, e.name))
  }
  return out
}

function jsonLd(html: string): { '@graph': Record<string, unknown>[] } {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
  if (!m) throw new Error('no JSON-LD')
  return JSON.parse(m[1]!) as { '@graph': Record<string, unknown>[] }
}

const meta = (html: string, property: string): string | undefined =>
  new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html)?.[1]

/** The text of a tag of the page (its first one), entities of the build decoded. */
const decode = (s: string): string =>
  s
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const tag = (html: string, re: RegExp): string | undefined => {
  const m = re.exec(html)?.[1]
  return m === undefined ? undefined : decode(m.replace(/<[^>]+>/g, '').trim())
}
const title = (html: string): string | undefined => tag(html, /<title>([\s\S]*?)<\/title>/)
const h1 = (html: string): string | undefined => tag(html, /<h1[^>]*>([\s\S]*?)<\/h1>/)
const description = (html: string): string | undefined => {
  const m = /<meta name="description" content="([^"]*)"/.exec(html)?.[1]
  return m === undefined ? undefined : decode(m)
}

const linked = (html: string, dir: string): string[] =>
  [...new Set([...html.matchAll(new RegExp(`href="/${dir}/([^"#?]+)"`, 'g'))].map((m) => m[1]!))].sort()

describe('the build of case studies, partners and jobs', () => {
  it('exists when the test is required', () => {
    if (required)
      expect(
        existsSync(join(DIST, 'certified-partners.html')),
        'dist-www/certified-partners.html (run yarn build:www first)',
      ).toBe(true)
  })

  describe.skipIf(!built)('dist-www', () => {
    it.each(routes.map((r) => [r.dir, r] as const))('/%s routes every published entry and no draft', (_, r) => {
      const pages = readdirSync(join(DIST, r.dir))
        .filter((f) => f.endsWith('.html'))
        .map((f) => f.slice(0, -5))
        .sort()
      expect(pages).toEqual([...r.published].sort())
      for (const d of r.drafts) expect(existsSync(join(DIST, r.dir, `${d}.html`)), d).toBe(false)
    })

    it('puts every published entry and both list pages in the sitemap, and no draft', () => {
      const locs = [...read('sitemap-0.xml').matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!)
      for (const r of routes) {
        for (const p of r.published) expect(locs, p).toContain(`${ORIGIN}${r.path(p)}`)
        for (const d of r.drafts) expect(locs, d).not.toContain(`${ORIGIN}${r.path(d)}`)
      }
      expect(locs).toContain(`${ORIGIN}/case-studies`)
      expect(locs).toContain(`${ORIGIN}/certified-partners`)
    })

    it('links no draft from any page', () => {
      const published = new Map(routes.map((r) => [r.dir, new Set(r.published)]))
      for (const f of htmlFiles(DIST))
        for (const m of readFileSync(f, 'utf8').matchAll(
          /href="(?:https:\/\/www\.openmercato\.com)?\/(case-studies|certified-partners|careers-jobs)\/([^"#?]+)/g,
        ))
          expect(published.get(m[1]!)!.has(m[2]!), `${f}: /${m[1]}/${m[2]}`).toBe(true)
    })

    it('lists every published case study on /case-studies', () => {
      const html = read('case-studies.html')
      expect(linked(html, 'case-studies')).toEqual([...routes[0]!.published].sort())
      expect(title(html)).toBe('Case Studies | Open Mercato')
      expect(h1(html)).toBe('What teams ship with Open Mercato')
      expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/case-studies">`)
    })

    it('lists every published partner on /certified-partners without JavaScript, with the data inlined', () => {
      const html = read('certified-partners.html')
      const partners = routes[1]!.published
      expect(linked(html, 'certified-partners')).toEqual([...partners].sort())
      expect(title(html)).toBe('Certified Partners | Open Mercato')
      expect(h1(html)).toBe('Hire a Certified Open Mercato Partner')
      expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/certified-partners">`)
      // the controls wait for JavaScript; the server render lists every partner and says so in the live region
      expect(html).toMatch(/<div class="partner-filter__controls" hidden/)
      expect(html).toMatch(/role="status" aria-live="polite">Showing all \d+ partners\./)
      expect(html).toContain(`Showing all ${partners.length} partners.`)
      // the island's props: the partner list and the facet options, as JSON in the page
      const props = /<astro-island[^>]*component-url="[^"]*PartnerFilter[^"]*"[^>]*props="([^"]*)"/.exec(html)?.[1]
      expect(props, 'the PartnerFilter island').toBeDefined()
      const text = props!.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      for (const p of partners) expect(text, p).toContain(`"${partnerPath(p)}"`)
      for (const f of ['tier', 'industry', 'location', 'language', 'service', 'availability'])
        expect(text, f).toContain(`"${f}"`)
    })

    it.each(routes[0]!.published)('case study %s: canonical, og tags, Article and BreadcrumbList', (slug) => {
      const html = read('case-studies', `${slug}.html`)
      const url = `${ORIGIN}${caseStudyPath(slug)}`
      expect(html).toContain(`<link rel="canonical" href="${url}">`)
      expect(meta(html, 'og:url')).toBe(url)
      expect(meta(html, 'og:type')).toBe('article')
      // as the live page (decision of 25 Nov 2026): <title> from the heading with the template's suffix, h1 the name,
      // the description whole
      const cs = caseStudies.find((c) => c.id === slug)!
      expect(title(html)).toBe(`${cs.data.heading} | Open Mercato Case Study`)
      expect(decode(meta(html, 'og:title')!)).toBe(title(html))
      expect(h1(html)).toBe(cs.data.title)
      expect(description(html)).toBe(cs.data.description)
      expect(decode(meta(html, 'og:description')!)).toBe(cs.data.description)
      expect(meta(html, 'og:image')).toMatch(/^https:\/\/www\.openmercato\.com\//)
      const graph = jsonLd(html)['@graph']
      expect(graph.map((g) => g['@type'])).toEqual(['Article', 'BreadcrumbList'])
      expect(graph[0]).toMatchObject({ url, mainEntityOfPage: url })
      expect(html).not.toMatch(/<iframe[^>]+youtube/)
    })

    it('a case study with a video shows it as a link that loads the player on a click', () => {
      const withVideo = caseStudies.filter((c) => !c.data.draft && c.data.heroVideo)
      expect(withVideo.length).toBeGreaterThan(0)
      for (const c of withVideo)
        expect(read('case-studies', `${c.id}.html`)).toContain(
          `<figure class="video-embed" data-video-id="${c.data.heroVideo}"`,
        )
    })

    it('a case study names the partner that delivered it, with a link to its page', () => {
      const published = new Set(routes[1]!.published)
      for (const c of caseStudies.filter((x) => !x.data.draft && typeof x.data.deliveredBy === 'string')) {
        const id = c.data.deliveredBy as string
        const html = read('case-studies', `${c.id}.html`)
        if (published.has(id)) expect(html, c.id).toContain(`<dd class="delivered-by"><a href="${partnerPath(id)}">`)
        else expect(html, c.id).toMatch(/<dd class="delivered-by">[^<]/)
      }
    })

    it.each(routes[1]!.published)('partner %s: canonical, og tags and BreadcrumbList', (slug) => {
      const html = read('certified-partners', `${slug}.html`)
      const url = `${ORIGIN}${partnerPath(slug)}`
      expect(html).toContain(`<link rel="canonical" href="${url}">`)
      expect(meta(html, 'og:url')).toBe(url)
      const partner = partners.find((p) => p.id === slug)!
      expect(title(html)).toBe(`${partner.data.name}  | Open Mercato Agency`)
      expect(description(html)).toBe(partner.data.description)
      expect(jsonLd(html)['@graph'].map((g) => g['@type'])).toEqual(['BreadcrumbList'])
    })

    it.each(routes[2]!.published)('job %s: canonical, JobPosting while open, BreadcrumbList', (slug) => {
      const html = read('careers-jobs', `${slug}.html`)
      const url = `${ORIGIN}${jobPath(slug)}`
      const job = jobs.find((j) => j.id === slug)!
      expect(html).toContain(`<link rel="canonical" href="${url}">`)
      expect(meta(html, 'og:url')).toBe(url)
      expect(title(html)).toBe(`${job.data.title} | Careers - Open Mercato`)
      expect(description(html)).toBe(job.data.description)
      const graph = jsonLd(html)['@graph']
      expect(graph.map((g) => g['@type'])).toEqual(
        job.data.open ? ['JobPosting', 'BreadcrumbList'] : ['BreadcrumbList'],
      )
      if (job.data.open) {
        expect(graph[0]).toMatchObject({ title: job.data.title, url })
        expect(String(graph[0]!.description)).toMatch(/^<h3/)
      }
    })
  })
})
