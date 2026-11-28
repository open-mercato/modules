// What www-push and www-pull read from Strapi 5 (Strapi CMS spec, API Contracts and Data Model, Media): the documents
// of a type with the explicit `populate` of lib/www-cms/model.ts, the media files of the upload plugin with their
// Media Library folders, and the media index that turns an upload into its site path and back. A file in a folder
// whose path starts at `/media` or `/files` is `<folder path>/<name>`, as the push lays them out; any other upload is
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
import { readPages, StrapiError, type Client } from './rest.ts'

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

/** An upload with the folder it is in. */
export type Upload = StrapiMedia & { size?: number; updatedAt?: string; folder?: { id: number } | null }

export async function readFolders(client: Client): Promise<StrapiFolder[]> {
  const folders = (await readPages(client, '/api/upload/folders')) as StrapiFolder[]
  for (const f of folders)
    if (typeof f.id !== 'number' || typeof f.namePath !== 'string')
      throw new StrapiError('answer', 'GET /api/upload/folders: a folder without its id or namePath')
  return folders
}

export async function readUploads(client: Client): Promise<Upload[]> {
  return (await readPages(client, '/api/upload/files/page', { populate: { folder: true } })) as Upload[]
}

/** The site folders the push lays files out in: a path under `/media` or `/files`. */
export const siteFolder = (namePath: string): boolean => /^\/(?:media|files)(?:\/|$)/.test(namePath)

/** The site path of an upload, from its folder. */
export function pathOf(file: Upload, folders: ReadonlyMap<number, string>): string {
  const namePath = file.folder ? folders.get(file.folder.id) : undefined
  if (namePath !== undefined && siteFolder(namePath)) return `${namePath}/${file.name}`
  return `/media/uploads/${uploadName(file.name)}`
}

/** The media index of a Strapi instance: every upload by site path and by documentId. */
export interface StrapiMediaIndex extends MediaIndex {
  /** Every upload with its site path, sorted by path. */
  files: readonly { path: string; file: Upload }[]
  byPath: ReadonlyMap<string, Upload>
}

export function strapiMediaIndex(uploads: readonly Upload[], folders: readonly StrapiFolder[]): StrapiMediaIndex {
  const names = new Map(folders.map((f) => [f.id, f.namePath]))
  const byPath = new Map<string, Upload>()
  const byId = new Map<string, string>()
  const clashes: string[] = []
  for (const file of uploads) {
    const path = pathOf(file, names)
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
