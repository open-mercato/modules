// Text rules shared by the descriptor schema, the validator, the emitter and check-text.
// Isomorphic: no Node APIs (lib/core runs in Node, the browser and the MCP Worker).

const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)

// C0 controls except tab, LF and CR, plus DEL and C1 controls.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/

/** Characters banned in every human-facing text of the repo (CI check `om check-text`). */
export const BANNED_CHARS: readonly { char: string; name: string }[] = [
  { char: EM_DASH, name: 'U+2014 EM DASH' },
  { char: EN_DASH, name: 'U+2013 EN DASH' },
]

const PLAIN_TEXT_RULES: readonly { re: RegExp; reason: string }[] = [
  { re: /https?:\/\//i, reason: 'URL' },
  { re: /www\./i, reason: 'URL' },
  { re: /[[\]]/, reason: 'markdown link' },
  { re: /`/, reason: 'backtick' },
  { re: /[<>]/, reason: 'HTML' },
  { re: /(^|\s)\*/, reason: 'markdown emphasis' },
  { re: /^\s*#/, reason: 'markdown heading' },
  { re: CONTROL_RE, reason: 'control character' },
  { re: /[\n\r\t]/, reason: 'control character' },
  { re: /[\u2013\u2014]/, reason: 'long dash' },
]

/** First reason why `s` is not plain text, or null when it is. */
export function plainTextViolation(s: string): string | null {
  for (const rule of PLAIN_TEXT_RULES) if (rule.re.test(s)) return rule.reason
  return null
}

/** Plain text: no URLs, markdown, HTML, backticks, control characters or long dashes. */
export function isPlainText(s: string): boolean {
  return plainTextViolation(s) === null
}

/** Names of the catalog MCP tools (tools@1). A text that names them is suspicious. */
export const TOOL_NAMES = ['search_modules', 'get_module', 'check_compat', 'plan_install', 'get_changes'] as const

const INJECTION_RULES: readonly { re: RegExp; flag: string }[] = [
  { re: /ignore\s+(all|previous)/i, flag: 'ignore-instructions' },
  { re: /system\s+prompt/i, flag: 'system-prompt' },
  { re: /\byou\s+are\b/i, flag: 'you-are' },
  { re: /assistant\s*:/i, flag: 'assistant-turn' },
  { re: /run\s+the\s+following/i, flag: 'run-the-following' },
  { re: /curl .*\|\s*(ba)?sh/i, flag: 'curl-pipe-shell' },
  { re: new RegExp(`\\b(${TOOL_NAMES.join('|')})\\b`, 'i'), flag: 'tool-name' },
  { re: /[A-Za-z0-9+/]{41,}={0,2}/, flag: 'base64' },
]

/**
 * Phrase heuristics for prompt injection in author text. Hits are flags for a human
 * in the PR summary, never a validation error.
 */
export function injectionFlags(s: string): string[] {
  const out: string[] = []
  for (const rule of INJECTION_RULES) if (rule.re.test(s) && !out.includes(rule.flag)) out.push(rule.flag)
  return out
}

export interface BannedCharHit {
  line: number
  column: number
  name: string
}

/** Long dashes and control characters in a text file, with 1-based line and column. */
export function findBannedChars(text: string): BannedCharHit[] {
  const hits: BannedCharHit[] = []
  const lines = text.split('\n')
  lines.forEach((raw, i) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    for (let c = 0; c < line.length; c++) {
      const ch = line[c] as string
      const banned = BANNED_CHARS.find((b) => b.char === ch)
      if (banned) hits.push({ line: i + 1, column: c + 1, name: banned.name })
      else if (ch !== '\t' && CONTROL_RE.test(ch))
        hits.push({
          line: i + 1,
          column: c + 1,
          name: `control U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
        })
    }
  })
  return hits
}

/**
 * A text cut to at most `max` characters at a word boundary, with an ellipsis (review of 24 Oct: `check_compat` notes
 * ended mid-word, `...does not enable the workflows`, and policy reasons with a period in the middle of a word).
 * Unchanged when it fits.
 */
