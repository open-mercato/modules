// `yarn om www-pull` (Strapi CMS spec 2026-11-27-www-strapi-cms.md, API Contracts and Step 3.2): Strapi documents and
// media back into the files of today, same bytes, written into a fresh directory and validated before anything is
// replaced. The only reader of Strapi.
//
// - Read: first an anonymous GET of every type, which must not answer 200 (the Public role is closed); then the media
//   library (its uploads, each at the site folder of its caption) and every type, paged at exactly 100 with the populate of the mapping, published
//   versions unless `--status draft` (the draft version of every published document). `--drafts` adds the documents
//   never published, written with `draft: true`, for the types whose files hold a draft.
// - Write: the files through lib/www-cms/files.ts (Prettier, keys in the mapping's order, no run time in them), the
//   media under public/, and manifest.json (documentId and updatedAt per document and per media file, SHA-256 per media
//   file, the pull time).
// - Validate: the Zod schemas of lib/schema/www-content.ts, the slug and namespace checks of www/content.config.ts,
//   every `<om-embed name>` against www/content/embeds of the checkout, the count tokens, the 25 MiB limit, and the
//   removed-URL rule: a routed entry of the snapshot that is gone needs a redirect from its path (migration spec D3).
// - Media cache: a file whose documentId and updatedAt equal the snapshot manifest's, and whose snapshot copy still has
//   the manifest's SHA-256, is reused; every other file is downloaded, and one whose bytes differ from the manifest is
//   named.
// - Replace, only for a valid tree: the files of www/content a Strapi type holds (embeds and the import manifest stay),
//   public/media and public/files, and manifest.json. `--check` replaces nothing and lists the files that differ.
//
// A tree is laid out as `www/`: `content/`, `public/media/`, `public/files/`, `manifest.json`. The snapshot is
// `--snapshot <dir>` in the same layout, else the tree being replaced.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'
import { COUNT_TOKEN_NAMES } from '../core/www-tokens.ts'
import {
  entryFileProblems,
  footerSchema,
  HOME_PAGE_SLUG,
  landingTemplateEntries,
  navigationSchema,
  routeNamespaceProblems,
  WWW_SOURCES,
  wwwSchemas,
  type WwwCollection,
} from '../schema/www-content.ts'
import { entriesOf, filesOf, sourceOf, type ContentFile } from './files.ts'
import { fromDocument, TYPES, type FileEntry, type StrapiDocument } from './model.ts'
import { MAX_FILE_BYTES } from './push.ts'
import { StrapiError, type Client } from './rest.ts'
import { readType, readUploads, strapiMediaIndex, type Status, type StrapiMediaIndex } from './strapi.ts'
import { heldByStrapi, readContent, readMedia, walk } from './tree.ts'

export interface PullOptions {
  client: Client
  /** The repository: its Prettier config, and the redirects.yaml and embeds of the checkout. */
  root: string
  /** The tree to replace, or to compare with `check`. */
  out: string
  /** The last good tree; the tree being replaced when absent. */
  snapshot?: string
  status: Status
  drafts: boolean
  check: boolean
  log?: (line: string) => void
}

export interface PullReport {
  /** Documents written per type. */
  counts: Record<string, number>
  media: { downloaded: number; reused: number }
  /** Media files whose bytes differ from the snapshot manifest, by site path. */
  changedMedia: string[]
  /** The Strapi `updatedAt` of the newest document. */
  newest: string | null
  /** Why the content is invalid, by file and field; nothing is replaced while there is one. */
  problems: string[]
  /** With `check`: the files that differ from the tree. */
  differs?: string[]
  /** True when the tree was replaced. */
  written: boolean
  /** What the run could not check, for the summary (an empty snapshot). */
  notes: string[]
}

/** Strapi answered, but not as the pull can trust: an environment failure (exit 2), like no answer at all. */
export class PullEnvError extends Error {}

export interface ManifestFile {
  version: 1
  pulledAt: string
  newest: string | null
  documents: { path: string; documentId: string; updatedAt: string | null }[]
  media: { path: string; documentId: string; updatedAt: string | null; sha256: string }[]
}

const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

/** The routes of the collections a URL answers for, by entry id (spec, Removed URLs; www/src/pages). */
const ROUTES: Readonly<Record<string, (id: string) => string>> = {
  pages: (id) => (id === HOME_PAGE_SLUG ? '/' : `/${id}`),
  landings: (id) => `/${id}`,
  blog: (id) => `/blog-posts/${id}`,
  caseStudies: (id) => `/case-studies/${id}`,
  partners: (id) => `/certified-partners/${id}`,
  jobs: (id) => `/careers-jobs/${id}`,
}

