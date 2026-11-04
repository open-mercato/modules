// Network steps of `validate` for a template entry (docs/specs/2026-10-29-templates.md, Phase 1a steps 2 and 3): the
// repository (exists, public, not archived), the `ref` resolved to one sha that a branch or tag of the repository
// contains (a fork commit GitHub serves through the parent is refused), the static archive check of that sha, the
// license (D4) and the ownership row. Read-only requests to api.github.com and codeload.github.com through the Http
// of RemoteDeps, so tests answer them with a fake fetch; nothing from the archive is unpacked or run.
import { licenseKind } from '../rentgen/license.ts'
import { satisfies } from '../fit/semver.ts'
import type { TemplateDescriptor as TemplateDescriptorT } from '../schema/template.ts'
import { API, isPublicMember, ownerOf, repoTags } from '../sources/github.ts'
import { HttpError, OfflineMissError, type Http } from '../sources/http.ts'
import { githubArchiveUrl } from '../sources/tarball.ts'
import { checkTemplateArchive, type ArchiveFacts } from '../templates/archive.ts'
import { APP_FROM, DEFAULT_FROM } from '../templates/modules-ts.ts'
import type { Catalog } from './catalog.ts'
import type { RemoteDeps, RemoteResult } from './remote.ts'
import type { Finding, StepId } from './types.ts'

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

const offlineOr = (err: unknown, what: string): string =>
  err instanceof OfflineMissError ? 'offline' : `${what}: ${short(err)}`

/** At most this many compare requests to find a branch or tag that contains a sha `ref`. */
export const MAX_COMPARES = 10

/** The fields of `GET /repos/{owner}/{repo}` the template steps read. */
export interface TemplateRepo {
  fullName: string
  private: boolean
  archived: boolean
  defaultBranch: string
  /** SPDX id GitHub detects, null for none or NOASSERTION. */
  license: string | null
  ownerType: 'User' | 'Organization'
}

/** The repository, or null when it does not exist or the token cannot see it (a private repository). */
export async function fetchTemplateRepo(http: Http, repo: string): Promise<TemplateRepo | null> {
  const url = `${API}/repos/${repo}`
  const res = await http.request(url)
  if (res.status === 404) return null
  if (res.status !== 200 || res.json === null) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  const j = res.json as {
    full_name?: string
    private?: boolean
    archived?: boolean
    default_branch?: string
    license?: { spdx_id?: string | null } | null
    owner?: { type?: string } | null
  }
  const spdx = j.license?.spdx_id ?? null
  return {
    fullName: j.full_name ?? repo,
    private: j.private === true,
    archived: j.archived === true,
    defaultBranch: j.default_branch ?? 'main',
    license: spdx && spdx !== 'NOASSERTION' ? spdx : null,
    ownerType: j.owner?.type === 'Organization' ? 'Organization' : 'User',
  }
}

/** Branch heads (`GET /repos/{repo}/branches`, first 100). */
export async function repoBranches(http: Http, repo: string): Promise<{ name: string; sha: string }[]> {
  const url = `${API}/repos/${repo}/branches?per_page=100`
  const res = await http.request(url)
  if (res.status !== 200 || !Array.isArray(res.json))
    throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  return (res.json as { name: string; commit: { sha: string } }[]).map((b) => ({ name: b.name, sha: b.commit.sha }))
}

const refPath = (ref: string): string => ref.split('/').map(encodeURIComponent).join('/')

/** The full sha a ref resolves to in this repository (`GET /repos/{repo}/commits/{ref}`), null when it does not. */
export async function commitSha(http: Http, repo: string, ref: string): Promise<string | null> {
  const url = `${API}/repos/${repo}/commits/${refPath(ref)}`
  const res = await http.request(url, { text: true, headers: { accept: 'application/vnd.github.sha' } })
  if (res.status === 404 || res.status === 422) return null
  const sha = res.text.trim()
  if (res.status !== 200 || !/^[0-9a-f]{40}$/.test(sha))
    throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  return sha
}

