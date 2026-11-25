// Reader of a Webflow export directory in the shape of the 24 and 25 Nov export (spec API Contracts): webflow-raw/
// with pages.json, dom/*.json, collections.json, col_*.json, items_*.json, assets.json and sitemap.xml, plus strony/
// with the visible text of each page (<slug>.txt) and _pages.json. macOS resource forks (`._*`) are ignored.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface WfField {
  slug: string
  type: string
  validations?: { options?: { id: string; name: string }[]; collectionId?: string } | null
}

export interface WfCollection {
  id: string
  slug: string
  fields: WfField[]
}

export interface WfItem {
  id: string
  lastPublished: string | null
  lastUpdated: string | null
  createdOn: string | null
  isArchived: boolean
  isDraft: boolean
  fieldData: Record<string, unknown>
}

export interface WfPage {
  id: string
  title: string | null
  slug: string | null
  collectionId: string | null
  draft: boolean
  archived: boolean
  seo?: { title: string | null; description: string | null } | null
  openGraph?: {
    title: string | null
    description: string | null
    imageUrl: string | null
    imageAssetId: string | null
  } | null
  publishedPath?: string | null
}

export type WfNode =
  | { id: string; type: 'text'; text: { html: string; text: string }; attributes?: Record<string, string> }
  | { id: string; type: 'image'; image: { alt: string | null; assetId: string | null } }
  | { id: string; type: 'html-embed'; html: string }
  | { id: string; type: string; [k: string]: unknown }

export interface WfAsset {
  id: string
  originalFileName?: string
  displayName?: string
  contentType?: string
  hostedUrl: string
  altText?: string | null
}

export interface WebflowExport {
  dir: string
  collections: Map<string, { schema: WfCollection; items: WfItem[] }>
  pages: WfPage[]
  /** DOM nodes per page id. */
  dom: Map<string, WfNode[]>
  assets: Map<string, WfAsset>
  /** Visible text lines per page slug (strony/<slug>.txt); `home` for `/`. */
  text: Map<string, string[]>
}

export class ExportError extends Error {}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (err) {
    throw new ExportError(`${file}: ${(err as Error).message}`)
  }
}

function list<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[]
  const v = (data as Record<string, unknown> | null)?.[key]
  if (Array.isArray(v)) return v as T[]
  throw new ExportError(`a list of ${key} is expected`)
}

/** Reads an export directory. Throws ExportError when a required file is missing or malformed. */
export function readExport(dir: string): WebflowExport {
  const raw = join(dir, 'webflow-raw')
  if (!existsSync(raw)) throw new ExportError(`${dir}: no webflow-raw/ directory`)
  const visible = (d: string) =>
    existsSync(d)
      ? readdirSync(d)
          .filter((f) => !f.startsWith('._'))
          .sort()
      : []

  const collections = new Map<string, { schema: WfCollection; items: WfItem[] }>()
  for (const f of visible(raw)) {
    const m = /^col_(.+)\.json$/.exec(f)
    if (!m) continue
    const slug = m[1]!
    const itemsFile = join(raw, `items_${slug}.json`)
    if (!existsSync(itemsFile)) throw new ExportError(`${raw}: col_${slug}.json without items_${slug}.json`)
    collections.set(slug, {
      schema: readJson<WfCollection>(join(raw, f)),
      items: list<WfItem>(readJson(itemsFile), 'items'),
    })
  }

  const pagesFile = join(raw, 'pages.json')
  const pages = existsSync(pagesFile) ? list<WfPage>(readJson(pagesFile), 'pages') : []

  const dom = new Map<string, WfNode[]>()
  for (const f of visible(join(raw, 'dom'))) {
    if (!f.endsWith('.json')) continue
    const d = readJson<{ pageId?: string; nodes?: WfNode[] }>(join(raw, 'dom', f))
    const id = d.pageId ?? /_([0-9a-f]{24})\.json$/.exec(f)?.[1]
    if (id && Array.isArray(d.nodes)) dom.set(id, d.nodes)
  }

  const assets = new Map<string, WfAsset>()
  const assetsFile = join(raw, 'assets.json')
  if (existsSync(assetsFile)) for (const a of list<WfAsset>(readJson(assetsFile), 'assets')) assets.set(a.id, a)

  const text = new Map<string, string[]>()
  for (const f of visible(join(dir, 'strony'))) {
    if (!f.endsWith('.txt') || f.startsWith('_')) continue
    text.set(f.slice(0, -4), readFileSync(join(dir, 'strony', f), 'utf8').split('\n'))
  }

  return { dir, collections, pages, dom, assets, text }
}

/** The id a Webflow option field stores for each option name. */
export function optionNames(schema: WfCollection, field: string): Map<string, string> {
  const f = schema.fields.find((x) => x.slug === field)
  return new Map((f?.validations?.options ?? []).map((o) => [o.id, o.name]))
}

/** Requires the fields the writers read, so a changed export shape fails loudly instead of writing empty values. */
export function requireFields(schema: WfCollection, fields: readonly string[]): void {
  const have = new Set(schema.fields.map((f) => f.slug))
  const missing = fields.filter((f) => !have.has(f))
  if (missing.length > 0) throw new ExportError(`col_${schema.slug}.json: no field ${missing.join(', ')}`)
}
