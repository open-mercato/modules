// What `yarn om compare-live` compares of one HTML page (www site migration spec, API Contracts, compare-live): the
// `<title>`, the meta description, the first `h1`, the main text as a normalized word sequence with the navbar and the
// footer removed, its image count, and whether canonical, `og:title`, `og:image` and JSON-LD are present. The page is
// parsed into a syntax tree (hast-util-from-html), never read with regular expressions.
import type { Element, Nodes, Parents, Root } from 'hast'
import { fromHtml } from 'hast-util-from-html'
import { distance } from 'fastest-levenshtein'

export interface PageSnapshot {
  title: string | null
  description: string | null
  h1: string | null
  /** The main text, lowercased, as words (letters and digits); the navbar, the footer and scripts left out. */
  words: string[]
  /** `img` elements in the main text. */
  images: number
  canonical: boolean
  ogTitle: boolean
  ogImage: boolean
  jsonLd: boolean
  /** The page uses the shared layout of the Webflow landings (`omlp-*` classes, spec, Landings). */
  landing: boolean
}

/** Elements whose text is never main text. */
const SKIPPED = new Set(['script', 'style', 'noscript', 'template', 'svg', 'nav', 'iframe', 'head'])
/** Site chrome outside `<main>`: the navbar and the footer of both sites. */
const CHROME_TAGS = new Set(['header', 'footer'])
/** Class names of the site chrome: Webflow's navbar, footer and cookie banner, the Astro site's header and footer. */
const CHROME_CLASS = /^(?:navbar|w-nav|footer|site-header|site-footer|cookie)/

/** A property that holds a list of tokens (class, rel): hast keeps it as an array. */
function tokens(el: Element, name: string): string[] {
  const v: unknown = el.properties?.[name]
  return Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/\s+/) : []
}

const classes = (el: Element): string[] => tokens(el, 'className')

function isChrome(el: Element): boolean {
  if (el.properties?.role === 'navigation') return true
  return classes(el).some((c) => CHROME_CLASS.test(c))
}

/** Whitespace collapsed and trimmed, or null when empty. */
export function cleanText(s: string): string | null {
  const t = s.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

/** The words of a text: NFKC, lowercased, split on everything that is not a letter or a digit. */
export function words(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '')
}

function textOf(node: Nodes, skip: (el: Element) => boolean, out: string[] = []): string[] {
  if (node.type === 'text') out.push(node.value)
  else if (node.type === 'element') {
    if (skip(node)) return out
    for (const child of node.children) textOf(child, skip, out)
    if (node.tagName === 'br' || node.tagName === 'p' || /^h[1-6]$/.test(node.tagName)) out.push(' ')
  } else if (node.type === 'root') for (const child of node.children) textOf(child, skip, out)
  return out
}

function find(node: Nodes, test: (el: Element) => boolean): Element | null {
  if (node.type === 'element' && test(node)) return node
  if (node.type === 'element' || node.type === 'root')
    for (const child of (node as Parents).children) {
      const hit = find(child, test)
      if (hit) return hit
    }
  return null
}

function every(node: Nodes, test: (el: Element) => boolean, out: Element[] = []): Element[] {
  if (node.type === 'element' && test(node)) out.push(node)
  if (node.type === 'element' || node.type === 'root')
    for (const child of (node as Parents).children) every(child, test, out)
  return out
}

/** Elements of the region below `node` whose text and images count: skipped and chrome elements left out. */
function regionImages(node: Nodes, skip: (el: Element) => boolean): number {
  if (node.type === 'element') {
    if (skip(node)) return 0
    if (node.tagName === 'img') return 1
  }
  if (node.type === 'element' || node.type === 'root')
    return (node as Parents).children.reduce((n, c) => n + regionImages(c, skip), 0)
  return 0
}

const attr = (el: Element, name: string): string => String(el.properties?.[name] ?? '')
const rel = (el: Element): string[] => tokens(el, 'rel')

/** The snapshot of an HTML page. */
export function snapshotHtml(html: string): PageSnapshot {
  const tree: Root = fromHtml(html)
  const head = find(tree, (el) => el.tagName === 'head')
  const meta = (key: 'name' | 'property', value: string): Element | null =>
    head ? find(head, (el) => el.tagName === 'meta' && attr(el, key).toLowerCase() === value) : null
  const titleEl = head ? find(head, (el) => el.tagName === 'title') : null
  const body = find(tree, (el) => el.tagName === 'body') ?? tree
  const main = find(body, (el) => el.tagName === 'main')
  // inside <main> a <header> is the page's own (a post's heading), outside it the site's navbar
  const skip = (el: Element): boolean =>
    SKIPPED.has(el.tagName) || isChrome(el) || (main === null && CHROME_TAGS.has(el.tagName))
  const region = main ?? body
  const h1 = find(body, (el) => el.tagName === 'h1')
  const description = meta('name', 'description')
  return {
    title: titleEl ? cleanText(textOf(titleEl, () => false).join('')) : null,
    description: description ? cleanText(attr(description, 'content')) : null,
    h1: h1 ? cleanText(textOf(h1, (el) => SKIPPED.has(el.tagName)).join(' ')) : null,
    words: words(textOf(region, skip).join(' ')),
    images: regionImages(region, skip),
    canonical: head !== null && find(head, (el) => el.tagName === 'link' && rel(el).includes('canonical')) !== null,
    ogTitle: meta('property', 'og:title') !== null,
    ogImage: meta('property', 'og:image') !== null,
    jsonLd: every(tree, (el) => el.tagName === 'script' && attr(el, 'type') === 'application/ld+json').length > 0,
    landing: find(body, (el) => classes(el).some((c) => c.startsWith('omlp-'))) !== null,
  }
}

/**
 * How alike two word sequences are, from 0 to 1: one minus their word edit distance over the longer length. Each
 * distinct word becomes one character, so the edit distance of the two strings is the one of the word sequences.
 */
export function similarity(a: readonly string[], b: readonly string[]): number {
  const n = Math.max(a.length, b.length)
  if (n === 0) return 1
  const ids = new Map<string, string>()
  const code = (w: string): string => {
    let c = ids.get(w)
    if (c === undefined) {
      // characters of the Basic Multilingual Plane, the surrogates left out: one UTF-16 unit per word
      let cp = 0x100 + ids.size
      if (cp >= 0xd800) cp += 0x800
      c = String.fromCharCode(cp)
      ids.set(w, c)
    }
    return c
  }
  const s = a.map(code).join('')
  const t = b.map(code).join('')
  return 1 - distance(s, t) / n
}
