// GitHub (read only): repository metadata through GraphQL in batches, public org membership, pull requests of
// commits (claims), topic search and repository trees (discovery), tags (watch). Spec 4.5 SyncRecord.github, 5.2.
import { execFileSync } from 'node:child_process'
import type { SyncRecord } from '../schema/index.ts'
import { getJson, type Http, HttpError } from './http.ts'
import { isoSeconds } from './semver.ts'

export const API = 'https://api.github.com'
export type GithubRecord = NonNullable<SyncRecord['github']>

/** `owner/repo` from a repository URL or shorthand (`git+https://github.com/a/b.git`, `github:a/b`, `a/b`). */
export function parseRepoUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const s = url.trim()
  const m =
    /^(?:git\+)?(?:https?|git|ssh):\/\/(?:[^@/]+@)?(?:www\.)?github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/#?].*)?$/.exec(
      s,
    ) ??
    /^git@github\.com:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/.exec(s) ??
    /^(?:github:)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:#.*)?$/.exec(s)
  if (!m) return null
  return `${m[1]}/${m[2]}`
}

export function sameRepo(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

export function ownerOf(repo: string): string {
  return repo.split('/')[0] as string
}

/** Token for api.github.com: GITHUB_TOKEN, GH_TOKEN, else `gh auth token` (local runs). Null without one. */
export function githubToken(): string | null {
  const env = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (env) return env
  try {
    const t = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim()
    return t || null
  } catch {
    return null
  }
}

interface GqlRepo {
  nameWithOwner: string
  isArchived: boolean
  pushedAt: string | null
  updatedAt: string
  stargazerCount: number
  defaultBranchRef: { name: string } | null
  licenseInfo: { spdxId: string | null } | null
  repositoryTopics: { nodes: { topic: { name: string } }[] }
  owner: { __typename: string; login: string }
  refs: { nodes: { name: string; target: { oid: string; target?: { oid: string } } }[] } | null
}

const REPO_FIELDS = `nameWithOwner isArchived pushedAt updatedAt stargazerCount
  defaultBranchRef { name } licenseInfo { spdxId }
  repositoryTopics(first: 20) { nodes { topic { name } } }
  owner { __typename login }
  refs(refPrefix: "refs/tags/", first: 50, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
    nodes { name target { oid ... on Tag { target { oid } } } } }`

export function repoQuery(repos: string[]): string {
  const parts = repos.map((r, i) => {
    const [owner, name] = r.split('/') as [string, string]
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${REPO_FIELDS} }`
  })
  return `query { ${parts.join('\n')} }`
}

function toRecord(requested: string, g: GqlRepo): GithubRecord {
  const spdx = g.licenseInfo?.spdxId
  return {
    repo: g.nameWithOwner,
    redirectedFrom: sameRepo(g.nameWithOwner, requested) ? null : requested,
    archived: g.isArchived,
    pushedAt: isoSeconds(g.pushedAt ?? g.updatedAt) as string,
    defaultBranch: g.defaultBranchRef?.name ?? 'main',
    stars: g.stargazerCount,
    license: spdx && spdx !== 'NOASSERTION' ? spdx : null,
    topics: g.repositoryTopics.nodes.map((n) => n.topic.name).slice(0, 20),
    ownerType: g.owner.__typename === 'Organization' ? 'Organization' : 'User',
    tags: (g.refs?.nodes ?? []).slice(0, 50).map((t) => ({ name: t.name, sha: t.target.target?.oid ?? t.target.oid })),
  }
}

export interface RepoLookup {
  /** null = the repository does not exist (or is private). */
  repos: Map<string, GithubRecord | null>
  errors: Map<string, string>
}

/** Repository metadata in GraphQL batches of `batch`. Keys of the result are the requested names. */
export async function fetchRepos(http: Http, repos: string[], batch = 20): Promise<RepoLookup> {
  const out: RepoLookup = { repos: new Map(), errors: new Map() }
  const unique = [...new Set(repos)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  for (let i = 0; i < unique.length; i += batch) {
    const chunk = unique.slice(i, i + batch)
    try {
      const res = await http.request(`${API}/graphql`, { method: 'POST', body: { query: repoQuery(chunk) } })
      const body = res.json as {
        data?: Record<string, GqlRepo | null> | null
        errors?: { type?: string; path?: string[]; message?: string }[]
      } | null
      if (res.status !== 200 || !body) throw new HttpError(`GraphQL HTTP ${res.status}`, `${API}/graphql`, res.status)
      if (!body.data && body.errors?.length)
        throw new HttpError(`GraphQL: ${body.errors[0]?.message ?? 'error'}`, `${API}/graphql`, res.status)
      chunk.forEach((r, j) => {
        const node = body.data?.[`r${j}`] ?? null
        const err = body.errors?.find((e) => e.path?.[0] === `r${j}`)
        if (node) out.repos.set(r, toRecord(r, node))
        else if (!err || err.type === 'NOT_FOUND') out.repos.set(r, null)
        else out.errors.set(r, `github: ${err.message ?? 'GraphQL error'}`.slice(0, 300))
      })
    } catch (err) {
      for (const r of chunk) out.errors.set(r, `github: ${(err as Error).message}`.slice(0, 300))
    }
  }
  return out
}

/** `GET /orgs/{org}/public_members/{login}`: 204 = public member. */
export async function isPublicMember(http: Http, org: string, login: string): Promise<boolean> {
  const url = `${API}/orgs/${encodeURIComponent(org)}/public_members/${encodeURIComponent(login)}`
  const res = await http.request(url)
  if (res.status === 204) return true
  if (res.status === 404 || res.status === 302) return false
  throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
}

export interface PullInfo {
  number: number
  author: string
  mergedAt: string | null
  baseRef: string
}

/** Pull requests that contain a commit (`GET /repos/{repo}/commits/{sha}/pulls`). */
export async function commitPulls(http: Http, repo: string, sha: string): Promise<PullInfo[]> {
  const list = await getJson<
    { number: number; user?: { login?: string } | null; merged_at?: string | null; base?: { ref?: string } }[]
  >(http, `${API}/repos/${repo}/commits/${sha}/pulls`)
  return list.map((p) => ({
    number: p.number,
    author: p.user?.login ?? '',
    mergedAt: p.merged_at ?? null,
    baseRef: p.base?.ref ?? '',
  }))
}

export interface RepoHit {
  repo: string
  description: string | null
  defaultBranch: string
  archived: boolean
  fork: boolean
}

/** Repositories with a topic (`GET /search/repositories?q=topic:<t>`), first 100. */
export async function searchTopic(http: Http, topic: string): Promise<RepoHit[]> {
  const res = await getJson<{
    items?: {
      full_name: string
      description: string | null
      default_branch: string
      archived: boolean
      fork: boolean
    }[]
  }>(http, `${API}/search/repositories?q=${encodeURIComponent(`topic:${topic}`)}&per_page=100`)
  return (res.items ?? []).map((i) => ({
    repo: i.full_name,
    description: i.description,
    defaultBranch: i.default_branch,
    archived: i.archived,
    fork: i.fork,
  }))
}

/** File paths of a repository tree (recursive). */
export async function repoTree(http: Http, repo: string, ref: string): Promise<string[]> {
  const res = await getJson<{ tree?: { path: string; type: string }[] }>(
    http,
    `${API}/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  )
  return (res.tree ?? []).filter((t) => t.type === 'blob').map((t) => t.path)
}

/** Tags (newest first as GitHub lists them), REST, first 30. */
export async function repoTags(http: Http, repo: string): Promise<{ name: string; sha: string }[]> {
  const res = await getJson<{ name: string; commit: { sha: string } }[]>(http, `${API}/repos/${repo}/tags?per_page=30`)
  return res.map((t) => ({ name: t.name, sha: t.commit.sha }))
}

/** Recording slimmer: repository trees keep only the paths discovery reads (src/modules, dist/modules). */
export function slimTree(url: string, json: unknown): unknown {
  if (!url.startsWith(`${API}/repos/`) || !url.includes('/git/trees/')) return json
  const t = json as { tree?: { path: string; type: string }[]; truncated?: boolean }
  if (!t || !Array.isArray(t.tree)) return json
  return {
    truncated: t.truncated,
    tree: t.tree.filter((e) => /(^|\/)(src|dist)\/modules\//.test(e.path)).map((e) => ({ path: e.path, type: e.type })),
  }
}

/** Recording slimmer: search results keep only the fields discovery reads. */
export function slimSearch(url: string, json: unknown): unknown {
  if (!url.startsWith(`${API}/search/repositories`)) return json
  const s = json as { total_count?: number; items?: Record<string, unknown>[] }
  if (!s || !Array.isArray(s.items)) return json
  return {
    total_count: s.total_count,
    items: s.items.map((i) => ({
      full_name: i.full_name,
      description: i.description,
      default_branch: i.default_branch,
      archived: i.archived,
      fork: i.fork,
    })),
  }
}
