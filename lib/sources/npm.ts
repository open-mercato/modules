// npm registry (read only): packuments, dist-tags, search, org packages, downloads (spec 5.2, 4.5 SyncRecord.npm).
import pLimit from 'p-limit'
import type { SyncRecord } from '../schema/index.ts'
import { getJson, type Http, HttpError } from './http.ts'
import { compareVersions, isoSeconds, isSemVer, isStable } from './semver.ts'

export const REGISTRY = 'https://registry.npmjs.org'
export const DOWNLOADS_API = 'https://api.npmjs.org/downloads'

export type NpmRecord = NonNullable<SyncRecord['npm']>

export interface PackumentVersion {
  version?: string
  deprecated?: string | boolean
  license?: string | { type?: string } | null
  repository?: string | { url?: string; directory?: string } | null
  gitHead?: string
  keywords?: unknown
  maintainers?: { name?: string }[]
  peerDependencies?: Record<string, string>
  dependencies?: Record<string, string>
  scripts?: Record<string, string>
  hasInstallScript?: boolean
  description?: string
  dist?: { integrity?: string; shasum?: string; tarball?: string; attestations?: { url?: string } }
}

export interface Packument {
  name: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, PackumentVersion>
  time?: Record<string, string>
  maintainers?: { name?: string }[]
  description?: string
  repository?: PackumentVersion['repository']
}

const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'] as const

/** URL path segment of a package name: the scope slash is encoded (`@a%2Fb`). */
export function encodeName(name: string): string {
  return name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name)
}

export function packumentUrl(name: string): string {
  return `${REGISTRY}/${encodeName(name)}`
}

/** Full packument, or null on 404. */
export async function fetchPackument(http: Http, name: string): Promise<Packument | null> {
  const url = packumentUrl(name)
  const res = await http.request(url)
  if (res.status === 404) return null
  if (res.status !== 200 || res.json === null) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  return res.json as Packument
}

/** dist-tags only (a few bytes; watch uses it to skip unchanged packages). Null on 404. */
export async function fetchDistTags(http: Http, name: string): Promise<Record<string, string> | null> {
  const url = `${REGISTRY}/-/package/${encodeName(name)}/dist-tags`
  const res = await http.request(url)
  if (res.status === 404) return null
  if (res.status !== 200 || res.json === null) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  return res.json as Record<string, string>
}

function isDeprecated(v: PackumentVersion | undefined): boolean {
  return v !== undefined && v.deprecated !== undefined && v.deprecated !== false && v.deprecated !== ''
}

function deprecationText(v: PackumentVersion | undefined): string | null {
  if (!isDeprecated(v)) return null
  return typeof v?.deprecated === 'string' ? v.deprecated : 'deprecated'
}

export interface VersionPick {
  latestStable: string | null
  previousStable: string | null
  preview: string | null
  /** Stable versions above latestStable that were skipped because they are deprecated. */
  skippedDeprecated: string[]
  /** Stable, not deprecated versions above `dist-tags.latest` that were skipped because the tag wins (E2). */
  aboveLatestTag: string[]
}

/**
 * latestStable (orchestrator decision E2, errata to spec 4.5 and 11.4): `dist-tags.latest` when it is a stable
 * `^\d+\.\d+\.\d+$` version that exists and is not deprecated; otherwise the highest such stable version that is
 * not deprecated (gateway-stripe has a deprecated 1.0.1, sync-akeneo has a stray stable 1.0.1 above `latest` 0.9.0).
 * previousStable = the next lower stable, not deprecated version; preview = only without a stable version: the
 * `latest` tag when it is a prerelease (gateway-tpay), else the newest prerelease by publish time (spec 11.4).
 */
