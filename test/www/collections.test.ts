// Case studies, partners and jobs of the main site (www site migration spec, Phase 4): which entries route and list,
// the partner filter's facet logic and query string contract, who delivered a case study (a draft partner is never
// linked), the SEO and JSON-LD of each detail page, and the link rules of bodies now that these routes exist. On the
// real content of www/content/; the built pages themselves are checked by test/www/collections-build.test.ts.
import { describe, expect, it } from 'vitest'
import { PARTNER_AVAILABILITY_LABELS, PARTNER_BUDGET_LABELS } from '../../lib/schema/www-content.ts'
import { linkAction, type LinkRules } from '../../www/src/lib/body-html.ts'
import {
  caseStudyCard,
  caseStudyJsonLd,
  caseStudyPath,
  caseStudySeo,
  deliveredBy,
  publishedCaseStudies,
  relatedCaseStudies,
  type CaseStudyEntry,
} from '../../www/src/lib/case-studies.ts'
import { listOrder } from '../../www/src/lib/entries.ts'
import { markdownHtml } from '../../www/src/lib/inline-markdown.ts'
import { isRemote, jobJsonLd, jobPath, jobSeo, publishedJobs, type JobEntry } from '../../www/src/lib/jobs.ts'
import {
  emptySelection,
  FACETS,
  matchesSelection,
  readSelection,
  selectedCount,
  toggleValue,
  writeSelection,
  type FacetOptions,
  type FacetValues,
} from '../../www/src/lib/partner-filter.ts'
import {
  facetOptions,
  optionValues,
  partnerCard,
  partnerFacts,
  partnerJsonLd,
  partnerPath,
  partnerSeo,
  partnerValues,
  publishedPartners,
} from '../../www/src/lib/partners.ts'
import { bodyLinkRules, detailIds, publishedIds, servesFixed } from '../../www/body-links.ts'
import { partnersShownText } from '../../www/src/islands/PartnerFilter.tsx'
import { CONTENT, names } from './blog-content.ts'
import { caseStudyEntries, dictionaries, jobEntries, partnerEntries } from './collections-content.ts'

const ORIGIN = 'https://www.openmercato.com'
const caseStudies = caseStudyEntries()
const partners = partnerEntries()
const jobs = jobEntries()
const dict = dictionaries()
const csCategories = names('case-study-categories.yaml')
const publishedCs = publishedCaseStudies(caseStudies)
const publishedP = publishedPartners(partners)
const ids = (xs: { id: string }[]): string[] => xs.map((x) => x.id).sort()

const cs = (id: string, over: Partial<CaseStudyEntry['data']> = {}): CaseStudyEntry => ({
  id,
  data: {
    title: id,
    heading: `Heading ${id}`,
    description: `About ${id}.`,
    overview: {},
    stats: [],
    screenshots: [],
    categories: [],
    featuredOnAgencies: false,
    draft: false,
    ...over,
  },
})

const values = (over: Partial<FacetValues> = {}): FacetValues => ({
  tier: ['agency'],
  industry: ['finance', 'retail'],
  location: ['poland'],
  language: ['english', 'polish'],
  service: ['implementation'],
  budget: [],
  availability: ['accepting'],
  ...over,
})