/** The URLs of a content tree's routed entries; a draft has none (D6). */
export function routedPaths(bySource: ReadonlyMap<string, readonly ContentFile[]>): Set<string> {
  const out = new Set<string>()
  for (const [source, route] of Object.entries(ROUTES))
    for (const f of bySource.get(source) ?? []) {
      let entries: FileEntry[]
      try {
        entries = entriesOf(source, f)
      } catch {
        continue
      }
      for (const e of entries) if (e.data.draft !== true) out.add(route(e.id))
    }
  return out
}

/** Whether a redirect rule answers for a path: the same path (with or without a trailing slash) or a splat. */
function redirected(path: string, froms: readonly string[]): boolean {
  const bare = path.length > 1 ? path.replace(/\/$/, '') : path
  return froms.some((f) => {
    if (f.endsWith('*')) return bare.startsWith(f.slice(0, -1)) || `${bare}/`.startsWith(f.slice(0, -1))
    const g = f.length > 1 ? f.replace(/\/$/, '') : f
    return g === bare
  })
}

/** Every string of a value, with where it is. */
function strings(value: unknown, at: string, out: { at: string; text: string }[] = []) {
  if (typeof value === 'string') out.push({ at, text: value })
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${at}.${i}`, out))
  else if (typeof value === 'object' && value !== null)
    for (const [k, v] of Object.entries(value)) strings(v, at ? `${at}.${k}` : k, out)
  return out
}

/** Text without its Markdown code (fenced blocks and inline spans), where braces are code, not tokens. */
const withoutCode = (text: string): string => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')

const TOKEN_LIKE = /\{([A-Za-z][A-Za-z0-9]*)\}/g
const EMBED = /<om-embed name="([^"]*)"/g

/** Why a pulled content tree cannot be built, one line per problem, by file and field. */
export function treeProblems(files: readonly ContentFile[], embedsDir: string): string[] {
  const problems: string[] = []
  const schemas = wwwSchemas()
  const bySource = new Map<string, ContentFile[]>()
  for (const f of files) {
    const s = sourceOf(f.path)
    if (s) bySource.set(s, [...(bySource.get(s) ?? []), f])
  }
  const check = (
    path: string,
    r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  ) => {
    if (!r.success)
      for (const i of r.error!.issues)
        problems.push(`${path}: ${i.path.map(String).join('.') || '(entry)'}: ${i.message}`)
  }
  const scan = (path: string, value: unknown, body?: string) => {
    for (const { at, text } of [...strings(value, ''), ...(body === undefined ? [] : [{ at: 'body', text: body }])]) {
      for (const m of text.matchAll(EMBED))
        if (!existsSync(join(embedsDir, `${m[1]}.html`)))
          problems.push(`${path}: ${at}: <om-embed name="${m[1]}"> has no file www/content/embeds/${m[1]}.html`)
      for (const m of withoutCode(text).matchAll(TOKEN_LIKE))
        if (!(COUNT_TOKEN_NAMES as readonly string[]).includes(m[1]!))
          problems.push(
            `${path}: ${at}: unknown count token {${m[1]}} (known: ${COUNT_TOKEN_NAMES.map((n) => `{${n}}`).join(', ')})`,
          )
    }
  }
  for (const f of files) {
    const source = sourceOf(f.path)
    try {
      if (source === 'navigation.json') {
        const data = JSON.parse(f.text)
        check(f.path, navigationSchema().safeParse(data))
        scan(f.path, data)
      } else if (source === 'footer.json') {
        const data = JSON.parse(f.text)
        check(f.path, footerSchema().safeParse(data))
        scan(f.path, data)
      } else if (source === 'landingTemplate') {
        const data = parse(f.text)
        landingTemplateEntries(data)
        scan(f.path, data)
      } else if (source === 'redirects') {
        const rules = (parse(f.text) ?? []) as unknown[]
        if (!Array.isArray(rules)) problems.push(`${f.path}: a list of rules is expected`)
        else rules.forEach((r, i) => check(`${f.path} rule ${i + 1}`, schemas.redirects.safeParse(r)))
        const froms = rules.map((r) => (r as { from?: unknown })?.from)
        for (const from of new Set(froms.filter((x, i) => froms.indexOf(x) !== i)))
          problems.push(`${f.path}: ${String(from)} is given twice`)
      } else if (source) {
        for (const e of entriesOf(source, f)) {
          check(
            `${f.path}${WWW_SOURCES[source as WwwCollection]?.kind === 'file' ? ` ${e.id}` : ''}`,
            schemas[source as WwwCollection].safeParse(e.data),
          )
          scan(f.path, e.data, e.body)
        }
      }
    } catch (err) {
      problems.push(`${f.path}: ${(err as Error).message}`)
    }
  }
  for (const [name, s] of Object.entries(WWW_SOURCES))
    if (s.kind === 'entries')
      problems.push(
        ...entryFileProblems(
          name as WwwCollection,
          (bySource.get(name) ?? []).map((f) => f.path.slice(s.dir.length + 1)),
        ),
      )
  const ids = (source: string, dir: string) => (bySource.get(source) ?? []).map((f) => f.path.slice(dir.length + 1, -5))
  problems.push(...routeNamespaceProblems(ids('pages', 'pages'), ids('landings', 'landings')))
  return problems
}

/** The routed paths of the snapshot that the pulled tree no longer answers and no redirect covers. */
export function removedUrls(
  snapshot: ReadonlyMap<string, readonly ContentFile[]>,
  pulled: readonly ContentFile[],
): string[] {
  const now = new Map<string, ContentFile[]>()
  for (const f of pulled) {
    const s = sourceOf(f.path)
    if (s) now.set(s, [...(now.get(s) ?? []), f])
  }
  const live = routedPaths(now)
  const redirects = now.get('redirects')?.[0]
  const froms = redirects ? ((parse(redirects.text) ?? []) as { from?: unknown }[]).map((r) => String(r?.from)) : []
  return [...routedPaths(snapshot)].filter((p) => !live.has(p) && !redirected(p, froms)).sort()
}

function readManifest(dir: string): ManifestFile | undefined {
  const file = join(dir, 'manifest.json')
  if (!existsSync(file)) return undefined
  const m = JSON.parse(readFileSync(file, 'utf8')) as ManifestFile
  if (m.version !== 1 || !Array.isArray(m.media)) throw new PullEnvError(`${file}: not a manifest of www-pull`)
  return m
}

const latest = (a: string | null, b: unknown): string | null => (typeof b === 'string' && (a === null || b > a) ? b : a)

export async function pull(opts: PullOptions): Promise<PullReport> {
  const { client } = opts
  const log = opts.log ?? (() => {})
  const out = resolve(opts.out)
  const snapshot = resolve(opts.snapshot ?? opts.out)
  const report: PullReport = {
    counts: {},
    media: { downloaded: 0, reused: 0 },
    changedMedia: [],
    newest: null,
    problems: [],
    written: false,
    notes: [],
  }

  // the content API must not answer without a token (spec, Webhook path and its security)
  const open = (
    await Promise.all(
      TYPES.map(async (t) => {
        const status = await client.status(t.route, {
          anonymous: true,
          ...(t.kind === 'collection' ? { query: { pagination: { pageSize: 1 } } } : {}),
        })
        return status === 200 ? t.route : undefined
      }),
    )
  ).filter((x): x is string => x !== undefined)
  if (open.length > 0)
    throw new PullEnvError(
      `Strapi answers an anonymous GET of ${open.join(', ')} with 200: the Public role can read the content API; remove its permissions (the bootstrap of cms/ empties the role at every start)`,
    )

  let media: StrapiMediaIndex
  try {
    media = strapiMediaIndex(await readUploads(client))
  } catch (err) {
    if (err instanceof StrapiError) throw err
    report.problems.push((err as Error).message)
    return report
  }

  // documents
  const manifest: ManifestFile = {
    version: 1,
    pulledAt: new Date().toISOString(),
    newest: null,
    documents: [],
    media: [],
  }
  const checkoutRedirects = join(opts.root, 'www', 'content', 'redirects.yaml')
  const redirects = existsSync(checkoutRedirects) ? readFileSync(checkoutRedirects, 'utf8') : undefined
  const files: ContentFile[] = []
  const withDrafts = opts.drafts || opts.status === 'draft'
  for (const type of TYPES) {
    const published = await readType(client, type, 'published')
    const drafts = withDrafts ? await readType(client, type, 'draft') : []
    const ids = new Set(published.map((d) => d.documentId))
    const docs: StrapiDocument[] =
      opts.status === 'draft'
        ? drafts
            .filter((d) => ids.has(d.documentId))
            // the draft version of a published document: written as published, as the drafts build shows it
            .map((d) => ({ ...d, publishedAt: typeof d.updatedAt === 'string' ? d.updatedAt : 'published' }))
        : published
    if (opts.drafts && type.draft !== 'none')
      docs.push(...drafts.filter((d) => !ids.has(d.documentId)).map((d) => ({ ...d, publishedAt: null })))
    const entries: FileEntry[] = []
    for (const d of docs) {
      try {
        entries.push(fromDocument(type, d, media))
      } catch (err) {
        report.problems.push((err as Error).message)
        continue
      }
      report.newest = latest(report.newest, d.updatedAt)
      manifest.documents.push({
        path: `${type.apiId}/${type.kind === 'single' ? type.source : String(d.slug)}`,
        documentId: d.documentId,
        updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : null,
      })
    }
    report.counts[type.apiId] = entries.length
    if (type.kind === 'single' && entries.length === 0) {
      report.problems.push(
        `${type.source === 'landingTemplate' ? 'landing-template.yaml' : type.source}: no ${type.apiId} document in Strapi`,
      )
      continue
    }
    try {
      files.push(...(await filesOf(type, entries, opts.root, { redirects })))
    } catch (err) {
      report.problems.push((err as Error).message)
    }
  }
  manifest.newest = report.newest
  manifest.documents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  // validation of the content, and the removed-URL rule against the snapshot
  report.problems.push(...treeProblems(files, join(opts.root, 'www', 'content', 'embeds')))
  const before = readContent(join(snapshot, 'content')).bySource
  for (const p of removedUrls(before, files))
    report.problems.push(
      `${p}: the URL was in the snapshot and is gone (renamed, deleted or unpublished); add a redirect from ${p} in Strapi`,
    )

  if (routedPaths(before).size === 0)
    report.notes.push(`the snapshot ${snapshot} holds no routed entry: the removed-URL rule had nothing to compare`)

  // every content file at a path its type owns, inside the tree; every media path a plain path under public/
  for (const f of files)
    if (sourceOf(f.path) === undefined || !inside(join('/c', f.path), '/c'))
      report.problems.push(`${f.path}: not a path of a content file (a slug Strapi should not hold)`)
  for (const { path } of media.files)
    if (!/^\/(?:media|files)(?:\/[^/\\\0]+)+$/.test(path) || path.split('/').some((s) => s === '.' || s === '..'))
      report.problems.push(`${path}: not a media path the pull writes (a file name Strapi should not hold)`)
  const pulledMedia = new Set(media.files.map((m) => m.path))
  report.problems.push(...mediaReferenceProblems(files, pulledMedia))

  // media, through the cache of the snapshot manifest
  const cache = readManifest(snapshot)
  // a file of the snapshot at another path now: its caption changed, and every raw link to the old path would break
  for (const c of cache?.media ?? []) {
    const now = media.files.find((m) => m.file.documentId === c.documentId)
    if (now && now.path !== c.path)
      report.problems.push(
        `${c.path}: the upload moved to ${now.path}; set its caption back to ${c.path.slice(0, c.path.lastIndexOf('/'))} in Strapi`,
      )
  }
  const cached = new Map((cache?.media ?? []).map((m) => [m.path, m]))
  const bytes = new Map<string, Uint8Array>()
  await Promise.all(
    media.files.map(async ({ path, file }) => {
      if (typeof file.size === 'number' && file.size * 1000 > MAX_FILE_BYTES) {
        report.problems.push(`${path}: ${file.size} kB, above the limit of 25 MiB`)
        return
      }
      const c = cached.get(path)
      const copy = join(snapshot, 'public', path)
      if (c && c.documentId === file.documentId && c.updatedAt === (file.updatedAt ?? null) && existsSync(copy)) {
        const b = new Uint8Array(readFileSync(copy))
        if (sha256(b) === c.sha256) {
          bytes.set(path, b)
          report.media.reused++
          return
        }
      }
      const b = await client.bytes(file.url)
      report.media.downloaded++
      if (b.length > MAX_FILE_BYTES) report.problems.push(`${path}: ${b.length} bytes, above the limit of 25 MiB`)
      const h = sha256(b)
      if (c && c.sha256 !== h)
        report.changedMedia.push(
          `${path}: SHA-256 ${c.sha256.slice(0, 12)} in the snapshot manifest, ${h.slice(0, 12)} now`,
        )
      bytes.set(path, b)
    }),
  )
  report.changedMedia.sort()
  for (const { path, file } of media.files) {
    const b = bytes.get(path)
    if (b)
      manifest.media.push({ path, documentId: file.documentId, updatedAt: file.updatedAt ?? null, sha256: sha256(b) })
  }

  if (report.problems.length > 0) {
    report.problems = [...new Set(report.problems)]
    return report
  }
  for (const c of report.changedMedia) log(`media changed: ${c}`)

  // a fresh directory beside the tree, so the replace is a rename on the same disk
  mkdirSync(dirname(out), { recursive: true })
  const stage = mkdtempSync(join(dirname(out), '.www-pull-'))
  try {
    for (const f of files) {
      const p = join(stage, 'content', f.path)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, f.text)
    }
    for (const [path, b] of bytes) {
      const p = join(stage, 'public', path)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, b)
    }
    if (opts.check) {
      report.differs = differences(stage, out)
      return report
    }
    try {
      replace(stage, out)
    } catch (err) {
      throw new PullEnvError(
        `the tree could not be replaced, the previous one is back in place: ${(err as Error).message}`,
      )
    }
    writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    report.written = true
    return report
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

/** The files of the pulled tree that differ from the tree at `out`: content a Strapi type holds, and the media. */
function differences(stage: string, out: string): string[] {
  const list = (root: string) => {
    const content = walk(join(root, 'content'))
      .map((a) =>
        a
          .slice(join(root, 'content').length + 1)
          .split('\\')
          .join('/'),
      )
      .filter(heldByStrapi)
      .map((p) => `content/${p}`)
    const pub = readMedia(join(root, 'public')).map((m) => `public${m.path}`)
    return [...content, ...pub]
  }
  const a = new Set(list(stage))
  const b = new Set(list(out))
  const differ: string[] = []
  for (const p of [...new Set([...a, ...b])].sort()) {
    if (!a.has(p) || !b.has(p)) differ.push(p)
    else if (!readFileSync(join(stage, p)).equals(readFileSync(join(out, p)))) differ.push(p)
  }
  return differ
}

/** Whether a path lies inside a directory. */
function inside(path: string, dir: string): boolean {
  const r = resolve(path)
  const d = resolve(dir)
  return r === d || r.startsWith(`${d}/`)
}

/** Every `/media/...` or `/files/...` path a content file names (outside an address of another site) with no pulled file. */
export function mediaReferenceProblems(files: readonly ContentFile[], media: ReadonlySet<string>): string[] {
  const problems: string[] = []
  const REF = /(?<![A-Za-z0-9._~:/%-])\/(?:media|files)\/[A-Za-z0-9._/%-]+/g
  for (const f of files)
    for (const m of f.text.matchAll(REF)) {
      const p = m[0].replace(/[.,]+$/, '')
      let decoded = p
      try {
        decoded = decodeURIComponent(p)
      } catch {
        // not an encoded path
      }
      if (!media.has(p) && !media.has(decoded))
        problems.push(`${f.path}: ${p} has no file in Strapi (moved, renamed or deleted in the media library)`)
    }
  return [...new Set(problems)]
}

/**
 * Moves the pulled tree into `out`: its Strapi files of content/ (the others stay) and public/media and public/files.
 * The previous files are moved aside first and put back when any step fails, so a failed replace leaves the tree as it
 * was.
 */
function replace(stage: string, out: string): void {
  const content = join(out, 'content')
  const aside = join(stage, 'previous')
  const done: [from: string, to: string][] = []
  const move = (from: string, to: string) => {
    mkdirSync(dirname(to), { recursive: true })
    renameSync(from, to)
    done.push([from, to])
  }
  try {
    for (const a of walk(content)) {
      const p = a
        .slice(content.length + 1)
        .split('\\')
        .join('/')
      if (heldByStrapi(p)) move(a, join(aside, 'content', p))
    }
    for (const root of ['media', 'files']) {
      const target = join(out, 'public', root)
      if (existsSync(target)) move(target, join(aside, 'public', root))
    }
    for (const a of walk(join(stage, 'content'))) move(a, join(content, a.slice(join(stage, 'content').length + 1)))
    for (const root of ['media', 'files']) {
      const from = join(stage, 'public', root)
      const target = join(out, 'public', root)
      if (existsSync(from)) move(from, target)
      else mkdirSync(target, { recursive: true })
    }
  } catch (err) {
    // undo in reverse order: the new files go back to the stage, the previous ones to their places
    for (const [from, to] of done.reverse()) {
      try {
        mkdirSync(dirname(from), { recursive: true })
        renameSync(to, from)
      } catch {
        // keep undoing the rest
      }
    }
    throw err
  }
}
