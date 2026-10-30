// When things run, read from the workflows and harness/lines.yml at build time (spec 0.8: no number typed by hand).
// Node only: pages call it in their frontmatter and pass the words to islands as props.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AGE_GATE_DAYS, cellCadence, type LineInfo } from '../../../lib/core/lines.ts'
import { previewQueued, previewQueuedLines } from '../../../lib/core/source.ts'

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad = (n: string): string => n.padStart(2, '0')

/** First `cron:` of a workflow, e.g. "17 2 * * *". */
export function cronOf(file: string): string | null {
  const p = resolve('.github/workflows', file)
  if (!existsSync(p)) return null
  return /cron:\s*["']([^"']+)["']/.exec(readFileSync(p, 'utf8'))?.[1] ?? null
}

/** A cron line in words, for the three shapes the workflows use. */
export function cronText(cron: string | null): string | null {
  if (!cron) return null
  const [min = '', hour = '', , , dow = ''] = cron.split(/\s+/)
  const every = /^\*\/(\d+)$/.exec(hour)
  if (every) return `every ${every[1]} hours at minute ${pad(min)}`
  if (/^\d+$/.test(hour) && dow === '*') return `daily at ${pad(hour)}:${pad(min)} UTC`
  if (/^\d+$/.test(hour) && /^\d$/.test(dow)) return `every ${DAYS[Number(dow)]} at ${pad(hour)}:${pad(min)} UTC`
  return cron
}

/**
 * When a workflow runs, in words, from the text of its file (live review of 30 Oct): `scheduled every 6 hours at minute
 * 17, and after a push to main`. A cron is a schedule, not a promise, so the words say `scheduled`. Null without a cron.
 */
export function workflowWhen(yml: string): string | null {
  const text = cronText(/cron:\s*["']([^"']+)["']/.exec(yml)?.[1] ?? null)
  if (!text) return null
  const push = /^\s+push:\s*\n\s+branches:\s*\n\s+-\s*main\s*$/m.test(yml)
  return `scheduled ${text}${push ? ', and after a push to main' : ''}`
}

/** `workflowWhen` of a file under .github/workflows, or null when the file is missing. */
export function workflowWhenOf(file: string): string | null {
  const p = resolve('.github/workflows', file)
  return existsSync(p) ? workflowWhen(readFileSync(p, 'utf8')) : null
}

/** Why the data times differ from the schedules (live review of 30 Oct: 09:17 and 05:55 under `02:17`). */
export const SCHEDULE_CAVEAT =
  'These are the schedules of the GitHub workflows. GitHub can start a scheduled run late or skip it when busy, and a run can also be started by hand, so the data times below can differ from them.'

export interface Schedule {
  /** Time of the nightly run, e.g. `02:17 UTC`, or null without the workflow. */
  nightly: string | null
  /** Day of the weekly run of the previous line, e.g. `Sunday`, or null. */
  weeklyDay: string | null
  /** Yarn age gate of a fresh app, in days. */
  ageGateDays: number
}

let cached: Schedule | null = null

export function schedule(): Schedule {
  if (cached) return cached
  const m = /^(\d+)\s+(\d+)\s/.exec(cronOf('nightly.yml') ?? '')
  const nightly = m ? `${pad(m[2] as string)}:${pad(m[1] as string)} UTC` : null
  const harness = resolve('harness/lines.yml')
  const wd = existsSync(harness) ? /^weeklyDay:\s*(\d)/m.exec(readFileSync(harness, 'utf8'))?.[1] : undefined
  cached = { nightly, weeklyDay: wd === undefined ? null : (DAYS[Number(wd)] ?? null), ageGateDays: AGE_GATE_DAYS }
  return cached
}

/** `Queued for tonight's run (02:17 UTC).` or, for the weekly line, `Queued for Sunday's run (02:17 UTC).` */
export function queuedSentence(cadence: 'nightly' | 'weekly' | string, s: Schedule = schedule()): string {
  const at = s.nightly ? ` (${s.nightly})` : ''
  return cadence === 'weekly' && s.weeklyDay
    ? `Queued for ${s.weeklyDay}'s run${at}.`
    : `Queued for tonight's run${at}.`
}

