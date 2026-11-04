// Test helpers for lib/validate: a fake npm registry and GitHub API (fetch stub for lib/sources/http.ts), synthetic
// module tarballs, and a throwaway git repository that looks like the catalog repo.
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderAll } from '../../lib/commands/seed.ts'
import { createHttp, type Http } from '../../lib/sources/http.ts'
import { makeTarball, modulePackage, type TarEntry } from '../rentgen/helpers.ts'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const integrityOf = (buf: Uint8Array): string => `sha512-${createHash('sha512').update(buf).digest('base64')}`

export interface FakePackage {
  name: string
  versions: Record<
    string,
    {
      tarball?: Uint8Array
      /** Overrides the SRI written into the packument. */
      integrity?: string
      deprecated?: string
      repository?: string
      scripts?: Record<string, string>
      time?: string
    }
  >
  latest?: string
}

export interface FakeRepo {
  nameWithOwner: string
  archived?: boolean
  ownerType?: 'User' | 'Organization'
  tags?: string[]
  // REST answers the template steps read (GET /repos/{repo}, branches, tags, commits, compare)
  private?: boolean
  defaultBranch?: string
  /** SPDX id GitHub detects (default MIT; null for none). */
  license?: string | null
  /** `full_name` GitHub answers with (a renamed repository). */
  fullName?: string
  /** Branch heads, name to sha. */
  branches?: Record<string, string>
  /** Tags, name to commit sha. */
  tagShas?: Record<string, string>
  /** Shas each branch or tag contains, besides its head. */
  contains?: Record<string, string[]>
  /** Shas GitHub serves through this repository that no branch or tag contains (commits of a fork). */
  foreign?: string[]
}

export interface FakeWorld {
  packages?: FakePackage[]
  repos?: FakeRepo[]
  /** `owner/repo@ref` -> GitHub archive bytes. */
  archives?: Record<string, Uint8Array>
  /** `org/login` pairs that are public members. */
  members?: string[]
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A fetch that answers like registry.npmjs.org, api.github.com (GraphQL and REST), deps.dev and codeload. */
export function fakeFetch(world: FakeWorld, seen: string[] = []): typeof fetch {
  const tarballs = new Map<string, Uint8Array>()
  for (const p of world.packages ?? [])
    for (const [v, x] of Object.entries(p.versions))
      if (x.tarball)
        tarballs.set(`https://registry.npmjs.org/${p.name}/-/${p.name.split('/').pop()}-${v}.tgz`, x.tarball)
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    seen.push(`${init?.method ?? 'GET'} ${url}`)
    const tb = tarballs.get(url)
    if (tb) return new Response(Buffer.from(tb), { status: 200 })
    if (url.startsWith('https://registry.npmjs.org/')) {
      const name = decodeURIComponent(url.slice('https://registry.npmjs.org/'.length))
      const p = world.packages?.find((x) => x.name === name)
      if (!p) return json({ error: 'Not found' }, 404)
      const versions = Object.fromEntries(
        Object.entries(p.versions).map(([v, x]) => [
          v,
          {
            name: p.name,
            version: v,
            license: 'MIT',
            ...(x.deprecated ? { deprecated: x.deprecated } : {}),
            ...(x.repository ? { repository: { type: 'git', url: x.repository } } : {}),
            ...(x.scripts ? { scripts: x.scripts } : {}),
            dist: {
              tarball: `https://registry.npmjs.org/${p.name}/-/${p.name.split('/').pop()}-${v}.tgz`,
              integrity: x.integrity ?? (x.tarball ? integrityOf(x.tarball) : 'sha512-none'),
            },
          },
        ]),
      )
      const time = Object.fromEntries(
        Object.entries(p.versions).map(([v, x]) => [v, x.time ?? '2026-10-01T10:00:00.000Z']),
      )
      return json({ name: p.name, 'dist-tags': { latest: p.latest ?? Object.keys(p.versions).at(-1) }, versions, time })
    }
    if (url === 'https://api.github.com/graphql') {
      const query = JSON.parse(String(init?.body)).query as string
      const data: Record<string, unknown> = {}
      const errors: unknown[] = []
      for (const m of query.matchAll(/(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)) {
        const full = `${m[2]}/${m[3]}`
        const r = world.repos?.find((x) => x.nameWithOwner.toLowerCase() === full.toLowerCase())
        if (!r) {
          data[m[1] as string] = null
          errors.push({
            type: 'NOT_FOUND',
            path: [m[1]],
            message: `Could not resolve to a Repository with the name '${full}'.`,
          })
          continue
        }
        data[m[1] as string] = {
          nameWithOwner: r.nameWithOwner,
          isArchived: r.archived ?? false,
          pushedAt: '2026-10-01T10:00:00Z',
          updatedAt: '2026-10-01T10:00:00Z',
          stargazerCount: 3,
          defaultBranchRef: { name: 'main' },
          licenseInfo: { spdxId: 'MIT' },
          repositoryTopics: { nodes: [] },
          owner: { __typename: r.ownerType ?? 'User', login: r.nameWithOwner.split('/')[0] },
          refs: { nodes: (r.tags ?? []).map((t) => ({ name: t, target: { oid: 'a'.repeat(40) } })) },
        }
      }
      return json({ data, ...(errors.length ? { errors } : {}) })
    }
    const rest = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/?]+)(\/.*)?$/.exec(url)
    if (rest) {
      const r = world.repos?.find((x) => x.nameWithOwner.toLowerCase() === (rest[1] as string).toLowerCase())
      if (!r || (r.private && !rest[2])) return json({ message: 'Not Found' }, 404)
      const branches = r.branches ?? {}
      const tags = r.tagShas ?? {}
      const head = (name: string): string | undefined => branches[name] ?? tags[name]
      const known = [...Object.values(branches), ...Object.values(tags), ...Object.values(r.contains ?? {}).flat()]
      const tail = rest[2] ?? ''
      if (tail === '')
        return json({
          full_name: r.fullName ?? r.nameWithOwner,
          private: r.private ?? false,
          archived: r.archived ?? false,
          default_branch: r.defaultBranch ?? 'main',
          license: r.license === null ? null : { spdx_id: r.license ?? 'MIT' },
          owner: { login: r.nameWithOwner.split('/')[0], type: r.ownerType ?? 'User' },
        })
      if (tail === '/branches?per_page=100')
        return json(Object.entries(branches).map(([name, sha]) => ({ name, commit: { sha } })))
      if (tail === '/tags?per_page=30')
        return json(Object.entries(tags).map(([name, sha]) => ({ name, commit: { sha } })))
      const commit = /^\/commits\/(.+)$/.exec(tail)
      if (commit) {
        const ref = decodeURIComponent(commit[1] as string)
        const sha =
          head(ref) ?? [...known, ...(r.foreign ?? [])].find((x) => /^[0-9a-f]{7,40}$/.test(ref) && x.startsWith(ref))
        return sha
          ? new Response(sha, { status: 200, headers: { 'content-type': 'application/vnd.github.sha' } })
          : json({ message: 'No commit found for SHA' }, 422)
      }
      const compare = /^\/compare\/(.+)\.\.\.([0-9a-f]{40})\?per_page=1$/.exec(tail)
      if (compare) {
        const base = decodeURIComponent(compare[1] as string)
        const sha = compare[2] as string
        const status =
          head(base) === sha ? 'identical' : (r.contains?.[base] ?? []).includes(sha) ? 'behind' : 'diverged'
        return json({ status })
      }
      return json({ message: 'Not Found' }, 404)
    }
    const member = /^https:\/\/api\.github\.com\/orgs\/([^/]+)\/public_members\/([^/]+)$/.exec(url)
    if (member)
      return new Response(null, { status: (world.members ?? []).includes(`${member[1]}/${member[2]}`) ? 204 : 404 })
    const archive = /^https:\/\/codeload\.github\.com\/([^/]+\/[^/]+)\/tar\.gz\/(.+)$/.exec(url)
    if (archive) {
      const b = world.archives?.[`${archive[1]}@${decodeURIComponent(archive[2] as string)}`]
      return b ? new Response(Buffer.from(b), { status: 200 }) : new Response('nope', { status: 404 })
    }
    if (url.startsWith('https://api.deps.dev/')) return json({ error: 'not found' }, 404)
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch
}

