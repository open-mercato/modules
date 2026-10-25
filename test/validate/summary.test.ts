// $GITHUB_STEP_SUMMARY (spec 5.2 step 4, D27): at most 10 lines per entry whatever the number of findings, author
// text escaped (no HTML, links, images or table breaks), and the whole report readable for a failed entry.
import { describe, expect, it } from 'vitest'
import { escapeCell, MAX_ENTRY_LINES, renderEntry, renderSummary, renderText } from '../../lib/validate/summary.ts'
import type { EntryResult, Finding, ValidateReport } from '../../lib/validate/types.ts'

const finding = (i: number, severity: Finding['severity'] = 'error'): Finding => ({
  step: 'schema',
  severity,
  code: `c${i}`,
  message: `problem number ${i}`,
})
const entry = (o: Partial<EntryResult> = {}): EntryResult => ({
  file: 'modules/@a/b.yml',
  locator: 'npm:@a/b',
  version: '1.0.0',
  status: 'pass',
  findings: [],
  skipped: [],
  rows: [
    { check: 'Kind', result: 'module (b), installable' },
    { check: 'License', result: 'MIT (package.json)' },
    { check: 'Ownership', result: 'Unclaimed (PR author is not repo owner or org member)' },
    { check: 'Anatomy', result: '3 tables · 8 routes (0 public) · 7 permissions · 9 events · 3 queues' },
    { check: 'Fits statically', result: '0.8 ok · 0.9 ok · next ok' },
    { check: 'Built for', result: '>=0.7.0 <0.8.0 (bounded, 2 lines behind) · installable from 2026-10-20' },
    { check: 'Lint', result: '2 warnings: event-prefix, license-mismatch' },
  ],
  durationMs: 1,
  ...o,
})
const report = (entries: EntryResult[], o: Partial<ValidateReport> = {}): ValidateReport => ({
  generatedAt: '2026-10-23T00:00:00Z',
  offline: false,
  changedFrom: 'origin/main',
  entries,
  removed: [],
  global: [],
  notes: [],
  ...o,
})

describe('summary', () => {
  it('renders the spec 5.2 example in 10 lines', () => {
    const lines = renderEntry(entry())
    expect(lines).toEqual([
      '### `npm:@a/b@1.0.0`: passed',
      '| Check | Result |',
      '|---|---|',
      '| Kind | module (b), installable |',
      '| License | MIT (package.json) |',
      '| Ownership | Unclaimed (PR author is not repo owner or org member) |',
      '| Anatomy | 3 tables · 8 routes (0 public) · 7 permissions · 9 events · 3 queues |',
      '| Fits statically | 0.8 ok · 0.9 ok · next ok |',
      '| Built for | &gt;=0.7.0 &lt;0.8.0 (bounded, 2 lines behind) · installable from 2026-10-20 |',
      '| Lint | 2 warnings: event-prefix, license-mismatch |',
    ])
  })

  it('never exceeds 10 lines per entry; errors come first, the rest folds into one row', () => {
    for (const n of [0, 1, 5, 30]) {
      const e = entry({
        status: n ? 'fail' : 'pass',
        findings: [...Array.from({ length: n }, (_, i) => finding(i)), finding(99, 'warning')],
        skipped: [{ step: 'anatomy', reason: 'offline' }],
      })
      const lines = renderEntry(e)
      expect(lines.length).toBeLessThanOrEqual(MAX_ENTRY_LINES)
      if (n > 0) expect(lines[3]).toBe('| Error | problem number 0 |')
      if (n > 6) expect(lines.at(-1)).toMatch(/^\| More \| Error: problem number 6 · /)
    }
  })

  it('escapes author text: no HTML, no links or images, no table breaks, no line breaks', () => {
    const evil =
      '<script>alert(1)</script> [click](https://evil.example) ![img](http://x/y.png) a|b `code` *bold* www.x.y\nnext'
    const cell = escapeCell(evil)
    expect(cell).not.toMatch(/<|>|\n|`/)
    expect(cell).not.toMatch(/https?:\/\//)
    expect(cell).not.toMatch(/(^|[^\\])\[/)
    expect(cell).not.toMatch(/(^|[^\\])\|/)
    expect(cell).toContain('&lt;script&gt;')
    expect(cell).toContain('a\\|b')
    const md = renderSummary(
      report([
        entry({ findings: [{ step: 'schema', severity: 'error', code: 'schema', message: evil }], status: 'fail' }),
      ]),
    )
    expect(md).not.toMatch(/<script|\]\(https?:|!\[img\]\(/)
    // every table row keeps exactly two cells
    for (const l of md.split('\n').filter((x) => x.startsWith('| ')))
      expect(l.replace(/\\\|/g, '').split('|').length, l).toBe(4)
  })

  it('heads the summary with counts, offline note and removed entries; empty diff says so', () => {
    const md = renderSummary(
      report([entry(), entry({ status: 'fail', locator: null, version: null, file: 'modules/x.yml' })], {
        offline: true,
        removed: ['modules/@old/x.yml'],
      }),
    )
    expect(md.split('\n').slice(0, 3)).toEqual([
      '## Catalog check',
      '',
      '2 entries checked: 1 passed, 1 failed. Offline: only the steps without network ran. Removed: modules/@old/x.yml.',
    ])
    expect(md).toContain('### `modules/x.yml`: failed')
    expect(renderSummary(report([]))).toBe('## Catalog check\n\nNo descriptor changes.\n')
  })

  it('the text report lists every finding (the job log has no cap)', () => {
    const e = entry({ status: 'fail', findings: Array.from({ length: 30 }, (_, i) => finding(i)) })
    const text = renderText(report([e]))
    expect(text.split('\n').filter((l) => l.includes('problem number'))).toHaveLength(30)
    expect(text.split('\n').at(-1)).toBe('validate: 1 entries, 1 failed.')
  })
})
