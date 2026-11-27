// A short Markdown field of the frontmatter (a case study's technology stack) as HTML: paragraphs and bullet lists,
// with inline code, bold, italics and links. Every other character is text, escaped. Each link goes through `link`
// (linkAction() of body-html.ts): kept, pointed elsewhere, or rendered as text. A Markdown body goes through Astro's
// processor instead; this is for the few fields the schemas type as Markdown inside YAML. Isomorphic.

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** What becomes of a link: its href, or undefined to render the text alone. */
export type LinkFn = (href: string) => string | undefined

const keepLink: LinkFn = (href) => href

/** One line of text with inline code, bold, italics and links (https, mailto or a site path). */
export function inline(text: string, link: LinkFn = keepLink): string {
  const parts = text.split(/(`[^`]+`)/)
  return parts
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${escape(part.slice(1, -1))}</code>`
      return escape(part)
        .replace(/\[([^\]]+)\]\(((?:https:\/\/|mailto:|\/)[^)\s]*)\)/g, (_, label: string, href: string) => {
          const to = link(href.replace(/&amp;/g, '&'))
          return to === undefined ? label : `<a href="${escape(to)}">${label}</a>`
        })
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?![*\w])/g, '$1<em>$2</em>')
    })
    .join('')
}

/** A Markdown string of paragraphs and bullet lists (`-` or `*`) as HTML. */
export function markdownHtml(md: string, link: LinkFn = keepLink): string {
  const out: string[] = []
  let list: string[] = []
  let para: string[] = []
  const flush = (): void => {
    if (list.length > 0) out.push(`<ul>${list.map((i) => `<li>${inline(i, link)}</li>`).join('')}</ul>`)
    if (para.length > 0) out.push(`<p>${inline(para.join(' '), link)}</p>`)
    list = []
    para = []
  }
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim()
    const item = /^[-*]\s+(.*)$/.exec(line)
    if (line === '') flush()
    else if (item) {
      if (para.length > 0) flush()
      list.push(item[1]!)
    } else {
      if (list.length > 0) flush()
      para.push(line)
    }
  }
  flush()
  return out.join('')
}

/**
 * A heading of a unique page as inline HTML: inline marks as in `inline`, except that `*emphasis*` is the live site's
 * highlighted part of a heading, a `<span>` (the Webflow headings style `h1 span`, `h2 span`).
 */
export function headingHtml(text: string, link: LinkFn = keepLink): string {
  return inline(text, link)
    .replace(/<em>/g, '<span>')
    .replace(/<\/em>/g, '</span>')
}

/**
 * Longer Markdown of a unique page (a `prose` block, a team member's bio) as HTML: headings `##` to `####`, paragraphs,
 * bullet lists and numbered lists (which keep the number they start at), with the inline marks of `inline`.
 */
export function proseHtml(md: string, link: LinkFn = keepLink): string {
  const out: string[] = []
  let para: string[] = []
  let list: { tag: 'ul' | 'ol'; start: number; items: string[] } | undefined
  const flush = (): void => {
    if (para.length > 0) out.push(`<p>${inline(para.join(' '), link)}</p>`)
    if (list) {
      const start = list.tag === 'ol' && list.start !== 1 ? ` start="${list.start}"` : ''
      const lis = list.items.map((i) => `<li>${inline(i, link)}</li>`).join('')
      out.push(`<${list.tag}${start}>${lis}</${list.tag}>`)
    }
    para = []
    list = undefined
  }
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim()
    const heading = /^(#{2,4})\s+(.*)$/.exec(line)
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line)
    if (line === '') flush()
    else if (heading) {
      flush()
      out.push(`<h${heading[1]!.length}>${inline(heading[2]!, link)}</h${heading[1]!.length}>`)
    } else if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol'
      if (para.length > 0 || (list && list.tag !== tag)) flush()
      list ??= { tag, start: numbered ? Number(numbered[1]) : 1, items: [] }
      list.items.push((bullet ? bullet[1] : numbered![2])!)
    } else if (list) list.items[list.items.length - 1] += ` ${line}`
    else para.push(line)
  }
  flush()
  return out.join('')
}
