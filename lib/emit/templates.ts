// Template files of the site (docs/specs/2026-10-29-templates.md, API Contracts and Phase 1a step 6): `/templates.json`
// for the CLI, `/t/<owner>/<repo>.json` with the full entry and the facts of its sha, its Markdown twin for agents, the
// hosted screenshots, and the counts the site reads. Pure: load.ts reads the entries and the data branch. Every number
// comes from data (rule 8). Module files are not touched.
import { linesBehind } from '../templates/facts.ts'
import { APP_FROM, builtOn, DEFAULT_FROM } from '../core/template-facts.ts'
import { isHostedScreenshot } from '../schema/descriptor.ts'
import type { TemplateFacts, TemplateSyncRecord } from '../schema/data/templates.ts'
import type {
  TemplateDetail,
  TemplateDetailFacts,
  TemplateIndexEntry,
  TemplateIndexFacts,
  TemplatesIndex,
} from '../schema/published/templates.ts'
import { templatePagePath, type TemplateDescriptor } from '../schema/template.ts'
import { basePrefix } from './screenshots.ts'
import type { EmitData, LoadedTemplate } from './types.ts'

export { builtOn }

/** Counts of `templates.json` for the site (`SiteMeta.templates`): the Phase 0 page stays while `active` is 0. */
export interface TemplateCounts {
  listed: number
  active: number
  hold: number
  unmaintained: number
}

export interface TemplateLinks {
  /** Core module IDs with a `/built-in/<id>` page. */
  builtIn: ReadonlySet<string>
  /** npm package name to the catalog path of its `/m/` page (listed entries only). */
  modules: ReadonlyMap<string, string>
}

export interface TemplateEmit {
  index: TemplatesIndex
  details: { path: string; json: TemplateDetail; md: string }[]
  /** Hosted screenshots: published path and bytes. */
  files: [string, Uint8Array][]
  counts: TemplateCounts
}

interface Listed {
  t: LoadedTemplate
  d: TemplateDescriptor
  sync: TemplateSyncRecord
  repo: NonNullable<TemplateSyncRecord['repo']>
  source: NonNullable<TemplateSyncRecord['source']>
  facts: TemplateFacts | null
}

/**
 * The entries `templates.json` lists: valid, not `delisted`, synced, and on a public repository that GitHub still
 * serves. Every other entry is left out with a warning that says why.
 */
function listedTemplates(data: EmitData, warn: (m: string) => void): Listed[] {
  const out: Listed[] = []
  for (const t of data.templates ?? []) {
    const d = t.descriptor
    if (!d) {
      warn(`${t.file}: ${t.issues[0] ?? 'invalid'}; left out of templates.json`)
      continue
    }
    if (d.status === 'delisted') continue
    const sync = data.templateSync?.get(t.path)
    if (!sync) {
      warn(`${t.file}: not synced yet; left out of templates.json`)
      continue
    }
    if (!sync.repo || sync.repo.private) {
      warn(`${t.file}: the repository is deleted or private; left out of templates.json`)
      continue
    }
    if (!sync.source) {
      warn(`${t.file}: its ref did not resolve at any sync; left out of templates.json`)
      continue
    }
    const facts = data.templateFacts?.get(t.path)?.get(sync.source.sha) ?? null
    if (!facts) warn(`${t.file}: no facts for ${sync.source.sha.slice(0, 12)} yet`)
    const named = d.ref ?? sync.repo.defaultBranch
    if (sync.source.ref !== named)
      warn(`${t.file}: ref ${named} is not synced yet; templates.json keeps ${sync.source.ref} at its last sha`)
    out.push({ t, d, sync, repo: sync.repo, source: sync.source, facts })
  }
  return out
}

/** Curator slugs, with every slug two entries share left out (emit guarantees uniqueness, A6). */
function uniqueSlugs(listed: readonly Listed[], warn: (m: string) => void): Map<string, string | null> {
  const users = new Map<string, string[]>()
  for (const l of listed) if (l.d.slug) users.set(l.d.slug, [...(users.get(l.d.slug) ?? []), l.t.path])
  const out = new Map<string, string | null>()
  for (const l of listed) {
    const s = l.d.slug ?? null
    const clash = s !== null && (users.get(s)?.length ?? 0) > 1
    if (clash) warn(`slug ${s} is used by ${users.get(s)?.join(' and ')}; published without a slug`)
    out.set(l.t.path, clash ? null : s)
  }
  return out
}

/** Lines behind the latest stable line of data/lines.json when there is one, else as sync recorded it. */
function behind(f: TemplateFacts, latest: string | null): { count: number | null; latest: string | null } {
  return latest === null
    ? { count: f.linesBehind, latest: f.latestStable }
    : { count: linesBehind(f.omVersion, latest), latest }
}

