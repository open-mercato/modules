// Inputs of sync, watch and discover: descriptors in modules/**, policy files, existing records on the data branch.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse } from 'yaml'
import {
  CommunityFile,
  Descriptor,
  descriptorLocator,
  IgnoreFile,
  locatorToPath,
  OfficialMaintainersFile,
  SyncRecord,
  type CommunityFile as CommunityFileT,
  type IgnoreFile as IgnoreFileT,
  type OfficialMaintainersFile as OfficialMaintainersFileT,
} from '../schema/index.ts'
import type { z } from 'zod'
import { parseRepoUrl } from './github.ts'
import { isoSeconds } from './semver.ts'

export type DescriptorT = z.output<typeof Descriptor>

export interface Entry {
  locator: string
  path: string
  file: string
  d: DescriptorT
  /** `owner/repo` of the descriptor (`github`, else the `repo` field of a monorepo entry), when given. */
  declaredRepo: string | null
}

export interface LoadError {
  file: string
  message: string
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : n.endsWith('.yml') ? [p] : []
  })
}

/** Descriptors under `modulesDir`; invalid files are reported, not thrown (validation is WP10's `validate`). */
export function loadEntries(modulesDir: string): { entries: Entry[]; errors: LoadError[] } {
  const entries: Entry[] = []
  const errors: LoadError[] = []
  for (const file of walk(modulesDir).sort()) {
    const rel = relative(modulesDir, file).split(sep).join('/')
    try {
      const d = Descriptor.parse(parse(readFileSync(file, 'utf8')))
      const locator = descriptorLocator(d)
      const path = locatorToPath(locator)
      if (`${path}.yml` !== rel) throw new Error(`path ${rel} does not match locator ${locator}`)
      const declaredRepo = d.github ?? (d.repo ? (parseRepoUrl(d.repo.split('#')[0]) ?? null) : null)
      entries.push({ locator, path, file, d, declaredRepo })
    } catch (err) {
      errors.push({ file: rel, message: (err as Error).message.split('\n')[0] ?? 'invalid' })
    }
  }
  return { entries, errors }
}

export interface Policies {
  community: CommunityFileT
  officialMaintainers: OfficialMaintainersFileT
  ignore: IgnoreFileT
  builtinCategories: Record<string, string>
}

function readYaml(file: string): unknown {
  return existsSync(file) ? parse(readFileSync(file, 'utf8')) : undefined
}

export function loadPolicies(policyDir: string): Policies {
  const community = CommunityFile.parse(readYaml(join(policyDir, 'community.yml')) ?? {})
  const officialMaintainers = OfficialMaintainersFile.parse(readYaml(join(policyDir, 'official-maintainers.yml')))
  const ignore = IgnoreFile.parse(readYaml(join(policyDir, 'ignore.yml')) ?? [])
  const bc = readYaml(join(policyDir, 'builtin-categories.yml'))
  const builtinCategories = bc && typeof bc === 'object' ? (bc as Record<string, string>) : {}
  return { community, officialMaintainers, ignore, builtinCategories }
}

/** True when a locator (or an npm name as `npm:<name>`) is in policy/ignore.yml; `*` suffix = prefix match. */
export function isIgnored(ignore: IgnoreFileT, locator: string): boolean {
  const lc = locator.toLowerCase()
  return ignore.some((i) => {
    const pat = i.locator.toLowerCase()
    return pat.endsWith('*') ? lc.startsWith(pat.slice(0, -1)) : lc === pat
  })
}

export function readSyncRecord(dataDir: string, path: string): SyncRecord | null {
  const file = join(dataDir, 'sync', `${path}.json`)
  if (!existsSync(file)) return null
  const r = SyncRecord.safeParse(JSON.parse(readFileSync(file, 'utf8')))
  return r.success ? r.data : null
}

/** All valid sync records on the data branch, by locator. */
export function readAllSyncRecords(dataDir: string): Map<string, SyncRecord> {
  const out = new Map<string, SyncRecord>()
  const base = join(dataDir, 'sync')
  for (const f of walkJson(base)) {
    try {
      const r = SyncRecord.safeParse(JSON.parse(readFileSync(f, 'utf8')))
      if (r.success) out.set(r.data.locator, r.data)
    } catch {
      // unreadable record: sync rewrites it
    }
  }
  return out
}

function walkJson(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walkJson(p) : n.endsWith('.json') ? [p] : []
  })
}

/**
 * First commit that added a descriptor (`git log --diff-filter=A --format=%aI -- <file>`, oldest wins), as an
 * ISO date-time in UTC. Null outside a git checkout or for an uncommitted file. Needs full history (`fetch-depth: 0`).
 */
export function firstAddedAt(repoRoot: string, file: string): string | null {
  try {
    const out = execFileSync(
      'git',
      ['-C', repoRoot, 'log', '--diff-filter=A', '--follow', '--format=%aI', '--', file],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim()
    const last = out.split('\n').filter(Boolean).at(-1)
    return last ? isoSeconds(last) : null
  } catch {
    return null
  }
}

/** Commits (newest first) that touched a file on the current branch. */
export function commitsTouching(repoRoot: string, file: string, max = 20): { sha: string; at: string }[] {
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'log', `-n${max}`, '--format=%H %aI', '--', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [sha, at] = l.split(' ') as [string, string]
        return { sha, at: isoSeconds(at) ?? at }
      })
  } catch {
    return []
  }
}

/** Descriptor files changed since a git ref (`--changed=<ref>`), repo-relative. */
export function changedDescriptorFiles(repoRoot: string, ref: string): string[] {
  const out = execFileSync('git', ['-C', repoRoot, 'diff', '--name-only', `${ref}...HEAD`, '--', 'modules/'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return out.split('\n').filter((l) => l.endsWith('.yml'))
}

/** Curators: owners of `/modules/` in .github/CODEOWNERS (lower case, without `@`). Their PRs never claim. */
export function curatorsFrom(repoRoot: string): string[] {
  const file = join(repoRoot, '.github', 'CODEOWNERS')
  if (!existsSync(file)) return []
  const out = new Set<string>()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.replace(/#.*$/, '').trim()
    if (!t) continue
    const [pattern, ...owners] = t.split(/\s+/)
    if (pattern === '*' || pattern === '/modules/' || pattern === 'modules/' || pattern === '/modules/**')
      for (const o of owners) if (o.startsWith('@') && !o.includes('/')) out.add(o.slice(1).toLowerCase())
  }
  return [...out].sort()
}
