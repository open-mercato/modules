// Network steps of `validate` (spec 5.2 steps 2, 3, 4, 7, 8, 9): the published package or repository, the
// tarball with its SRI, Rentgen (static, nothing executed) and Fit of the version the PR lists, lint, and the
// preliminary claim. Read-only requests through lib/sources (registry.npmjs.org, api.github.com, deps.dev,
// codeload.github.com); nothing is written to the data branch.
import { computeFit } from '../fit/compute.ts'
import { fitModuleOf } from '../fit/data.ts'
import { isPreapproved, templateDeps, type TarballStore } from '../fit/om-tarballs.ts'
import { satisfies } from '../fit/semver.ts'
import { builtForKind, builtForRange } from '../fit/static.ts'
import { installableFrom } from '../core/lines.ts'
import { countedInstallScripts } from '../core/signals.ts'
import { anatomyCounts } from '../rentgen/diff.ts'
import { packageFindings, scanTarballBuffer, type ScanContext } from '../rentgen/extract.ts'
import type { Descriptor as DescriptorT, Facts, LintFinding } from '../schema/index.ts'
import { versionProvenance } from '../sources/depsdev.ts'
import { fetchRepos, isPublicMember, ownerOf, parseRepoUrl, sameRepo, type GithubRecord } from '../sources/github.ts'
import { HttpError, OfflineMissError, type Http } from '../sources/http.ts'
import { fetchPackument, installScriptsOf, npmRecord, pickVersions, type Packument } from '../sources/npm.ts'
import { downloadTarball, githubArchiveUrl } from '../sources/tarball.ts'
import type { Catalog } from './catalog.ts'
import type { Finding, Row, StepId } from './types.ts'

export interface RemoteDeps {
  http: Http
  /** OM tarball cache for Fit; null skips Fit. */
  store: TarballStore | null
  now: Date
  /** PR author login (claims). */
  author: string | null
  log?: (line: string) => void
}

export interface RemoteResult {
  version: string | null
  findings: Finding[]
  skipped: { step: StepId; reason: string }[]
  rows: Row[]
  facts: Facts | null
}

const f = (step: StepId, severity: Finding['severity'], code: string, message: string): Finding => ({
  step,
  severity,
  code,
  message,
})

const short = (err: unknown): string => {
  const m = err instanceof Error ? err.message : String(err)
  return (m.split('\n')[0] ?? m).slice(0, 200)
}

/** "2 lines behind" for a Built for range: minors between the newest minor the range covers and the latest. */
export function linesBehind(range: string, latest: string): number | null {
  const m = /^(\d+)\.(\d+)\./.exec(latest)
  if (!m) return null
  const major = Number(m[1])
  const minor = Number(m[2])
  for (let k = 0; k <= minor; k++) if (satisfies(`${major}.${minor - k}.0`, range)) return k
  return null
}

export function builtForText(omPeers: Readonly<Record<string, string>>, latest: string | null): string {
  const range = builtForRange(omPeers)
  if (range === null) return 'missing (no @open-mercato peer)'
  const kind = builtForKind(range)
  if (!latest) return `${range} (${kind})`
  if (satisfies(latest, range, { includePrerelease: true })) return `${range} (${kind}, covers ${latest})`
  const behind = linesBehind(range, latest)
  return `${range} (${kind}, ${behind === null ? `does not cover ${latest}` : `${behind} line${behind === 1 ? '' : 's'} behind`})`
}

export function kindText(facts: Facts, d: DescriptorT): string {
  if (facts.kind !== 'module') {
    const ext = d.extends ? `, extends ${d.extends.replace(/^npm:/, '')}` : ''
    return `${facts.kind}${ext}`
  }
  const ids = facts.gate.modules.map((m) => m.id)
  const list = ids.length > 3 ? `${ids.slice(0, 3).join(', ')} and ${ids.length - 3} more` : ids.join(', ')
  const gate = facts.gate.installable
    ? `installable${facts.gate.needsModuleFlag ? ', needs --module' : ''}`
    : `not installable: ${facts.gate.reason ?? 'no src/dist pair'}`
  return `module (${list}), ${gate}`
}

