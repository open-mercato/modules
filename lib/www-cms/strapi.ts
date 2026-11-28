// What www-push and www-pull read from Strapi 5 (Strapi CMS spec, API Contracts and Data Model, Media): the documents
// of a type with the explicit `populate` of lib/www-cms/model.ts, the media files of the upload plugin with their
// Media Library folders, and the media index that turns an upload into its site path and back. The content API of
// Strapi 5.64.0 does not tell an API token which folder a file is in (`folder` and `folderPath` are refused in
// `populate`, `filters` and `fields` of /api/upload/files, and /api/upload/folders lists no files), so the push writes
// the site folder of each file into its `caption` as well as putting it in that Media Library folder: an upload whose
// caption is a site folder (`/media/blog`) is `<caption>/<name>`; any other upload, an editor's, is
// `/media/uploads/<name>` (the importer's rule). Two uploads that reach the same path are refused with both names.
// Isomorphic: fetch only, no Node APIs.
import {
  COMPONENTS,
  uploadName,
  type Field,
  type MediaIndex,
  type StrapiDocument,
  type StrapiMedia,
  type StrapiType,
} from './model.ts'
import { PAGE_SIZE, readPages, StrapiError, type Client } from './rest.ts'

export type Status = 'published' | 'draft'

/** The `populate` of a list of fields: every component, zone, media and relation, to its depth. */
export function populateOf(fields: readonly Field[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const component = (uid: string): unknown => {
    const inner = populateOf(COMPONENTS[uid] ?? [])
    return Object.keys(inner).length > 0 ? { populate: inner } : true
  }
  for (const f of fields) {
    switch (f.kind) {
      case 'media':
        out[f.name ?? f.key] = true
        break
      case 'relation':
        out[f.key] = { fields: ['slug'] }
        break
      case 'lines':
        out[f.key] = true
        break
      case 'component':
        out[f.name ?? f.key] = component(f.component)
        break
      case 'pair':
        if (f.component) for (const n of f.names) out[n] = component(f.component)
        break
      case 'zone':
        out[f.key] = { on: Object.fromEntries(Object.values(f.components).map((uid) => [uid, component(uid)])) }
        break
      default:
        break
    }
  }
  return out
}

/** Every document of a type at a status, fully populated; a single type not created yet has none. */
export async function readType(client: Client, type: StrapiType, status: Status): Promise<StrapiDocument[]> {
  const query = { status, populate: populateOf(type.fields) }
  if (type.kind === 'collection') return (await readPages(client, type.route, query)) as StrapiDocument[]
  try {
    const a = (await client.json('GET', type.route, { query })) as { data?: unknown } | null
    if (a?.data === null || a?.data === undefined) return []
    if (typeof a.data !== 'object' || Array.isArray(a.data))
      throw new StrapiError('answer', `GET ${type.route}: no document in the answer`)
    return [a.data as StrapiDocument]
  } catch (err) {
    if (err instanceof StrapiError && err.status === 404) return []
    throw err
  }
}

/** A Media Library folder as the content API lists it. */
export interface StrapiFolder {
  id: number
  name: string
  /** The folder's path of names, `/media/blog`. */
  namePath: string
}

/** An upload as the content API lists it; `caption` holds the site folder the push put it in. */
export type Upload = StrapiMedia & { size?: number; updatedAt?: string; caption?: string | null }

export async function readFolders(client: Client): Promise<StrapiFolder[]> {
  const folders = (await readPages(client, '/api/upload/folders')) as StrapiFolder[]
  for (const f of folders)
    if (typeof f.id !== 'number' || typeof f.namePath !== 'string')
      throw new StrapiError('answer', 'GET /api/upload/folders: a folder without its id or namePath')
  return folders
}

/**
 * Every upload, from GET /api/upload/files: the list route a read-only token reaches (5.64.0 keeps /files/page from it).
 * It answers a plain list without `meta` and pages by `start` and `limit`, so the read pages at PAGE_SIZE until a shorter page and fails on a page
 * longer than PAGE_SIZE: a changed limit can stop the read, never shorten it.
 */
export async function readUploads(client: Client): Promise<Upload[]> {
  const out: Upload[] = []
  for (let page = 1; ; page++) {
    const a = await client.json('GET', '/api/upload/files', {
      // this route pages by start and limit only; it ignores pagination[page] and pagination[pageSize]
      query: { start: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, sort: ['id:asc'] },
    })
    if (!Array.isArray(a)) throw new StrapiError('answer', `GET /api/upload/files page ${page}: no list`)
    if (a.length > PAGE_SIZE)
      throw new StrapiError(
        'answer',
        `GET /api/upload/files page ${page}: ${a.length} files, more than the page size ${PAGE_SIZE}`,
      )
    out.push(...(a as Upload[]))
    if (a.length < PAGE_SIZE) return out
  }
}

/** A site folder the push lays files out in: a path of slug-like names under `/media` or `/files`. */
export const siteFolder = (path: string): boolean => /^\/(?:media|files)(?:\/[a-z0-9][a-z0-9._-]*)*$/.test(path)

/** The site path of an upload, from the site folder in its caption. */
export function pathOf(file: Upload): string {
  const folder = typeof file.caption === 'string' ? file.caption : undefined
  if (folder !== undefined && siteFolder(folder) && !file.name.includes('/')) return `${folder}/${file.name}`
  return `/media/uploads/${uploadName(file.name)}`
}

/** The media index of a Strapi instance: every upload by site path and by documentId. */
export interface StrapiMediaIndex extends MediaIndex {
  /** Every upload with its site path, sorted by path. */
  files: readonly { path: string; file: Upload }[]
  byPath: ReadonlyMap<string, Upload>
}

export function strapiMediaIndex(uploads: readonly Upload[]): StrapiMediaIndex {
  const byPath = new Map<string, Upload>()
  const byId = new Map<string, string>()
  const clashes: string[] = []
  for (const file of uploads) {
    const path = pathOf(file)
    const other = byPath.get(path)
    if (other)
      clashes.push(`${path}: the uploads ${other.name} (${other.documentId}) and ${file.name} (${file.documentId})`)
    byPath.set(path, file)
    byId.set(file.documentId, path)
  }
  if (clashes.length > 0)
    throw new Error(`two uploads reach the same site path, nothing is overwritten:\n${clashes.join('\n')}`)
  return {
    files: [...byPath].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, file]) => ({ path, file })),
    byPath,
    toMedia(path) {
      const f = byPath.get(path)
      if (!f) throw new Error(`${path}: no upload of that path in Strapi`)
      return f
    },
    toPath(file) {
      const p = byId.get(file.documentId)
      if (p === undefined) throw new Error(`the upload ${file.name} (${file.documentId}) is not in the media library`)
      return p
    },
  }
}
