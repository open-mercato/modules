// Tarball input for Rentgen: download (npm or GitHub archive), SRI check and a filtered unpack
// (spec 5.5 "Tarball-pułapka"): only regular files and directories, no absolute paths, no `..`,
// no symlinks or hardlinks, at most 50 MB unpacked and 5000 files. Nothing is executed.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { Parser, type ReadEntry } from 'tar'
import { USER_AGENT_HOME } from '../core/home.ts'

export const LIMITS = { maxBytes: 50 * 1024 * 1024, maxFiles: 5000, maxDownloadBytes: 50 * 1024 * 1024 } as const

export class RentgenError extends Error {
  readonly code: 'tarball-limit' | 'integrity' | 'network' | 'not-found' | 'bad-input'
  constructor(code: RentgenError['code'], message: string) {
    super(message)
    this.code = code
  }
}

export interface UnpackReport {
  files: number
  bytes: number
  /** Entries dropped by the filter, by reason. */
  rejected: { link: number; path: number; type: number }
}

export interface UnpackOptions {
  /** Leading path segments to drop (npm: `package/`, GitHub: `<repo>-<ref>/`). Default 1. */
  strip?: number
  maxBytes?: number
  maxFiles?: number
  /** Keep only entries whose stripped path passes this test. */
  only?: (path: string) => boolean
}

const FILE_TYPES = new Set(['File', 'OldFile', 'ContiguousFile'])

/** Safe relative path after stripping, or null when the entry must be refused. */
export function safeEntryPath(raw: string, strip: number): string | null {
  if (raw.includes('\0') || raw.includes('\\')) return null
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null
  const parts = raw.split('/').filter((p) => p !== '' && p !== '.')
  if (parts.some((p) => p === '..')) return null
  const kept = parts.slice(strip)
  if (kept.length === 0) return ''
  return kept.join('/')
}

/** Unpack a .tgz (or .tar) buffer into `dest` with the filter of spec 5.5. */
export async function unpackTarball(buf: Uint8Array, dest: string, opts: UnpackOptions = {}): Promise<UnpackReport> {
  const strip = opts.strip ?? 1
  const maxBytes = opts.maxBytes ?? LIMITS.maxBytes
  const maxFiles = opts.maxFiles ?? LIMITS.maxFiles
  const report: UnpackReport = { files: 0, bytes: 0, rejected: { link: 0, path: 0, type: 0 } }
  const files = new Map<string, Buffer[]>()
  const dirs = new Set<string>()
  let failure: RentgenError | null = null

  await new Promise<void>((resolvePromise, reject) => {
    const parser = new Parser({
      strict: false,
      onReadEntry: (entry: ReadEntry) => {
        const type = entry.type
        const rel = safeEntryPath(entry.path, strip)
        let keep = true
        if (type === 'SymbolicLink' || type === 'Link') {
          report.rejected.link++
          keep = false
        } else if (!FILE_TYPES.has(type) && type !== 'Directory') {
          report.rejected.type++
          keep = false
        } else if (rel === null) {
          report.rejected.path++
          keep = false
        } else if (rel === '' || (opts.only && type !== 'Directory' && !opts.only(rel))) keep = false
        if (!keep || rel === null) {
          entry.resume()
          return
        }
        if (type === 'Directory') {
          dirs.add(rel)
          entry.resume()
          return
        }
        report.files++
        report.bytes += entry.size ?? 0
        if (report.files > maxFiles || report.bytes > maxBytes) {
          failure ??= new RentgenError(
            'tarball-limit',
            `tarball over the limit (${maxFiles} files, ${Math.round(maxBytes / 1024 / 1024)} MB unpacked)`,
          )
          entry.resume()
          parser.abort(failure)
          return
        }
        const chunks: Buffer[] = []
        files.set(rel, chunks)
        entry.on('data', (c: Buffer) => chunks.push(c))
      },
    })
    parser.on('error', (err: Error) => reject(failure ?? err))
    parser.on('abort', () => reject(failure ?? new RentgenError('bad-input', 'tarball parse aborted')))
    parser.on('end', () => (failure ? reject(failure) : resolvePromise()))
    parser.end(Buffer.from(buf))
  })

  const root = resolve(dest)
  mkdirSync(root, { recursive: true })
  for (const d of [...dirs].sort()) {
    const p = resolve(root, d)
    if (p !== root && !p.startsWith(root + sep)) continue
    try {
      mkdirSync(p, { recursive: true })
    } catch {
      report.rejected.path++
    }
  }
  for (const [rel, chunks] of files) {
    const p = resolve(root, rel)
    if (!p.startsWith(root + sep)) {
      report.rejected.path++
      continue
    }
    try {
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, Buffer.concat(chunks), { mode: 0o644 })
    } catch {
      report.rejected.path++
    }
  }
  return report
}

/** True when `integrity` (an SRI string, possibly several hashes) matches the bytes. */
export function checkIntegrity(buf: Uint8Array, integrity: string): boolean {
  for (const part of integrity.trim().split(/\s+/)) {
    const m = /^(sha512|sha384|sha256|sha1)-([A-Za-z0-9+/=]+)$/.exec(part)
    if (!m) continue
    const digest = createHash(m[1] as string)
      .update(buf)
      .digest('base64')
    if (digest === m[2]) return true
  }
  return false
}

