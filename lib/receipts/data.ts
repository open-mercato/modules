// Reading and writing the parts of the `data` checkout that collect owns: receipts/**, presets.json (spec 5.1), plus
// receipt-transition lines in changes/<yyyy-mm>.jsonl.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { locatorToPath } from '../schema/locator.ts'
import { Change } from '../schema/data/changes.ts'
import { Presets } from '../schema/data/lines.ts'
import { Receipt } from '../schema/data/receipt.ts'
import type { History } from './state.ts'

export const BASELINE_FILE = 'receipts/_baseline.jsonl'

export function receiptFile(locator: string | null): string {
  return locator === null ? BASELINE_FILE : `receipts/${locatorToPath(locator)}.jsonl`
}

function readJsonl(file: string): Receipt[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => Receipt.parse(JSON.parse(l)))
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.jsonl') ? [p] : []
  })
}

export interface ReceiptStore {
  history: History
  all: Receipt[]
}

/** All receipts of a data checkout, by subject (locator, or null for the baseline). */
export function readReceiptStore(dataDir: string): ReceiptStore {
  const bySubject = new Map<string, Receipt[]>()
  const all: Receipt[] = []
  const root = join(dataDir, 'receipts')
  for (const file of walk(root)) {
    const rel = relative(root, file)
      .split(sep)
      .join('/')
      .replace(/\.jsonl$/, '')
    const list = readJsonl(file)
    bySubject.set(rel, list)
    all.push(...list)
  }
  return { history: (locator) => bySubject.get(locator === null ? '_baseline' : locatorToPath(locator)) ?? [], all }
}

export function appendReceipts(
  dataDir: string,
  items: readonly { locator: string | null; receipt: Receipt }[],
): string[] {
  const touched: string[] = []
  for (const { locator, receipt } of items) {
    const file = join(dataDir, receiptFile(locator))
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `${JSON.stringify(Receipt.parse(receipt))}\n`)
    if (!touched.includes(file)) touched.push(file)
  }
  return touched
}

export function readPresets(dataDir: string): Presets | null {
  const file = join(dataDir, 'presets.json')
  return existsSync(file) ? Presets.parse(JSON.parse(readFileSync(file, 'utf8'))) : null
}

export function writePresets(dataDir: string, presets: Presets): void {
  const sorted = Object.fromEntries(Object.entries(Presets.parse(presets)).sort(([a], [b]) => (a < b ? -1 : 1)))
  writeFileSync(join(dataDir, 'presets.json'), `${JSON.stringify(sorted, null, 2)}\n`)
}

export function appendChanges(dataDir: string, changes: readonly Change[]): void {
  for (const c of changes) {
    const file = join(dataDir, 'changes', `${c.at.slice(0, 7)}.jsonl`)
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `${JSON.stringify(Change.parse(c))}\n`)
  }
}