describe('which entries route and list', () => {
  it('the imported content has published entries and drafts', () => {
    expect(publishedCs.length).toBeGreaterThan(0)
    expect(caseStudies.some((c) => c.data.draft)).toBe(true)
    expect(publishedP.length).toBeGreaterThan(0)
    expect(partners.some((p) => p.data.draft)).toBe(true)
    expect(publishedJobs(jobs).length).toBeGreaterThan(0)
  })

  it('every published entry routes, no draft does', () => {
    expect(ids(publishedCs)).toEqual(ids(caseStudies.filter((c) => !c.data.draft)))
    expect(ids(publishedP)).toEqual(ids(partners.filter((p) => !p.data.draft)))
    expect(ids(publishedJobs(jobs))).toEqual(ids(jobs.filter((j) => !j.data.draft)))
    // the link rules of bodies agree with the routes
    const details = detailIds(CONTENT)
    expect([...details.get('case-studies')!].sort()).toEqual(ids(publishedCs))
    expect([...details.get('certified-partners')!].sort()).toEqual(ids(publishedP))
    expect([...details.get('careers-jobs')!].sort()).toEqual(ids(publishedJobs(jobs)))
    expect(publishedIds(`${CONTENT}/partners`)).toEqual(ids(publishedP))
  })

  it('lists entries with a manual order first, then newest first by Webflow id, then new entries first', () => {
    const e = (id: string, order?: number, webflowId?: string) => ({ id, data: { order, webflowId } })
    const sorted = [
      e('old', undefined, '6a0000000000000000000001'),
      e('new-file'),
      e('ordered-2', 2, '6a0000000000000000000009'),
      e('young', undefined, '6b0000000000000000000001'),
      e('ordered-1', 1),
    ].sort(listOrder)
    expect(sorted.map((x) => x.id)).toEqual(['ordered-1', 'ordered-2', 'new-file', 'young', 'old'])
  })

  it('related case studies share a category first and are published', () => {
    const a = cs('a', { categories: ['erp'] })
    const pool = [cs('b'), cs('c', { categories: ['erp'] }), a, cs('d', { categories: ['crm'] })]
    expect(relatedCaseStudies(a, pool).map((x) => x.id)).toEqual(['c', 'b', 'd'])
    for (const c of publishedCs)
      for (const r of relatedCaseStudies(c, publishedCs)) expect(r.data.draft, `${c.id} -> ${r.id}`).toBe(false)
  })
})

