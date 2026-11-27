// Writers of the CMS collections (spec Data Model): each Webflow item becomes an entry in schema key order, with its
// references resolved to slugs, options to their stable keys, dates in UTC and rich text converted to Markdown.
import {
  EMPLOYMENT_TYPE_LABELS,
  PARTNER_AVAILABILITY_LABELS,
  PARTNER_BUDGET_LABELS,
  SLUG_RE,
  type WwwCollection,
} from '../schema/www-content.ts'
import { compact, guard, ItemStop, ItemText, validate, type Entry, type RunCtx } from './context.ts'
import { optionNames, requireFields, type WfCollection, type WfItem } from './export.ts'
import { youTubeId } from './richtext.ts'
import { isoUtc, updatedAfter } from './text.ts'
import { cmp } from './output.ts'

/** Webflow collection slug to the collection of www/content/ and the media folder of its files. */
export const WEBFLOW_COLLECTIONS: Record<string, { collection: WwwCollection; media: string }> = {
  'blog-posts': { collection: 'blog', media: 'blog' },
  'blog-authors': { collection: 'authors', media: 'authors' },
  'blog-categories': { collection: 'blogCategories', media: 'blog' },
  'case-studies': { collection: 'caseStudies', media: 'case-studies' },
  'case-studies-categories': { collection: 'caseStudyCategories', media: 'case-studies' },
  'certified-partners': { collection: 'partners', media: 'partners' },
  'partners-tiers': { collection: 'partnerTiers', media: 'partners' },
  'partners-industries': { collection: 'partnerIndustries', media: 'partners' },
  'partners-services': { collection: 'partnerServices', media: 'partners' },
  'partners-language': { collection: 'partnerLanguages', media: 'partners' },
  'partners-location': { collection: 'partnerLocations', media: 'partners' },
  'careers-jobs': { collection: 'jobs', media: 'jobs' },
}

type Fields = Record<string, unknown>

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) ? v : undefined)
/** CSS colour names Webflow accepts in a Color field, as the hex the schema takes. */
const NAMED_COLORS: Record<string, string> = { black: '#000000', white: '#ffffff' }

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

interface WfImage {
  fileId?: string
  url?: string
  alt?: string | null
}

/** Item id to slug, per Webflow collection id, for reference resolution. */
export type SlugIndex = Map<string, Map<string, string>>

export function slugIndex(ctx: RunCtx): SlugIndex {
  const index: SlugIndex = new Map()
  for (const { schema, items } of ctx.exp.collections.values()) {
    index.set(schema.id, new Map(items.map((i) => [i.id, String(i.fieldData.slug ?? '')])))
  }
  return index
}

class ItemReader {
  readonly t: ItemText
  readonly f: Fields
  readonly item: WfItem
  readonly schema: WfCollection
  readonly index: SlugIndex

  constructor(t: ItemText, item: WfItem, schema: WfCollection, index: SlugIndex) {
    this.t = t
    this.f = item.fieldData
    this.item = item
    this.schema = schema
    this.index = index
  }

  text(field: string): string | undefined {
    const v = str(this.f[field])
    return v === undefined ? undefined : this.t.text(v.trim())
  }

  required(field: string): string {
    const v = this.text(field)
    if (v === undefined) throw new ItemStop(`the field ${field} is empty`)
    return v
  }

  markdown(field: string): string {
    return this.t.markdown(String(this.f[field] ?? ''))
  }

  /** A Reference field to the referenced item's slug; a dangling id is reported and left out. */
  ref(field: string): string | undefined {
    const id = str(this.f[field])
    if (id === undefined) return undefined
    return this.resolve(field, id)
  }

  refs(field: string): string[] {
    return ids(this.f[field])
      .map((id) => this.resolve(field, id))
      .filter((s): s is string => s !== undefined)
  }

  private resolve(field: string, id: string): string | undefined {
    const target = this.schema.fields.find((x) => x.slug === field)?.validations?.collectionId
    const slug = target ? this.index.get(target)?.get(id) : undefined
    if (!slug) this.t.note(`${field}: the referenced item ${id} is not in the export, left out`)
    return slug || undefined
  }

  /** A Color field as hex; a CSS colour name becomes its hex value (and is reported). */
  color(field: string): string | undefined {
    const v = str(this.f[field])?.trim()
    if (v === undefined) return undefined
    const named = NAMED_COLORS[v.toLowerCase()]
    if (named) {
      this.t.note(`${field}: the colour name ${v} is written as ${named}`)
      return named
    }
    return v
  }

