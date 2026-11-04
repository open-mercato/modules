// Reads everything the emitter needs from disk (spec 5.4 `emit`): the `data` branch checkout, descriptors,
// policy files and skills. Every data file is validated with its schema; a broken or missing file is a warning,
// never a crash, because `pages.yml` must build on an empty first day and on a partial data branch (spec 5.2).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import { Descriptor, SCREENSHOT_MAX_BYTES, isHostedScreenshot } from '../schema/descriptor.ts'
import { assertPathMatches, descriptorLocator } from '../schema/locator.ts'
import {
  BuiltinCategoriesFile,
  BuiltinUpcomingFile,
  CategoriesFile,
  RevocationsFile,
  SiteFile,
} from '../schema/policy.ts'
import {
  BuiltinData,
  Change,
  Claims,
  Facts,
  FitResult,
  Health,
  HiveSlots,
  Lines,
  OfficialCoverageFile,
  Presets,
  Receipt,
  Stats,
  SyncRecord,
} from '../schema/data/index.ts'
import { isTemplateDataPath, TemplateFacts, TemplateSyncRecord } from '../schema/data/templates.ts'
import { Radar } from '../schema/published/radar.ts'
import { TemplateDescriptor, templateFile, templatePath } from '../schema/template.ts'
import { linkNightBaselines } from '../core/lines.ts'
import type { EmitData, LoadedDescriptor, LoadedTemplate, SkillSource } from './types.ts'

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

const relPath = (from: string, p: string): string => relative(from, p).split(sep).join('/')

function issueText(err: z.ZodError): string {
  const i = err.issues[0]
  return i ? `${i.path.join('.') || '(root)'}: ${i.message}` : 'invalid'
}

/** Reader that records warnings with the file path relative to `base`. */
class Reader {
  readonly warnings: string[] = []
  readonly base: string
  constructor(base: string) {
    this.base = base
  }

  json<T extends z.ZodType>(file: string, schema: T): z.output<T> | null {
    if (!existsSync(file)) return null
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      this.warnings.push(`${relPath(this.base, file)}: not JSON (${(err as Error).message}), skipped`)
      return null
    }
    const r = schema.safeParse(raw)
    if (!r.success) {
      this.warnings.push(`${relPath(this.base, file)}: ${issueText(r.error)}, skipped`)
      return null
    }
    return r.data
  }

  jsonl<T extends z.ZodType>(file: string, schema: T): z.output<T>[] {
    if (!existsSync(file)) return []
    const out: z.output<T>[] = []
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.trim() === '') return
        let raw: unknown
        try {
          raw = JSON.parse(line)
        } catch {
          this.warnings.push(`${relPath(this.base, file)}:${i + 1}: not JSON, skipped`)
          return
        }
        const r = schema.safeParse(raw)
        if (r.success) out.push(r.data)
        else this.warnings.push(`${relPath(this.base, file)}:${i + 1}: ${issueText(r.error)}, skipped`)
      })
    return out
  }

  yaml<T extends z.ZodType>(file: string, schema: T): z.output<T> | null {
    if (!existsSync(file)) return null
    try {
      const r = schema.safeParse(parseYaml(readFileSync(file, 'utf8')))
      if (r.success) return r.data
      this.warnings.push(`${relPath(this.base, file)}: ${issueText(r.error)}`)
    } catch (err) {
      this.warnings.push(`${relPath(this.base, file)}: YAML error: ${(err as Error).message}`)
    }
    return null
  }
}

export interface LoadOptions {
  /** Checkout of the `data` branch (may be missing or empty). */
  data: string
  /** Descriptor folder (`modules/`). */
  modules: string
  /** Policy folder (`policy/`). */
  policy: string
  /** Skill sources (`skills/`), each `<name>/SKILL.md`. */
  skills: string
  /** Repo root, for the fallback core version (pinned `@open-mercato/cli`). */
  root: string
  /** OM Quality folder (`quality/`); default `<root>/quality`. */
  quality?: string
  /** Template entries (`templates/`); default `<root>/templates`. */
  templates?: string
}