describe('the partner filter', () => {
  it('matches any selected value within a facet', () => {
    const s = { ...emptySelection(), industry: ['finance', 'healthcare'] }
    expect(matchesSelection(values(), s)).toBe(true)
    expect(matchesSelection(values({ industry: ['healthcare'] }), s)).toBe(true)
    expect(matchesSelection(values({ industry: ['retail'] }), s)).toBe(false)
    expect(matchesSelection(values({ industry: [] }), s)).toBe(false)
  })

  it('needs every facet with a selection to match', () => {
    const s = { ...emptySelection(), industry: ['finance'], language: ['german'] }
    expect(matchesSelection(values(), s)).toBe(false)
    expect(matchesSelection(values({ language: ['german'] }), s)).toBe(true)
    // budget: a partner without one never matches a budget selection
    expect(matchesSelection(values(), { ...emptySelection(), budget: ['under-10k'] })).toBe(false)
    expect(matchesSelection(values({ budget: ['under-10k'] }), { ...emptySelection(), budget: ['under-10k'] })).toBe(
      true,
    )
  })

  it('shows everything when nothing is selected', () => {
    expect(matchesSelection(values({ industry: [], budget: [] }), emptySelection())).toBe(true)
    expect(selectedCount(emptySelection())).toBe(0)
  })

  const known: FacetOptions = {
    tier: ['ai-native-core-agency', 'agency'],
    industry: ['finance', 'retail', 'healthcare'],
    location: ['poland'],
    language: ['english', 'polish'],
    service: ['implementation'],
    budget: ['under-10k', '10k-20k'],
    availability: ['accepting'],
  }

  it('reads the selection from the query string: known values only, in the order of the options', () => {
    const s = readSelection('?industry=retail&industry=finance&tier=agency&tier=nope&budget=10k-20k&x=1', known)
    expect(s).toEqual({ ...emptySelection(), tier: ['agency'], industry: ['finance', 'retail'], budget: ['10k-20k'] })
    expect(readSelection('', known)).toEqual(emptySelection())
    expect(readSelection('?industry=', known)).toEqual(emptySelection())
  })

  it('writes one parameter per value, facets in their order, and keeps other parameters', () => {
    const s = { ...emptySelection(), budget: ['under-10k'], tier: ['agency'], industry: ['finance', 'retail'] }
    expect(writeSelection('?utm=x&industry=healthcare', s)).toBe(
      '?utm=x&tier=agency&industry=finance&industry=retail&budget=under-10k',
    )
    expect(writeSelection('?tier=agency', emptySelection())).toBe('')
    // a written selection reads back the same
    expect(readSelection(writeSelection('', s), known)).toEqual(s)
    // the example of the spec
    expect(writeSelection('', { ...emptySelection(), tier: ['ai-native-agency'], industry: ['fintech'] })).toBe(
      '?tier=ai-native-agency&industry=fintech',
    )
  })

  it('toggles a value on and off, keeping the order of the options', () => {
    let s = toggleValue(emptySelection(), 'industry', 'retail', known)
    s = toggleValue(s, 'industry', 'finance', known)
    expect(s.industry).toEqual(['finance', 'retail'])
    expect(toggleValue(s, 'industry', 'retail', known).industry).toEqual(['finance'])
    expect(selectedCount(s)).toBe(2)
  })

  it('offers the values published partners have, with counts and the labels of the schema', () => {
    const options = facetOptions(publishedP, dict)
    expect(Object.keys(options)).toEqual([...FACETS])
    for (const f of FACETS)
      for (const o of options[f]) {
        const n = publishedP.filter((p) => partnerValues(p)[f].includes(o.value)).length
        expect(o.count, `${f}=${o.value}`).toBe(n)
        expect(n).toBeGreaterThan(0)
      }
    for (const o of options.budget) expect(o.label).toBe(PARTNER_BUDGET_LABELS[o.value as 'under-10k'])
    for (const o of options.availability) expect(o.label).toBe(PARTNER_AVAILABILITY_LABELS[o.value as 'accepting'])
    // tiers in their Webflow order
    const tierOrder = options.tier.map((o) => dict.tiers.get(o.value)!.order!)
    expect([...tierOrder].sort((a, b) => a - b)).toEqual(tierOrder)
    // every option selects at least one partner, and the draft partner is never counted
    const known = optionValues(options)
    for (const f of FACETS)
      for (const v of known[f]) {
        const s = { ...emptySelection(), [f]: [v] }
        expect(
          publishedP.some((p) => matchesSelection(partnerValues(p), s)),
          `${f}=${v}`,
        ).toBe(true)
      }
  })

  it('a card carries the facet values the filter reads, and names from the dictionaries', () => {
    const p = publishedP[0]!
    const card = partnerCard(p, dict)
    expect(card.values).toEqual(partnerValues(p))
    expect(card.href).toBe(partnerPath(p.id))
    expect(card.tier).toBe(dict.tiers.get(card.values.tier[0]!)!.name)
    // the cards go into the page as JSON: nothing in them that JSON loses
    expect(JSON.parse(JSON.stringify(card))).toEqual(card)
  })

  it('announces the number of partners shown', () => {
    expect(partnersShownText(26, 26)).toBe('Showing all 26 partners.')
    expect(partnersShownText(3, 26)).toBe('Showing 3 of 26 partners.')
  })
})

describe('who delivered a case study', () => {
  const index = {
    names: new Map([
      ['live', 'Live Agency'],
      ['hidden', 'Hidden Agency'],
    ]),
    published: new Set(['live']),
  }

  it('links a published partner', () => {
    expect(deliveredBy(cs('a', { deliveredBy: 'live' }), index)).toEqual({
      name: 'Live Agency',
      href: '/certified-partners/live',
    })
  })

  it('names a draft partner without a link, with a warning', () => {
    const warnings: string[] = []
    expect(deliveredBy(cs('a', { deliveredBy: 'hidden' }), index, (m) => warnings.push(m))).toEqual({
      name: 'Hidden Agency',
    })
    expect(warnings).toEqual([
      'case study a: delivered by hidden, a partner that is not published; its name renders without a link',
    ])
  })

  it('names an outside address by its host, and nobody when there is neither', () => {
    expect(deliveredBy(cs('a', { deliveredByUrl: 'https://www.flowbiz.pl/en' }), index)).toEqual({
      name: 'flowbiz.pl',
      href: 'https://www.flowbiz.pl/en',
    })
    expect(deliveredBy(cs('a'), index)).toBeUndefined()
  })

  it('the draft partner of the content delivers no published case study a link to its page', () => {
    const real = {
      names: new Map(partners.map((p) => [p.id, p.data.name])),
      published: new Set(publishedP.map((p) => p.id)),
    }
    const drafts = new Set(partners.filter((p) => p.data.draft).map((p) => p.id))
    for (const c of publishedCs) {
      const d = deliveredBy(c, real, () => {})
      if (d?.href?.startsWith('/certified-partners/'))
        expect(drafts.has(d.href.slice('/certified-partners/'.length)), c.id).toBe(false)
    }
  })
})

