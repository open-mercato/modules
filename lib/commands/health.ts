// `yarn om health [--all | --changed] [--modules <dir>] [--now <iso>]` (spec 5.4).
// Reads descriptors, sync, facts, fit, receipts, lines and claims; writes .data/health/<locpath>.json and appends
// tier and state changes to .data/changes/<yyyy-mm>.jsonl. --changed rewrites only files whose content changed.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { CommandContext } from '../cli.ts'
import { evaluateEntry, judgedFacts, presetBackendRoutes, type HealthInput } from '../core/health.ts'
import { linkNightBaselines } from '../core/lines.ts'
import { Descriptor } from '../schema/descriptor.ts'
import { assertPathMatches, descriptorLocator, locatorToPath } from '../schema/locator.ts'
import { QualityReview, RevocationsFile } from '../schema/policy.ts'
import {
  BuiltinData,
  Change,
  Claims,
  Facts,
  FitResult,
  Health,
  Lines,
  Presets,
  Receipt,
  SyncRecord,
  type FitCell,
} from '../schema/data/index.ts'
import { migrateData, migrationLine, presetModelPending } from '../receipts/preset-model.ts'

export const description = 'identity, signals, tier and agent policy; .data/health'

interface Options {
  mode: 'all' | 'changed'
  modules: string
  quality: string
  now: string
}

function parseArgs(args: string[], root: string): Options | string {
  const o: Options = {
    mode: 'all',
    modules: join(root, 'modules'),
    quality: join(root, 'quality'),
    now: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const [key, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined]
    const value = () => inline ?? args[++i]
    if (key === '--all') o.mode = 'all'
    else if (key === '--changed') o.mode = 'changed'
    else if (key === '--modules' || key === '--quality' || key === '--now') {
      const v = value()
      if (!v) return `${key} needs a value`
      if (key === '--modules') o.modules = resolve(v)
      else if (key === '--quality') o.quality = resolve(v)
      else {
        if (Number.isNaN(Date.parse(v))) return `--now: not a date: ${v}`
        o.now = new Date(v).toISOString().replace(/\.\d{3}Z$/, 'Z')
      }
    } else return `unknown argument: ${a}`
  }
  return o
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function readJson<T>(file: string, schema: { parse: (x: unknown) => T }): T | null {
  if (!existsSync(file)) return null
  return schema.parse(JSON.parse(readFileSync(file, 'utf8')))
}

function readJsonl<T>(file: string, schema: { parse: (x: unknown) => T }): T[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => schema.parse(JSON.parse(l)))
}

const stable = (h: Health) => JSON.stringify({ ...h, computedAt: '' })