/**
 * `Runs: 0.9 and next every night, 0.8 every Sunday.` from the lines' cadence. `planned`: while the receipts come from
 * a preview run no nightly CI run exists yet, so the sentence says `Planned runs: ...` (review r9). `presetWeekly`: the
 * nightly lines whose cells of the packages a new app already has run on the weekly night only (`cellCadence`), added
 * as `On next, modules a new app already has run every Sunday only.` (review of 24 Oct).
 */
export function cadenceSentence(
  lines: readonly { key: string; cadence: string }[],
  s: Schedule = schedule(),
  planned = false,
  presetWeekly: readonly string[] = [],
): string {
  const nightly = lines.filter((l) => l.cadence !== 'weekly').map((l) => l.key)
  const weekly = lines.filter((l) => l.cadence === 'weekly').map((l) => l.key)
  // two short sentences (finding of 25 Oct: `Planned: nightly on 0.9 and next, weekly on 0.8 (Sundays); packages a new
  // app already has: weekly on next.` read as one fragment)
  const when = s.weeklyDay ? `every ${s.weeklyDay}` : 'once a week'
  const parts = [
    ...(nightly.length ? [`${and(nightly)} every night`] : []),
    ...(weekly.length ? [`${and(weekly)} ${when}`] : []),
  ]
  if (parts.length === 0) return ''
  const preset = presetWeekly.filter((k) => nightly.includes(k))
  // finding of 25 Oct: `A package a new app already has runs on next every Sunday only.` read as garbled
  const tail = preset.length ? ` On ${and(preset)}, modules a new app already has run ${when} only.` : ''
  return `${planned ? 'Planned runs' : 'Runs'}: ${parts.join(', ')}.${tail}`
}

const and = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

type CellLine = Pick<LineInfo, 'key' | 'source'> & { cadence: string }

/**
 * The queue sentence of one cell of a new app (review of 24 Oct): by `cellCadence`, the predicate the nightly plan runs
 * by, so a package a new app on next already has reads `Queued for Sunday's run (02:17 UTC).`, never `tonight`. A
 * preview run promises the first CI run of that cadence (`Queued for the first weekly CI run (Sundays).`).
 */
export function queuedCellSentence(
  line: CellLine,
  inPreset: boolean,
  preview: boolean,
  s: Schedule = schedule(),
): string {
  const cadence = cellCadence(line, inPreset)
  return preview ? previewQueued(cadence, s.weeklyDay) : queuedSentence(cadence, s)
}

/**
 * One queue sentence for the waiting cells of an entry on several lines, each by `cellCadence`: `Queued: 0.9 tonight
 * (02:17 UTC), 0.8 and next on Sunday.`, or in a preview run `Queued for the first CI runs: 0.9 nightly, 0.8 and next
 * weekly (Sundays).` `inPreset`: the line keys of the entry's `compat.inPresets`.
 */
export function queuedCellsSentence(
  lines: readonly CellLine[],
  inPreset: ReadonlySet<string> | readonly string[],
  preview: boolean,
  s: Schedule = schedule(),
): string {
  const has = (k: string) => (Array.isArray(inPreset) ? inPreset.includes(k) : (inPreset as ReadonlySet<string>).has(k))
  const cells = lines.map((l) => ({ key: l.key, cadence: cellCadence(l, has(l.key)) }))
  if (cells.length === 0) return ''
  return preview ? previewQueuedLines(cells, s.weeklyDay) : queuedLinesSentence(cells, s)
}

/**
 * One queue sentence for several lines, by their own cadence (review r2):
 * `Queued: 0.9 and next tonight (02:17 UTC), 0.8 on Sunday.` Pass only the lines that wait for a receipt.
 */
export function queuedLinesSentence(
  lines: readonly { key: string; cadence: string }[],
  s: Schedule = schedule(),
): string {
  const nightly = lines.filter((l) => l.cadence !== 'weekly').map((l) => l.key)
  const weekly = lines.filter((l) => l.cadence === 'weekly').map((l) => l.key)
  const at = s.nightly ? ` (${s.nightly})` : ''
  const parts: string[] = []
  if (nightly.length) parts.push(`${and(nightly)} tonight${at}`)
  if (weekly.length)
    parts.push(`${and(weekly)} ${s.weeklyDay ? `on ${s.weeklyDay}` : 'in the weekly run'}${nightly.length ? '' : at}`)
  return parts.length ? `Queued: ${parts.join(', ')}.` : ''
}
