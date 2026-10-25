// Published Open Mercato packages for Fit (spec 5.4, 6.6): `@open-mercato/*` tarballs per OM version and the app
// template of `create-mercato-app@<version>` (template/package.json.template, template/.yarnrc.yml.template).
// Everything is read from registry.npmjs.org, checked against dist.integrity and unpacked through a filter
// (files and directories only, no `..`, no absolute paths, no links). Nothing here is executed.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { x as tarExtract } from 'tar'
import { parse as parseYaml } from 'yaml'
import type { Lines } from '../schema/index.ts'
import { maxSatisfying, valid } from './semver.ts'

export const REGISTRY = 'https://registry.npmjs.org'

export interface TarballStore {
  /** Cache directory (packuments, unpacked packages). */
  root: string
  /** No network: only what the cache already holds. */
  offline: boolean
  registry: string
  fetchImpl: typeof fetch
  /** In-process memo of packuments and unpacked packages. */
  memo: Map<string, Promise<unknown>>
}

export function createStore(
  root: string,
  opts: { offline?: boolean; registry?: string; fetchImpl?: typeof fetch } = {},
): TarballStore {
  return {
    root,
    offline: opts.offline ?? false,
    registry: opts.registry ?? REGISTRY,
    fetchImpl: opts.fetchImpl ?? fetch,
    memo: new Map(),
  }
}

export interface PackumentVersion {
  version: string
  deprecated?: string
  dist: { tarball: string; integrity?: string; shasum?: string }
}

export interface Packument {
  name: string
  'dist-tags': Record<string, string>
  versions: Record<string, PackumentVersion>
  time: Record<string, string>
}

export class StoreError extends Error {}

const enc = (name: string): string => name.replace('/', '__')

function memo<T>(store: TarballStore, key: string, make: () => Promise<T>): Promise<T> {
  const hit = store.memo.get(key)
  if (hit) return hit as Promise<T>
  const p = make()
  store.memo.set(key, p)
  p.catch(() => store.memo.delete(key))
  return p
}

async function fetchOk(store: TarballStore, url: string, accept?: string): Promise<Response | null> {
  let last: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await store.fetchImpl(url, accept ? { headers: { accept } } : undefined)
      if (res.status === 404) return null
      if (res.ok) return res
      last = new StoreError(`${url}: HTTP ${res.status}`)
      if (res.status < 500 && res.status !== 429) break
    } catch (err) {
      last = err
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
  }
  throw last instanceof Error ? last : new StoreError(`${url}: fetch failed`)
}

/** Full packument (with `time`), cached on disk. Null when the package does not exist. */
export function getPackument(store: TarballStore, name: string): Promise<Packument | null> {
  return memo(store, `packument:${name}`, async () => {
    const file = join(store.root, 'packuments', `${enc(name)}.json`)
    if (store.offline) {
      if (!existsSync(file)) throw new StoreError(`offline: no cached packument for ${name} in ${store.root}`)
      const cached = JSON.parse(readFileSync(file, 'utf8')) as Packument | { missing: true }
      return 'missing' in cached ? null : cached
    }
    const res = await fetchOk(store, `${store.registry}/${name.replace('/', '%2F')}`)
    mkdirSync(join(store.root, 'packuments'), { recursive: true })
    if (!res) {
      writeFileSync(file, JSON.stringify({ missing: true }))
      return null
    }
    const full = (await res.json()) as Packument
    const slim: Packument = {
      name: full.name,
      'dist-tags': full['dist-tags'] ?? {},
      time: full.time ?? {},
      versions: Object.fromEntries(
        Object.entries(full.versions ?? {}).map(([v, m]) => [
          v,
          {
            version: v,
            ...(m.deprecated ? { deprecated: m.deprecated } : {}),
            dist: { tarball: m.dist.tarball, integrity: m.dist.integrity, shasum: m.dist.shasum },
          },
        ]),
      ),
    }
    writeFileSync(file, JSON.stringify(slim))
    return slim
  })
}

/** Subresource Integrity check (sha512 preferred, sha1 shasum as fallback). */
export function checkIntegrity(buf: Uint8Array, dist: PackumentVersion['dist']): boolean {
  if (dist.integrity) {
    const ok = dist.integrity.split(/\s+/).some((sri) => {
      const m = /^(sha512|sha384|sha256|sha1)-(.+)$/.exec(sri)
      return m
        ? createHash(m[1] as string)
            .update(buf)
            .digest('base64') === m[2]
        : false
    })
    if (ok) return true
  }
  if (dist.shasum) return createHash('sha1').update(buf).digest('hex') === dist.shasum
  return false
}

export interface UnpackLimits {
  maxFiles: number
  maxBytes: number
}

/**
 * Official OM tarballs are big (core 0.9.0: 141 MB, 14k files). All files are kept: `exports` targets that are
 * not code (styles, JSON) must exist for subpath resolution, as in the g2 measurement.
 */
export const OM_LIMITS: UnpackLimits = { maxFiles: 100_000, maxBytes: 1024 * 1024 * 1024 }