export function licenseText(facts: Facts): string {
  const l = facts.license
  const value = l.value ?? 'unknown'
  const src = l.sources
  const where = src.packageJson ? 'package.json' : src.licenseFile ? 'LICENSE' : src.moduleInfo ? 'ModuleInfo' : null
  let text = `${value}${where ? ` (${where})` : ''}`
  if (l.kind !== 'osi') text += `, ${l.kind}`
  if (l.mismatch) {
    const others = [
      ['package.json', src.packageJson],
      ['LICENSE', src.licenseFile],
      ['ModuleInfo', src.moduleInfo],
      ['integration.ts', src.integrationTs],
    ].filter(([, v]) => v !== null && v !== l.value)
    const o = others[0]
    text += o ? `, mismatch: ${o[0]} says ${o[1]}` : ', mismatch'
  }
  return text
}

export function anatomyText(facts: Facts): string {
  if (facts.modules.length === 0)
    return facts.package.name === '@open-mercato/enterprise'
      ? 'withheld (enterprise license)'
      : `no modules (${facts.kind})`
  const c = anatomyCounts(facts.modules)
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`
  return [
    n(c.tables, 'table', 'tables'),
    `${n(c.routes ?? 0, 'route', 'routes')} (${c.publicRoutes ?? 0} public)`,
    n(c.aclFeatures, 'permission', 'permissions'),
    n(c.eventsEmitted, 'event', 'events'),
    n(c.workers, 'queue', 'queues'),
  ].join(' · ')
}

/** Unique lint findings of a package (module lint carries the package findings already). */
export function lintOf(facts: Facts, latestOm: string | null, tpl: Record<string, string> | null): LintFinding[] {
  const all =
    facts.modules.length > 0
      ? facts.modules.flatMap((m) => m.lint)
      : packageFindings(facts, { latestOm, templateDeps: tpl })
  const seen = new Set<string>()
  return all.filter((x) => {
    const k = `${x.code}|${x.message}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function lintText(lint: readonly LintFinding[]): string {
  const codes = (sev: LintFinding['severity']) => [
    ...new Set(lint.filter((l) => l.severity === sev).map((l) => l.code)),
  ]
  const parts: string[] = []
  const e = codes('error')
  const w = codes('warn')
  if (e.length) parts.push(`${e.length} error${e.length > 1 ? 's' : ''}: ${e.join(', ')}`)
  if (w.length) parts.push(`${w.length} warning${w.length > 1 ? 's' : ''}: ${w.join(', ')}`)
  if (parts.length === 0) return `clean (${codes('info').length} info)`
  return parts.join('; ')
}

interface Located {
  version: string | null
  pack: Packument | null
  repo: GithubRecord | null
  /** GitHub-only: tag or branch to read. */
  ref: string | null
}

async function stepLocator(
  d: DescriptorT,
  locator: string,
  deps: RemoteDeps,
  out: RemoteResult,
): Promise<Located | null> {
  const res: Located = { version: null, pack: null, repo: null, ref: null }
  if (d.npm) {
    const pack = await fetchPackument(deps.http, d.npm)
    if (!pack) {
      out.findings.push(f('locator', 'error', 'not-found', `npm package ${d.npm} does not exist`))
      return null
    }
    res.pack = pack
    const pick = pickVersions(pack)
    const official = d.npm.startsWith('@open-mercato/')
    res.version = pick.latestStable ?? (official ? pick.preview : null)
    const { record } = npmRecord(pack)
    if (!res.version) {
      const dep = Object.values(pack.versions ?? {}).some((v) => v.deprecated)
      out.findings.push(
        f(
          'locator',
          'error',
          dep ? 'deprecated' : 'no-stable',
          dep
            ? `${d.npm}: every stable version is deprecated`
            : `${d.npm}: no stable version (x.y.z) on npm; latest is ${pack['dist-tags']?.latest ?? 'missing'}`,
        ),
      )
      return null
    }
    if (record.deprecated) {
      out.findings.push(f('locator', 'error', 'deprecated', `${d.npm}@${res.version} is deprecated on npm`))
      return null
    }
  }
  const repos = new Set<string>()
  const ghLoc = locator.startsWith('github:') ? locator.slice(7) : null
  if (ghLoc) repos.add(ghLoc)
  if (d.github) repos.add(d.github)
  const monorepo = d.repo ? parseRepoUrl(d.repo.split('#')[0]) : null
  if (monorepo) repos.add(monorepo)
  if (repos.size > 0) {
    const look = await fetchRepos(deps.http, [...repos])
    for (const r of repos) {
      const err = look.errors.get(r)
      if (err) {
        out.skipped.push({ step: 'locator', reason: `GitHub ${r}: ${err}` })
        continue
      }
      const rec = look.repos.get(r)
      if (rec === null) {
        out.findings.push(f('locator', 'error', 'not-found', `GitHub repository ${r} does not exist or is private`))
        return null
      }
      if (rec?.archived) {
        out.findings.push(f('locator', 'error', 'archived', `GitHub repository ${r} is archived`))
        return null
      }
      if (rec && (r === ghLoc || r === d.github)) res.repo = rec
    }
    if (ghLoc) {
      res.ref = res.repo?.tags[0]?.name ?? res.repo?.defaultBranch ?? null
      res.version = res.ref
      if (res.repo && res.repo.tags.length === 0)
        out.findings.push(
          f(
            'locator',
            'warning',
            'unpinned',
            `GitHub source without a tag: read from ${res.ref}; the catalog installs only tagged sources`,
          ),
        )
    }
  }
  return res
}

/** Steps 2-4 and 7-9 for one descriptor that passed the offline steps. */
export async function checkRemote(
  d: DescriptorT,
  locator: string,
  catalog: Catalog,
  deps: RemoteDeps,
): Promise<RemoteResult> {
  const out: RemoteResult = { version: null, findings: [], skipped: [], rows: [], facts: null }
  const later = (from: StepId, reason: string) => {
    const order: StepId[] = ['locator', 'tarball', 'license', 'anatomy', 'lint', 'claim']
    for (const s of order.slice(order.indexOf(from))) out.skipped.push({ step: s, reason })
  }
  // 2. locator
  let loc: Located | null
  try {
    loc = await stepLocator(d, locator, deps, out)
  } catch (err) {
    later('locator', offlineOr(err, 'npm or GitHub not reachable'))
    return out
  }
  if (!loc) return out
  out.version = loc.version

  // 3. tarball + Rentgen (static), kind gate
  const latestLine = catalog.lines?.lines.find((l) => l.source === 'latest') ?? null
  const latestOm = latestLine?.version ?? catalog.builtin?.coreVersion ?? null
  let tpl: Record<string, string> | null = null
  if (deps.store && latestOm) {
    try {
      tpl = (await templateDeps(deps.store, latestOm))?.dependencies ?? null
    } catch (err) {
      deps.log?.(`validate: no app template for ${latestOm}: ${short(err)}`)
    }
  }
  const hints: ScanContext['descriptor'] = {
    kind: d.kind,
    ...(d.extends ? { extends: d.extends } : {}),
    ...(d.replaces ? { replaces: d.replaces } : {}),
    ...(d.declares ? { declares: d.declares } : {}),
    ...(d.scriptsRequired ? { scriptsRequired: d.scriptsRequired } : {}),
    whenToUse: d.whenToUse,
  }
  const base = { descriptor: hints, builtin: catalog.builtin, latestOm, templateDeps: tpl }
  let facts: Facts
  try {
    if (d.npm && loc.pack && loc.version) {
      const v = loc.pack.versions?.[loc.version]
      const url = v?.dist?.tarball
      if (!url) throw new Error(`${d.npm}@${loc.version} has no tarball URL`)
      const integrity = v?.dist?.integrity ?? null
      if (!integrity)
        out.findings.push(f('tarball', 'warning', 'no-sri', `${d.npm}@${loc.version} has no SRI integrity`))
      const bytes = await downloadTarball(deps.http, url, integrity)
      const gitHead = typeof v?.gitHead === 'string' && /^[0-9a-f]{7,40}$/.test(v.gitHead) ? v.gitHead : null
      facts = (await scanTarballBuffer(bytes, { ...base, locator, source: 'npm-tarball', integrity, gitRef: gitHead }))
        .facts
      const scripts = countedInstallScripts(installScriptsOf(v), 'npm')
      if (scripts.length > 0 && !d.scriptsRequired)
        out.findings.push(
          f(
            'tarball',
            'warning',
            'install-scripts',
            `install scripts (${scripts.join(', ')}) without scriptsRequired: Supply chain fails`,
          ),
        )
    } else if (loc.ref) {
      const repo = locator.slice(7)
      const bytes = await deps.http.bytes(githubArchiveUrl(repo, loc.ref))
      facts = (
        await scanTarballBuffer(bytes, { ...base, locator, source: 'github-archive', integrity: null, gitRef: loc.ref })
      ).facts
    } else {
      later('tarball', 'no version to read')
      return out
    }
  } catch (err) {
    if (err instanceof HttpError) {
      later('tarball', offlineOr(err, 'tarball not reachable'))
      return out
    }
    out.findings.push(f('tarball', 'error', 'tarball', `tarball rejected: ${short(err)}`))
    return out
  }
  out.facts = facts
  const github = locator.startsWith('github:')
  if (facts.kind !== d.kind)
    out.findings.push(
      f(
        'tarball',
        'error',
        'kind',
        `kind: the descriptor says ${d.kind}, the tarball is a ${facts.kind}${facts.gate.reason ? ` (${facts.gate.reason})` : ''}`,
      ),
    )
  else if (d.kind === 'module' && !facts.gate.installable)
    out.findings.push(
      f(
        'tarball',
        github ? 'warning' : 'error',
        'not-installable',
        github
          ? `GitHub source has no dist/modules: the nightly install skips it (needs build from source)`
          : `Not an installable Open Mercato module: ${facts.gate.reason ?? 'no src/modules and dist/modules pair'}`,
      ),
    )
  if (d.module && !facts.gate.modules.some((m) => m.id === d.module))
    out.findings.push(
      f(
        'tarball',
        'error',
        'module',
        `module ${d.module} is not in the package (${facts.gate.modules.map((m) => m.id).join(', ') || 'no modules'})`,
      ),
    )
  const tarballRepo = d.npm ? parseRepoUrl(loc.pack ? npmRecord(loc.pack).record.repositoryUrl : null) : null
  if (d.npm && d.github) {
    if (tarballRepo && !sameRepo(tarballRepo, d.github))
      out.findings.push(
        f(
          'tarball',
          'error',
          'repo-mismatch',
          `github ${d.github} differs from repository.url ${tarballRepo} in package.json`,
        ),
      )
    else if (!tarballRepo)
      out.findings.push(
        f(
          'tarball',
          'warning',
          'no-repository',
          `package.json has no repository.url; github ${d.github} cannot be confirmed`,
        ),
      )
  }
  out.rows.push({ check: 'Kind', result: kindText(facts, d) })

  // 4. license
  out.rows.push({ check: 'License', result: licenseText(facts) })
  if (facts.license.mismatch)
    out.findings.push(f('license', 'warning', 'license-mismatch', `license sources differ: ${licenseText(facts)}`))

  // 9. claim (row placed here, as in the spec example)
  out.rows.push({ check: 'Ownership', result: await claimText(d, locator, loc, tarballRepo, catalog, deps) })

  // 7. anatomy and Fit
  out.rows.push({ check: 'Anatomy', result: anatomyText(facts) })
  out.rows.push({ check: 'Fits statically', result: await fitText(facts, catalog, deps) })
  const published = d.npm && loc.pack && loc.version ? (loc.pack.time?.[loc.version] ?? null) : null
  const pre = isPreapproved(facts.package.name, latestLine?.preapproved ?? ['@open-mercato/*'])
  const from = d.npm ? installableFrom(published, pre) : null
  const gated = from !== null && from > deps.now.toISOString().slice(0, 10)
  out.rows.push({
    check: 'Built for',
    result: `${builtForText(facts.omPeers, latestOm)}${from ? ` · installable from ${from}${gated ? ' (Yarn age gate)' : ''}` : ''}`,
  })

  // 8. lint
  const lint = lintOf(facts, latestOm, tpl)
  out.rows.push({ check: 'Lint', result: lintText(lint) })
  for (const l of lint.filter((x) => x.code === 'collision-core' && x.severity === 'error'))
    out.findings.push(f('lint', 'error', 'collision-core', l.message))
  // E4: no example hint for official packages
  const official = d.npm?.startsWith('@open-mercato/') ?? false
  if (!official && lint.some((l) => l.code === 'likely-example') && !d.tags.includes('example'))
    out.findings.push(
      f('lint', 'info', 'likely-example', 'looks like an example module; a curator may add the example tag'),
    )
  return out
}

function offlineOr(err: unknown, what: string): string {
  if (err instanceof OfflineMissError) return 'offline'
  return `${what}: ${short(err)}`
}

async function claimText(
  d: DescriptorT,
  locator: string,
  loc: Located,
  tarballRepo: string | null,
  catalog: Catalog,
  deps: RemoteDeps,
): Promise<string> {
  const entryRepo = locator.startsWith('github:') ? locator.slice(7) : (d.github ?? tarballRepo)
  if (!entryRepo) return 'Unclaimed (no repository to claim from)'
  if (d.npm && !sameRepo(tarballRepo, entryRepo))
    return 'Unclaimed (repository.url does not point to the entry repository)'
  if (d.npm && loc.version) {
    try {
      const p = await versionProvenance(deps.http, d.npm, loc.version)
      if (p?.verified && sameRepo(p.sourceRepo, entryRepo)) return 'Claimed (provenance)'
    } catch {
      // deps.dev unreachable: the other methods still apply
    }
  }
  const author = deps.author?.toLowerCase() ?? null
  if (!author) return 'Unclaimed (no PR author)'
  if (catalog.curators.includes(author)) return 'Unclaimed (curator PR)'
  const owner = ownerOf(entryRepo)
  if (author === owner.toLowerCase()) return 'Claimed (repo-owner)'
  if (loc.repo?.ownerType !== 'User') {
    try {
      if (await isPublicMember(deps.http, owner, author)) return 'Claimed (org-member)'
    } catch {
      return 'Unclaimed (org membership not reachable)'
    }
  }
  return 'Unclaimed (PR author is not repo owner or org member)'
}

async function fitText(facts: Facts, catalog: Catalog, deps: RemoteDeps): Promise<string> {
  if (facts.modules.length === 0) return 'not applicable (no modules)'
  const lines = catalog.lines
  if (!lines) return 'skipped (no data/lines.json yet)'
  if (!deps.store) return 'skipped'
  const latest = lines.lines.find((l) => l.source === 'latest')?.version ?? null
  try {
    const mod = fitModuleOf(facts)
    const res = await computeFit(deps.store, {
      versions: lines.lines.map((l) => l.version),
      latest,
      modules: [mod],
      asOf: deps.now,
      ...(deps.log ? { log: deps.log } : {}),
    })
    const order = (k: string) => {
      const m = /^(\d+)\.(\d+)$/.exec(k)
      return m ? Number(m[1]) * 1000 + Number(m[2]) : Number.MAX_SAFE_INTEGER
    }
    return [...lines.lines]
      .sort((a, b) => order(a.key) - order(b.key))
      .map((l) => `${l.key} ${res.get(l.version)?.[mod.key]?.status ?? 'unknown'}`)
      .join(' · ')
  } catch (err) {
    return `skipped (${short(err)})`
  }
}
