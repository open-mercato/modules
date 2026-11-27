// An export directory from the published site instead of the API (`yarn om webflow-export --from-site <base>`): the
// blog posts and case studies of the live sitemap are read from their public HTML and written over the items of an
// earlier export, which keeps every field the pages do not show (Webflow ids, display order, flags, drafts). For use
// when no API token is at hand; the next API export replaces what it wrote. Read-only: GET requests to the site only.
// The pages are parsed into a syntax tree (hast-util-from-html); rich text is the exact HTML the site serves, which is
// the HTML the API returns.
import { cpSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Element, Nodes, Root } from 'hast'
import { fromHtml } from 'hast-util-from-html'
import pLimit from 'p-limit'
import { ExportError, readExport, type WfItem } from './export.ts'

/** The user agent of every request; the site answers a plain client the same HTML. */
export const PUBLISHED_USER_AGENT = 'open-mercato-webflow-export (read-only)'

/** The collections read from the published pages: path prefix to Webflow collection slug. */
export const PUBLISHED_COLLECTIONS = { '/blog-posts/': 'blog-posts', '/case-studies/': 'case-studies' } as const
type PublishedSlug = (typeof PUBLISHED_COLLECTIONS)[keyof typeof PUBLISHED_COLLECTIONS]

export class PublishedPageError extends Error {}

const classes = (el: Element): string[] => {
  const v: unknown = el.properties?.className
  return Array.isArray(v) ? v.map(String) : []
}
const hasClass = (el: Element, c: string) => classes(el).includes(c)

/** Elements Webflow renders but hides: a conditional visibility that is off, an empty bound list. */
const hidden = (el: Element) => classes(el).some((c) => c === 'w-condition-invisible' || c === 'w-dyn-hide')

function* elements(node: Nodes): Generator<Element> {
  if (node.type === 'element') {
    if (hidden(node)) return
    yield node
  }
  if ('children' in node) for (const c of node.children) yield* elements(c)
}

const find = (node: Nodes, test: (el: Element) => boolean): Element | undefined => {
  for (const el of elements(node)) if (test(el)) return el
  return undefined
}
const findAll = (node: Nodes, test: (el: Element) => boolean): Element[] => [...elements(node)].filter(test)
const byClass = (node: Nodes, c: string) => find(node, (el) => hasClass(el, c))

/** The visible text of a node, whitespace collapsed; undefined when empty. */
export function textOf(node: Nodes | undefined): string | undefined {
  if (!node) return undefined
  let out = ''
  const walk = (n: Nodes) => {
    if (n.type === 'text') out += n.value
    else if (n.type === 'element') {
      if (hidden(n) || n.tagName === 'script' || n.tagName === 'style') return
      if (n.tagName === 'br') out += ' '
      for (const c of n.children) walk(c)
    } else if ('children' in n) for (const c of n.children) walk(c)
  }
  walk(node)
  const t = out.replace(/\s+/g, ' ').trim()
  return t === '' ? undefined : t
}

/** The HTML between an element's tags, exactly as served. */
function innerHtml(html: string, el: Element): string {
  const first = el.children[0]?.position?.start.offset
  const last = el.children[el.children.length - 1]?.position?.end.offset
  if (first === undefined || last === undefined) return ''
  return html.slice(first, last)
}

/** An address Cloudflare's email obfuscation encoded: the first byte is the key, every next byte XOR the key. */
export function cfDecode(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16)
  let out = ''
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
  return out
}

/**
 * The page as Webflow published it, before Cloudflare's email obfuscation: an encoded `mailto:` link gets its address
 * back, and an address in the text (served as a protected span or link) is text again.
 */
