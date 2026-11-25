// The landings of the main site (www site migration spec, Phase 5), from www/content/landings through the schema:
// routes, hreflang, the FAQPage JSON-LD and the template's helpers, without a build.
import { describe, expect, it } from 'vitest'
import { LANDING_TEMPLATE_TEXT } from '../../lib/schema/www-content.ts'
import {
  alternatesOf,
  faqJsonLd,
  intentOf,
  landingOgImage,
  plainText,
  publishedLandings,
  reviewedDay,
} from '../../www/src/lib/landings.ts'
import { landingEntries } from './landings-content.ts'

const ORIGIN = 'https://www.openmercato.com'

const entries = landingEntries()
const byId = new Map(entries.map((e) => [e.id, e]))

describe('www/src/lib/landings.ts (Phase 5)', () => {
  it('routes the 32 landings of the export, none a draft', () => {
    expect(publishedLandings(entries).map((e) => e.id)).toHaveLength(32)
  })

  it('never routes a draft', () => {
    const draft = { ...entries[0]!, id: 'zz-draft', data: { ...entries[0]!.data, draft: true } }
    expect(publishedLandings([...entries, draft]).map((e) => e.id)).not.toContain('zz-draft')
  })

  it('links the Polish landing and its English original both ways, x-default to English (hreflang)', () => {
    const expected = [
      { hreflang: 'en', href: `${ORIGIN}/baselinker-alternative` },
      { hreflang: 'pl', href: `${ORIGIN}/baselinker-alternatywa` },
      { hreflang: 'x-default', href: `${ORIGIN}/baselinker-alternative` },
    ]
    expect(alternatesOf(byId.get('baselinker-alternatywa')!, entries, ORIGIN)).toEqual(expected)
    expect(alternatesOf(byId.get('baselinker-alternative')!, entries, ORIGIN)).toEqual(expected)
    expect(alternatesOf(byId.get('hubspot-alternative')!, entries, ORIGIN)).toEqual([])
  })

  it('writes FAQPage JSON-LD equal to each landing’s faq items, in order', () => {
    for (const e of entries) {
      const ld = faqJsonLd(e, ORIGIN, {}) as {
        '@type': string
        mainEntity: { name: string; acceptedAnswer: { text: string } }[]
      }
      expect(ld['@type']).toBe('FAQPage')
      expect(ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
        e.data.faq.items.map((f) => [f.question, plainText(f.answer)]),
      )
    }
  })

  it('reads answers as plain text and contact links as intents', () => {
    expect(plainText('See **the** [docs](https://x.example) and `code`.')).toBe('See the docs and code.')
    expect(intentOf('/contact?interest=hubspot-alternative')).toBe('hubspot-alternative')
    expect(intentOf('#comparison')).toBeUndefined()
    expect(intentOf('https://example.com/?interest=x')).toBeUndefined()
  })

  it('prints review dates in the landing’s language, as the live pages do', () => {
    const d = new Date('2026-11-12T00:00:00Z')
    expect(reviewedDay(d, 'en')).toBe('12 November 2026')
    expect(reviewedDay(d, 'pl')).toBe('12 listopada 2026')
    expect(LANDING_TEMPLATE_TEXT.pl.navLabel).toBe('Na tej stronie')
  })

  it('gives each landing an OG image: its own, else the card the build draws', () => {
    const e = byId.get('hubspot-alternative')!
    expect(landingOgImage(e)).toBe('/og/hubspot-alternative.png')
    expect(landingOgImage({ ...e, data: { ...e.data, seo: { ...e.data.seo, ogImage: '/media/x.png' } } })).toBe(
      '/media/x.png',
    )
  })
})
