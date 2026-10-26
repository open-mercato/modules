// Submit a module (spec 7.7 H, 1.1 item 7, D28): the browser asks npm, jsDelivr and GitHub about a package, shows
// the listing rules live, builds the descriptor YAML with the same Zod schema as CI and opens a pull request.
// Network errors never end as "Not found" or "Not an Open Mercato module" (spec 7.7 H, 7.8).
// The checks are plain functions with an injected fetch (exported for the tests); the component only renders them.
import { distance } from 'fastest-levenshtein'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { AGE_GATE_DAYS, installableFrom, isPreapproved } from '../../../lib/core/lines.ts'
import { compareVersions, isStable, isVersion, satisfiesRange } from '../../../lib/core/semver.ts'
import { licenseKind } from '../../../lib/core/signals.ts'
import { injectionFlags, plainTextViolation } from '../../../lib/core/text.ts'
import { CategoryId, GithubRepo, NpmName } from '../../../lib/schema/common.ts'
import type { IndexEntry } from '../../../lib/schema/published/modules.ts'
import {
  DESCRIPTOR_KEY_ORDER,
  Descriptor,
  SCREENSHOT_ALT_MAX,
  SCREENSHOT_ALT_MIN,
  SCREENSHOT_MAX,
} from '../../../lib/schema/descriptor.ts'
import { locatorToPath } from '../../../lib/schema/locator.ts'
import { renderSigil, sigilPhase } from '../../../lib/sigil/sigil.ts'
import { CommandChipView, Icon, LicenseChipView, TypeChipView, Wrap } from '../lib/ui.tsx'
import { href, modulePage } from '../lib/url.ts'
import ModuleRow from './ModuleRow.tsx'

// ---------- fixed texts (spec 7.7 H, 7.8) ----------

export const TEXT = {
  npmDown: 'Could not reach npm. Try again or copy the YAML.',
  jsdelivrDown: 'Could not reach jsDelivr. Try again or copy the YAML.',
  githubDown: 'Could not reach GitHub. Try again or copy the YAML.',
  githubLimit: 'GitHub rate limit reached. Checks continue without repository data.',
  jsdelivrLag: 'This version is not on jsDelivr yet. Try again in a minute.',
  unlicensed: 'UNLICENSED means proprietary. Add "license": "MIT" if you want an open-source badge.',
  afterMerge: 'After merge the module is read from source within minutes and installed in the next run of each line.',
  afterEdit: 'After merge the change shows within minutes.',
  // GitHub's editor opens the file as it is on main and takes no text in its URL (finding of 25 Oct: the edits of the
  // form were lost on "Propose an edit")
  editHint:
    'GitHub opens the file as it is on main. The button copies your YAML first: in the editor, select everything and paste.',
  editCopied: 'YAML copied. In the GitHub editor, select everything in the file and paste, then propose the change.',
  anatomyLater: 'Anatomy appears after merge.',
} as const

const NPM = 'https://registry.npmjs.org'
const JSD = 'https://data.jsdelivr.com/v1/packages'
const GH = 'https://api.github.com'
const CREATE_MODULE = 'https://github.com/open-mercato/create-mercato-module'
const TIMEOUT_MS = 8000

// ---------- input ----------

export type Target = { kind: 'npm'; name: string } | { kind: 'github'; repo: string }

/** What the user typed: an npm name, `owner/repo`, an npm or GitHub URL, or a locator. Null when empty. */
export function parseTarget(raw: string): Target | { kind: 'invalid'; message: string } | null {
  let s = raw.trim()
  if (s === '') return null
  s = s.replace(/^https?:\/\/(www\.)?npmjs\.com\/package\//i, 'npm:')
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, 'github:').replace(/(\.git|\/)$/i, '')
  if (s.startsWith('npm:')) s = s.slice(4)
  else if (s.startsWith('github:')) {
    const repo = s.slice(7).split('/').slice(0, 2).join('/')
    return GithubRepo.safeParse(repo).success ? { kind: 'github', repo } : invalid()
  }
  s = s.replace(/@(\d[\w.+-]*|latest|next)$/, '') // a pasted version is not part of the name
  if (!s.startsWith('@') && /^[^/]+\/[^/]+$/.test(s))
    return GithubRepo.safeParse(s).success ? { kind: 'github', repo: s } : invalid()
  const name = s.toLowerCase()
  return NpmName.safeParse(name).success ? { kind: 'npm', name } : invalid()
}

function invalid() {
  return {
    kind: 'invalid' as const,
    message: 'Type an npm package name like @scope/name, or a GitHub repository like owner/repo.',
  }
}

export const locatorOf = (t: Target): string => (t.kind === 'npm' ? `npm:${t.name}` : `github:${t.repo}`)

// ---------- network ----------

export type Fetch = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>
export interface Deps {
  fetch: Fetch
  timeoutMs?: number
}

type Why = 'not-found' | 'unreachable' | 'timeout' | 'rate-limit' | 'http'
type Got<T> = { ok: true; data: T } | { ok: false; why: Why; status: number | null }

/** GET JSON with a timeout. A thrown fetch (CORS, DNS, offline) is `unreachable`, an abort is `timeout`. */
export async function getJson<T>(url: string, deps: Deps): Promise<Got<T>> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? TIMEOUT_MS)
  try {
    const res = await deps.fetch(url, { signal: ctl.signal })
    if (res.ok) {
      try {
        return { ok: true, data: (await res.json()) as T }
      } catch {
        return { ok: false, why: 'http', status: res.status }
      }
    }
    if (res.status === 404) return { ok: false, why: 'not-found', status: 404 }
    if (res.status === 429) return { ok: false, why: 'rate-limit', status: 429 }
    if (res.status === 403) {
      const body = await res.text().catch(() => '')
      const limited = res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(body)
      return { ok: false, why: limited ? 'rate-limit' : 'http', status: 403 }
    }
    return { ok: false, why: 'http', status: res.status }
  } catch {
    return { ok: false, why: ctl.signal.aborted ? 'timeout' : 'unreachable', status: null }
  } finally {
    clearTimeout(timer)
  }
}

const npmUrl = (name: string): string => `${NPM}/${name.replace('/', '%2F')}`

// ---------- check result ----------

export type StateId =
  'core' | 'listed' | 'renamed' | 'collision' | 'not-module' | 'github-only' | 'ignored' | 'not-found' | 'unknown'
export interface Notice {
  level: 'error' | 'warn' | 'info'
  text: string
}
export interface ModuleDir {
  id: string
  src: boolean
  dist: boolean
}
export interface Gate {
  installable: boolean
  modules: ModuleDir[]
  hasSrc: boolean
  reason: string | null
}
export interface PackageInfo {
  name: string
  version: string | null
  stable: boolean
  publishedAt: string | null
  deprecated: string | null
  license: string | null
  description: string | null
  keywords: string[]
  peers: Record<string, string>
  dependencies: Record<string, string>
  repo: string | null
  bin: boolean
  provider: boolean
  installScripts: string[]
}
export interface RepoInfo {
  repo: string
  archived: boolean
  license: string | null
  defaultBranch: string | null
  tag: string | null
}
export interface CatalogRef {
  locator: string
  path: string
  npm: string | null
  github: string | null
  title: string
  status: string
  renamedFrom: string[]
  /** Origin type the catalog computed for a listed entry. */
  type?: 'official' | 'community' | '3rd-party'
  /** Kind and sigil of the listed entry, so the preview shows the real card (modules.json has the anatomy). */
  kind?: 'module' | 'provider' | 'library' | 'tool'
  sigil?: { glyph: string; phase: number; publicRoutes: boolean; label: string }
  /** Install command of the listed entry from modules.json (D46: built from `version.recommended[line]`). */
  cli?: string | null
  /** The descriptor file of the listed entry as parsed YAML, so the YAML keeps the curator fields. */
  descriptor?: Record<string, unknown> | null
  /** Core module IDs the entry replaces (`replaces: core:<id>`), so a declared replacement is not a collision. */
  replaces?: string[]
  /**
   * The listed entry's state as the registry row shows it (finding of 25 Oct: the preview card of a listed package
   * showed grey squares and LISTED while its page said `Broken on 0.8, 0.9 and next`): its level, the judged cell of each
   * line (`withJudgedLines`) and the lines whose receipt is of another version (`otherVersionCells`).
   */
  row?: {
    tier: 'listed' | 'verified' | null
    verifiedOn: string[]
    lines: Record<string, { status: CellState; step: string | null; at: string | null; moduleVersion: string | null }>
    others: Record<string, { installs: string; other: { status: CellState; step: string | null; at: string | null } }>
  }
  /** Author fields of the listed entry, so "Propose an edit" starts from the current file. */
  fields?: {
    category: string
    tags: string[]
    summary: string
    whenToUse: string
    providers: { name: string; label: string }[]
  }
}
type CellState = IndexEntry['compat']['lines'][string]['status']

export interface CheckContext {
  catalog: readonly CatalogRef[]
  ignore: readonly { locator: string; reason: string }[]
  coreVersion: string
  preapproved: readonly string[]
  /** Module IDs built into Open Mercato core of the latest line (built-in.json); a package that ships one collides. */
  builtIn?: { coreVersion: string; ids: readonly string[] }
}
export interface CheckResult {
  target: Target
  locator: string
  states: StateId[]
  existing: CatalogRef | null
  renamedTo: CatalogRef | null
  ignored: string | null
  pkg: PackageInfo | null
  repo: RepoInfo | null
  gate: Gate | null
  kind: 'module' | 'provider' | 'library' | 'tool' | null
  installableFrom: string | null
  license: { value: string | null; kind: 'osi' | 'proprietary' | 'enterprise' | 'unknown'; text: string } | null
  peers: { text: string; level: 'ok' | 'warn'; range?: string } | null
  /** Module IDs of the package that are built into core and not declared in `replaces`. */
  collisions: string[]
  /** GitHub answered 404 for the repository of package.json (missing or private): CI would reject it as `github`. */
  repoMissing?: boolean
  notices: Notice[]
}

const CLI_MODULE_DIR = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

/** The gate of `mercato module add` (lib/rentgen/kind.ts readGate) from a flat jsDelivr file list. */
export function gateFromFiles(files: readonly string[]): Gate {
  const src = new Map<string, boolean>()
  const dist = new Set<string>()
  let hasSrc = false
  for (const f of files) {
    if (f.startsWith('/src/')) hasSrc = true
    const s = /^\/src\/modules\/([^/]+)\/(.+)$/.exec(f)
    if (s) src.set(s[1] as string, (src.get(s[1] as string) ?? false) || /^index\.tsx?$/.test(s[2] as string))
    const d = /^\/dist\/modules\/([^/]+)\//.exec(f)
    if (d) dist.add(d[1] as string)
  }
  const names = [...(src.size > 0 ? src.keys() : dist)].filter((n) => CLI_MODULE_DIR.test(n)).sort()
  const modules = names.slice(0, 60).map((id) => ({ id, src: src.get(id) === true, dist: dist.has(id) }))
  const pair = modules.filter((m) => m.src && m.dist)
  let reason: string | null = null
  if (modules.length === 0)
    reason = hasSrc
      ? 'Package has no src/modules and dist/modules pair.'
      : 'Package has no src/ in the published files.'
  else if (pair.length === 0) {
    const m = modules[0] as ModuleDir
    reason = !m.src
      ? `No src/modules/${m.id}/index.ts in the published files.`
      : `No dist/modules/${m.id}/ in the published files (not built).`
  }
  return { installable: pair.length > 0, modules, hasSrc, reason }
}

/** `git+https://github.com/o/r.git` and friends to `o/r`. */
export function repoFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m =
    /github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[#/].*)?$/i.exec(url) ??
    /^github:([^/]+)\/(.+)$/.exec(url)
  if (!m) return /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(url) ? url : null
  const repo = `${m[1]}/${m[2]}`
  return GithubRepo.safeParse(repo).success ? repo : null
}