export function unprotectEmails(html: string): string {
  return html
    .replace(/<(a|span)\b[^>]*class="__cf_email__"[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[^<]*<\/\1\s*>/g, (_, _t, hex) =>
      cfDecode(hex),
    )
    .replace(/href="\/cdn-cgi\/l\/email-protection#([0-9a-f]+)"/g, (_, hex) => `href="mailto:${cfDecode(hex)}"`)
}

/** `https://cdn…/<fileId>_<name>` to the Webflow file id; undefined for another address. */
export function fileIdOf(url: string): string | undefined {
  return /\/([0-9a-f]{24})_[^/]+$/.exec(url)?.[1]
}

const meta = (tree: Root, key: string): string | undefined => {
  const el = find(tree, (e) => e.tagName === 'meta' && (e.properties?.property === key || e.properties?.name === key))
  const v = el?.properties?.content
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

function itemSlug(tree: Root, url: string): string {
  const html = find(tree, (e) => e.tagName === 'html')
  const slug = html?.properties?.dataWfItemSlug
  if (typeof slug !== 'string' || slug === '') throw new PublishedPageError(`${url}: no data-wf-item-slug`)
  return slug
}

function richText(html: string, root: Nodes, url: string, test: (el: Element) => boolean): string {
  const el = find(root, (e) => hasClass(e, 'w-richtext') && test(e))
  if (!el) throw new PublishedPageError(`${url}: no rich text`)
  return innerHtml(html, el)
}

export interface PublishedImage {
  url: string
  alt: string | null
}

const imageOf = (el: Element | undefined): PublishedImage | undefined => {
  const src = el?.properties?.src
  if (typeof src !== 'string' || src === '') return undefined
  const alt = el?.properties?.alt
  return { url: src, alt: typeof alt === 'string' && alt.trim() !== '' ? alt : null }
}

/** What a published case study page shows. */
export interface CaseStudyPage {
  slug: string
  /** The `h1`: the `name` field. */
  name: string
  /** The page title without the template's suffix: the `main-heading` field. */
  heading: string
  description: string
  categories: string[]
  heroVideo?: string
  deliveredBy?: { name?: string; href: string }
  overview: { client?: string; industry?: string; timeline?: string }
  stack: string
  stats: { title?: string; description?: string }[]
  content: string
  screenshots: PublishedImage[]
}

const CASE_TITLE_SUFFIX = ' | Open Mercato Case Study'

/** A YouTube watch address of an embed (Webflow's video field renders an embedly iframe). */
export function youTubeWatch(src: string): string | undefined {
  const embed =
    /youtube\.com%2Fembed%2F([A-Za-z0-9_-]{11})/.exec(src) ?? /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/.exec(src)
  if (embed) return `https://www.youtube.com/watch?v=${embed[1]}`
  const watch = /youtube\.com%2Fwatch%3Fv%3D([A-Za-z0-9_-]{11})/.exec(src)
  return watch ? `https://www.youtube.com/watch?v=${watch[1]}` : undefined
}

export function readCaseStudyPage(served: string, url: string): CaseStudyPage {
  const html = unprotectEmails(served)
  const tree = fromHtml(html)
  const titleEl = find(tree, (e) => e.tagName === 'title')
  const title = textOf(titleEl)
  if (!title?.endsWith(CASE_TITLE_SUFFIX)) throw new PublishedPageError(`${url}: the title is not a case study title`)
  const header = byClass(tree, 'header_content')
  if (!header) throw new PublishedPageError(`${url}: no header`)
  const name = textOf(find(header, (e) => e.tagName === 'h1'))
  const description = textOf(find(header, (e) => e.tagName === 'p'))
  if (!name || !description) throw new PublishedPageError(`${url}: no heading or description`)
  const labels = byClass(header, 'case-label_collection-list')
  const categories = labels ? findAll(labels, (e) => hasClass(e, 'case_label-text')).map((e) => textOf(e) ?? '') : []
  const hero = byClass(tree, 'header_asset-wrapper')
  const iframe = hero ? find(hero, (e) => e.tagName === 'iframe') : undefined
  const heroVideo = typeof iframe?.properties?.src === 'string' ? youTubeWatch(iframe.properties.src) : undefined
  if (iframe && !heroVideo) throw new PublishedPageError(`${url}: the hero video is not a YouTube embed`)

  const summary = byClass(tree, 'case_summary-content')
  const overview: CaseStudyPage['overview'] = {}
  let deliveredBy: CaseStudyPage['deliveredBy']
  for (const item of summary ? findAll(summary, (e) => hasClass(e, 'case_summary-item')) : []) {
    const label = textOf(byClass(item, 'text-style-tagline'))?.toLowerCase()
    const value = item.children.filter(
      (c): c is Element => c.type === 'element' && !hidden(c) && !hasClass(c, 'text-style-tagline'),
    )[0]
    if (!label || !value) continue
    if (label === 'delivered by') {
      const href = value.properties?.href
      if (typeof href === 'string' && href !== '') deliveredBy = { name: textOf(value), href }
    } else if (label === 'client' || label === 'industry' || label === 'timeline') overview[label] = textOf(value)
    else throw new PublishedPageError(`${url}: an unknown summary item "${label}"`)
  }

  const numbers = byClass(tree, 'case-post_numbers')
  const stats = (numbers ? findAll(numbers, (e) => hasClass(e, 'case-post_number-content')) : []).map((n) => ({
    title: textOf(byClass(n, 'text-size-large')),
    description: textOf(byClass(n, 'text-color-secondary')),
  }))
  const body = byClass(tree, 'case-post_content')
  if (!body) throw new PublishedPageError(`${url}: no case study body`)
  const content = richText(html, body, url, (e) => hasClass(e, 'text-blog-rich-text'))
  const panel = byClass(body, 'case-post_stack-panel')
  const stack = panel ? richText(html, panel, url, () => true) : ''
  const gallery = byClass(tree, 'case-post_gallery')
  const screenshots = (gallery ? findAll(gallery, (e) => e.tagName === 'img') : [])
    .map(imageOf)
    .filter((i): i is PublishedImage => i !== undefined)
  return {
    slug: itemSlug(tree, url),
    name,
    heading: title.slice(0, -CASE_TITLE_SUFFIX.length),
    description,
    categories,
    heroVideo,
    deliveredBy,
    overview,
    stack,
    stats,
    content,
    screenshots,
  }
}

/** What a published blog post page shows. */
export interface BlogPostPage {
  slug: string
  name: string
  description: string
  category?: { name: string; labelColor?: string; textColor?: string }
  author?: string
  /** The shown date as `YYYY-MM-DD`; a post without a publication date shows none. */
  date?: string
  thumbnail?: string
  content: string
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "August 10, 2026" to "2026-08-10". */
export function shownDate(s: string): string | undefined {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(s.trim())
  const month = m ? MONTHS.indexOf(m[1]!) : -1
  if (!m || month < 0) return undefined
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
}

/** A blog category label: its name and the colours Webflow binds into its style. */
function categoryOf(el: Element | undefined): BlogPostPage['category'] {
  const name = textOf(el)
  if (!el || !name) return undefined
  const style = typeof el.properties?.style === 'string' ? el.properties.style : ''
  const color = (prop: string) =>
    new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(style)?.[1]?.toLowerCase()
  return { name, labelColor: color('background-color'), textColor: color('color') }
}

export function readBlogPostPage(served: string, url: string): BlogPostPage {
  const html = unprotectEmails(served)
  const tree = fromHtml(html)
  const header = byClass(tree, 'header_content')
  if (!header) throw new PublishedPageError(`${url}: no header`)
  const name = textOf(find(header, (e) => e.tagName === 'h1'))
  const description = textOf(find(header, (e) => e.tagName === 'p'))
  if (!name || !description) throw new PublishedPageError(`${url}: no name or description`)
  const byline = byClass(header, 'blog-post_header')
  const parts = byline
    ? byline.children
        .filter((c): c is Element => c.type === 'element' && !hidden(c) && hasClass(c, 'text-size-small'))
        .map((c) => textOf(c))
    : []
  const date = parts.length > 0 ? shownDate(parts[parts.length - 1] ?? '') : undefined
  const content = byClass(tree, 'blog-post_content')
  if (!content) throw new PublishedPageError(`${url}: no post body`)
  return {
    slug: itemSlug(tree, url),
    name,
    description,
    category: categoryOf(byClass(header, 'blog_label-text')),
    author: parts.length > 1 ? parts[0] : undefined,
    date,
    thumbnail: meta(tree, 'og:image'),
    content: richText(html, content, url, () => true),
  }
}

/** Webflow's slug of a name: lowercase letters and digits, joined by single hyphens. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * A dictionary collection of the base export (categories, authors, partners), looked up by name or slug. A name the
 * base does not hold becomes a new item without a Webflow id, with the fields the page shows; `added` lists them.
 */
export class Dictionary {
  readonly items: WfItem[]
  readonly added: string[] = []
  private readonly key: 'name' | 'slug'
  private readonly create: boolean

  constructor(items: readonly WfItem[], key: 'name' | 'slug', create = true) {
    this.items = [...items]
    this.key = key
    this.create = create
  }

  id(value: string, fields: Record<string, unknown> = {}): string {
    const found = this.items.find((i) => String(i.fieldData[this.key] ?? '').trim() === value)
    if (found) return found.id || `new:${String(found.fieldData.slug)}`
    if (!this.create) throw new PublishedPageError(`the item "${value}" is not in the base export`)
    const slug = slugify(value)
    this.items.push({
      id: '',
      lastPublished: null,
      lastUpdated: null,
      createdOn: null,
      isArchived: false,
      isDraft: false,
      // no display order: the page does not show it, so the importer numbers the item after the others
      fieldData: { name: value, slug, 'display-order': null, ...fields },
    })
    this.added.push(slug)
    return `new:${slug}`
  }
}

export interface Dictionaries {
  caseCategories: Dictionary
  partners: Dictionary
  authors: Dictionary
  blogCategories: Dictionary
}

/** What rich text shows: its text, whitespace collapsed, and its image addresses. */
function richTextShape(html: string): string {
  const tree = fromHtml(html, { fragment: true })
  const texts: string[] = []
  const walk = (n: Nodes) => {
    if (n.type === 'text') texts.push(n.value)
    else if ('children' in n) for (const c of n.children) walk(c)
  }
  walk(tree)
  // text nodes joined by a space: the formatting between elements (a line break, none) does not count
  const text = texts.join(' ').replace(/\s+/g, ' ').trim()
  const srcs = findAll(tree, (e) => e.tagName === 'img').map((e) => String(e.properties?.src ?? ''))
  const links = findAll(tree, (e) => e.tagName === 'a').map((e) => String(e.properties?.href ?? ''))
  return JSON.stringify([text, srcs, links])
}

/**
 * The base export's rich text when the page shows the same: the site serializes older items differently (entities,
 * `alt=""` for an inherited alt text), and the API's HTML keeps what the page drops.
 */
export function sameRichText(base: unknown, published: string): boolean {
  return typeof base === 'string' && richTextShape(base) === richTextShape(published)
}

/** A file field of the base item when it names the same file, else the published one (its alt is not shown). */
function image(base: unknown, url: string | undefined): { fileId: string; url: string; alt: string | null } | null {
  if (!url) return null
  const fileId = fileIdOf(url)
  if (!fileId) throw new PublishedPageError(`${url}: not a Webflow file address`)
  const b = base as { fileId?: string; alt?: string | null } | null | undefined
  return { fileId, url, alt: b?.fileId === fileId ? (b.alt ?? null) : null }
}

/** A published page as a Webflow item: the base item's fields with what the page shows written over them. */
function item(base: WfItem | undefined, fields: Record<string, unknown>): WfItem {
  return {
    ...base,
    id: base?.id ?? '',
    lastPublished: base?.lastPublished ?? null,
    lastUpdated: base?.lastUpdated ?? null,
    createdOn: base?.createdOn ?? null,
    isArchived: false,
    isDraft: false,
    fieldData: { ...(base?.fieldData ?? {}), ...fields },
  }
}

export function caseStudyItem(
  page: CaseStudyPage,
  base: WfItem | undefined,
  dicts: Dictionaries,
  thumbnail: string | undefined,
  url: string,
): WfItem {
  const f = base?.fieldData ?? {}
  const video = f['hero-video'] as { url?: string } | null | undefined
  const videoId = (u: string | undefined) => (u ? /[?&]v=([\w-]{11})/.exec(u)?.[1] : undefined)
  const sameVideo = videoId(video?.url) !== undefined && videoId(video?.url) === videoId(page.heroVideo)
  // the template shows the item only with a partner: its name, linked to delivered-by-url
  const deliveredBy = page.deliveredBy?.name ? dicts.partners.id(page.deliveredBy.name) : null
  const deliveredByUrl = page.deliveredBy ? page.deliveredBy.href : (f['delivered-by-url'] ?? null)
  const stat = (n: number, k: 'title' | 'description') => page.stats[n]?.[k] ?? null
  const screenshots = page.screenshots.map((s) => {
    const same = ((f.screenshots as { fileId?: string; alt?: string | null }[] | null) ?? []).find(
      (b) => b.fileId === fileIdOf(s.url),
    )
    return { fileId: fileIdOf(s.url) ?? '', url: s.url, alt: s.alt ?? same?.alt ?? null }
  })
  return item(base, {
    slug: page.slug,
    name: page.name,
    'main-heading': page.heading,
    'short-description': page.description,
    category: page.categories.map((c) => dicts.caseCategories.id(c)),
    thumbnail: image(f.thumbnail, thumbnail),
    'hero-video': page.heroVideo ? (sameVideo ? video : { url: page.heroVideo }) : null,
    'delivered-by': deliveredBy,
    'delivered-by-url': deliveredByUrl,
    'overview-client': page.overview.client ?? null,
    'overview-industry': page.overview.industry ?? null,
    'overview-timeline': page.overview.timeline ?? null,
    // not shown on the page: kept from the base export
    'overview-type': f['overview-type'] ?? null,
    'overview-stack': sameRichText(f['overview-stack'], page.stack) ? f['overview-stack'] : page.stack || null,
    'stat-1-title': stat(0, 'title'),
    'stat-1-description': stat(0, 'description'),
    'stat-2-title': stat(1, 'title'),
    'stat-2-description': stat(1, 'description'),
    'stat-3-title': stat(2, 'title'),
    'stat-3-description': stat(2, 'description'),
    'case-content': sameRichText(f['case-content'], page.content) ? f['case-content'] : page.content,
    screenshots: screenshots.length === 0 && !Array.isArray(f.screenshots) ? (f.screenshots ?? null) : screenshots,
    'featured-on-agencies-page': f['featured-on-agencies-page'] ?? false,
    'display-order': f['display-order'] ?? null,
  })
}

export function blogPostItem(page: BlogPostPage, base: WfItem | undefined, dicts: Dictionaries): WfItem {
  const f = base?.fieldData ?? {}
  const baseDate = typeof f['publication-date'] === 'string' ? (f['publication-date'] as string) : undefined
  return item(base, {
    slug: page.slug,
    name: page.name,
    'short-description': page.description,
    author: page.author ? dicts.authors.id(page.author) : null,
    category: page.category
      ? dicts.blogCategories.id(page.category.name, {
          'label-color': page.category.labelColor ?? null,
          'text-color': page.category.textColor ?? null,
        })
      : null,
    // the page shows the day only: the base export's time is kept when the day is the same
    'publication-date':
      page.date === undefined ? null : baseDate?.startsWith(page.date) ? baseDate : `${page.date}T00:00:00.000Z`,
    thumbnail: image(f.thumbnail, page.thumbnail),
    content: sameRichText(f.content, page.content) ? f.content : page.content,
    featured: f.featured ?? false,
  })
}

/** Card links of a list page to the card image's address (`/case-studies` shows each case study's thumbnail). */
export function listThumbnails(html: string): Map<string, string> {
  const tree = fromHtml(html)
  const out = new Map<string, string>()
  for (const card of findAll(tree, (e) => hasClass(e, 'case-list_card'))) {
    const link = find(card, (e) => e.tagName === 'a' && typeof e.properties?.href === 'string')
    const img = imageOf(find(card, (e) => e.tagName === 'img'))
    if (link && img) out.set(String(link.properties.href), img.url)
  }
  return out
}

/** The `<loc>` paths of a sitemap under a prefix. */
export function sitemapPaths(xml: string, prefix: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => new URL(m[1]!).pathname)
    .filter((p) => p.startsWith(prefix) && p.length > prefix.length)
}

export interface FromSiteOptions {
  /** The earlier export the items are written over. */
  base: string
  dir: string
  origin: string
  fetch?: typeof fetch
  log?: (line: string) => void
}

export interface FromSiteResult {
  /** Per collection: items read from the site, of them new (not in the base), and base items the site does not list. */
  counts: Record<PublishedSlug, { read: number; added: string[]; unlisted: number }>
  /** Dictionary items the base export does not hold, per Webflow collection slug. */
  added: Record<string, string[]>
}

export async function exportFromSite(opts: FromSiteOptions): Promise<FromSiteResult> {
  const f = opts.fetch ?? fetch
  const log = opts.log ?? (() => {})
  if (existsSync(opts.dir) && readdirSync(opts.dir).length > 0)
    throw new ExportError(`${opts.dir} already holds files; give an empty or new directory`)
  const base = readExport(opts.base)
  const get = async (path: string): Promise<string> => {
    const url = `${opts.origin}${path}`
    const res = await f(url, { headers: { 'user-agent': PUBLISHED_USER_AGENT }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new PublishedPageError(`${url}: HTTP ${res.status}`)
    return res.text()
  }
  const items = (slug: string) => {
    const c = base.collections.get(slug)
    if (!c) throw new ExportError(`${opts.base}: no collection ${slug}`)
    return c.items
  }
  const dicts: Dictionaries = {
    caseCategories: new Dictionary(items('case-studies-categories'), 'name'),
    partners: new Dictionary(items('certified-partners'), 'name', false),
    authors: new Dictionary(items('blog-authors'), 'name'),
    blogCategories: new Dictionary(items('blog-categories'), 'name'),
  }
  const sitemap = await get('/sitemap.xml')
  const thumbnails = listThumbnails(await get('/case-studies'))
  const limit = pLimit(4)
  const result: FromSiteResult = {
    counts: {
      'blog-posts': { read: 0, added: [], unlisted: 0 },
      'case-studies': { read: 0, added: [], unlisted: 0 },
    },
    added: {},
  }
  const written = new Map<string, WfItem[]>()
  for (const [prefix, slug] of Object.entries(PUBLISHED_COLLECTIONS) as [string, PublishedSlug][]) {
    const baseItems = items(slug)
    const bySlug = new Map(baseItems.map((i) => [String(i.fieldData.slug ?? ''), i]))
    const paths = sitemapPaths(sitemap, prefix)
    const read = await Promise.all(
      paths.map((path) =>
        limit(async () => {
          const html = await get(path)
          const url = `${opts.origin}${path}`
          if (slug === 'case-studies') {
            const page = readCaseStudyPage(html, url)
            return caseStudyItem(page, bySlug.get(page.slug), dicts, thumbnails.get(path), url)
          }
          const page = readBlogPostPage(html, url)
          return blogPostItem(page, bySlug.get(page.slug), dicts)
        }),
      ),
    )
    const readSlugs = new Set(read.map((i) => String(i.fieldData.slug)))
    // base items the sitemap does not list (drafts, archived) stay as they were, in their place
    const kept = baseItems.filter((i) => !readSlugs.has(String(i.fieldData.slug ?? '')))
    const merged = [
      ...baseItems.map((b) => read.find((r) => r.fieldData.slug === b.fieldData.slug) ?? b),
      ...read.filter((r) => !bySlug.has(String(r.fieldData.slug))),
    ]
    written.set(slug, merged)
    result.counts[slug] = {
      read: read.length,
      added: read.filter((r) => !bySlug.has(String(r.fieldData.slug))).map((r) => String(r.fieldData.slug)),
      unlisted: kept.length,
    }
    log(
      `${slug}: ${read.length} pages read, ${result.counts[slug].added.length} new, ${kept.length} kept from the base`,
    )
  }
  cpSync(opts.base, opts.dir, { recursive: true, filter: (src) => !/(^|\/)\._/.test(src) })
  for (const [slug, d] of [
    ['case-studies-categories', dicts.caseCategories],
    ['blog-authors', dicts.authors],
    ['blog-categories', dicts.blogCategories],
  ] as const) {
    if (d.added.length === 0) continue
    written.set(slug, d.items)
    result.added[slug] = d.added
    log(`${slug}: new on the site: ${d.added.join(', ')}`)
  }
  for (const [slug, list] of written)
    writeFileSync(join(opts.dir, 'webflow-raw', `items_${slug}.json`), JSON.stringify(list, null, 2) + '\n')
  writeFileSync(join(opts.dir, 'webflow-raw', 'sitemap.xml'), sitemap)
  return result
}