export function pickVersions(p: Packument): VersionPick {
  const versions = p.versions ?? {}
  const stable = Object.keys(versions).filter(isStable).sort(compareVersions).reverse()
  const usable = stable.filter((v) => !isDeprecated(versions[v]))
  const tag = p['dist-tags']?.latest
  const tagged = tag !== undefined && isStable(tag) && usable.includes(tag) ? tag : null
  const latestStable = tagged ?? usable[0] ?? null
  const previousStable = latestStable ? (usable.find((v) => compareVersions(v, latestStable) < 0) ?? null) : null
  const aboveLatestTag = tagged ? usable.filter((v) => compareVersions(v, tagged) > 0) : []
  const skippedDeprecated = latestStable
    ? stable.filter((v) => compareVersions(v, latestStable) > 0 && isDeprecated(versions[v]))
    : stable.filter((v) => isDeprecated(versions[v]))
  let preview: string | null = null
  if (!latestStable) {
    if (tag && isSemVer(tag) && versions[tag] && !isDeprecated(versions[tag])) preview = tag
    else {
      const time = p.time ?? {}
      const pre = Object.keys(versions)
        .filter((v) => isSemVer(v) && !isStable(v) && !isDeprecated(versions[v]))
        .sort((a, b) => (time[a] ?? '').localeCompare(time[b] ?? '') || compareVersions(a, b))
      preview = pre.at(-1) ?? null
    }
  }
  return { latestStable, previousStable, preview, skippedDeprecated, aboveLatestTag }
}

function licenseOf(v: PackumentVersion | undefined): string | null {
  const l = v?.license
  if (typeof l === 'string') return l
  if (l && typeof l === 'object' && typeof l.type === 'string') return l.type
  return null
}

export function repositoryUrlOf(r: PackumentVersion['repository'] | undefined): string | null {
  if (typeof r === 'string') return r
  if (r && typeof r === 'object' && typeof r.url === 'string') return r.url
  return null
}

export function installScriptsOf(v: PackumentVersion | undefined): NpmRecord['installScripts'] {
  const s = v?.scripts ?? {}
  const found = INSTALL_SCRIPTS.filter((k) => typeof s[k] === 'string' && s[k] !== '')
  // npm sets hasInstallScript for binding.gyp without an explicit script: node-gyp runs as `install`
  if (found.length === 0 && v?.hasInstallScript) return ['install']
  return found
}