  /** An Option field to its Webflow option name. */
  option(field: string): string | undefined {
    const id = str(this.f[field])
    if (id === undefined) return undefined
    const name = optionNames(this.schema, field).get(id)
    if (name === undefined) throw new ItemStop(`${field}: the option ${id} is not in the collection schema`)
    return name
  }

  image(field: string, altFallback?: string): Record<string, unknown> | undefined {
    const img = this.f[field] as WfImage | null | undefined
    return img?.url ? this.imageOf(img, field, altFallback) : undefined
  }

  images(field: string): Record<string, unknown>[] {
    const list = (this.f[field] as WfImage[] | null | undefined) ?? []
    return list.filter((i) => i?.url).map((i) => this.imageOf(i, field))
  }

  private imageOf(img: WfImage, field: string, altFallback?: string): Record<string, unknown> {
    const src = this.t.media(String(img.url))
    const alt = str(img.alt)
    if (alt !== undefined) return { src, alt: this.t.text(alt.trim()) }
    if (altFallback !== undefined) {
      this.t.note(`${field}: no alt text in Webflow, the name is used`)
      return { src, alt: altFallback }
    }
    this.t.note(`${field}: no alt text in Webflow, marked decorative`)
    return { src, alt: '', decorative: true }
  }
}

function labelKey<K extends string>(labels: Record<K, string>, name: string | undefined, field: string): K | undefined {
  if (name === undefined) return undefined
  const key = (Object.keys(labels) as K[]).find((k) => labels[k] === name)
  if (key === undefined) throw new ItemStop(`${field}: the option "${name}" has no key in lib/schema/www-content.ts`)
  return key
}

/** The fields each Webflow collection must have; a renamed field fails the run instead of writing empty values. */
const REQUIRED_FIELDS: Record<string, readonly string[]> = {
  'blog-posts': [
    'name',
    'slug',
    'short-description',
    'publication-date',
    'author',
    'category',
    'featured',
    'thumbnail',
    'content',
  ],
  'blog-authors': ['name', 'slug'],
  'blog-categories': ['name', 'slug', 'display-order', 'label-color', 'text-color'],
  'case-studies': [
    'name',
    'slug',
    'main-heading',
    'short-description',
    'thumbnail',
    'hero-video',
    'delivered-by',
    'delivered-by-url',
    'overview-client',
    'overview-industry',
    'overview-timeline',
    'overview-type',
    'overview-stack',
    'screenshots',
    'category',
    'featured-on-agencies-page',
    'display-order',
    'case-content',
  ],
  'case-studies-categories': ['name', 'slug'],
  'certified-partners': [
    'name',
    'slug',
    'logo',
    'tier-2',
    'industry',
    'location-2',
    'language',
    'services',
    'budget',
    'availability',
    'projects-in-portfolio',
    'website-url',
    'short-description',
    'bio',
  ],
  'partners-tiers': ['name', 'slug', 'order', 'background-color', 'text-color'],
  'partners-industries': ['name', 'slug', 'display-order'],
  'partners-services': ['name', 'slug', 'display-order'],
  'partners-language': ['name', 'slug'],
  'partners-location': ['name', 'slug'],
  'careers-jobs': [
    'name',
    'slug',
    'short-description',
    'location',
    'employment-type',
    'department',
    'description',
    'apply-url',
    'open-position',
    'display-order',
    'salary',
    'tech-stack',
  ],
}

/** Entries of every CMS collection of the export (docs aside), item by item; a stopped item is reported. */
export function collectionEntries(ctx: RunCtx, only: ReadonlySet<WwwCollection> | undefined): Entry[] {
  const index = slugIndex(ctx)
  const out: Entry[] = []
  for (const [wfSlug, target] of Object.entries(WEBFLOW_COLLECTIONS)) {
    if (only && !only.has(target.collection)) continue
    const c = ctx.exp.collections.get(wfSlug)
    if (!c) {
      ctx.report.notes.push({ item: target.collection, note: `the export has no collection ${wfSlug}` })
      continue
    }
    requireFields(c.schema, REQUIRED_FIELDS[wfSlug] ?? [])
    const entries: { e: Entry; t: ItemText }[] = []
    for (const item of c.items) {
      const slug = String(item.fieldData.slug ?? '')
      const name = `${target.collection}/${slug || item.id}`
      if (item.isArchived) {
        ctx.report.notes.push({ item: name, note: 'archived in Webflow, not imported' })
        continue
      }
      const entry = guard(ctx, name, () => {
        if (!SLUG_RE.test(slug)) throw new ItemStop(`the slug "${slug}" is not a slug`)
        const t = new ItemText(ctx, name, target.media, false)
        const r = new ItemReader(t, item, c.schema, index)
        return { e: WRITERS[target.collection]!(r, slug), t }
      })
      if (entry) entries.push(entry)
    }
    // a dictionary is ordered (and a missing order numbered) before the schema checks it
    const ordered = orderDictionary(
      target.collection,
      entries.map((x) => x.e),
    )
    for (const e of ordered) {
      const done = guard(ctx, `${target.collection}/${e.id}`, () => validate(ctx, e))
      if (done) {
        entries.find((x) => x.e === e)!.t.commit()
        out.push(done)
      }
    }
  }
  return out
}