describe('SEO of the detail pages', () => {
  it.each(publishedCs.map((c) => [c.id, c] as const))('case study %s', (_, c) => {
    const seo = caseStudySeo(c, ORIGIN)
    const url = `${ORIGIN}${caseStudyPath(c.id)}`
    expect(seo.title).toBe(`${c.data.title} | Open Mercato`)
    expect(seo.canonical).toBe(url)
    expect(seo.description).toBe(c.data.description)
    const graph = caseStudyJsonLd(c, ORIGIN)['@graph'] as Record<string, unknown>[]
    expect(graph.map((g) => g['@type'])).toEqual(['Article', 'BreadcrumbList'])
    expect(graph[0]).toMatchObject({ headline: c.data.title, url, mainEntityOfPage: url })
    expect((graph[1]!.itemListElement as { item: string }[]).map((i) => i.item)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/case-studies`,
      url,
    ])
    const card = caseStudyCard(c, csCategories)
    expect(card.categories.length).toBe(c.data.categories.length)
  })

  it('the Article names who delivered it', () => {
    const graph = caseStudyJsonLd(cs('a'), ORIGIN, { name: 'X', href: '/certified-partners/x' }, ['ERP'])[
      '@graph'
    ] as Record<string, unknown>[]
    expect(graph[0]).toMatchObject({
      author: { '@type': 'Organization', name: 'X', url: `${ORIGIN}/certified-partners/x` },
      articleSection: ['ERP'],
      alternativeHeadline: 'Heading a',
    })
  })

  it.each(publishedP.map((p) => [p.id, p] as const))('partner %s', (_, p) => {
    const seo = partnerSeo(p, ORIGIN)
    const url = `${ORIGIN}${partnerPath(p.id)}`
    expect(seo.title).toBe(`${p.data.name} | Open Mercato`)
    expect(seo.canonical).toBe(url)
    const graph = partnerJsonLd(p, ORIGIN)['@graph'] as Record<string, unknown>[]
    expect(graph.map((g) => g['@type'])).toEqual(['BreadcrumbList'])
    expect(partnerFacts(p, dict).map((f) => f.facet)[0]).toBe('tier')
  })

  it('a partner page uses the logo as og:image only in a format social crawlers read', () => {
    const p = publishedP[0]!
    const withLogo = (src: string) => ({ ...p, data: { ...p.data, logo: { src, alt: 'x' } } })
    expect(partnerSeo(withLogo('/media/partners/a.png'), ORIGIN).ogImage).toBe('/media/partners/a.png')
    expect(partnerSeo(withLogo('/media/partners/a.webp'), ORIGIN).ogImage).toBe('/media/partners/a.webp')
    expect(partnerSeo(withLogo('/media/partners/a.svg'), ORIGIN).ogImage).toBeUndefined()
    expect(partnerSeo(withLogo('/media/partners/a.avif'), ORIGIN).ogImage).toBeUndefined()
  })

  it('an open job has JobPosting and a breadcrumb to /careers; a closed one only the breadcrumb', () => {
    const job = publishedJobs(jobs)[0]!
    const url = `${ORIGIN}${jobPath(job.id)}`
    expect(jobSeo(job, ORIGIN)).toEqual({
      title: `${job.data.title} | Open Mercato`,
      description: job.data.description,
      canonical: url,
    })
    const graph = jobJsonLd({ ...job, data: { ...job.data, open: true } }, ORIGIN, '<p>Body</p>')['@graph'] as Record<
      string,
      unknown
    >[]
    expect(graph.map((g) => g['@type'])).toEqual(['JobPosting', 'BreadcrumbList'])
    expect(graph[0]).toMatchObject({
      title: job.data.title,
      description: '<p>Body</p>',
      url,
      datePosted: job.data.datePosted.toISOString(),
      hiringOrganization: { '@type': 'Organization', name: 'Open Mercato' },
    })
    expect((graph[1]!.itemListElement as { item: string }[]).map((i) => i.item)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/careers`,
      url,
    ])
    const closed = jobJsonLd({ ...job, data: { ...job.data, open: false } }, ORIGIN)['@graph'] as Record<
      string,
      unknown
    >[]
    expect(closed.map((g) => g['@type'])).toEqual(['BreadcrumbList'])
  })

  it('maps employment types and remote work', () => {
    const job: JobEntry = {
      id: 'j',
      data: {
        title: 'J',
        description: 'D.',
        location: 'Remote · Wroclaw',
        employmentType: 'part-time',
        applyUrl: 'mailto:a@b.co',
        open: true,
        datePosted: new Date('2026-01-01T00:00:00Z'),
        validThrough: new Date('2026-02-01T00:00:00Z'),
        draft: false,
      },
    }
    const posting = (jobJsonLd(job, ORIGIN)['@graph'] as Record<string, unknown>[])[0]!
    expect(posting).toMatchObject({
      employmentType: 'PART_TIME',
      jobLocationType: 'TELECOMMUTE',
      validThrough: '2026-02-01T00:00:00.000Z',
      description: 'D.',
    })
    expect(isRemote('Wroclaw office')).toBe(false)
  })
})

