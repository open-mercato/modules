// Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 1.1a: a Strapi document holds no YAML comment, so no content file
// carries one. redirects.yaml keeps its comments: the pull copies its rules of other sources from the checkout as they
// are (Data Model, `redirect`). Comments are found with the YAML parser, not by a `#` at the start of a line, which a
// block of Markdown in a string can hold.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { isNode, parseDocument, visit } from 'yaml'
import { describe, expect, it } from 'vitest'

const CONTENT = join(import.meta.dirname, '..', '..', 'www', 'content')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ya?ml|md)$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}

/** The comments of a YAML text, each with the key path it sits on. */
function yamlComments(text: string): string[] {
  const doc = parseDocument(text)
  const found: string[] = []
  if (doc.commentBefore) found.push(doc.commentBefore)
  if (doc.comment) found.push(doc.comment)
  visit(doc, (_key, node) => {
    if (!isNode(node)) return
    if (node.commentBefore) found.push(node.commentBefore)
    if (node.comment) found.push(node.comment)
  })
  return found
}

const yamlOf = (path: string, text: string): string =>
  path.endsWith('.md') ? (/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '') : text

describe('comments in www/content', () => {
  it('finds a comment before a key, after a value and inside a list, and not in a block of Markdown', () => {
    expect(yamlComments('# head\na: 1 # tail\nb:\n  # item\n  - x\n')).toHaveLength(3)
    expect(yamlComments('a: |-\n  # A heading\n  text\n')).toEqual([])
  })

  it('leaves none in any content file but redirects.yaml', () => {
    const all = files(CONTENT).filter((f) => !relative(CONTENT, f).startsWith('embeds'))
    expect(all.length).toBeGreaterThan(100)
    const withComments = all
      .filter((f) => yamlComments(yamlOf(f, readFileSync(f, 'utf8'))).length > 0)
      .map((f) => relative(CONTENT, f))
    expect(withComments).toEqual(['redirects.yaml'])
  })
})
