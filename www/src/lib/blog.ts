// The blog of the main site (spec docs/specs/2026-11-24-www-site-migration.md, Phase 3): which posts the site shows,
// in what order, the category filter's query string contract, and the SEO of a post (title, canonical, og:image,
// BlogPosting and BreadcrumbList JSON-LD), all computed from the entries of www/content/blog. A draft (`draft: true`)
// is validated by the content config but never routed, listed, linked or put in a sitemap (D6). Isomorphic: the
// pages, the filter island and the unit tests use it alike.

/** A reference as the schemas give it: a slug in a unit test, Astro's `{ collection, id }` in a build. */
export type Ref = string | { id: string }

export interface PostImage {
  src: string
  alt: string
  decorative?: boolean
  width?: number
  height?: number
}

/** A blog entry: its id (the slug, from the file name) and its frontmatter after the schema (blogSchema). */
export interface PostEntry {
  id: string
  data: {
    webflowId?: string
    title: string
    description: string
    date: Date
    updated?: Date
    author?: Ref
    category?: Ref
    featured: boolean
    thumbnail?: PostImage
    seo?: { title?: string; description?: string; ogImage?: string; noindex?: boolean }
    draft: boolean
  }
}

export const BLOG_PATH = '/blog'
export const POST_PREFIX = '/blog-posts/'
/** The query parameter of the category filter: `/blog?category=architecture&category=security`. */
export const CATEGORY_PARAM = 'category'
/**
 * The suffix of a page title (spec, SEO: `<title> | Open Mercato`): the blog posts and the list pages. The detail pages
 * of the other collections use the suffix of their Webflow template (owner's decision of 25 Nov 2026: every migrated
 * title equals the live one); the Webflow template of a post is `{name} | Open Mercato`, this suffix.
 */
export const TITLE_SUFFIX = ' | Open Mercato'
export const SITE_NAME = 'Open Mercato'

/** The site path of a post. */
export const postPath = (slug: string): string => `${POST_PREFIX}${slug}`

/** The id a reference names. */
export function refId(r: Ref | undefined): string | undefined {
  if (r === undefined) return undefined
  return typeof r === 'string' ? r : r.id
}

/**
 * Newest first; the same day the newer Webflow item first, then by slug, so the order never depends on the file system.
 */
function byDateDesc(a: PostEntry, b: PostEntry): number {
  const d = b.data.date.getTime() - a.data.date.getTime()
  if (d !== 0) return d
  // the same day: the newer Webflow item first, as the live list has them (an id starts with its creation time)
  const wa = a.data.webflowId ?? ''
  const wb = b.data.webflowId ?? ''
  if (wa !== wb) return wa < wb ? 1 : -1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The posts the site shows: every entry that is not a draft, newest first. */
export function publishedPosts<T extends PostEntry>(all: readonly T[]): T[] {
  return all.filter((p) => !p.data.draft).sort(byDateDesc)
}

/** The featured posts among published ones, newest first. */
export function featuredPosts<T extends PostEntry>(published: readonly T[]): T[] {
  return published.filter((p) => p.data.featured)
}

/**
 * The one featured post /blog shows above the feed, as the live page does: the first featured post by title. Webflow's
 * list has a limit of one and no sort of its own; its first item, as of 25 Nov 2026, is the first by title.
 */
export function leadFeaturedPost<T extends PostEntry>(published: readonly T[]): T | undefined {
  return [...featuredPosts(published)].sort((a, b) => a.data.title.localeCompare(b.data.title, 'en'))[0]
}

/** Up to `n` other published posts: those of the same category first, then the newest. */
export function relatedPosts<T extends PostEntry>(post: PostEntry, published: readonly T[], n = 3): T[] {
  const cat = refId(post.data.category)
  const others = published.filter((p) => p.id !== post.id)
  const same = cat === undefined ? [] : others.filter((p) => refId(p.data.category) === cat)
  const rest = others.filter((p) => !same.includes(p))
  return [...same, ...rest].slice(0, n)
}

// ---------------------------------------------------------------------------------------------------------------------
// The byline of a post, as the live template's reader script writes it (its om-blog-reader code, run here at build)

/** The author a byline names: the post's author, or the site when it has none. */
export const bylineName = (author: string | undefined): string => author || SITE_NAME

/** The initials of the byline's avatar: the first letters of the first and the last word. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w !== '')
    .map((w) => w[0]!)
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .join('')
    .toUpperCase()
}

/** Minutes to read a text at 220 words a minute, at least 1. */
export function readingMinutes(text: string): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '').length
  return Math.max(1, Math.ceil(words / 220))
}

/** `November 24, 2026`, the date format of the live template. */
export const longDate = (d: Date): string =>
  d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// ---------------------------------------------------------------------------------------------------------------------
// Category filter (spec, UI/UX, Blog filter): one facet; within it any selected value matches. The state lives in the
// query string, one `category` parameter per selected category, so a filtered view can be shared and Back works.