/** Env keys a user must fill: the entry's `declares.env` (the source of truth), else the manifest of that sha. */
function envOf(d: TemplateDescriptor, f: TemplateFacts): TemplateIndexFacts['env'] {
  return d.declares?.env ?? f.manifestEnv ?? []
}

function indexFacts(d: TemplateDescriptor, f: TemplateFacts, latest: string | null): TemplateIndexFacts {
  return {
    omLine: f.omLine,
    omVersion: f.omVersion,
    linesBehind: behind(f, latest).count,
    requiresEnterprise: f.requiresEnterprise,
    engines: f.engines ?? {},
    modules: f.modules?.entries ?? [],
    env: envOf(d, f),
  }
}

/** Site path of a module's catalog page, null for the template's own modules and packages the catalog does not list. */
function modulePage(m: { id: string; from: string }, links: TemplateLinks): string | null {
  if (m.from === APP_FROM) return null
  if (m.from === DEFAULT_FROM) return links.builtIn.has(m.id) ? `/built-in/${m.id}` : null
  const path = links.modules.get(m.from)
  return path === undefined ? null : `/m/${path}`
}

function detailFacts(
  d: TemplateDescriptor,
  f: TemplateFacts,
  latest: string | null,
  links: TemplateLinks,
): TemplateDetailFacts {
  const b = behind(f, latest)
  return {
    readAt: f.readAt,
    omLine: f.omLine,
    omVersion: f.omVersion,
    linesBehind: b.count,
    latestStable: b.latest,
    requiresEnterprise: f.requiresEnterprise,
    enterpriseModules: f.enterpriseModules,
    enterpriseDependency: f.enterpriseDependency,
    engines: f.engines ?? {},
    packageManager: f.packageManager,
    modules: f.modules
      ? {
          entries: f.modules.entries.map((m) => ({ ...m, page: modulePage(m, links) })),
          unparsed: f.modules.unparsed,
        }
      : null,
    manifest: f.manifest,
    env: envOf(d, f),
    license: { value: f.license.value, kind: f.license.kind },
    archive: f.archive,
    findings: f.findings,
  }
}

/** Published path of a hosted template screenshot: `shots/templates/<owner>/<name>`. */
export function templateShotPath(path: string, src: string): string {
  return ['shots', 'templates', path.split('/')[0] as string, src.slice(src.lastIndexOf('/') + 1)].join('/')
}

function screenshots(
  l: Listed,
  base: string,
  files: [string, Uint8Array][],
): { src: string; alt: string }[] | undefined {
  const list: { src: string; alt: string }[] = []
  for (const s of l.d.screenshots ?? []) {
    if (!isHostedScreenshot(s.src)) {
      list.push({ src: s.src, alt: s.alt })
      continue
    }
    const bytes = l.t.screenshotFiles?.get(s.src)
    if (!bytes) continue
    const path = templateShotPath(l.t.path, s.src)
    list.push({ src: `${basePrefix(base)}/${path}`, alt: s.alt })
    if (!files.some(([p]) => p === path)) files.push([path, bytes])
  }
  return list.length > 0 ? list : undefined
}

