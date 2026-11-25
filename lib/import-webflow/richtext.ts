// Webflow rich text (HTML) to Markdown on a syntax tree, never by regular expressions (spec API Contracts, "Rich text
// to Markdown"). HTML is parsed with hast-util-from-html, mapped element by element to mdast, and written with
// mdast-util-to-markdown (GFM tables through mdast-util-gfm-table). An element without a rule stops the conversion with
// its path, so nothing is dropped silently. Node only through the importer; the module itself has no Node APIs.
import type { Element, ElementContent, Root as HastRoot, RootContent as HastContent } from 'hast'
import type {
  BlockContent,
  Code,
  Heading,
  Html,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root as MdRoot,
  RootContent as MdContent,
  Table,
  TableCell,
  TableRow,
} from 'mdast'
import { fromHtml } from 'hast-util-from-html'
import { toMarkdown } from 'mdast-util-to-markdown'
import { gfmTableToMarkdown } from 'mdast-util-gfm-table'

/** How the converter rewrites what it meets; every hook is optional. */
export interface ConvertHooks {
  /** A text value of the page; `code` is true inside `code` and `pre`. Returns the text to write. */
  text?: (value: string, ctx: { code: boolean }) => string
  /** The `href` of a link; returns the target to write. */
  link?: (href: string) => string
  /** The `src` of an image; returns the path to write. */
  image?: (src: string) => string
}

/**
 * `strict` (CMS rich text): only the elements of the contract. `lenient` (the copy blocks of unique pages): layout
 * elements (`div`, `span`, `section` and the like) are transparent and their text is kept; scripts and styles still
 * stop the conversion.
 */
export type ConvertMode = 'strict' | 'lenient'

export class ConvertError extends Error {
  /** Path of the element in the tree, like `body > figure[3] > div > video`. */
  readonly path: string
  constructor(message: string, path: string) {
    super(`${message} at ${path}`)
    this.path = path
  }
}

/** YouTube hosts an iframe may load from; anything else stops the conversion. */
const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'])

/** Elements a lenient conversion walks through as if they were not there. */
const LAYOUT = new Set([
  'div',
  'span',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'nav',
  'aside',
  'label',
  'small',
  'sup',
  'sub',
  'u',
  'mark',
  'time',
  'abbr',
  'cite',
  'picture',
  'source',
  'details',
  'summary',
  'button',
])

/** Elements no rule keeps: they stop the conversion in either mode. */
const NEVER = new Set(['script', 'style', 'noscript', 'object', 'embed', 'form', 'input', 'select', 'textarea'])

/** Block elements whose content an inline conversion takes when one of them is the whole fragment. */
const UNWRAP = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'figcaption', 'div'])

const PHRASING = new Set(['a', 'strong', 'b', 'em', 'i', 'code', 'br', 'img', 'span'])

interface Ctx {
  hooks: ConvertHooks
  mode: ConvertMode
}

/** Converts a fragment of HTML to Markdown (no trailing newline). Throws ConvertError on an element without a rule. */
export function htmlToMarkdown(html: string, hooks: ConvertHooks = {}, mode: ConvertMode = 'strict'): string {
  return mdastToMarkdown(htmlToMdast(html, hooks, mode))
}

/** Converts inline HTML (the content of one `p`, a title) to one line of Markdown. */
export function inlineHtmlToMarkdown(html: string, hooks: ConvertHooks = {}, mode: ConvertMode = 'strict'): string {
  const tree = fromHtml(html, { fragment: true })
  const ctx: Ctx = { hooks, mode }
  let children = tree.children.filter((c): c is ElementContent => c.type !== 'doctype')
  // a whole block node (`<p class="…">…</p>`, a heading) gives its content
  const top = children.filter((c) => !isBlank(c))
  if (top.length === 1 && isElement(top[0]!) && UNWRAP.has(top[0]!.tagName)) children = top[0]!.children
  const nodes = tidyInline(phrasing(children, ctx, 'body', false))
  return mdastToMarkdown({ type: 'root', children: [{ type: 'paragraph', children: nodes }] })
}

