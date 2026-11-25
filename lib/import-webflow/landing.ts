// The landing parser (spec API Contracts, "Landings"): one parser for the shared `omlp-*` / `omfm-*` layout reads a
// landing's DOM text nodes by their classes and heading order into the `landings` schema. The Webflow DOM API leaves
// some visible text out (the eyebrows, the FAQ questions, the cells of the capability matrix and the comparison); the
// parser aligns the DOM nodes with the page's visible text (strony/<slug>.txt minus the navbar and footer) and reads
// those parts from the lines between nodes. Then the landing's text, rendered from the parsed fields, must equal the
// visible text as a normalized word sequence; a mismatch stops that landing.
import type { Element } from 'hast'
import { CAPABILITY_MARKS, LANDING_TEMPLATE_TEXT, type LandingLocale } from '../schema/www-content.ts'
import { compact, ItemStop, ItemText, validate, type Entry, type RunCtx } from './context.ts'
import type { WfNode, WfPage } from './export.ts'
import { elementClasses, htmlTextNodes, htmlToText, parseFragment } from './richtext.ts'
import { formatProseDate, parseProseDate } from './text.ts'

/** A DOM text node of the page, with its top element. */
interface TextNode {
  kind: 'node'
  id: string
  html: string
  el: Element
  tag: string
  classes: string[]
  /** The node's visible text, white space collapsed. */
  text: string
}

interface ImageNode {
  kind: 'image'
  id: string
  alt: string
  assetId: string | null
}

/** Visible lines the DOM API left out, between two nodes. */
interface Gap {
  kind: 'gap'
  lines: string[]
}

type Part = TextNode | ImageNode | Gap

/** Words as the cross-check compares them: NFC, no invisible characters, no token without a letter or digit. */
export function words(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
}

/**
 * Lines every page shares at its start (the navbar) and its end (the footer), from the visible text of several pages:
 * the longest common line prefix and suffix. Needs at least two pages.
 */
export function chromeOf(pages: readonly (readonly string[])[]): { prefix: number; suffix: number } {
  if (pages.length < 2) return { prefix: 0, suffix: 0 }
  const [first, ...rest] = pages as [readonly string[], ...(readonly string[])[]]
  let prefix = first.length
  let suffix = first.length
  for (const p of rest) {
    let i = 0
    while (i < prefix && i < p.length && p[i] === first[i]) i++
    prefix = i
    let j = 0
    while (j < suffix && j < p.length && p[p.length - 1 - j] === first[first.length - 1 - j]) j++
    suffix = j
  }
  return { prefix, suffix }
}

/** Visible lines of a page without the navbar and footer, blank lines dropped. */
export function contentLines(lines: readonly string[], chrome: { prefix: number; suffix: number }): string[] {
  return lines
    .slice(chrome.prefix, lines.length - chrome.suffix)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l !== '')
}

/**
 * Aligns DOM nodes with the visible lines: each text node's words must appear in order; the lines skipped between two
 * nodes form a gap. A node not found, or a line split between a node and a gap, stops the landing.
 */
