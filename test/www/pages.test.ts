// The unique pages of the main site (www site migration spec, Phase 6): routes of the pages entries, the component of
// a block, the JSON-LD computed from content, the copy of the list routes, and the Markdown of headings and prose.
import { describe, expect, it } from 'vitest'
import { wwwSchemas } from '../../lib/schema/www-content.ts'
import { headingHtml, proseHtml } from '../../www/src/lib/inline-markdown.ts'
import {
  blockComponent,
  listPageCopy,
  pageEntry,
  pageJsonLd,
  pagePath,
  routedPages,
  type PageEntry,
} from '../../www/src/lib/pages.ts'

const seo = { title: 'Product | Open Mercato', description: 'The framework for {moduleCount} modules.' }
const entry = (id: string, data: Record<string, unknown>): PageEntry => ({
  id,
  data: wwwSchemas().pages.parse({ seo, ...data }) as PageEntry['data'],
})

describe('the pages entries', () => {
  const pages = [
    entry('home', { blocks: [{ type: 'hero', title: 'Home' }] }),
    entry('product', { blocks: [{ type: 'hero', title: 'Product' }] }),
    entry('about', { blocks: [{ type: 'copy', markdown: 'x', webflowNode: 'n' }], draft: true }),
    entry('blog', { blocks: [{ type: 'hero', eyebrow: 'Blog', title: 'Open Mercato Blog', lead: 'Guides.' }] }),
    entry('careers', { blocks: [{ type: 'hero', title: 'Careers' }] }),
  ]

  it('routes the home page at / and every other published page at /<slug>, not the list pages or drafts', () => {
    expect(pagePath('home')).toBe('/')
    expect(pagePath('product')).toBe('/product')
    expect(routedPages(pages).map((p) => p.id)).toEqual(['product'])
  })

  it('reads a page the build needs, and refuses a missing or draft one', () => {
    expect(pageEntry(pages, 'home').id).toBe('home')
    expect(() => pageEntry(pages, 'contact')).toThrow('missing')
    expect(() => pageEntry(pages, 'about')).toThrow('draft')
  })

  it('gives a list route the seo and the one hero block of its entry', () => {
    const { seo: s, hero } = listPageCopy(pages, 'blog')
    expect(s.title).toBe('Product | Open Mercato')
    expect([hero.eyebrow, hero.title, hero.lead]).toEqual(['Blog', 'Open Mercato Blog', 'Guides.'])
    const two = [
      entry('blog', {
        blocks: [
          { type: 'hero', title: 'A' },
          { type: 'hero', title: 'B' },
        ],
      }),
    ]
    expect(() => listPageCopy(two, 'blog')).toThrow('exactly one hero block')
  })

  it('renders a block by its layout, else its type, and a legacy block by its component', () => {
    expect(blockComponent({ type: 'hero', title: 'x' })).toEqual({ dir: 'blocks', name: 'hero' })
    expect(blockComponent({ type: 'team', layout: 'team-page', members: [{ name: 'A', role: 'B' }] })).toEqual({
      dir: 'blocks',
      name: 'team-page',
    })
    expect(blockComponent({ type: 'legacy', component: 'crm-hero', note: 'Q4' })).toEqual({
      dir: 'legacy',
      name: 'crm-hero',
    })
    expect(() => blockComponent({ type: 'copy', markdown: 'x', webflowNode: 'n' })).toThrow('copy block')
  })
})

describe('the JSON-LD of a page', () => {
  const site = 'https://www.openmercato.com'

  it('has none when the page asks for none and shows no FAQ', () => {
    expect(pageJsonLd(entry('team', { blocks: [{ type: 'hero', title: 'Team' }] }), site, {})).toBeUndefined()
  })

  it('names the page type from seo with counts filled, and FAQPage from faq blocks and jsonLd.faq', () => {
    const page = entry('product', {
      jsonLd: { type: 'SoftwareApplication', faq: [{ question: 'Hidden?', answer: 'In the **head** only.' }] },
      blocks: [{ type: 'faq', title: 'FAQ', items: [{ question: 'Shown?', answer: 'Yes.' }] }],
    })
    const ld = pageJsonLd(page, site, { moduleCount: 91 }) as { '@graph': Record<string, unknown>[] }
    const [app, faq] = ld['@graph']
    expect(app).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Open Mercato',
      description: 'The framework for 91 modules.',
      url: 'https://www.openmercato.com/product',
    })
    expect((faq!.mainEntity as { name: string }[]).map((q) => q.name)).toEqual(['Shown?', 'Hidden?'])
    expect(JSON.stringify(faq)).toContain('In the head only.')
  })

  it('gives a HowTo the items of its first steps block as steps', () => {
    const page = entry('how-to-contribute', {
      jsonLd: { type: 'HowTo' },
      blocks: [
        { type: 'steps', title: 'Start', items: [{ title: 'Clone', body: '`git clone`' }, { title: 'Install' }] },
      ],
    })
    const node = (pageJsonLd(page, site, {}) as { '@graph': Record<string, unknown>[] })['@graph'][0]!
    expect(node.step).toEqual([
      { '@type': 'HowToStep', position: 1, name: 'Clone', text: 'git clone' },
      { '@type': 'HowToStep', position: 2, name: 'Install' },
    ])
  })
})

describe('the Markdown of unique pages', () => {
  it('writes the emphasis of a heading as the live highlight span', () => {
    expect(headingHtml('Meet the people behind *Open Mercato*')).toBe(
      'Meet the people behind <span>Open Mercato</span>',
    )
  })

  it('writes headings, paragraphs and lists, a numbered list keeping its first number', () => {
    const md =
      '## Privacy\n\nWe **care**.\n\n#### Form\n\n1. One\n2. Two\ncontinued\n\n3. Three\n\n- a\n- [b](mailto:x@y.z)'
    expect(proseHtml(md)).toBe(
      '<h2>Privacy</h2><p>We <strong>care</strong>.</p><h4>Form</h4><ol><li>One</li><li>Two continued</li></ol>' +
        '<ol start="3"><li>Three</li></ol><ul><li>a</li><li><a href="mailto:x@y.z">b</a></li></ul>',
    )
  })
})
