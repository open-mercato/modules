// Content model of the main site www.openmercato.com (spec docs/specs/2026-11-24-www-site-migration.md, Data Model):
// one Zod schema per content collection of www/content/, the single source of truth that www/content.config.ts hands
// to Astro. A reference to another collection is a slug here; the Astro config passes its own `reference()` instead
// (WwwRef), so the same schemas validate a sample in a unit test and a file in a build. Isomorphic: no Node APIs.
import { z } from 'zod'
import { CTA_EVENT_LENGTH } from '../core/cta.ts'

/** A slug: lowercase words joined by `-`, the Webflow slug kept exactly (D3). Every entry's id is its slug. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const Slug = z.string().regex(SLUG_RE)

/** Id of the Webflow item or page an entry came from (24 hex digits); new entries leave it out. */
export const WebflowId = z.string().regex(/^[0-9a-f]{24}$/)

/** Text for people: trimmed, not empty. */
export const Text = z.string().trim().min(1)

/** A string rendered as Markdown inline. */
export const Markdown = z.string().trim().min(1)

/** A file of the site: a path under /media (CMS media) or /files (the site's own assets), no `..`. */
export const MediaPath = z
  .string()
  .regex(/^\/(?:media|files)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/)
  .refine((p) => !p.split('/').includes('..'), 'no .. segment')

/** A link target: a site path (`/x`, `/x#y`, `#y`), an https URL or a mailto: address. */
export const Href = z.string().regex(/^(?:\/[^\s]*|#[A-Za-z0-9_-]+|https:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/)

/** An https URL. */
export const HttpsUrl = z.string().regex(/^https:\/\/[^\s]+$/)

/** A CSS colour in hex: `#rgb`, `#rrggbb` or `#rrggbbaa`. */
export const HexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/

/** True when `day` (`YYYY-MM-DD`) is a day of the calendar, not one Date would roll over (2026-02-30). */
function isCalendarDay(day: string): boolean {
  const d = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day
}

/**
 * A date in ISO 8601 (`2026-11-24` or `2026-11-24T10:00:00Z`), or the Date a YAML parser already made of it. The site
 * formats dates in UTC. A day the calendar does not have is refused as a string only: Astro's frontmatter parser turns
 * an unquoted `2026-02-30` into a Date of 2 March before the schema sees it, so the importer (Phase 2) writes dates
 * quoted.
 */
export const UtcDate = z
  .union([z.date(), z.string().regex(ISO_DATE)])
  // a calendar day that does not exist (2026-02-30) would roll over into the next month
  .refine((v) => typeof v !== 'string' || isCalendarDay(v.slice(0, 10)), 'not a calendar day')
  .transform((v) => (typeof v === 'string' ? new Date(v) : v))
  .refine((d) => !Number.isNaN(d.getTime()), 'not a valid date')

/** `Seo`: title and description required and non-empty; ogImage a file of the site. */
export const Seo = z.strictObject({
  title: Text,
  description: Text,
  ogImage: MediaPath.optional(),
  noindex: z.boolean().optional(),
})

/** An image of the site. The alt text may be empty only for a decorative image. */
export const Image = z
  .strictObject({
    src: MediaPath,
    alt: z.string(),
    decorative: z.boolean().optional(),
    width: z.int().positive().optional(),
    height: z.int().positive().optional(),
  })
  .refine((i) => i.decorative === true || i.alt.trim() !== '', {
    message: 'alt is required unless decorative is true',
    path: ['alt'],
  })

/** One part of a CTA event name `cta_<placement>_<action>` (Analytics, spec UI/UX). */
const EventPart = z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/)

/** The longest CTA event name the tracker sends whole (`cta_<placement>_<action>`, lib/core/cta.ts). */
export const CTA_EVENT_MAX = CTA_EVENT_LENGTH

/** Name of the analytics event of a CTA. */
export function ctaEventName(t: { placement: string; action: string }): string {
  return `cta_${t.placement}_${t.action}`
}

export const Cta = z.strictObject({
  label: Text,
  href: Href,
  tracking: z
    .strictObject({ placement: EventPart, action: EventPart })
    .refine((t) => ctaEventName(t).length <= CTA_EVENT_MAX, `the event name is longer than ${CTA_EVENT_MAX}`)
    .optional(),
})

/** A YouTube video id. */
export const YouTubeId = z.string().regex(/^[A-Za-z0-9_-]{11}$/)

const draft = z.boolean().default(false)

/** The collections of www/content/, by the names the site's code uses. */
export const WWW_COLLECTIONS = [
  'landings',
  'pages',
  'blog',
  'authors',
  'blogCategories',
  'caseStudies',
  'caseStudyCategories',
  'partners',
  'partnerTiers',
  'partnerIndustries',
  'partnerServices',
  'partnerLanguages',
  'partnerLocations',
  'jobs',
  'redirects',
] as const
export type WwwCollection = (typeof WWW_COLLECTIONS)[number]

/** Builds the schema of a reference to an entry of `collection`. */
export type WwwRef = (collection: WwwCollection) => z.ZodType

/** The reference of the unit tests and of any reader outside Astro: the referenced entry's slug. */
export const slugRef: WwwRef = () => Slug

// ---------------------------------------------------------------------------------------------------------------
// Option values written as stable keys; their labels live here, so a label edit is not a content migration. Each label
// equals the Webflow option's name exactly (parity, and the importer maps an option to its key by this name).

export const PARTNER_BUDGETS = ['under-10k', '10k-20k', '20k-50k', '50k-100k', '100k-plus'] as const
export const PartnerBudget = z.enum(PARTNER_BUDGETS)
export const PARTNER_BUDGET_LABELS: Record<(typeof PARTNER_BUDGETS)[number], string> = {
  'under-10k': 'Under $10,000',
  '10k-20k': '$10,000 - $20,000',
  '20k-50k': '$20,000 - $50,000',
  '50k-100k': '$50,000 - $100,000',
  '100k-plus': '$100,000+',
}

export const PARTNER_AVAILABILITY = ['accepting', 'not-available'] as const
export const PartnerAvailability = z.enum(PARTNER_AVAILABILITY)
export const PARTNER_AVAILABILITY_LABELS: Record<(typeof PARTNER_AVAILABILITY)[number], string> = {
  accepting: 'Accepting new projects',
  'not-available': 'Not available',
}

export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'internship'] as const
export const EmploymentType = z.enum(EMPLOYMENT_TYPES)
export const EMPLOYMENT_TYPE_LABELS: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

