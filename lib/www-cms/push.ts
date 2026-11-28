// `yarn om www-push` (Strapi CMS spec 2026-11-27-www-strapi-cms.md, API Contracts and Step 3.1): the files of
// www/content and the media of www/public/media and www/public/files into Strapi, upserted by slug, idempotent.
//
// - Media first, matched by folder, name and SHA-256: a file of the same path and bytes is the same upload, so a
//   second run uploads nothing; other bytes replace the upload in place (same id, so documents keep it). Each file goes
//   into the Media Library folder of its directory (`/media/blog`), and that folder's path into its caption, from which
//   the pull reads it (the content API does not tell an API token which folder a file is in). Strapi 5.64.0 creates folders only through its
//   admin API, which an API token does not reach, so the folders must exist: the push names the missing ones and
//   writes nothing.
// - Documents in the spec's order: dictionaries, authors and categories, then partners, case studies, posts, landings
//   (two passes: documents, then `alternateOf` and `related`), pages, single types, redirects; the job, which relates to
//   nothing, goes with the posts. Relations are set by the `documentId` the instance gave the related document, looked
//   up by slug.
// - A document is compared with the file through the mapping (fromDocument of what Strapi holds against the entry of
//   the file), so `unchanged` means the pull would write the same entry; only a difference is written.
// - Status: a new document follows the file (`draft: true` stays a draft); an existing one keeps its Strapi status
//   unless --publish-as-files, which publishes a document whose file is published. The REST API of 5.64.0 has no
//   unpublish, so a published document whose file is a draft is reported as refused, never deleted.
import { readFileSync, statSync } from 'node:fs'
import { sha256 } from '../import-webflow/output.ts'
import { entriesOf } from './files.ts'
import {
  COMPONENTS,
  fromDocument,
  toDocument,
  TYPES,
  type Field,
  type FileEntry,
  type MediaIndex,
  type StrapiDocument,
  type StrapiMedia,
  type StrapiType,
} from './model.ts'
import { StrapiError, type Client } from './rest.ts'
import {
  readFolders,
  readType,
  readUploads,
  strapiMediaIndex,
  type Status,
  type StrapiMediaIndex,
  type Upload,
} from './strapi.ts'
import { readContent, readMedia } from './tree.ts'

/** The Pages file limit and the upload limit of cms/config: 25 MiB. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024

/** The order of the types (spec, API Contracts, www-push). */
export const PUSH_ORDER = [
  'author',
  'blog-category',
  'case-study-category',
  'partner-tier',
  'partner-industry',
  'partner-service',
  'partner-language',
  'partner-location',
  'partner',
  'case-study',
  'blog-post',
  'job',
  'landing',
  'page',
  'navigation',
  'footer',
  'landing-template',
  'redirect',
] as const

/** The relations of a landing set in its second pass, once every landing exists. */
const LANDING_RELATIONS = ['alternateOf', 'related'] as const

export interface PushOptions {
  client: Client
  contentDir: string
  publicDir: string
  /** Only these types (a source such as `blog` or `navigation.json`, or an API id such as `blog-post`). */
  only?: ReadonlySet<string>
  dryRun?: boolean
  publishAsFiles?: boolean
  log?: (line: string) => void
}

export interface TypeCount {
  created: number
  updated: number
  unchanged: number
}

export interface PushReport {
  types: Record<string, TypeCount>
  media: { uploaded: number; replaced: number; unchanged: number }
  /** Every value Strapi (or the mapping) refused, with its file and field. */
  refused: string[]
  /** Media Library folders the files need that do not exist; the push writes nothing while any is missing. */
  missingFolders: string[]
  /** Documents created or updated and media uploaded or replaced (in a dry run: that would be). */
  changed: number
  dryRun: boolean
}

const MIME: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const mimeOf = (name: string): string =>
  MIME[name.slice(name.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream'
const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))
const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** Deep equality of two entries' values: object keys in any order, lists in order. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => same(x, b[i]))
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => k in b && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** An entry without its draft flag and without some fields, for a comparison. */
function comparable(e: FileEntry, without: readonly string[] = []): unknown {
  const data = { ...e.data }
  delete data.draft
  for (const k of without) delete data[k]
  return { data, body: e.body }
}

