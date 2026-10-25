// `yarn om hive`: stable Hive slots (spec 5.4, 7.5). Reads modules/**, .data/sync/**, .data/health/**,
// .data/builtin/<coreLatest>.json and .data/hive.json; writes .data/hive.json. Existing slots never move and freed
// slots are never reused. Extra flags: --modules <dir>, --policy <dir>, --date <YYYY-MM-DD>, --dry-run, and
// --relayout (drops every stored slot and lays the whole map out again: only before launch, when the slot rules
// change; it breaks the "slots never move" promise, so nothing runs it on a schedule). A stored file without
// `layout: "disc"` predates the round-plate rules and is laid out again once, so the next scheduled run fixes it.
// Exit 2 when --data does not exist (a typo must not write a fresh, coreless hive.json somewhere).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { hiveCandidates } from '../hive/candidates.ts'
import type { HiveDescriptorInput, HiveSyncInput } from '../hive/candidates.ts'
import { assignSlots, discBase, isDiscLayout } from '../hive/layout.ts'
import type { HiveCandidate, HiveSlotsFile, Wedge } from '../hive/layout.ts'
import type { z } from 'zod'
import {
  BuiltinCategoriesFile,
  BuiltinData,
  CategoriesFile,
  Descriptor,
  Health,
  HiveSlots,
  Lines,
  SyncRecord,
} from '../schema/index.ts'
import { descriptorLocator } from '../schema/locator.ts'

export const description = 'stable Hive slots; .data/hive.json'

function walk(dir: string, ext: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, ext, acc)
    else if (e.isFile() && e.name.endsWith(ext)) acc.push(p)
  }
  return acc.sort()
}

function takeFlag(args: string[], name: string): string | undefined {
  const i = args.findIndex((a) => a === name || a.startsWith(`${name}=`))
  if (i < 0) return undefined
  const a = args[i] as string
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[i + 1]
}

const cmpSemver = (a: string, b: string): number => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

// Only the fields the Hive needs, validated with the data-branch schemas (other fields pass through unchecked).
const SyncSlice = SyncRecord.pick({ locator: true, type: true, firstSeenAt: true }).loose()
const HealthSlice = Health.pick({ locator: true, state: true, rules: true }).loose()

/** Reads and validates one data-branch record; a broken file is a warning with its path, never a silent skip. */
function readRecord<T extends z.ZodType>(file: string, schema: T, dir: string, warnings: string[]): z.infer<T> | null {
  const name = `${dirname(dir).split(sep).pop()}/${dir.split(sep).pop()}/${relative(dir, file).split(sep).join('/')}`
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    warnings.push(`${name}: not JSON (${(err as Error).message}), skipped`)
    return null
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    warnings.push(`${name}: ${issue ? `${issue.path.join('.') || '(root)'} ${issue.message}` : 'invalid'}, skipped`)
    return null
  }
  return parsed.data
}

export interface HiveRunResult {
  file: HiveSlotsFile
  added: string[]
  cells: number
  candidates: HiveCandidate[]
  warnings: string[]
}

