// `yarn om sync`: packuments, GitHub GraphQL, deps.dev, OSV, downloads, partners, type and claims (spec 5.2 sync.yml,
// 4.5 SyncRecord, Claims, Stats). A failing source keeps the previous value and adds a line to `errors` [w1 §6.7-6.8].
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { Claims, Stats, SyncRecord, type Claims as ClaimsT, type Stats as StatsT } from '../schema/index.ts'
import { claimFromHistory } from './claims.ts'
import { provenanceStatus, versionProvenance, type VersionProvenance } from './depsdev.ts'
import {
  commitsTouching,
  curatorsFrom,
  type Entry,
  firstAddedAt,
  loadEntries,
  loadPolicies,
  type Policies,
  readSyncRecord,
} from './entries.ts'
import { fetchRepos, isPublicMember, parseRepoUrl, sameRepo, type GithubRecord } from './github.ts'
import { errText, type Http, OfflineMissError } from './http.ts'
import { downloadsLastMonth, fetchPackument, npmRecord, type NpmRecord, type Packument } from './npm.ts'
import { originOf } from './origin.ts'
import { advisories as fetchAdvisories, type Advisory } from './osv.ts'
import { fetchPartners, type Partners } from './partners.ts'
import { officialCoverage, type OfficialCoverage } from './coverage.ts'
import { isoSeconds } from './semver.ts'

export interface SyncOptions {
  http: Http
  /** Repo root: git history for `firstSeenAt` and claims, `.github/CODEOWNERS` for curators. */
  root: string
  modulesDir: string
  policyDir: string
  dataDir: string
  outDir: string
  now: Date
  /** Locators to sync; null = all entries. */
  only: Set<string> | null
  modulesRepo: string
  claims?: boolean
  log?: (line: string) => void
}

export interface Attention {
  locator: string
  kind:
    | 'archived'
    | 'deprecated'
    | 'redirected'
    | 'maintainers-changed'
    | 'renamed-published'
    | 'repo-mismatch'
    | 'invalid-descriptor'
  text: string
}

