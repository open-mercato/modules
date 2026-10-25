// Markdown for $GITHUB_STEP_SUMMARY (spec 5.2 step 4, D27): at most 10 lines per entry, no links or images from
// author content, author content escaped. One heading per entry, a two-column table, at most 7 rows; extra rows
// are folded into the last one. The full list of findings stays in the job log and out/validate.json.
import type { EntryResult, Finding, Row, ValidateReport } from './types.ts'

export const MAX_ENTRY_LINES = 10
const MAX_ROWS = MAX_ENTRY_LINES - 3 // heading, table head, separator

/**
 * Escapes text for a table cell: no HTML, no markdown links, emphasis or code spans, no autolinks, no line breaks.
 * Everything that may carry author text goes through this.
 */
export function escapeCell(s: string): string {
  return (
    s
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/[`]/g, "'")
      // backslashes first, so the escape of `|` below is not undone
      .replace(/([[\]*_~\\])/g, (m) => (m === '\\' ? '\\\\' : `\\${m}`))
      .replace(/\|/g, '\\|')
      .replace(/\b(https?|ftp|file|javascript|data):/gi, '$1&#58;')
      .replace(/\bwww\./gi, 'www&#46;')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

const label = (f: Finding): string => (f.severity === 'error' ? 'Error' : f.severity === 'warning' ? 'Warning' : 'Note')

/** Table rows of one entry: errors first, then the measured rows, then warnings and skipped steps. */
export function entryRows(e: EntryResult): Row[] {
  const rows: Row[] = []
  for (const f of e.findings.filter((x) => x.severity === 'error')) rows.push({ check: label(f), result: f.message })
  rows.push(...e.rows)
  for (const f of e.findings.filter((x) => x.severity !== 'error')) rows.push({ check: label(f), result: f.message })
  const skipped = [...new Set(e.skipped.map((s) => s.reason))]
  if (skipped.length > 0)
    rows.push({
      check: 'Skipped',
      result: `${[...new Set(e.skipped.map((s) => s.step))].join(', ')} (${skipped.join('; ')})`,
    })
  if (rows.length <= MAX_ROWS) return rows
  const kept = rows.slice(0, MAX_ROWS - 1)
  const rest = rows.slice(MAX_ROWS - 1)
  kept.push({ check: 'More', result: rest.map((r) => `${r.check}: ${r.result}`).join(' · ') })
  return kept
}

/** Markdown block of one entry, at most MAX_ENTRY_LINES lines. */
export function renderEntry(e: EntryResult): string[] {
  const title = e.locator ? `${e.locator}${e.version ? `@${e.version}` : ''}` : e.file
  const verdict = e.status === 'pass' ? 'passed' : 'failed'
  // locators and file paths match strict patterns (no backticks), so a code span is safe and inert
  const lines = [
    `### \`${title.replace(/[`\u0000-\u001f]/g, "'").slice(0, 200)}\`: ${verdict}`,
    '| Check | Result |',
    '|---|---|',
  ]
  for (const r of entryRows(e)) lines.push(`| ${escapeCell(r.check)} | ${escapeCell(r.result.slice(0, 500))} |`)
  return lines
}

export function renderSummary(report: ValidateReport): string {
  const failed = report.entries.filter((e) => e.status === 'fail').length
  const globalErrors = report.global.filter((g) => g.severity === 'error')
  const out: string[] = ['## Catalog check', '']
  const n = report.entries.length
  if (n === 0 && report.global.length === 0 && report.removed.length === 0) {
    out.push('No descriptor changes.')
    return `${out.join('\n')}\n`
  }
  const head = [`${n} ${n === 1 ? 'entry' : 'entries'} checked: ${n - failed} passed, ${failed} failed.`]
  if (report.offline) head.push('Offline: only the steps without network ran.')
  if (report.removed.length > 0) head.push(`Removed: ${report.removed.map(escapeCell).join(', ')}.`)
  out.push(head.join(' '), '')
  for (const e of report.entries) out.push(...renderEntry(e), '')
  if (report.global.length > 0) {
    out.push(
      `### Policy and built-in modules: ${globalErrors.length > 0 ? 'failed' : 'passed'}`,
      '| Check | Result |',
      '|---|---|',
    )
    for (const g of report.global.slice(0, MAX_ROWS)) out.push(`| ${label(g)} | ${escapeCell(g.message)} |`)
    if (report.global.length > MAX_ROWS) out.push(`| More | ${report.global.length - MAX_ROWS} more in the job log |`)
    out.push('')
  }
  return `${out.join('\n')}\n`
}

/** Plain-text report for the terminal and the job log (every finding, no cap). */
export function renderText(report: ValidateReport): string {
  const out: string[] = []
  for (const e of report.entries) {
    out.push(
      `${e.status === 'pass' ? 'ok  ' : 'FAIL'} ${e.locator ?? e.file}${e.version ? `@${e.version}` : ''} (${e.file})`,
    )
    for (const r of e.rows) out.push(`     ${r.check}: ${r.result}`)
    for (const f of e.findings) out.push(`     ${f.severity}: [${f.step}/${f.code}] ${f.message}`)
    const skipped = [...new Set(e.skipped.map((s) => `${s.step} (${s.reason})`))]
    if (skipped.length > 0) out.push(`     skipped: ${skipped.join(', ')}`)
  }
  for (const g of report.global) out.push(`${g.severity}: [${g.step}/${g.code}] ${g.message}`)
  for (const r of report.removed) out.push(`removed: ${r}`)
  for (const n of report.notes) out.push(`note: ${n}`)
  const failed = report.entries.filter((e) => e.status === 'fail').length
  const ge = report.global.filter((g) => g.severity === 'error').length
  out.push(
    `validate: ${report.entries.length} entries, ${failed} failed${ge ? `, ${ge} policy error(s)` : ''}${report.offline ? ' (offline)' : ''}.`,
  )
  return out.join('\n')
}
