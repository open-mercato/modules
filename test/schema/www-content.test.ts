import { describe, expect, it } from 'vitest'
import {
  CTA_EVENT_MAX,
  Cta,
  entryFileProblems,
  fileEntries,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  Image,
  MediaPath,
  PARTNER_AVAILABILITY,
  PARTNER_AVAILABILITY_LABELS,
  PARTNER_BUDGET_LABELS,
  PARTNER_BUDGETS,
  RESERVED_SEGMENTS,
  routeNamespaceProblems,
  Seo,
  Slug,
  UtcDate,
  WWW_COLLECTIONS,
  WWW_SOURCES,
  wwwSchemas,
  type WwwCollection,
} from '../../lib/schema/www-content.ts'
import { findBannedChars } from '../../lib/core/text.ts'

const seo = { title: 'HubSpot alternative', description: 'Open Mercato as an open source HubSpot alternative.' }
const cta = { label: 'Start free', href: '/get-started', tracking: { placement: 'hero', action: 'start' } }
const image = { src: '/media/blog/64a1-cover.png', alt: 'Dashboard', width: 1200, height: 630 }
const wf = '64a1b2c3d4e5f60718293a4b'

/** One valid sample per collection: the smallest entry each schema accepts, plus the optional fields that matter. */
const VALID: Record<WwwCollection, unknown> = {
  landings: {
    webflowId: wf,
    locale: 'en',
    kind: 'alternative',
    competitor: 'HubSpot',
    alternateOf: 'hubspot-alternatywa',
    seo,
    hero: { eyebrow: 'Alternative', title: 'Own your CRM', lead: 'Open source.', primary: cta, proof: ['MIT'] },
    sectionNav: [{ label: 'FAQ', anchor: 'faq' }],
    capabilities: {
      columns: ['Open Mercato', 'HubSpot'],
      groups: [{ title: 'Data', rows: [{ label: 'Self-hosting', ours: 'yes', theirs: 'No' }] }],
      legend: 'Yes means built in.',
      note: 'Checked on the vendor site.',
      reviewed: '2026-11-01',
      sources: [{ label: 'Pricing', url: 'https://example.com/pricing' }],
    },
    faq: {
      title: 'FAQ',
      items: [
        { question: 'Is it free?', answer: 'Yes.' },
        { question: 'Can I host it?', answer: 'Yes.' },
        { question: 'Is there support?', answer: 'Partners.' },
      ],
    },
    cta: { title: 'Try it', body: 'Start today.', primary: cta },
    related: ['salesforce-alternative'],
  },
  pages: { seo, blocks: [{ type: 'copy', markdown: '# Product', webflowNode: 'section-1' }] },
  blog: {
    title: 'Release notes',
    description: 'What changed.',
    date: '2026-10-01T09:00:00Z',
    author: 'jane-doe',
    category: 'releases',
    thumbnail: image,
  },
  authors: { name: 'Jane Doe' },
  blogCategories: { name: 'Releases', order: 1, labelColor: '#2f6feb' },
  caseStudies: {
    title: 'Acme',
    heading: 'Acme moved its orders',
    description: 'A wholesale case.',
    heroVideo: 'dQw4w9WgXcQ',
    deliveredBy: 'some-agency',
    overview: { client: 'Acme', industry: 'Wholesale', timeline: '3 months', type: 'B2B', stack: 'Open Mercato' },
    stats: [
      { title: '2x', description: 'orders' },
      { title: '50%', description: 'less time' },
      { title: '1', description: 'system' },
    ],
    categories: ['wholesale'],
  },
  caseStudyCategories: { name: 'Wholesale' },
  partners: {
    name: 'Some Agency',
    logo: { src: '/media/partners/logo.svg', alt: 'Some Agency' },
    tier: 'certified',
    industries: ['fintech'],
    location: 'poland',
    languages: ['english'],
    services: ['implementation'],
    budget: '10k-20k',
    availability: 'accepting',
    projectsInPortfolio: true,
    website: 'https://agency.example.com',
    description: 'Builds on Open Mercato.',
  },
  partnerTiers: { name: 'Certified', order: 1, backgroundColor: '#000', textColor: '#ffffff' },
  partnerIndustries: { name: 'Fintech', order: 2 },
  partnerServices: { name: 'Implementation' },
  partnerLanguages: { name: 'English' },
  partnerLocations: { name: 'Poland' },
  jobs: {
    title: 'Engineer',
    description: 'Build it.',
    location: 'Remote',
    employmentType: 'full-time',
    applyUrl: 'mailto:jobs@example.com',
    open: true,
    datePosted: '2026-09-01',
    validThrough: '2026-12-31',
  },
  redirects: { from: '/docs/*', to: 'https://docs.openmercato.com/', status: 301, source: 'docs-map' },
}

