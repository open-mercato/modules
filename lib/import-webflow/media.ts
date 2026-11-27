// Media of the import (spec API Contracts, "Media"): every Webflow CDN address in fields and rich text is downloaded
// once into the media cache, keyed by the Webflow file id, and written as
// www/public/media/<collection>/<fileId>-<name>.<ext>. The same file id used twice is one file. The content type must
// match the extension; a file above 25 MiB (the Pages limit) or a total above 150 MB stops the run (A8).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cdnFile, mediaFileName } from './text.ts'

/** The Pages limit of one file. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024
/** A8: the run stops above this total; R2 is then a separate decision. */
export const MAX_TOTAL_BYTES = 150 * 1000 * 1000

/** Content types each extension may arrive with. */
const TYPES: Record<string, readonly string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  jpeg: ['image/jpeg', 'image/jpg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  avif: ['image/avif'],
  svg: ['image/svg+xml'],
  ico: ['image/x-icon', 'image/vnd.microsoft.icon'],
  pdf: ['application/pdf'],
  mp4: ['video/mp4'],
  webm: ['video/webm'],
  woff2: ['font/woff2', 'application/font-woff2'],
}

export class MediaError extends Error {
  readonly file: MediaFile
  constructor(message: string, file: MediaFile) {
    super(message)
    this.file = file
  }
}

/** One file the content refers to: where it comes from and where it goes. */
export interface MediaFile {
  fileId: string
  url: string
  /** Site path, `/media/<collection>/<file>`. */
  path: string
  /** The items that use the file (`blog/<slug>`), so a failed download stops exactly them. */
  users: Set<string>
}

/**
 * Collects the media the content refers to; the site path of a file is fixed by its first use, or by the path an
 * earlier run wrote it to (`known`: file id to site path, from the manifest), so a new item that reuses a file never
 * moves it.
 */
export class MediaRegistry {
  readonly files = new Map<string, MediaFile>()
  private readonly known: ReadonlyMap<string, readonly string[]>

  constructor(known: ReadonlyMap<string, readonly string[]> = new Map()) {
    this.known = known
  }

  /** Site path of a CDN address used by `collection` (a folder name such as `blog`), or undefined if not a CDN file. */
  use(url: string, collection: string, item: string): string | undefined {
    const f = cdnFile(url)
    if (!f) return undefined
    // a file an earlier run wrote to several folders keeps the copy in the user's folder (an import never moves one)
    const known = this.known.get(f.fileId) ?? []
    const path =
      known.find((p) => p.startsWith(`/media/${collection}/`)) ??
      known[0] ??
      `/media/${collection}/${mediaFileName(f.fileId, f.name)}`
    const key = known.length > 1 ? `${f.fileId} ${path}` : f.fileId
    const used = this.files.get(key)
    if (used) {
      used.users.add(item)
      return used.path
    }
    this.files.set(key, { fileId: f.fileId, url, path, users: new Set([item]) })
    return path
  }

  /** The files sorted by site path, the order the run writes them in. */
  list(): MediaFile[] {
    return [...this.files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  }
}

/** File id to the site paths of the media files a manifest lists (`www/public/media/...`), in manifest order. */
export function knownMedia(files: readonly { path: string; webflowId: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const f of files)
    if (f.path.startsWith('www/public/media/'))
      out.set(f.webflowId, [...(out.get(f.webflowId) ?? []), f.path.slice('www/public'.length)])
  return out
}

export interface FetchMediaOptions {
  cacheDir: string
  offline: boolean
  fetch?: typeof fetch
}

function extOf(path: string): string {
  const m = /\.([a-z0-9]+)$/.exec(path)
  return m ? m[1]! : ''
}

/** True when the first bytes fit the extension (a CDN that answers an HTML error page fails here). */
export function sniffMatches(ext: string, bytes: Uint8Array): boolean {
  const head = (n: number) => Array.from(bytes.subarray(0, n))
  const ascii = new TextDecoder('latin1').decode(bytes.subarray(0, 512)).trimStart().toLowerCase()
  switch (ext) {
    case 'png':
      return head(8).join(',') === '137,80,78,71,13,10,26,10'
    case 'jpg':
    case 'jpeg':
      return head(3).join(',') === '255,216,255'
    case 'gif':
      return ascii.startsWith('gif8')
    case 'webp':
      return ascii.startsWith('riff') && ascii.slice(8, 12) === 'webp'
    case 'svg':
      return ascii.startsWith('<svg') || ascii.startsWith('<?xml') || ascii.startsWith('<!--')
    case 'pdf':
      return ascii.startsWith('%pdf')
    case 'html':
      return false
    default:
      // formats without a cheap signature: anything but an HTML page passes
      return !ascii.startsWith('<!doctype html') && !ascii.startsWith('<html')
  }
}

/**
 * The bytes of a file: from the cache, else (online) downloaded into the cache first. Throws MediaError when the file
 * is not in the cache offline, the download fails, the type does not match the extension, or it is too large.
 */
export async function loadMedia(file: MediaFile, opts: FetchMediaOptions): Promise<Uint8Array> {
  const name = file.path.split('/').pop()!
  const cached = join(opts.cacheDir, name)
  const ext = extOf(name)
  if (!(ext in TYPES)) throw new MediaError(`${file.url}: the extension .${ext} has no rule`, file)
  let bytes: Uint8Array
  if (existsSync(cached)) bytes = new Uint8Array(readFileSync(cached))
  else {
    if (opts.offline) throw new MediaError(`${file.url}: not in the media cache (--offline)`, file)
    const res = await (opts.fetch ?? fetch)(file.url)
    if (!res.ok) throw new MediaError(`${file.url}: HTTP ${res.status}`, file)
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (!TYPES[ext]!.includes(type))
      throw new MediaError(`${file.url}: content type ${type || 'none'} for .${ext}`, file)
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_FILE_BYTES) throw new MediaError(`${file.url}: ${len} bytes, above the 25 MiB Pages limit`, file)
    bytes = new Uint8Array(await res.arrayBuffer())
    if (!sniffMatches(ext, bytes)) throw new MediaError(`${file.url}: the bytes are not a .${ext} file`, file)
    mkdirSync(opts.cacheDir, { recursive: true })
    // write then rename, so an interrupted run never leaves half a file in the cache
    writeFileSync(`${cached}.part`, bytes)
    renameSync(`${cached}.part`, cached)
  }
  if (bytes.byteLength > MAX_FILE_BYTES)
    throw new MediaError(`${file.url}: ${bytes.byteLength} bytes, above the 25 MiB Pages limit`, file)
  if (!sniffMatches(ext, bytes)) throw new MediaError(`${file.url}: the cached bytes are not a .${ext} file`, file)
  return bytes
}