/** The command body without console output, for tests. */
export function runHive(opts: {
  modulesDir: string
  policyDir: string
  dataDir: string
  date: string
  write: boolean
  relayout?: boolean
}): HiveRunResult {
  const warnings: string[] = []
  const categories = CategoriesFile.parse(parseYaml(readFileSync(join(opts.policyDir, 'categories.yml'), 'utf8')))
  const categoryWedge = new Map<string, Wedge>(categories.categories.map((c) => [c.id, c.wedge]))
  const bcFile = join(opts.policyDir, 'builtin-categories.yml')
  const builtinCategories = new Map<string, string>(
    existsSync(bcFile) ? Object.entries(BuiltinCategoriesFile.parse(parseYaml(readFileSync(bcFile, 'utf8')))) : [],
  )
  if (!existsSync(bcFile)) warnings.push('policy/builtin-categories.yml is missing; core modules go to operations')

  const descriptors: HiveDescriptorInput[] = []
  for (const f of walk(opts.modulesDir, '.yml')) {
    const parsed = Descriptor.safeParse(parseYaml(readFileSync(f, 'utf8')))
    if (!parsed.success) {
      warnings.push(`${relative(opts.modulesDir, f).split(sep).join('/')}: invalid descriptor, skipped`)
      continue
    }
    const d = parsed.data
    descriptors.push({
      locator: descriptorLocator(d),
      kind: d.kind,
      category: d.category,
      tags: d.tags,
      status: d.status,
    })
  }

  const sync = new Map<string, HiveSyncInput>()
  const syncDir = join(opts.dataDir, 'sync')
  for (const f of walk(syncDir, '.json')) {
    const s = readRecord(f, SyncSlice, syncDir, warnings)
    if (s) sync.set(s.locator, { type: s.type, firstSeenAt: s.firstSeenAt })
  }
  // Listed = LST rules pass and the entry is not on hold or delisted (spec 6.3). Not the tier: enterprise and
  // built-in have no tier but are listed.
  const listed = new Map<string, boolean>()
  const healthDir = join(opts.dataDir, 'health')
  for (const f of walk(healthDir, '.json')) {
    const h = readRecord(f, HealthSlice, healthDir, warnings)
    if (!h) continue
    const lst = h.rules.filter((r) => r.id.startsWith('LST-'))
    listed.set(h.locator, lst.every((r) => r.pass) && h.state !== 'hold' && h.state !== 'delisted')
  }

  let builtIn: string[] = []
  const builtinDir = join(opts.dataDir, 'builtin')
  const linesFile = join(opts.dataDir, 'lines.json')
  let coreVersion: string | undefined
  if (existsSync(linesFile)) coreVersion = Lines.parse(JSON.parse(readFileSync(linesFile, 'utf8'))).coreLatest
  if (!coreVersion || !existsSync(join(builtinDir, `${coreVersion}.json`))) {
    const versions = existsSync(builtinDir)
      ? readdirSync(builtinDir)
          .filter((n) => /^\d+\.\d+\.\d+\.json$/.test(n))
          .map((n) => n.slice(0, -5))
          .sort(cmpSemver)
      : []
    coreVersion = versions.at(-1)
  }
  if (coreVersion) {
    const b = BuiltinData.parse(JSON.parse(readFileSync(join(builtinDir, `${coreVersion}.json`), 'utf8')))
    builtIn = b.modules.map((m) => m.id)
  } else warnings.push('no data/builtin/<core>.json; the Hive has no core cells')

  const { candidates, warnings: w2 } = hiveCandidates({
    descriptors,
    sync,
    listed,
    builtIn,
    builtInAddedAt: '',
    categoryWedge,
    builtinCategories,
  })
  warnings.push(...w2)

  const hiveFile = join(opts.dataDir, 'hive.json')
  const stored: HiveSlotsFile | null = existsSync(hiveFile)
    ? (HiveSlots.parse(JSON.parse(readFileSync(hiveFile, 'utf8'))) as HiveSlotsFile)
    : null
  if (stored && !isDiscLayout(stored) && Object.keys(stored.slots).length > 0 && opts.relayout !== true)
    warnings.push('data/hive.json predates the disc layout; the whole map was laid out again')
  const existing: HiveSlotsFile = opts.relayout === true ? discBase(null) : discBase(stored)
  const { file, added } = assignSlots(existing, candidates, opts.date)
  HiveSlots.parse(file)
  if (opts.write) {
    mkdirSync(dirname(hiveFile), { recursive: true })
    writeFileSync(hiveFile, `${JSON.stringify(file, null, 2)}\n`)
  }
  return { file, added, cells: candidates.length, candidates, warnings }
}

export default function hive(ctx: CommandContext): number {
  const abs = (p: string): string => (isAbsolute(p) ? p : join(ctx.root, p))
  const date = takeFlag(ctx.args, '--date') ?? new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('hive: --date must be YYYY-MM-DD')
    return EXIT_ENV
  }
  const dataDir = abs(ctx.flags.data)
  if (!existsSync(dataDir) || !statSync(dataDir).isDirectory()) {
    console.error(`hive: --data ${ctx.flags.data} is not a directory (a checkout of the data branch)`)
    return EXIT_ENV
  }
  let res: HiveRunResult
  try {
    res = runHive({
      modulesDir: abs(takeFlag(ctx.args, '--modules') ?? 'modules'),
      policyDir: abs(takeFlag(ctx.args, '--policy') ?? 'policy'),
      dataDir,
      date,
      write: !ctx.args.includes('--dry-run'),
      relayout: ctx.args.includes('--relayout'),
    })
  } catch (err) {
    console.error(`hive: ${(err as Error).message}`)
    return EXIT_VALIDATION
  }
  for (const w of res.warnings) console.error(`hive: warning: ${w}`)
  if (ctx.flags.json) console.log(JSON.stringify({ cells: res.cells, added: res.added, warnings: res.warnings }))
  else
    console.log(
      `hive: ${res.cells} cells, ${res.added.length} new slots, ${Object.keys(res.file.slots).length} kept in total`,
    )
  return EXIT_OK
}