/** True when `base` (a branch or tag) contains `sha`: the compare API says `behind` or `identical`. */
export async function contains(http: Http, repo: string, base: string, sha: string): Promise<boolean> {
  const url = `${API}/repos/${repo}/compare/${refPath(base)}...${sha}?per_page=1`
  const res = await http.request(url)
  if (res.status === 404 || res.status === 422) return false
  if (res.status !== 200 || res.json === null) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  const status = (res.json as { status?: string }).status
  return status === 'behind' || status === 'identical'
}

export interface ResolvedRef {
  /** The ref as the entry names it, or the default branch. */
  name: string
  /** `ref` is a branch or tag the first pages of either did not list. */
  kind: 'default branch' | 'branch' | 'tag' | 'ref' | 'commit'
  sha: string
}

/**
 * Resolves the entry's `ref` to one sha of this repository. A named ref (branch or tag) belongs to the repository by
 * definition; a commit sha must be contained in a branch or tag, because GitHub serves a fork's commits through the
 * parent too. Returns the finding instead when the ref does not resolve or no branch or tag contains it.
 */
export async function resolveTemplateRef(
  http: Http,
  repo: string,
  meta: TemplateRepo,
  ref: string | undefined,
): Promise<{ ref: ResolvedRef } | { finding: Finding }> {
  const branches = await repoBranches(http, repo)
  const tags = await repoTags(http, repo)
  const name = ref ?? meta.defaultBranch
  const notFound = (): { finding: Finding } => ({
    finding: f('repo', 'error', 'ref-not-found', `ref ${name} is not a branch, tag or commit of ${repo}`),
  })
  const tag = tags.find((t) => t.name === name)
  const branch = branches.find((b) => b.name === name)
  if (ref === undefined || branch || tag) {
    const sha = branch?.sha ?? tag?.sha ?? (await commitSha(http, repo, name))
    if (!sha) return notFound()
    return { ref: { name, kind: ref === undefined ? 'default branch' : branch ? 'branch' : 'tag', sha } }
  }
  const sha = await commitSha(http, repo, name)
  if (!sha) return notFound()
  // a name beyond the first pages of branches or tags still resolves; only a sha needs the containment check
  if (!/^[0-9a-f]{7,40}$/i.test(name) || !sha.startsWith(name.toLowerCase())) return { ref: { name, kind: 'ref', sha } }
  const resolved: ResolvedRef = { name, kind: 'commit', sha }
  if (branches.some((b) => b.sha === sha) || tags.some((t) => t.sha === sha)) return { ref: resolved }
  const bases = [
    meta.defaultBranch,
    ...branches.map((b) => b.name).filter((n) => n !== meta.defaultBranch),
    ...tags.map((t) => t.name),
  ].slice(0, MAX_COMPARES)
  for (const base of bases) if (await contains(http, repo, base, sha)) return { ref: resolved }
  return {
    finding: f(
      'repo',
      'error',
      'ref-unreachable',
      `commit ${sha.slice(0, 12)} is not on a branch or tag of ${repo} (checked ${bases.length}); a commit of a fork is refused. Name a branch or tag, or a commit of one`,
    ),
  }
}

/** "0.9.0 (0.9.x, current line)" or "0.7.2 (0.7.x, 2 lines behind 0.9.0)". */
export function builtOnText(om: ArchiveFacts['openMercato'], latest: string | null): string {
  if (!om) return 'unknown (@open-mercato/core not pinned in yarn.lock)'
  const head = `${om.version} (${om.line}.x`
  const m = /^(\d+)\.(\d+)\./.exec(latest ?? '')
  const [maj, min] = om.line.split('.').map(Number) as [number, number]
  if (!m) return `${head})`
  const range = `>=${maj}.${min}.0 <${maj}.${min + 1}.0`
  if (satisfies(latest as string, range, { includePrerelease: true })) return `${head}, current line)`
  if (Number(m[1]) !== maj || Number(m[2]) < min) return `${head}, latest stable is ${latest})`
  const behind = Number(m[2]) - min
  return `${head}, ${behind} line${behind === 1 ? '' : 's'} behind ${latest})`
}

