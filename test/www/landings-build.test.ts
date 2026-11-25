// The built landings (www site migration spec, Phase 5), read from dist-www/ after `yarn build:www`: each landing
// builds with its canonical, `<html lang>`, an OG image that exists as a 1200 by 630 PNG, FAQPage JSON-LD equal to its
// `faq` items, and hreflang where the live page has it. Runs only with WWW_BUILD=1, like blog-build.test.ts.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fillCounts } from '../../lib/core/www-tokens.ts'
import { countValues } from '../../www/src/lib/counts.ts'
import { plainText, publishedLandings } from '../../www/src/lib/landings.ts'
import { ROOT } from '../emit/helpers.ts'
import { landingEntries } from './landings-content.ts'

const DIST = join(ROOT, 'dist-www')
const ORIGIN = 'https://www.openmercato.com'
const required = process.env.WWW_BUILD === '1'
const built = required && existsSync(join(DIST, 'hubspot-alternative.html'))
const landings = publishedLandings(landingEntries())
// the counts the build filled its tokens with (the catalog's modules.json of the same checkout, when there is one)
const counts = countValues()

const decode = (s: string): string =>
  s
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

describe('the build of the landings', () => {
  it('exists when the test is required', () => {
    if (required) expect(existsSync(join(DIST, 'hubspot-alternative.html')), 'run yarn build:www first').toBe(true)
  })

  describe.skipIf(!built)('dist-www', () => {
    for (const l of landings) {
      it(`/${l.id}: builds with its SEO, OG image and FAQPage`, () => {
        const html = readFileSync(join(DIST, `${l.id}.html`), 'utf8')
        expect(html).toContain(`<html lang="${l.data.locale}"`)
        expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/${l.id}">`)
        expect(decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '')).toBe(l.data.seo.title)
        const og = /<meta property="og:image" content="([^"]*)"/.exec(html)?.[1]
        expect(og).toBe(`${ORIGIN}/og/${l.id}.png`)
        expect(html).toContain('<meta property="og:image:width" content="1200">')
        expect(html).toContain('<meta property="og:image:height" content="630">')
        const png = readFileSync(join(DIST, 'og', `${l.id}.png`))
        expect(png.subarray(1, 4).toString()).toBe('PNG')
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
        const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!)
        expect(ld['@type']).toBe('FAQPage')
        expect(
          ld.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => [q.name, q.acceptedAnswer.text]),
        ).toEqual(
          l.data.faq.items.map((f) => [fillCounts(f.question, counts), fillCounts(plainText(f.answer), counts)]),
        )
        // no hand-typed count: the tokens are filled or print nothing (A6)
        expect(html).not.toMatch(/\{(?:githubStars|moduleCount)\}/)
        const hreflang = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)"/g)].map((m) => m[1])
        expect(hreflang).toEqual(l.id.startsWith('baselinker-') ? ['en', 'pl', 'x-default'] : [])
      })
    }
  })
})
