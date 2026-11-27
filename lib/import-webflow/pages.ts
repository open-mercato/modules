// Unique pages (spec API Contracts, "Unique pages"): `seo` from pages.json, then one `copy` block per DOM section with
// the page's text in DOM order. The Webflow DOM API returns a flat node list, so a section starts at each h1 or h2.
// Phase 6 replaces the copy blocks with typed blocks; until then a page keeps all its text, embeds included. A page of
// copy blocks is written as a draft: the schema refuses a copy block in a published page, so a page the importer
// writes is never built until a person has mapped it (the published pages of www/content/pages are edited files, which
// a later run reports as conflicts and leaves alone).
import { RESERVED_SEGMENTS, SLUG_RE } from '../schema/www-content.ts'
import { compact, ItemStop, ItemText, validate, type Entry, type RunCtx } from './context.ts'
import type { WfNode, WfPage } from './export.ts'
import { words } from './landing.ts'
import { ConvertError, htmlTextNodes, htmlToText, imageMarkdown, parseFragment, textParagraphs } from './richtext.ts'

/** The slug of a static page; Webflow's home page has none. */
export function pageSlug(page: WfPage): string {
  return page.slug || 'home'
}

/** Why a static page is not a `pages` entry, or undefined when it is one. */
export function pageSkipReason(page: WfPage): string | undefined {
  const slug = pageSlug(page)
  if (page.collectionId) return 'a collection template'
  if (page.archived) return 'archived in Webflow'
  if (page.draft) return 'a draft page in Webflow'
  if (slug === '401' || slug === '404') return 'a system page; the build writes its own 404'
  if ((RESERVED_SEGMENTS as readonly string[]).includes(slug))
    return `/${slug} is a reserved route (a list route or a redirect)`
  if (!SLUG_RE.test(slug)) return `the slug "${slug}" is not a slug`
  return undefined
}

interface Block {
  type: 'copy'
  markdown: string
  webflowNode: string
}

const WF_INHERIT = '__wf_reserved_inherit'

/** One `pages` entry from a static page's DOM nodes; `lines` is its visible text for the coverage figure. */
export function pageEntry(
  ctx: RunCtx,
  page: WfPage,
  nodes: readonly WfNode[],
  lines: readonly string[] | undefined,
): Entry {
  const slug = pageSlug(page)
  const item = `pages/${slug}`
  const t = new ItemText(ctx, item, 'pages', true)
  const description = page.seo?.description?.trim()
  if (!description)
    throw new ItemStop('no SEO description in Webflow (the schema requires one; write it in the content PR)')
  const ogUrl =
    page.openGraph?.imageUrl ??
    (page.openGraph?.imageAssetId ? ctx.exp.assets.get(page.openGraph.imageAssetId)?.hostedUrl : undefined)
  const seo = compact({
    title: t.text(page.seo?.title?.trim() || page.title?.trim() || slug),
    description: t.text(description),
    ogImage: ogUrl ? t.media(ogUrl) : undefined,
  })

  const blocks: Block[] = []
  let current: { parts: string[]; node: string } | undefined
  const plain: string[] = []
  const flush = () => {
    if (current && current.parts.length > 0)
      blocks.push({ type: 'copy', markdown: current.parts.join('\n\n'), webflowNode: current.node })
    current = undefined
  }
  const push = (node: string, md: string, startsSection: boolean) => {
    if (!md.trim()) return
    if (startsSection) flush()
    current ??= { parts: [], node }
    current.parts.push(md.trim())
  }
  let embeds = 0
  for (const n of nodes) {
    if (n.type === 'text') {
      const html = (n as { text: { html: string } }).text.html
      const top = parseFragment(html)[0]?.tagName
      let md: string
      try {
        md = t.markdown(html, 'lenient')
      } catch (err) {
        if (!(err instanceof ConvertError)) throw err
        // the copy block keeps the text; the structure is Phase 6's job
        md = textParagraphs(htmlTextNodes(html).map((x) => t.text(x)))
        t.note(`node ${n.id}: ${err.message}; kept as plain text`)
      }
      plain.push(htmlToText(html))
      push(n.id, md, top === 'h1' || top === 'h2')
    } else if (n.type === 'image') {
      const img = (n as { image: { alt: string | null; assetId: string | null } }).image
      const asset = img.assetId ? ctx.exp.assets.get(img.assetId) : undefined
      if (!asset) {
        t.note(`image ${n.id}: the asset ${img.assetId} is not in assets.json`)
        continue
      }
      const alt = img.alt && img.alt !== WF_INHERIT ? img.alt : (asset.altText ?? '')
      push(n.id, imageMarkdown(t.media(asset.hostedUrl), t.text(alt)), false)
    } else if (n.type === 'html-embed') {
      // a legacy embed (Q4): its visible text is kept, its markup and scripts are left to Phase 6
      const html = String((n as { html: string }).html)
      const text = htmlTextNodes(html)
      embeds++
      if (text.length > 0) {
        push(n.id, textParagraphs(text.map((x) => t.text(x))), false)
        plain.push(text.join(' '))
      }
    }
  }
  flush()
  if (embeds > 0) t.note(`${embeds} embed(s): text kept in copy blocks, markup and scripts left for Phase 6 (Q4)`)
  if (lines) {
    const have = new Map<string, number>()
    for (const w of words(plain.join(' '))) have.set(w, (have.get(w) ?? 0) + 1)
    let missing = 0
    const all = words(lines.join(' '))
    for (const w of all) {
      const n = have.get(w) ?? 0
      if (n > 0) have.set(w, n - 1)
      else missing++
    }
    ctx.report.coverage.push({ page: slug, words: all.length, missing })
  }
  const data = compact({ webflowId: page.id, seo, blocks, draft: true })
  const entry = validate(ctx, { collection: 'pages', id: slug, webflowId: page.id, draft: true, data })
  t.commit()
  return entry
}
