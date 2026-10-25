// Cell keys and the harness hash (spec 5.3).
// cellKey = sha256(locator@version | dist.integrity | omVersion | harnessHash | node [| early] [| preview-docker]
//   [| preset:classic]); the preset part is added only for a preset other than `empty`, so a cell of the empty preset
// keeps the pattern of its key (decision of 24 Oct: classic gives the main verdict, empty the signal `in isolation`).
// Not the keys of 23 Oct themselves: steps.sh got `--preset` the same day, so harnessHash changed (0aa59f782d09 and
// 5bb6b53752b8 in those receipts) and no empty cell of today has the key of a receipt from before. Those cells are
// spared for MEMO_DAYS by a fresh isolation receipt of any harness (plan.ts `freshIsolation`, `memoIsolation` in the
// matrix), then run again (docs/RUNBOOK.md, "A preview night in streams").
// harnessHash covers only the files that run inside a cell (steps.sh, env.sh, smoke.sh, patches/**, lines.yml).
// classify.ts runs in `collect` and docs/RUNBOOK.md is documentation, so editing them never invalidates receipts.
// harness/local/** (preview runner) is outside the hash too: a preview cell differs by the `preview-docker` part of
// its key and by `harness.runner` in its receipt.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Files of the cell, relative to the repo root (patches/** expanded). */
export const HARNESS_CELL_FILES = [
  'harness/steps.sh',
  'harness/env.sh',
  'harness/smoke.sh',
  'harness/lines.yml',
] as const
export const HARNESS_PATCH_DIR = 'harness/patches'

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** Sorted repo-relative paths that make up harnessHash. */
export function harnessFiles(root: string): string[] {
  const patches = walk(join(root, HARNESS_PATCH_DIR)).map((p) => relative(root, p).split(sep).join('/'))
  return [...HARNESS_CELL_FILES.filter((f) => existsSync(join(root, f))), ...patches].sort()
}

/** sha256 over `path NUL content NUL` of every cell file (a rename changes the hash too). */
export function harnessHash(root: string): string {
  const h = createHash('sha256')
  for (const f of harnessFiles(root)) {
    h.update(f)
    h.update('\0')
    h.update(readFileSync(join(root, f)))
    h.update('\0')
  }
  return h.digest('hex')
}

/** `Receipt.harness.version`: the first 12 characters of harnessHash. */
export function harnessVersion(hash: string): string {
  return hash.slice(0, 12)
}

export interface CellKeyInput {
  /** null for the baseline (the app of a line and preset, nothing added). */
  locator: string | null
  version: string | null
  integrity: string | null
  omVersion: string
  harnessHash: string
  node: string
  mode: 'realistic' | 'early'
  /** Runner of the cell (default ubuntu-latest). A preview cell is its own cell, so its receipt id never equals the id of
   * a CI receipt for the same subject and day. */
  runner?: 'ubuntu-latest' | 'preview-docker'
  /** Starter preset of the scaffold (default `empty`). Only a preset other than `empty` adds a part to the key. */
  preset?: 'empty' | 'classic'
}

export function cellKey(i: CellKeyInput): string {
  const subject = i.locator === null ? 'baseline' : `${i.locator}@${i.version ?? ''}`
  const parts = [subject, i.integrity ?? '', i.omVersion, i.harnessHash, i.node]
  // An early (pre-check) cell is a different cell than the realistic one for the same version.
  if (i.mode === 'early') parts.push('early')
  if (i.runner === 'preview-docker') parts.push('preview-docker')
  if (i.preset && i.preset !== 'empty') parts.push(`preset:${i.preset}`)
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

export function key12(key: string): string {
  return key.slice(0, 12)
}

/** `r_<yyyymmdd>_<12 chars of cellKey>`; the date is the UTC day of the run. */
export function receiptId(runAt: string, key: string): string {
  return `r_${runAt.slice(0, 10).replace(/-/g, '')}_${key12(key)}`
}
