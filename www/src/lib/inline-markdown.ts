// A short Markdown field of the frontmatter (a case study's technology stack) as HTML: paragraphs and bullet lists,
// with inline code, bold, italics and links. Every other character is text, escaped. A Markdown body goes through
// Astro's processor instead; this is for the few fields the schemas type as Markdown inside YAML. Isomorphic.

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** One line of text with inline code, bold, italics and links (https, mailto or a site path). */
export function inline(text: string): string {
  const parts = text.split(/(`[^`]+`)/)
  return parts
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${escape(part.slice(1, -1))}</code>`
      return escape(part)
        .replace(/\[([^\]]+)\]\(((?:https:\/\/|mailto:|\/)[^)\s]*)\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?![*\w])/g, '$1<em>$2</em>')
    })
    .join('')
}

/** A Markdown string of paragraphs and bullet lists (`-` or `*`) as HTML. */
export function markdownHtml(md: string): string {
  const out: string[] = []
  let list: string[] = []
  let para: string[] = []
  const flush = (): void => {
    if (list.length > 0) out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`)
    if (para.length > 0) out.push(`<p>${inline(para.join(' '))}</p>`)
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
