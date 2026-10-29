// `yarn om plan-matrix [--cells <keys>] [--lines <keys>] [--preset classic|empty] [--event schedule|workflow_dispatch]
//   [--attempt <n>] [--mode realistic|early] [--runner ubuntu-latest|preview-docker] [--budget <min>] [--now <iso>]
//   [--modules <dir>] [--github-output <file>]` (spec 5.3, 5.4). `--preset` plans one starter preset only (default
//   both: classic, the main verdict, then empty, the signal `in isolation`).
// Reads .data (lines, presets, builtin, sync, facts, receipts), descriptors and harness/lines.yml; writes out/matrix.json.
// No foreign code runs here (job `plan`). With `--runner preview-docker` the matrix holds no cell that would run code
// from outside @open-mercato (AGENTS.md rule 4; `cells-local` refuses such a cell too).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK } from '../cli.ts'
import {
  BuiltinData,
  Facts,
  FitResult,
  Lines,
  SyncRecord,
  type Facts as FactsT,
  type FitResult as FitResultT,
} from '../schema/data/index.ts'
import { HarnessLinesFile } from '../schema/policy.ts'
import { loadEntries } from '../sources/entries.ts'
import { harnessHash } from '../receipts/cell-key.ts'
import { readPresets, readReceiptStore } from '../receipts/data.ts'
import { CellMode, Runner, type MatrixCell } from '../receipts/matrix.ts'
import { StarterPreset } from '../schema/common.ts'
import type { PresetId } from '../core/lines.ts'
import { planMatrix, type PlanEntry } from '../receipts/plan.ts'
import { foreignCode } from './cells-local.ts'

export const description = 'cells for the nightly install; out/matrix.json'

interface Options {
  cells: string[]
  lines: string[]
  presets: PresetId[]
  event: 'schedule' | 'workflow_dispatch'
  attempt: number
  mode: 'realistic' | 'early' | null
  runner: 'ubuntu-latest' | 'preview-docker'
  budget: number | null
  now: string
  modules: string
  githubOutput: string | null
}

const list = (v: string) =>
  v
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean)

export function parseArgs(args: string[], root: string): Options | string {
  const o: Options = {
    cells: [],
    lines: [],
    presets: [],
    event: 'schedule',
    attempt: 1,
    mode: null,
    runner: 'ubuntu-latest',
    budget: null,
    now: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    modules: join(root, 'modules'),
    githubOutput: null,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const eq = a.indexOf('=')
    const key = eq > 0 ? a.slice(0, eq) : a
    const value = (): string | undefined => (eq > 0 ? a.slice(eq + 1) : args[++i])
    const v = value()
    if (v === undefined) return `${key} needs a value`
    switch (key) {
      case '--cells':
        o.cells = list(v)
        break
      case '--lines':
        o.lines = list(v)
        break
      case '--preset':
        o.presets = list(v) as PresetId[]
        if (o.presets.some((p) => !StarterPreset.safeParse(p).success)) return '--preset: classic, empty or both'
        break
      case '--event':
        if (v !== 'schedule' && v !== 'workflow_dispatch') return `--event: schedule or workflow_dispatch`
        o.event = v
        break
      case '--attempt':
        o.attempt = Number(v || '1')
        if (!Number.isInteger(o.attempt) || o.attempt < 1) return '--attempt: a positive integer'
        break
      case '--mode':
        if (v === '') o.mode = null
        else if (CellMode.safeParse(v).success) o.mode = v as Options['mode']
        else return '--mode: realistic or early'
        break
      case '--runner':
        if (!Runner.safeParse(v).success) return '--runner: ubuntu-latest or preview-docker'
        o.runner = v as Options['runner']
        break
      case '--budget':
        o.budget = Number(v)
        if (!(o.budget > 0)) return '--budget: minutes'
        break
      case '--now':
        if (Number.isNaN(Date.parse(v))) return `--now: not a date: ${v}`
        o.now = new Date(v).toISOString().replace(/\.\d{3}Z$/, 'Z')
        break
      case '--modules':
        o.modules = resolve(v)
        break
      case '--github-output':
        o.githubOutput = v === '' ? null : resolve(v)
        break
      default:
        return `unknown argument: ${a}`
    }
  }
  return o
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown
}

