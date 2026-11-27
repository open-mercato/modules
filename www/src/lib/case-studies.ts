// The case studies of the main site (spec docs/specs/2026-11-24-www-site-migration.md, Phase 4): which ones the site
// shows and in what order, who delivered one (a link to a published partner, a partner's name without a link when the
// partner is a draft, or an outside address), and the SEO of a case study (Article and BreadcrumbList JSON-LD). A draft
// is validated by the content config but never routed, listed, linked or put in a sitemap (D6). Isomorphic.
import { canonicalUrl, refId, SITE_NAME, type PostImage, type Ref } from './blog.ts'
import { breadcrumbJsonLd, publishedEntries } from './entries.ts'
import { partnerPath } from './partners.ts'

/** A case study entry: its id (the slug) and its frontmatter after the schema (caseStudySchema). */
export interface CaseStudyEntry {
  id: string
  data: {
    webflowId?: string
    title: string
    heading: string
    description: string
    thumbnail?: PostImage
    heroVideo?: string
    deliveredBy?: Ref
    deliveredByUrl?: string
    overview: { client?: string; industry?: string; timeline?: string; type?: string; stack?: string }
    stats: { title: string; description: string }[]
    screenshots: PostImage[]
    categories: Ref[]
    featuredOnAgencies: boolean
    order?: number
    draft: boolean
  }
}

export const CASE_STUDIES_PATH = '/case-studies'
export const CASE_STUDY_PREFIX = '/case-studies/'

/** The site path of a case study. */
export const caseStudyPath = (slug: string): string => `${CASE_STUDY_PREFIX}${slug}`

/** The case studies the site shows: every entry that is not a draft, in list order (entries.ts). */
export function publishedCaseStudies<T extends CaseStudyEntry>(all: readonly T[]): T[] {
  return publishedEntries(all)
}

/** Up to `n` other published case studies: those sharing a category first, then the rest, in list order. */
export function relatedCaseStudies<T extends CaseStudyEntry>(cs: CaseStudyEntry, published: readonly T[], n = 3): T[] {
  const mine = new Set(cs.data.categories.map((c) => refId(c)))
  const others = published.filter((p) => p.id !== cs.id)
  const same = others.filter((p) => p.data.categories.some((c) => mine.has(refId(c))))
  const rest = others.filter((p) => !same.includes(p))
  return [...same, ...rest].slice(0, n)
}

/**
 * The categories of the filter of /case-studies: those of at least one listed case study, with their counts, in
 * `order` (the dictionary's ids newest first by Webflow id, the order of Webflow's list of categories).
 */
export function filterCategories(
  cards: readonly CaseStudyCardData[],
  order: readonly string[],
): { id: string; name: string; count: number }[] {
  const seen = new Map<string, { name: string; count: number }>()
  for (const c of cards)
    c.categoryIds.forEach((id, i) => {
      const s = seen.get(id) ?? { name: c.categories[i]!, count: 0 }
      s.count++
      seen.set(id, s)
    })
  return order.filter((id) => seen.has(id)).map((id) => ({ id, ...seen.get(id)! }))
}

/** Ids newest first by Webflow id (an ObjectId starts with its creation time); ids without one first. */
export function newestFirst(entries: readonly { id: string; webflowId?: string }[]): string[] {
  return [...entries]
    .sort((a, b) => (b.webflowId ?? 'z').localeCompare(a.webflowId ?? 'z') || a.id.localeCompare(b.id))
    .map((e) => e.id)
}

/** Every other published case study, in list order: the carousel of a case study page, as live. */
export function otherCaseStudies<T extends CaseStudyEntry>(cs: CaseStudyEntry, published: readonly T[]): T[] {
  return published.filter((p) => p.id !== cs.id)
}

/** Who delivered a case study, as the page shows it. */
export interface DeliveredBy {
  name: string
  /** A partner page of this site, or an outside address; none for a partner that is a draft. */
  href?: string
}

/** What the pages know of the partners: every partner's name, and which are published. */
export interface PartnerIndex {
  names: ReadonlyMap<string, string>
  published: ReadonlySet<string>
}

/**
 * Who delivered `cs`: a published partner with a link to its page; a draft partner by name only, with a warning (D6,
 * a draft is never linked); an outside address under its host name; nobody otherwise.
 */