/** Writes an mdast tree with the options of this repository: `-` bullets, `_` emphasis, fenced code, GFM tables. */
export function mdastToMarkdown(tree: MdRoot): string {
  return toMarkdown(tree, {
    bullet: '-',
    emphasis: '_',
    strong: '*',
    fence: '`',
    fences: true,
    rule: '-',
    listItemIndent: 'one',
    incrementListMarker: true,
    extensions: [gfmTableToMarkdown()],
  }).replace(/\n+$/, '')
}

export function htmlToMdast(html: string, hooks: ConvertHooks = {}, mode: ConvertMode = 'strict'): MdRoot {
  const tree: HastRoot = fromHtml(html, { fragment: true })
  const ctx: Ctx = { hooks, mode }
  return { type: 'root', children: blocks(tree.children, ctx, 'body') as MdContent[] }
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks

function isElement(n: HastContent | ElementContent): n is Element {
  return n.type === 'element'
}

function isBlank(n: HastContent | ElementContent): boolean {
  return n.type === 'comment' || n.type === 'doctype' || (n.type === 'text' && n.value.trim() === '')
}

function childPath(parent: string, el: Element, index: number): string {
  return `${parent} > ${el.tagName}[${index}]`
}

/** Block content of a parent: runs of phrasing content become paragraphs. */
function blocks(children: (HastContent | ElementContent)[], ctx: Ctx, path: string): BlockContent[] {
  const out: BlockContent[] = []
  let run: (HastContent | ElementContent)[] = []
  const flush = () => {
    if (run.length === 0) return
    const inline = tidyInline(phrasing(run as ElementContent[], ctx, path, false))
    if (inline.length > 0) out.push({ type: 'paragraph', children: inline })
    run = []
  }
  children.forEach((n, i) => {
    if (isElement(n) && !isPhrasingElement(n, ctx)) {
      flush()
      out.push(...block(n, ctx, childPath(path, n, i)))
    } else if (n.type === 'text' || isElement(n)) run.push(n)
  })
  flush()
  return out
}

function isPhrasingElement(el: Element, ctx: Ctx): boolean {
  if (PHRASING.has(el.tagName)) return el.tagName !== 'span' || ctx.mode === 'lenient'
  return (
    ctx.mode === 'lenient' && LAYOUT.has(el.tagName) && el.children.every((c) => !isElement(c) || isPhrasing(c, ctx))
  )
}

function isPhrasing(el: Element, ctx: Ctx): boolean {
  return isPhrasingElement(el, ctx) && el.children.every((c) => !isElement(c) || isPhrasing(c, ctx))
}

function block(el: Element, ctx: Ctx, path: string): BlockContent[] {
  const tag = el.tagName
  switch (tag) {
    case 'p': {
      const inline = tidyInline(phrasing(el.children, ctx, path, false))
      return inline.length > 0 ? [{ type: 'paragraph', children: inline }] : []
    }
    case 'h1':
      if (ctx.mode === 'strict') throw new ConvertError('h1 has no rule in rich text', path)
      return heading(el, 1, ctx, path)
    case 'h2':
    case 'h3':
    case 'h4':
      return heading(el, Number(tag.slice(1)) as 2 | 3 | 4, ctx, path)
    case 'h5':
    case 'h6':
      if (ctx.mode === 'strict') throw new ConvertError(`${tag} has no rule in rich text`, path)
      return heading(el, 4, ctx, path)
    case 'ul':
    case 'ol':
      return [list(el, ctx, path)]
    case 'blockquote': {
      const inner = blocks(el.children, ctx, path)
      return inner.length > 0 ? [{ type: 'blockquote', children: inner }] : []
    }
    case 'pre':
      return [code(el, ctx, path)]
    case 'hr':
      return [{ type: 'thematicBreak' }]
    case 'figure':
      return figure(el, ctx, path)
    case 'table':
      return [table(el, ctx, path)]
    case 'iframe':
      return [video(el, path)]
    case 'div':
      return blocks(el.children, ctx, path)
    default:
      if (NEVER.has(tag)) throw new ConvertError(`<${tag}> has no rule`, path)
      if (ctx.mode === 'lenient' && (LAYOUT.has(tag) || tag === 'li' || tag === 'figcaption'))
        return blocks(el.children, ctx, path)
      throw new ConvertError(`<${tag}> has no rule`, path)
  }
}

function heading(el: Element, depth: 1 | 2 | 3 | 4, ctx: Ctx, path: string): Heading[] {
  const inline = tidyInline(phrasing(el.children, ctx, path, false))
  return inline.length > 0 ? [{ type: 'heading', depth, children: inline }] : []
}

function list(el: Element, ctx: Ctx, path: string): List {
  const items: ListItem[] = []
  el.children.forEach((c, i) => {
    if (isBlank(c)) return
    if (!isElement(c) || c.tagName !== 'li') throw new ConvertError(`a list holds <${describe(c)}>`, path)
    const p = childPath(path, c, i)
    const children = blocks(c.children, ctx, p)
    items.push({ type: 'listItem', spread: false, children: children.length > 0 ? children : [] })
  })
  return { type: 'list', ordered: el.tagName === 'ol', spread: false, children: items }
}

function describe(n: HastContent | ElementContent): string {
  return isElement(n) ? n.tagName : n.type
}

function code(el: Element, ctx: Ctx, path: string): Code {
  // `pre > code` (Webflow) or a bare `pre`; the language comes from a `language-x` or `lang-x` class when present
  const inner = el.children.filter((c) => !isBlank(c))
  const codeEl = inner.length === 1 && isElement(inner[0]!) && inner[0]!.tagName === 'code' ? inner[0]! : undefined
  const source = codeEl ?? el
  let lang: string | null = null
  for (const c of [...classes(source), ...classes(el)]) {
    const m = /^(?:language|lang)-([A-Za-z0-9_+-]+)$/.exec(c)
    if (m) {
      lang = m[1]!.toLowerCase()
      break
    }
  }
  const value = textContent(source, path)
  return { type: 'code', lang, value: transform(ctx, value.replace(/\n$/, ''), true) }
}

function classes(el: Element): string[] {
  const c = el.properties?.className
  return Array.isArray(c) ? c.map(String) : typeof c === 'string' ? (c as string).split(/\s+/) : []
}

/** Text of a subtree that may hold only text and `br` (code, plain fields). */
function textContent(el: Element, path: string): string {
  let s = ''
  for (const c of el.children) {
    if (c.type === 'text') s += c.value
    else if (isElement(c) && c.tagName === 'br') s += '\n'
    else if (isElement(c) && (c.tagName === 'span' || c.tagName === 'code')) s += textContent(c, path)
    else if (isElement(c)) throw new ConvertError(`<${c.tagName}> inside code has no rule`, path)
  }
  return s
}

function figure(el: Element, ctx: Ctx, path: string): BlockContent[] {
  let img: Element | undefined
  let iframe: Element | undefined
  let caption: Element | undefined
  const visit = (node: Element, p: string) => {
    node.children.forEach((c, i) => {
      if (isBlank(c)) return
      if (!isElement(c)) throw new ConvertError('a figure holds text outside its caption', p)
      const cp = childPath(p, c, i)
      if (c.tagName === 'div' || (c.tagName === 'a' && ctx.mode === 'lenient')) visit(c, cp)
      else if (c.tagName === 'img' && !img) img = c
      else if (c.tagName === 'iframe' && !iframe) iframe = c
      else if (c.tagName === 'figcaption' && !caption) caption = c
      else throw new ConvertError(`a figure holds <${c.tagName}>`, cp)
    })
  }
  visit(el, path)
  if (iframe && !img) {
    const v = video(iframe, path)
    return caption ? [v, ...captionParagraph(caption, ctx, path)] : [v]
  }
  if (!img || iframe) throw new ConvertError('a figure without exactly one image or video', path)
  const src = String(img.properties?.src ?? '')
  if (!src) throw new ConvertError('an image without src', path)
  const alt = transform(ctx, altOf(img), false)
  const width = dimension(img.properties?.width)
  const height = dimension(img.properties?.height)
  const capHtml = caption ? sanitizedHtml(caption.children, ctx, path) : ''
  // a figure with a caption or a size stays HTML, the one Markdown form that keeps both (Image width and height come
  // from the rich text attributes when present); a bare figure becomes a Markdown image
  if (!capHtml && width === undefined && height === undefined) {
    return [{ type: 'paragraph', children: [{ type: 'image', url: image(ctx, src), alt }] }]
  }
  const attrs = [
    `src="${escapeAttr(image(ctx, src))}"`,
    `alt="${escapeAttr(alt)}"`,
    width === undefined ? '' : `width="${width}"`,
    height === undefined ? '' : `height="${height}"`,
  ]
    .filter(Boolean)
    .join(' ')
  const html = `<figure><img ${attrs} />${capHtml ? `<figcaption>${capHtml}</figcaption>` : ''}</figure>`
  return [{ type: 'html', value: html } satisfies Html]
}

function captionParagraph(caption: Element, ctx: Ctx, path: string): Paragraph[] {
  const inline = tidyInline(phrasing(caption.children, ctx, path, false))
  return inline.length > 0 ? [{ type: 'paragraph', children: [{ type: 'emphasis', children: inline }] }] : []
}

/** Webflow writes `__wf_reserved_inherit` for an image whose alt it inherits from the asset; rich text has none. */
function altOf(img: Element): string {
  const alt = String(img.properties?.alt ?? '')
  return alt === '__wf_reserved_inherit' ? '' : alt
}

function dimension(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** A YouTube iframe as `<lite-video id="…">`, rendered by the video component (click to load, youtube-nocookie.com). */
function video(el: Element, path: string): Html {
  const src = String(el.properties?.src ?? '')
  const id = youTubeId(src)
  if (id === undefined) throw new ConvertError(`an iframe from ${hostOf(src) || 'an unknown host'} has no rule`, path)
  const title = String(el.properties?.title ?? '').trim()
  return { type: 'html', value: `<lite-video id="${id}"${title ? ` title="${escapeAttr(title)}"` : ''}></lite-video>` }
}

function hostOf(src: string): string {
  try {
    return new URL(src, 'https://x.invalid').host.replace(/^x\.invalid$/, '')
  } catch {
    return ''
  }
}

/** The video id of a YouTube embed or watch URL, or undefined for any other address. */
export function youTubeId(src: string): string | undefined {
  let url: URL
  try {
    url = new URL(src.startsWith('//') ? `https:${src}` : src)
  } catch {
    return undefined
  }
  let id: string | null | undefined
  if (url.host === 'youtu.be') id = url.pathname.slice(1)
  else if (YOUTUBE_HOSTS.has(url.host)) {
    const m = /^\/(?:embed|shorts|live)\/([^/]+)$/.exec(url.pathname)
    id = m ? m[1] : url.pathname === '/watch' ? url.searchParams.get('v') : undefined
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined
}

// ---------------------------------------------------------------------------------------------------------------
// Tables

/** A GFM table when every cell holds inline content only, else sanitized HTML (inline styles removed). */
function table(el: Element, ctx: Ctx, path: string): Table | Html {
  const rows: Element[] = []
  let headerRows = 0
  const collect = (node: Element, p: string) => {
    node.children.forEach((c, i) => {
      if (isBlank(c)) return
      if (!isElement(c)) throw new ConvertError('a table holds text outside its cells', p)
      const cp = childPath(p, c, i)
      if (c.tagName === 'thead' || c.tagName === 'tbody' || c.tagName === 'tfoot') {
        const before = rows.length
        collect(c, cp)
        if (c.tagName === 'thead') headerRows += rows.length - before
      } else if (c.tagName === 'tr') rows.push(c)
      else throw new ConvertError(`a table holds <${c.tagName}>`, cp)
    })
  }
  collect(el, path)
  const cells = rows.map((r, ri) =>
    r.children.filter(isElement).map((c, ci) => {
      if (c.tagName !== 'td' && c.tagName !== 'th')
        throw new ConvertError(`a table row holds <${c.tagName}>`, `${path} > tr[${ri}]`)
      return c
    }),
  )
  const spans = cells
    .flat()
    .some((c) => Number(c.properties?.colSpan ?? 1) > 1 || Number(c.properties?.rowSpan ?? 1) > 1)
  const inlineOnly = cells.flat().every((c) => c.children.every((x) => !isElement(x) || isGfmInline(x, ctx)))
  const width = Math.max(0, ...cells.map((r) => r.length))
  const headed = headerRows === 1 || (headerRows === 0 && cells[0]?.every((c) => c.tagName === 'th'))
  if (inlineOnly && !spans && headed && width > 0 && cells.every((r) => r.length === width)) {
    const mdRows: TableRow[] = cells.map((r) => ({
      type: 'tableRow',
      children: r.map((c): TableCell => ({
        type: 'tableCell',
        children: tidyInline(phrasing(c.children, ctx, path, false)),
      })),
    }))
    return { type: 'table', align: cells[0]!.map(() => null), children: mdRows }
  }
  return { type: 'html', value: `<table>${sanitizedHtml(el.children, ctx, path)}</table>` }
}

function isGfmInline(el: Element, ctx: Ctx): boolean {
  if (el.tagName === 'br' || el.tagName === 'img') return false
  return isPhrasing(el, ctx) && el.children.every((c) => !isElement(c) || isGfmInline(c, ctx))
}

const SANITIZED = new Set([
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'code',
  'br',
  'a',
])

/** HTML of the allowed elements with no attributes but `href`, `colspan` and `rowspan`; text escaped. */
function sanitizedHtml(children: ElementContent[], ctx: Ctx, path: string): string {
  let s = ''
  children.forEach((c, i) => {
    if (c.type === 'text') s += escapeText(transform(ctx, c.value, false))
    else if (isElement(c)) {
      const tag = c.tagName === 'b' ? 'strong' : c.tagName === 'i' ? 'em' : c.tagName
      const cp = childPath(path, c, i)
      if (tag === 'div' || tag === 'span') {
        s += sanitizedHtml(c.children, ctx, cp)
        return
      }
      if (!SANITIZED.has(tag)) throw new ConvertError(`<${c.tagName}> has no rule in a table or caption`, cp)
      const attrs: string[] = []
      if (tag === 'a') attrs.push(`href="${escapeAttr(link(ctx, String(c.properties?.href ?? '')))}"`)
      for (const [prop, name] of [
        ['colSpan', 'colspan'],
        ['rowSpan', 'rowspan'],
      ] as const) {
        const v = Number(c.properties?.[prop] ?? 1)
        if ((tag === 'td' || tag === 'th') && Number.isInteger(v) && v > 1) attrs.push(`${name}="${v}"`)
      }
      const open = `<${tag}${attrs.length > 0 ? ' ' + attrs.join(' ') : ''}>`
      s += tag === 'br' ? '<br />' : `${open}${sanitizedHtml(c.children, ctx, cp)}</${tag}>`
    }
  })
  return s
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------------------------------------------
// Phrasing

function transform(ctx: Ctx, value: string, code: boolean): string {
  return ctx.hooks.text ? ctx.hooks.text(value, { code }) : value
}

function link(ctx: Ctx, href: string): string {
  return ctx.hooks.link ? ctx.hooks.link(href) : href
}

function image(ctx: Ctx, src: string): string {
  return ctx.hooks.image ? ctx.hooks.image(src) : src
}

function phrasing(children: ElementContent[], ctx: Ctx, path: string, inLink: boolean): PhrasingContent[] {
  const out: PhrasingContent[] = []
  children.forEach((c, i) => {
    if (c.type === 'text') {
      out.push({ type: 'text', value: transform(ctx, c.value, false) })
      return
    }
    if (!isElement(c)) return
    const p = childPath(path, c, i)
    switch (c.tagName) {
      case 'strong':
      case 'b': {
        const inner = phrasing(c.children, ctx, p, inLink)
        if (inner.length > 0) out.push({ type: 'strong', children: inner })
        return
      }
      case 'em':
      case 'i': {
        const inner = phrasing(c.children, ctx, p, inLink)
        if (inner.length > 0) out.push({ type: 'emphasis', children: inner })
        return
      }
      case 'code':
        out.push({ type: 'inlineCode', value: transform(ctx, textContent(c, p), true) })
        return
      case 'br':
        out.push({ type: 'break' })
        return
      case 'a': {
        const href = String(c.properties?.href ?? '').trim()
        const inner = phrasing(c.children, ctx, p, true)
        if (!href || inLink) out.push(...inner)
        else out.push({ type: 'link', url: link(ctx, href), children: inner })
        return
      }
      case 'img': {
        const src = String(c.properties?.src ?? '')
        if (!src) throw new ConvertError('an image without src', p)
        out.push({ type: 'image', url: image(ctx, src), alt: transform(ctx, altOf(c), false) })
        return
      }
      default:
        if (NEVER.has(c.tagName)) throw new ConvertError(`<${c.tagName}> has no rule`, p)
        if (ctx.mode === 'lenient' && (LAYOUT.has(c.tagName) || c.tagName === 'span')) {
          out.push(...phrasing(c.children, ctx, p, inLink))
          return
        }
        throw new ConvertError(`<${c.tagName}> has no rule inside text`, p)
    }
  })
  return out
}

/**
 * HTML whitespace rules on inline content: runs of white space become one space, and a line starts and ends without
 * one. Adjacent text nodes merge; a `break` eats the spaces around it.
 */
function tidyInline(nodes: PhrasingContent[]): PhrasingContent[] {
  const merged: PhrasingContent[] = []
  for (const n of nodes) {
    const last = merged[merged.length - 1]
    if (n.type === 'text' && last?.type === 'text') last.value += n.value
    else merged.push(n.type === 'text' ? { ...n } : n)
  }
  const collapse = (list: PhrasingContent[]) => {
    for (const n of list) {
      if (n.type === 'text') n.value = n.value.replace(/[ \t\n\r\f]+/g, ' ')
      else if ('children' in n) collapse(n.children as PhrasingContent[])
    }
  }
  collapse(merged)
  // trim at the edges and around breaks, descending into the first and last nodes
  const trimEdge = (list: PhrasingContent[], side: 'start' | 'end') => {
    const n = side === 'start' ? list[0] : list[list.length - 1]
    if (!n) return
    if (n.type === 'text') n.value = side === 'start' ? n.value.replace(/^ +/, '') : n.value.replace(/ +$/, '')
    else if (n.type === 'strong' || n.type === 'emphasis' || n.type === 'link') trimEdge(n.children, side)
  }
  trimEdge(merged, 'start')
  trimEdge(merged, 'end')
  merged.forEach((n, i) => {
    if (n.type !== 'break') return
    const before = merged[i - 1]
    const after = merged[i + 1]
    if (before?.type === 'text') before.value = before.value.replace(/ +$/, '')
    if (after?.type === 'text') after.value = after.value.replace(/^ +/, '')
  })
  const empty = (n: PhrasingContent): boolean =>
    (n.type === 'text' && n.value === '') || ((n.type === 'strong' || n.type === 'emphasis') && n.children.every(empty))
  const kept = merged.filter((n) => !empty(n))
  // a leading or trailing break carries nothing
  while (kept[0]?.type === 'break') kept.shift()
  while (kept[kept.length - 1]?.type === 'break') kept.pop()
  return kept
}

/** Plain text of an HTML fragment: the text nodes in order, white space collapsed. For titles and labels. */
export function htmlToText(html: string, hooks: ConvertHooks = {}): string {
  const tree = fromHtml(html, { fragment: true })
  const parts: string[] = []
  const walk = (nodes: (HastContent | ElementContent)[]) => {
    for (const n of nodes) {
      if (n.type === 'text') parts.push(n.value)
      else if (isElement(n) && !NEVER.has(n.tagName)) {
        if (n.tagName === 'br') parts.push(' ')
        walk(n.children)
      }
    }
  }
  walk(tree.children)
  const text = parts
    .join('')
    .replace(/[ \t\n\r\f]+/g, ' ')
    .trim()
  return hooks.text ? hooks.text(text, { code: false }) : text
}

/** The visible text nodes of an HTML fragment, one string each, trimmed, empty ones left out. */
export function htmlTextNodes(html: string): string[] {
  const tree = fromHtml(html, { fragment: true })
  const out: string[] = []
  const walk = (nodes: (HastContent | ElementContent)[]) => {
    for (const n of nodes) {
      if (n.type === 'text') {
        const t = n.value.replace(/[ \t\n\r\f]+/g, ' ').trim()
        if (t) out.push(t)
      } else if (isElement(n) && !NEVER.has(n.tagName) && n.tagName !== 'template') walk(n.children)
    }
  }
  walk(tree.children)
  return out
}

/** The elements of a fragment's top level (for the landing parser: tag, classes, attributes, children). */
export function parseFragment(html: string): Element[] {
  return fromHtml(html, { fragment: true }).children.filter(isElement)
}

export { classes as elementClasses }