/** How a document of a type is written: the body of a REST create or update, by the type's fields. */
function toWrite(
  fields: readonly Field[],
  value: Record<string, unknown>,
  docId: (target: string, slug: string) => string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const comp = (uid: string, v: unknown) => toWrite(COMPONENTS[uid] ?? [], v as Record<string, unknown>, docId)
  for (const f of fields) {
    switch (f.kind) {
      case 'scalar': {
        const n = f.name ?? f.key
        out[n] = value[n]
        break
      }
      case 'media': {
        const n = f.name ?? f.key
        const m = value[n] as StrapiMedia | null
        out[n] = m ? m.id : null
        break
      }
      case 'relation': {
        const v = value[f.key]
        if (f.many) out[f.key] = (v as { slug: string }[]).map((r) => docId(f.target, r.slug))
        else out[f.key] = v ? docId(f.target, (v as { slug: string }).slug) : null
        break
      }
      case 'lines':
        out[f.key] = (value[f.key] as { text: unknown }[]).map((l) => ({ text: l.text }))
        break
      case 'component': {
        const n = f.name ?? f.key
        const v = value[n]
        out[n] = f.repeatable ? (v as unknown[]).map((c) => comp(f.component, c)) : v ? comp(f.component, v) : null
        break
      }
      case 'pair':
        for (const n of f.names) {
          const v = value[n]
          out[n] = v === null ? null : f.component ? comp(f.component, v) : v
        }
        break
      case 'flat':
        for (const [, n] of f.fields) out[n] = value[n]
        break
      case 'zone':
        out[f.key] = (value[f.key] as Record<string, unknown>[]).map((b) => ({
          __component: b.__component,
          ...comp(String(b.__component), b),
        }))
        break
    }
  }
  return out
}

/** What Strapi holds of one document: its id and each version (the published one is null for a draft). */
interface Held {
  documentId: string
  draft: StrapiDocument | null
  published: StrapiDocument | null
}

/** A refused value as one line: the file, the field and Strapi's message. */
function refusedLines(file: string, err: unknown): string[] {
  if (err instanceof StrapiError && err.kind === 'answer') {
    const errors = (err.details as { errors?: { path?: unknown[]; message?: string }[] } | undefined)?.errors
    if (Array.isArray(errors) && errors.length > 0)
      return errors.map((e) => `${file}: ${(e.path ?? []).join('.') || '(document)'}: ${e.message ?? err.message}`)
    return [`${file}: ${err.message}`]
  }
  return [`${file}: ${(err as Error).message}`]
}

const fileOf = (type: StrapiType, id: string): string =>
  type.kind === 'single' ? type.source : type.source === 'redirects' ? `redirects.yaml ${id}` : `${type.source}/${id}`