// ---------------------------------------------------------------------------------------------------------------
// Collections

const TitleBody = z.strictObject({ title: Text, body: Markdown })
/** An item of a landing's pains or features: a title, a body and the illustration the card shows. */
const ArtItem = z.strictObject({ title: Text, body: Markdown, art: Image.optional() })
const SourceLink = z.strictObject({ label: Text, url: HttpsUrl })
/** A section of title and items; `eyebrow` is the short label some sections show above the title. */
const titled = <T extends z.ZodType>(item: T) =>
  z.strictObject({ eyebrow: Text.optional(), title: Text, items: z.array(item).min(1) })

/** The least FAQ items of a landing. */
export const LANDING_FAQ_MIN = 3

/** A cell mark of the capability matrix: available, not included, or requires implementation. */
export const CAPABILITY_MARKS = ['yes', 'no', 'build'] as const
export const CapabilityMark = z.enum(CAPABILITY_MARKS)

/** The locales of the landings. */
export const LANDING_LOCALES = ['en', 'pl'] as const
export type LandingLocale = (typeof LANDING_LOCALES)[number]

/**
 * Words the landing template writes around data, per locale, as the live landings print them (25 Nov 2026): the review
 * lines of the capability matrix and of the source list (`{reviewedPrefix} <date>. {sourcesLabel}` and
 * `<title> · {reviewedInline} <date>`, the date in the locale's long form, "12 November 2026", "12 listopada 2026"),
 * the label of the section navigation, the summary of the comparison's details when the comparison has no title, the
 * heading of the related landings, and what each mark of the matrix reads as to a screen reader. `matrixLabel` names the matrix table: `Open Mercato and <their column> feature
 * comparison` on every live landing, the Polish one too.
 */