export function buildTemplates(
  data: EmitData,
  opts: { site: string; base: string; now: string },
  links: TemplateLinks,
  warn: (m: string) => void,
): TemplateEmit {
  const listed = listedTemplates(data, warn)
  const slugs = uniqueSlugs(listed, warn)
  const latest = data.lines?.coreLatest ?? null
  const files: [string, Uint8Array][] = []
  const templates: TemplateIndexEntry[] = []
  const details: TemplateEmit['details'] = []
  for (const l of listed) {
    const { d, t, repo, source, facts } = l
    const slug = slugs.get(t.path) ?? null
    const reason = d.status === 'active' ? null : (d.reason ?? null)
    const status = d.status as TemplateIndexEntry['status']
    templates.push({
      slug,
      github: d.github,
      status,
      reason,
      useCase: d.useCase,
      summary: d.summary,
      ref: source.ref,
      archived: repo.archived,
      source: { sha: source.sha, syncedAt: source.syncedAt, facts: facts ? indexFacts(d, facts, latest) : null },
      verified: null,
    })
    const shots = screenshots(l, opts.base, files)
    const { screenshots: _raw, ...fields } = d
    const json: TemplateDetail = {
      schema: 1,
      generatedAt: opts.now,
      path: t.path,
      page: templatePagePath(d.github),
      entry: { ...fields, status, slug, reason, ...(shots ? { screenshots: shots } : {}) },
      repo: {
        fullName: repo.fullName,
        renamed: repo.fullName.toLowerCase() !== d.github.toLowerCase(),
        archived: repo.archived,
        isTemplate: repo.isTemplate,
        defaultBranch: repo.defaultBranch,
        pushedAt: repo.pushedAt,
        stars: repo.stars,
        license: repo.license,
        topics: repo.topics,
        checkedAt: l.sync.checkedAt,
      },
      source: { ...source, facts: facts ? detailFacts(d, facts, latest, links) : null },
      verified: null,
    }
    details.push({ path: t.path, json, md: templateCard(json, opts.site) })
  }
  const count = (s: string) => templates.filter((x) => x.status === s).length
  return {
    index: { schema: 1, generatedAt: opts.now, templates },
    details,
    files,
    counts: {
      listed: templates.length,
      active: count('active'),
      hold: count('hold'),
      unmaintained: count('unmaintained'),
    },
  }
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** The Markdown twin of `/t/<owner>/<repo>.json` for agents. Only validated fields and computed facts. */
export function templateCard(t: TemplateDetail, site: string): string {
  const e = t.entry
  const f = t.source.facts
  const out: string[] = [`# ${e.github}`, '', e.summary, '']
  out.push(`- Use case: ${e.useCase}`)
  out.push(`- Status: ${e.status}${e.reason ? `. Reason: ${e.reason}` : ''}`)
  out.push(e.slug ? `- Slug: \`${e.slug}\`` : `- Slug: none (reachable as \`${e.github}\` only)`)
  const r = t.repo
  if (r) {
    const notes = [
      r.renamed ? `GitHub now serves it as ${r.fullName}` : null,
      r.archived ? 'archived' : null,
      r.isTemplate ? 'GitHub template repository' : null,
    ].filter((x): x is string => x !== null)
    out.push(`- Repository: https://github.com/${e.github}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`)
    out.push(
      `- Stars: ${r.stars}. Last push: ${r.pushedAt ? r.pushedAt.slice(0, 10) : 'unknown'}. GitHub license: ${r.license ?? 'none detected'}`,
    )
  }
  out.push(
    `- Commit: \`${t.source.sha}\` (${t.source.kind} \`${t.source.ref}\`, synced ${t.source.syncedAt.slice(0, 10)})`,
  )
  out.push('- Verification: not verified (the nightly template smoke has not run on this commit)')
  if (f) {
    out.push(`- Built on: ${builtOn(f)}`)
    out.push(
      f.requiresEnterprise
        ? `- Requires an Enterprise license: yes (${f.enterpriseModules.map((m) => `\`${m}\``).join(', ')} registered without a condition)`
        : '- Requires an Enterprise license: no',
    )
    out.push(`- License: ${f.license.value ?? 'none'} (${f.license.kind})`)
    const engines = Object.entries(f.engines).map(([k, v]) => `${k} ${v}`)
    out.push(
      `- Engines: ${engines.length > 0 ? engines.join(', ') : 'none declared'}${f.packageManager ? `. Package manager: ${f.packageManager.replace(/\+.*$/, '')}` : ''}`,
    )
  } else out.push('- Facts: the archive of this commit was not read yet')
  out.push('')
  out.push('## Create an app')
  out.push('')
  if (e.status === 'hold') out.push(`On hold, so there is no create command. Reason: ${e.reason ?? 'none given'}`)
  else out.push(`Planned and not released yet: \`npx create-mercato-app my-app --template ${e.slug ?? e.github}\`.`)
  out.push('')
  out.push('## When to use')
  out.push('')
  out.push(e.whenToUse)
  if (e.whenNotToUse) out.push('', `Not for: ${e.whenNotToUse}`)
  out.push('')
  if (f?.modules) {
    const inv = f.modules
    const own = inv.entries.filter((m) => m.from === APP_FROM).length
    const conditional = inv.entries.filter((m) => m.when !== undefined).length
    out.push('## Modules')
    out.push('')
    out.push(
      `${plural(inv.entries.length, 'module')} in src/modules.ts: ${own} of the template's own, ${conditional} behind a condition.`,
    )
    out.push('')
    for (const m of inv.entries) {
      const from = m.package ?? m.from
      const when = m.when ? ` when \`${m.when}\`` : ''
      const page = m.page ? ` (${site}${m.page})` : ''
      out.push(`- \`${m.id}\` from \`${from}\`${when}${page}`)
    }
    if (inv.unparsed.length > 0) {
      out.push('')
      out.push(`Not read: ${inv.unparsed.map((u) => `line ${u.line} (${u.reason})`).join('; ')}.`)
    }
    out.push('')
  }
  if (f && f.env.length > 0) {
    out.push('## Environment keys to fill')
    out.push('')
    for (const k of f.env)
      out.push(`- \`${k.name}\`${k.description ? `: ${k.description}` : ''}${k.link ? ` (${k.link})` : ''}`)
    out.push('')
  }
  const links = Object.entries(e.links ?? {}).filter((x): x is [string, string] => typeof x[1] === 'string')
  if (links.length > 0) {
    out.push('## Links')
    out.push('')
    for (const [k, v] of links) out.push(`- ${k}: ${v}`)
    out.push('')
  }
  out.push('## Data')
  out.push('')
  out.push(`- This template: ${site}/t/${t.path}.json`)
  out.push(`- All templates: ${site}/templates.json`)
  return `${out.join('\n')}\n`
}