describe('links of bodies to the Phase 4 routes', () => {
  const rules: LinkRules = bodyLinkRules(CONTENT)

  it('keeps links to published case studies, partners and jobs, and to the list pages', () => {
    for (const href of [
      caseStudyPath(publishedCs[0]!.id),
      partnerPath(publishedP[0]!.id),
      jobPath(publishedJobs(jobs)[0]!.id),
      '/case-studies',
      '/certified-partners',
    ])
      expect(linkAction(href, rules), href).toEqual({ kind: 'keep' })
    expect(servesFixed('/case-studies')).toBe(true)
    expect(servesFixed('/careers')).toBe(false)
  })

  it('renders a link to a draft or a missing entry as text', () => {
    const drafts = [
      ...caseStudies.filter((c) => c.data.draft).map((c) => caseStudyPath(c.id)),
      ...partners.filter((p) => p.data.draft).map((p) => partnerPath(p.id)),
      '/case-studies/no-such-case',
      '/certified-partners/no-such-partner',
      '/careers-jobs/no-such-job',
    ]
    for (const href of drafts) expect(linkAction(href, rules).kind, href).toBe('text')
  })

  it('still points a link to /careers, a page on Webflow until Phase 6, at the live site', () => {
    expect(linkAction('/careers', rules)).toEqual({ kind: 'live', href: `${ORIGIN}/careers` })
  })
})

describe('a Markdown field of the frontmatter', () => {
  it('renders bullet lists and paragraphs, escaping the rest', () => {
    expect(markdownHtml('- One `a<b>`\n- **Two** and [x](https://e.x)\n\nText *it* <i>')).toBe(
      '<ul><li>One <code>a&lt;b&gt;</code></li><li><strong>Two</strong> and <a href="https://e.x">x</a></li></ul><p>Text <em>it</em> &lt;i&gt;</p>',
    )
  })

  it('sends each link through the link rules: kept, pointed elsewhere, or text', () => {
    const rules = bodyLinkRules(CONTENT)
    const link = (href: string): string | undefined => {
      const a = linkAction(href, rules)
      return a.kind === 'keep' ? href : a.kind === 'live' ? a.href : undefined
    }
    const draft = caseStudies.find((c) => c.data.draft)!
    expect(markdownHtml(`- [d](${caseStudyPath(draft.id)}) and [c](/careers) and [p](/certified-partners)`, link)).toBe(
      `<ul><li>d and <a href="${ORIGIN}/careers">c</a> and <a href="/certified-partners">p</a></li></ul>`,
    )
  })

  it('every technology stack of a published case study renders as a list', () => {
    for (const c of publishedCs)
      if (c.data.overview.stack) expect(markdownHtml(c.data.overview.stack), c.id).toMatch(/^<ul><li>/)
  })
})