/** One invalid sample per collection, each breaking one rule of the Data Model. */
const INVALID: Record<WwwCollection, [string, (v: Record<string, unknown>) => unknown][]> = {
  landings: [
    ['fewer than 3 FAQ items', (v) => ({ ...v, faq: { title: 'FAQ', items: [{ question: 'Q', answer: 'A' }] } })],
    ['a locale other than en or pl', (v) => ({ ...v, locale: 'de' })],
    ['an empty description', (v) => ({ ...v, seo: { ...seo, description: '' } })],
    ['a related landing that is not a slug', (v) => ({ ...v, related: ['Not A Slug'] })],
  ],
  pages: [
    ['a block of an unknown type', (v) => ({ ...v, blocks: [{ type: 'hero', title: 'x' }] })],
    ['no seo', ({ seo: _seo, ...v }) => v],
  ],
  blog: [
    ['a date that is not ISO 8601', (v) => ({ ...v, date: '1 Oct 2026' })],
    ['an unknown field', (v) => ({ ...v, slug: 'x' })],
  ],
  authors: [['an empty name', () => ({ name: ' ' })]],
  blogCategories: [['no order', () => ({ name: 'Releases' })]],
  caseStudies: [
    ['two stats', (v) => ({ ...v, stats: (v.stats as unknown[]).slice(0, 2) })],
    ['both deliveredBy and deliveredByUrl', (v) => ({ ...v, deliveredByUrl: 'https://agency.example.com' })],
    ['a video id that is not one', (v) => ({ ...v, heroVideo: 'https://youtu.be/x' })],
  ],
  caseStudyCategories: [['no name', () => ({})]],
  partners: [
    ['a budget key that does not exist', (v) => ({ ...v, budget: 'Under $10,000' })],
    ['a website over http', (v) => ({ ...v, website: 'http://agency.example.com' })],
    ['a logo without alt text', (v) => ({ ...v, logo: { src: '/media/partners/logo.svg', alt: '' } })],
  ],
  partnerTiers: [['a colour that is not hex', () => ({ name: 'Certified', order: 1, textColor: 'red' })]],
  partnerIndustries: [['an order that is not an integer', () => ({ name: 'Fintech', order: 1.5 })]],
  partnerServices: [['an unknown field', () => ({ name: 'x', color: '#fff' })]],
  partnerLanguages: [['an order (names only)', () => ({ name: 'English', order: 1 })]],
  partnerLocations: [['no name', () => ({})]],
  jobs: [
    ['an employment type that does not exist', (v) => ({ ...v, employmentType: 'freelance' })],
    ['validThrough before datePosted', (v) => ({ ...v, validThrough: '2026-01-01' })],
  ],
  redirects: [
    ['a status other than 301', (v) => ({ ...v, status: 302 })],
    ['a source that is not a path', (v) => ({ ...v, from: 'docs/x' })],
    ['a target over http', (v) => ({ ...v, to: 'http://docs.openmercato.com/' })],
  ],
}

