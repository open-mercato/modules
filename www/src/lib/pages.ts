// The unique pages of the main site (spec docs/specs/2026-11-24-www-site-migration.md, Phase 6): which `pages` entries
// the site routes and where, the entries that hold the copy of a list route (LIST_PAGE_SLUGS), and the JSON-LD of a
// page, computed from its content (spec SEO). A draft is never routed (D6). Isomorphic.
import type { z } from 'zod'
import { fillCounts, type CountValues } from '../../../lib/core/www-tokens.ts'
import {
  HOME_PAGE_SLUG,
  LIST_PAGE_SLUGS,
  type PageBlockData,
  type pageSchema,
} from '../../../lib/schema/www-content.ts'
import { plainText } from './landings.ts'

/** A pages entry: its id (the slug) and its data after the schema. */
export interface PageEntry {
  id: string
  data: z.output<ReturnType<typeof pageSchema>>
}

/** The site path of a pages entry: `/` for the home page, else `/<slug>` in the namespace shared with the landings. */
export const pagePath = (slug: string): string => (slug === HOME_PAGE_SLUG ? '/' : `/${slug}`)

/** True for an entry that holds the copy of a list route of its own rather than routing at `/<slug>`. */
export const isListPage = (slug: string): boolean => (LIST_PAGE_SLUGS as readonly string[]).includes(slug)

/** The entries routed at `/<slug>` by the root route: every published one but the home page and the list pages. */
export function routedPages<T extends PageEntry>(entries: readonly T[]): T[] {
  return entries
    .filter((e) => !e.data.draft && e.id !== HOME_PAGE_SLUG && !isListPage(e.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * The OG card the build draws for a routed page without an OG image of its own (/og/<slug>.png, like a landing's):
 * the eyebrow and title of its first hero block, else "Open Mercato" and the SEO title without the site's suffix.
 */
export function pageOgCard(entry: PageEntry): { eyebrow: string; title: string } | undefined {
  if (entry.data.seo.ogImage !== undefined) return undefined
  const hero = entry.data.blocks.find((b) => b.type === 'hero')
  return {
    eyebrow: (hero?.eyebrow ?? 'Open Mercato').trim(),
    title: (hero && 'title' in hero
      ? String(hero.title)
      : entry.data.seo.title.replace(/\s*\|\s*Open Mercato$/, '')
    ).trim(),
  }
}

/** The OG image of a page: its own, or the card the build draws (pageOgCard). */
export function pageOgImage(entry: PageEntry): string | undefined {
  return entry.data.seo.ogImage ?? (pageOgCard(entry) ? `/og/${entry.id}.png` : undefined)
}

/** The published entry `slug`; a build fails without it (the home page and the list pages read theirs). */
export function pageEntry<T extends PageEntry>(entries: readonly T[], slug: string): T {
  const e = entries.find((p) => p.id === slug)
  if (!e) throw new Error(`www/content/pages/${slug}.yaml: the page is missing`)
  if (e.data.draft) throw new Error(`www/content/pages/${slug}.yaml: the page is a draft`)
  return e
}

/** The first block of a type, by its data. */
function first<T extends PageBlockData['type']>(
  blocks: readonly PageBlockData[],
  type: T,
): Extract<PageBlockData, { type: T }> | undefined {
  return blocks.find((b) => b.type === type) as Extract<PageBlockData, { type: T }> | undefined
}

/** The text of a field as the page prints it: count tokens filled, Markdown marks dropped. */
const text = (s: string, counts: CountValues): string => fillCounts(plainText(s), counts)

/**
 * The JSON-LD of a page (spec SEO), from its content: the page's own type with its name, description, address and
 * language (a HowTo with the items of its first `steps` block as steps), then FAQPage with the questions of its `faq`
 * blocks and of `jsonLd.faq`. The site-wide Organization and WebSite come from the Base layout. Undefined when the
 * page asks for none and shows no FAQ.
 */
export function pageJsonLd(entry: PageEntry, site: string, counts: CountValues): Record<string, unknown> | undefined {
  const d = entry.data
  const url = new URL(pagePath(entry.id), site).toString()
  const graph: Record<string, unknown>[] = []
  if (d.jsonLd) {
    const node: Record<string, unknown> = {
      '@type': d.jsonLd.type,
      name: text(d.seo.title, counts),
      description: text(d.seo.description, counts),
      url,
      inLanguage: 'en',
    }
    if (d.jsonLd.type === 'SoftwareApplication') {
      Object.assign(node, {
        name: 'Open Mercato',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      })
    }
    const steps = d.jsonLd.type === 'HowTo' ? first(d.blocks, 'steps') : undefined
    if (steps)
      node.step = steps.items.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: text(s.title ?? s.eyebrow ?? `Step ${i + 1}`, counts),
        ...(s.body ? { text: text(s.body, counts) } : {}),
      }))
    graph.push(node)
  }
  const faq = [...d.blocks.flatMap((b) => (b.type === 'faq' ? b.items : [])), ...(d.jsonLd?.faq ?? [])]
  if (faq.length > 0)
    graph.push({
      '@type': 'FAQPage',
      url,
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: text(f.question, counts),
        acceptedAnswer: { '@type': 'Answer', text: text(f.answer, counts) },
      })),
    })
  if (graph.length === 0) return undefined
  return { '@context': 'https://schema.org', '@graph': graph }
}

