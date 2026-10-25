// Re-read the excerpt of failed steps from their logs after a classification rule was added (round 13: the rule
// `duplicate-route` of lib/receipts/classify.ts; the classic receipts of 24 Oct of freighttech shipment-tracking kept
// Yarn's first `YN0000` line instead of the generate error). Only preview receipts can do it (their `run.url` is the
// local log directory); a CI night is collected again instead (docs/RUNBOOK.md "Replay or repair a night").
//
//   node scripts/reexcerpt.ts --data .data [--rule duplicate-route] [--dry-run]
//
// A step is rewritten only when a rule now matches its log, the old excerpt does not show what that rule matched, and
// the class stays the same, so a status never changes: the receipt keeps its id, result and transition.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyStep, RULES } from '../lib/receipts/classify.ts'
import { Receipt } from '../lib/schema/data/receipt.ts'

export interface ReexcerptResult {
  /** `<receipt id> <step>: <rule>` of every rewritten step. */
  changed: string[]
  /** Steps whose log now classifies differently (left as they are, for a person to look at). */
  skipped: string[]
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.jsonl') ? [p] : []
  })
}

const UNMATCHED = new Set(['unmatched', 'harness-step', 'cancelled'])

/** One receipt with its failed steps re-read from `logDir`, or null when nothing changes. */
export function reexcerptReceipt(
  r: Receipt,
  logDir: string,
  out: ReexcerptResult,
  only: string | null = null,
): Receipt | null {
  let touched = false
  const steps = r.steps.map((s) => {
    if (s.status !== 'fail') return s
    const file = join(logDir, `${s.name}.log`)
    if (!existsSync(file)) return s
    const f = classifyStep(s.name, readFileSync(file, 'utf8'), { attempt: r.run.attempt })
    if (UNMATCHED.has(f.rule) || (only && f.rule !== only)) return s
    const rule = RULES.find((x) => x.name === f.rule)
    if (rule && s.excerpt && s.excerpt.split('\n').some((l) => rule.re.test(l))) return s
    if (s.name === r.result.failedStep && f.classification !== r.result.classification) {
      out.skipped.push(`${r.id} ${s.name}: ${f.rule} would make it ${f.classification}`)
      return s
    }
    touched = true
    out.changed.push(`${r.id} ${s.name}: ${f.rule}`)
    return { ...s, signature: f.signature, excerpt: f.excerpt, file: f.file, line: f.line }
  })
  return touched ? Receipt.parse({ ...r, steps }) : null
}

export function reexcerptData(dataDir: string, dryRun = false, only: string | null = null): ReexcerptResult {
  const out: ReexcerptResult = { changed: [], skipped: [] }
  for (const file of walk(join(dataDir, 'receipts'))) {
    let dirty = false
    const lines = readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => {
        if (l.trim() === '') return l
        const r = Receipt.parse(JSON.parse(l))
        if (!r.run.url?.startsWith('file://')) return l
        const next = reexcerptReceipt(r, fileURLToPath(r.run.url), out, only)
        if (!next) return l
        dirty = true
        return JSON.stringify(next)
      })
    if (dirty && !dryRun) writeFileSync(file, lines.join('\n'))
  }
  return out
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--data')
  const data = at >= 0 ? args[at + 1] : undefined
  if (!data) {
    console.error('usage: node scripts/reexcerpt.ts --data <dir> [--rule <name>] [--dry-run]')
    process.exit(64)
  }
  const dry = args.includes('--dry-run')
  const ri = args.indexOf('--rule')
  const r = reexcerptData(resolve(data), dry, ri >= 0 ? (args[ri + 1] ?? null) : null)
  for (const c of r.changed) console.log(`${dry ? 'would rewrite' : 'rewrote'} ${c}`)
  for (const s of r.skipped) console.log(`left ${s}`)
  console.log(`reexcerpt: ${r.changed.length} steps ${dry ? 'to rewrite' : 'rewritten'}, ${r.skipped.length} left`)
}