export function modulesText(facts: ArchiveFacts): string {
  const inv = facts.modules
  if (!inv) return 'not read'
  const own = inv.entries.filter((e) => e.from === APP_FROM).length
  const npm = inv.entries.filter((e) => e.from !== APP_FROM && e.from !== DEFAULT_FROM).length
  const when = inv.entries.filter((e) => e.when !== undefined).length
  const n = inv.entries.length
  const parts = [`${n} module${n === 1 ? '' : 's'}`, `${own} own`, `${npm} from other packages`, `${when} conditional`]
  if (inv.unparsed.length > 0) parts.push(`${inv.unparsed.length} unread`)
  return parts.join(', ')
}

/** The license value and kind from the archive's LICENSE file, GitHub's detection and package.json, in that order. */
export function templateLicense(
  facts: ArchiveFacts,
  github: string | null,
): { value: string | null; kind: string; mismatch: boolean; text: string } {
  const file = facts.license.file && facts.license.file !== 'custom' ? facts.license.file : null
  const value = file ?? github ?? facts.license.packageJson
  const kind = licenseKind(value, '', facts.license.file)
  const classes = new Set(
    [file, github, facts.license.packageJson]
      .filter((v): v is string => v !== null && !/^SEE LICEN[CS]E IN/i.test(v))
      .map((v) => (v === 'UNLICENSED' || v === 'PROPRIETARY' ? 'proprietary' : v.toUpperCase())),
  )
  const mismatch = classes.size > 1
  const where = file ? 'LICENSE' : github ? 'GitHub' : facts.license.packageJson ? 'package.json' : null
  let text = `${value ?? 'none'}${where ? ` (${where})` : ''}`
  if (value !== null && kind !== 'osi') text += `, ${kind}`
  if (mismatch)
    text += `, mismatch: ${[
      ['LICENSE', file],
      ['GitHub', github],
      ['package.json', facts.license.packageJson],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`
  return { value, kind, mismatch, text }
}

async function ownershipText(
  repo: string,
  meta: TemplateRepo,
  catalog: Pick<Catalog, 'curators'>,
  deps: RemoteDeps,
): Promise<string> {
  const author = deps.author?.toLowerCase() ?? null
  if (!author) return 'Unclaimed (no PR author)'
  if (catalog.curators.includes(author)) return 'Unclaimed (curator PR)'
  const owner = ownerOf(repo)
  if (author === owner.toLowerCase()) return 'Claimed (repo-owner)'
  if (meta.ownerType === 'Organization') {
    try {
      if (await isPublicMember(deps.http, owner, author)) return 'Claimed (org-member)'
    } catch {
      return 'Unclaimed (org membership not reachable)'
    }
  }
  return 'Unclaimed (PR author is not repo owner or org member)'
}

export interface TemplateRemoteOptions {
  /** Archive limits (the catalog's tarball limits by default). */
  limits?: { maxBytes: number; maxFiles: number }
}