interface Packument {
  name?: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, Manifest>
  time?: Record<string, string>
}
interface Manifest {
  version?: string
  license?: unknown
  description?: string
  keywords?: unknown
  peerDependencies?: Record<string, string>
  dependencies?: Record<string, string>
  repository?: unknown
  bin?: unknown
  deprecated?: string
  scripts?: Record<string, string>
  openMercato?: unknown
}

/**
 * Version a fresh app would install (E2): `latest` when it is stable and not deprecated, else the highest
 * stable version that is not deprecated, else (official preview) `latest` itself.
 */
export function pickVersion(p: Packument): { version: string | null; stable: boolean } {
  const versions = p.versions ?? {}
  const latest = p['dist-tags']?.latest
  const ok = (v: string): boolean => isStable(v) && !versions[v]?.deprecated
  if (latest && versions[latest] && ok(latest)) return { version: latest, stable: true }
  const stable = Object.keys(versions).filter(ok).sort(compareVersions)
  const best = stable.at(-1)
  if (best) return { version: best, stable: true }
  if (latest && versions[latest]) return { version: latest, stable: false }
  const any = Object.keys(versions).filter(isVersion).sort(compareVersions).at(-1)
  return { version: any ?? null, stable: false }
}

function licenseValue(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string')
    return (v as { type: string }).type
  return null
}

function repoUrlOf(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string') return (v as { url: string }).url
  return null
}

function packageInfo(name: string, p: Packument): PackageInfo {
  const { version, stable } = pickVersion(p)
  const m: Manifest = (version ? p.versions?.[version] : undefined) ?? {}
  const om = m.openMercato
  return {
    name,
    version,
    stable,
    publishedAt: version ? (p.time?.[version] ?? null) : null,
    deprecated: m.deprecated ?? null,
    license: licenseValue(m.license),
    description: typeof m.description === 'string' ? m.description : null,
    keywords: Array.isArray(m.keywords) ? m.keywords.filter((k): k is string => typeof k === 'string') : [],
    peers: m.peerDependencies ?? {},
    dependencies: m.dependencies ?? {},
    repo: repoFromUrl(repoUrlOf(m.repository)),
    bin: !!m.bin,
    provider: !!(om && typeof om === 'object' && 'webResearchAdapter' in om),
    installScripts: ['preinstall', 'install', 'postinstall'].filter((s) => typeof m.scripts?.[s] === 'string'),
  }
}

/** License sentence (spec 7.7 H). */
export function licenseCheck(value: string | null, enterprise = false): NonNullable<CheckResult['license']> {
  const kind = licenseKind(value, enterprise)
  // `SEE LICENSE IN <file>` is a custom license, not UNLICENSED (finding of 25 Oct): the card shows it as proprietary
  if (kind === 'proprietary' && value && /^SEE LICENSE IN\b/i.test(value))
    return {
      value,
      kind,
      text: `Custom license (${value.slice(0, 80)}). The card shows it as proprietary unless package.json names an SPDX license.`,
    }
  if (kind === 'proprietary') return { value, kind, text: TEXT.unlicensed }
  if (kind === 'unknown')
    return { value, kind, text: 'No license in package.json. The card shows LICENSE UNKNOWN until you add one.' }
  return { value, kind, text: value ?? '' }
}

/**
 * Peers of the Open Mercato packages against the latest release (spec 7.7 H, lint peer-exact-pin). An official
 * package pinned to the release it ships with is in lockstep on purpose, so it gets no advice.
 */
export function peersCheck(
  peers: Record<string, string>,
  coreVersion: string,
  name: string | null = null,
): NonNullable<CheckResult['peers']> {
  const om = Object.entries(peers).filter(([k]) => k.startsWith('@open-mercato/'))
  if (om.length === 0)
    return { level: 'warn', text: 'No @open-mercato peer dependencies. Built for stays unknown until you add them.' }
  const ranges = [...new Set(om.map(([, r]) => r.trim()))]
  const pins = ranges.filter((r) => isVersion(r.replace(/^=/, '')))
  if (pins.length > 0) {
    const pin = pins[0]!.replace(/^=/, '')
    if (name?.startsWith('@open-mercato/') && pin === coreVersion)
      return { level: 'ok', text: `Peers pinned to ${pin}, in lockstep with Open Mercato.`, range: pin }
    // the fact and its effect, as lint peer-exact-pin says it: create-mercato-module writes exact peers on every
    // publish, and ^0.x accepts no other minor anyway (^0.8.0 is <0.9.0), so range advice could not be followed
    return {
      level: 'warn',
      text: `Peers pinned to ${pin}, so an app on any other release of Open Mercato gets a Yarn peer warning.`,
      range: pin,
    }
  }
  if (ranges.some((r) => r === '*' || r === ''))
    return { level: 'warn', text: 'Peers accept any version (*). Say which lines you support.', range: '*' }
  const rejecting = ranges.filter((r) => !satisfiesRange(coreVersion, r))
  if (rejecting.length > 0)
    return {
      level: 'warn',
      text: `Peers (${rejecting[0]}) do not accept Open Mercato ${coreVersion}, the latest release. The receipts will show whether it works anyway.`,
      range: rejecting[0],
    }
  return { level: 'ok', text: `Peers accept Open Mercato ${coreVersion} (${ranges.join(', ')}).` }
}

function matchIgnore(locator: string, rules: CheckContext['ignore']): string | null {
  const lc = locator.toLowerCase()
  for (const r of rules) {
    const p = r.locator.toLowerCase()
    if (p.endsWith('*') ? lc.startsWith(p.slice(0, -1)) : lc === p) return r.reason
  }
  return null
}

/**
 * Catalog side: already listed, renamed (an old name of an entry), ignored. No network. A GitHub repository also
 * matches an entry listed under its npm name (spec 4.3: npm takes precedence over github), so it is never offered as
 * a second, GitHub-only entry.
 */
export function catalogState(t: Target, ctx: CheckContext): Pick<CheckResult, 'existing' | 'renamedTo' | 'ignored'> {
  const loc = locatorOf(t).toLowerCase()
  const byLocator = ctx.catalog.find((e) => e.locator.toLowerCase() === loc)
  const existing =
    byLocator ??
    ctx.catalog.find(
      (e) =>
        (t.kind === 'npm' && e.npm === t.name) ||
        (t.kind === 'github' && e.github?.toLowerCase() === t.repo.toLowerCase()),
    ) ??
    null
  const renamedTo = existing
    ? null
    : (ctx.catalog.find((e) => e.renamedFrom.some((r) => r.toLowerCase() === loc)) ?? null)
  return { existing, renamedTo, ignored: matchIgnore(locatorOf(t), ctx.ignore) }
}

/**
 * Runs every check for one package. Order: npm packument (or GitHub repository), the file list on jsDelivr,
 * GitHub repository data. Every source that does not answer adds a notice and leaves its part unknown.
 */
export async function runChecks(t: Target, ctx: CheckContext, deps: Deps): Promise<CheckResult> {
  // a repository listed under its npm name is checked as that npm package, the source the catalog installs from
  const listedAs = catalogState(t, ctx).existing?.npm
  if (t.kind === 'github' && listedAs) {
    const viaNpm = await runChecks({ kind: 'npm', name: listedAs }, ctx, deps)
    return { ...viaNpm, target: t, locator: locatorOf(t) }
  }
  const r: CheckResult = {
    target: t,
    locator: locatorOf(t),
    states: [],
    ...catalogState(t, ctx),
    pkg: null,
    repo: null,
    gate: null,
    kind: null,
    installableFrom: null,
    license: null,
    peers: null,
    collisions: [],
    notices: [],
  }
  const note = (level: Notice['level'], text: string) => {
    if (!r.notices.some((n) => n.text === text)) r.notices.push({ level, text })
  }
  const down = (src: 'npm' | 'jsdelivr' | 'github', why: Why) => {
    if (src === 'github' && why === 'rate-limit') return note('warn', TEXT.githubLimit)
    note('error', src === 'npm' ? TEXT.npmDown : src === 'jsdelivr' ? TEXT.jsdelivrDown : TEXT.githubDown)
  }
  let found: boolean | null = null // null: no authoritative answer

  if (t.kind === 'npm') {
    let p = await getJson<Packument>(npmUrl(t.name), deps)
    if (!p.ok && p.why === 'unreachable' && t.name.startsWith('@')) {
      // npm answers 404 for a missing scoped package without a CORS header, so the browser sees a network error.
      // When the search endpoint of the same registry answers without the package, npm is reachable and the package
      // does not exist. A search that lists the package means the packument was blocked on the way (an extension, a
      // proxy, a reset connection): npm stays unreachable, never `not found` (finding of 25 Oct). The search text must
      // be 2 to 64 characters (else HTTP 400).
      const probe = await getJson<{ objects?: { package?: { name?: unknown } }[] }>(
        `${NPM}/-/v1/search?text=${encodeURIComponent(t.name.slice(0, 64))}&size=5`,
        deps,
      )
      const listed = probe.ok && (probe.data.objects ?? []).some((o) => o?.package?.name === t.name)
      if (probe.ok && !listed) p = { ok: false, why: 'not-found', status: 404 }
    }
    if (p.ok) {
      found = true
      r.pkg = packageInfo(t.name, p.data)
      r.license = licenseCheck(r.pkg.license, t.name === '@open-mercato/enterprise')
      r.peers = peersCheck(r.pkg.peers, ctx.coreVersion, t.name)
      r.installableFrom = installableFrom(r.pkg.publishedAt, isPreapproved(t.name, ctx.preapproved))
      if (r.pkg.deprecated) note('error', `Deprecated on npm: ${r.pkg.deprecated.slice(0, 160)}`)
      // a stable version whose every release is deprecated is no prerelease (finding of 25 Oct: `No stable release yet
      // (2.0.9)`): the deprecation note above says it
      if (r.pkg.version && !r.pkg.stable && !isStable(r.pkg.version) && !t.name.startsWith('@open-mercato/'))
        note('error', `No stable release yet (${r.pkg.version}). Publish a version like 1.0.0 or 0.1.0.`)
      if (r.pkg.installScripts.length > 0)
        note(
          'warn',
          `Declares install scripts (${r.pkg.installScripts.join(', ')}). Explain them in scriptsRequired, or the supply chain signal fails.`,
        )
      if (r.pkg.version) {
        const files = await getJson<{ files?: { name: string }[] }>(
          `${JSD}/npm/${t.name}@${r.pkg.version}?structure=flat`,
          deps,
        )
        if (files.ok) r.gate = gateFromFiles((files.data.files ?? []).map((f) => f.name))
        else if (files.why === 'not-found') note('warn', TEXT.jsdelivrLag)
        else down('jsdelivr', files.why)
      }
      if (r.pkg.repo) {
        const g = await getJson<GithubRepoJson>(`${GH}/repos/${r.pkg.repo}`, deps)
        if (g.ok) r.repo = repoInfo(g.data, null)
        else if (g.why === 'not-found') {
          r.repoMissing = true
          note('warn', `The repository ${r.pkg.repo} in package.json is not on GitHub or is private.`)
        } else down('github', g.why)
      }
    } else if (p.why === 'not-found') found = false
    else down('npm', p.why)
  } else {
    const [g, tags] = await Promise.all([
      getJson<GithubRepoJson>(`${GH}/repos/${t.repo}`, deps),
      getJson<{ versions?: { version: string }[] }>(`${JSD}/gh/${t.repo}`, deps),
    ])
    if (g.ok) found = true
    else if (g.why === 'not-found') found = false
    else down('github', g.why)
    let tag: string | null = null
    if (tags.ok) {
      tag =
        (tags.data.versions ?? [])
          .map((v) => v.version)
          .filter(isVersion)
          .sort(compareVersions)
          .at(-1) ?? null
      if (found === null && (tags.data.versions ?? []).length > 0) found = true
    } else if (tags.why !== 'not-found') down('jsdelivr', tags.why)
    if (g.ok) r.repo = repoInfo(g.data, tag)
    else if (tag) r.repo = { repo: t.repo, archived: false, license: null, defaultBranch: null, tag }
    if (found !== false) {
      if (r.repo) r.license = licenseCheck(r.repo.license)
      if (tag) {
        const files = await getJson<{ files?: { name: string }[] }>(`${JSD}/gh/${t.repo}@${tag}?structure=flat`, deps)
        if (files.ok) r.gate = gateFromFiles((files.data.files ?? []).map((f) => f.name))
        else if (files.why === 'not-found') note('warn', TEXT.jsdelivrLag)
        else down('jsdelivr', files.why)
      } else if (tags.ok)
        note('warn', 'No version tag yet. The nightly install needs a tag like v0.1.0 with dist/modules in it.')
    }
  }
  if (r.repo?.archived) note('warn', `The repository ${r.repo.repo} is archived.`)

  // kind from the file list (lib/rentgen/kind.ts resolveKind): modules first, then package.json hints
  if (r.gate) {
    if (r.gate.modules.length > 0) r.kind = 'module'
    else if (r.pkg?.provider) r.kind = 'provider'
    else if (r.pkg?.bin) r.kind = 'tool'
    else r.kind = 'library'
  }
  // a listed package that ships no module keeps the kind a curator gave it (finding of 25 Oct: Demo Auth, a listed
  // tool without a bin, read as a library, and Propose an edit would have changed its kind)
  const listedKind = r.existing?.kind
  const listedNoModule = !!listedKind && listedKind !== 'module' && r.kind !== null && r.kind !== 'module'
  if (listedNoModule) r.kind = listedKind

  // module IDs that core already ships (lint collision-core): CI rejects them unless the entry declares replaces
  const core = t.kind === 'npm' && t.name === CORE_PACKAGE
  if (!core && r.gate && ctx.builtIn) {
    const ids = new Set(ctx.builtIn.ids)
    const declared = new Set(r.existing?.replaces ?? [])
    r.collisions = r.gate.modules.map((m) => m.id).filter((id) => ids.has(id) && !declared.has(id))
    if (r.collisions.length > 0) note('error', collisionText(r.collisions, ctx.builtIn.coreVersion))
  }

  // states, most decisive first
  if (core && found !== false) r.states.push('core')
  if (found === false && !r.existing) r.states.push('not-found')
  if (found === null && !r.pkg && !r.repo && !r.existing) r.states.push('unknown')
  if (r.existing) r.states.push('listed')
  if (r.renamedTo) r.states.push('renamed')
  if (r.collisions.length > 0) r.states.push('collision')
  // a listed library, provider or tool is expected to ship no module: a note, not the red state
  if (r.gate && r.gate.modules.length === 0 && !listedNoModule) r.states.push('not-module')
  if (listedNoModule) note('info', `Listed as a ${listedKind}: no src/modules and dist/modules pair is expected.`)
  if (t.kind === 'github' && found !== false && !r.existing?.npm) r.states.push('github-only')
  if (r.ignored) r.states.push('ignored')
  return r
}

