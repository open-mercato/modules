// Template part of `yarn om sync` (docs/specs/2026-10-29-templates.md, Phase 1a step 5): for every entry in
// `templates/`, the repository metadata (`full_name` to see renames, stars, last push, license, archived, the template
// flag, tags), the sha its `ref` resolves to, and the facts of that sha from the static archive check, keyed by sha.
// Writes `sync/templates/<owner>/<repo>.json` and `facts/templates/<owner>/<repo>/<sha>.json` on the data branch. A
// sha whose facts exist is not downloaded again; only the values derived from catalog data are refreshed. A failing
// source keeps the previous value and adds a line to `errors`, as module sync does. Read-only requests through Http.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { LicenseKind } from '../schema/common.ts'
import { Facts, Lines } from '../schema/data/index.ts'
import {
  TemplateFacts,
  TemplateSyncRecord,
  type TemplateFacts as TemplateFactsT,
  type TemplateSyncRecord as TemplateSyncRecordT,
} from '../schema/data/templates.ts'
import { TemplateDescriptor, templatePath, type TemplateDescriptor as TemplateDescriptorT } from '../schema/template.ts'
import { firstAddedAt } from '../sources/entries.ts'
import { repoTags } from '../sources/github.ts'
import { errText, type Http } from '../sources/http.ts'
import { isoSeconds } from '../sources/semver.ts'
import { writeJson } from '../sources/sync.ts'
import { githubArchiveUrl } from '../sources/tarball.ts'
import { fetchTemplateRepo, resolveTemplateRef, type TemplateRepo } from '../validate/template-remote.ts'
import { checkTemplateArchive } from './archive.ts'
import { templateFacts, withDerived, type LicenseKindOf } from './facts.ts'
import { compareVersions } from './lockfile.ts'

export interface TemplateEntry {
  /** Repo-relative file, `templates/<owner>/<repo>.yml`. */
  file: string
  /** Lower-case `owner/repo`, the key of its data files. */
  path: string
  d: TemplateDescriptorT
}

/** Every template entry under `dir` that parses; the others are listed in `errors` (validate reports them). */
export function loadTemplateEntries(dir: string, root: string): { entries: TemplateEntry[]; errors: string[] } {
  const entries: TemplateEntry[] = []
  const errors: string[] = []
  const walk = (d: string): string[] =>
    !existsSync(d)
      ? []
      : readdirSync(d)
          .sort()
          .flatMap((n) => {
            const p = join(d, n)
            return statSync(p).isDirectory() ? walk(p) : n.endsWith('.yml') ? [p] : []
          })
  for (const abs of walk(dir)) {
    const file = relative(root, abs).split(sep).join('/')
    try {
      const d = TemplateDescriptor.parse(parseYaml(readFileSync(abs, 'utf8')))
      entries.push({ file, path: templatePath(d.github), d })
    } catch (err) {
      errors.push(errText(`template ${file}`, err))
    }
  }
  return { entries: entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)), errors }
}

export const templateSyncFile = (dataDir: string, path: string): string =>
  join(dataDir, 'sync', 'templates', `${path}.json`)
export const templateFactsFile = (dataDir: string, path: string, sha: string): string =>
  join(dataDir, 'facts', 'templates', path, `${sha}.json`)

function readParsed<T>(file: string, schema: { safeParse(v: unknown): { success: boolean; data?: T } }): T | null {
  if (!existsSync(file)) return null
  try {
    const r = schema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    return r.success ? (r.data as T) : null
  } catch {
    return null
  }
}

/**
 * The catalog's license kind per npm package and version, from the module facts on the data branch: the kind of that
 * version, else of the newest version the catalog read. Null when the catalog has no facts for the package.
 */
