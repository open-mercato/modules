// Reading and writing the `data` branch checkout (`--data`, default `.data`) for `fit` and `radar`.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import type { z } from 'zod'
import type { FitResult, Lines, Receipt } from '../schema/index.ts'
import { Facts, FitResult as FitResultSchema, Lines as LinesSchema, Receipt as ReceiptSchema } from '../schema/index.ts'
import type { FitModule } from './compute.ts'
import { compare, isPrerelease, valid } from './semver.ts'
import { mergeImports } from './static.ts'

export type FactsDoc = z.infer<typeof Facts>

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.isFile()) acc.push(p)
  }
  return acc
}

export function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function readLines(data: string): Lines | null {
  const f = join(data, 'lines.json')
  return existsSync(f) ? LinesSchema.parse(readJson(f)) : null
}

export function lineVersion(lines: Lines | null, source: 'latest' | 'previous' | 'develop'): string | null {
  return lines?.lines.find((l) => l.source === source)?.version ?? null
}

export interface FactsFile {
  file: string
  facts: FactsDoc
}

/** Every valid `facts/<locpath>/<ver>.json`; invalid files are reported through `warn` and skipped. */
export function readAllFacts(data: string, warn: (m: string) => void = () => {}): FactsFile[] {
  const root = join(data, 'facts')
  const out: FactsFile[] = []
  for (const file of walk(root).sort()) {
    if (!file.endsWith('.json')) continue
    const r = Facts.safeParse(readJson(file))
    if (r.success) out.push({ file, facts: r.data })
    else warn(`skip ${relative(data, file).split(sep).join('/')}: ${r.error.issues[0]?.message ?? 'invalid'}`)
  }
  return out
}

/** Fit input of one package version: imports of all its modules together. */
export function fitModuleOf(f: FactsDoc): FitModule {
  return {
    key: `${f.package.locator}@${f.package.version}`,
    locator: f.package.locator,
    version: f.package.version,
    imports: mergeImports(f.modules.map((m) => m.omImports)),
    omPeers: f.omPeers,
    dependencies: f.dependencies,
  }
}

/** Highest stable version, or the highest prerelease when there is no stable one. */
export function currentVersion(versions: readonly string[]): string | null {
  const ok = versions.filter((v) => valid(v))
  const stable = ok.filter((v) => !isPrerelease(v)).sort(compare)
  const pool = stable.length > 0 ? stable : ok.sort(compare)
  return pool[pool.length - 1] ?? null
}

/** One facts document per locator: the current version. */
export function currentFacts(all: readonly FactsFile[]): FactsDoc[] {
  const by = new Map<string, FactsDoc[]>()
  for (const { facts } of all) by.set(facts.package.locator, [...(by.get(facts.package.locator) ?? []), facts])
  const out: FactsDoc[] = []
  for (const [, docs] of [...by].sort(([a], [b]) => a.localeCompare(b))) {
    const v = currentVersion(docs.map((d) => d.package.version))
    const pick = docs.find((d) => d.package.version === v)
    if (pick) out.push(pick)
  }
  return out
}

export function readFit(data: string, om: string): FitResult | null {
  const f = join(data, 'fit', `${om}.json`)
  return existsSync(f) ? FitResultSchema.parse(readJson(f)) : null
}

/** Module receipts (`receipts/<locpath>.jsonl`, not the baseline); invalid lines are skipped. */
export function readReceipts(data: string, warn: (m: string) => void = () => {}): Receipt[] {
  const out: Receipt[] = []
  for (const file of walk(join(data, 'receipts')).sort()) {
    if (!file.endsWith('.jsonl') || file.endsWith(`${sep}_baseline.jsonl`)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (line.trim() === '') return
      const r = ReceiptSchema.safeParse(JSON.parse(line))
      if (r.success) out.push(r.data)
      else warn(`skip ${relative(data, file).split(sep).join('/')}:${i + 1}: invalid receipt`)
    })
  }
  return out
}

/** Value of `--name <v>` or `--name=<v>` in command args. */
export function argValue(args: readonly string[], name: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === name) return args[i + 1] ?? null
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1)
  }
  return null
}

/** Arguments that are not known flags (and not their values). */
export function unknownArgs(args: readonly string[], known: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (known.includes(a)) {
      i++
      continue
    }
    if (known.some((k) => a.startsWith(`${k}=`))) continue
    out.push(a)
  }
  return out
}
