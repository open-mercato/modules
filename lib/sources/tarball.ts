// Tarballs (npm `dist.tarball` or a GitHub archive): download, SRI check, safe reads and safe extraction
// (spec 5.5 "Tarball trap": only File and Directory, no `..`, no absolute paths, no symlinks or hard links,
// at most 50 MB unpacked and 5000 files). Nothing from a tarball is executed.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Parser, type ReadEntry, Unpack } from 'tar'
import type { Http } from './http.ts'
import { OfflineMissError, sha256 } from './http.ts'

export const LIMITS = { maxBytes: 50 * 1024 * 1024, maxFiles: 5000 }

export class TarballError extends Error {}

/** Checks an SRI string (`sha512-<base64>`, several allowed) against bytes. */
export function verifyIntegrity(bytes: Uint8Array, integrity: string): boolean {
  for (const part of integrity.trim().split(/\s+/)) {
    const m = /^(sha512|sha384|sha256|sha1)-([A-Za-z0-9+/=]+)$/.exec(part)
    if (!m) continue
    const digest = createHash(m[1] as string)
      .update(bytes)
      .digest('base64')
    if (digest === m[2]) return true
  }
  return false
}

export interface TarEntryInfo {
  path: string
  type: string
  size: number
  linkpath: string | null
}

export interface Inspection {
  entries: TarEntryInfo[]
  /** Entries a safe extraction refuses, with the reason. */
  rejected: { path: string; reason: string }[]
  files: number
  bytes: number
}

const SAFE_TYPES = new Set(['File', 'OldFile', 'ContiguousFile', 'Directory'])

export function unsafeReason(e: TarEntryInfo): string | null {
  if (!SAFE_TYPES.has(e.type)) return `type ${e.type}`
  const p = e.path.replace(/\\/g, '/')
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return 'absolute path'
  if (p.split('/').includes('..')) return 'parent directory segment'
  return null
}

function parse(bytes: Uint8Array, onEntry: (e: ReadEntry) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const parser = new Parser({ strict: true, onReadEntry: onEntry })
    parser.on('error', reject)
    parser.on('close', () => resolve())
    parser.on('end', () => resolve())
    parser.end(Buffer.from(bytes))
  })
}

/** Lists a (gzipped) tarball without writing anything. */
export async function inspectTarball(bytes: Uint8Array): Promise<Inspection> {
  const entries: TarEntryInfo[] = []
  await parse(bytes, (e) => {
    entries.push({ path: e.path, type: e.type, size: e.size ?? 0, linkpath: e.linkpath ?? null })
    e.resume()
  })
  const rejected = entries
    .map((e) => ({ path: e.path, reason: unsafeReason(e) }))
    .filter((r): r is { path: string; reason: string } => r.reason !== null)
  const files = entries.filter((e) => e.type !== 'Directory' && unsafeReason(e) === null)
  return { entries, rejected, files: files.length, bytes: files.reduce((s, e) => s + e.size, 0) }
}

/**
 * Reads small text files out of a tarball in memory (for example `package/template/.yarnrc.yml.template`).
 * `wanted` receives the path inside the tarball. Unsafe entries are never read.
 */
export async function readTarballFiles(
  bytes: Uint8Array,
  wanted: (path: string) => boolean,
  maxFileBytes = 1024 * 1024,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  await parse(bytes, (e) => {
    const info = { path: e.path, type: e.type, size: e.size ?? 0, linkpath: e.linkpath ?? null }
    if (unsafeReason(info) !== null || e.type === 'Directory' || !wanted(e.path) || info.size > maxFileBytes) {
      e.resume()
      return
    }
    const chunks: Buffer[] = []
    e.on('data', (c: Buffer) => chunks.push(c))
    e.on('end', () => out.set(e.path, Buffer.concat(chunks).toString('utf8')))
  })
  return out
}

/**
 * Extracts into `dest` after an inspection: throws when the tarball is over the limits; unsafe entries
 * (links, devices, `..`, absolute paths) are skipped and returned in `rejected`.
 */
export async function extractSafe(bytes: Uint8Array, dest: string, limits = LIMITS): Promise<Inspection> {
  const ins = await inspectTarball(bytes)
  if (ins.files > limits.maxFiles) throw new TarballError(`tarball has ${ins.files} files, limit ${limits.maxFiles}`)
  if (ins.bytes > limits.maxBytes)
    throw new TarballError(`tarball unpacks to ${ins.bytes} bytes, limit ${limits.maxBytes}`)
  mkdirSync(dest, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const unpack = new Unpack({
      cwd: dest,
      strict: true,
      preservePaths: false,
      preserveOwner: false,
      chmod: false,
      filter: (path, entry) => {
        const e = entry as ReadEntry
        return unsafeReason({ path, type: e.type, size: e.size ?? 0, linkpath: e.linkpath ?? null }) === null
      },
    })
    unpack.on('error', reject)
    unpack.on('close', () => resolve())
    unpack.end(Buffer.from(bytes))
  })
  return ins
}

/** Downloads a tarball and checks its SRI when one is given. */
export async function downloadTarball(http: Http, url: string, integrity: string | null): Promise<Uint8Array> {
  const bytes = await http.bytes(url)
  if (integrity && !verifyIntegrity(bytes, integrity)) throw new TarballError(`integrity mismatch for ${url}`)
  return bytes
}

/** GitHub archive of a ref (tag or commit); there is no SRI, the ref pins it. */
export function githubArchiveUrl(repo: string, ref: string): string {
  return `https://codeload.github.com/${repo}/tar.gz/${encodeURIComponent(ref)}`
}

interface TarballRecording {
  url: string
  integrity: string
  files: Record<string, string>
}

/**
 * Small files of a verified npm tarball. Large tarballs are not recorded byte for byte: in record mode the files
 * read are saved under `<fixtures>/tarball/<sha256 of the integrity>.json` (taken only after the SRI check), and
 * offline mode replays them by integrity.
 */
export async function tarballTextFiles(
  http: Http,
  ref: { url: string; integrity: string },
  paths: string[],
): Promise<Map<string, string>> {
  const file = http.fixturesDir ? join(http.fixturesDir, 'tarball', `${sha256(ref.integrity).slice(0, 32)}.json`) : null
  if (http.mode === 'offline') {
    if (!file || !existsSync(file))
      throw new OfflineMissError(`offline: no recorded tarball files for ${ref.url}`, ref.url, null)
    const rec = JSON.parse(readFileSync(file, 'utf8')) as TarballRecording
    return new Map(paths.filter((p) => p in rec.files).map((p) => [p, rec.files[p] as string]))
  }
  const bytes = await downloadTarball(http, ref.url, ref.integrity)
  const want = new Set(paths)
  const files = await readTarballFiles(bytes, (p) => want.has(p))
  if (http.mode === 'record' && file) {
    mkdirSync(dirname(file), { recursive: true })
    const rec: TarballRecording = {
      url: ref.url,
      integrity: ref.integrity,
      files: Object.fromEntries([...files].sort()),
    }
    writeFileSync(file, `${JSON.stringify(rec, null, 2)}\n`)
  }
  return files
}
