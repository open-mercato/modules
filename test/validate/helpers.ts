// Test helpers for lib/validate: a fake npm registry and GitHub API (fetch stub for lib/sources/http.ts), synthetic
// module tarballs, and a throwaway git repository that looks like the catalog repo.
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
