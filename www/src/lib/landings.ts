// The SEO landings of the main site (spec 2026-11-24-www-site-migration.md of PR #23, Phase 5): which landings the
// site routes, their address, the language links between a landing and its translation (hreflang), the FAQPage
// JSON-LD equal to each landing's `faq`, and the helpers of the template. A draft is never routed (D6). Isomorphic.
import type { z } from 'zod'
import { fillCounts, type CountValues } from '../../../lib/core/www-tokens.ts'
import { formatProseDate } from '../../../lib/import-webflow/text.ts'
import { LANDING_TEMPLATE_TEXT, type LandingLocale, type landingSchema } from '../../../lib/schema/www-content.ts'
import { refId, type Ref } from './blog.ts'

type Parsed = z.output<ReturnType<typeof landingSchema>>

/** A landing entry: its id (the slug) and its data after the schema; references are slugs or Astro references. */
export interface LandingEntry {
  id: string
  data: Omit<Parsed, 'alternateOf' | 'related'> & { alternateOf?: Ref; related: Ref[] }
}
export type LandingData = LandingEntry['data']

/** The site path of a landing: the root namespace, shared with the unique pages (spec, Routing). */
export const landingPath = (slug: string): string => `/${slug}`

/** The landings the site routes: every one but the drafts, by slug. */
export function publishedLandings<T extends LandingEntry>(entries: readonly T[]): T[] {
  return entries.filter((e) => !e.data.draft).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** The words of the template in the landing's language. */
export const templateText = (locale: LandingLocale) => LANDING_TEMPLATE_TEXT[locale]

/** A review date as the landings print it: "12 November 2026", "12 listopada 2026" (UTC). */
export function reviewedDay(d: Date, locale: LandingLocale): string {
  return formatProseDate(d.toISOString().slice(0, 10), locale)
}

/** The `interest` of a contact link (`/contact?interest=hubspot-alternative`), which the live CTA carries as `data-om-intent`. */
export function intentOf(href: string): string | undefined {
  if (!href.startsWith('/')) return undefined
  return new URL(href, 'https://www.openmercato.com').searchParams.get('interest') ?? undefined
}

/** One `<link rel="alternate" hreflang>` of a landing. */
export interface Alternate {
  hreflang: string
  href: string
}

/**
 * The language links of a landing (spec, SEO: hreflang): a translation names its original in `alternateOf`; both pages
 * then link each other and `x-default` points to the English one. A landing with no translation has none.
 */
export function alternatesOf(entry: LandingEntry, all: readonly LandingEntry[], site: string): Alternate[] {
  const published = publishedLandings(all)
  const original = refId(entry.data.alternateOf) ?? entry.id
  const group = published.filter((l) => l.id === original || refId(l.data.alternateOf) === original)
  if (group.length < 2) return []
  const url = (id: string) => new URL(landingPath(id), site).toString()
  const out: Alternate[] = group
    .map((l) => ({ hreflang: l.data.locale as string, href: url(l.id) }))
    .sort((a, b) => (a.hreflang < b.hreflang ? -1 : 1))
  const english = group.find((l) => l.data.locale === 'en') ?? group.find((l) => l.id === original)!
  out.push({ hreflang: 'x-default', href: url(english.id) })
  return out
}

/** Plain text of a short Markdown string (the FAQ answers): links to their label, emphasis and code marks dropped. */
export function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?![*\w])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The FAQPage JSON-LD of a landing (spec, SEO: from `faq` on every landing): one Question per item, in order, with the
 * answer as plain text; the page's language and address.
 */
export function faqJsonLd(entry: LandingEntry, site: string, counts: CountValues): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: entry.data.locale,
    url: new URL(landingPath(entry.id), site).toString(),
    mainEntity: entry.data.faq.items.map((f) => ({
      '@type': 'Question',
      name: fillCounts(f.question, counts),
      acceptedAnswer: { '@type': 'Answer', text: fillCounts(plainText(f.answer), counts) },
    })),
  }
}

/** The OG image of a landing: its own `seo.ogImage`, else the card the build draws for it (www/src/pages/og/). */
export function landingOgImage(entry: LandingEntry): string {
  return entry.data.seo.ogImage ?? `/og/${entry.id}.png`
}

/** The size of a landing's OG image when the build draws it (1200 by 630); unknown for an image of its own. */
export function landingOgImageSize(entry: LandingEntry): { width: number; height: number } | undefined {
  return entry.data.seo.ogImage === undefined ? { width: 1200, height: 630 } : undefined
}

/** The id of each section of the landing template, as the live landings name them; the components render these. */
export const LANDING_SECTION_IDS = {
  pains: 'needs',
  features: 'capabilities',
  capabilities: 'comparison',
  demo: 'proof',
  steps: 'migration',
  faq: 'questions',
  cta: 'start',
  related: 'related',
} as const

/**
 * The ids of the sections a landing renders (`relatedShown`: the related landings that resolve to published ones), as the template names them (the live landings' ids): the targets its
 * section navigation may link.
 */
export function sectionIds(d: LandingData, relatedShown = d.related.length): string[] {
  const S = LANDING_SECTION_IDS
  const ids: [unknown, string][] = [
    [d.pains, S.pains],
    [d.features, S.features],
    [d.capabilities, S.capabilities],
    [d.demo, S.demo],
    [d.steps, S.steps],
    [d.faq, S.faq],
    [d.cta, S.cta],
    [relatedShown > 0 ? d.related : undefined, S.related],
  ]
  return ids.filter(([v]) => v !== undefined).map(([, id]) => id)
}
