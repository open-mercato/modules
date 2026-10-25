// One-time migration of the data branch to the decision of 24 Oct (a new app, the classic preset, gives the main
// verdict; docs/RUNBOOK.md "Migration of 24 Oct"). `yarn om health` runs it by itself until it has run once with a
// receipt of a new app in the data (the marker `migrations.json`), so no night can publish the old model's changes
// before someone runs it (review of 24 Oct); by hand: `node scripts/migrate-preset-model.ts --data .data [--dry-run]`.
// The first `health` of the new model already marks its own level changes against older files (`reason: preset-model`).
//
// 1. Every level and status change dated before the first receipt of a new app in the data came from receipts of the
//    empty preset: it gets `reason: preset-model`, so /changes.json and /feed.xml leave it out (the feed said
//    `KSeF Integration: level listed to verified` on 23 Oct, from the old model).
// 2. Each entry that is Verified now (health with `verdictPreset: classic`) and has no level change of the new model
//    gets one, `listed to verified`, dated by its first verified receipt of a new app on the latest line.
// Idempotent: a second run changes nothing.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Change } from '../schema/data/changes.ts'
import { Health } from '../schema/data/health.ts'
import { Receipt } from '../schema/data/receipt.ts'

export interface MigrationInput {
  /** Every change record, in the order of the files. */
  changes: readonly Change[]
  /** Every receipt (modules and baselines). */
  receipts: readonly Receipt[]
  /** Locators whose level is Verified under the new model (health with `verdictPreset: classic`). */
  verified: readonly string[]
  latestLine: string | null
}

export interface MigrationResult {
  /** The first receipt of a new app in the data (the switch), or null when there is none yet. */
  since: string | null
  changes: Change[]
  marked: number
  added: Change[]
}

const preset = (r: Receipt): string => r.om.preset ?? 'empty'

export function migratePresetModel(i: MigrationInput): MigrationResult {
  const classic = i.receipts.filter((r) => preset(r) === 'classic').sort((a, b) => a.run.at.localeCompare(b.run.at))
  const since = classic[0]?.run.at ?? null
  if (!since) return { since, changes: [...i.changes], marked: 0, added: [] }
  let marked = 0
  const changes = i.changes.map((c) => {
    if (c.reason || (c.type !== 'tier-change' && c.type !== 'status-change') || c.at >= since) return c
    marked++
    return { ...c, reason: 'preset-model' as const }
  })
  const added: Change[] = []
  for (const locator of i.verified) {
    const has = changes.some(
      (c) => c.locator === locator && c.type === 'tier-change' && !c.reason && c.to === 'verified',
    )
    if (has) continue
    const first = classic.find(
      (r) =>
        r.module?.locator === locator &&
        r.result.status === 'verified' &&
        (!i.latestLine || r.om.line === i.latestLine),
    )
    if (!first) continue
    added.push(Change.parse({ at: first.run.at, type: 'tier-change', locator, from: 'listed', to: 'verified' }))
  }
  return { since, changes, marked, added }
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const jsonl = (p: string): unknown[] =>
  readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as unknown)

/** `migrations.json` in the data folder: which one-time migrations ran, and when. */
export const MIGRATIONS_FILE = 'migrations.json'
export const PRESET_MODEL_MIGRATION = 'preset-model'

/** Whether the migration of 24 Oct has not run on this data folder yet (no marker, or a marker without it). */
export function presetModelPending(data: string): boolean {
  const f = join(data, MIGRATIONS_FILE)
  if (!existsSync(f)) return true
  try {
    const m = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
    return !m[PRESET_MODEL_MIGRATION]
  } catch {
    return true
  }
}

/**
 * Reads the data folder, migrates, writes the changes files back (unless `dryRun`). A run with a receipt of a new app
 * in the data writes the marker, so `health` does not run it again.
 */
export function migrateData(data: string, dryRun = false, now = new Date().toISOString()): MigrationResult {
  const files = walk(join(data, 'changes'))
    .filter((p) => p.endsWith('.jsonl'))
    .sort()
  const perFile = files.map((f) => ({ f, list: jsonl(f).map((x) => Change.parse(x)) }))
  const receipts = walk(join(data, 'receipts'))
    .filter((p) => p.endsWith('.jsonl'))
    .flatMap((p) => jsonl(p).map((x) => Receipt.parse(x)))
  const verified = walk(join(data, 'health'))
    .filter((p) => p.endsWith('.json'))
    .map((p) => Health.parse(JSON.parse(readFileSync(p, 'utf8'))))
    .filter((h) => h.verdictPreset === 'classic' && h.tier === 'verified')
    .map((h) => h.locator)
    .sort()
  const lines = existsSync(join(data, 'lines.json'))
    ? (JSON.parse(readFileSync(join(data, 'lines.json'), 'utf8')) as { lines?: { key: string; source: string }[] })
    : null
  const latestLine = lines?.lines?.find((l) => l.source === 'latest')?.key ?? null
  const res = migratePresetModel({ changes: perFile.flatMap((x) => x.list), receipts, verified, latestLine })
  if (dryRun || !res.since) return res
  let k = 0
  const out = new Map<string, Change[]>()
  for (const { f, list } of perFile) out.set(f, res.changes.slice(k, (k += list.length)))
  for (const c of res.added) {
    const f = join(data, 'changes', `${c.at.slice(0, 7)}.jsonl`)
    out.set(f, [...(out.get(f) ?? []), c])
  }
  for (const [f, list] of out) writeFileSync(f, list.map((c) => `${JSON.stringify(c)}\n`).join(''))
  const mf = join(data, MIGRATIONS_FILE)
  let marker: Record<string, unknown> = {}
  try {
    if (existsSync(mf)) marker = JSON.parse(readFileSync(mf, 'utf8')) as Record<string, unknown>
  } catch {
    marker = {}
  }
  marker[PRESET_MODEL_MIGRATION] = {
    at: now.replace(/\.\d{3}Z$/, 'Z'),
    since: res.since,
    marked: res.marked,
    added: res.added.length,
  }
  writeFileSync(mf, `${JSON.stringify(marker, null, 2)}\n`)
  return res
}

/** The one log line of a migration run (the script and `health`). */
export function migrationLine(res: MigrationResult, dryRun = false): string {
  if (!res.since) return 'No receipt of a new app (classic) in the data yet: nothing to migrate.'
  return `Switch at ${res.since}: ${res.marked} older level or status changes marked preset-model, ${res.added.length} Verified levels dated by their first classic receipt${dryRun ? ' (dry run, nothing written)' : ''}.`
}
