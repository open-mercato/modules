// Line breaks for identifiers (npm names, commands, paths): only at token boundaries, never inside a name.
// Browsers also break after '-' in normal text, so every token is a no-wrap span (`.nw`) and the only break
// opportunities are spaces and a <wbr> after every '/' and before every version '@' (not a leading scope '@').

export interface BreakOptions {
  /** Also break after '.' (event ids, permissions, hosts: `integration_ksef_direct.` + `document.received`). */
  dots?: boolean
  /** Also break after '_' (environment variables: `OM_CHANNEL_IMAP_` + `ALLOW_INSECURE_TRANSPORT`). */
  underscores?: boolean
  /** Also break after '-' (queue and worker names: `sync-akeneo-delete-` + `products`, review r4). */
  hyphens?: boolean
}

/** Splits text into tokens; a break opportunity sits between consecutive tokens (a token may end in a space). */
export function breakSegments(text: string, opts: BreakOptions = {}): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (ch === '@' && cur.length > 0 && !/[\s/]$/.test(cur)) {
      out.push(cur)
      cur = ''
    }
    cur += ch
    const last = i === text.length - 1
    if (
      ch === '/' ||
      ch === ' ' ||
      (opts.dots === true && ch === '.' && !last) ||
      (opts.underscores === true && ch === '_' && !last) ||
      (opts.hyphens === true && ch === '-' && !last)
    ) {
      out.push(cur)
      cur = ''
    }
  }
  if (cur) out.push(cur)
  return out
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/** HTML of no-wrap tokens joined by spaces or <wbr>, for `set:html` in Astro components. */
export function wbrHtml(text: string, opts: BreakOptions = {}): string {
  return breakSegments(text, opts)
    .map((seg, i, all) => {
      const space = seg.endsWith(' ')
      const body = space ? seg.slice(0, -1) : seg
      const sep = i === all.length - 1 ? '' : space ? ' ' : '<wbr>'
      return `${body ? `<span class="nw">${esc(body)}</span>` : ''}${sep}`
    })
    .join('')
}

/**
 * Shortens an identifier for a narrow cell without ending in an ellipsis that hides the distinguishing part:
 * keeps the first `head` and last `tail` characters with '...' in the middle. The full value goes in title=.
 */
export function middleEllipsis(text: string, head = 10, tail = 22): string {
  return text.length <= head + tail + 3 ? text : `${text.slice(0, head)}...${text.slice(-tail)}`
}

/**
 * Shortens a dotted or slashed identifier to at most `max` characters by dropping whole middle segments: the head up
 * to its first boundary and as many trailing segments as fit stay ('event ...document.sent'). Never cuts a segment.
 */
export function segmentEllipsis(text: string, max = 24): string {
  if (text.length <= max) return text
  const cut = text.search(/[\s.:/]/)
  const head = cut > 0 ? text.slice(0, cut + 1) : ''
  const parts = text.slice(head.length).split(/(?<=[.:/])/)
  let tail = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const next = (parts[i] as string) + tail
    if (head.length + 3 + next.length > max && tail) break
    tail = next
  }
  return `${head}...${tail}`
}

/**
 * Longest common prefix of the values that ends on a segment boundary (after '/', '.', ':' or '-'), so a list of
 * routes or events can print the shared part once and only the suffixes per row. Empty when fewer than two values.
 */
export function commonSegmentPrefix(values: string[], min = 6): string {
  if (values.length < 2) return ''
  let p = values[0] as string
  for (const v of values) {
    let i = 0
    while (i < p.length && i < v.length && p[i] === v[i]) i++
    p = p.slice(0, i)
  }
  const cut = Math.max(p.lastIndexOf('/'), p.lastIndexOf('.'), p.lastIndexOf(':'))
  p = cut >= 0 ? p.slice(0, cut + 1) : ''
  // a prefix equal to a whole value would leave an empty row
  if (values.some((v) => v.length === p.length)) {
    const shorter = p.slice(0, -1)
    const c2 = Math.max(shorter.lastIndexOf('/'), shorter.lastIndexOf('.'), shorter.lastIndexOf(':'))
    p = c2 >= 0 ? shorter.slice(0, c2 + 1) : ''
  }
  return p.length >= min ? p : ''
}

/**
 * Prose with identifiers set in mono: exact versions (`0.10.1-develop.7583.1.0c886d0a14`), camelCase symbols
 * (`createRequestContainer`), dotted or snake_case ids (`customers.deal.won`) and npm names become <code> with
 * token wrapping; the rest is escaped text. For headings and summaries computed from data (Radar, hero lines).
 */
export function proseHtml(text: string): string {
  const ID =
    /(@[a-z0-9-]+\/[a-z0-9._-]+(?:@[\w.-]+)?|\b\d+\.\d+\.\d+(?:-[\w.]+)?\b|\b[a-z][a-z0-9]*[A-Z]\w*\b|\b[a-z][a-z0-9]*(?:[._][a-z0-9]+){2,}\b)/g
  let out = ''
  let last = 0
  for (const m of text.matchAll(ID)) {
    const i = m.index ?? 0
    out += esc(text.slice(last, i))
    out += `<code translate="no">${wbrHtml(m[0], { dots: true })}</code>`
    last = i + m[0].length
  }
  return out + esc(text.slice(last))
}