function loadDescriptors(dir: string, r: Reader): LoadedDescriptor[] {
  const out: LoadedDescriptor[] = []
  const parent = join(dir, '..')
  for (const file of walk(dir).filter((f) => f.endsWith('.yml'))) {
    const rel = relPath(parent, file)
    let raw: unknown
    try {
      raw = parseYaml(readFileSync(file, 'utf8'))
    } catch (err) {
      r.warnings.push(`${rel}: YAML error: ${(err as Error).message}, skipped`)
      continue
    }
    let locator: string
    try {
      locator = descriptorLocator((raw ?? {}) as { npm?: string; github?: string })
    } catch (err) {
      r.warnings.push(`${rel}: ${(err as Error).message}, skipped`)
      continue
    }
    const parsed = Descriptor.safeParse(raw)
    const issues = parsed.success ? [] : parsed.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`)
    try {
      assertPathMatches(rel, (raw ?? {}) as { npm?: string; github?: string })
    } catch (err) {
      issues.push((err as Error).message)
    }
    const shots = parsed.success ? hostedScreenshots(file, rel, parsed.data, r) : null
    out.push({
      file: rel,
      locator,
      descriptor: parsed.success ? parsed.data : null,
      issues,
      ...(shots ? { screenshotFiles: shots } : {}),
    })
  }
  return out.sort((a, b) => a.locator.localeCompare(b.locator))
}

/**
 * Bytes of the screenshots a descriptor hosts in the catalog (`screenshots/<name>` next to the file), by src. A missing
 * file or one over the size limit is a warning and is left out (validate fails such a pull request). Null: none hosted.
 */
function hostedScreenshots(
  file: string,
  rel: string,
  d: Pick<Descriptor, 'screenshots'>,
  r: Reader,
): Map<string, Uint8Array> | null {
  const hosted = (d.screenshots ?? []).filter((s) => isHostedScreenshot(s.src))
  if (hosted.length === 0) return null
  const out = new Map<string, Uint8Array>()
  for (const s of hosted) {
    const abs = join(dirname(file), s.src)
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      r.warnings.push(`${rel}: screenshot ${s.src} does not exist, left out`)
      continue
    }
    const bytes = readFileSync(abs)
    if (bytes.byteLength > SCREENSHOT_MAX_BYTES) {
      r.warnings.push(`${rel}: screenshot ${s.src} is over ${SCREENSHOT_MAX_BYTES / 1024} KB, left out`)
      continue
    }
    out.set(s.src, bytes)
  }
  return out
}

/**
 * Template entries (`templates/<owner>/<repo>.yml`, docs/specs/2026-10-29-templates.md). An entry that does not parse,
 * or whose file is not at the path of its `github`, keeps its issues and is left out of the published files.
 */
function loadTemplates(dir: string, r: Reader): LoadedTemplate[] {
  const out: LoadedTemplate[] = []
  const parent = join(dir, '..')
  for (const file of walk(dir).filter((f) => f.endsWith('.yml'))) {
    const rel = relPath(parent, file)
    let raw: unknown
    try {
      raw = parseYaml(readFileSync(file, 'utf8'))
    } catch (err) {
      r.warnings.push(`${rel}: YAML error: ${(err as Error).message}, skipped`)
      continue
    }
    const parsed = TemplateDescriptor.safeParse(raw)
    const issues = parsed.success ? [] : parsed.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`)
    let path = rel.replace(/^templates\//, '').replace(/\.yml$/, '')
    if (parsed.success) {
      path = templatePath(parsed.data.github)
      if (templateFile(parsed.data.github) !== rel) issues.push(`file must be ${templateFile(parsed.data.github)}`)
    }
    const shots = parsed.success && issues.length === 0 ? hostedScreenshots(file, rel, parsed.data, r) : null
    out.push({
      file: rel,
      path,
      descriptor: parsed.success && issues.length === 0 ? parsed.data : null,
      issues,
      ...(shots ? { screenshotFiles: shots } : {}),
    })
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

function loadSkills(dir: string): SkillSource[] {
  if (!existsSync(dir)) return []
  const out: SkillSource[] = []
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name, 'SKILL.md')
    if (existsSync(file)) out.push({ dir: name, content: readFileSync(file) })
  }
  return out
}

function pinnedCliVersion(root: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const v = pkg.dependencies?.['@open-mercato/cli'] ?? null
    return v && /^\d+\.\d+\.\d+$/.test(v) ? v : null
  } catch {
    return null
  }
}