function stringRecord(r: unknown): Record<string, string> {
  if (!r || typeof r !== 'object') return {}
  return Object.fromEntries(
    Object.entries(r as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
}

/** SyncRecord.npm from a packument, plus notes for SyncRecord.errors. */
export function npmRecord(p: Packument): { record: NpmRecord; notes: string[] } {
  const pick = pickVersions(p)
  const versions = p.versions ?? {}
  const time = p.time ?? {}
  const current = pick.latestStable ?? pick.preview
  const v = current ? versions[current] : undefined
  const publishedAt: Record<string, string> = {}
  for (const ver of [pick.latestStable, pick.previousStable, pick.preview]) {
    const t = ver ? isoSeconds(time[ver]) : null
    if (ver && t) publishedAt[ver] = t
  }
  const latestTag = p['dist-tags']?.latest
  const deprecated = deprecationText(current ? versions[current] : latestTag ? versions[latestTag] : undefined)
  const notes: string[] = []
  for (const d of pick.skippedDeprecated)
    if (pick.latestStable)
      notes.push(
        `npm: highest stable ${d} is deprecated (${JSON.stringify(deprecationText(versions[d]))}); latestStable skips deprecated versions`,
      )
  for (const a of pick.aboveLatestTag)
    notes.push(`npm: stable ${a} is above dist-tags.latest ${pick.latestStable}; latestStable follows the latest tag`)
  if (!current) notes.push('npm: no installable version (no stable and no preview)')
  const keywords = Array.isArray(v?.keywords)
    ? (v.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
    : []
  const maintainers = (p.maintainers ?? v?.maintainers ?? [])
    .map((m) => m.name)
    .filter((n): n is string => typeof n === 'string')
  const tarball = v?.dist?.tarball && /^https?:\/\//.test(v.dist.tarball) ? v.dist.tarball : null
  const record: NpmRecord = {
    name: p.name,
    distTags: Object.fromEntries(Object.entries(p['dist-tags'] ?? {}).filter(([, val]) => isSemVer(val))),
    latestStable: pick.latestStable,
    previousStable: pick.previousStable,
    preview: pick.preview,
    publishedAt,
    deprecated,
    license: licenseOf(v),
    repositoryUrl: repositoryUrlOf(v?.repository ?? p.repository),
    gitHead: typeof v?.gitHead === 'string' ? v.gitHead : null,
    keywords: keywords.slice(0, 30),
    maintainers: maintainers.slice(0, 20),
    peerDependencies: stringRecord(v?.peerDependencies),
    dependencies: stringRecord(v?.dependencies),
    installScripts: installScriptsOf(v),
    integrity: v?.dist?.integrity ?? null,
    tarball,
  }
  return { record, notes }
}

/**
 * Recording slimmer for packuments: keeps every stable version, every version a dist-tag points to and every
 * prerelease when there is no stable one, with only the fields npm.ts reads. Results of `npmRecord` and
 * `pickVersions` are unchanged (test/sources/npm.test.ts checks it).
 */
export function slimPackument(url: string, json: unknown): unknown {
  if (!url.startsWith(`${REGISTRY}/`) || url.includes('/-/')) return json
  const p = json as Packument
  if (!p || typeof p !== 'object' || !p.versions) return json
  const tagged = new Set(Object.values(p['dist-tags'] ?? {}))
  const anyStable = Object.keys(p.versions).some(isStable)
  // without a stable version, preview is the `latest` tag when usable, else the newest prerelease (needs all)
  const latestTag = p['dist-tags']?.latest
  const tagIsPreview =
    latestTag !== undefined && isSemVer(latestTag) && !isDeprecated(p.versions[latestTag]) && !!p.versions[latestTag]
  const keep = Object.keys(p.versions).filter((v) => isStable(v) || tagged.has(v) || (!anyStable && !tagIsPreview))
  const FIELDS = [
    'version',
    'deprecated',
    'license',
    'repository',
    'gitHead',
    'keywords',
    'maintainers',
    'peerDependencies',
    'dependencies',
    'scripts',
    'hasInstallScript',
    'description',
  ] as const
  const versions: Record<string, unknown> = {}
  for (const v of keep) {
    const src = p.versions[v] as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const f of FIELDS) if (src[f] !== undefined) out[f] = src[f]
    if (out.scripts && typeof out.scripts === 'object')
      out.scripts = Object.fromEntries(
        Object.entries(out.scripts as Record<string, unknown>).filter(([k]) =>
          (INSTALL_SCRIPTS as readonly string[]).includes(k),
        ),
      )
    if (Array.isArray(out.maintainers))
      out.maintainers = (out.maintainers as { name?: string }[]).map((m) => ({ name: m.name }))
    const dist = src.dist as PackumentVersion['dist'] | undefined
    if (dist) out.dist = { integrity: dist.integrity, tarball: dist.tarball }
    versions[v] = out
  }
  const time: Record<string, string> = {}
  for (const [k, t] of Object.entries(p.time ?? {}))
    if (k === 'created' || k === 'modified' || keep.includes(k)) time[k] = t
  return {
    name: p.name,
    'dist-tags': p['dist-tags'],
    versions,
    time,
    maintainers: (p.maintainers ?? []).map((m) => ({ name: m.name })),
    description: p.description,
    repository: p.repository,
  }
}

export interface SearchHit {
  name: string
  version: string
  description: string | null
  keywords: string[]
  maintainers: string[]
}

/** npm search (`/-/v1/search`), up to `max` hits. The registry search is fuzzy; callers filter the hits. */
export async function searchNpm(http: Http, text: string, max = 250): Promise<SearchHit[]> {
  const hits: SearchHit[] = []
  for (let from = 0; from < max; from += 250) {
    const size = Math.min(250, max - from)
    const url = `${REGISTRY}/-/v1/search?text=${encodeURIComponent(text)}&size=${size}${from ? `&from=${from}` : ''}`
    const res = await getJson<{ total?: number; objects?: { package?: Record<string, unknown> }[] }>(http, url)
    for (const o of res.objects ?? []) {
      const p = o.package ?? {}
      if (typeof p.name !== 'string' || typeof p.version !== 'string') continue
      hits.push({
        name: p.name,
        version: p.version,
        description: typeof p.description === 'string' ? p.description : null,
        keywords: Array.isArray(p.keywords)
          ? (p.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
          : [],
        maintainers: Array.isArray(p.maintainers)
          ? (p.maintainers as { username?: string; name?: string }[])
              .map((m) => m.username ?? m.name ?? '')
              .filter(Boolean)
          : [],
      })
    }
    if ((res.objects ?? []).length < size || hits.length >= (res.total ?? 0)) break
  }
  return hits
}

/** Packages of an npm org (`/-/org/<org>/package`): names only. */
export async function orgPackages(http: Http, org: string): Promise<string[]> {
  const res = await getJson<Record<string, string>>(http, `${REGISTRY}/-/org/${encodeURIComponent(org)}/package`)
  return Object.keys(res).sort()
}

/**
 * Downloads in the last month: unscoped names in bulk (up to 128 per call), scoped one by one
 * (the bulk endpoint rejects scoped names). Missing or failed = null.
 */
export async function downloadsLastMonth(
  http: Http,
  names: string[],
  /** Pause between two scoped calls (default 300 ms live, none on recorded responses). */
  opts: { gapMs?: number } = {},
): Promise<{ counts: Map<string, number | null>; errors: string[] }> {
  const gapMs = opts.gapMs ?? (http.mode === 'offline' ? 0 : 300)
  const counts = new Map<string, number | null>()
  const errors: string[] = []
  const unscoped = names.filter((n) => !n.startsWith('@'))
  const scoped = names.filter((n) => n.startsWith('@'))
  for (let i = 0; i < unscoped.length; i += 128) {
    const chunk = unscoped.slice(i, i + 128)
    const url = `${DOWNLOADS_API}/point/last-month/${chunk.map(encodeURIComponent).join(',')}`
    try {
      const res = await http.request(url)
      const body = res.json as Record<string, unknown> | null
      if (res.status !== 200 && res.status !== 404)
        errors.push(`downloads: HTTP ${res.status} for ${chunk.length} names`)
      if (chunk.length === 1) {
        const d = (body as { downloads?: number } | null)?.downloads
        counts.set(chunk[0] as string, res.status === 200 && typeof d === 'number' ? d : null)
      } else
        for (const n of chunk) {
          const d = (body?.[n] as { downloads?: number } | null | undefined)?.downloads
          counts.set(n, typeof d === 'number' ? d : null)
        }
    } catch (err) {
      errors.push(`downloads: ${(err as Error).message}`)
      for (const n of chunk) counts.set(n, null)
    }
  }
  // scoped names one by one (the bulk endpoint takes no scoped names), one at a time with a pause: a burst of every
  // name at once ran into the rate limit of api.npmjs.org, and the nulls it left were silent (finding of 25 Oct: visits
  // and marketing-consents had no downloads although npm counts 218 and 29); three at a time still got 429 for 5 to 9
  // of 57 names in one `sync --all` (finding of 25 Oct), after the retries of lib/sources/http.ts
  const limit = pLimit(1)
  await Promise.all(
    scoped.map((n, i) =>
      limit(async () => {
        if (i > 0 && gapMs > 0) await new Promise((r) => setTimeout(r, gapMs))
        try {
          const res = await http.request(`${DOWNLOADS_API}/point/last-month/${encodeName(n)}`)
          const d = (res.json as { downloads?: number } | null)?.downloads
          counts.set(n, res.status === 200 && typeof d === 'number' ? d : null)
          // 404: npm has no download data for the package yet; anything else is a failure to say
          if (res.status !== 200 && res.status !== 404) errors.push(`downloads ${n}: HTTP ${res.status}`)
        } catch (err) {
          errors.push(`downloads ${n}: ${(err as Error).message}`)
          counts.set(n, null)
        }
      }),
    ),
  )
  return { counts, errors }
}