/** Repository, archive, license and ownership of a template entry that passed the offline steps. */
export async function checkTemplateRemote(
  d: TemplateDescriptorT,
  catalog: Catalog,
  deps: RemoteDeps,
  opts: TemplateRemoteOptions = {},
): Promise<RemoteResult> {
  const out: RemoteResult = { version: null, findings: [], skipped: [], rows: [], facts: null }
  const later = (from: StepId, reason: string) => {
    const order: StepId[] = ['repo', 'archive', 'license', 'claim']
    for (const s of order.slice(order.indexOf(from))) out.skipped.push({ step: s, reason })
  }
  const repo = d.github
  // a delisted entry may point at a deleted, private or archived repository: that is why it is delisted
  const gone = d.status === 'delisted' ? 'warning' : 'error'

  // repository
  let meta: TemplateRepo | null
  try {
    meta = await fetchTemplateRepo(deps.http, repo)
  } catch (err) {
    later('repo', offlineOr(err, 'GitHub not reachable'))
    return out
  }
  if (meta === null || meta.private) {
    out.findings.push(f('repo', gone, 'not-found', `GitHub repository ${repo} does not exist or is not public`))
    later('archive', 'no public repository')
    return out
  }
  if (meta.archived)
    out.findings.push(
      f('repo', d.status === 'active' ? 'error' : 'warning', 'archived', `GitHub repository ${repo} is archived`),
    )
  if (meta.fullName.toLowerCase() !== repo.toLowerCase())
    out.findings.push(
      f(
        'repo',
        'warning',
        'renamed',
        `GitHub serves ${repo} as ${meta.fullName}: set github to ${meta.fullName} and move the file to match`,
      ),
    )
  let resolved: Awaited<ReturnType<typeof resolveTemplateRef>>
  try {
    resolved = await resolveTemplateRef(deps.http, repo, meta, d.ref)
  } catch (err) {
    later('repo', offlineOr(err, 'GitHub not reachable'))
    return out
  }
  if ('finding' in resolved) {
    out.findings.push(resolved.finding)
    later('archive', 'no commit to read')
    return out
  }
  const ref = resolved.ref
  out.version = ref.sha.slice(0, 12)
  out.rows.push({ check: 'Repository', result: `${meta.fullName}, ${ref.kind} ${ref.name} at ${ref.sha.slice(0, 12)}` })
  if (d.status === 'delisted') {
    later('archive', 'delisted')
    return out
  }

  // archive: the tarball of that one sha, read statically
  let bytes: Uint8Array
  try {
    bytes = await deps.http.bytes(githubArchiveUrl(repo, ref.sha))
  } catch (err) {
    later('archive', offlineOr(err, 'archive not reachable'))
    return out
  }
  const archive = await checkTemplateArchive(bytes, {
    ...(opts.limits ? { limits: opts.limits } : {}),
    declaredEnv: (d.declares?.env ?? []).map((e) => e.name),
  })
  for (const x of archive.findings) out.findings.push(f('archive', x.severity, x.code, x.message))
  const facts = archive.facts
  const latestLine = catalog.lines?.lines.find((l) => l.source === 'latest') ?? null
  const latestOm = latestLine?.version ?? catalog.builtin?.coreVersion ?? null
  out.rows.push({ check: 'Built on', result: builtOnText(facts.openMercato, latestOm) })
  out.rows.push({ check: 'Modules', result: modulesText(facts) })
  const engines = Object.entries(facts.engines ?? {}).map(([k, v]) => `${k} ${v}`)
  out.rows.push({
    check: 'Engines',
    result: `${engines.length > 0 ? engines.join(', ') : 'none declared'}${facts.packageManager ? `; ${facts.packageManager.replace(/\+.*$/, '')}` : ''}`,
  })

  // license (D4): a template is copied, so an active one needs an OSI license; `hold` may lack one
  const lic = templateLicense(facts, meta.license)
  out.rows.push({ check: 'License', result: lic.text })
  if (lic.kind !== 'osi') {
    const what = lic.value === null ? 'no license' : `${lic.value} is not an OSI license`
    if (d.status === 'active')
      out.findings.push(
        f(
          'license',
          'error',
          'license',
          `${what}: an active template needs an OSI license (D4); add one, or list it as hold with a reason`,
        ),
      )
    else if (d.status === 'unmaintained')
      out.findings.push(
        f('license', 'warning', 'license', `${what}: the create command still works for unmaintained entries`),
      )
    else out.findings.push(f('license', 'info', 'license', `${what} (allowed on hold, D4)`))
  }
  if (lic.mismatch)
    out.findings.push(f('license', 'warning', 'license-mismatch', `license sources differ: ${lic.text}`))

  out.rows.push({
    check: 'Manifest',
    result:
      facts.manifest.state === 'absent'
        ? 'none (mercato-template.json is optional)'
        : facts.manifest.state === 'invalid'
          ? 'invalid, ignored'
          : archive.findings.some((x) => x.code.startsWith('manifest-'))
            ? 'differs from the app'
            : 'matches the app',
  })
  out.rows.push({ check: 'Ownership', result: await ownershipText(repo, meta, catalog, deps) })
  return out
}