/** The data of one block type. */
export type BlockOf<T extends PageBlockData['type']> = Extract<PageBlockData, { type: T }>

/** What every layout component of www/src/components/blocks/ receives. */
export interface BlockProps<T extends PageBlockData['type'] = PageBlockData['type']> {
  block: BlockOf<T>
  counts: CountValues
  /** The slug of the page the block belongs to. */
  page: string
}

/** The component file name that renders a block: its `layout`, else its type; a legacy block's `component`. */
export function blockComponent(b: PageBlockData): { dir: 'blocks' | 'legacy'; name: string } {
  if (b.type === 'legacy') return { dir: 'legacy', name: b.component }
  if (b.type === 'copy') throw new Error('a copy block has no component: map it to typed blocks (spec Phase 6)')
  return { dir: 'blocks', name: b.layout ?? b.type }
}

/**
 * The copy of a list route (LIST_PAGE_SLUGS: /blog, /case-studies, /certified-partners) from its pages entry: its
 * `seo` and its one `hero` block (the breadcrumb's name as `eyebrow`, the heading, the lead, the buttons). The route
 * keeps its own markup and lists the collection itself.
 */
export function listPageCopy(
  entries: readonly PageEntry[],
  slug: string,
): { seo: PageEntry['data']['seo']; hero: BlockOf<'hero'> } {
  const e = pageEntry(entries, slug)
  const hero = first(e.data.blocks, 'hero')
  if (!hero || e.data.blocks.length !== 1)
    throw new Error(`www/content/pages/${slug}.yaml: a list page holds exactly one hero block`)
  return { seo: e.data.seo, hero }
}

/**
 * The items of a block, each with the fields a layout needs (optional in the schema, which every layout shares). A
 * missing one stops the build naming the page, the layout and the item, instead of a bare TypeError or a link to
 * `undefined`.
 */
export function itemsWith<I extends object, K extends keyof I>(
  where: { page: string; layout?: string },
  items: readonly I[],
  fields: readonly K[],
): (I & Required<Pick<I, K>>)[] {
  items.forEach((item, i) => {
    const missing = fields.filter((f) => item[f] === undefined)
    if (missing.length > 0)
      throw new Error(
        `www/content/pages/${where.page}.yaml ${where.layout ?? 'block'} items.${i}: needs ${missing.join(', ')}`,
      )
  })
  return items as (I & Required<Pick<I, K>>)[]
}