/** Loads the inputs of `emit`. Never throws for data problems: they end up in `warnings`. */
export function loadEmitData(o: LoadOptions): EmitData {
  const r = new Reader(o.data)
  const p = new Reader(o.policy)
  const data = o.data

  const lines = r.json(join(data, 'lines.json'), Lines)
  const sync = new Map<string, SyncRecord>()
  // templates have their own files under sync/templates and facts/templates (loadTemplateData)
  const moduleFile = (f: string): boolean => f.endsWith('.json') && !isTemplateDataPath(relPath(data, f))
  for (const f of walk(join(data, 'sync')).filter(moduleFile)) {
    const s = r.json(f, SyncRecord)
    if (s) sync.set(s.locator, s)
  }
  const facts = new Map<string, Map<string, Facts>>()
  for (const f of walk(join(data, 'facts')).filter(moduleFile)) {
    const doc = r.json(f, Facts)
    if (!doc) continue
    const byVersion = facts.get(doc.package.locator) ?? new Map<string, Facts>()
    byVersion.set(doc.package.version, doc)
    facts.set(doc.package.locator, byVersion)
  }
  const fit = new Map<string, FitResult>()
  for (const f of walk(join(data, 'fit')).filter((x) => x.endsWith('.json'))) {
    const doc = r.json(f, FitResult)
    if (doc) fit.set(doc.om, doc)
  }
  const receipts = new Map<string, Receipt[]>()
  let baseline: Receipt[] = []
  for (const f of walk(join(data, 'receipts')).filter((x) => x.endsWith('.jsonl'))) {
    const list = r.jsonl(f, Receipt)
    if (relPath(data, f) === 'receipts/_baseline.jsonl') {
      baseline = list
      continue
    }
    for (const rc of list) {
      if (!rc.module) continue
      const loc = rc.module.locator
      receipts.set(loc, [...(receipts.get(loc) ?? []), rc])
    }
  }
  // a module run collected before its baseline run of the same night (review r3): the same links as `om health`
  for (const [loc, list] of receipts) receipts.set(loc, linkNightBaselines(list, baseline))
  const health = new Map<string, Health>()
  for (const f of walk(join(data, 'health')).filter((x) => x.endsWith('.json'))) {
    const h = r.json(f, Health)
    if (h) health.set(h.locator, h)
  }
  // templates: one sync record per entry, facts per sha
  const templateSync = new Map<string, TemplateSyncRecord>()
  const templateFacts = new Map<string, Map<string, TemplateFacts>>()
  for (const f of walk(join(data, 'sync', 'templates')).filter((x) => isTemplateDataPath(relPath(data, x)))) {
    const s = r.json(f, TemplateSyncRecord)
    if (s) templateSync.set(templatePath(s.github), s)
  }
  for (const f of walk(join(data, 'facts', 'templates')).filter((x) => isTemplateDataPath(relPath(data, x)))) {
    const doc = r.json(f, TemplateFacts)
    if (!doc) continue
    const key = templatePath(doc.github)
    const bySha = templateFacts.get(key) ?? new Map<string, TemplateFacts>()
    bySha.set(doc.sha, doc)
    templateFacts.set(key, bySha)
  }
  const changes: Change[] = []
  for (const f of walk(join(data, 'changes')).filter((x) => x.endsWith('.jsonl'))) changes.push(...r.jsonl(f, Change))

  let builtin: BuiltinData | null = null
  const builtinDir = join(data, 'builtin')
  if (lines && existsSync(join(builtinDir, `${lines.coreLatest}.json`)))
    builtin = r.json(join(builtinDir, `${lines.coreLatest}.json`), BuiltinData)
  if (!builtin && existsSync(builtinDir)) {
    const versions = readdirSync(builtinDir)
      .filter((n) => /^\d+\.\d+\.\d+\.json$/.test(n))
      .map((n) => n.slice(0, -5))
      .sort((a, b) => {
        const pa = a.split('.').map(Number)
        const pb = b.split('.').map(Number)
        for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
        return 0
      })
    const last = versions.at(-1)
    if (last) {
      builtin = r.json(join(builtinDir, `${last}.json`), BuiltinData)
      if (lines) r.warnings.push(`builtin/${lines.coreLatest}.json is missing; built-in modules come from ${last}`)
    }
  }

  const categories = p.yaml(join(o.policy, 'categories.yml'), CategoriesFile)
  if (!categories) p.warnings.push('categories.yml is missing or invalid')
  const builtinCategories = p.yaml(join(o.policy, 'builtin-categories.yml'), BuiltinCategoriesFile)
  const upcomingFile = join(o.policy, 'builtin-upcoming.yml')
  const builtinUpcoming = existsSync(upcomingFile) ? Object.keys(p.yaml(upcomingFile, BuiltinUpcomingFile) ?? {}) : []
  const site = p.yaml(join(o.policy, 'site.yml'), SiteFile)
  const qualityDir = o.quality ?? join(o.root, 'quality')
  const q = new Reader(qualityDir)
  const revocations = q.yaml(join(qualityDir, 'revocations.yml'), RevocationsFile) ?? []

  return {
    descriptors: loadDescriptors(o.modules, r),
    templates: loadTemplates(o.templates ?? join(o.root, 'templates'), r),
    templateSync,
    templateFacts,
    lines,
    presets: r.json(join(data, 'presets.json'), Presets),
    claims: r.json(join(data, 'claims.json'), Claims) ?? {},
    stats: r.json(join(data, 'stats.json'), Stats),
    coverage: r.json(join(data, 'official-coverage.json'), OfficialCoverageFile),
    hive: r.json(join(data, 'hive.json'), HiveSlots),
    radar: r.json(join(data, 'radar', 'next.json'), Radar),
    builtin,
    sync,
    facts,
    fit,
    receipts,
    baseline,
    health,
    changes,
    categories: categories?.categories ?? [],
    builtinCategories,
    builtinUpcoming,
    cliSearchSince: site?.cliSearchSince ?? null,
    skills: loadSkills(o.skills),
    pinnedCoreVersion: pinnedCliVersion(o.root),
    revocations,
    warnings: [...r.warnings, ...p.warnings.map((w) => `policy/${w}`), ...q.warnings.map((w) => `quality/${w}`)],
  }
}