/** The npm package of Open Mercato core: its modules are built into every app, it is never a catalog entry. */
export const CORE_PACKAGE = '@open-mercato/core'

/** `Module ID customers is built into Open Mercato 0.9.0. ...` for one or several IDs. */
export function collisionText(ids: readonly string[], coreVersion: string): string {
  const list =
    ids.length === 1
      ? `Module ID ${ids[0]} is`
      : `Module IDs ${andList(ids.slice(0, 6))}${ids.length > 6 ? ` and ${ids.length - 6} more` : ''} are`
  return `${list} built into Open Mercato ${coreVersion}. A module that replaces ${ids.length === 1 ? 'it' : 'them'} needs replaces:, otherwise CI rejects the entry.`
}

interface GithubRepoJson {
  full_name?: string
  archived?: boolean
  license?: { spdx_id?: string | null } | null
  default_branch?: string
}
function repoInfo(j: GithubRepoJson, tag: string | null): RepoInfo {
  const spdx = j.license?.spdx_id
  return {
    repo: j.full_name ?? '',
    archived: j.archived === true,
    license: spdx && spdx !== 'NOASSERTION' ? spdx : null,
    defaultBranch: j.default_branch ?? null,
    tag,
  }
}

// ---------- names (LST-6, lib/validate/local.ts typosquatHits) ----------

export interface NameHit {
  other: string
  distance: number
  /** Only the same bare name under a scope of its own, not of @open-mercato: CI warns, never fails (25 Oct). */
  sameNameOnly?: boolean
  /** The same for a bare name 1 or 2 edits away (lib/validate/local.ts `nearNameOnly`). */
  nearNameOnly?: boolean
}
const ownerOf = (name: string): string | null =>
  name.startsWith('@') ? name.slice(0, name.indexOf('/')) : name.includes('/') ? `gh:${name.split('/')[0]}` : null
const bare = (name: string): string => name.slice(name.lastIndexOf('/') + 1)

export function typosquatHits(t: Target, catalog: readonly CatalogRef[]): NameHit[] {
  const name = (t.kind === 'npm' ? t.name : t.repo).toLowerCase()
  const own = ownerOf(name)
  const hits: NameHit[] = []
  for (const e of catalog) {
    const other = (e.npm ?? e.github ?? '').toLowerCase()
    if (!other || other === name || e.locator.toLowerCase() === locatorOf(t).toLowerCase()) continue
    if (own !== null && own === ownerOf(other)) continue
    const a = bare(name)
    const b = bare(other)
    const bareHit = Math.min(a.length, b.length) >= 5 ? distance(a, b) <= 2 : a === b
    const full = distance(name, other)
    const d = Math.min(full, bareHit ? distance(a, b) : Number.POSITIVE_INFINITY)
    const sameNameOnly = full > 2 && a === b && ownerOf(other) !== '@open-mercato'
    const nearNameOnly = full > 2 && bareHit && a !== b && ownerOf(other) !== '@open-mercato'
    if (d <= 2)
      hits.push({
        other: e.locator,
        distance: d,
        ...(sameNameOnly ? { sameNameOnly } : {}),
        ...(nearNameOnly ? { nearNameOnly } : {}),
      })
  }
  return hits.sort((x, y) => x.distance - y.distance || x.other.localeCompare(y.other))
}

// ---------- descriptor and YAML ----------

export interface FormState {
  category: string
  tags: string
  summary: string
  whenToUse: string
  providers: { name: string; label: string }[]
  /** Optional screenshots (26 Oct): an https URL and an alt text each; empty rows are left out of the YAML. */
  screenshots?: { src: string; alt: string }[]
  kind: 'module' | 'provider' | 'library' | 'tool'
  /** The author says the module replaces the core modules its IDs collide with (`replaces: core:<id>`, a curator confirms). */
  replacesCore?: boolean
}

export const emptyForm = (): FormState => ({
  category: '',
  tags: '',
  summary: '',
  whenToUse: 'Use when ',
  providers: [],
  screenshots: [],
  kind: 'module',
})

/** Screenshot rows the form offers (the descriptor takes up to SCREENSHOT_MAX; more are added in the file by hand). */
export const FORM_SCREENSHOTS = 3

