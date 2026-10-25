// `om format` (spec 3.4, 4.3, 5.5): descriptor YAML in one canonical layout. Keys are put in the order of
// spec 4.3 with the `yaml` library (comments travel with their keys), collections get the house style of the
// seed files (tags and locator lists inline, providers as inline maps, locators double-quoted), and the text
// is written by Prettier with the repo config, so `om format` and `prettier --check` share one source of format.
//
// Strings are written plain when YAML allows it, else quoted (Prettier then picks double quotes).
// Values never change, with one exception the spec asks for: a `category` that is an alias in
// policy/categories.yml becomes its category ID (an alias names the same category). No key is added or removed,
// unknown keys stay (after the known ones) so that `validate` can name them.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as prettier from 'prettier'
import { isMap, isScalar, isSeq, parseDocument, Scalar, visit, type Document, type Pair, type YAMLMap } from 'yaml'
import { DESCRIPTOR_KEY_ORDER } from '../schema/index.ts'

/** Lists written inline (`[a, b]`), as in the spec 4.3 examples. */
export const FLOW_SEQ_KEYS = ['tags', 'alternatives', 'replaces', 'renamedFrom', 'aliases'] as const
/** Keys whose values are locators (or `core:<id>`): always double-quoted. */
export const LOCATOR_KEYS = ['extends', 'alternatives', 'replaces', 'renamedFrom', 'supersededBy'] as const

/** Key order inside nested maps (schema order of spec 4.3). */
const NESTED_ORDER: Readonly<Record<string, readonly string[]>> = {
  links: ['docs', 'support', 'demo'],
  smoke: ['paths'],
  scriptsRequired: ['reason'],
  declares: ['hosts', 'env'],
  enterprise: ['offerUrl', 'modules'],
}
const PROVIDER_ORDER = ['name', 'label'] as const

export class FormatError extends Error {}

export interface FormatOptions {
  /** Category aliases from policy/categories.yml (`alias -> category id`). */
  categoryAliases?: ReadonlyMap<string, string>
}

export interface FormatResult {
  text: string
  changed: boolean
  /** Human notes about value rewrites (only the category alias). */
  notes: string[]
}

function keyOf(pair: Pair): string | null {
  const k = pair.key
  if (isScalar(k) && typeof k.value === 'string') return k.value
  if (typeof k === 'string') return k
  return null
}

/** Stable sort of a map's pairs by `order`; keys not in `order` keep their relative place after the known ones. */
function sortPairs(map: YAMLMap, order: readonly string[]): void {
  const rank = (p: Pair): number => {
    const k = keyOf(p)
    const i = k === null ? -1 : order.indexOf(k)
    return i < 0 ? order.length : i
  }
  const indexed = map.items.map((p, i) => ({ p, i, r: rank(p) }))
  indexed.sort((a, b) => a.r - b.r || a.i - b.i)
  map.items = indexed.map((x) => x.p)
}

function quoteScalar(node: unknown): void {
  if (isScalar(node) && typeof node.value === 'string') node.type = Scalar.QUOTE_DOUBLE
}

/** Applies key order and house style to a parsed descriptor document in place. Returns value-rewrite notes. */
export function normalizeDocument(doc: Document, opts: FormatOptions = {}): string[] {
  const root = doc.contents
  if (!isMap(root)) throw new FormatError('a descriptor is a YAML map of fields')
  const notes: string[] = []
  // A comment right above the first key belongs to the file, not to whichever key sorts first.
  const first = root.items[0]?.key
  if (isScalar(first) && first.commentBefore) {
    doc.commentBefore = doc.commentBefore ? `${doc.commentBefore}\n${first.commentBefore}` : first.commentBefore
    first.commentBefore = null
  }
  sortPairs(root, DESCRIPTOR_KEY_ORDER)
  for (const [key, order] of Object.entries(NESTED_ORDER)) {
    const node = root.get(key, true)
    if (isMap(node)) sortPairs(node, order)
  }
  // Block collections, plain keys, plain strings wherever YAML allows (the library quotes when plain would misread).
  visit(doc, {
    Map(_, node) {
      node.flow = false
    },
    Seq(_, node) {
      node.flow = false
    },
    Pair(_, pair) {
      if (isScalar(pair.key)) pair.key.type = Scalar.PLAIN
    },
    Scalar(_, node) {
      if (typeof node.value === 'string') node.type = Scalar.PLAIN
    },
  })
  const providers = root.get('providers', true)
  if (isSeq(providers))
    for (const item of providers.items)
      if (isMap(item)) {
        sortPairs(item, PROVIDER_ORDER)
        item.flow = true
      }
  for (const key of FLOW_SEQ_KEYS) {
    const node = root.get(key, true)
    if (isSeq(node)) node.flow = true
  }
  const ent = root.getIn(['enterprise', 'modules'], true)
  if (isSeq(ent)) ent.flow = true
  for (const key of LOCATOR_KEYS) {
    const node = root.get(key, true)
    quoteScalar(node)
    if (isSeq(node)) for (const item of node.items) quoteScalar(item)
  }
  const category = root.get('category', true)
  if (isScalar(category) && typeof category.value === 'string' && opts.categoryAliases) {
    const target = opts.categoryAliases.get(category.value)
    if (target && target !== category.value) {
      notes.push(`category ${category.value} is an alias of ${target}`)
      category.value = target
    }
  }
  return notes
}

async function prettierYaml(text: string, filepath: string): Promise<string> {
  const options = (await prettier.resolveConfig(filepath)) ?? {}
  return prettier.format(text, { ...options, filepath, parser: 'yaml' })
}

/**
 * Formats one descriptor text. `filepath` is where the file lives (or would live) in the repo, so Prettier
 * picks up the repo config. Throws FormatError when the YAML does not parse or is not a map: such a file is
 * left as it is and `validate` explains the error.
 */
export async function formatDescriptorText(
  text: string,
  filepath: string,
  opts: FormatOptions = {},
): Promise<FormatResult> {
  const doc = parseDocument(text, { prettyErrors: true })
  if (doc.errors.length > 0) {
    const first = doc.errors[0] as { message: string }
    throw new FormatError(first.message.split('\n')[0] ?? 'YAML does not parse')
  }
  const notes = normalizeDocument(doc, opts)
  const out = doc.toString({ lineWidth: 0, minContentWidth: 0 })
  const formatted = await prettierYaml(out, filepath)
  return { text: formatted, changed: formatted !== text, notes }
}

/** Category aliases from policy/categories.yml (empty when the file is missing or malformed). */
export function readCategoryAliases(root: string): Map<string, string> {
  const out = new Map<string, string>()
  const file = join(root, 'policy', 'categories.yml')
  if (!existsSync(file)) return out
  const doc = parseDocument(readFileSync(file, 'utf8')).toJS() as {
    categories?: { id?: unknown; aliases?: unknown }[]
  } | null
  for (const c of doc?.categories ?? []) {
    if (typeof c.id !== 'string' || !Array.isArray(c.aliases)) continue
    for (const a of c.aliases) if (typeof a === 'string') out.set(a, c.id)
  }
  return out
}

/** `.yml` files under the given files or directories, sorted. */
export function yamlFiles(paths: readonly string[]): string[] {
  const out: string[] = []
  const walk = (p: string): void => {
    if (!existsSync(p)) return
    if (statSync(p).isDirectory()) {
      for (const n of readdirSync(p).sort()) if (n !== 'node_modules' && !n.startsWith('.')) walk(join(p, n))
    } else if (/\.ya?ml$/.test(p)) out.push(p)
  }
  for (const p of paths) walk(p)
  return [...new Set(out)].sort()
}
