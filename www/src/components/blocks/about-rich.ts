// Markdown of the about, careers, contact, partners and agencies sections as the live Webflow markup writes it: the
// inline marks of inline-markdown.ts, with `**x**` as the live highlighted run (`span.text-color-primary
// .text-weight-medium`) and every link as the live one (the same classes in a card, a new tab for an outside address).
// A paragraph line that ends with `\` ends with a line break, and a line holding `\` alone is one more break. Pure.
import { inline } from '../../lib/inline-markdown.ts'

const EMPHASIS = 'text-color-primary text-weight-medium'

/** One paragraph or line as inline HTML; `strong` gives `**x**` and links the live highlight classes. */
export function richInline(text: string, strong = true): string {
  let html = inline(text)
  html = html.replace(/<a href="(https:[^"]*)">/g, '<a href="$1" target="_blank">')
  if (!strong) return html
  return html
    .replace(/<strong>/g, `<span class="${EMPHASIS}">`)
    .replace(/<\/strong>/g, '</span>')
    .replace(/<a href=/g, `<a class="${EMPHASIS}" href=`)
}

/** A part of a body: a paragraph (its lines) or a bullet list. */
export type RichPart = { kind: 'p'; html: string } | { kind: 'ul'; items: string[] }

/** The paragraphs and bullet lists of a body, in order. */
export function richParts(md: string, strong = true): RichPart[] {
  const parts: RichPart[] = []
  for (const chunk of md.split(/\n\s*\n/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
    if (lines.length === 0) continue
    if (lines.every((l) => /^[-*]\s+/.test(l))) {
      parts.push({ kind: 'ul', items: lines.map((l) => richInline(l.replace(/^[-*]\s+/, ''), strong)) })
      continue
    }
    const html = lines
      .map((l) =>
        l === '\\'
          ? '<br>'
          : l.endsWith('\\')
            ? `${richInline(l.slice(0, -1).trim(), strong)}<br>`
            : richInline(l, strong),
      )
      .join(' ')
      .replace(/<br> /g, '<br>')
    parts.push({ kind: 'p', html })
  }
  return parts
}

/** A heading with `\n` as the live `<br>` and `*x*` as the live highlight span. */
export function headingLines(html: string): string {
  return html.replace(/\n/g, '<br>')
}