export function clipText(s: string, max: number): string {
  if (s.length <= max) return s
  const room = s.slice(0, max - 1)
  const cut = room.lastIndexOf(' ')
  const head = (cut > max / 2 ? room.slice(0, cut) : room).replace(/[\s,;:.(]+$/, '')
  return `${head}\u2026`
}

/** Characters of the author's README that Rentgen keeps (Facts.readmeExcerpt). */
export const README_EXCERPT_MAX = 4000

/** The catalog's line after a README excerpt that Rentgen cut (finding of 25 Oct: it ended mid-table, unmarked). */
export const README_CUT_TEXT = `First ${README_EXCERPT_MAX.toLocaleString('en-US')} characters. Full README on npm or in the repository.`

/** Rentgen cut this excerpt at README_EXCERPT_MAX (a README of exactly that length reads as cut too). */
export const readmeWasCut = (raw: string): boolean => raw.length >= README_EXCERPT_MAX

/** A cut excerpt ends at its last whole line, so no half row or half sentence is shown; an uncut one is unchanged. */
export function readmeWholeLines(text: string, cut: boolean): string {
  if (!cut) return text
  const at = text.lastIndexOf('\n')
  return at > 0 ? text.slice(0, at).trimEnd() : text
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : `&#${ch.charCodeAt(0)};`,
  )

/**
 * Inline Markdown of one escaped line: `code`, links with an https target only (rel nofollow), **bold**, *italic*
 * and <https://...> autolinks. Images (badges) are dropped. Everything else stays text.
 */
function readmeInline(raw: string): string {
  const codes: string[] = []
  // images first, also a linked image (a badge): nothing of them is shown
  const noImages = raw.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  let s = escapeHtml(noImages).replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  s = s
    .replace(
      /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g,
      (_m, t: string, u: string) => `<a href="${u}" rel="nofollow noopener noreferrer">${t}</a>`,
    )
    // a link to anything but https (a relative file, http, mailto) keeps its text only
    .replace(/\[([^\]]+)\]\([^)\s]*\)/g, '$1')
    .replace(
      /&lt;(https:\/\/[^\s&]+)&gt;/g,
      (_m, u: string) => `<a href="${u}" rel="nofollow noopener noreferrer">${u}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>')
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] ?? '')
}

/**
 * The author's README as safe HTML (review of 26 Oct: the module page showed raw `##`, `**` and fences). A small
 * subset of Markdown, no dependency: headings, paragraphs, lists, fenced code (an unclosed fence at the end of a cut
 * excerpt is closed), block quotes, tables, rules, inline code, emphasis and https links. Every text is escaped
 * first, so no HTML of the author reaches the page. Headings start at `topLevel` (h3 under the page's h2) and never
 * skip a level.
 */
export function readmeHtml(text: string, topLevel = 3): string {
  return readmeBlocks(text, topLevel).join('\n')
}

/** The blocks of readmeHtml one by one (a heading, a paragraph, a list, a code block, a table, a quote, a rule). */
export function readmeBlocks(text: string, topLevel = 3): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []
  let prevHeading = topLevel - 1
  // heading depths outside code blocks only: a `# comment` in a bash block is not a heading (review of 26 Oct)
  const depths = new Set<number>()
  let open: string | null = null
  for (const l of lines) {
    const f = /^\s*(```|~~~)/.exec(l)
    if (f) {
      if (!open) open = f[1]!
      else if (l.trimStart().startsWith(open)) open = null
      continue
    }
    const d = open ? 0 : (/^(#{1,6})\s/.exec(l)?.[1]?.length ?? 0)
    if (d) depths.add(d)
  }
  const ranks = [...depths].sort((a, b) => a - b)
  const flushPara = (): void => {
    const t = readmeInline(para.join(' ')).trim()
    if (t) out.push(`<p>${t}</p>`)
    para = []
  }
  const flushList = (): void => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${readmeInline(i)}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  const flushQuote = (): void => {
    if (quote.length) out.push(`<blockquote><p>${readmeInline(quote.join(' '))}</p></blockquote>`)
    quote = []
  }
  const flushAll = (): void => {
    flushPara()
    flushList()
    flushQuote()
  }
  const cells = (row: string): string[] =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      flushAll()
      const body: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith(fence[1]!)) body.push(lines[i++] ?? '')
      while (body.length && !body[body.length - 1]!.trim()) body.pop()
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }
    if (!line.trim()) {
      flushAll()
      continue
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      flushAll()
      const level = Math.min(6, topLevel + ranks.indexOf(h[1]!.length), prevHeading + 1)
      prevHeading = level
      if (h[2]) out.push(`<h${level}>${readmeInline(h[2])}</h${level}>`)
      continue
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll()
      out.push('<hr>')
      continue
    }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      flushAll()
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && /^\s*\|/.test(lines[i] ?? '')) rows.push(cells(lines[i++] ?? ''))
      i--
      out.push(
        `<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${readmeInline(c)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${readmeInline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      )
      continue
    }
    const q = /^\s*>\s?(.*)$/.exec(line)
    if (q) {
      flushPara()
      flushList()
      if (q[1]) quote.push(q[1])
      continue
    }
    const li = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line)
    if (li) {
      flushPara()
      flushQuote()
      const tag = li[1] ? 'ul' : 'ol'
      if (list && list.tag !== tag) flushList()
      list ??= { tag, items: [] }
      list.items.push(li[3] ?? '')
      continue
    }
    // a line that continues a list item or a quote
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`
      continue
    }
    if (quote.length) {
      quote.push(line.trim())
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flushAll()
  return out
}

/**
 * The opening of a README and the rest (review of 26 Oct: a long README with its own install steps read as the
 * catalog's instructions). The opening is the title and the first two blocks of text before the next heading; the
 * rest is shown folded. A rest of one block is not worth a fold: then everything is the opening.
 */
export function readmeFold(blocks: readonly string[]): { intro: string[]; rest: string[] } {
  const isHeading = (b: string): boolean => /^<h[1-6]>/.test(b)
  let i = 0
  while (i < blocks.length && isHeading(blocks[i]!)) i++
  let text = 0
  while (i < blocks.length && !isHeading(blocks[i]!) && text < 2) {
    i++
    text++
  }
  const rest = blocks.slice(i)
  return rest.length > 1 ? { intro: blocks.slice(0, i), rest } : { intro: [...blocks], rest: [] }
}
