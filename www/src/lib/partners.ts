// The certified partners of the main site (spec docs/specs/2026-11-24-www-site-migration.md, Phase 4): which partners
// the site shows and in what order, the values and options of the partner filter's facets (its rules live in
// partner-filter.ts), the cards and profiles, and the SEO of a partner page. A draft is validated by the content config
// but never routed, listed, linked or put in a sitemap (D6). Isomorphic; the pages and the unit tests use it.
import {
  PARTNER_AVAILABILITY,
  PARTNER_AVAILABILITY_LABELS,
  PARTNER_BUDGET_LABELS,
  PARTNER_BUDGETS,
} from '../../../lib/schema/www-content.ts'
import { canonicalUrl, refId, type PostImage, type Ref } from './blog.ts'
import { breadcrumbJsonLd, publishedEntries } from './entries.ts'
import {
  FACET_LABELS,
  FACETS,
  type Facet,
  type FacetOption,
  type FacetOptions,
  type FacetValues,
  type PartnerCardData,
} from './partner-filter.ts'

type Budget = (typeof PARTNER_BUDGETS)[number]
type Availability = (typeof PARTNER_AVAILABILITY)[number]

/** A partner entry: its id (the slug) and its frontmatter after the schema (partnerSchema). */
export interface PartnerEntry {
  id: string
  data: {
    webflowId?: string
    name: string
    logo?: PostImage
    tier: Ref
    industries: Ref[]
    location: Ref
    languages: Ref[]
    services: Ref[]
    budget?: Budget
    availability: Availability
    projectsInPortfolio: boolean
    website: string
    description: string
    draft: boolean
  }
}

export const PARTNERS_PATH = '/certified-partners'
export const PARTNER_PREFIX = '/certified-partners/'
/** How to become a partner: a unique page of the `pages` collection (Phase 6), still on Webflow until then. */
export const AGENCIES_PATH = '/agencies'
/** Where "Contact agency" of a partner page writes to: the live template's address, the same for every partner. */
export const PARTNER_CONTACT = 'mailto:info@openmercato.com'
/** The certification badge of a partner page, the live template's image (every published partner is an agency). */
export const PARTNER_BADGE = {
  src: '/files/site/6a5537d27bb7265b2391a3e0_badge-ai-certified.svg',
  alt: 'Open Mercato Certified Agency badge',
}

/** The site path of a partner. */
export const partnerPath = (slug: string): string => `${PARTNER_PREFIX}${slug}`

/** The partners the site shows: every entry that is not a draft, in list order (entries.ts). */
export function publishedPartners<T extends PartnerEntry>(all: readonly T[]): T[] {
  return publishedEntries(all)
}

/** The facet values of a partner. */
export function partnerValues(p: PartnerEntry): FacetValues {
  const ids = (refs: readonly Ref[]): string[] => refs.map((r) => refId(r)!)
  return {
    tier: [refId(p.data.tier)!],
    industry: ids(p.data.industries),
    location: [refId(p.data.location)!],
    language: ids(p.data.languages),
    service: ids(p.data.services),
    budget: p.data.budget ? [p.data.budget] : [],
    availability: [p.data.availability],
  }
}

/** A dictionary as the pages read it: id, name, an optional order and, for the tiers, the colours of the label. */
export type Dictionary = ReadonlyMap<
  string,
  { name: string; order?: number; backgroundColor?: string; textColor?: string }
>

export interface Dictionaries {
  tiers: Dictionary
  industries: Dictionary
  locations: Dictionary
  languages: Dictionary
  services: Dictionary
}

/**
 * Ordered by `order`, entries without one first, as Webflow's lists of the live filter sort them (an empty field before
 * any number), then by name.
 */
export function dictionaryOrder(d: Dictionary): string[] {
  return [...d]
    .sort(([, a], [, b]) => (a.order ?? -Infinity) - (b.order ?? -Infinity) || a.name.localeCompare(b.name, 'en'))
    .map(([id]) => id)
}

/**
 * The options of every facet: the values at least one published partner has, with their labels and counts, in the
 * dictionary's order (budget and availability in the order of their keys). Labels of budget and availability come from
 * lib/schema/www-content.ts, so they equal Webflow's.
 */