export const splitTags = (s: string): string[] => [
  ...new Set(
    s
      .split(/[\s,]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  ),
]

/**
 * Descriptor object in the key order of spec 4.3. A new entry gets the author fields of the form; a listed entry
 * starts from its file in the catalog, so the curator fields (renamedFrom, whenNotToUse, replaces, alternatives and
 * the rest) stay, and the form fields replace their keys.
 */
export function buildDescriptor(t: Target, r: CheckResult | null, f: FormState): Record<string, unknown> {
  const base = r?.existing?.descriptor
  if (base) return orderKeys(withForm({ ...base }, r, f))
  const d: Record<string, unknown> = {}
  if (t.kind === 'npm') {
    d.npm = t.name
    // only a repository GitHub answered for and that is not archived: CI checks `github` too and fails a missing or
    // archived one (lib/validate/remote.ts); when GitHub did not answer, the repository of package.json
    const repo = r?.repo ? (r.repo.archived ? null : r.repo.repo) : r?.repoMissing ? null : r?.pkg?.repo
    if (repo && GithubRepo.safeParse(repo).success) d.github = repo
  } else d.github = r?.repo?.repo || t.repo
  return withForm(d, r, f)
}

/** Writes the author fields of the form into a descriptor (an empty list or text removes its key). */
function withForm(d: Record<string, unknown>, r: CheckResult | null, f: FormState): Record<string, unknown> {
  const kind = r?.kind && r.kind !== 'module' ? (f.kind !== 'module' ? f.kind : r.kind) : (d.kind ?? 'module')
  if (kind !== 'module') d.kind = kind
  else delete d.kind
  if (f.category) d.category = f.category
  else delete d.category
  const tags = splitTags(f.tags)
  if (tags.length > 0) d.tags = tags
  else delete d.tags
  d.summary = f.summary.trim()
  d.whenToUse = f.whenToUse.trim()
  const providers = f.providers
    .map((p) => ({ name: p.name.trim().toLowerCase(), label: p.label.trim() }))
    .filter((p) => p.name || p.label)
  if (providers.length > 0) d.providers = providers
  else delete d.providers
  // a form without the field (an older state) keeps the screenshots of the file it starts from
  if (f.screenshots) {
    const shots = f.screenshots.map((x) => ({ src: x.src.trim(), alt: x.alt.trim() })).filter((x) => x.src || x.alt)
    if (shots.length > 0) d.screenshots = shots
    else delete d.screenshots
  }
  // a core module ID only with the author's tick (finding of 25 Oct: the form opened a pull request the collision-core
  // lint rejects); `replaces` is a curator field, the curator confirms it in review
  const collisions = r?.collisions ?? []
  if (f.replacesCore && collisions.length > 0) {
    const had = Array.isArray(d.replaces) ? (d.replaces as string[]) : []
    d.replaces = [...new Set([...had, ...collisions.map((id) => `core:${id}`)])]
  }
  return d
}

/**
 * Why a collision with a core module ID keeps the pull request closed, or null: without the `replaces` tick CI's
 * collision-core lint rejects the entry, as it does an archived or deprecated package (finding of 25 Oct).
 */
export function collisionBlock(r: CheckResult | null, f: FormState): string | null {
  const ids = r?.collisions ?? []
  if (ids.length === 0 || f.replacesCore) return null
  return `Module ${ids.length === 1 ? 'ID' : 'IDs'} ${andList(ids)} ${ids.length === 1 ? 'is' : 'are'} built into core. Rename the module, or tick that it replaces core.`
}

/** Keys in the order of spec 4.3 (`yarn om format`); unknown keys keep their place after the known ones. */
function orderKeys(d: Record<string, unknown>): Record<string, unknown> {
  const order: readonly string[] = DESCRIPTOR_KEY_ORDER
  const rank = (k: string): number => (order.includes(k) ? order.indexOf(k) : order.length)
  return Object.fromEntries(Object.entries(d).sort(([a], [b]) => rank(a) - rank(b)))
}

/** Field problems from the same Zod schema CI uses (`Descriptor`), each as one sentence in the words of the form. */
export function descriptorIssues(d: Record<string, unknown>): { path: string; message: string }[] {
  const res = Descriptor.safeParse(d)
  if (res.success) return []
  const seen = new Set<string>()
  return res.error.issues
    .map((i) => ({
      path: i.path.join('.') || 'descriptor',
      message:
        i.path[0] === 'screenshots'
          ? screenshotIssueText(i.path, i.message)
          : issueText(String(i.path[0] ?? ''), i.message),
    }))
    .filter((i) => !seen.has(i.message) && seen.add(i.message))
}

const FIELD_NAME: Record<string, string> = {
  summary: 'Summary',
  whenToUse: 'When to use',
  tags: 'Tags',
  providers: 'Providers',
  category: 'Category',
}

/** The problem of one screenshot row, as one sentence that names the row. */
export function screenshotIssueText(path: readonly PropertyKey[], message: string): string {
  if (typeof path[1] !== 'number') return `Screenshots: at most ${SCREENSHOT_MAX}.`
  const row = `Screenshot ${path[1] + 1}`
  if (path[2] === 'alt')
    return /plain text/.test(message)
      ? `${row}: the description is plain text only, no links, markdown, HTML or backticks.`
      : `${row}: describe the image in ${SCREENSHOT_ALT_MIN} to ${SCREENSHOT_ALT_MAX} characters.`
  if (path[2] === 'src') {
    if (message.startsWith('use screenshots/'))
      return `${row}: use an https link to an image of your repository on raw.githubusercontent.com, or a github.com/user-attachments link.`
    return `${row}: ${message}.`
  }
  return `${row}: give a link and a description.`
}

/** Short, actionable sentences for the fields of the form; anything else keeps the schema message. */
function issueText(field: string, message: string): string {
  if (/plain text/.test(message))
    return `${FIELD_NAME[field] ?? 'Text'}: plain text only, no links, markdown, HTML or backticks.`
  switch (field) {
    case 'category':
      return 'Pick a category.'
    case 'summary':
      return 'Summary: 20 to 140 characters of plain text.'
    case 'whenToUse':
      return 'When to use: start with "Use when ", 40 to 240 characters.'
    case 'tags':
      return 'Tags: lower case letters, digits and dashes, 2 to 24 characters, at most 8.'
    case 'providers':
      return 'Providers: id in lower case letters, digits and dashes; label up to 40 characters.'
    default:
      return `${field || 'Descriptor'}: ${message}`.replace(/([^.])$/, '$1.')
  }
}

const YAML_RESERVED = /^(?:true|True|TRUE|false|False|FALSE|null|Null|NULL|~)$/ // YAML 1.2 core schema
const YAML_NUMBER = /^[-+]?(?:\.?\d|0x|0o|\.inf|\.nan)/i

/**
 * Whether a string can stay a plain YAML scalar. Mirrors what `yarn om format` keeps plain (the yaml library
 * quotes only when plain would misread), so the file the form builds passes `prettier --check` unchanged.
 */
export function plainOk(s: string, flow: boolean): boolean {
  if (s === '' || s !== s.trim()) return false
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return false
  if (/: |:$| #|[\n\r\t]/.test(s)) return false
  if (flow && /[,[\]{}]/.test(s)) return false
  if (YAML_RESERVED.test(s) || YAML_NUMBER.test(s)) return false
  return true
}

/** Plain when YAML allows it, else double quotes, or single quotes when that needs fewer escapes (Prettier). */
const scalar = (s: string, flow = false): string => {
  if (plainOk(s, flow)) return s
  if (s.includes('"') && !s.includes("'") && !/[\\\n\r\t]/.test(s)) return `'${s}'`
  return JSON.stringify(s)
}

/** Lists written inline and keys whose values are locators (always double-quoted), as in lib/validate/format.ts. */
const FLOW_KEYS = new Set(['tags', 'alternatives', 'replaces', 'renamedFrom', 'aliases'])
const LOCATOR_KEYS = new Set(['extends', 'alternatives', 'replaces', 'renamedFrom', 'supersededBy'])
/** Key order inside nested maps (schema order of spec 4.3). */
const NESTED_ORDER: Record<string, readonly string[]> = {
  links: ['docs', 'support', 'demo'],
  smoke: ['paths'],
  scriptsRequired: ['reason'],
  declares: ['hosts', 'env'],
  enterprise: ['offerUrl', 'modules'],
}

/** Key order of a screenshot (block maps, as `yarn om format` writes them). */
const SCREENSHOT_ORDER = ['src', 'alt'] as const

const value = (v: unknown, flow: boolean, locator: boolean): string =>
  typeof v === 'string' ? (locator ? JSON.stringify(v) : scalar(v, flow)) : String(v)

function yamlEntry(k: string, v: unknown, indent: string, out: string[], top: boolean): void {
  if (v === undefined || v === null) return
  if (Array.isArray(v)) {
    if (top && k === 'providers') {
      out.push(`${indent}providers:`)
      for (const p of v as { name: string; label: string }[])
        out.push(`${indent}  - { name: ${scalar(p.name, true)}, label: ${scalar(p.label, true)} }`)
    } else if (top && k === 'screenshots') {
      out.push(`${indent}screenshots:`)
      for (const x of v as Record<string, unknown>[]) {
        const keys = [
          ...SCREENSHOT_ORDER.filter((sk) => sk in x),
          ...Object.keys(x).filter((sk) => !(SCREENSHOT_ORDER as readonly string[]).includes(sk)),
        ]
        keys.forEach((sk, j) => {
          const sv = x[sk]
          if (sv !== undefined && sv !== null)
            out.push(`${indent}${j === 0 ? '  - ' : '    '}${sk}: ${value(sv, false, false)}`)
        })
      }
    } else if ((top && FLOW_KEYS.has(k)) || (!top && k === 'modules'))
      out.push(`${indent}${k}: [${v.map((x) => value(x, true, top && LOCATOR_KEYS.has(k))).join(', ')}]`)
    else {
      out.push(`${indent}${k}:`)
      for (const x of v) out.push(`${indent}  - ${value(x, false, false)}`)
    }
  } else if (typeof v === 'object') {
    out.push(`${indent}${k}:`)
    const m = v as Record<string, unknown>
    const order = NESTED_ORDER[k] ?? []
    const rank = (x: string): number => (order.includes(x) ? order.indexOf(x) : order.length)
    for (const [ck, cv] of Object.entries(m).sort(([a], [b]) => rank(a) - rank(b)))
      yamlEntry(ck, cv, `${indent}  `, out, false)
  } else out.push(`${indent}${k}: ${value(v, false, top && LOCATOR_KEYS.has(k))}`)
}

/** The descriptor as YAML in the house style of `yarn om format`. */
export function descriptorYaml(d: Record<string, unknown>): string {
  const out: string[] = []
  for (const [k, v] of Object.entries(d)) yamlEntry(k, v, '', out, true)
  return `${out.join('\n')}\n`
}

// ---------- links ----------

export function descriptorPath(t: Target): string {
  return `modules/${locatorToPath(locatorOf(t))}.yml`
}
export function pullRequestUrl(repo: string, t: Target, yaml: string): string {
  return `${repo}/new/main?filename=${encodeURIComponent(descriptorPath(t))}&value=${encodeURIComponent(yaml)}`
}
export function editUrl(repo: string, path: string): string {
  return `${repo}/edit/main/modules/${path}.yml`
}
export function listingRequestUrl(repo: string, t: Target, f: FormState): string {
  const q = new URLSearchParams({
    template: 'listing-request.yml',
    title: `Listing request: ${t.kind === 'npm' ? t.name : t.repo}`,
    package: t.kind === 'npm' ? t.name : t.repo,
  })
  if (f.category) q.set('category', f.category)
  if (f.summary.trim()) q.set('summary', f.summary.trim())
  if (f.whenToUse.trim() && f.whenToUse.trim() !== 'Use when') q.set('when-to-use', f.whenToUse.trim())
  return `${repo}/issues/new?${q.toString()}`
}

// ---------- rules shown live (spec 6.3 LST-1..6) ----------

export type RuleState = 'pass' | 'fail' | 'pending' | 'unknown'
export interface LiveRule {
  id: string
  state: RuleState
  text: string
}

export function liveRules(
  t: Target,
  r: CheckResult | null,
  issues: { path: string; message: string }[],
  names: NameHit[],
): LiveRule[] {
  const out: LiveRule[] = []
  out.push(
    issues.length === 0
      ? { id: 'LST-1', state: 'pass', text: 'The descriptor is valid.' }
      : { id: 'LST-1', state: 'fail', text: (issues[0]?.message ?? 'The descriptor is not valid.').slice(0, 160) },
  )
  if (!r) return out
  if (t.kind === 'npm') {
    if (!r.pkg)
      out.push({
        id: 'LST-2',
        state: r.states.includes('not-found') ? 'fail' : 'unknown',
        text: r.states.includes('not-found') ? 'No such package on npm.' : 'npm did not answer.',
      })
    else if (r.pkg.deprecated) out.push({ id: 'LST-2', state: 'fail', text: 'The package is deprecated on npm.' })
    else if (!r.pkg.stable && !t.name.startsWith('@open-mercato/'))
      out.push({ id: 'LST-2', state: 'fail', text: 'No stable version yet.' })
    else out.push({ id: 'LST-2', state: 'pass', text: `Version ${r.pkg.version} on npm.` })
  } else {
    out.push(
      r.repo?.archived
        ? // CI rejects it (locator/archived) and tier.ts fails LST-2 on it (finding of 25 Oct)
          { id: 'LST-2', state: 'fail', text: 'Repository is archived.' }
        : r.repo
          ? {
              id: 'LST-2',
              state: r.repo.tag ? 'pass' : 'fail',
              text: r.repo.tag ? `Tag ${r.repo.tag} on GitHub.` : 'No version tag yet.',
            }
          : {
              id: 'LST-2',
              state: r.states.includes('not-found') ? 'fail' : 'unknown',
              text: r.states.includes('not-found') ? 'No such public repository.' : 'GitHub did not answer.',
            },
    )
  }
  if (!r.gate) out.push({ id: 'LST-3', state: 'unknown', text: 'File list not checked yet.' })
  else if (r.kind === 'module')
    out.push(
      r.gate.installable
        ? {
            id: 'LST-3',
            state: 'pass',
            text: `Module ${r.gate.modules
              .filter((m) => m.src && m.dist)
              .map((m) => m.id)
              .join(', ')}: src and dist pair found.`,
          }
        : { id: 'LST-3', state: 'fail', text: r.gate.reason ?? 'No src/dist pair.' },
    )
  else if (r.existing?.kind === r.kind)
    // listed with this kind: a curator already checked it (finding of 25 Oct)
    out.push({ id: 'LST-3', state: 'pass', text: `Kind ${r.kind}: listed, no module in the package is expected.` })
  else if (
    r.pkg &&
    ![...Object.keys(r.pkg.peers), ...Object.keys(r.pkg.dependencies)].some((d) => d.startsWith('@open-mercato/'))
  )
    // a package with no Open Mercato dependency or peer is no library or tool of Open Mercato by itself (finding of
    // 25 Oct: a Strapi plugin passed as `Kind library`); a curator decides
    out.push({
      id: 'LST-3',
      state: 'unknown',
      text: `Kind ${r.kind}: no module in the package and no @open-mercato dependency or peer. A curator checks that it is built for Open Mercato.`,
    })
  else
    out.push({ id: 'LST-3', state: 'pass', text: `Kind ${r.kind}: no module in the package, package.json is enough.` })
  out.push({
    id: 'LST-4',
    state: 'pass',
    text: r.license
      ? r.license.value
        ? `License ${r.license.value}.`
        : 'License unknown, shown on the card.'
      : 'License shown on the card.',
  })
  out.push({ id: 'LST-5', state: 'pending', text: 'Advisories are checked by CI after you open the pull request.' })
  out.push(
    names.length === 0
      ? { id: 'LST-6', state: 'pass', text: 'The name is not close to a listed one.' }
      : names.every((n) => n.sameNameOnly || n.nearNameOnly)
        ? // the module name of someone else's listed module, or one close to it, under your own scope: CI warns, a
          // curator reads it (25 Oct)
          {
            id: 'LST-6',
            state: 'unknown',
            text: `${names[0]?.sameNameOnly ? 'Same module name as' : 'Module name close to'} ${names[0]?.other} under another scope. A curator checks the name.`,
          }
        : { id: 'LST-6', state: 'fail', text: `Close to ${names[0]?.other}. A curator reviews the name.` },
  )
  return out
}

// ---------- form defaults from the package ----------

const GENERIC_KEYWORDS = new Set(['open-mercato', 'open-mercato-module', 'openmercato', 'mercato', 'module', 'modules'])

/** The key of a target, so the form knows whether a Check is for the same package as the values it holds. */
export const targetKey = (t: Target): string =>
  t.kind === 'npm' ? `npm:${t.name.toLowerCase()}` : `github:${t.repo.toLowerCase()}`

/**
 * The form a Check starts from. Checking the same package again keeps what the user typed; checking another package
 * starts from an empty form, so no value of the previous package (filled from its packument or typed for it) ends up
 * in the descriptor of the new one.
 */
export function formForCheck(prev: FormState, prevKey: string | null, key: string): FormState {
  return prevKey === key ? prev : emptyForm()
}

export function formFromPackage(
  r: CheckResult,
  categories: readonly { id: string; aliases?: readonly string[] }[],
  prev: FormState,
): FormState {
  const f = { ...prev }
  const cur = r.existing?.fields
  if (cur) {
    if (!f.category) f.category = cur.category
    if (!f.tags.trim()) f.tags = cur.tags.join(', ')
    if (!f.summary.trim()) f.summary = cur.summary
    if (!f.whenToUse.trim() || f.whenToUse.trim() === 'Use when') f.whenToUse = cur.whenToUse
    if (f.providers.length === 0) f.providers = cur.providers.map((p) => ({ ...p }))
  }
  // the screenshots of a listed entry's file, so a proposed edit keeps them
  const shots = r.existing?.descriptor?.screenshots
  if ((f.screenshots ?? []).length === 0 && Array.isArray(shots))
    f.screenshots = shots
      .filter((x): x is { src: unknown; alt: unknown } => !!x && typeof x === 'object')
      .map((x) => ({ src: typeof x.src === 'string' ? x.src : '', alt: typeof x.alt === 'string' ? x.alt : '' }))
  const kw = r.pkg?.keywords.map((k) => k.toLowerCase()) ?? []
  if (!f.category) {
    for (const k of kw) {
      const c = categories.find((x) => x.id === k || x.aliases?.includes(k))
      if (c) {
        f.category = c.id
        break
      }
    }
  }
  if (!f.tags.trim())
    f.tags = kw
      .filter((k) => !GENERIC_KEYWORDS.has(k) && /^[a-z0-9-]{2,24}$/.test(k))
      .slice(0, 8)
      .join(', ')
  const fromNpm = summaryFromDescription(r.pkg?.description ?? '')
  if (!f.summary.trim() && fromNpm) f.summary = fromNpm
  if (r.kind && r.kind !== 'module') f.kind = r.kind
  return f
}

/**
 * The Summary an npm description gives: the description when it fits 20 to 140 characters of plain text, else its
 * first sentence when that fits (finding of 25 Oct: most community descriptions are longer than 140 characters and
 * left Summary empty, so the author started on a failing LST-1). Null otherwise; the author checks it like any field.
 */
export function summaryFromDescription(description: string): string | null {
  const fits = (s: string): boolean => s.length >= 20 && s.length <= 140 && plainTextViolation(s) === null
  const d = description.trim()
  if (fits(d)) return d
  const first = /^(.+?[.!?])\s/.exec(d)?.[1]
  return first && fits(first) ? first : null
}

/** Title from a package name: `@x/open-mercato-data-sync` -> `Data Sync` (lib/core/entry.ts entryTitle without facts). */
export function titleOf(name: string): string {
  const base = name.split('/').at(-1) ?? name
  const words = base
    .replace(/^open-?mercato-/, '')
    .split(/[-_.]+/)
    .filter(Boolean)
  return (
    words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .slice(0, 80) || base
  )
}

/**
 * The target the descriptor is written for: a GitHub repository listed under its npm name is edited as that npm
 * entry (spec 4.3), so the YAML, the path and the preview match the file in the catalog.
 */
export function effectiveTarget(t: Target, r: CheckResult | null): Target {
  return t.kind === 'github' && r?.existing?.npm ? { kind: 'npm', name: r.existing.npm } : t
}

/**
 * The install command the preview shows. A listed entry uses the command of the catalog (D46: the recommended
 * version of the line once receipts exist), so /submit and the module page never disagree; a new package gets
 * the command for the version the checks picked.
 */
export function installCommand(t: Target, r: CheckResult | null): string | null {
  if (r?.existing?.cli) return r.existing.cli
  const version = r?.pkg?.version ?? r?.repo?.tag ?? null
  if (t.kind === 'npm')
    return version
      ? `yarn mercato module add ${t.name}@${version}${t.name.startsWith('@open-mercato/') ? '' : ' --allow-third-party'}`
      : null
  return `npx create-mercato-module install ${t.repo}${version ? ` --ref ${version}` : ''}`
}

/** Whether the page offers an install command: only for a module or provider that is not ignored. */
export function showsCommand(r: CheckResult): boolean {
  if (r.ignored || r.states.includes('not-module') || r.states.includes('not-found') || r.states.includes('core'))
    return false
  return r.kind === null || r.kind === 'module' || r.kind === 'provider'
}

export type Cadence = 'nightly' | 'weekly'
/** Lines grouped by how often they run, nightly first: `[{ keys: ['0.9', 'next'], when: 'every night' }, ...]`. */
export function cadenceGroups(lines: readonly { key: string; cadence: Cadence }[]): { keys: string[]; when: string }[] {
  const out: { keys: string[]; when: string }[] = []
  for (const [c, when] of [
    ['nightly', 'every night'],
    ['weekly', 'once a week'],
  ] as const) {
    const keys = lines.filter((l) => l.cadence === c).map((l) => l.key)
    if (keys.length > 0) out.push({ keys, when })
  }
  return out
}
const PLURAL: Record<string, string> = { provider: 'providers', library: 'libraries', tool: 'tools' }
/** Line keys in reading order, `0.8, 0.9, next`. */
const orderedKeys = (keys: readonly string[]): string[] =>
  [...keys].sort((a, b) => (a === 'next' ? 1 : b === 'next' ? -1 : a.localeCompare(b, 'en', { numeric: true })))
const andList = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`
/** `Lines tested: 0.9 and next every night, 0.8 once a week.` */
export function cadenceText(lines: readonly { key: string; cadence: Cadence }[]): string {
  return `Lines tested: ${cadenceGroups(lines)
    .map((g) => `${andList(g.keys)} ${g.when}`)
    .join(', ')}.`
}

/**
 * Why CI's validate would reject the pull request, from what the check found (finding of 25 Oct: the form opened a PR
 * for the archived official-modules repository that `yarn om validate` then failed with locator/archived). The same
 * errors as lib/validate/remote.ts stepLocator: an archived repository, a deprecated package, no stable version
 * outside @open-mercato. Null when none applies; then the schema issues decide.
 */
export function ciRejection(t: Target, r: CheckResult | null): string | null {
  if (!r) return null
  if (t.kind === 'github' && r.repo?.archived)
    return `CI rejects an archived repository (${r.repo.repo}). Unarchive it, or use Request listing.`
  if (t.kind === 'npm' && r.pkg) {
    if (r.pkg.deprecated) return 'CI rejects a deprecated package. Publish a version that is not deprecated first.'
    if (!r.pkg.stable && !t.name.startsWith('@open-mercato/'))
      return 'CI rejects a package without a stable version. Publish a version like 0.1.0 first.'
  }
  return null
}

/** IndexEntry-shaped preview for the real ModuleRow (fields the row reads; the rest are neutral). */
export function previewEntry(t: Target, r: CheckResult | null, f: FormState, rulesPass: boolean): IndexEntry {
  const locator = locatorOf(t)
  const npm = t.kind === 'npm' ? t.name : null
  const version = r?.pkg?.version ?? r?.repo?.tag ?? null
  const official = npm?.startsWith('@open-mercato/') ?? false
  const lic = r?.license
  const existing = r?.existing ?? null
  const kind = existing?.kind ?? (buildDescriptor(t, r, f).kind as IndexEntry['kind'] | undefined) ?? 'module'
  const cli =
    installCommand(t, r) ??
    `npx create-mercato-module install ${t.kind === 'github' ? t.repo : locator}${version ? ` --ref ${version}` : ''}`
  return {
    locator,
    path: locatorToPath(locator),
    npm,
    github: t.kind === 'github' ? t.repo : (r?.pkg?.repo ?? null),
    repoPath: null,
    kind,
    type: r?.existing?.type ?? (official ? 'official' : '3rd-party'),
    enterprise: false,
    title: existing?.title ?? titleOf(t.kind === 'npm' ? t.name : t.repo),
    summary: f.summary.trim() || 'Your summary appears here.',
    whenToUse: f.whenToUse,
    whenNotToUse: null,
    category: (CategoryId.safeParse(f.category).success ? f.category : 'operations') as IndexEntry['category'],
    tags: splitTags(f.tags),
    providers: [],
    moduleIds: r?.gate?.modules.map((m) => m.id) ?? [],
    requires: [],
    replaces: [],
    slotConflicts: [],
    renamedFrom: [],
    supersededBy: null,
    alternatives: [],
    status: 'active',
    listed: rulesPass,
    featured: false,
    license: { spdx: lic?.kind === 'osi' ? lic.value : null, kind: lic?.kind ?? 'unknown', mismatch: false },
    version: {
      latest: version,
      preview: null,
      publishedAt: r?.pkg?.publishedAt?.slice(0, 10) ?? null,
      integrity: null,
      installableFrom: r?.installableFrom ?? null,
      gitRef: null,
      recommended: {},
    },
    identity: { builtFrom: 'none', claimed: false, source: t.kind },
    compat: {
      builtFor: { range: null, kind: 'missing', lines: [] },
      lines: existing?.row?.lines ?? {},
      verifiedOn: existing?.row?.verifiedOn ?? [],
    },
    // a listed entry shows its real squares (finding of 25 Oct), with a receipt of another version as such
    others: existing?.row?.others ?? {},
    anatomy: null,
    signals: {
      receipt: {},
      fit: {},
      anatomy: 'none',
      supplyChain: { status: 'ok', reasons: [] },
      hygiene: { status: 'ok', failing: [] },
      maintenance: { status: 'current', lastRelease: null, catchUpDays: null },
      declaredVsObserved: { status: 'match', notes: [] },
    },
    tier: existing?.row ? existing.row.tier : rulesPass ? 'listed' : null,
    quality: null,
    agentPolicy: {},
    install: { cli, cmm: null, needsAllowThirdParty: !official, moduleFlag: null },
    stats: null,
    sigil: existing?.sigil
      ? { glyph: existing.sigil.glyph, phase: existing.sigil.phase, publicRoutes: existing.sigil.publicRoutes }
      : { glyph: '0000000', phase: sigilPhase(locator), publicRoutes: false },
    links: {
      page: modulePage(locatorToPath(locator)),
      md: '',
      json: '',
      facts: null,
      npm: npm ? `https://www.npmjs.com/package/${npm}` : null,
      repo: null,
      docs: null,
    },
    addedAt: '2026-01-01',
    updatedAt: '2026-01-01T00:00:00Z',
    _meta: {},
  } as unknown as IndexEntry
}