/** Dictionaries by `order`, then name (spec Output); a missing order goes last and gets the next number. */
function orderDictionary(collection: WwwCollection, entries: Entry[]): Entry[] {
  if (!DICTIONARIES.has(collection)) return entries
  const sorted = [...entries].sort((a, b) => {
    const oa = num(a.data.order)
    const ob = num(b.data.order)
    if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob
    if (oa !== undefined && ob === undefined) return -1
    if (oa === undefined && ob !== undefined) return 1
    return cmp(String(a.data.name), String(b.data.name)) || cmp(a.id, b.id)
  })
  if (collection === 'blogCategories' || collection === 'partnerTiers') {
    // the schema requires an order here; a category without one follows the numbered ones
    let next = Math.max(0, ...sorted.map((e) => num(e.data.order) ?? 0))
    for (const e of sorted) if (num(e.data.order) === undefined) e.data.order = ++next
  }
  return sorted
}

const DICTIONARIES = new Set<WwwCollection>([
  'authors',
  'blogCategories',
  'caseStudyCategories',
  'partnerTiers',
  'partnerIndustries',
  'partnerServices',
  'partnerLanguages',
  'partnerLocations',
])

type Writer = (r: ItemReader, slug: string) => Entry

function base(
  r: ItemReader,
  collection: WwwCollection,
  slug: string,
  data: Record<string, unknown>,
  body?: string,
): Entry {
  const draft = r.item.isDraft
  const e: Entry = { collection, id: slug, webflowId: r.item.id, draft, data: compact(data) }
  if (body !== undefined) e.body = body
  return e
}