/** The selected categories of `search` (a location.search), known ones only, in the order of `known`. */
export function readCategories(search: string, known: readonly string[]): string[] {
  const asked = new Set(new URLSearchParams(search).getAll(CATEGORY_PARAM))
  return known.filter((k) => asked.has(k))
}

/** `search` with the category parameters replaced by `selected` (other parameters kept); `''` when nothing is left. */
export function writeCategories(search: string, selected: readonly string[]): string {
  const params = new URLSearchParams(search)
  params.delete(CATEGORY_PARAM)
  for (const s of selected) params.append(CATEGORY_PARAM, s)
  const q = params.toString()
  return q === '' ? '' : `?${q}`
}

/** `selected` with `id` added, or removed when it was there. */
export function toggleCategory(selected: readonly string[], id: string, known: readonly string[]): string[] {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return known.filter((k) => next.has(k))
}

/** Whether an entry of the categories `categories` shows under the selection: any one selected matches. */
export function matchesAnyCategory(categories: readonly string[], selected: readonly string[]): boolean {
  if (selected.length === 0) return true
  return categories.some((c) => selected.includes(c))
}

/** Whether a post of category `category` shows under the selection: everything when nothing is selected. */
export function matchesCategories(category: string | undefined, selected: readonly string[]): boolean {
  if (selected.length === 0) return true
  return category !== undefined && selected.includes(category)
}

// ---------------------------------------------------------------------------------------------------------------------
// SEO of a post (spec, SEO)

/** An absolute URL of a site path on `origin`: no query, no trailing slash but the home page's `/`. */
export function canonicalUrl(origin: string, path: string): string {
  const u = new URL(path, origin)
  u.search = ''
  u.hash = ''
  if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '')
  return u.toString()
}

export interface PostSeo {
  title: string
  description: string
  canonical: string
  /** The site path of the og:image, when the post has one of its own. */
  ogImage?: string
  noindex: boolean
}

export function postSeo(post: PostEntry, origin: string): PostSeo {
  const d = post.data
  return {
    title: d.seo?.title ?? `${d.title}${TITLE_SUFFIX}`,
    description: d.seo?.description ?? d.description,
    canonical: canonicalUrl(origin, postPath(post.id)),
    ogImage: d.seo?.ogImage ?? d.thumbnail?.src,
    noindex: d.seo?.noindex ?? false,
  }
}

/** The names a post's references resolve to; a missing one is left out (a post may have no author or category). */
export interface PostNames {
  author?: string
  category?: string
}

/** `BlogPosting` and `BreadcrumbList` (Home, Blog, the post) of a post, as one JSON-LD graph. */
export function postJsonLd(post: PostEntry, origin: string, names: PostNames = {}): Record<string, unknown> {
  const seo = postSeo(post, origin)
  const d = post.data
  const home = canonicalUrl(origin, '/')
  const posting: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': `${seo.canonical}#article`,
    headline: d.title,
    description: seo.description,
    url: seo.canonical,
    mainEntityOfPage: seo.canonical,
    datePublished: d.date.toISOString(),
    dateModified: (d.updated ?? d.date).toISOString(),
    inLanguage: 'en',
    publisher: { '@type': 'Organization', name: SITE_NAME, url: home },
  }
  if (names.author) posting.author = { '@type': 'Person', name: names.author }
  if (seo.ogImage) posting.image = canonicalUrl(origin, seo.ogImage)
  if (names.category) posting.articleSection = names.category
  const crumbs = [
    { name: 'Home', item: home },
    { name: 'Blog', item: canonicalUrl(origin, BLOG_PATH) },
    { name: d.title, item: seo.canonical },
  ]
  return {
    '@context': 'https://schema.org',
    '@graph': [
      posting,
      {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
      },
    ],
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Cards: what a list shows of a post, as plain data (the filter island gets it as props, so it is serializable)

export interface PostCardData {
  slug: string
  href: string
  title: string
  description: string
  /** ISO 8601. */
  date: string
  author?: string
  category?: { id: string; name: string }
  thumbnail?: { src: string; alt: string }
}

export function postCard(
  post: PostEntry,
  names: { authors: ReadonlyMap<string, string>; categories: ReadonlyMap<string, string> },
): PostCardData {
  const d = post.data
  const authorId = refId(d.author)
  const catId = refId(d.category)
  const card: PostCardData = {
    slug: post.id,
    href: postPath(post.id),
    title: d.title,
    description: d.description,
    date: d.date.toISOString(),
  }
  const author = authorId === undefined ? undefined : names.authors.get(authorId)
  if (author) card.author = author
  const category = catId === undefined ? undefined : names.categories.get(catId)
  if (catId !== undefined && category) card.category = { id: catId, name: category }
  // the live cards bind the image's alt text to the post's name (27 Nov 2026), whatever the thumbnail's own
  if (d.thumbnail) card.thumbnail = { src: d.thumbnail.src, alt: d.title }
  return card
}