export function catalogLicenseKinds(dataDir: string): LicenseKindOf {
  const kinds = new Map<string, Map<string, LicenseKind>>()
  const root = join(dataDir, 'facts')
  const walk = (d: string): string[] =>
    !existsSync(d)
      ? []
      : readdirSync(d).flatMap((n) => {
          const p = join(d, n)
          return statSync(p).isDirectory() ? (d === root && n === 'templates' ? [] : walk(p)) : [p]
        })
  for (const f of walk(root).filter((x) => x.endsWith('.json'))) {
    const doc = readParsed(f, Facts)
    if (!doc || !doc.package.locator.startsWith('npm:')) continue
    const byVersion = kinds.get(doc.package.name) ?? new Map<string, LicenseKind>()
    byVersion.set(doc.package.version, doc.license.kind)
    kinds.set(doc.package.name, byVersion)
  }
  return (name, version) => {
    const byVersion = kinds.get(name)
    if (!byVersion) return null
    if (version !== null && byVersion.has(version)) return byVersion.get(version) ?? null
    const newest = [...byVersion.keys()].sort(compareVersions).at(-1)
    return newest === undefined ? null : (byVersion.get(newest) ?? null)
  }
}

/** `coreLatest` of data/lines.json, null before the first watch. */
export function latestStableOf(dataDir: string): string | null {
  return readParsed(join(dataDir, 'lines.json'), Lines)?.coreLatest ?? null
}

export interface TemplateAttention {
  github: string
  kind: 'gone' | 'private' | 'archived' | 'renamed' | 'ref' | 'invalid-entry'
  text: string
}

export interface TemplateSyncOptions {
  http: Http
  /** Repo root, for `firstSeenAt` from git history. */
  root: string
  /** The `templates/` folder. */
  templatesDir: string
  dataDir: string
  outDir: string
  now: Date
  /** Lower-case `owner/repo` to sync; null = every entry. */
  only: Set<string> | null
  log?: (line: string) => void
}

export interface TemplateSyncResult {
  records: TemplateSyncRecordT[]
  /** Facts files written this run (new shas and refreshed derived values). */
  facts: TemplateFactsT[]
  attention: TemplateAttention[]
  errors: string[]
}

