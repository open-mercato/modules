// What the main site does to the HTML of a Markdown body (spec docs/specs/2026-11-24-www-site-migration.md, Phase 3),
// as a hast plugin of Astro's Markdown processor (satteri), registered by the om-www-body integration of
// www/astro.config.ts:
// - a `<lite-video id title>` the importer wrote for a YouTube iframe becomes the VideoEmbed markup: a link to the
//   video that works without JavaScript, which www/src/scripts/video-embed.ts turns into a youtube-nocookie.com player
//   on click, so nothing loads from YouTube before the reader asks for it;
// - a link to a post that is a draft or does not exist renders as its text (D6: a draft is never linked) with a build
//   warning;
// - a link to a page of the main site this build does not serve yet (it is still on Webflow until the switch, step C8)
//   points at the live site, https://www.openmercato.com/<path>, instead of a 404 of the preview;
// - a table sits in a scrollable, focusable region, so a wide one never widens the page.
// Isomorphic: no Node APIs; the shapes below are the subset of hast the plugin reads.

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** The address of a video's player: youtube-nocookie.com, starting at once (it loads on a click). */
export function videoPlayerSrc(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`
}

/** The address of a video on YouTube: where the link goes without JavaScript. */
export function videoWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

/** The label of a video's link. */
export function videoLabel(title: string | undefined): string {
  return title ? `Play video: ${title}` : 'Play video'
}

interface HText {
  type: 'text'
  value: string
}
interface HElement {
  type: 'element'
  tagName: string
  properties: Record<string, unknown>
  children: HNode[]
}
interface HRaw {
  type: 'raw'
  value: string
}
type HNode = HText | HElement | HRaw | { type: string; value?: string; tagName?: string; children?: HNode[] }

/** The VideoEmbed markup of a video (the same as www/src/components/blog/VideoEmbed.astro writes). */
export function videoEmbedNode(id: string, title: string | undefined): HElement {
  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: ['video-embed'], dataVideoId: id, dataVideoTitle: title ?? '' },
    children: [
      {
        type: 'element',
        tagName: 'a',
        properties: { className: ['video-embed__link'], href: videoWatchUrl(id) },
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['video-embed__icon'], ariaHidden: 'true' },
            children: [],
          },
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['video-embed__label'] },
            children: [{ type: 'text', value: videoLabel(title) }],
          },
        ],
      },
    ],
  }
}

const ATTR = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g

/** The id and title of a raw `<lite-video id="..." title="...">` opening tag; undefined for any other raw HTML. */
export function liteVideo(raw: string): { id: string; title?: string } | undefined {
  const m = /^\s*<lite-video\b([^>]*)>\s*(?:<\/lite-video>\s*)?$/.exec(raw)
  if (!m) return undefined
  const attrs = new Map<string, string>()
  for (const a of m[1]!.matchAll(ATTR)) attrs.set(a[1]!.toLowerCase(), decodeEntities(a[2]!))
  const id = attrs.get('id')
  if (!id || !YOUTUBE_ID.test(id)) return undefined
  const title = attrs.get('title')?.trim()
  return title ? { id, title } : { id }
}

const isLiteVideoClose = (raw: string): boolean => /^\s*<\/lite-video>\s*$/.test(raw)

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export interface LinkRules {
  /** The origin of the main site, https://www.openmercato.com. */
  origin: string
  /** Slugs of the published posts: the only posts a body may link. */
  posts: ReadonlySet<string>
  /** Whether this build serves a site path (other than a post's). */
  serves(path: string): boolean
}

export type LinkAction = { kind: 'keep' } | { kind: 'live'; href: string } | { kind: 'text'; why: string }

/** What happens to a link of a body: kept, pointed at the live site, or rendered as its text. */
export function linkAction(href: string, rules: LinkRules): LinkAction {
  if (!href.startsWith('/') || href.startsWith('//')) return { kind: 'keep' }
  const path = href.replace(/[?#].*$/, '').replace(/(?<=.)\/$/, '')
  const post = /^\/blog-posts\/([^/]+)$/.exec(path)
  if (post) {
    if (rules.posts.has(post[1]!)) return { kind: 'keep' }
    return { kind: 'text', why: `${href} is not a published post` }
  }
  if (rules.serves(path)) return { kind: 'keep' }
  return { kind: 'live', href: `${rules.origin}${href}` }
}

/** The part of satteri's hast visitor context the plugin uses. */
export interface BodyCtx {
  replaceNode(node: unknown, newNode: unknown): void
  removeNode(node: unknown): void
  setProperty(node: unknown, key: string, value: unknown): void
  wrapNode(node: unknown, parent: { raw: string }): void
  textContent(node: unknown): string
  parent(node: unknown): unknown
  readonly fileURL: URL | undefined
}

/** A raw node of a lite-video tag, alone in its paragraph (whitespace aside), or undefined. */
function videoParagraph(p: HElement): { id: string; title?: string } | undefined {
  const parts = p.children.filter((c) => !(c.type === 'text' && (c.value ?? '').trim() === ''))
  if (parts.length < 1 || parts.length > 2 || parts[0]!.type !== 'raw') return undefined
  if (parts.length === 2 && !(parts[1]!.type === 'raw' && isLiteVideoClose(parts[1]!.value ?? ''))) return undefined
  return liteVideo(parts[0]!.value ?? '')
}

/** The hast plugin. `warn` hears every link rendered as text. */
export function bodyHtmlPlugin(rules: LinkRules, warn: (message: string) => void) {
  return {
    name: 'om-www-body',
    element: {
      filter: ['a', 'table', 'img'],
      visit(node: HElement, ctx: BodyCtx): void {
        if (node.tagName === 'table') {
          ctx.wrapNode(node, { raw: '<div class="prose-table" role="region" aria-label="Table" tabindex="0"></div>' })
          return
        }
        if (node.tagName === 'img') {
          ctx.setProperty(node, 'loading', 'lazy')
          ctx.setProperty(node, 'decoding', 'async')
          return
        }
        const href = node.properties.href
        if (typeof href !== 'string') return
        const action = linkAction(href, rules)
        if (action.kind === 'live') ctx.setProperty(node, 'href', action.href)
        else if (action.kind === 'text') {
          const file = ctx.fileURL ? ctx.fileURL.pathname.replace(/^.*\/www\//, 'www/') : 'a Markdown body'
          warn(`${file}: ${action.why}; the link renders as text`)
          ctx.replaceNode(node, { type: 'text', value: ctx.textContent(node) })
        }
      },
    },
    // a lite-video alone in its paragraph replaces the paragraph (a figure cannot sit in a p); elsewhere (inside a list
    // item, say) it replaces the tag pair
    raw(node: HRaw, ctx: BodyCtx): void {
      const v = liteVideo(node.value)
      if (v) {
        const parent = ctx.parent(node) as HNode | undefined
        if (parent?.type === 'element' && parent.tagName === 'p' && videoParagraph(parent as HElement))
          ctx.replaceNode(parent, videoEmbedNode(v.id, v.title))
        else ctx.replaceNode(node, videoEmbedNode(v.id, v.title))
        return
      }
      if (!isLiteVideoClose(node.value)) return
      const parent = ctx.parent(node) as HNode | undefined
      // its paragraph is gone with the opening tag
      if (parent?.type === 'element' && parent.tagName === 'p' && videoParagraph(parent as HElement)) return
      ctx.removeNode(node)
    },
  }
}