export default function planMatrixCommand(ctx: CommandContext): number {
  const o = parseArgs(ctx.args, ctx.root)
  if (typeof o === 'string') {
    console.error(`om plan-matrix: ${o}`)
    return EXIT_ENV
  }
  const data = resolve(ctx.flags.data)
  const linesFile = join(data, 'lines.json')
  if (!existsSync(linesFile)) {
    console.error(`om plan-matrix: no ${linesFile}; run yarn om watch first.`)
    return EXIT_ENV
  }
  const lines = Lines.parse(readJson(linesFile))
  const harness = HarnessLinesFile.parse(parseYaml(readFileSync(join(ctx.root, 'harness', 'lines.yml'), 'utf8')))
  const builtinFile = join(data, 'builtin', `${lines.coreLatest}.json`)
  const builtinIds = new Set(
    existsSync(builtinFile) ? BuiltinData.parse(readJson(builtinFile)).modules.map((m) => m.id) : [],
  )
  if (builtinIds.size === 0) console.error(`om plan-matrix: no ${builtinFile}; core requires stay unresolved.`)
  const store = readReceiptStore(data)
  const { entries, errors } = loadEntries(o.modules)
  for (const e of errors) console.error(`om plan-matrix: skipped ${e.file}: ${e.message}`)
  const factsCache = new Map<string, FactsT | null>()
  // Fit per line version (data/fit/<om>.json): a line installs the newest stable version that fits it (E5)
  const fitCache = new Map<string, FitResultT | null>()
  const fitOn = (omVersion: string): FitResultT | null => {
    if (!fitCache.has(omVersion)) {
      const f = join(data, 'fit', `${omVersion}.json`)
      fitCache.set(omVersion, existsSync(f) ? FitResult.parse(readJson(f)) : null)
    }
    return fitCache.get(omVersion) ?? null
  }
  const planEntries: PlanEntry[] = entries.map((e) => {
    const syncFile = join(data, 'sync', `${e.path}.json`)
    return {
      locator: e.locator,
      d: e.d,
      sync: existsSync(syncFile) ? SyncRecord.parse(readJson(syncFile)) : null,
      facts: (version: string) => {
        const f = join(data, 'facts', e.path, `${version}.json`)
        if (!factsCache.has(f)) factsCache.set(f, existsSync(f) ? Facts.parse(readJson(f)) : null)
        return factsCache.get(f) ?? null
      },
      receipts: store.history(e.locator),
      fit: (version: string, lineKey: string) => {
        const l = lines.lines.find((x) => x.key === lineKey)
        return l ? (fitOn(l.version)?.cells[`${e.locator}@${version}`] ?? null) : null
      },
    }
  })
  // preview: cells that run code from outside @open-mercato are left out before the budget cut (AGENTS.md rule 4)
  const thirdParty: MatrixCell[] = []
  const leaveOut = (c: MatrixCell) => {
    const foreign = foreignCode(c).length > 0
    if (foreign) thirdParty.push(c)
    return foreign
  }
  const matrix = planMatrix({
    entries: planEntries,
    lines,
    presets: readPresets(data),
    builtinIds,
    baselineReceipts: store.history(null),
    harness,
    harnessHash: harnessHash(ctx.root),
    now: o.now,
    event: o.event,
    onlyLines: o.lines,
    onlyPresets: o.presets,
    cells: o.cells,
    mode: o.mode,
    attempt: o.attempt,
    runner: o.runner,
    budgetMin: o.budget,
    leaveOut: o.runner === 'preview-docker' ? leaveOut : null,
  })
  const out = resolve(ctx.flags.out)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`)
  if (o.githubOutput) {
    appendFileSync(o.githubOutput, `cells=${JSON.stringify(matrix.cells)}\ncount=${matrix.cells.length}\n`)
  }
  const summary = [
    `plan: ${matrix.cells.length} cell(s) on ${matrix.lines
      .filter((l) => l.due)
      .map((l) => l.key)
      .join(', ')} (${['classic', 'empty']
      .map((p) => `${matrix.cells.filter((c) => c.preset === p).length} ${p}`)
      .join(', ')}), window about ${matrix.estimate.windowMin} min (budget ${matrix.estimate.budgetMin})`,
    `memo: ${matrix.memo} skipped (confirmed, under 7 days: ${matrix.memo - (matrix.memoIsolation ?? 0)} same key${matrix.memoIsolation ? `, ${matrix.memoIsolation} fresh isolation receipts of any harness, the first runs again from ${matrix.memoIsolationUntil?.slice(0, 16).replace('T', ' ')} UTC` : ''}); deferred: ${matrix.deferred.length}`,
    `not run: ${matrix.notRun.length} (${['quarantine', 'untested', 'skipped']
      .map((s) => `${matrix.notRun.filter((n) => n.status === s).length} ${s}`)
      .join(', ')})`,
  ]
  if (o.runner === 'preview-docker')
    summary.push(
      `preview: ${thirdParty.length} third-party cell(s) left out; they run only on GitHub Actions (AGENTS.md rule 4)`,
    )
  if (ctx.flags.json) console.log(JSON.stringify(matrix))
  else for (const l of summary) console.log(l)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.map((l) => `- ${l}\n`).join(''))
  return EXIT_OK
}