function repoRecord(
  meta: TemplateRepo,
  tags: { name: string; sha: string }[],
): NonNullable<TemplateSyncRecordT['repo']> {
  return {
    fullName: meta.fullName,
    private: meta.private,
    archived: meta.archived,
    isTemplate: meta.isTemplate,
    defaultBranch: meta.defaultBranch.slice(0, 250),
    pushedAt: isoSeconds(meta.pushedAt ?? undefined),
    stars: meta.stars,
    license: meta.license,
    topics: meta.topics.slice(0, 20).map((t) => t.slice(0, 50)),
    tags: tags.filter((t) => /^[0-9a-f]{40}$/.test(t.sha)).slice(0, 30),
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Syncs the template entries into the data checkout. Never throws for a source failure. */
export async function runTemplateSync(o: TemplateSyncOptions): Promise<TemplateSyncResult> {
  const log = o.log ?? (() => {})
  const nowIso = isoSeconds(o.now) as string
  const { entries: all, errors: loadErrors } = loadTemplateEntries(o.templatesDir, o.root)
  const selected = all.filter((e) => !o.only || o.only.has(e.path))
  const attention: TemplateAttention[] = loadErrors.map((e) => ({ github: '', kind: 'invalid-entry', text: e }))
  const globalErrors = [...loadErrors]
  for (const name of o.only ?? [])
    if (!all.some((e) => e.path === name)) globalErrors.push(`template ${name}: no entry templates/${name}.yml`)
  log(`sync: ${selected.length} of ${all.length} templates`)
  const kindOf = catalogLicenseKinds(o.dataDir)
  const latestStable = latestStableOf(o.dataDir)
  const records: TemplateSyncRecordT[] = []
  const written: TemplateFactsT[] = []

  for (const e of selected) {
    const repo = e.d.github
    const prev = readParsed(templateSyncFile(o.dataDir, e.path), TemplateSyncRecord)
    const errors: string[] = []
    let repoRec: TemplateSyncRecordT['repo'] = prev?.repo ?? null
    let source: TemplateSyncRecordT['source'] = prev?.source ?? null
    let meta: TemplateRepo | null = null
    let reachable = true
    try {
      meta = await fetchTemplateRepo(o.http, repo)
    } catch (err) {
      errors.push(errText('github', err))
      reachable = false
    }
    if (reachable && meta === null) {
      repoRec = null
      errors.push(`github: ${repo} returns 404 (${nowIso.slice(0, 10)})`)
      attention.push({ github: repo, kind: 'gone', text: `Repository ${repo} does not exist or is not visible.` })
    }
    if (meta) {
      let tags = prev?.repo?.tags ?? []
      let tagsRead = false
      if (!meta.private)
        try {
          tags = await repoTags(o.http, repo)
          tagsRead = true
        } catch (err) {
          errors.push(errText('github tags', err))
        }
      repoRec = repoRecord(meta, tags)
      if (meta.private)
        attention.push({ github: repo, kind: 'private', text: `Repository ${repo} is private; it is not listed.` })
      if (meta.archived) attention.push({ github: repo, kind: 'archived', text: `Repository ${repo} is archived.` })
      if (meta.fullName.toLowerCase() !== repo.toLowerCase())
        attention.push({
          github: repo,
          kind: 'renamed',
          text: `GitHub serves ${repo} as ${meta.fullName}; move the entry to the new path.`,
        })
      // a delisted entry is not read further, as in validate; a private repository is never listed
      if (!meta.private && e.d.status !== 'delisted') {
        try {
          const r = await resolveTemplateRef(o.http, repo, meta, e.d.ref, tagsRead ? { tags } : undefined)
          if ('finding' in r) {
            errors.push(`ref: ${r.finding.message}`)
            attention.push({ github: repo, kind: 'ref', text: r.finding.message.slice(0, 200) })
          } else source = { ref: r.ref.name.slice(0, 250), kind: r.ref.kind, sha: r.ref.sha, syncedAt: nowIso }
        } catch (err) {
          errors.push(errText('github ref', err))
        }
      }
    }

    // facts of the current sha: read once per sha, derived values refreshed every run
    if (source && repoRec && !repoRec.private && e.d.status !== 'delisted') {
      const file = templateFactsFile(o.dataDir, e.path, source.sha)
      const stored = readParsed(file, TemplateFacts)
      if (stored) {
        const fresh = withDerived(stored, latestStable, kindOf)
        if (!same(fresh, stored)) {
          writeJson(file, TemplateFacts.parse(fresh))
          written.push(fresh)
        }
      } else {
        try {
          const bytes = await o.http.bytes(githubArchiveUrl(repo, source.sha))
          const archive = await checkTemplateArchive(bytes)
          const facts = TemplateFacts.parse(
            templateFacts({
              github: repo,
              sha: source.sha,
              readAt: nowIso,
              archive,
              githubLicense: repoRec.license,
              latestStable,
              kindOf,
            }),
          )
          writeJson(file, facts)
          written.push(facts)
        } catch (err) {
          errors.push(errText('archive', err))
        }
      }
    }

    const record = TemplateSyncRecord.parse({
      github: repo,
      checkedAt: nowIso,
      firstSeenAt: prev?.firstSeenAt ?? firstAddedAt(o.root, e.file) ?? nowIso,
      repo: repoRec,
      source,
      errors: [...new Set(errors)].map((x) => x.slice(0, 300)).slice(0, 20),
    })
    records.push(record)
    writeJson(templateSyncFile(o.dataDir, e.path), record)
  }

  writeJson(join(o.outDir, 'template-sync-report.json'), {
    at: nowIso,
    entries: records.length,
    facts: written.map((f) => `${f.github}@${f.sha.slice(0, 12)}`),
    attention,
    errors: globalErrors,
    recordErrors: records.filter((r) => r.errors.length).map((r) => ({ github: r.github, errors: r.errors })),
  })
  return { records, facts: written, attention, errors: globalErrors }
}