export const LANDING_TEMPLATE_TEXT: Record<
  LandingLocale,
  {
    reviewedPrefix: string
    sourcesLabel: string
    reviewedInline: string
    navLabel: string
    detailsSummary: string
    relatedTitle: string
    marks: Record<(typeof CAPABILITY_MARKS)[number], string>
  }
> = {
  en: {
    reviewedPrefix: 'Reviewed',
    sourcesLabel: 'Sources:',
    reviewedInline: 'reviewed',
    navLabel: 'On this page',
    detailsSummary: 'Explore implementation and commercial details',
    relatedTitle: 'Related pages',
    marks: { yes: 'Available', no: 'Not included', build: 'Requires implementation' },
  },
  pl: {
    reviewedPrefix: 'Sprawdzono',
    sourcesLabel: 'Źródła:',
    reviewedInline: 'sprawdzono',
    navLabel: 'Na tej stronie',
    detailsSummary: 'Zobacz szczegóły wdrożenia i kosztów',
    relatedTitle: 'Powiązane strony',
    marks: { yes: 'Available', no: 'Not included', build: 'Wymaga wdrożenia' },
  },
}

/** The accessible name of a landing's capability matrix, as the live landings write it in every locale. */
export function matrixLabel(ours: string, theirs: string): string {
  return `${ours} and ${theirs} feature comparison`
}

/**
 * `landings`: content/landings/<slug>.yaml, the shared layout of the SEO landings. Fitted to the layout of the Webflow
 * export (Phase 2): every visible text of a landing has a field, so the importer's text cross-check can hold.
 */
export function landingSchema(ref: WwwRef = slugRef) {
  return z.strictObject({
    webflowId: WebflowId.optional(),
    locale: z.enum(LANDING_LOCALES),
    kind: z.enum(['alternative', 'industry']),
    competitor: Text.optional(),
    alternateOf: ref('landings').optional(),
    seo: Seo,
    hero: z.strictObject({
      eyebrow: Text,
      title: Text,
      lead: Markdown,
      primary: Cta,
      secondary: Cta.optional(),
      proof: z.array(Text),
    }),
    sectionNav: z.array(z.strictObject({ label: Text, anchor: Slug })),
    pains: titled(ArtItem).optional(),
    features: z
      .strictObject({
        eyebrow: Text.optional(),
        title: Text,
        lead: Markdown.optional(),
        items: z.array(ArtItem).min(1),
      })
      .optional(),
    capabilities: z
      .strictObject({
        eyebrow: Text.optional(),
        title: Text,
        lead: Markdown.optional(),
        /** The label of the matrix's first header cell ("What your team gets") and the line under it. */
        label: Text,
        tagline: Text.optional(),
        /** Ours, then theirs: the name of each column and the note under it. */
        columns: z.tuple([
          z.strictObject({ name: Text, note: Text.optional() }),
          z.strictObject({ name: Text, note: Text.optional() }),
        ]),
        groups: z
          .array(
            z.strictObject({
              title: Text,
              rows: z
                .array(
                  z.strictObject({
                    label: Text,
                    ours: CapabilityMark,
                    oursNote: Text.optional(),
                    theirs: CapabilityMark,
                    theirsNote: Text.optional(),
                  }),
                )
                .min(1),
            }),
          )
          .min(1),
        /** What each mark means. */
        legend: z.strictObject({ yes: Text, no: Text, build: Text }),
        note: Markdown,
        reviewed: UtcDate,
        sources: z.array(SourceLink),
      })
      .optional(),
    comparison: z
      .strictObject({
        title: Text.optional(),
        /** The label of the first header cell ("What matters"). */
        label: Text,
        /** Theirs, then ours. */
        columns: z.tuple([Text, Text]),
        rows: z.array(z.strictObject({ topic: Text, theirs: Text, ours: Text })).min(1),
      })
      .optional(),
    demo: z
      .strictObject({
        eyebrow: Text.optional(),
        title: Text,
        body: Markdown,
        cta: Cta,
        image: Image.optional(),
        caption: Text.optional(),
        animation: Text.optional(),
      })
      .optional(),
    steps: titled(TitleBody).optional(),
    faq: z.strictObject({
      title: Text,
      items: z.array(z.strictObject({ question: Text, answer: Markdown })).min(LANDING_FAQ_MIN),
    }),
    cta: z.strictObject({ title: Text, body: Markdown, primary: Cta, note: Text.optional() }),
    sources: z.strictObject({ title: Text, reviewed: UtcDate, items: z.array(SourceLink).min(1) }).optional(),
    related: z.array(ref('landings')).default([]),
    draft,
  })
}