export function align(nodes: readonly WfNode[], lines: readonly string[]): Part[] {
  const flat: { w: string; line: number }[] = []
  lines.forEach((l, line) => words(l).forEach((w) => flat.push({ w, line })))
  const hasWords = (l: string) => words(l).length > 0
  const parts: Part[] = []
  let pos = 0
  // the line after the previous node, past the symbol lines it draws itself (the arrow of a link)
  let from = 0
  const gapUntil = (end: number, until: number) => {
    if (end > pos) {
      const first = flat[pos]!.line
      const last = flat[end - 1]!.line
      if ((pos > 0 && flat[pos - 1]!.line === first) || (end < flat.length && flat[end]!.line === last))
        throw new ItemStop(
          `a visible line is split between a DOM node and text the DOM does not hold: "${lines[first]}"`,
        )
    }
    // the lines between the two nodes, symbol lines (the marks of the matrix) included
    const gapLines = lines.slice(from, until).filter((l) => l !== '')
    if (gapLines.some(hasWords)) parts.push({ kind: 'gap', lines: gapLines })
  }
  /** Lines of text nodes without a letter or digit at the start (lead) and the end (trail) of a node. */
  const symbolEdges = (texts: string[]) => {
    let lead = 0
    while (lead < texts.length && !hasWords(texts[lead]!)) lead++
    let trail = 0
    while (trail < texts.length - lead && !hasWords(texts[texts.length - 1 - trail]!)) trail++
    return { lead, trail }
  }
  /** The line index `count` symbol lines before or after `line`, stopping at a line with words. */
  const stepSymbols = (line: number, count: number, dir: 1 | -1) => {
    let l = line
    for (let n = 0; n < count; n++) {
      const next = l + dir
      if (next < 0 || next >= lines.length || hasWords(lines[next]!)) break
      l = next
    }
    return l
  }
  for (const n of nodes) {
    if (n.type === 'image') {
      const img = (n as { image: { alt: string | null; assetId: string | null } }).image
      parts.push({ kind: 'image', id: n.id, alt: img.alt ?? '', assetId: img.assetId })
      continue
    }
    if (n.type !== 'text') continue
    const html = (n as { text: { html: string } }).text.html
    const texts = htmlTextNodes(html)
    const ws = words(texts.join(' '))
    if (ws.length === 0) continue
    let k = pos
    search: for (; k <= flat.length - ws.length; k++) {
      for (let j = 0; j < ws.length; j++) if (flat[k + j]!.w !== ws[j]) continue search
      break
    }
    if (k > flat.length - ws.length)
      throw new ItemStop(`the DOM node ${n.id} is not in the visible text: "${ws.slice(0, 8).join(' ')}"`)
    const edges = symbolEdges(texts)
    const firstLine = stepSymbols(flat[k]!.line, edges.lead, -1)
    gapUntil(k, firstLine)
    const el = parseFragment(html)[0]
    if (!el) throw new ItemStop(`the DOM node ${n.id} holds no element`)
    parts.push({
      kind: 'node',
      id: n.id,
      html,
      el,
      tag: el.tagName,
      classes: elementClasses(el),
      text: htmlToText(html),
    })
    pos = k + ws.length
    from = stepSymbols(flat[pos - 1]!.line, edges.trail, 1) + 1
  }
  gapUntil(flat.length, lines.length)
  return parts
}

const MARKS: Record<string, (typeof CAPABILITY_MARKS)[number]> = { '✓': 'yes', '×': 'no', '↗': 'build' }
const isMark = (line: string | undefined) => line !== undefined && line in MARKS

/** A label without the decorative arrow the template draws after it. */
function label(text: string): string {
  return text.replace(/\s*↗\s*$/, '').trim()
}

class Cursor {
  readonly parts: Part[]
  i = 0
  readonly slug: string
  constructor(parts: Part[], slug: string) {
    this.parts = parts
    this.slug = slug
  }
  peek(offset = 0): Part | undefined {
    return this.parts[this.i + offset]
  }
  /** Skips images whose alt Webflow inherits from an asset without alt text: the template's icons. */
  skipIcons(t: ItemText): void {
    for (;;) {
      const p = this.peek()
      if (p?.kind !== 'image') return
      const alt = imageAlt(t, p)
      if (alt) return
      this.i++
    }
  }
  isNode(tag: string, cls?: string, offset = 0): boolean {
    const p = this.peek(offset)
    return p?.kind === 'node' && p.tag === tag && (cls === undefined || p.classes.includes(cls))
  }
  node(tag: string, cls: string | undefined, where: string): TextNode {
    const p = this.peek()
    if (p?.kind !== 'node' || p.tag !== tag || (cls !== undefined && !p.classes.includes(cls)))
      throw new ItemStop(`${where}: expected <${tag}${cls ? `.${cls}` : ''}>, found ${describe(p)}`)
    this.i++
    return p
  }
  gap(where: string, count?: number): string[] {
    const p = this.peek()
    if (p?.kind !== 'gap') throw new ItemStop(`${where}: expected text the DOM does not hold, found ${describe(p)}`)
    if (count !== undefined && p.lines.length !== count)
      throw new ItemStop(
        `${where}: expected ${count} line(s) outside the DOM, found ${p.lines.length}: "${p.lines.join(' | ')}"`,
      )
    this.i++
    return p.lines
  }
  optionalGap(count: number): string[] | undefined {
    const p = this.peek()
    if (p?.kind === 'gap' && p.lines.length === count) {
      this.i++
      return p.lines
    }
    return undefined
  }
}

function describe(p: Part | undefined): string {
  if (!p) return 'the end of the page'
  if (p.kind === 'gap') return `the text "${p.lines.slice(0, 3).join(' | ')}"`
  if (p.kind === 'image') return `an image (${p.alt || 'no alt'})`
  return `<${p.tag}${p.classes.map((c) => `.${c}`).join('')}> "${p.text.slice(0, 60)}"`
}

