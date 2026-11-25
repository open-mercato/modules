// A fresh export directory from the Webflow API v2 (spec API Contracts, `yarn om webflow-export`), in the shape the
// importer reads: webflow-raw/ (collections, items, pages, DOM, assets, sitemap) and strony/ (the visible text of each
// static page, from its public HTML). Read-only token (`cms:read`, `pages:read`, `assets:read`); the token is sent in
// the Authorization header only and never written, logged or put in an error message.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { documentTextNodes } from './richtext.ts'

export const API = 'https://api.webflow.com/v2'
export const SITE_ORIGIN = 'https://www.openmercato.com'

export interface ExportOptions {
  token: string
  siteId: string
  dir: string
  /** Fetch the public HTML of each static page for strony/ (default true). */
  text: boolean
  fetch?: typeof fetch
  /** Waits between retries; a test passes a no-op. */
  sleep?: (ms: number) => Promise<void>
  log?: (line: string) => void
}

export class WebflowApiError extends Error {}

const PAGE = 100
const RETRIES = 5

interface Paged {
  pagination?: { limit?: number; offset?: number; total?: number }
}

/** Calls the API; `path` never holds the token, so errors can name it. Retries 429 and 5xx with backoff. */
async function api<T>(opts: ExportOptions, path: string): Promise<T> {
  const f = opts.fetch ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  for (let attempt = 0; ; attempt++) {
    const res = await f(`${API}${path}`, {
      headers: { authorization: `Bearer ${opts.token}`, accept: 'application/json' },
    })
    if (res.ok) return (await res.json()) as T
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= RETRIES) {
      // the body of a Webflow error holds a message and a code, never the token
      const body = (await res.text()).slice(0, 300)
      throw new WebflowApiError(`GET ${path}: HTTP ${res.status} ${body}`)
    }
    const after = Number(res.headers.get('retry-after'))
    await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * 2 ** attempt)
  }
}

/** All pages of a paged list endpoint (`?offset&limit`), concatenated. */
async function all<T>(opts: ExportOptions, path: string, key: string): Promise<{ list: T[]; total: number }> {
  const list: T[] = []
  let total = 0
  for (let offset = 0; ; offset += PAGE) {
    const sep = path.includes('?') ? '&' : '?'
    const page = await api<Paged & Record<string, unknown>>(opts, `${path}${sep}offset=${offset}&limit=${PAGE}`)
    const items = (page[key] as T[] | undefined) ?? []
    list.push(...items)
    total = page.pagination?.total ?? list.length
    if (items.length === 0 || list.length >= total) break
  }
  return { list, total }
}

function write(dir: string, file: string, value: unknown): void {
  const path = join(dir, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
}

/** The visible text of a page's HTML, one text node per line, as strony/<slug>.txt holds it. */
export function visibleText(html: string): string {
  return documentTextNodes(html).join('\n')
}

interface PageInfo {
  id: string
  slug: string | null
  title: string | null
  collectionId: string | null
  draft: boolean
  archived: boolean
  publishedPath?: string | null
  seo?: { title: string | null; description: string | null } | null
}

/** Writes the export; returns what it wrote, for the summary. */
export async function exportSite(
  opts: ExportOptions,
): Promise<{ collections: number; items: number; pages: number; assets: number }> {
  const log = opts.log ?? (() => {})
  const raw = join(opts.dir, 'webflow-raw')
  const site = encodeURIComponent(opts.siteId)

  const { collections } = await api<{ collections: { id: string; slug: string }[] }>(opts, `/sites/${site}/collections`)
  write(raw, 'collections.json', { collections })
  let items = 0
  for (const c of collections) {
    const id = encodeURIComponent(c.id)
    write(raw, `col_${c.slug}.json`, await api(opts, `/collections/${id}`))
    const { list } = await all(opts, `/collections/${id}/items`, 'items')
    write(raw, `items_${c.slug}.json`, list)
    items += list.length
    log(`collection ${c.slug}: ${list.length} items`)
  }

  const { list: pages } = await all<PageInfo>(opts, `/sites/${site}/pages`, 'pages')
  write(raw, 'pages.json', pages)
  for (const p of pages) {
    const { list: nodes, total } = await all(opts, `/pages/${encodeURIComponent(p.id)}/dom`, 'nodes')
    write(raw, `dom/${p.slug || 'home'}_${p.id}.json`, {
      pageId: p.id,
      nodes,
      pagination: { total, fetched: nodes.length },
    })
  }
  log(`pages: ${pages.length}`)

  const { list: assets } = await all(opts, `/sites/${site}/assets`, 'assets')
  write(raw, 'assets.json', assets)
  log(`assets: ${assets.length}`)

  const f = opts.fetch ?? fetch
  const sitemap = await f(`${SITE_ORIGIN}/sitemap.xml`)
  if (!sitemap.ok) throw new WebflowApiError(`GET ${SITE_ORIGIN}/sitemap.xml: HTTP ${sitemap.status}`)
  write(raw, 'sitemap.xml', await sitemap.text())

  if (opts.text) {
    const crawled: { url: string; slug: string; title: string | null; description: string | null }[] = []
    for (const p of pages) {
      if (p.collectionId || p.draft || p.archived || !p.publishedPath) continue
      const url = `${SITE_ORIGIN}${p.publishedPath === '/' ? '' : p.publishedPath}`
      const res = await f(url || SITE_ORIGIN)
      if (!res.ok) {
        log(`text of ${url}: HTTP ${res.status}, skipped`)
        continue
      }
      const slug = p.slug || 'home'
      write(opts.dir, `strony/${slug}.txt`, visibleText(await res.text()))
      crawled.push({ url, slug, title: p.seo?.title ?? p.title, description: p.seo?.description ?? null })
    }
    write(opts.dir, 'strony/_pages.json', crawled)
    log(`page texts: ${crawled.length}`)
  }
  return { collections: collections.length, items, pages: pages.length, assets: assets.length }
}