// ---------- component ----------

export interface SubmitFormProps {
  catalog: CatalogRef[]
  ignore: { locator: string; reason: string }[]
  categories: { id: string; title: string; aliases?: string[] }[]
  lines: { key: string; version: string; source: 'latest' | 'previous' | 'develop'; cadence: Cadence }[]
  coreVersion: string
  preapproved: string[]
  /** Module IDs built into core of the latest line (built-in.json). */
  builtIn?: { coreVersion: string; ids: string[] }
  repo: string
}

type Tone = 'ok' | 'info' | 'wait' | 'bad'
const STATE_TEXT: Record<StateId, { tag: string; tone: Tone }> = {
  core: { tag: 'Open Mercato core', tone: 'bad' },
  collision: { tag: 'Collides with core', tone: 'bad' },
  listed: { tag: 'Already listed', tone: 'info' },
  renamed: { tag: 'Renamed', tone: 'wait' },
  'not-module': { tag: 'Not an Open Mercato module', tone: 'bad' },
  'github-only': { tag: 'GitHub only', tone: 'info' },
  ignored: { tag: 'Ignored', tone: 'wait' },
  'not-found': { tag: 'Not found', tone: 'bad' },
  unknown: { tag: 'Not checked', tone: 'wait' },
}
const NOTICE_TONE: Record<Notice['level'], Tone> = { error: 'bad', warn: 'wait', info: 'info' }