/**
 * A block of a unique page, discriminated by `type` (spec, Data Model `pages` and UI/UX: hero, logo wall, feature grid,
 * carousel, video, stats, team grid, quote, steps, FAQ, CTA, prose, plus `list`, a list of a collection's entries). The
 * importer writes one type, `copy`, with the page's text in DOM order; Phase 6 replaced each `copy` block with typed
 * blocks, and a published page with a `copy` block fails the build (pageSchema). `legacy` names a component ported
 * from a Webflow embed whose source is unknown (spec Q4).
 *
 * Every typed block holds copy only; its look is a component. `layout` names that component
 * (www/src/components/blocks/<layout>.astro, by default the block's type): while the site mirrors the live
 * openmercato.com (owner's decision of 25 Nov 2026, until the designer's pass, D7), a layout reproduces one live
 * section's markup. The parts every block may show: `id` (the anchor of its section), `label` (the word of the colour
 * divider above a section), `eyebrow`, `lead`, the two calls to action and a `note` under them.
 */
export const CopyBlock = z.strictObject({ type: z.literal('copy'), markdown: Markdown, webflowNode: Text })
const head = {
  id: Slug.optional(),
  layout: Slug.optional(),
  label: Text.optional(),
  eyebrow: Text.optional(),
  lead: Markdown.optional(),
  primary: Cta.optional(),
  secondary: Cta.optional(),
  note: Markdown.optional(),
}
const block = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ type: z.literal(type), ...head, ...shape })

/** A card, row or slide of a block: the parts a repeated item of a live section shows, at least one of them copy. */
export const BlockItem = z
  .strictObject({
    /** A small label above the title: a number ("01"), a tag or a date. */
    eyebrow: Text.optional(),
    title: Text.optional(),
    body: Markdown.optional(),
    icon: Image.optional(),
    image: Image.optional(),
    video: YouTubeId.optional(),
    /** A list in the item (Markdown inline per point). */
    points: z.array(Markdown).min(1).optional(),
    cta: Cta.optional(),
    note: Markdown.optional(),
  })
  .refine((i) => i.title !== undefined || i.body !== undefined || i.points !== undefined || i.eyebrow !== undefined, {
    message: 'an item needs a title, a body, points or an eyebrow',
  })
const items = z.array(BlockItem).min(1)

/** The collections a `list` block lists, in the order their own list page uses. */
export const LIST_COLLECTIONS = ['caseStudies', 'jobs', 'blog', 'partners'] as const

export const PAGE_BLOCK_TYPES = [
  'copy',
  'hero',
  'logos',
  'features',
  'carousel',
  'video',
  'stats',
  'team',
  'quote',
  'steps',
  'faq',
  'cta',
  'prose',
  'list',
  'legacy',
] as const
export const PageBlock = z.discriminatedUnion('type', [
  CopyBlock,
  block('hero', { title: Text, image: Image.optional(), video: YouTubeId.optional(), items: items.optional() }),
  block('logos', {
    title: Text.optional(),
    items: z.array(z.strictObject({ name: Text, logo: Image, href: Href.optional() })).min(1),
  }),
  block('features', { title: Text.optional(), body: Markdown.optional(), image: Image.optional(), items }),
  block('carousel', { title: Text.optional(), items }),
  block('video', { title: Text.optional(), youtube: YouTubeId, poster: Image.optional(), caption: Text.optional() }),
  block('stats', {
    title: Text.optional(),
    /** A value is text, so it can hold a count token ({moduleCount}, A6) instead of a typed number. */
    items: z.array(z.strictObject({ value: Text, label: Text, body: Markdown.optional() })).min(1),
  }),
  block('team', {
    title: Text.optional(),
    members: z
      .array(
        z.strictObject({
          name: Text,
          role: Text,
          photo: Image.optional(),
          url: HttpsUrl.optional(),
          bio: Markdown.optional(),
          links: z.array(Cta).min(1).optional(),
        }),
      )
      .min(1),
  }),
  block('quote', { quote: Markdown, author: Text, role: Text.optional(), image: Image.optional() }),
  block('steps', { title: Text, items }),
  block('faq', {
    title: Text,
    items: z.array(z.strictObject({ question: Text, answer: Markdown })).min(1),
  }),
  block('cta', { title: Text, body: Markdown.optional(), items: items.optional() }),
  /** Longer copy in Markdown: paragraphs, headings (`##` to `####`), lists and links. */
  block('prose', { title: Text.optional(), markdown: z.string().trim().min(1) }),
  /** The published entries of a collection, rendered by the layout; `featured` keeps the ones a page features. */
  block('list', {
    title: Text.optional(),
    collection: z.enum(LIST_COLLECTIONS),
    featured: z.boolean().optional(),
    limit: z.int().positive().optional(),
  }),
  /** A component of www/src/components/legacy/, by its file name, ported as it is from a Webflow embed (Q4). */
  z.strictObject({ type: z.literal('legacy'), id: Slug.optional(), component: Slug, note: Text }),
])
export type PageBlockData = z.infer<typeof PageBlock>