export function deliveredBy(
  cs: CaseStudyEntry,
  partners: PartnerIndex,
  warn: (message: string) => void = () => {},
): DeliveredBy | undefined {
  const id = refId(cs.data.deliveredBy)
  if (id !== undefined) {
    const name = partners.names.get(id) ?? id
    if (partners.published.has(id)) return { name, href: partnerPath(id) }
    warn(`case study ${cs.id}: delivered by ${id}, a partner that is not published; its name renders without a link`)
    return { name }
  }
  if (cs.data.deliveredByUrl) {
    const url = new URL(cs.data.deliveredByUrl)
    return { name: url.hostname.replace(/^www\./, ''), href: url.toString() }
  }
  return undefined
}

export interface CaseStudySeo {
  title: string
  description: string
  canonical: string
  ogImage?: string
}

/**
 * The title of a case study as the Webflow template writes it (`seo.title` of the template page:
 * `{main-heading} | Open Mercato Case Study`): the heading field, not the name, with the template's own suffix. The
 * live titles are the rule (owner's decision of 25 Nov 2026), not the spec's `<title> | Open Mercato`.
 */
export const CASE_STUDY_TITLE_SUFFIX = ' | Open Mercato Case Study'

export function caseStudySeo(cs: CaseStudyEntry, origin: string): CaseStudySeo {
  return {
    title: `${cs.data.heading}${CASE_STUDY_TITLE_SUFFIX}`,
    description: cs.data.description,
    canonical: canonicalUrl(origin, caseStudyPath(cs.id)),
    ogImage: cs.data.thumbnail?.src,
  }
}

/** `Article` and `BreadcrumbList` (Home, Case Studies, the case study) of a case study, as one JSON-LD graph. */
export function caseStudyJsonLd(
  cs: CaseStudyEntry,
  origin: string,
  delivered?: DeliveredBy,
  categoryNames: readonly string[] = [],
): Record<string, unknown> {
  const seo = caseStudySeo(cs, origin)
  const article: Record<string, unknown> = {
    '@type': 'Article',
    '@id': `${seo.canonical}#article`,
    headline: cs.data.title,
    description: seo.description,
    url: seo.canonical,
    mainEntityOfPage: seo.canonical,
    inLanguage: 'en',
    publisher: { '@type': 'Organization', name: SITE_NAME, url: canonicalUrl(origin, '/') },
  }
  if (cs.data.heading !== cs.data.title) article.alternativeHeadline = cs.data.heading
  if (seo.ogImage) article.image = canonicalUrl(origin, seo.ogImage)
  if (delivered) {
    const author: Record<string, unknown> = { '@type': 'Organization', name: delivered.name }
    if (delivered.href) author.url = canonicalUrl(origin, delivered.href)
    article.author = author
  }
  if (categoryNames.length > 0) article.articleSection = [...categoryNames]
  return {
    '@context': 'https://schema.org',
    '@graph': [
      article,
      breadcrumbJsonLd(origin, [
        { name: 'Home', path: '/' },
        { name: 'Case Studies', path: CASE_STUDIES_PATH },
        { name: cs.data.title, path: caseStudyPath(cs.id) },
      ]),
    ],
  }
}

/** What a list shows of a case study (its Webflow name as the title, as the live list does). */
export interface CaseStudyCardData {
  slug: string
  href: string
  title: string
  description: string
  /** The category names, in the order of the entry. */
  categories: string[]
  /** The category ids, for the category filter of /case-studies. */
  categoryIds: string[]
  thumbnail?: { src: string; alt: string }
}

export function caseStudyCard(cs: CaseStudyEntry, categoryNames: ReadonlyMap<string, string>): CaseStudyCardData {
  const known = cs.data.categories.flatMap((c) => {
    const id = refId(c) ?? ''
    const name = categoryNames.get(id)
    return name ? [{ id, name }] : []
  })
  const card: CaseStudyCardData = {
    slug: cs.id,
    href: caseStudyPath(cs.id),
    title: cs.data.title,
    description: cs.data.description,
    categories: known.map((c) => c.name),
    categoryIds: known.map((c) => c.id),
  }
  const t = cs.data.thumbnail
  if (t) card.thumbnail = { src: t.src, alt: t.decorative ? '' : t.alt }
  return card
}