/** Mono tag of a notice banner, so every banner has the same anatomy as the state banners. */
export function noticeTag(n: Notice): string {
  const t = n.text
  if (t === TEXT.githubLimit) return 'Rate limit'
  if (t === TEXT.npmDown) return 'npm unreachable'
  if (t === TEXT.jsdelivrDown) return 'jsDelivr unreachable'
  if (t === TEXT.githubDown) return 'GitHub unreachable'
  if (t === TEXT.jsdelivrLag) return 'jsDelivr behind'
  if (t.startsWith('Deprecated')) return 'Deprecated'
  if (t.startsWith('No stable release')) return 'No stable release'
  if (t.startsWith('Declares install scripts')) return 'Install scripts'
  if (/^Module IDs? /.test(t)) return 'Core module ID'
  if (t.startsWith('No version tag')) return 'No tag'
  if (t.startsWith('The repository')) return 'Repository'
  return n.level === 'error' ? 'Error' : n.level === 'warn' ? 'Check' : 'Note'
}

/** One banner style for every state and notice: a 3 px signal bar on --bg-2, an optional mono tag, the sentence. */
function Banner({ tone, tag, alert, children }: { tone: Tone; tag?: string; alert?: boolean; children: unknown }) {
  return (
    <div class={`sf__banner sf__banner--${tone}`} role={alert ? 'alert' : undefined}>
      {tag && <span class="sf__btag">{tag}</span>}
      <span class="sf__btext">{children as never}</span>
    </div>
  )
}

/**
 * The Installable fact: a future date is when new apps start accepting the release (Yarn 5-day age gate), a past
 * one is since when they do. It speaks of the age gate only (finding of 25 Oct: `A fresh app installs it today` stood
 * beside packages broken at typecheck on every line); whether it installs is the nightly run's verdict.
 */
export function installableText(from: string | null, today: string, kind: CheckResult['kind'] = 'module'): string {
  if (!from) return 'Unknown.'
  if (from > today) return `From ${dayText(from)}. New apps refuse it until then (Yarn ${AGE_GATE_DAYS}-day age gate).`
  // the nightly run installs modules only (spec 5.3): a library, provider or tool is read, never installed
  const run =
    kind === null || kind === 'module'
      ? 'The nightly run decides whether it installs.'
      : `The nightly run installs modules only, so a ${kind} is never verified.`
  return `Past the Yarn ${AGE_GATE_DAYS}-day age gate since ${dayText(from)}. ${run}`
}

/**
 * What the catalog's last run says of a listed package on a line, in the words of its page: `Broken at typecheck on
 * 0.9 (24 Oct).`, `Verified on 0.9 (24 Oct).`, `Not judged on 0.9: our test app failed (24 Oct).` Null when the entry
 * is not listed or the line has no receipt.
 */
export function listedRunText(row: CatalogRef['row'] | undefined, line: string | null): string | null {
  if (!row || !line) return null
  const o = row.others[line]
  if (o) return `On ${line} a new app installs ${o.installs}, which has no receipt yet.`
  const c = row.lines[line]
  if (!c) return null
  const on = c.at ? ` (${dayText(c.at.slice(0, 10)).replace(/ \d{4}$/, '')})` : ''
  switch (c.status) {
    case 'verified':
      return `Verified on ${line}${on}.`
    case 'broken':
      return `Broken${c.step ? ` at ${c.step}` : ''} on ${line}${on}. See its page for the receipt.`
    case 'harness-red':
      return `Not judged on ${line}: our test app failed${on}.`
    case 'infra-error':
      return `Not judged on ${line}: the run did not finish${on}.`
    case 'quarantine':
      return `Not judged on ${line}: in the Yarn age gate${on}.`
    case 'skipped':
      return 'The catalog does not install it.'
    default:
      return null
  }
}

/** A sentence in ink with one value (a range, a license) marked in mono; the mark carries the warning colour. */
function Marked({ text, mark, warn }: { text: string; mark: string; warn: boolean }) {
  const i = mark ? text.indexOf(mark) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <code class={warn ? 'sf__mark-warn' : 'sf__mark-ok'}>{mark}</code>
      {text.slice(i + mark.length)}
    </>
  )
}

function dayText(iso: string): string {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return `${d} ${M[m - 1]} ${y}`
}