/**
 * `pages`: content/pages/<slug>.yaml, the unique pages (the entry `home` is `/`; the entries of LIST_PAGE_SLUGS are
 * the copy of the list routes). A published page holds typed blocks only: a `copy` block, the importer's raw text, is
 * refused unless the page is a draft (spec Phase 6), so no page ships unmapped text.
 */
export const PAGE_JSON_LD_TYPES = [
  'WebPage',
  'AboutPage',
  'ContactPage',
  'TechArticle',
  'HowTo',
  'SoftwareApplication',
] as const

export function pageSchema() {
  return z
    .strictObject({
      webflowId: WebflowId.optional(),
      seo: Seo,
      /**
       * The JSON-LD of the page, computed from its content (spec SEO): the page's own type (its name and description
       * from `seo`; a HowTo's steps from its first `steps` block), plus FAQPage from its `faq` blocks and from `faq`
       * here, the questions the live page's head code names without showing them.
       */
      jsonLd: z
        .strictObject({
          type: z.enum(PAGE_JSON_LD_TYPES),
          faq: z
            .array(z.strictObject({ question: Text, answer: Markdown }))
            .min(1)
            .optional(),
        })
        .optional(),
      /** The shared closing call to action between the page and the footer; false where the page has its own (/crm). */
      siteCta: z.boolean().default(true),
      blocks: z.array(PageBlock),
      draft,
    })
    .superRefine((p, ctx) => {
      if (p.draft) return
      p.blocks.forEach((b, i) => {
        if (b.type === 'copy')
          ctx.addIssue({
            code: 'custom',
            path: ['blocks', i],
            message: 'a published page cannot hold a copy block: map it to typed blocks (spec Phase 6)',
          })
      })
    })
}

/** `blog`: content/blog/<slug>.md, frontmatter of a post (the body is Markdown). */
export function blogSchema(ref: WwwRef = slugRef) {
  return z.strictObject({
    webflowId: WebflowId.optional(),
    title: Text,
    description: Text,
    date: UtcDate,
    updated: UtcDate.optional(),
    author: ref('authors').optional(),
    category: ref('blogCategories').optional(),
    featured: z.boolean().default(false),
    thumbnail: Image.optional(),
    seo: Seo.partial().optional(),
    draft,
  })
}

/** `authors`: content/authors.yaml. */
export function authorSchema() {
  return z.strictObject({
    webflowId: WebflowId.optional(),
    name: Text,
    role: Text.optional(),
    avatar: Image.optional(),
    url: HttpsUrl.optional(),
  })
}

/** `blogCategories`: content/blog-categories.yaml. */
export function blogCategorySchema() {
  return z.strictObject({
    webflowId: WebflowId.optional(),
    name: Text,
    order: z.int(),
    labelColor: HexColor.optional(),
    textColor: HexColor.optional(),
  })
}