// ---------------------------------------------------------------- network (read only)

const UA = `open-mercato-modules-rentgen (${USER_AGENT_HOME})`

export async function fetchBytes(url: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'user-agent': UA, ...headers },
      signal: AbortSignal.timeout(90_000),
      redirect: 'follow',
    })
  } catch (err) {
    throw new RentgenError('network', `GET ${url}: ${(err as Error).message}`)
  }
  if (res.status === 404) throw new RentgenError('not-found', `GET ${url}: 404`)
  if (!res.ok) throw new RentgenError('network', `GET ${url}: HTTP ${res.status}`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > LIMITS.maxDownloadBytes)
    throw new RentgenError('tarball-limit', `download over ${LIMITS.maxDownloadBytes} bytes`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > LIMITS.maxDownloadBytes)
    throw new RentgenError('tarball-limit', `download over ${LIMITS.maxDownloadBytes} bytes`)
  return buf
}

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const buf = await fetchBytes(url, { accept: 'application/json', ...headers })
  return JSON.parse(Buffer.from(buf).toString('utf8')) as T
}

/** The fields of an npm version manifest Rentgen reads. */
export interface NpmVersionManifest {
  name: string
  version: string
  gitHead?: string
  deprecated?: string
  dist: { tarball: string; integrity?: string; shasum?: string }
}

export interface AbbreviatedPackument {
  'dist-tags': Record<string, string>
  versions: Record<string, { deprecated?: string }>
}

const registryUrl = (name: string): string => `https://registry.npmjs.org/${name.replace('/', '%2f')}`

/**
 * Version Rentgen reads when none is given: the `latest` dist-tag when it is a stable, non-deprecated
 * release (a stray higher release such as @open-mercato/sync-akeneo 1.0.1 from March is ignored),
 * else the highest stable non-deprecated release, else `latest` (preview builds like gateway-tpay).
 */
export function defaultVersion(p: AbbreviatedPackument): string | undefined {
  const latest = p['dist-tags'].latest
  const stable = (v: string): boolean => /^\d+\.\d+\.\d+$/.test(v) && !p.versions[v]?.deprecated
  if (latest && p.versions[latest] && stable(latest)) return latest
  const all = Object.keys(p.versions).filter(stable).sort(compareSemver)
  return all.at(-1) ?? latest
}

/** Version manifest from the registry; without `version`, see `defaultVersion`. */
export async function npmManifest(name: string, version?: string): Promise<NpmVersionManifest> {
  let v = version
  if (!v) {
    const p = await fetchJson<AbbreviatedPackument>(registryUrl(name), {
      accept: 'application/vnd.npm.install-v1+json',
    })
    v = defaultVersion(p)
    if (!v) throw new RentgenError('not-found', `${name} has no published version`)
  }
  return fetchJson<NpmVersionManifest>(`${registryUrl(name)}/${encodeURIComponent(v)}`)
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** Download an npm tarball and check it against `integrity` (SRI) when known. */
export async function fetchNpmTarball(m: NpmVersionManifest): Promise<Uint8Array> {
  if (!/^https:\/\/registry\.npmjs\.org\//.test(m.dist.tarball))
    throw new RentgenError('bad-input', `tarball outside registry.npmjs.org: ${m.dist.tarball}`)
  const buf = await fetchBytes(m.dist.tarball)
  if (m.dist.integrity && !checkIntegrity(buf, m.dist.integrity))
    throw new RentgenError('integrity', `${m.name}@${m.version}: tarball does not match dist.integrity`)
  return buf
}

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  return token ? { authorization: `Bearer ${token}` } : {}
}

/** Commit SHA a ref points to (tag, branch or SHA); null when the API cannot tell. */
export async function githubCommit(repo: string, ref: string): Promise<string | null> {
  if (/^[0-9a-f]{40}$/.test(ref)) return ref
  try {
    const c = await fetchJson<{ sha?: string }>(
      `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`,
      githubHeaders(),
    )
    return typeof c.sha === 'string' && /^[0-9a-f]{40}$/.test(c.sha) ? c.sha : null
  } catch {
    return null
  }
}

/** Ref to read for a GitHub-only entry: the newest tag, else the default branch head. */
export async function githubDefaultRef(repo: string): Promise<string> {
  const tags = await fetchJson<{ name: string }[]>(
    `https://api.github.com/repos/${repo}/tags?per_page=1`,
    githubHeaders(),
  )
  if (tags[0]?.name) return tags[0].name
  const meta = await fetchJson<{ default_branch: string }>(`https://api.github.com/repos/${repo}`, githubHeaders())
  const sha = await githubCommit(repo, meta.default_branch)
  if (!sha) throw new RentgenError('not-found', `${repo}: cannot resolve ${meta.default_branch}`)
  return sha
}

/** Source archive of a GitHub repository at `ref` (codeload, read only). */
export async function fetchGithubArchive(repo: string, ref: string): Promise<Uint8Array> {
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(repo))
    throw new RentgenError('bad-input', `bad repository ${repo}`)
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(ref) || ref.includes('..')) throw new RentgenError('bad-input', `bad ref ${ref}`)
  return fetchBytes(`https://codeload.github.com/${repo}/tar.gz/${ref}`)
}

/** Fresh temporary directory; the caller removes it with `removeDir`. */
export function tempDir(prefix = 'om-rentgen-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