export default function health(ctx: CommandContext): number {
  const opts = parseArgs(ctx.args, ctx.root)
  if (typeof opts === 'string') {
    console.error(`om health: ${opts}`)
    return 2
  }
  const data = resolve(ctx.flags.data)
  const lines = readJson(join(data, 'lines.json'), Lines)
  if (!lines) {
    console.error(`om health: ${join(data, 'lines.json')} not found (run yarn om watch first).`)
    return 2
  }
  const claims = readJson(join(data, 'claims.json'), Claims) ?? {}
  const baselines = readJsonl(join(data, 'receipts', '_baseline.jsonl'), Receipt)
  // a module a new app already registers is judged by the baseline row on that line (review r8, D10)
  const presets = readJson(join(data, 'presets.json'), Presets)
  const fitByVersion = new Map<string, FitResult | null>()
  const fitFor = (omVersion: string) => {
    if (!fitByVersion.has(omVersion))
      fitByVersion.set(omVersion, readJson(join(data, 'fit', `${omVersion}.json`), FitResult))
    return fitByVersion.get(omVersion) ?? null
  }
  // the backend routes of a new app's modules (round 14, lint `backend-route-collision`), as the emitter reads them
  const builtin = readJson(join(data, 'builtin', `${lines.coreLatest}.json`), BuiltinData)
  const factsCache = new Map<string, Facts | null>()
  const factsAt = (locator: string, version: string): Facts | null => {
    const key = `${locator}@${version}`
    if (!factsCache.has(key))
      factsCache.set(key, readJson(join(data, 'facts', locatorToPath(locator), `${version}.json`), Facts))
    return factsCache.get(key) ?? null
  }
  const backendRoutesOf = presetBackendRoutes(builtin, (npm, v) => factsAt(`npm:${npm}`, v))
  const revocationsFile = join(opts.quality, 'revocations.yml')
  const revocations = existsSync(revocationsFile)
    ? (RevocationsFile.parse(parseYaml(readFileSync(revocationsFile, 'utf8')) ?? []) ?? [])
    : []

  const files = walk(opts.modules).filter((f) => f.endsWith('.yml'))
  if (files.length === 0) console.error(`om health: no descriptors in ${opts.modules}.`)
  const summary: { locator: string; tier: string | null; state: string; written: boolean }[] = []
  const changes: Change[] = []
  let failures = 0

  for (const file of files.sort()) {
    const relFile = relative(dirname(opts.modules), file).split(sep).join('/')
    let raw: unknown
    try {
      raw = parseYaml(readFileSync(file, 'utf8'))
    } catch (err) {
      console.error(`om health: ${relFile}: YAML error: ${(err as Error).message}`)
      failures++
      continue
    }
    let locator: string
    try {
      locator = descriptorLocator((raw ?? {}) as { npm?: string; github?: string })
    } catch (err) {
      console.error(`om health: ${relFile}: ${(err as Error).message}`)
      failures++
      continue
    }
    const parsed = Descriptor.safeParse(raw)
    const issues = parsed.success ? [] : parsed.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`)
    try {
      assertPathMatches(relFile, (raw ?? {}) as { npm?: string; github?: string })
    } catch (err) {
      issues.push((err as Error).message)
    }

    const path = locatorToPath(locator)
    const sync = readJson(join(data, 'sync', `${path}.json`), SyncRecord)
    const n = sync?.npm
    // a module run collected before its baseline run of the same night keeps `baseline: null` (review r3)
    const receipts = linkNightBaselines(readJsonl(join(data, 'receipts', `${path}.jsonl`), Receipt), baselines)
    // Fit of any version on a line: each line is judged on its own install version (E5)
    const fitOf = (v: string, lineKey: string): FitCell | null => {
      const l = lines.lines.find((x) => x.key === lineKey)
      return l ? (fitFor(l.version)?.cells[`${locator}@${v}`] ?? null) : null
    }
    // facts and Fit of the version a fresh app installs (D46), not of a release still in the age gate
    const judged = judgedFacts({ locator, sync, receipts, lines: lines.lines, now: opts.now, fitOf, presets }, (v) =>
      readJson(join(data, 'facts', path, `${v}.json`), Facts),
    )
    const version = judged.version
    const facts = judged.facts
    const fit: Record<string, FitCell | null> = {}
    for (const l of lines.lines)
      fit[l.key] = version ? (fitFor(l.version)?.cells[`${locator}@${version}`] ?? null) : null

    let quality: Health['quality'] = null
    const reviewFile = version ? join(opts.quality, 'reviews', path, `${version}.yml`) : null
    if (reviewFile && existsSync(reviewFile)) {
      const r = QualityReview.parse(parseYaml(readFileSync(reviewFile, 'utf8')))
      const revoked = revocations.some((x) => x.locator === locator && x.version === r.version)
      // integrity of the judged version: its facts, or the packument when it is the latest stable
      const integrity = facts?.package.integrity ?? (version === n?.latestStable ? n.integrity : null)
      if (!revoked && r.integrity === (integrity ?? r.integrity) && r.until >= opts.now.slice(0, 10))
        quality = {
          version: r.version,
          integrity: r.integrity,
          reviewedAt: r.reviewedAt,
          until: r.until,
          report: r.reportUrl,
          reviewers: r.reviewers,
        }
    }

    const input: HealthInput = {
      locator,
      descriptor: parsed.success ? parsed.data : null,
      descriptorIssues: issues,
      sync,
      facts,
      fit,
      fitOf,
      receipts,
      lines: lines.lines,
      claims,
      quality,
      presets,
      // the route of an old smoke excerpt (isolation findings), from the facts of the receipt's version, as in emit
      routesOf: (v) => factsAt(locator, v)?.modules.flatMap((m) => m.http.routes),
      backendRoutesOf,
      now: opts.now,
    }
    const ev = evaluateEntry(input)
    // OM Quality needs Verified (spec 6.3); a lost level drops the seal
    const h = Health.parse({ ...ev.health, quality: ev.health.tier === 'verified' ? ev.health.quality : null })

    const out = join(data, 'health', `${path}.json`)
    const prev = readJson(out, Health)
    const text = `${JSON.stringify(h, null, 2)}\n`
    const write = opts.mode === 'all' || !prev || stable(prev) !== stable(h)
    if (write) {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, text)
    }
    // a file computed before 24 Oct judged the receipts of the empty preset: a change against it is the change of the
    // test model, kept in the data with its reason and left out of the feed (review of 24 Oct)
    const model = prev && prev.verdictPreset !== h.verdictPreset ? { reason: 'preset-model' as const } : {}
    if (prev && prev.tier !== h.tier)
      changes.push(
        Change.parse({
          at: opts.now,
          type: 'tier-change',
          locator,
          from: prev.tier ?? 'none',
          to: h.tier ?? 'none',
          ...model,
        }),
      )
    if (prev && prev.state !== h.state)
      changes.push(
        Change.parse({ at: opts.now, type: 'status-change', locator, from: prev.state, to: h.state, ...model }),
      )
    summary.push({ locator, tier: h.tier, state: h.state, written: write })
  }

  if (changes.length > 0) {
    const file = join(data, 'changes', `${opts.now.slice(0, 7)}.jsonl`)
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, changes.map((c) => `${JSON.stringify(c)}\n`).join(''))
  }
  // the one-time migration of 24 Oct, as soon as the data has a receipt of a new app (review of 24 Oct: a manual step
  // after the merge let a first CI night publish the old model's `listed to verified` in /changes.json and /feed.xml)
  if (presetModelPending(data)) {
    const res = migrateData(data, false, opts.now)
    if (res.since) console.error(`health: migration of 24 Oct: ${migrationLine(res)}`)
  }

  if (ctx.flags.json) console.log(JSON.stringify({ computedAt: opts.now, entries: summary, changes }, null, 2))
  else {
    for (const s of summary)
      console.log(`${s.written ? 'wrote' : 'same '}  ${s.locator}  ${s.tier ?? 'no level'}  ${s.state}`)
    console.log(`${summary.length} entries, ${changes.length} changes, ${failures} unreadable descriptors.`)
  }
  return failures > 0 ? 1 : 0
}