/** The number of stats a case study shows, when it shows any. */
export const CASE_STUDY_STATS = 3

/** `caseStudies`: content/case-studies/<slug>.md. */
export function caseStudySchema(ref: WwwRef = slugRef) {
  return z
    .strictObject({
      webflowId: WebflowId.optional(),
      title: Text,
      heading: Text,
      description: Text,
      thumbnail: Image.optional(),
      heroVideo: YouTubeId.optional(),
      deliveredBy: ref('partners').optional(),
      deliveredByUrl: HttpsUrl.optional(),
      // each overview field may be empty: three published case studies of the export leave the timeline out
      overview: z.strictObject({
        client: Text.optional(),
        industry: Text.optional(),
        timeline: Text.optional(),
        type: Text.optional(),
        stack: Markdown.optional(),
      }),
      stats: z
        .array(z.strictObject({ title: Text, description: Text }))
        .refine((s) => s.length === 0 || s.length === CASE_STUDY_STATS, `exactly ${CASE_STUDY_STATS} when present`)
        .default([]),
      screenshots: z.array(Image).default([]),
      categories: z.array(ref('caseStudyCategories')).default([]),
      featuredOnAgencies: z.boolean().default(false),
      order: z.int().optional(),
      draft,
    })
    .refine((c) => !(c.deliveredBy !== undefined && c.deliveredByUrl !== undefined), {
      message: 'deliveredBy or deliveredByUrl, not both',
      path: ['deliveredByUrl'],
    })
}

/** A dictionary entry with a name only: caseStudyCategories, partnerLanguages, partnerLocations. */
export function namedSchema() {
  return z.strictObject({ webflowId: WebflowId.optional(), name: Text })
}

/** A dictionary entry with a name and an optional order: partnerIndustries, partnerServices. */
export function orderedSchema() {
  return z.strictObject({ webflowId: WebflowId.optional(), name: Text, order: z.int().optional() })
}

/** `partnerTiers`: content/partner-tiers.yaml. */
export function partnerTierSchema() {
  return z.strictObject({
    webflowId: WebflowId.optional(),
    name: Text,
    order: z.int(),
    backgroundColor: HexColor.optional(),
    textColor: HexColor.optional(),
  })
}

/** `partners`: content/partners/<slug>.md (the body is the bio). */
export function partnerSchema(ref: WwwRef = slugRef) {
  return z.strictObject({
    webflowId: WebflowId.optional(),
    name: Text,
    // two published partners of the export have no logo
    logo: Image.optional(),
    tier: ref('partnerTiers'),
    industries: z.array(ref('partnerIndustries')).default([]),
    location: ref('partnerLocations'),
    languages: z.array(ref('partnerLanguages')).default([]),
    services: z.array(ref('partnerServices')).default([]),
    budget: PartnerBudget.optional(),
    availability: PartnerAvailability,
    projectsInPortfolio: z.boolean(),
    website: HttpsUrl,
    description: Text,
    draft,
  })
}

/** `jobs`: content/jobs/<slug>.md. */
export function jobSchema() {
  return z
    .strictObject({
      webflowId: WebflowId.optional(),
      title: Text,
      description: Text,
      location: Text,
      employmentType: EmploymentType,
      department: Text.optional(),
      salary: Text.optional(),
      techStack: Text.optional(),
      applyUrl: z.union([HttpsUrl, z.string().regex(/^mailto:[^\s@]+@[^\s@]+$/)]),
      open: z.boolean(),
      order: z.int().optional(),
      datePosted: UtcDate,
      validThrough: UtcDate.optional(),
      draft,
    })
    .refine((j) => j.validThrough === undefined || j.validThrough.getTime() >= j.datePosted.getTime(), {
      message: 'validThrough is before datePosted',
      path: ['validThrough'],
    })
}