describe('lib/schema/www-content.ts (www site migration, Data Model)', () => {
  const schemas = wwwSchemas()

  it('has a schema and a source for every collection', () => {
    expect(Object.keys(schemas).sort()).toEqual([...WWW_COLLECTIONS].sort())
    expect(Object.keys(WWW_SOURCES).sort()).toEqual([...WWW_COLLECTIONS].sort())
    const places = Object.values(WWW_SOURCES).map((s) => (s.kind === 'file' ? s.file : s.dir))
    expect(new Set(places).size).toBe(places.length)
  })

  for (const name of WWW_COLLECTIONS) {
    it(`${name}: accepts a valid sample`, () => {
      const r = schemas[name].safeParse(VALID[name])
      expect(r.success, r.error ? JSON.stringify(r.error.issues) : '').toBe(true)
    })
    for (const [why, make] of INVALID[name]) {
      it(`${name}: refuses ${why}`, () => {
        expect(schemas[name].safeParse(make(VALID[name] as Record<string, unknown>)).success).toBe(false)
      })
    }
  }

  it('defaults draft to false and a draft entry still validates (D6)', () => {
    const post = schemas.blog.parse(VALID.blog) as { draft: boolean; featured: boolean }
    expect(post.draft).toBe(false)
    expect(post.featured).toBe(false)
    expect((schemas.blog.parse({ ...(VALID.blog as object), draft: true }) as { draft: boolean }).draft).toBe(true)
  })

  it('takes a date as a string or as the Date a YAML parser made, and reads it in UTC', () => {
    expect(UtcDate.parse('2026-11-24').toISOString()).toBe('2026-11-24T00:00:00.000Z')
    expect(UtcDate.parse(new Date('2026-11-24T10:00:00Z')).toISOString()).toBe('2026-11-24T10:00:00.000Z')
    expect(UtcDate.safeParse('2026-13-45').success).toBe(false)
    // a day the calendar does not have would roll over into March
    expect(UtcDate.safeParse('2026-02-30').success).toBe(false)
    expect(UtcDate.safeParse('2028-02-29T08:00:00Z').success).toBe(true)
  })

  it('passes references through the reference builder it is given', () => {
    const seen: string[] = []
    const s = wwwSchemas((c) => {
      seen.push(c)
      return Slug
    })
    expect(s.partners.safeParse(VALID.partners).success).toBe(true)
    expect([...new Set(seen)].sort()).toEqual([
      'authors',
      'blogCategories',
      'caseStudyCategories',
      'landings',
      'partnerIndustries',
      'partnerLanguages',
      'partnerLocations',
      'partnerServices',
      'partnerTiers',
      'partners',
    ])
  })

  it('keeps media under /media or /files', () => {
    expect(MediaPath.safeParse('/media/blog/a.png').success).toBe(true)
    expect(MediaPath.safeParse('/files/logo.svg').success).toBe(true)
    for (const bad of ['/run/a.png', 'media/a.png', '/media/../secret', 'https://cdn.example.com/a.png'])
      expect(MediaPath.safeParse(bad).success, bad).toBe(false)
  })

  it('allows an empty alt text only on a decorative image', () => {
    expect(Image.safeParse({ ...image, alt: '' }).success).toBe(false)
    expect(Image.safeParse({ ...image, alt: '', decorative: true }).success).toBe(true)
  })

  it('caps the CTA event name at the length GA4 reports keep', () => {
    expect(Cta.safeParse(cta).success).toBe(true)
    const long = { placement: 'a'.repeat(CTA_EVENT_MAX), action: 'go' }
    expect(Cta.safeParse({ ...cta, tracking: long }).success).toBe(false)
    expect(Cta.safeParse({ ...cta, tracking: { placement: 'Hero', action: 'go' } }).success).toBe(false)
  })

  it('requires a title and a description in every Seo', () => {
    expect(Seo.safeParse(seo).success).toBe(true)
    expect(Seo.safeParse({ title: 'x' }).success).toBe(false)
  })

  it('has a label for every option key, in plain text', () => {
    expect(Object.keys(PARTNER_BUDGET_LABELS)).toEqual([...PARTNER_BUDGETS])
    expect(Object.keys(PARTNER_AVAILABILITY_LABELS)).toEqual([...PARTNER_AVAILABILITY])
    expect(Object.keys(EMPLOYMENT_TYPE_LABELS)).toEqual([...EMPLOYMENT_TYPES])
    for (const label of [
      ...Object.values(PARTNER_BUDGET_LABELS),
      ...Object.values(PARTNER_AVAILABILITY_LABELS),
      ...Object.values(EMPLOYMENT_TYPE_LABELS),
    ])
      expect(findBannedChars(label)).toEqual([])
  })

  describe('routeNamespaceProblems', () => {
    it('accepts pages and landings with their own slugs', () => {
      expect(routeNamespaceProblems(['home', 'product', 'careers'], ['hubspot-alternative'])).toEqual([])
    })
    it('refuses a slug in both collections', () => {
      expect(routeNamespaceProblems(['crm'], ['crm'])).toEqual(['pages/crm and landings/crm both route to /crm'])
    })
    it('refuses every reserved first segment', () => {
      for (const seg of RESERVED_SEGMENTS)
        expect(routeNamespaceProblems([], [seg])).toEqual([`landings/${seg}: /${seg} is a reserved path`])
      expect(routeNamespaceProblems(['run'], [])).toEqual(['pages/run: /run is a reserved path'])
    })
    it('keeps the home slug for the home page', () => {
      expect(routeNamespaceProblems([], ['home'])).toEqual(['landings/home: the slug of the home page'])
    })
  })

  describe('the files of a collection', () => {
    it('takes a file name as the id only when it is a slug with the collection extension', () => {
      expect(entryFileProblems('landings', ['hubspot-alternative.yaml', '.gitkeep'])).toEqual([])
      expect(entryFileProblems('blog', ['Release Notes.md', 'post.yaml', 'ok.md'])).toEqual([
        'blog/Release Notes.md: the name is not a slug',
        'blog/post.yaml: not a .md file',
      ])
      expect(entryFileProblems('authors', [])).toEqual(['authors is not a collection of one file per entry'])
    })

    it('reads a dictionary keyed by slug, and an empty file as no entries', () => {
      expect(fileEntries('authors', { 'jane-doe': { name: 'Jane Doe' } })).toEqual({ 'jane-doe': { name: 'Jane Doe' } })
      expect(fileEntries('authors', null)).toEqual({})
      expect(() => fileEntries('authors', { 'Jane Doe': { name: 'x' } })).toThrow(/Jane Doe is not a slug/)
      expect(() => fileEntries('authors', [{ name: 'x' }])).toThrow(/a map of slug to entry is expected/)
      expect(() => fileEntries('blog', {})).toThrow(/not a collection of one file/)
    })

    it('reads redirects.yaml as a list keyed by its from paths, and refuses one given twice', () => {
      const rule = { from: '/docs', to: 'https://docs.openmercato.com/', status: 301, source: 'docs-map' }
      expect(fileEntries('redirects', [rule])).toEqual({ '/docs': rule })
      expect(fileEntries('redirects', undefined)).toEqual({})
      expect(() => fileEntries('redirects', [rule, rule])).toThrow(/\/docs is given twice/)
      expect(() => fileEntries('redirects', { '/docs': rule })).toThrow(/a list of rules is expected/)
    })
  })
})