const WF_INHERIT = '__wf_reserved_inherit'

function imageAlt(t: ItemText, p: ImageNode): string {
  if (p.alt && p.alt !== WF_INHERIT) return p.alt
  return (p.assetId ? t.ctx.exp.assets.get(p.assetId)?.altText : undefined)?.trim() ?? ''
}

/** Markdown of a node's inline content, with the node's plain text kept for the cross-check. */
interface Rich {
  md: string
  plain: string
}

function rich(t: ItemText, n: TextNode): Rich {
  return { md: t.inline(n.html), plain: n.text }
}

function cta(n: TextNode): { label: string; href: string } {
  const href = String(n.el.properties?.href ?? '').trim()
  if (!href) throw new ItemStop(`the link "${n.text}" has no href`)
  return { label: label(n.text), href }
}

function sourceLinks(el: Element, where: string): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = []
  const visit = (e: Element) => {
    for (const c of e.children) {
      if (c.type !== 'element') continue
      if (c.tagName === 'a') {
        const url = String(c.properties?.href ?? '')
        if (!/^https:\/\//.test(url))
          throw new ItemStop(
            `${where}: the source "${htmlToText(String(c.children.map((x) => (x.type === 'text' ? x.value : '')).join('')))}" is not an https link`,
          )
        out.push({ label: label(textOf(c)), url })
      } else visit(c)
    }
  }
  visit(el)
  return out
}

function textOf(e: Element): string {
  let s = ''
  for (const c of e.children) s += c.type === 'text' ? c.value : c.type === 'element' ? textOf(c) : ''
  return s.replace(/\s+/g, ' ').trim()
}

interface TitledItems {
  eyebrow?: string
  title: string
  lead?: Rich
  items: { title: string; body: Rich }[]
}

/** A section of an h2 and (h3, p) pairs, with an eyebrow line before the h2 and a lead paragraph after it. */
function h3Section(c: Cursor, t: ItemText, where: string): TitledItems {
  const eyebrow = c.isNode('h2', undefined, 1) ? c.optionalGap(1)?.[0] : undefined
  const title = c.node('h2', undefined, where).text
  c.skipIcons(t)
  const lead = c.isNode('p') ? rich(t, c.node('p', undefined, where)) : undefined
  const items: { title: string; body: Rich }[] = []
  c.skipIcons(t)
  while (c.isNode('h3')) {
    const h = c.node('h3', undefined, where).text
    c.skipIcons(t)
    const body = rich(t, c.node('p', undefined, `${where} "${h}"`))
    items.push({ title: h, body })
    c.skipIcons(t)
  }
  if (items.length === 0) throw new ItemStop(`${where}: no items`)
  return { eyebrow, title, lead, items }
}

function legendOf(el: Element): { yes: string; no: string; build: string } {
  const out: Record<string, string> = {}
  for (const span of el.children) {
    if (span.type !== 'element') continue
    let mark: string | undefined
    const rest: string[] = []
    for (const c of span.children) {
      if (c.type === 'element' && elementClasses(c).includes('omfm-status')) {
        const cls = elementClasses(c).find((x) => /^omfm-(yes|no|build)$/.test(x))
        mark = cls?.slice(5)
      } else if (c.type === 'text') rest.push(c.value)
      else if (c.type === 'element') rest.push(textOf(c))
    }
    if (!mark) throw new ItemStop('the capability legend has an entry without a mark')
    out[mark] = rest.join(' ').replace(/\s+/g, ' ').trim()
  }
  if (!out.yes || !out.no || !out.build) throw new ItemStop('the capability legend does not name all three marks')
  return { yes: out.yes, no: out.no, build: out.build }
}

interface CapRow {
  label: string
  ours: string
  oursNote?: string
  theirs: string
  theirsNote?: string
}

type Matrix = {
  label: string
  tagline: string
  columns: [{ name: string; note: string }, { name: string; note: string }]
  groups: { title: string; rows: CapRow[] }[]
}

/**
 * The matrix text: a 6-line header (label, tagline, our name and note, their name and note), then groups of rows. Two
 * lines between a row's last mark and the next label are either the row's theirs note and the next label, or a new
 * group's title and its first label; the lines alone cannot tell. A line known as a group title (`titles`: the titles
 * this matrix and the export's other landings show where no doubt exists) opens a group; anything else is a note.
 */