export default function SubmitForm(props: SubmitFormProps) {
  const ctx: CheckContext = useMemo(
    () => ({
      catalog: props.catalog,
      ignore: props.ignore,
      coreVersion: props.coreVersion,
      preapproved: props.preapproved,
      builtIn: props.builtIn,
    }),
    [props],
  )
  const [input, setInput] = useState('')
  const [target, setTarget] = useState<Target | null>(null)
  const [inputError, setInputError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [copied, setCopied] = useState(false)
  const [editCopied, setEditCopied] = useState(false)
  const run = useRef(0)
  const formKey = useRef<string | null>(null)

  const check = async (raw: string) => {
    const parsed = parseTarget(raw)
    if (!parsed) return
    if (parsed.kind === 'invalid') {
      setInputError(parsed.message)
      return
    }
    setInputError(null)
    setTarget(parsed)
    setBusy(true)
    setResult(null)
    const key = targetKey(parsed)
    const prevKey = formKey.current
    formKey.current = key
    setForm((f) => formForCheck(f, prevKey, key))
    const id = ++run.current
    const res = await runChecks(parsed, ctx, { fetch: (u, i) => fetch(u, i) })
    if (id !== run.current) return
    setResult(res)
    setForm((f) => formFromPackage(res, props.categories, f))
    setBusy(false)
  }

  useEffect(() => {
    // a name typed, or a Check pressed, before the island hydrated (it hydrates after first paint, spec 7.11; finding of
    // 25 Oct: the native submit reloaded the page, or the field kept text the state did not have): the page's inline
    // script keeps the submitted value in `window.__omSubmit`, and the field keeps what was typed
    const w = window as unknown as { __omSubmit?: string }
    const early = typeof w.__omSubmit === 'string' ? w.__omSubmit.slice(0, 220) : null
    delete w.__omSubmit
    const typedEarly = (document.getElementById('sf-pkg') as HTMLInputElement | null)?.value.slice(0, 220) ?? ''
    if (early !== null && early.trim()) {
      setInput(early)
      void check(early)
      return
    }
    if (typedEarly.trim()) {
      setInput(typedEarly)
      return
    }
    let q: URLSearchParams
    try {
      q = new URLSearchParams(window.location.search)
    } catch {
      return
    }
    const pre = q.get('npm') ?? (q.get('github') ? `github:${q.get('github')}` : null)
    if (pre) {
      const v = pre.slice(0, 220)
      setInput(v.replace(/^github:/, ''))
      void check(v)
    }
  }, [])

  const typed = target
  const t = typed ? effectiveTarget(typed, result) : null
  const descriptor = t ? buildDescriptor(t, result, form) : null
  const issues = descriptor ? descriptorIssues(descriptor) : []
  const names = t ? typosquatHits(t, props.catalog) : []
  const rules = t ? liveRules(t, result, issues, names) : []
  const rulesPass = rules.length > 0 && rules.every((r) => r.state !== 'fail')
  // CI would fail the pull request (archived, deprecated, no stable version): the button stays off (25 Oct)
  const rejected = t ? ciRejection(t, result) : null
  const collisionStop = result?.existing ? null : collisionBlock(result, form)
  const blocked = issues.length > 0 || !!rejected || !!collisionStop
  const yaml = descriptor ? descriptorYaml(descriptor) : ''
  const states = result?.states ?? []
  const stopped = states.includes('not-found') || states.includes('core')
  const ignored = states.includes('ignored')
  const sumFlags = injectionFlags(form.summary)
  const sumProblem = form.summary ? plainTextViolation(form.summary) : null
  const wtuProblem = form.whenToUse ? plainTextViolation(form.whenToUse) : null
  const fieldIssue = (p: string) => issues.find((i) => i.path === p || i.path.startsWith(`${p}.`))?.message ?? null
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const shotRows = form.screenshots ?? []

  // the YAML the form writes for a listed entry before anyone types: its file as the form reads it
  const baseYaml =
    t && result?.existing
      ? descriptorYaml(buildDescriptor(t, result, formFromPackage(result, props.categories, emptyForm())))
      : null
  const edited = baseYaml !== null && yaml !== baseYaml
  const copyYaml = async () => {
    try {
      await navigator.clipboard.writeText(yaml)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div class="sf">
      <div class="sf__left">
        <form
          class="sf__lookup"
          onSubmit={(e) => {
            e.preventDefault()
            void check(input)
          }}
        >
          <label class="sf__label" for="sf-pkg">
            npm package or GitHub owner/repo
          </label>
          <div class="sf__row">
            <input
              id="sf-pkg"
              class="sf__input sf__input--mono"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellcheck={false}
              placeholder="@your-scope/your-module"
              value={input}
              onInput={(e) => setInput((e.currentTarget as HTMLInputElement).value)}
              aria-describedby="sf-pkg-help"
            />
            <button class="btn btn--primary sf__check" type="submit" disabled={busy}>
              {busy ? 'Checking' : 'Check'}
            </button>
          </div>
          <p id="sf-pkg-help" class="sf__help">
            The browser asks npm, jsDelivr and GitHub directly. Nothing is sent to the catalog.
          </p>
          {inputError && (
            <p class="sf__err" role="alert">
              {inputError}
            </p>
          )}
        </form>

        <div class="sf__status" aria-live="polite">
          {busy && (
            <p class="sf__busy">
              Checking {typed ? (typed.kind === 'npm' ? typed.name : typed.repo) : ''} on npm, jsDelivr and GitHub.
            </p>
          )}
        </div>

        {result && typed && t && (
          <section class="sf__result" aria-label="Checks">
            <States
              r={result}
              t={typed}
              repo={props.repo}
              catalog={props.catalog}
              replaces={!!form.replacesCore}
              onReplaces={(v) => set('replacesCore', v)}
            />
            {/* one leading banner (review r1): the state, else the first finding; network notices keep their own
                banner; the other findings are lines under it */}
            {(() => {
              const network = new Set<string>([
                TEXT.npmDown,
                TEXT.jsdelivrDown,
                TEXT.githubDown,
                TEXT.githubLimit,
                TEXT.jsdelivrLag,
              ])
              const net = result.notices.filter((n) => network.has(n.text))
              const other = result.notices.filter((n) => !network.has(n.text))
              const lead = result.states.length === 0 ? other.slice(0, 1) : []
              const folded = result.states.length === 0 ? other.slice(1) : other
              return (
                <>
                  {[...net, ...lead].map((n) => (
                    <Banner tone={NOTICE_TONE[n.level]} tag={noticeTag(n)} alert={n.level === 'error'}>
                      {n.text}
                    </Banner>
                  ))}
                  {folded.length > 0 && (
                    <ul class="sf__notes" role="list" aria-label="Other findings">
                      {folded.map((n) => (
                        <li class={`sf__note sf__note--${n.level}`}>
                          <span class="sf__mark" aria-hidden="true">
                            {n.level === 'error' ? '×' : '!'}
                          </span>
                          <span>{n.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )
            })()}
            {!stopped && !ignored && (
              <>
                <ul class="sf__rules" role="list" aria-label="Listing rules">
                  {rules.map((r) => (
                    <li class={`sf__rule sf__rule--${r.state}`}>
                      <span class="sf__mark" aria-hidden="true">
                        {r.state === 'pass' ? '✓' : r.state === 'fail' ? '×' : r.state === 'pending' ? '·' : '?'}
                      </span>
                      <code class="sf__rid">{r.id}</code>
                      <span>
                        <span class="sr-only">{r.state}: </span>
                        {r.text}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl class="sf__facts">
                  {result.pkg && (
                    <div>
                      <dt>Version</dt>
                      <dd>
                        <code>{result.pkg.version ?? 'none'}</code>
                        {result.pkg.publishedAt ? ` · published ${dayText(result.pkg.publishedAt.slice(0, 10))}` : ''}
                      </dd>
                    </div>
                  )}
                  {/* when a new app accepts the release: said of an Open Mercato package only (finding of 25 Oct) */}
                  {result.pkg && !states.includes('not-module') && !result.pkg.deprecated && (
                    <div>
                      <dt>Installable</dt>
                      <dd>
                        {installableText(result.installableFrom, new Date().toISOString().slice(0, 10), result.kind)}
                        {(() => {
                          // a listed package: the verdict of the catalog's last run on the latest line (25 Oct)
                          const run = listedRunText(
                            result.existing?.row,
                            props.lines.find((l) => l.source === 'latest')?.key ?? null,
                          )
                          return run ? ` ${run}` : ''
                        })()}
                      </dd>
                    </div>
                  )}
                  {result.license && (
                    <div>
                      <dt>License</dt>
                      <dd>
                        {result.license.kind === 'osi' ? (
                          <code>{result.license.text}</code>
                        ) : (
                          <Marked text={result.license.text} mark={result.license.value ?? ''} warn />
                        )}
                      </dd>
                    </div>
                  )}
                  {result.peers && (
                    <div>
                      <dt>Peers</dt>
                      <dd>
                        <Marked
                          text={result.peers.text}
                          mark={result.peers.range ?? ''}
                          warn={result.peers.level === 'warn'}
                        />
                      </dd>
                    </div>
                  )}
                  {result.gate && result.gate.modules.length > 0 && (
                    <div>
                      <dt>Modules</dt>
                      <dd>
                        {result.gate.modules.map((m, i) => (
                          <>
                            {i > 0 ? ', ' : ''}
                            <code>{m.id}</code>
                            {m.src && m.dist ? '' : m.src ? ' (no dist)' : ' (no src)'}
                          </>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </>
            )}
          </section>
        )}

        {t && !stopped && !ignored && result && (
          <form class="sf__form" onSubmit={(e) => e.preventDefault()} aria-label="Descriptor">
            {result.kind && result.kind !== 'module' && (
              <div class="sf__field">
                <label class="sf__label" for="sf-kind">
                  Kind
                </label>
                <select
                  id="sf-kind"
                  class="sf__input"
                  value={form.kind}
                  onChange={(e) => set('kind', (e.currentTarget as HTMLSelectElement).value as FormState['kind'])}
                >
                  <option value="library">library</option>
                  <option value="provider">provider</option>
                  <option value="tool">tool</option>
                </select>
              </div>
            )}
            <div class="sf__field">
              <label class="sf__label" for="sf-cat">
                Category
              </label>
              <select
                id="sf-cat"
                class="sf__input"
                value={form.category}
                onChange={(e) => set('category', (e.currentTarget as HTMLSelectElement).value)}
                aria-invalid={!!fieldIssue('category')}
              >
                <option value="">Choose a category</option>
                {props.categories.map((c) => (
                  <option value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div class="sf__field">
              <label class="sf__label" for="sf-tags">
                Tags <span class="sf__opt">up to 8, comma separated</span>
              </label>
              <input
                id="sf-tags"
                class="sf__input sf__input--mono"
                type="text"
                value={form.tags}
                onInput={(e) => set('tags', (e.currentTarget as HTMLInputElement).value)}
                aria-invalid={!!fieldIssue('tags')}
              />
              {fieldIssue('tags') && <p class="sf__err">{fieldIssue('tags')}</p>}
            </div>
            <div class="sf__field">
              <label class="sf__label" for="sf-sum">
                Summary{' '}
                <span class={`sf__count${form.summary.trim().length > 140 ? ' sf__count--bad' : ''}`}>
                  {form.summary.trim().length} / 140
                </span>
              </label>
              <textarea
                id="sf-sum"
                class="sf__input"
                rows={2}
                maxLength={200}
                value={form.summary}
                placeholder="What it does, in one plain sentence."
                onInput={(e) => set('summary', (e.currentTarget as HTMLTextAreaElement).value)}
                aria-invalid={!!fieldIssue('summary')}
                aria-describedby="sf-sum-lint"
              />
              <p id="sf-sum-lint" class="sf__lint">
                {sumProblem
                  ? `Plain text only: remove the ${sumProblem}.`
                  : form.summary.trim().length > 0 && form.summary.trim().length < 20
                    ? 'At least 20 characters.'
                    : fieldIssue('summary') && form.summary.trim()
                      ? fieldIssue('summary')
                      : 'English, 20 to 140 characters, no links or markdown.'}
                {sumFlags.length > 0 && ` A curator will read this text closely (${sumFlags.join(', ')}).`}
              </p>
            </div>
            <div class="sf__field">
              <label class="sf__label" for="sf-wtu">
                When to use{' '}
                <span class={`sf__count${form.whenToUse.trim().length > 240 ? ' sf__count--bad' : ''}`}>
                  {form.whenToUse.trim().length} / 240
                </span>
              </label>
              <textarea
                id="sf-wtu"
                class="sf__input"
                rows={3}
                maxLength={300}
                placeholder="Use when ..."
                value={form.whenToUse}
                onInput={(e) => set('whenToUse', (e.currentTarget as HTMLTextAreaElement).value)}
                aria-invalid={!!fieldIssue('whenToUse')}
                aria-describedby="sf-wtu-lint"
              />
              <p id="sf-wtu-lint" class="sf__lint">
                {wtuProblem
                  ? `Plain text only: remove the ${wtuProblem}.`
                  : !form.whenToUse.startsWith('Use when ')
                    ? 'Start with "Use when ".'
                    : form.whenToUse.trim().length < 40
                      ? 'At least 40 characters.'
                      : 'Agents read this field to decide. Name the situation, not the features.'}
              </p>
            </div>
            <fieldset class="sf__field sf__providers">
              <legend class="sf__label">
                Providers <span class="sf__opt">optional, the services it talks to</span>
              </legend>
              {form.providers.map((p, i) => (
                <div class="sf__prow">
                  <input
                    class="sf__input sf__input--mono"
                    type="text"
                    aria-label={`Provider ${i + 1} id`}
                    placeholder="stripe"
                    value={p.name}
                    onInput={(e) =>
                      set(
                        'providers',
                        form.providers.map((x, j) =>
                          j === i ? { ...x, name: (e.currentTarget as HTMLInputElement).value } : x,
                        ),
                      )
                    }
                  />
                  <input
                    class="sf__input"
                    type="text"
                    aria-label={`Provider ${i + 1} label`}
                    placeholder="Stripe"
                    value={p.label}
                    onInput={(e) =>
                      set(
                        'providers',
                        form.providers.map((x, j) =>
                          j === i ? { ...x, label: (e.currentTarget as HTMLInputElement).value } : x,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    class="sf__remove"
                    aria-label={`Remove provider ${i + 1}`}
                    title="Remove"
                    onClick={() =>
                      set(
                        'providers',
                        form.providers.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                  </button>
                </div>
              ))}
              {form.providers.length < 20 && (
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  onClick={() => set('providers', [...form.providers, { name: '', label: '' }])}
                >
                  Add provider
                </button>
              )}
              {fieldIssue('providers') && <p class="sf__err">{fieldIssue('providers')}</p>}
            </fieldset>
            <fieldset class="sf__field sf__providers">
              <legend class="sf__label">
                Screenshots <span class="sf__opt">optional</span>
              </legend>
              <p class="sf__lint" id="sf-shots-help">
                Optional. Images of the module in a running app, 16:10, at least 1280 px wide. Link a file of your
                repository on raw.githubusercontent.com, or a GitHub attachment.
              </p>
              {shotRows.map((x, i) => (
                <div class="sf__prow sf__prow--shot">
                  <input
                    class="sf__input sf__input--mono"
                    type="url"
                    inputMode="url"
                    aria-label={`Screenshot ${i + 1} URL`}
                    aria-describedby="sf-shots-help"
                    placeholder="https://raw.githubusercontent.com/owner/repo/main/docs/list.png"
                    value={x.src}
                    onInput={(e) =>
                      set(
                        'screenshots',
                        shotRows.map((y, j) =>
                          j === i ? { ...y, src: (e.currentTarget as HTMLInputElement).value } : y,
                        ),
                      )
                    }
                  />
                  <input
                    class="sf__input"
                    type="text"
                    maxLength={SCREENSHOT_ALT_MAX}
                    aria-label={`Screenshot ${i + 1} description`}
                    placeholder="What the image shows."
                    value={x.alt}
                    onInput={(e) =>
                      set(
                        'screenshots',
                        shotRows.map((y, j) =>
                          j === i ? { ...y, alt: (e.currentTarget as HTMLInputElement).value } : y,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    class="sf__remove"
                    aria-label={`Remove screenshot ${i + 1}`}
                    title="Remove"
                    onClick={() =>
                      set(
                        'screenshots',
                        shotRows.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                  </button>
                </div>
              ))}
              {shotRows.length < FORM_SCREENSHOTS && (
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  onClick={() => set('screenshots', [...shotRows, { src: '', alt: '' }])}
                >
                  Add screenshot
                </button>
              )}
              {fieldIssue('screenshots') && <p class="sf__err">{fieldIssue('screenshots')}</p>}
            </fieldset>
          </form>
        )}
      </div>

      <div class="sf__right">
        <p class="t-tagline">// Preview</p>
        {t && typed && result && (ignored || states.includes('core')) ? (
          <>
            <p class="sf__ignored">
              {states.includes('core') ? (
                <>
                  <code>{CORE_PACKAGE}</code> is Open Mercato itself. Its modules are built into every app; the agents
                  read them from <a href={href('/built-in.json')}>built-in.json</a>.
                </>
              ) : (
                <>
                  <code>{typed.kind === 'npm' ? typed.name : typed.repo}</code> is on the ignore list, so the catalog
                  does not list it. If the reason is wrong, use Request listing.
                </>
              )}
            </p>
            {/* no greyed `Open pull request` (finding of 25 Oct): there is no form, so the one way on is a request */}
            {!states.includes('core') && (
              <div class="sf__actions">
                <a class="btn btn--primary" href={listingRequestUrl(props.repo, t, form)} rel="noopener noreferrer">
                  Request listing
                </a>
              </div>
            )}
          </>
        ) : t && !stopped && result ? (
          <>
            <Header t={t} r={result} f={form} lines={props.lines} />
            <div class="sf__rowprev">
              <ModuleRow
                entry={previewEntry(t, result, form, rulesPass)}
                lines={props.lines}
                categoryTitle={props.categories.find((c) => c.id === form.category)?.title ?? 'Category'}
              />
            </div>
            <div class="sf__yamlhead">
              <p class="sf__label">
                <code>{result.existing ? `modules/${result.existing.path}.yml` : descriptorPath(t)}</code>
              </p>
            </div>
            <pre class="sf__yaml" aria-label="Descriptor YAML">
              <code>{yaml}</code>
            </pre>
            {(issues.length > 0 || rejected || collisionStop) && (
              <ul class="sf__issues" role="list" aria-label="Fill before opening the pull request">
                {rejected && !result.existing && <li>{rejected}</li>}
                {collisionStop && <li>{collisionStop}</li>}
                {issues.slice(0, 6).map((i) => (
                  <li>{i.message}</li>
                ))}
              </ul>
            )}
            <div class="sf__actions">
              {result.existing ? (
                <a
                  class="btn btn--primary"
                  href={editUrl(props.repo, result.existing.path)}
                  rel="noopener noreferrer"
                  // with edits, a new tab keeps the form, and the YAML goes to the clipboard on the way
                  target={edited ? '_blank' : undefined}
                  onClick={() => {
                    if (!edited) return
                    void navigator.clipboard
                      ?.writeText(yaml)
                      .then(() => setEditCopied(true))
                      .catch(() => setEditCopied(false))
                  }}
                >
                  {edited ? 'Copy YAML and propose an edit' : 'Propose an edit'}
                </a>
              ) : (
                <a
                  class={`btn btn--primary${blocked ? ' sf__btn--off' : ''}`}
                  href={pullRequestUrl(props.repo, t, yaml)}
                  rel="noopener noreferrer"
                  aria-disabled={blocked ? 'true' : undefined}
                  onClick={(e) => {
                    if (blocked) e.preventDefault()
                  }}
                >
                  Open pull request
                </a>
              )}
              <button type="button" class="btn btn--secondary" onClick={() => void copyYaml()}>
                <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copied' : 'Copy YAML'}
              </button>
              {!result.existing && (
                <a class="btn btn--ghost" href={listingRequestUrl(props.repo, t, form)} rel="noopener noreferrer">
                  Request listing
                </a>
              )}
            </div>
            {result.existing && edited && <p class="sf__after">{editCopied ? TEXT.editCopied : TEXT.editHint}</p>}
            <p class="sf__after">{result.existing ? TEXT.afterEdit : TEXT.afterMerge}</p>
          </>
        ) : (
          <div class="sf__empty">
            <p>Paste a package name and press Check. The preview shows the row and the file your pull request adds.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The state banners and their tags. An ignored package gets one banner with the reason; when it is also not a
 * module, its tag names both (`Ignored · Not an Open Mercato module`) instead of a second banner.
 */
export function stateBanners(states: readonly StateId[]): { s: StateId; tag: string }[] {
  const both = states.includes('ignored') && states.includes('not-module')
  const shown = states.includes('ignored') ? states.filter((s) => s !== 'not-module') : states
  return shown.map((s) => ({
    s,
    tag: s === 'ignored' && both ? `${STATE_TEXT.ignored.tag} · ${STATE_TEXT['not-module'].tag}` : STATE_TEXT[s].tag,
  }))
}

/**
 * Listed entries a bare word names (finding of 25 Oct: `ksef` on /submit answered only `No package ksef on npm`, while
 * the catalog lists the KSeF module): an unscoped name of 3 or more characters inside a listed npm name or title.
 */
export function listedMatches(name: string, catalog: readonly CatalogRef[], max = 3): CatalogRef[] {
  const q = name.trim().toLowerCase()
  if (q.length < 3 || q.includes('/')) return []
  return catalog
    .filter(
      (c) =>
        c.status === 'active' && ((c.npm ?? c.locator).toLowerCase().includes(q) || c.title.toLowerCase().includes(q)),
    )
    .slice(0, max)
}

function States({
  r,
  t,
  repo,
  catalog,
  replaces,
  onReplaces,
}: {
  r: CheckResult
  t: Target
  repo: string
  catalog: readonly CatalogRef[]
  replaces: boolean
  onReplaces: (v: boolean) => void
}) {
  if (r.states.length === 0)
    return (
      <Banner tone="ok" tag="Ready">
        Fill the fields below and open the pull request.
      </Banner>
    )
  return (
    <div class="sf__states">
      {stateBanners(r.states).map(({ s, tag }) => (
        <Banner tone={STATE_TEXT[s].tone} tag={tag}>
          {s === 'core' && (
            <>
              This is Open Mercato core, not a module. Its modules are built into every app, so there is nothing to
              list.
            </>
          )}
          {s === 'collision' && (
            <>
              The package ships a module ID that Open Mercato core already has. Rename the module, or say that it
              replaces the core one: the YAML then carries <code>replaces</code> and a curator confirms it.
              <label class="sf__tick">
                <input type="checkbox" checked={replaces} onChange={(e) => onReplaces(e.currentTarget.checked)} /> This
                module replaces core {andList(r.collisions)}
              </label>
            </>
          )}
          {s === 'listed' && r.existing && (
            <>
              <a href={href(modulePage(r.existing.path))}>{r.existing.title}</a> is in the catalog
              {t.kind === 'github' && r.existing.npm ? (
                <>
                  {' '}
                  under its npm name <code>{r.existing.npm}</code>
                </>
              ) : null}
              {r.existing.status !== 'active' ? ` (status ${r.existing.status})` : ''}. Change it with{' '}
              <a href={editUrl(repo, r.existing.path)} rel="noopener noreferrer">
                Propose an edit
              </a>
              .
            </>
          )}
          {s === 'renamed' && r.renamedTo && (
            <>
              This is an old name of{' '}
              <a href={href(modulePage(r.renamedTo.path))}>
                <Wrap text={r.renamedTo.npm ?? r.renamedTo.locator} />
              </a>
              . Submit or edit the new name instead.
            </>
          )}
          {s === 'not-module' && (
            <>
              {r.gate?.reason ?? 'No src/modules and dist/modules pair.'} A module ships{' '}
              <code>src/modules/&lt;id&gt;/index.ts</code> and a built <code>dist/modules/&lt;id&gt;/</code>. Start one
              with{' '}
              <a href={CREATE_MODULE} rel="noopener noreferrer">
                create-mercato-module
              </a>
              . Libraries, providers and tools can still be listed with the kind below.
            </>
          )}
          {s === 'github-only' && (
            <>
              No npm package.{' '}
              {r.repo?.tag ? (
                <>
                  Receipts install from GitHub at tag <code>{r.repo.tag}</code>.
                </>
              ) : (
                'Receipts need a version tag.'
              )}
            </>
          )}
          {s === 'ignored' && (
            <>{r.ignored} The catalog does not list it, so there is no form. If this is wrong, use Request listing.</>
          )}
          {s === 'not-found' &&
            (t.kind === 'npm' ? (
              <>
                No package <code>{t.name}</code> on npm. Check the spelling, or publish it first.
                {!t.name.includes('/') && (
                  <>
                    {' '}
                    {listedMatches(t.name, catalog).length > 0 && (
                      <>
                        Listed:{' '}
                        {listedMatches(t.name, catalog).map((c, i) => (
                          <>
                            {i > 0 ? ', ' : ''}
                            <a href={href(modulePage(c.path))}>{c.title}</a> (<code>{c.npm ?? c.locator}</code>)
                          </>
                        ))}
                        .{' '}
                      </>
                    )}
                    Looking for a module?{' '}
                    <a href={`${href('/')}?q=${encodeURIComponent(t.name)}`}>Search the catalog</a>.
                  </>
                )}
              </>
            ) : (
              <>
                No public repository <code>{t.repo}</code> on GitHub.
              </>
            ))}
          {s === 'unknown' && <>The sources did not answer, so nothing was decided. Try again, or copy the YAML.</>}
        </Banner>
      ))}
    </div>
  )
}

function Header({ t, r, f, lines }: { t: Target; r: CheckResult; f: FormState; lines: SubmitFormProps['lines'] }) {
  const locator = locatorOf(t)
  const listed = r.existing
  const sigil = renderSigil({
    glyph: listed?.sigil?.glyph ?? '0000000',
    phase: listed?.sigil?.phase ?? sigilPhase(locator),
    kind: (listed?.kind ?? r.kind ?? 'module') as 'module',
    publicRoutes: listed?.sigil?.publicRoutes ?? false,
    size: 48,
    label: listed?.sigil?.label ?? TEXT.anatomyLater,
  })
  const name = t.kind === 'npm' ? t.name : t.repo
  const official = name.startsWith('@open-mercato/')
  // a listed module broken on every line: the module page hides its command behind a warning, so the preview does not
  // offer it as a plain copy either (finding of 25 Oct)
  const brokenOn = listed?.row ? Object.entries(listed.row.lines).filter(([, c]) => c.status === 'broken') : []
  const brokenEverywhere =
    !!listed?.row && brokenOn.length > 0 && brokenOn.length === Object.keys(listed.row.lines).length
  const command = showsCommand(r) && (listed || t.kind === 'npm') && !brokenEverywhere ? installCommand(t, r) : null
  const kindNow = listed?.kind ?? r.kind ?? 'module'
  return (
    <div class="sf__hdr">
      <span class={`sf__hsig${listed?.sigil ? ' sf__hsig--real' : ''}`} dangerouslySetInnerHTML={{ __html: sigil }} />
      <div class="sf__hmain">
        <p class="sf__htitle">{listed?.title ?? titleOf(name)}</p>
        <p class="sf__hloc">
          <Wrap text={name} />
        </p>
        <p class="sf__hsum">{f.summary.trim() || 'Your summary appears here.'}</p>
        <div class="sf__hchips">
          <TypeChipView type={listed?.type ?? (official ? 'official' : '3rd-party')} />
          <LicenseChipView
            license={{
              spdx: r.license?.kind === 'osi' ? r.license.value : null,
              kind: r.license?.kind ?? 'unknown',
              mismatch: false,
            }}
          />
          <span class="chip chip--line">{listed?.kind ?? r.kind ?? 'module'}</span>
        </div>
        {!listed && (
          <p class="sf__hnote">
            {TEXT.anatomyLater}{' '}
            {official
              ? ''
              : 'Type is set after merge: community for Open Mercato members and certified partners, else third-party.'}
          </p>
        )}
        {command && (
          <div class="sf__hcmd">
            <CommandChipView command={command} prompt="$" label="Copy command" />
          </div>
        )}
        {brokenEverywhere && (
          <p class="sf__hnote">
            Broken on {andList(orderedKeys(brokenOn.map(([k]) => k)))}. The module page shows the command behind a
            warning.
          </p>
        )}
        {kindNow !== 'module' ? (
          // the nightly run installs modules only (lib/receipts/plan.ts); a tool, library or provider is read, not run
          <p class="sf__hlines">
            Not installed by the catalog: the nightly run installs modules, not {PLURAL[kindNow]}.
          </p>
        ) : (
          <p class="sf__hlines">
            Lines tested:{' '}
            {cadenceGroups(lines).map((g, i) => (
              <>
                {i > 0 ? ', ' : ''}
                {g.keys.map((k, j) => (
                  <>
                    {j > 0 ? (j === g.keys.length - 1 ? ' and ' : ', ') : ''}
                    <code>{k}</code>
                  </>
                ))}{' '}
                {g.when}
              </>
            ))}
            .
          </p>
        )}
      </div>
    </div>
  )
}