export async function push(opts: PushOptions): Promise<PushReport> {
  const { client } = opts
  const log = opts.log ?? (() => {})
  const dryRun = opts.dryRun ?? false
  const report: PushReport = {
    types: {},
    media: { uploaded: 0, replaced: 0, unchanged: 0 },
    refused: [],
    missingFolders: [],
    changed: 0,
    dryRun,
  }
  const selected = PUSH_ORDER.map((id) => TYPES.find((t) => t.apiId === id)!).filter(
    (t) => !opts.only || opts.only.has(t.apiId) || opts.only.has(t.source),
  )

  // the files, read before anything is sent, so a file the mapping cannot read stops nothing half way
  const { bySource } = readContent(opts.contentDir)
  const entries = new Map<string, FileEntry[]>()
  for (const t of selected) {
    const list: FileEntry[] = []
    for (const f of bySource.get(t.source) ?? []) {
      try {
        list.push(...entriesOf(t.source, f))
      } catch (err) {
        report.refused.push(`${f.path}: ${(err as Error).message}`)
      }
    }
    entries.set(
      t.apiId,
      list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    )
  }

  // media
  const local = readMedia(opts.publicDir)
  const folders = await readFolders(client)
  const folderId = new Map(folders.map((f) => [f.namePath, f.id]))
  report.missingFolders = [...new Set(local.map((m) => dirOf(m.path)))].filter((d) => !folderId.has(d)).sort()
  if (report.missingFolders.length > 0) {
    log(`missing Media Library folders: ${report.missingFolders.join(', ')}`)
    if (!dryRun) return report
  }
  const index = strapiMediaIndex(await readUploads(client))
  const uploads = new Map<string, Upload>(index.byPath)
  for (const m of local) {
    const size = statSync(m.abs).size
    if (size > MAX_FILE_BYTES) {
      report.refused.push(`${m.path}: ${size} bytes, above the limit of ${MAX_FILE_BYTES} (25 MiB)`)
      continue
    }
    const bytes = new Uint8Array(readFileSync(m.abs))
    const held = uploads.get(m.path)
    if (held && (await sameBytes(client, held, bytes))) {
      report.media.unchanged++
      continue
    }
    if (held) report.media.replaced++
    else report.media.uploaded++
    log(`${held ? 'replace' : 'upload'} ${m.path}`)
    if (dryRun) continue
    const form = new FormData()
    // the site folder in the caption too: the content API does not tell which folder a file is in (lib/www-cms/strapi.ts)
    form.append('fileInfo', JSON.stringify({ name: nameOf(m.path), caption: dirOf(m.path) }))
    if (!held) form.append('folder', String(folderId.get(dirOf(m.path))))
    form.append('files', new Blob([bytes], { type: mimeOf(m.path) }), nameOf(m.path))
    const answer = await client.json('POST', '/api/upload', {
      form,
      ...(held ? { query: { id: held.id } } : {}),
    })
    const file = (Array.isArray(answer) ? answer[0] : answer) as Upload | undefined
    if (!file || typeof file.id !== 'number')
      throw new StrapiError('answer', `POST /api/upload: no file in the answer for ${m.path}`)
    uploads.set(m.path, file)
  }
  const mediaIds: MediaIndex = {
    toMedia(path) {
      const f = uploads.get(path)
      if (!f) {
        if (dryRun)
          return { id: 0, documentId: `planned ${path}`, name: nameOf(path), url: '', ext: '', mime: '', hash: '' }
        throw new Error(`${path}: no upload of that path (it is not in ${opts.publicDir})`)
      }
      return f
    },
    toPath: () => {
      throw new Error('not used by the push')
    },
  }

  // what Strapi holds, for every type: selected ones are compared, the others are looked up for relations
  const held = new Map<string, Map<string, Held>>()
  for (const t of TYPES) held.set(t.apiId, await readHeld(client, t))
  // a dry run creates nothing: a relation to a document the run would create is to a planned id
  const planned = new Map(
    TYPES.map((t) => [
      t.apiId,
      new Set(
        (bySource.get(t.source) ?? []).flatMap((f) => {
          try {
            return entriesOf(t.source, f).map((e) => e.id)
          } catch {
            return []
          }
        }),
      ),
    ]),
  )
  const docId = (target: string, slug: string): string => {
    const h = held.get(target)?.get(slug)
    if (h) return h.documentId
    if (dryRun && planned.get(target)?.has(slug)) return `planned ${target} ${slug}`
    throw new Error(`no ${target} with the slug ${slug} in Strapi`)
  }
  // a version is read as the document's status: the draft version of a published document has no publishedAt either
  const entryOf = (t: StrapiType, d: StrapiDocument, published: boolean): FileEntry =>
    fromDocument(t, { ...d, publishedAt: published ? (d.publishedAt ?? 'published') : null }, index)

  /** Whether what Strapi holds equals the entry, for the versions the target status shows. */
  const equal = (t: StrapiType, h: Held | undefined, e: FileEntry, target: Status, without: readonly string[] = []) => {
    if (!h) return false
    const versions = target === 'published' ? [h.published, h.draft] : [h.draft]
    try {
      return versions.every(
        (v) => v !== null && same(comparable(entryOf(t, v, h.published !== null), without), comparable(e, without)),
      )
    } catch {
      // a document the mapping cannot read is rewritten from the file
      return false
    }
  }

  async function write(t: StrapiType, e: FileEntry, h: Held | undefined, target: Status, fields?: readonly string[]) {
    const doc = toDocument(t, e, { media: mediaIds })
    const body = toWrite(t.fields, doc, docId)
    const data: Record<string, unknown> = fields
      ? Object.fromEntries(fields.map((k) => [k, body[k]]))
      : {
          ...(t.kind === 'collection' ? { slug: e.id } : {}),
          ...Object.fromEntries(Object.entries(body).filter(([k]) => !omitted(t, k))),
          ...(t.body ? { body: e.body } : {}),
        }
    if (dryRun) return
    const query = { status: target }
    const answer = (await client.json(
      t.kind === 'single' ? 'PUT' : h ? 'PUT' : 'POST',
      t.kind === 'single' || !h ? t.route : `${t.route}/${h.documentId}`,
      { query, body: { data } },
    )) as { data?: { documentId?: unknown } } | null
    const id = answer?.data?.documentId
    if (typeof id !== 'string') throw new StrapiError('answer', `${t.route}: no documentId in the answer`)
    const key = t.kind === 'single' ? t.source : e.id
    const map = held.get(t.apiId)!
    if (!map.has(key)) map.set(key, { documentId: id, draft: null, published: null })
  }
  /** The fields a first pass leaves out: a landing's relations to landings, set once every landing exists. */
  const omitted = (t: StrapiType, k: string): boolean =>
    t.apiId === 'landing' && (LANDING_RELATIONS as readonly string[]).includes(k)

  for (const t of selected) {
    const count: TypeCount = { created: 0, updated: 0, unchanged: 0 }
    report.types[t.apiId] = count
    const map = held.get(t.apiId)!
    const second: { e: FileEntry; target: Status }[] = []
    for (const e of entries.get(t.apiId) ?? []) {
      const key = t.kind === 'single' ? t.source : e.id
      const file = fileOf(t, e.id)
      const h = map.get(key)
      const fileDraft = t.draft !== 'none' && e.data.draft === true
      const wanted: Status = fileDraft ? 'draft' : 'published'
      const target: Status = h && !opts.publishAsFiles ? (h.published ? 'published' : 'draft') : wanted
      if (h?.published && fileDraft && opts.publishAsFiles) {
        report.refused.push(
          `${file}: published in Strapi and a draft in the file; unpublish it in the admin (the REST API has no unpublish)`,
        )
        continue
      }
      if (equal(t, h, e, target)) {
        count.unchanged++
        continue
      }
      const relationsOnly = t.apiId === 'landing' && h !== undefined && equal(t, h, e, target, LANDING_RELATIONS)
      try {
        if (!relationsOnly) await write(t, e, h, target)
        if (h) count.updated++
        else count.created++
        log(`${h ? 'update' : 'create'} ${file} (${target})`)
        if (t.apiId === 'landing') second.push({ e, target })
      } catch (err) {
        if (err instanceof StrapiError && err.kind !== 'answer') throw err
        report.refused.push(...refusedLines(file, err))
      }
    }
    // landings, second pass: alternateOf and related, now that every landing has its documentId
    for (const { e, target } of second) {
      const h = map.get(e.id)
      if (h && equal(t, h, e, target)) continue
      try {
        if (!(dryRun && !h)) await write(t, e, h, target, LANDING_RELATIONS)
      } catch (err) {
        if (err instanceof StrapiError && err.kind !== 'answer') throw err
        report.refused.push(...refusedLines(fileOf(t, e.id), err))
      }
    }
  }
  report.changed =
    Object.values(report.types).reduce((n, c) => n + c.created + c.updated, 0) +
    report.media.uploaded +
    report.media.replaced
  return report
}

/** Both versions of every document of a type, by slug (single types by source). */
async function readHeld(client: Client, t: StrapiType): Promise<Map<string, Held>> {
  const out = new Map<string, Held>()
  const key = (d: StrapiDocument) => (t.kind === 'single' ? t.source : String(d.slug))
  for (const d of await readType(client, t, 'draft'))
    out.set(key(d), { documentId: d.documentId, draft: d, published: null })
  for (const d of await readType(client, t, 'published')) {
    const h = out.get(key(d))
    if (h) h.published = d
    else out.set(key(d), { documentId: d.documentId, draft: null, published: d })
  }
  return out
}

/** Whether an upload holds these bytes: by size first (Strapi keeps it in kB), then by SHA-256 of a download. */
async function sameBytes(client: Client, file: Upload, bytes: Uint8Array): Promise<boolean> {
  if (typeof file.size === 'number' && Math.abs(file.size * 1000 - bytes.length) > 10) return false
  return sha256(await client.bytes(file.url)) === sha256(bytes)
}

export type { StrapiMediaIndex }