/** A path of the site a redirect starts from: `/x`, `/x/*` (a splat) or `/x/:name`. */
export const RedirectFrom = z.string().regex(/^\/[A-Za-z0-9._~%!$&'()+,;=:@*/-]*$/)

/** `redirects`: one rule of content/redirects.yaml (the docs map, the Webflow 301 list of D8, manual rules). */
export function redirectSchema() {
  return z.strictObject({
    from: RedirectFrom,
    to: z.union([z.string().regex(/^\/[^\s]*$/), HttpsUrl]),
    status: z.literal(301),
    source: z.enum(['webflow-panel', 'docs-map', 'manual']),
  })
}

/** The schema of each collection, for the reference builder `ref` (slugRef outside Astro). */
export function wwwSchemas(ref: WwwRef = slugRef): Record<WwwCollection, z.ZodType> {
  return {
    landings: landingSchema(ref),
    pages: pageSchema(),
    blog: blogSchema(ref),
    authors: authorSchema(),
    blogCategories: blogCategorySchema(),
    caseStudies: caseStudySchema(ref),
    caseStudyCategories: namedSchema(),
    partners: partnerSchema(ref),
    partnerTiers: partnerTierSchema(),
    partnerIndustries: orderedSchema(),
    partnerServices: orderedSchema(),
    partnerLanguages: namedSchema(),
    partnerLocations: namedSchema(),
    jobs: jobSchema(),
    redirects: redirectSchema(),
  }
}

/**
 * Where each collection lives under www/content/: one file per entry (`dir` with the extension `ext`, the id is the
 * file name) or one file holding them all (`file`; a dictionary maps ids to entries, redirects is a list).
 */
export type WwwSource = { kind: 'entries'; dir: string; ext: 'yaml' | 'md' } | { kind: 'file'; file: string }

export const WWW_SOURCES: Record<WwwCollection, WwwSource> = {
  landings: { kind: 'entries', dir: 'landings', ext: 'yaml' },
  pages: { kind: 'entries', dir: 'pages', ext: 'yaml' },
  blog: { kind: 'entries', dir: 'blog', ext: 'md' },
  authors: { kind: 'file', file: 'authors.yaml' },
  blogCategories: { kind: 'file', file: 'blog-categories.yaml' },
  caseStudies: { kind: 'entries', dir: 'case-studies', ext: 'md' },
  caseStudyCategories: { kind: 'file', file: 'case-study-categories.yaml' },
  partners: { kind: 'entries', dir: 'partners', ext: 'md' },
  partnerTiers: { kind: 'file', file: 'partner-tiers.yaml' },
  partnerIndustries: { kind: 'file', file: 'partner-industries.yaml' },
  partnerServices: { kind: 'file', file: 'partner-services.yaml' },
  partnerLanguages: { kind: 'file', file: 'partner-languages.yaml' },
  partnerLocations: { kind: 'file', file: 'partner-locations.yaml' },
  jobs: { kind: 'entries', dir: 'jobs', ext: 'md' },
  redirects: { kind: 'file', file: 'redirects.yaml' },
}

// ---------------------------------------------------------------------------------------------------------------
// Routes

/**
 * First path segments a page or a landing cannot take: the catalog, the redirected docs, the folders of files and of
 * the other collections, the list routes of the collections (`/blog`, `/careers`, `/case-studies`,
 * `/certified-partners`), and the files the build writes at the root.
 */
export const RESERVED_SEGMENTS = [
  'run',
  'docs',
  'documentation',
  'media',
  'blog',
  'blog-posts',
  'careers',
  'case-studies',
  'certified-partners',
  'careers-jobs',
  'files',
  '_astro',
  'sitemap-index',
  'sitemap-0',
  'robots',
  '404',
  'og',
] as const

/**
 * First segments the main site's build never writes as a page of its own: the catalog, the redirected docs, the
 * folders of files and the root files. The list pages of the collections (`/case-studies`, `/certified-partners`) are
 * pages, so only RESERVED_SEGMENTS, which also keeps their names from `pages` and `landings`, holds them.
 */
export const NON_PAGE_SEGMENTS = [
  'run',
  'docs',
  'documentation',
  'media',
  'files',
  '_astro',
  'sitemap-index',
  'sitemap-0',
  'robots',
  'og',
] as const

/**
 * Unique pages (Phase 6) that Webflow serves until their pull request and that pages built before it link: `/careers`
 * (each job page's breadcrumb, Phase 4), the contact page (the landings' and /crm's calls to action, Phase 5) and
 * /learn-ai-engineering (the home page's Academy links). Those links
 * point to the live site (MAIN_SITE_ORIGIN) until the page is built here; a noindex preview lists them as pending and
 * production fails on them (lib/emit/pages-merge.ts). The second pull request of Phase 6 builds them and empties the
 * list.
 */
export const PENDING_UNIQUE_PAGES = ['careers', 'contact', 'learn-ai-engineering'] as const

/** The pages entry routed at `/`. */
export const HOME_PAGE_SLUG = 'home'

/**
 * Pages entries that hold the copy of a list route of its own (its title, description, heading and lead) instead of
 * routing at `/<slug>`: the list pages of the collections and /careers, which lists the jobs. Their slugs stay
 * reserved for landings.
 */
export const LIST_PAGE_SLUGS = ['blog', 'case-studies', 'certified-partners', 'careers'] as const

/**
 * Why the slugs of `pages` and `landings` cannot share the root namespace, one line per problem: a slug in both, or a
 * reserved first segment (RESERVED_SEGMENTS). Ids are compared as the build routes them: `home` is `/`.
 */
export function routeNamespaceProblems(pages: readonly string[], landings: readonly string[]): string[] {
  const problems: string[] = []
  const reserved = new Set<string>(RESERVED_SEGMENTS)
  const listPages = new Set<string>(LIST_PAGE_SLUGS)
  const pageSet = new Set(pages)
  for (const [collection, ids] of [
    ['pages', pages],
    ['landings', landings],
  ] as const) {
    for (const id of ids)
      if (reserved.has(id) && !(collection === 'pages' && listPages.has(id)))
        problems.push(`${collection}/${id}: /${id} is a reserved path`)
  }
  for (const id of landings) if (pageSet.has(id)) problems.push(`pages/${id} and landings/${id} both route to /${id}`)
  if (landings.includes(HOME_PAGE_SLUG)) problems.push(`landings/${HOME_PAGE_SLUG}: the slug of the home page`)
  return problems
}

/**
 * Why the file names of a one-file-per-entry collection (WWW_SOURCES kind `entries`) cannot be its ids: each name
 * without its extension is the entry's slug, kept exactly (D3), so it must match SLUG_RE, and only files with the
 * collection's extension belong there.
 */
export function entryFileProblems(collection: WwwCollection, names: readonly string[]): string[] {
  const s = WWW_SOURCES[collection]
  if (s.kind !== 'entries') return [`${collection} is not a collection of one file per entry`]
  const problems: string[] = []
  for (const name of names) {
    if (name.startsWith('.')) continue
    if (!name.endsWith(`.${s.ext}`)) problems.push(`${s.dir}/${name}: not a .${s.ext} file`)
    else if (!SLUG_RE.test(name.slice(0, -s.ext.length - 1))) problems.push(`${s.dir}/${name}: the name is not a slug`)
  }
  return problems
}

/**
 * The entries of a one-file collection as the Astro file loader takes them (an object keyed by id), from the parsed
 * file: a dictionary maps slugs to entries; redirects.yaml is a list of rules, each keyed by its `from` path. An empty
 * file is an empty collection. Throws on a key that is not a slug, a `from` given twice, or a file of another shape.
 */
export function fileEntries(collection: WwwCollection, data: unknown): Record<string, Record<string, unknown>> {
  const s = WWW_SOURCES[collection]
  if (s.kind !== 'file') throw new Error(`${collection} is not a collection of one file`)
  if (data === null || data === undefined) return {}
  const entries: Record<string, Record<string, unknown>> = {}
  if (collection === 'redirects') {
    if (!Array.isArray(data)) throw new Error(`${s.file}: a list of rules is expected`)
    for (const rule of data as { from?: unknown }[]) {
      const from = String(rule?.from)
      if (from in entries) throw new Error(`${s.file}: ${from} is given twice`)
      entries[from] = rule as Record<string, unknown>
    }
    return entries
  }
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error(`${s.file}: a map of slug to entry is expected`)
  for (const [id, entry] of Object.entries(data as Record<string, unknown>)) {
    if (!SLUG_RE.test(id)) throw new Error(`${s.file}: ${id} is not a slug`)
    entries[id] = entry as Record<string, unknown>
  }
  return entries
}