export function fakeHttp(world: FakeWorld, seen: string[] = []): Http {
  return createHttp({ fetchImpl: fakeFetch(world, seen), gapMs: 0, retries: 0, githubToken: 'test' })
}

/** A module tarball (`package/` prefix) built byte by byte. */
export function moduleTarball(opts: Parameters<typeof modulePackage>[0], extra: TarEntry[] = []): Uint8Array {
  return makeTarball([...modulePackage(opts), ...extra])
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@e',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@e',
    },
  }).trim()
}

/** A git repo with the real modules/, policy/, .prettierrc.json and CODEOWNERS on `main`, checked out on a PR branch. */
export function catalogRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'om-validate-'))
  for (const p of ['modules', 'policy', '.prettierrc.json', '.prettierignore'])
    cpSync(join(ROOT, p), join(dir, p), { recursive: true })
  mkdirSync(join(dir, '.github'), { recursive: true })
  cpSync(join(ROOT, '.github', 'CODEOWNERS'), join(dir, '.github', 'CODEOWNERS'))
  git(dir, 'init', '--quiet', '-b', 'main')
  git(dir, 'add', '-A')
  git(dir, 'commit', '--quiet', '-m', 'catalog')
  git(dir, 'checkout', '--quiet', '-b', 'pr')
  return dir
}

export function write(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

/**
 * A throwaway copy of the catalog repository whose modules/** holds exactly the 59 starting descriptors as
 * `yarn om seed` writes them (lib/commands/seed.ts), next to the live policy/, quality/ and Prettier config. The golden
 * tests of seed, format and validate run on it instead of the live modules/**, so a new or edited entry, which is
 * what every submission is, never turns `yarn test` red (finding of 25 Oct). The caller removes the directory.
 */
export async function seedTree(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'om-seed-'))
  for (const p of ['policy', 'quality', '.prettierrc.json', '.prettierignore'])
    cpSync(join(ROOT, p), join(dir, p), { recursive: true })
  mkdirSync(join(dir, '.github'), { recursive: true })
  cpSync(join(ROOT, '.github', 'CODEOWNERS'), join(dir, '.github', 'CODEOWNERS'))
  for (const [rel, text] of await renderAll(ROOT)) write(dir, rel, text)
  return dir
}