export function parseMatrix(lines: readonly string[], titles: ReadonlySet<string> = new Set()): Matrix {
  const first = parseMatrixWith(lines, titles)
  const own = new Set([...titles, ...first.groups.map((g) => g.title)])
  return own.size > titles.size ? parseMatrixWith(lines, own) : first
}

function parseMatrixWith(lines: readonly string[], titles: ReadonlySet<string>): Matrix {
  const firstMark = lines.findIndex(isMark)
  if (firstMark < 0) throw new ItemStop('the capability matrix has no marks')
  const header = lines.slice(0, firstMark - 2)
  if (header.length !== 6)
    throw new ItemStop(`the capability matrix header has ${header.length} lines, the parser knows 6`)
  const [lbl, tagline, ourName, ourNote, theirName, theirNote] = header as [
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  const groups: { title: string; rows: CapRow[] }[] = []
  let i = firstMark - 2
  let group: { title: string; rows: CapRow[] } = { title: lines[i++]!, rows: [] }
  groups.push(group)
  for (;;) {
    const rowLabel = lines[i]
    if (rowLabel === undefined || isMark(rowLabel) || !isMark(lines[i + 1]))
      throw new ItemStop(`the capability matrix: a row is expected at "${rowLabel ?? 'the end'}"`)
    const row: CapRow = { label: rowLabel, ours: MARKS[lines[i + 1]!]!, theirs: '' }
    i += 2
    if (!isMark(lines[i])) row.oursNote = lines[i++]
    if (!isMark(lines[i])) throw new ItemStop(`the capability matrix: the row "${rowLabel}" has one mark`)
    row.theirs = MARKS[lines[i++]!]!
    group.rows.push(row)
    // the lines up to the next mark: [theirs note] [new group title] next row label
    let k = 0
    while (i + k < lines.length && !isMark(lines[i + k])) k++
    if (i + k >= lines.length) {
      if (k === 1) row.theirsNote = lines[i]
      else if (k > 1) throw new ItemStop(`the capability matrix ends with ${k} lines after its last row`)
      break
    }
    if (k === 2 && titles.has(lines[i]!)) {
      group = { title: lines[i++]!, rows: [] }
      groups.push(group)
    } else if (k === 2) row.theirsNote = lines[i++]
    else if (k === 3) {
      row.theirsNote = lines[i++]
      group = { title: lines[i++]!, rows: [] }
      groups.push(group)
    } else if (k !== 1) throw new ItemStop(`the capability matrix: ${k} lines between rows at "${lines[i]}"`)
  }
  return {
    label: lbl,
    tagline,
    columns: [
      { name: ourName, note: ourNote },
      { name: theirName, note: theirNote },
    ],
    groups,
  }
}

/** The landing as parsed, before the text rules: Rich values keep their plain text for the cross-check. */
interface RawLanding {
  locale: LandingLocale
  hero: {
    eyebrow: string
    title: string
    lead: Rich
    primary: { label: string; href: string }
    secondary?: { label: string; href: string }
    proof: string[]
  }
  sectionNav: { label: string; anchor: string }[]
  pains?: TitledItems
  features?: TitledItems
  capabilities?: {
    eyebrow?: string
    title: string
    lead?: Rich
    matrix: ReturnType<typeof parseMatrix>
    legend: { yes: string; no: string; build: string }
    note: Rich
    reviewed: string
    sources: { label: string; url: string }[]
  }
  comparison?: {
    title: string
    label: string
    columns: [string, string]
    rows: { topic: string; theirs: string; ours: string }[]
  }
  demo?: {
    eyebrow?: string
    title: string
    body: Rich
    cta: { label: string; href: string }
    image?: { url: string; alt: string }
    caption?: string
  }
  steps?: TitledItems
  faq: { title: string; items: { question: string; answer: Rich }[] }
  cta: { title: string; body: Rich; primary: { label: string; href: string }; note?: string }
  sources?: { title: string; reviewed: string; items: { label: string; url: string }[] }
  /** Things the template draws that the content does not hold (the animation embed). */
  skipped: string[]
}

function detectLocale(line: string): { locale: LandingLocale; day: string } | undefined {
  for (const locale of ['en', 'pl'] as const) {
    const day = parseProseDate(line, locale)
    const tpl = LANDING_TEMPLATE_TEXT[locale]
    if (day && (line.startsWith(tpl.reviewedPrefix) || line.includes(` · ${tpl.reviewedInline} `)))
      return { locale, day }
  }
  return undefined
}

/** Parses the aligned parts of one landing. */
export function parseLanding(parts: Part[], t: ItemText, slug: string): RawLanding {
  const c = new Cursor(parts, slug)
  const skipped: string[] = []
  const eyebrow = c.gap('hero eyebrow', 1)[0]!
  const title = c.node('h1', undefined, 'hero').text
  const lead = rich(t, c.node('p', 'omlp-intro', 'hero'))
  const primary = cta(c.node('a', 'omlp-primary', 'hero'))
  const secondary = c.isNode('a', 'omlp-secondary') ? cta(c.node('a', 'omlp-secondary', 'hero')) : undefined
  const benefits = c.node('div', 'omlp-benefits', 'hero')
  const proof = benefits.el.children
    .filter((x): x is Element => x.type === 'element')
    .map((x) => textOf(x))
    .filter(Boolean)
  c.skipIcons(t)
  const sectionNav: { label: string; anchor: string }[] = []
  while (c.isNode('a') && String((c.peek() as TextNode).el.properties?.href ?? '').startsWith('#')) {
    const a = c.node('a', undefined, 'section nav')
    sectionNav.push({ label: a.text, anchor: String(a.el.properties?.href).slice(1) })
  }

  const before: TitledItems[] = []
  while (c.isNode('h2') || (c.peek()?.kind === 'gap' && c.isNode('h2', undefined, 1))) {
    // the capability matrix starts like a section but has no h3 after its lead
    const at = c.i
    const hasH3 = (() => {
      for (let j = at; j < c.parts.length; j++) {
        const p = c.parts[j]!
        if (p.kind === 'node' && j > at + 1 && p.tag === 'h2') return false
        if (p.kind === 'node' && p.tag === 'h3') return true
        if (p.kind === 'node' && p.classes.includes('omfm-legend')) return false
      }
      return false
    })()
    if (!hasH3) break
    before.push(h3Section(c, t, before.length === 0 ? 'pains' : 'features'))
  }
  if (before.length > 2)
    throw new ItemStop(`${before.length} sections of items before the capability matrix, the parser knows 2`)

  let capabilities: RawLanding['capabilities']
  let locale: LandingLocale | undefined
  if ((c.isNode('h2', undefined, 1) && c.peek()?.kind === 'gap') || c.isNode('h2')) {
    const save = c.i
    const capEyebrow = c.isNode('h2', undefined, 1) ? c.optionalGap(1)?.[0] : undefined
    const capTitle = c.node('h2', undefined, 'capabilities').text
    const capLead =
      c.isNode('p') && !c.isNode('p', 'omfm-scope') ? rich(t, c.node('p', undefined, 'capabilities')) : undefined
    if (c.peek()?.kind === 'gap' && c.isNode('div', 'omfm-legend', 1)) {
      const matrix = parseMatrix(c.gap('capability matrix'), t.ctx.matrixTitles)
      const legend = legendOf(c.node('div', 'omfm-legend', 'capabilities').el)
      const note = rich(t, c.node('p', 'omfm-scope', 'capabilities'))
      const src = c.node('p', 'omfm-sources', 'capabilities')
      const lead0 = src.el.children.find((x) => x.type === 'text')
      const head = lead0 && lead0.type === 'text' ? lead0.value.replace(/\s+/g, ' ').trim() : ''
      const found = detectLocale(head)
      if (!found) throw new ItemStop(`capabilities: the review line "${head}" has no date in a known locale`)
      locale = found.locale
      const tpl = LANDING_TEMPLATE_TEXT[locale]
      const expected = `${tpl.reviewedPrefix} ${formatProseDate(found.day, locale)}. ${tpl.sourcesLabel}`
      if (head !== expected) throw new ItemStop(`capabilities: the review line "${head}" is not "${expected}"`)
      capabilities = {
        eyebrow: capEyebrow,
        title: capTitle,
        lead: capLead,
        matrix,
        legend,
        note,
        reviewed: found.day,
        sources: sourceLinks(src.el, 'capability sources'),
      }
    } else c.i = save
  }

  // the comparison and the demo's eyebrow come as one run of text the DOM does not hold
  let comparison: RawLanding['comparison']
  let demoEyebrow: string | undefined
  if (c.peek()?.kind === 'gap' && c.isNode('h2', undefined, 1)) {
    const lines = c.gap('comparison')
    const extra = (lines.length - 4) % 3
    if (lines.length === 1) demoEyebrow = lines[0]
    else if (lines.length < 7 || extra === 2)
      throw new ItemStop(`comparison: ${lines.length} lines do not form a 4-line header and rows of 3`)
    else {
      const rowLines = lines.slice(4, lines.length - extra)
      const rows: { topic: string; theirs: string; ours: string }[] = []
      for (let i = 0; i < rowLines.length; i += 3)
        rows.push({ topic: rowLines[i]!, theirs: rowLines[i + 1]!, ours: rowLines[i + 2]! })
      comparison = { title: lines[0]!, label: lines[1]!, columns: [lines[2]!, lines[3]!], rows }
      if (extra === 1) demoEyebrow = lines[lines.length - 1]
    }
  }

  let demo: RawLanding['demo']
  if (c.isNode('h2') && c.isNode('p', undefined, 1) && c.isNode('a', 'omlp-proof-link', 2)) {
    const dTitle = c.node('h2', undefined, 'demo').text
    const body = rich(t, c.node('p', undefined, 'demo'))
    const link = cta(c.node('a', 'omlp-proof-link', 'demo'))
    let image: { url: string; alt: string } | undefined
    const p = c.peek()
    if (p?.kind === 'image') {
      c.i++
      const asset = p.assetId ? t.ctx.exp.assets.get(p.assetId) : undefined
      if (!asset) throw new ItemStop(`demo: the image asset ${p.assetId} is not in assets.json`)
      image = { url: asset.hostedUrl, alt: imageAlt(t, p) }
    }
    const caption = c.optionalGap(1)?.[0]
    demo = { eyebrow: demoEyebrow, title: dTitle, body, cta: link, image, caption }
  } else if (demoEyebrow !== undefined) throw new ItemStop(`the line "${demoEyebrow}" is followed by no demo`)

  const steps =
    c.isNode('h2') && c.isNode('h3', undefined, 1)
      ? h3Section(c, t, 'steps')
      : c.peek()?.kind === 'gap' && c.isNode('h2', undefined, 1) && c.isNode('h3', undefined, 2)
        ? h3Section(c, t, 'steps')
        : undefined

  const faqTitle = c.node('h2', undefined, 'faq').text
  const faqItems: { question: string; answer: Rich }[] = []
  while (c.peek()?.kind === 'gap' && c.isNode('p', undefined, 1)) {
    const question = c.gap('faq question', 1)[0]!
    faqItems.push({ question, answer: rich(t, c.node('p', undefined, `faq "${question}"`)) })
  }

  const ctaTitle = c.node('h2', undefined, 'cta').text
  const ctaBody = rich(t, c.node('p', undefined, 'cta'))
  const ctaPrimary = cta(c.node('a', 'omlp-primary', 'cta'))
  const ctaNote = c.isNode('p') ? c.node('p', undefined, 'cta').text : undefined

  let sources: RawLanding['sources']
  if (c.peek()?.kind === 'gap') {
    const line = c.gap('sources', 1)[0]!
    const found = detectLocale(line)
    if (!found) throw new ItemStop(`sources: the line "${line}" has no review date in a known locale`)
    locale ??= found.locale
    if (found.locale !== locale) throw new ItemStop(`sources: the line "${line}" is in another locale than the matrix`)
    const tpl = LANDING_TEMPLATE_TEXT[locale]
    const suffix = ` · ${tpl.reviewedInline} ${formatProseDate(found.day, locale)}`
    if (!line.endsWith(suffix)) throw new ItemStop(`sources: the line "${line}" does not end with "${suffix}"`)
    const items: { label: string; url: string }[] = []
    while (c.isNode('a')) {
      const a = c.node('a', undefined, 'sources')
      const url = String(a.el.properties?.href ?? '')
      if (!/^https:\/\//.test(url)) throw new ItemStop(`sources: "${a.text}" is not an https link`)
      items.push({ label: label(a.text), url })
    }
    sources = { title: line.slice(0, -suffix.length), reviewed: found.day, items }
  }
  for (;;) {
    const p = c.peek()
    if (!p) break
    if (p.kind === 'image' && !imageAlt(t, p)) {
      c.i++
      continue
    }
    throw new ItemStop(`unexpected ${describe(p)} after the last section`)
  }
  return {
    locale: locale ?? 'en',
    hero: { eyebrow, title, lead, primary, secondary, proof },
    sectionNav,
    pains: before[0],
    features: before[1],
    capabilities,
    comparison,
    demo,
    steps,
    faq: { title: faqTitle, items: faqItems },
    cta: { title: ctaTitle, body: ctaBody, primary: ctaPrimary, note: ctaNote },
    sources,
    skipped,
  }
}

/** The visible text a landing renders, in page order, as the template writes it. */
export function landingText(l: RawLanding): string[] {
  const out: string[] = []
  const add = (...v: (string | Rich | undefined)[]) => {
    for (const x of v) if (x !== undefined) out.push(typeof x === 'string' ? x : x.plain)
  }
  const tpl = LANDING_TEMPLATE_TEXT[l.locale]
  add(l.hero.eyebrow, l.hero.title, l.hero.lead, l.hero.primary.label, l.hero.secondary?.label, ...l.hero.proof)
  for (const n of l.sectionNav) add(n.label)
  for (const s of [l.pains, l.features]) {
    if (!s) continue
    add(s.eyebrow, s.title, s.lead)
    for (const i of s.items) add(i.title, i.body)
  }
  if (l.capabilities) {
    const k = l.capabilities
    add(k.eyebrow, k.title, k.lead, k.matrix.label, k.matrix.tagline)
    for (const col of k.matrix.columns) add(col.name, col.note)
    for (const g of k.matrix.groups) {
      add(g.title)
      for (const r of g.rows) add(r.label, r.oursNote, r.theirsNote)
    }
    add(k.legend.yes, k.legend.no, k.legend.build, k.note)
    add(`${tpl.reviewedPrefix} ${formatProseDate(k.reviewed, l.locale)}. ${tpl.sourcesLabel}`)
    for (const s of k.sources) add(s.label)
  }
  if (l.comparison) {
    add(l.comparison.title, l.comparison.label, ...l.comparison.columns)
    for (const r of l.comparison.rows) add(r.topic, r.theirs, r.ours)
  }
  if (l.demo) add(l.demo.eyebrow, l.demo.title, l.demo.body, l.demo.cta.label, l.demo.caption)
  if (l.steps) {
    add(l.steps.eyebrow, l.steps.title, l.steps.lead)
    for (const i of l.steps.items) add(i.title, i.body)
  }
  add(l.faq.title)
  for (const f of l.faq.items) add(f.question, f.answer)
  add(l.cta.title, l.cta.body, l.cta.primary.label, l.cta.note)
  if (l.sources) {
    add(`${l.sources.title} · ${tpl.reviewedInline} ${formatProseDate(l.sources.reviewed, l.locale)}`)
    for (const s of l.sources.items) add(s.label)
  }
  return out
}

/** The first difference of two word sequences, or undefined when they are equal. */
export function firstDifference(a: readonly string[], b: readonly string[]): string | undefined {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      const ctx = (s: readonly string[]) => s.slice(Math.max(0, i - 4), i + 4).join(' ') || '(end)'
      return `word ${i + 1}: the landing renders "${ctx(a)}", the page shows "${ctx(b)}"`
    }
  }
  return undefined
}

