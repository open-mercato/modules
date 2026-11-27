// The run report (spec API Contracts, "Report"): out/import-webflow/report.md, not committed. Counts per collection,
// drafts, conflicts, reported items, replaced dashes, tokens and media bytes; the PR that commits the output pastes
// its summary. No timestamps, so two runs on the same input write the same report.
import type { ImportResult } from './run.ts'
import { cmp } from './output.ts'

function table(head: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n')
}

export function renderReport(r: ImportResult, mode: { check: boolean; offline: boolean }): string {
  const { report } = r
  const out: string[] = ['# Webflow import report', '']
  out.push(`Mode: ${mode.check ? 'check (nothing written)' : 'write'}${mode.offline ? ', offline' : ''}.`, '')
  if (r.fatal) out.push(`**Stopped:** ${r.fatal}.`, '')

  out.push('## Collections', '')
  const counts = [...report.counts.entries()].sort((a, b) => cmp(a[0], b[0]))
  out.push(
    table(
      ['Collection', 'Entries', 'Drafts'],
      counts.map(([c, n]) => [c, n.entries, n.drafts]),
    ),
    '',
  )

  const actions = r.plan?.actions ?? []
  const by = (k: string) => actions.filter((a) => a.kind === k).length
  out.push('## Files', '')
  out.push(
    table(
      ['Created', 'Updated', 'Unchanged', 'Forced', 'Conflicts', 'Gone from the export'],
      [[by('create'), by('update'), by('unchanged'), by('forced'), by('conflict'), r.plan?.gone.length ?? 0]],
    ),
    '',
  )
  const conflicts = actions.filter((a) => a.kind === 'conflict')
  if (conflicts.length > 0) {
    out.push('Conflicts (kept; `--force <path>` overwrites):', '')
    for (const a of conflicts) out.push(`- \`${a.file.path}\`: ${a.kind === 'conflict' ? a.why : ''}`)
    out.push('')
  }
  if (r.plan && r.plan.gone.length > 0) {
    out.push('Gone from the export (reported, not deleted):', '')
    for (const g of r.plan.gone) out.push(`- \`${g.path}\``)
    out.push('')
  }

  out.push('## Stopped items', '')
  if (report.stopped.length === 0) out.push('None.', '')
  else {
    for (const s of [...report.stopped].sort((a, b) => cmp(a.item, b.item))) out.push(`- \`${s.item}\`: ${s.why}`)
    out.push('')
  }

  out.push('## Text', '')
  out.push(`- Long dashes replaced (A5): ${report.dashes}.`)
  out.push(`- Invisible characters removed: ${report.invisible}.`)
  out.push(`- Count tokens (A6): ${report.tokens.length}.`)
  const tokenKinds = new Map<string, number>()
  for (const t of report.tokens)
    tokenKinds.set(`${t.token} from "${t.from}"`, (tokenKinds.get(`${t.token} from "${t.from}"`) ?? 0) + 1)
  for (const [k, n] of [...tokenKinds.entries()].sort((a, b) => cmp(a[0], b[0]))) out.push(`  - ${k}: ${n}`)
  out.push(`- Landings that passed the text cross-check: ${report.crossChecked.length}.`, '')

  if (report.coverage.length > 0) {
    out.push('## Unique pages', '')
    out.push(
      'Words of the visible text (navbar and footer removed) that no copy block holds; text inside Webflow components is not in the DOM export.',
      '',
    )
    out.push(
      table(
        ['Page', 'Words', 'Not in copy blocks'],
        [...report.coverage].sort((a, b) => cmp(a.page, b.page)).map((c) => [c.page, c.words, c.missing]),
      ),
      '',
    )
  }

  out.push('## Media', '')
  out.push(`- Files: ${r.media.files}.`)
  out.push(`- Bytes: ${r.media.bytes}.`)
  if (r.media.errors.length > 0) {
    out.push(`- Failed: ${r.media.errors.length}.`)
    for (const e of r.media.errors) out.push(`  - ${e}`)
  }
  out.push('')

  if (r.docs) {
    out.push('## Docs map', '')
    out.push(
      `- Rules: ${r.docs.rules.length} (docs items ${r.docs.targets.size}, unmatched ${r.docs.unmatched.length}).`,
      '',
    )
  }

  out.push('## Notes', '')
  if (report.notes.length === 0) out.push('None.')
  for (const n of [...report.notes].sort((a, b) => cmp(a.item, b.item) || cmp(a.note, b.note)))
    out.push(`- \`${n.item}\`: ${n.note}`)
  out.push('')
  return out.join('\n')
}
