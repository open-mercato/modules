// The content files of www/content as entries of the mapping (lib/www-cms/model.ts) and back (Strapi CMS spec,
// Step 1.2). Files are written as the importer writes them and as the pull will: YAML or frontmatter Markdown from
// lib/import-webflow/output.ts (keys in the mapping's order, dates quoted), JSON for the navbar and the footer, all
// formatted with the repository's Prettier config, LF, UTF-8. The same entries always give the same bytes.
// redirects.yaml is the exception: only its rules of source `manual` are documents; the pull keeps the rest of the
// file, comments included, from the checkout as it is and appends those rules after it.
import { parse, parseDocument, isSeq } from 'yaml'
import { cmp, format, markdownFile, toYaml } from '../import-webflow/output.ts'
import { fileEntries, WWW_SOURCES, type WwwCollection } from '../schema/www-content.ts'
import type { FileEntry, StrapiType } from './model.ts'

/** A file of www/content, by its path under that folder (`blog/x.md`, `authors.yaml`, `navigation.json`). */
export interface ContentFile {
  path: string
  text: string
}

/** Files of www/content that hold no Strapi type, with the reason (spec, Stays in code). */
export const NOT_IN_STRAPI: readonly { match: RegExp; why: string }[] = [
  { match: /^embeds\//, why: 'an HTML embed of a post, code that needs review (Stays in code)' },
  { match: /^\.webflow-import\.json$/, why: 'the import manifest of the Webflow importer, not content' },
]

/** The source of a file of www/content: a collection of lib/schema/www-content.ts or a JSON file; undefined for none. */
export function sourceOf(path: string): string | undefined {
  if (path === 'navigation.json' || path === 'footer.json') return path
  for (const [name, s] of Object.entries(WWW_SOURCES) as [WwwCollection, (typeof WWW_SOURCES)[WwwCollection]][]) {
    if (s.kind === 'file' && path === s.file) return name
    if (
      s.kind === 'entries' &&
      path.startsWith(`${s.dir}/`) &&
      path.endsWith(`.${s.ext}`) &&
      !path.includes('/', s.dir.length + 1)
    )
      return name
  }
  return undefined
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)\n$/

const asObject = (v: unknown, where: string): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${where}: an object is expected`)
  return v as Record<string, unknown>
}

/** The rules of redirects.yaml: the part the pull keeps from the checkout, and the manual rules after it. */
export function splitRedirects(text: string): { kept: string; manual: Record<string, unknown>[] } {
  const doc = parseDocument(text)
  const seq = doc.contents
  if (!isSeq(seq)) return { kept: text, manual: [] }
  const rules = parse(text) as Record<string, unknown>[]
  const first = rules.findIndex((r) => r.source === 'manual')
  if (first < 0) return { kept: text, manual: [] }
  if (rules.slice(first).some((r) => r.source !== 'manual'))
    throw new Error('redirects.yaml: a manual rule before a rule of another source; manual rules go last')
  const start = (seq.items[first] as { range?: [number, number, number] }).range?.[0]
  if (start === undefined) throw new Error('redirects.yaml: no position of the first manual rule')
  // the item's range starts after its "- " marker: cut at the start of its line
  const cut = text.lastIndexOf('\n', start) + 1
  return { kept: text.slice(0, cut), manual: rules.slice(first) }
}

/** The entries of one content file, as the mapping reads them; redirects.yaml gives its manual rules only. */
export function entriesOf(source: string, file: ContentFile): FileEntry[] {
  const where = file.path
  if (source === 'navigation.json' || source === 'footer.json')
    return [{ id: source, data: asObject(JSON.parse(file.text), where) }]
  if (source === 'landingTemplate') return [{ id: source, data: asObject(parse(file.text), where) }]
  if (source === 'redirects')
    return splitRedirects(file.text).manual.map(({ source: _s, ...rule }) => ({ id: String(rule.from), data: rule }))
  const s = WWW_SOURCES[source as WwwCollection]
  if (!s) throw new Error(`${where}: no collection ${source}`)
  if (s.kind === 'file')
    return Object.entries(fileEntries(source as WwwCollection, parse(file.text))).map(([id, data]) => ({ id, data }))
  const id = file.path.slice(s.dir.length + 1, -s.ext.length - 1)
  if (s.ext === 'yaml') return [{ id, data: asObject(parse(file.text), where) }]
  const m = FRONTMATTER.exec(file.text)
  if (!m) throw new Error(`${where}: no frontmatter, or no blank line after it`)
  return [{ id, data: asObject(parse(m[1]!), where), body: m[2]! }]
}

/** Dictionaries are written by `order`, then name, then slug; an entry without an order goes after those with one. */
function dictionaryOrder(a: FileEntry, b: FileEntry): number {
  const oa = typeof a.data.order === 'number' ? a.data.order : undefined
  const ob = typeof b.data.order === 'number' ? b.data.order : undefined
  if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob
  if (oa !== undefined && ob === undefined) return -1
  if (oa === undefined && ob !== undefined) return 1
  return cmp(String(a.data.name), String(b.data.name)) || cmp(a.id, b.id)
}

/**
 * The content files of a type's entries, by path under www/content. `checkout` is the redirects.yaml of the checkout,
 * whose rules of other sources the pull keeps. `repoRoot` resolves the Prettier config.
 */
export async function filesOf(
  type: StrapiType,
  entries: readonly FileEntry[],
  repoRoot: string,
  checkout?: { redirects?: string },
): Promise<ContentFile[]> {
  const source = type.source
  const out = async (path: string, text: string): Promise<ContentFile> => ({
    path,
    text: await format(text, `www/content/${path}`, repoRoot),
  })
  if (source === 'navigation.json' || source === 'footer.json')
    return [await out(source, JSON.stringify(only(entries, source).data))]
  if (source === 'landingTemplate') return [await out('landing-template.yaml', toYaml(only(entries, source).data))]
  if (source === 'redirects') {
    const kept = checkout?.redirects
    if (kept === undefined)
      throw new Error('redirects.yaml: the checkout copy is needed for its rules of other sources')
    const base = splitRedirects(kept).kept
    const manual = [...entries].sort((a, b) => cmp(a.id, b.id)).map((e) => ({ ...e.data, source: 'manual' }))
    return [await out('redirects.yaml', manual.length === 0 ? base : `${base}${toYaml(manual)}`)]
  }
  const s = WWW_SOURCES[source as WwwCollection]
  if (s.kind === 'file') {
    const sorted = [...entries].sort(dictionaryOrder)
    return [await out(s.file, toYaml(Object.fromEntries(sorted.map((e) => [e.id, e.data]))))]
  }
  return Promise.all(
    entries.map((e) =>
      out(`${s.dir}/${e.id}.${s.ext}`, s.ext === 'md' ? markdownFile(e.data, e.body ?? '') : toYaml(e.data)),
    ),
  )
}

function only(entries: readonly FileEntry[], source: string): FileEntry {
  if (entries.length !== 1) throw new Error(`${source}: one entry is expected, not ${entries.length}`)
  return entries[0]!
}