/** Safe relative path inside a tarball (after the first segment is stripped). */
export function safeEntryPath(p: string): boolean {
  if (p.startsWith('/') || p.includes('\\') || /^[A-Za-z]:/.test(p)) return false
  return !p.split('/').some((seg) => seg === '..')
}

/** Unpack a tarball buffer into `dest` (first path segment stripped), keeping files that pass `keep`. */
export async function unpack(
  buf: Uint8Array,
  dest: string,
  keep: (rel: string) => boolean,
  limits: UnpackLimits,
): Promise<{ files: number; bytes: number }> {
  const tmpTgz = `${dest}.tgz`
  mkdirSync(dest, { recursive: true })
  writeFileSync(tmpTgz, buf)
  let files = 0
  let bytes = 0
  let over = false
  try {
    await tarExtract({
      file: tmpTgz,
      cwd: dest,
      strip: 1,
      strict: false,
      preservePaths: false,
      filter: (path, entry) => {
        const type = 'type' in entry ? entry.type : entry.isDirectory() ? 'Directory' : 'File'
        if (type !== 'File' && type !== 'Directory' && type !== 'OldFile') return false
        if (!safeEntryPath(path)) return false
        const rel = path.split('/').slice(1).join('/')
        if (rel === '') return false
        if (type === 'Directory') return true
        if (over || !keep(rel)) return false
        files++
        bytes += entry.size ?? 0
        if (files > limits.maxFiles || bytes > limits.maxBytes) over = true
        return !over
      },
    })
  } finally {
    rmSync(tmpTgz, { force: true })
  }
  if (over) {
    rmSync(dest, { recursive: true, force: true })
    throw new StoreError(`tarball over limits (${limits.maxFiles} files, ${limits.maxBytes} bytes)`)
  }
  return { files, bytes }
}

