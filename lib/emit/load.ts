// Reads everything the emitter needs from disk (spec 5.4 `emit`): the `data` branch checkout, descriptors,
// policy files and skills. Every data file is validated with its schema; a broken or missing file is a warning,
// never a crash, because `pages.yml` must build on an empty first day and on a partial data branch (spec 5.2).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import { Descriptor } from '../schema/descriptor.ts'
import { assertPathMatches, descriptorLocator } from '../schema/locator.ts'
import { BuiltinCategoriesFile, BuiltinUpcomingFile, CategoriesFile, SiteFile } from '../schema/policy.ts'
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
import { Radar } from '../schema/published/radar.ts'
import { linkNightBaselines } from '../core/lines.ts'
import type { EmitData, LoadedDescriptor, SkillSource } from './types.ts'

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
    out.push({ file: rel, locator, descriptor: parsed.success ? parsed.data : null, issues })
  }
  return out.sort((a, b) => a.locator.localeCompare(b.locator))
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
  for (const f of walk(join(data, 'sync')).filter((x) => x.endsWith('.json'))) {
    const s = r.json(f, SyncRecord)
    if (s) sync.set(s.locator, s)
  }
  const facts = new Map<string, Map<string, Facts>>()
  for (const f of walk(join(data, 'facts')).filter((x) => x.endsWith('.json'))) {
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

  return {
    descriptors: loadDescriptors(o.modules, r),
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
    warnings: [...r.warnings, ...p.warnings.map((w) => `policy/${w}`)],
  }
}