export function facetOptions(published: readonly PartnerEntry[], dict: Dictionaries): Record<Facet, FacetOption[]> {
  const counts = Object.fromEntries(FACETS.map((f) => [f, new Map<string, number>()])) as Record<
    Facet,
    Map<string, number>
  >
  for (const p of published) {
    const v = partnerValues(p)
    for (const f of FACETS) for (const x of v[f]) counts[f].set(x, (counts[f].get(x) ?? 0) + 1)
  }
  const fromDict = (f: Facet, d: Dictionary): FacetOption[] =>
    dictionaryOrder(d)
      .filter((id) => counts[f].has(id))
      .map((id) => {
        const style = f === 'tier' ? tierStyle(d, id) : ''
        return { value: id, label: d.get(id)!.name, count: counts[f].get(id)!, ...(style ? { style } : {}) }
      })
  const fromKeys = (f: Facet, keys: readonly string[], labels: Record<string, string>): FacetOption[] =>
    keys.filter((k) => counts[f].has(k)).map((k) => ({ value: k, label: labels[k]!, count: counts[f].get(k)! }))
  return {
    tier: fromDict('tier', dict.tiers),
    industry: fromDict('industry', dict.industries),
    location: fromDict('location', dict.locations),
    language: fromDict('language', dict.languages),
    service: fromDict('service', dict.services),
    budget: fromKeys('budget', PARTNER_BUDGETS, PARTNER_BUDGET_LABELS),
    availability: fromKeys('availability', PARTNER_AVAILABILITY, PARTNER_AVAILABILITY_LABELS),
  }
}

/** The known values of each facet, from its options. */
export function optionValues(options: Record<Facet, FacetOption[]>): FacetOptions {
  return Object.fromEntries(FACETS.map((f) => [f, options[f].map((o) => o.value)])) as unknown as FacetOptions
}

// ---------------------------------------------------------------------------------------------------------------------
// Cards and profiles: what the pages show of a partner, as plain data (the filter island gets the list as JSON)

/** The name of a dictionary id; the id itself when the dictionary does not know it (the build checks references). */
const nameOf = (d: Dictionary, id: string): string => d.get(id)?.name ?? id

/** The inline style of a tier's label (`agency_label`), its Webflow colours; '' when it has none. */
export function tierStyle(tiers: Dictionary, id: string): string {
  const t = tiers.get(id)
  return [t?.backgroundColor && `background-color:${t.backgroundColor}`, t?.textColor && `color:${t.textColor}`]
    .filter(Boolean)
    .join(';')
}

export function partnerCard(p: PartnerEntry, dict: Dictionaries): PartnerCardData {
  const values = partnerValues(p)
  const card: PartnerCardData = {
    slug: p.id,
    href: partnerPath(p.id),
    name: p.data.name,
    description: p.data.description,
    tier: nameOf(dict.tiers, values.tier[0]!),
    tierStyle: tierStyle(dict.tiers, values.tier[0]!),
    location: nameOf(dict.locations, values.location[0]!),
    industries: values.industry.map((id) => nameOf(dict.industries, id)),
    availability: PARTNER_AVAILABILITY_LABELS[p.data.availability],
    values,
  }
  const l = p.data.logo
  if (l) card.logo = { src: l.src, alt: l.decorative ? '' : l.alt || `${p.data.name} logo` }
  return card
}

/** The facts of a partner's profile, as label and values, in the order of the facets. */
export function partnerFacts(p: PartnerEntry, dict: Dictionaries): { facet: Facet; label: string; values: string[] }[] {
  const v = partnerValues(p)
  const names: Record<Facet, string[]> = {
    tier: v.tier.map((id) => nameOf(dict.tiers, id)),
    industry: v.industry.map((id) => nameOf(dict.industries, id)),
    location: v.location.map((id) => nameOf(dict.locations, id)),
    language: v.language.map((id) => nameOf(dict.languages, id)),
    service: v.service.map((id) => nameOf(dict.services, id)),
    budget: v.budget.map((k) => PARTNER_BUDGET_LABELS[k as Budget]),
    availability: v.availability.map((k) => PARTNER_AVAILABILITY_LABELS[k as Availability]),
  }
  return FACETS.filter((f) => names[f].length > 0).map((f) => ({ facet: f, label: FACET_LABELS[f], values: names[f] }))
}

export interface PartnerSeo {
  title: string
  description: string
  canonical: string
  ogImage?: string
}

/**
 * The title suffix of a partner page as the Webflow template writes it (`seo.title` of the template page:
 * `{name}  | Open Mercato Agency`, two spaces included, as the live pages have them). The live titles are the rule
 * (owner's decision of 25 Nov 2026), not the spec's `<title> | Open Mercato`.
 */
export const PARTNER_TITLE_SUFFIX = '  | Open Mercato Agency'

export function partnerSeo(p: PartnerEntry, origin: string): PartnerSeo {
  return {
    title: `${p.data.name}${PARTNER_TITLE_SUFFIX}`,
    description: p.data.description,
    canonical: canonicalUrl(origin, partnerPath(p.id)),
    // social crawlers read png, jpeg and webp only; an SVG or AVIF logo leaves the site's default image
    ogImage: p.data.logo && /\.(?:png|jpe?g|webp)$/i.test(p.data.logo.src) ? p.data.logo.src : undefined,
  }
}

/** `BreadcrumbList` (Home, Certified Partners, the partner) of a partner page, as a JSON-LD graph. */
export function partnerJsonLd(p: PartnerEntry, origin: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbJsonLd(origin, [
        { name: 'Home', path: '/' },
        { name: 'Certified Partners', path: PARTNERS_PATH },
        { name: p.data.name, path: partnerPath(p.id) },
      ]),
    ],
  }
}