async function downloadVerified(store: TarballStore, meta: PackumentVersion): Promise<Uint8Array> {
  const url = meta.dist.tarball
  if (!url.startsWith(`${store.registry}/`)) throw new StoreError(`tarball outside the registry: ${url}`)
  const res = await fetchOk(store, url)
  if (!res) throw new StoreError(`tarball not found: ${url}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (!checkIntegrity(buf, meta.dist)) throw new StoreError(`integrity mismatch: ${url}`)
  return buf
}

/**
 * Directory of the unpacked package (`<root>/pkgs/<name>@<version>/package`), or null when that version
 * was never published.
 */
export function ensurePackage(store: TarballStore, name: string, version: string): Promise<string | null> {
  return memo(store, `pkg:${name}@${version}`, async () => {
    const base = join(store.root, 'pkgs', `${enc(name)}@${version}`)
    const dir = join(base, 'package')
    if (existsSync(join(base, '.complete'))) return dir
    if (existsSync(join(base, '.missing'))) return null
    if (store.offline) throw new StoreError(`offline: ${name}@${version} is not in ${store.root}`)
    const pack = await getPackument(store, name)
    const meta = pack?.versions[version]
    if (!meta) {
      mkdirSync(base, { recursive: true })
      writeFileSync(join(base, '.missing'), '')
      return null
    }
    const buf = await downloadVerified(store, meta)
    const tmp = `${base}.tmp-${process.pid}`
    rmSync(tmp, { recursive: true, force: true })
    await unpack(buf, join(tmp, 'package'), () => true, OM_LIMITS)
    writeFileSync(join(tmp, '.complete'), meta.dist.integrity ?? '')
    rmSync(base, { recursive: true, force: true })
    renameSync(tmp, base)
    return dir
  })
}

/** `@open-mercato/*` dependencies and peers of an unpacked package (to pre-fetch what its types import). */
export function omDependenciesOf(dir: string): string[] {
  try {
    const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
    const names = new Set<string>()
    for (const k of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = pj[k]
      if (deps && typeof deps === 'object')
        for (const n of Object.keys(deps)) if (n.startsWith('@open-mercato/')) names.add(n)
    }
    return [...names].sort()
  } catch {
    return []
  }
}

/** Unpack `pkgs` at `version` plus their `@open-mercato/*` dependencies (transitively). Missing versions map to null. */
export async function ensureOmPackages(
  store: TarballStore,
  version: string,
  pkgs: Iterable<string>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const queue = [...new Set(pkgs)].filter((p) => p.startsWith('@open-mercato/'))
  while (queue.length > 0) {
    const batch = queue.splice(0, 6).filter((p) => !out.has(p))
    const dirs = await Promise.all(batch.map((p) => ensurePackage(store, p, version)))
    batch.forEach((p, i) => {
      const dir = dirs[i] ?? null
      out.set(p, dir)
      if (dir) for (const d of omDependenciesOf(dir)) if (!out.has(d) && !queue.includes(d)) queue.push(d)
    })
  }
  return out
}

// ---- create-mercato-app template (per line version)

export interface TemplateDeps {
  /** e.g. `create-mercato-app@0.9.0` */
  createApp: string
  version: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  resolutions: Record<string, string>
  packageManager: string | null
  /** Yarn `npmMinimalAgeGate` of the template in minutes (0 when absent). */
  ageGateMinutes: number
  /** Yarn `npmPreapprovedPackages` of the template, e.g. `@open-mercato/*`. */
  preapproved: string[]
}

const TEMPLATE_FILES = ['template/package.json.template', 'template/.yarnrc.yml.template']

/** Yarn duration: a number is minutes; suffixes m, h, d, w. */
export function parseAgeGate(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return 0
  const m = /^(\d+(?:\.\d+)?)\s*(m|h|d|w)?$/.exec(v.trim())
  if (!m) return 0
  const n = Number(m[1])
  const unit = m[2] ?? 'm'
  return n * (unit === 'm' ? 1 : unit === 'h' ? 60 : unit === 'd' ? 1440 : 10080)
}

/** Parse the two template files (placeholders `{{...}}` replaced: package version -> `version`). */
export function parseTemplate(version: string, packageJsonText: string, yarnrcText: string | null): TemplateDeps {
  const text = packageJsonText.replaceAll('{{PACKAGE_VERSION}}', version).replace(/\{\{[A-Z_]+\}\}/g, 'app')
  const pj = JSON.parse(text) as Record<string, unknown>
  const rec = (k: string): Record<string, string> => {
    const v = pj[k]
    if (!v || typeof v !== 'object') return {}
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'))
  }
  let ageGateMinutes = 0
  let preapproved: string[] = []
  if (yarnrcText) {
    const y = parseYaml(yarnrcText.replace(/^\s*\{\{[A-Z_]+\}\}\s*$/gm, '')) as Record<string, unknown> | null
    ageGateMinutes = parseAgeGate(y?.npmMinimalAgeGate)
    const pre = y?.npmPreapprovedPackages
    preapproved = Array.isArray(pre) ? pre.filter((x): x is string => typeof x === 'string') : []
  }
  return {
    createApp: `create-mercato-app@${version}`,
    version,
    dependencies: rec('dependencies'),
    devDependencies: rec('devDependencies'),
    resolutions: rec('resolutions'),
    packageManager: typeof pj.packageManager === 'string' ? pj.packageManager : null,
    ageGateMinutes,
    preapproved,
  }
}

/**
 * Template dependencies of `create-mercato-app@<version>` (spec 6.6: fetched once per version).
 * Null when that version does not exist or has no template.
 */
export function templateDeps(store: TarballStore, version: string): Promise<TemplateDeps | null> {
  return memo(store, `template:${version}`, async () => {
    const base = join(store.root, 'templates', `create-mercato-app@${version}`)
    const pjFile = join(base, 'package', TEMPLATE_FILES[0] as string)
    const rcFile = join(base, 'package', TEMPLATE_FILES[1] as string)
    if (!existsSync(join(base, '.complete'))) {
      if (existsSync(join(base, '.missing'))) return null
      if (store.offline) throw new StoreError(`offline: create-mercato-app@${version} template is not in ${store.root}`)
      const pack = await getPackument(store, 'create-mercato-app')
      const meta = pack?.versions[version]
      mkdirSync(base, { recursive: true })
      if (!meta) {
        writeFileSync(join(base, '.missing'), '')
        return null
      }
      const buf = await downloadVerified(store, meta)
      await unpack(buf, join(base, 'package'), (rel) => TEMPLATE_FILES.includes(rel), {
        maxFiles: 10,
        maxBytes: 1 << 20,
      })
      writeFileSync(join(base, '.complete'), meta.dist.integrity ?? '')
    }
    if (!existsSync(pjFile)) return null
    return parseTemplate(
      version,
      readFileSync(pjFile, 'utf8'),
      existsSync(rcFile) ? readFileSync(rcFile, 'utf8') : null,
    )
  })
}

/** `templateDeps(line)`: the template of the `create-mercato-app` version a line of `lines.json` points to. */
export async function templateDepsForLine(
  store: TarballStore,
  lines: Lines,
  line: string,
): Promise<TemplateDeps | null> {
  const l = lines.lines.find((x) => x.key === line)
  return l ? templateDeps(store, l.version) : null
}

const globRe = (g: string): RegExp => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)

export function isPreapproved(name: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => globRe(p).test(name))
}

/**
 * Version a fresh app of this template resolves for `name` at `asOf`: `resolutions` win, an exact version is
 * itself, a range takes the highest non-deprecated version that satisfies it and passed the template age gate.
 */
export function resolveAppVersion(
  template: TemplateDeps,
  name: string,
  pack: Packument | null,
  asOf: Date,
): string | null {
  const forced = template.resolutions[name]
  if (forced && valid(forced)) return forced
  const range = template.dependencies[name] ?? template.devDependencies[name]
  if (!range) return null
  if (valid(range)) return range
  if (!pack) return null
  const gateMs = isPreapproved(name, template.preapproved) ? 0 : template.ageGateMinutes * 60_000
  const limit = asOf.getTime() - gateMs
  const candidates = Object.values(pack.versions)
    .filter((m) => !m.deprecated)
    .map((m) => m.version)
    .filter((v) => {
      const t = pack.time[v]
      return t !== undefined && Date.parse(t) <= limit
    })
  return maxSatisfying(candidates, range)
}