/** True for a page of the landing layout (its DOM has the hero intro of the `omlp` layout). */
export function isLandingDom(nodes: readonly WfNode[]): boolean {
  return nodes.some(
    (n) => n.type === 'text' && /class="[^"]*\bomlp-intro\b/.test((n as { text: { html: string } }).text.html),
  )
}

/** Builds one landing entry: align, parse, cross-check, then the text rules and the schema. */
export function landingEntry(
  ctx: RunCtx,
  page: WfPage,
  slug: string,
  nodes: readonly WfNode[],
  lines: readonly string[],
): { entry: Entry; competitor?: string } {
  const item = `landings/${slug}`
  // the cross-check reads the raw text; the text rules apply after it
  const raw = new ItemText(ctx, item, 'landings', false)
  const parts = align(nodes, lines)
  const l = parseLanding(parts, raw, slug)
  const diff = firstDifference(words(landingText(l).join(' ')), words(lines.join(' ')))
  if (diff) throw new ItemStop(`the text cross-check failed at ${diff}`)

  const t = new ItemText(ctx, item, 'landings', true)
  // the raw pass already replaced the dashes of the Markdown fields: count them with this item (A5)
  t.tally.dashes += raw.tally.dashes
  t.tally.invisible += raw.tally.invisible
  const tx = (s: string | undefined) => (s === undefined ? undefined : t.text(s))
  // Markdown fields convert again with the text rules on (the raw pass converted them without)
  const md = (r: Rich | undefined) => (r === undefined ? undefined : t.text(r.md))
  const link = (c: { label: string; href: string }) => ({ label: t.text(c.label), href: t.link(c.href) })
  const titled = (s: TitledItems | undefined) =>
    s === undefined
      ? undefined
      : compact({
          eyebrow: tx(s.eyebrow),
          title: t.text(s.title),
          lead: md(s.lead),
          items: s.items.map((i) => ({ title: t.text(i.title), body: md(i.body) })),
        })
  const seo = {
    title: t.text(page.seo?.title?.trim() || page.title?.trim() || ''),
    description: t.text(page.seo?.description?.trim() ?? ''),
  }
  const kind = /-(alternative|alternatywa)$/.test(slug) ? 'alternative' : 'industry'
  const competitor = kind === 'alternative' ? tx(l.comparison?.columns[0]) : undefined
  const k = l.capabilities
  const pains = titled(l.pains)
  const features = titled(l.features)
  const steps = titled(l.steps)
  if (pains && 'lead' in pains) throw new ItemStop('pains: a lead paragraph has no field')
  if (steps && 'lead' in steps) throw new ItemStop('steps: a lead paragraph has no field')
  const data = compact({
    webflowId: page.id,
    locale: l.locale,
    kind,
    competitor,
    seo,
    hero: compact({
      eyebrow: t.text(l.hero.eyebrow),
      title: t.text(l.hero.title),
      lead: md(l.hero.lead),
      primary: link(l.hero.primary),
      secondary: l.hero.secondary ? link(l.hero.secondary) : undefined,
      proof: l.hero.proof.map((p) => t.text(p)),
    }),
    sectionNav: l.sectionNav.map((n) => ({ label: t.text(n.label), anchor: n.anchor })),
    pains,
    features,
    capabilities: k
      ? compact({
          eyebrow: tx(k.eyebrow),
          title: t.text(k.title),
          lead: md(k.lead),
          label: t.text(k.matrix.label),
          tagline: tx(k.matrix.tagline),
          columns: k.matrix.columns.map((col) => compact({ name: t.text(col.name), note: tx(col.note) })),
          groups: k.matrix.groups.map((g) => ({
            title: t.text(g.title),
            rows: g.rows.map((r) =>
              compact({
                label: t.text(r.label),
                ours: r.ours,
                oursNote: tx(r.oursNote),
                theirs: r.theirs,
                theirsNote: tx(r.theirsNote),
              }),
            ),
          })),
          legend: { yes: t.text(k.legend.yes), no: t.text(k.legend.no), build: t.text(k.legend.build) },
          note: md(k.note),
          reviewed: k.reviewed,
          sources: k.sources.map((s) => ({ label: t.text(s.label), url: s.url })),
        })
      : undefined,
    comparison: l.comparison
      ? {
          title: t.text(l.comparison.title),
          label: t.text(l.comparison.label),
          columns: l.comparison.columns.map((x) => t.text(x)),
          rows: l.comparison.rows.map((r) => ({
            topic: t.text(r.topic),
            theirs: t.text(r.theirs),
            ours: t.text(r.ours),
          })),
        }
      : undefined,
    demo: l.demo
      ? compact({
          eyebrow: tx(l.demo.eyebrow),
          title: t.text(l.demo.title),
          body: md(l.demo.body),
          cta: link(l.demo.cta),
          image: l.demo.image ? imageField(t, l.demo.image) : undefined,
          caption: tx(l.demo.caption),
        })
      : undefined,
    steps,
    faq: {
      title: t.text(l.faq.title),
      items: l.faq.items.map((f) => ({ question: t.text(f.question), answer: md(f.answer) })),
    },
    cta: compact({
      title: t.text(l.cta.title),
      body: md(l.cta.body),
      primary: link(l.cta.primary),
      note: tx(l.cta.note),
    }),
    sources: l.sources
      ? {
          title: t.text(l.sources.title),
          reviewed: l.sources.reviewed,
          items: l.sources.items.map((s) => ({ label: t.text(s.label), url: s.url })),
        }
      : undefined,
    draft: page.draft || undefined,
  })
  const embeds = nodes.filter((n) => n.type === 'html-embed').length
  if (embeds > 0) t.note(`${embeds} embed(s) (the landing animation) left to the template, Phase 5 (Q4)`)
  const entry = validate(ctx, { collection: 'landings', id: slug, webflowId: page.id, draft: page.draft, data })
  t.commit()
  ctx.report.crossChecked.push(slug)
  return { entry, competitor }
}

function imageField(t: ItemText, img: { url: string; alt: string }): Record<string, unknown> {
  const src = t.media(img.url)
  return img.alt ? { src, alt: t.text(img.alt) } : { src, alt: '', decorative: true }
}