const WRITERS: Partial<Record<WwwCollection, Writer>> = {
  blog: (r, slug) => {
    let date = isoUtc(str(r.f['publication-date']))
    if (!date) {
      date = isoUtc(r.item.createdOn)
      r.t.note('no publication date in Webflow, createdOn is used')
    }
    if (!date) throw new ItemStop('no publication date and no createdOn')
    const body = r.markdown('content')
    return base(
      r,
      'blog',
      slug,
      {
        webflowId: r.item.id,
        title: r.required('name'),
        description: r.required('short-description'),
        date,
        updated: updatedAfter(date, r.item.lastPublished),
        author: r.ref('author'),
        category: r.ref('category'),
        featured: r.f.featured === true,
        thumbnail: r.image('thumbnail'),
        draft: r.item.isDraft,
      },
      body,
    )
  },
  authors: (r, slug) => base(r, 'authors', slug, { webflowId: r.item.id, name: r.required('name') }),
  blogCategories: (r, slug) =>
    base(r, 'blogCategories', slug, {
      webflowId: r.item.id,
      name: r.required('name'),
      order: num(r.f['display-order']),
      labelColor: r.color('label-color'),
      textColor: r.color('text-color'),
    }),
  caseStudies: (r, slug) => {
    let deliveredBy = r.ref('delivered-by')
    let deliveredByUrl = str(r.f['delivered-by-url'])
    // a URL that is a partner page of this site is that partner
    const own = deliveredByUrl
      ? /^https:\/\/(?:www\.)?openmercato\.com\/certified-partners\/([a-z0-9-]+)\/?$/.exec(deliveredByUrl)
      : null
    if (own) {
      if (deliveredBy !== undefined && deliveredBy !== own[1])
        r.t.note(`delivered-by is ${deliveredBy} but delivered-by-url names ${own[1]}; delivered-by is kept`)
      deliveredBy ??= own[1]
      deliveredByUrl = undefined
    } else if (deliveredBy !== undefined && deliveredByUrl !== undefined) {
      r.t.note(`both delivered-by and delivered-by-url are set; delivered-by is kept, ${deliveredByUrl} dropped`)
      deliveredByUrl = undefined
    }
    const stats = [1, 2, 3].map((n) => ({
      title: r.text(`stat-${n}-title`),
      description: r.text(`stat-${n}-description`),
    }))
    const filled = stats.filter((s) => s.title !== undefined || s.description !== undefined).length
    if (filled !== 0 && stats.some((s) => s.title === undefined || s.description === undefined))
      throw new ItemStop('the stats are filled in part (the schema takes all three or none)')
    const video = r.f['hero-video'] as { url?: string } | null | undefined
    let heroVideo: string | undefined
    if (video?.url) {
      heroVideo = youTubeId(video.url)
      if (heroVideo === undefined) throw new ItemStop(`hero-video ${video.url} is not a YouTube address`)
    }
    const body = r.markdown('case-content')
    return base(
      r,
      'caseStudies',
      slug,
      {
        webflowId: r.item.id,
        title: r.required('name'),
        heading: r.required('main-heading'),
        description: r.required('short-description'),
        thumbnail: r.image('thumbnail'),
        heroVideo,
        deliveredBy,
        deliveredByUrl,
        overview: compact({
          client: r.text('overview-client'),
          industry: r.text('overview-industry'),
          timeline: r.text('overview-timeline'),
          type: r.text('overview-type'),
          stack: r.markdown('overview-stack') || undefined,
        }),
        stats: filled === 0 ? undefined : stats,
        screenshots: r.images('screenshots'),
        categories: r.refs('category'),
        featuredOnAgencies: r.f['featured-on-agencies-page'] === true,
        order: num(r.f['display-order']),
        draft: r.item.isDraft,
      },
      body,
    )
  },
  caseStudyCategories: (r, slug) =>
    base(r, 'caseStudyCategories', slug, { webflowId: r.item.id, name: r.required('name') }),
  partners: (r, slug) => {
    const name = r.required('name')
    const portfolio = r.option('projects-in-portfolio')
    if (portfolio !== undefined && portfolio !== 'Yes' && portfolio !== 'No')
      throw new ItemStop(`projects-in-portfolio: the option "${portfolio}" is neither Yes nor No`)
    const body = r.markdown('bio')
    return base(
      r,
      'partners',
      slug,
      {
        webflowId: r.item.id,
        name,
        logo: r.image('logo', `${name} logo`),
        tier: r.ref('tier-2'),
        industries: r.refs('industry'),
        location: r.ref('location-2'),
        languages: r.refs('language'),
        services: r.refs('services'),
        budget: labelKey(PARTNER_BUDGET_LABELS, r.option('budget'), 'budget'),
        availability: labelKey(PARTNER_AVAILABILITY_LABELS, r.option('availability'), 'availability'),
        projectsInPortfolio: portfolio === 'Yes',
        website: str(r.f['website-url']),
        description: r.required('short-description'),
        draft: r.item.isDraft,
      },
      body,
    )
  },
  partnerTiers: (r, slug) =>
    base(r, 'partnerTiers', slug, {
      webflowId: r.item.id,
      name: r.required('name'),
      order: num(r.f.order),
      backgroundColor: r.color('background-color'),
      textColor: r.color('text-color'),
    }),
  partnerIndustries: (r, slug) =>
    base(r, 'partnerIndustries', slug, {
      webflowId: r.item.id,
      name: r.required('name'),
      order: num(r.f['display-order']),
    }),
  partnerServices: (r, slug) =>
    base(r, 'partnerServices', slug, {
      webflowId: r.item.id,
      name: r.required('name'),
      order: num(r.f['display-order']),
    }),
  partnerLanguages: (r, slug) => base(r, 'partnerLanguages', slug, { webflowId: r.item.id, name: r.required('name') }),
  partnerLocations: (r, slug) => base(r, 'partnerLocations', slug, { webflowId: r.item.id, name: r.required('name') }),
  jobs: (r, slug) => {
    const datePosted = isoUtc(r.item.createdOn)
    if (!datePosted) throw new ItemStop('no createdOn for datePosted')
    const body = r.markdown('description')
    return base(
      r,
      'jobs',
      slug,
      {
        webflowId: r.item.id,
        title: r.required('name'),
        description: r.required('short-description'),
        location: r.required('location'),
        employmentType: labelKey(EMPLOYMENT_TYPE_LABELS, r.option('employment-type'), 'employment-type'),
        department: r.text('department'),
        salary: r.text('salary'),
        techStack: r.text('tech-stack'),
        applyUrl: str(r.f['apply-url']),
        open: r.f['open-position'] === true,
        order: num(r.f['display-order']),
        datePosted,
        draft: r.item.isDraft,
      },
      body,
    )
  },
}