export interface SyncResult {
  records: SyncRecord[]
  claims: ClaimsT
  stats: StatsT
  coverage: OfficialCoverage | null
  attention: Attention[]
  errors: string[]
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function readJsonOr<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function sortKeys<T>(r: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

interface NpmFetch {
  /** The registry answered 404: the package does not exist (not a source failure). */
  notFound: boolean
  packument: Packument | null
  record: NpmRecord | null
  notes: string[]
  error: string | null
}

/** HEAD of the descriptor links (spec 4.3 `links.*`); GET when a server refuses HEAD. Offline: only recorded links. */
export async function checkLinks(http: Http, e: Entry): Promise<string[]> {
  const out: string[] = []
  for (const [k, url] of Object.entries(e.d.links ?? {})) {
    if (typeof url !== 'string' || !url.startsWith('https://')) continue
    try {
      let res = await http.request(url, { method: 'HEAD', text: true })
      if (res.status === 405 || res.status === 403) res = await http.request(url, { text: true })
      if (res.status >= 400) out.push(`links.${k}: ${url} answers HTTP ${res.status}`.slice(0, 300))
    } catch (err) {
      if (!(err instanceof OfflineMissError)) out.push(errText(`links.${k}`, err))
    }
  }
  return out
}

export async function runSync(o: SyncOptions): Promise<SyncResult> {
  const log = o.log ?? (() => {})
  const nowIso = isoSeconds(o.now) as string
  const { entries: all, errors: loadErrors } = loadEntries(o.modulesDir)
  const policies: Policies = loadPolicies(o.policyDir)
  const selected = all.filter((e) => !o.only || o.only.has(e.locator))
  const globalErrors: string[] = loadErrors.map((e) => `descriptor ${e.file}: ${e.message}`.slice(0, 300))
  const attention: Attention[] = loadErrors.map((e) => ({
    locator: `file:${e.file}`,
    kind: 'invalid-descriptor',
    text: e.message.slice(0, 200),
  }))
  log(`sync: ${selected.length} of ${all.length} entries`)

  let partners: Partners | null = null
  try {
    partners = await fetchPartners(o.http)
  } catch (err) {
    globalErrors.push(errText('partners', err))
  }

  // npm packuments (entries and renamedFrom names)
  const npmOf = new Map<string, NpmFetch>()
  const renamedOf = new Map<string, Packument | null>()
  await Promise.all(
    selected.map(async (e) => {
      for (const old of e.d.renamedFrom ?? [])
        if (old.startsWith('npm:') && !renamedOf.has(old))
          renamedOf.set(old, await fetchPackument(o.http, old.slice(4)).catch(() => null))
      if (!e.locator.startsWith('npm:')) return
      try {
        const p = await fetchPackument(o.http, e.locator.slice(4))
        if (!p) {
          npmOf.set(e.locator, {
            notFound: true,
            packument: null,
            record: null,
            notes: [],
            error: 'npm: package not found (404)',
          })
          return
        }
        const { record, notes } = npmRecord(p)
        npmOf.set(e.locator, { notFound: false, packument: p, record, notes, error: null })
      } catch (err) {
        npmOf.set(e.locator, { notFound: false, packument: null, record: null, notes: [], error: errText('npm', err) })
      }
    }),
  )

  const previous = new Map(selected.map((e) => [e.locator, readSyncRecord(o.dataDir, e.path)]))
  const npmFinal = (e: Entry): NpmRecord | null =>
    npmOf.get(e.locator)?.record ?? (npmOf.get(e.locator)?.notFound ? null : (previous.get(e.locator)?.npm ?? null))

  // repositories: the entry's own (descriptor github / monorepo repo / repository.url / GitHub locator) and repository.url
  const repoPlan = new Map<string, { lookup: string | null; tarball: string | null }>()
  for (const e of selected) {
    const tarball = e.locator.startsWith('github:') ? null : parseRepoUrl(npmFinal(e)?.repositoryUrl)
    const lookup = e.locator.startsWith('github:') ? e.locator.slice(7) : (e.declaredRepo ?? tarball)
    repoPlan.set(e.locator, { lookup, tarball })
  }
  const toLookup = [...repoPlan.values()].flatMap((p) => [p.lookup, p.tarball]).filter((r): r is string => !!r)
  const gh = await fetchRepos(o.http, toLookup)
  const ghGet = (repo: string | null): { rec: GithubRecord | null; exists: boolean | null; error: string | null } => {
    if (!repo) return { rec: null, exists: null, error: null }
    const key = [...gh.repos.keys(), ...gh.errors.keys()].find((k) => sameRepo(k, repo)) ?? repo
    if (gh.errors.has(key)) return { rec: null, exists: null, error: gh.errors.get(key) as string }
    if (!gh.repos.has(key)) return { rec: null, exists: null, error: null }
    const rec = gh.repos.get(key) ?? null
    return { rec, exists: rec !== null, error: null }
  }

  // deps.dev provenance for latestStable and previousStable
  const prov = new Map<
    string,
    { cur: VersionProvenance | null; prev: VersionProvenance | null; error: string | null }
  >()
  await Promise.all(
    selected.map(async (e) => {
      const n = npmOf.get(e.locator)?.record
      if (!n) return
      const cur = n.latestStable ?? n.preview
      try {
        const [c, p] = await Promise.all([
          cur ? versionProvenance(o.http, n.name, cur) : Promise.resolve(null),
          n.previousStable ? versionProvenance(o.http, n.name, n.previousStable) : Promise.resolve(null),
        ])
        prov.set(e.locator, { cur: c, prev: p, error: null })
      } catch (err) {
        prov.set(e.locator, { cur: null, prev: null, error: errText('deps.dev', err) })
      }
    }),
  )

  // OSV for the current version of every npm entry
  let advisoryMap: Map<string, Advisory[]> | null = null
  let advisoryError: string | null = null
  const osvQueries = selected
    .map((e) => npmOf.get(e.locator)?.record)
    .filter((n): n is NpmRecord => !!n && !!(n.latestStable ?? n.preview))
    .map((n) => ({ name: n.name, version: (n.latestStable ?? n.preview) as string }))
  try {
    advisoryMap = await fetchAdvisories(o.http, osvQueries)
  } catch (err) {
    advisoryError = errText('osv', err)
  }

  // downloads
  const npmNames = selected.filter((e) => e.locator.startsWith('npm:')).map((e) => e.locator.slice(4))
  const dl = await downloadsLastMonth(o.http, npmNames).catch((err: unknown) => ({
    counts: new Map<string, number | null>(),
    errors: [errText('downloads', err)],
  }))

  const memberCache = new Map<string, Promise<boolean>>()
  const isOmMember = (login: string) => {
    const k = login.toLowerCase()
    if (!memberCache.has(k))
      memberCache.set(
        k,
        isPublicMember(o.http, policies.officialMaintainers.githubOrg, login).catch(() => false),
      )
    return memberCache.get(k) as Promise<boolean>
  }

  const records: SyncRecord[] = []
  for (const e of selected) {
    const prev = previous.get(e.locator) ?? null
    const errors: string[] = []
    const nf = npmOf.get(e.locator)
    let npm: NpmRecord | null = null
    if (e.locator.startsWith('npm:')) {
      if (nf?.record) {
        npm = nf.record
        errors.push(...nf.notes)
      } else {
        if (nf?.error) errors.push(nf.error)
        npm = nf?.notFound ? null : (prev?.npm ?? null)
      }
    }
    const plan = repoPlan.get(e.locator) as { lookup: string | null; tarball: string | null }
    const own = ghGet(plan.lookup)
    let github: GithubRecord | null = own.rec
    if (own.error) {
      errors.push(own.error)
      github = prev?.github ?? null
    } else if (plan.lookup && own.exists === false)
      errors.push(`github: ${plan.lookup} returns 404 (${nowIso.slice(0, 10)})`)
    if (e.d.github && plan.tarball && !sameRepo(e.d.github, plan.tarball)) {
      errors.push(`github: descriptor says ${e.d.github}, repository.url says ${plan.tarball}`)
      attention.push({
        locator: e.locator,
        kind: 'repo-mismatch',
        text: `Descriptor github ${e.d.github} differs from repository.url ${plan.tarball}.`,
      })
    }
    // provenance
    let provenance: SyncRecord['provenance'] = prev?.provenance ?? {
      status: 'none',
      sourceRepo: null,
      commit: null,
      workflow: null,
    }
    const pv = prov.get(e.locator)
    if (pv?.error) errors.push(pv.error)
    else if (pv) provenance = provenanceStatus(pv.cur, pv.prev, plan.lookup)
    else if (!npm) provenance = { status: 'none', sourceRepo: null, commit: null, workflow: null }
    // advisories
    let advisories: Advisory[] = prev?.advisories ?? []
    if (npm && (npm.latestStable ?? npm.preview)) {
      if (advisoryError) errors.push(advisoryError)
      else advisories = advisoryMap?.get(npm.name) ?? []
    } else if (!npm) advisories = []
    // downloads
    let downloads30d: number | null = prev?.downloads30d ?? null
    if (npm) {
      const c = dl.counts.get(npm.name)
      if (c !== undefined && c !== null) downloads30d = c
      else if (dl.errors.length) errors.push(dl.errors[0] as string)
    } else downloads30d = null
    errors.push(...(await checkLinks(o.http, e)))
    // type
    const typeRepo = e.locator.startsWith('github:') ? e.locator.slice(7) : plan.tarball
    const typeLookup = ghGet(typeRepo)
    const origin = await originOf(
      {
        locator: e.locator,
        kind: e.d.kind,
        repo: typeLookup.rec?.repo ?? typeRepo,
        repoExists: typeLookup.exists,
        ownerType: typeLookup.rec?.ownerType ?? null,
        npmMaintainers: npm?.maintainers ?? [],
      },
      { community: policies.community, officialMaintainers: policies.officialMaintainers, partners, isOmMember },
    )
    const rel = relative(o.root, e.file).split('\\').join('/')
    const firstSeenAt = prev?.firstSeenAt ?? firstAddedAt(o.root, rel) ?? nowIso
    // renamed packages: alarm when the old name gets a version after the rename (spec 11.4)
    for (const old of e.d.renamedFrom ?? []) {
      const p = renamedOf.get(old)
      if (!p) continue
      const firstSeen = firstSeenAt
      const latest = p['dist-tags']?.latest
      const t = latest ? isoSeconds(p.time?.[latest]) : null
      if (firstSeen && t && t > firstSeen) {
        const msg = `renamedFrom ${old} published ${latest} on ${t.slice(0, 10)} after the rename`
        errors.push(msg)
        attention.push({ locator: e.locator, kind: 'renamed-published', text: `${msg}.` })
      }
    }
    if (prev?.npm && npm && prev.npm.maintainers.join(',') !== npm.maintainers.join(',') && npm.maintainers.length > 0)
      attention.push({
        locator: e.locator,
        kind: 'maintainers-changed',
        text: `npm maintainers changed from ${prev.npm.maintainers.join(', ') || 'none'} to ${npm.maintainers.join(', ')}.`,
      })
    if (github?.archived)
      attention.push({ locator: e.locator, kind: 'archived', text: `Repository ${github.repo} is archived.` })
    if (github?.redirectedFrom)
      attention.push({
        locator: e.locator,
        kind: 'redirected',
        text: `Repository ${github.redirectedFrom} now redirects to ${github.repo}.`,
      })
    if (npm?.deprecated)
      attention.push({
        locator: e.locator,
        kind: 'deprecated',
        text: `npm says deprecated: ${npm.deprecated.slice(0, 120)}`,
      })

    const record = SyncRecord.parse({
      locator: e.locator,
      checkedAt: nowIso,
      firstSeenAt,
      npm,
      github,
      provenance,
      advisories,
      type: origin.type,
      typeReason: origin.typeReason,
      downloads30d,
      errors: [...new Set(errors)].map((x) => x.slice(0, 300)).slice(0, 20),
    })
    records.push(record)
    writeJson(join(o.dataDir, 'sync', `${e.path}.json`), record)
  }

  // claims
  const claimsFile = join(o.dataDir, 'claims.json')
  const claims: ClaimsT = Claims.parse(readJsonOr<unknown>(claimsFile, {}))
  if (o.claims !== false) {
    const curators = curatorsFrom(o.root)
    for (const e of selected) {
      if (claims[e.locator]) continue
      const rec = records.find((r) => r.locator === e.locator)
      if (!rec) continue
      const commits = commitsTouching(o.root, relative(o.root, e.file))
      if (commits.length === 0) continue
      const plan = repoPlan.get(e.locator) as { lookup: string | null; tarball: string | null }
      try {
        const claim = await claimFromHistory(
          {
            locator: e.locator,
            entryRepo: plan.lookup,
            tarballRepo: plan.tarball,
            ownerType: rec.github?.ownerType ?? null,
            provenance: rec.provenance,
            commits,
          },
          { http: o.http, modulesRepo: o.modulesRepo, curators },
        )
        if (claim) claims[e.locator] = claim
      } catch (err) {
        globalErrors.push(errText(`claims ${e.locator}`, err))
      }
    }
  }
  if (!o.only) for (const loc of Object.keys(claims)) if (!all.some((e) => e.locator === loc)) delete claims[loc]
  const claimsOut = Claims.parse(sortKeys(claims))
  writeJson(claimsFile, claimsOut)

  // stats for every entry (fresh record or the stored one)
  const statsEntries: StatsT['entries'] = {}
  for (const e of all) {
    const r = records.find((x) => x.locator === e.locator) ?? readSyncRecord(o.dataDir, e.path)
    if (!r) continue
    // stars only for an entry's own repository; official packages live in the monorepo (stats hidden, spec 6.2)
    const stars = r.type === 'official' || !r.github ? null : r.github.stars
    statsEntries[e.locator] = { downloads30d: r.downloads30d, stars }
  }
  const stats = Stats.parse({ at: nowIso, entries: sortKeys(statsEntries) })
  writeJson(join(o.dataDir, 'stats.json'), stats)

  // official coverage
  let coverage: OfficialCoverage | null = null
  try {
    coverage = await officialCoverage(o.http, all, policies, nowIso)
    writeJson(join(o.dataDir, 'official-coverage.json'), coverage)
  } catch (err) {
    globalErrors.push(errText('official coverage', err))
  }

  const report = {
    at: nowIso,
    entries: records.length,
    attention,
    errors: globalErrors,
    recordErrors: records.filter((r) => r.errors.length).map((r) => ({ locator: r.locator, errors: r.errors })),
  }
  writeJson(join(o.outDir, 'sync-report.json'), report)
  return { records, claims: claimsOut, stats, coverage, attention, errors: globalErrors }
}
