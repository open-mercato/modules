// The final review of the two presets (24 Oct): a package a new app ships on next runs on the weekly night only, and the
// plan and every queue sentence of the site say so through one predicate (lib/core/lines.ts `cellCadence`), in CI and
// in a preview build. The review found the site promising `tonight` six nights of seven.
import { describe, expect, it } from 'vitest'
import { cellCadence, presetsOrFallback, registeredIn } from '../../lib/core/lines.ts'
import { previewQueued, previewQueuedLines, PREVIEW_QUEUED } from '../../lib/core/source.ts'
import type { Matrix, MatrixCell } from '../../lib/receipts/matrix.ts'
import { cadenceSentence, queuedCellSentence, queuedCellsSentence, type Schedule } from '../../site/src/lib/schedule.ts'
import { loadFixture, LOC, NIGHT, plan, SUNDAY } from './helpers.ts'

const fx = loadFixture()
const TUESDAY = '2026-10-27T02:17:00Z'
const sched: Schedule = { nightly: '02:17 UTC', weeklyDay: 'Sunday', ageGateDays: 5 }
const of = (m: Matrix, loc: string | null, line: string, preset: 'classic' | 'empty'): MatrixCell | undefined =>
  m.cells.find((c) => c.locator === loc && c.line === line && c.preset === preset && c.mode === 'realistic')

describe('when a cell of a new app runs: one predicate for the plan and the site (P1)', () => {
  const presets = presetsOrFallback(fx.presets, fx.lines.lines, NIGHT)
  const line = (key: string) => fx.lines.lines.find((l) => l.key === key)!

  it('golden: on a regular night the plan runs exactly the cells whose cadence says nightly', () => {
    const regular = plan(fx, { onlyPresets: ['classic'], now: TUESDAY })
    const weekly = plan(fx, { onlyPresets: ['classic'], now: SUNDAY })
    for (const l of fx.lines.lines)
      for (const loc of [LOC.stripe, LOC.ksef]) {
        const inPreset = registeredIn(presets, l.key, 'classic', loc.slice(4))
        const cadence = cellCadence(l, inPreset)
        expect(!!of(regular, loc, l.key, 'classic'), `${loc} on ${l.key}`).toBe(cadence === 'nightly')
        // the weekly night runs them all
        expect(!!of(weekly, loc, l.key, 'classic'), `${loc} on ${l.key} (Sunday)`).toBe(true)
      }
    // gateway-stripe is in the classic preset; on next its cell waits for the weekly night, with the plan's reason
    expect(cellCadence(line('next'), true)).toBe('weekly')
    expect(cellCadence(line('next'), false)).toBe('nightly')
    expect(regular.notRun.find((x) => x.locator === LOC.stripe && x.line === 'next')?.reason).toMatch(/weekly night$/)
  })

  it('golden: the queue sentences of the site read the same predicate, in CI and in a preview run', () => {
    // the cell of gateway-stripe on next, as the strip, the drawer, the install box and /compat say it
    expect(queuedCellSentence(line('next'), true, false, sched)).toBe("Queued for Sunday's run (02:17 UTC).")
    expect(queuedCellSentence(line('next'), true, true, sched)).toBe('Queued for the first weekly CI run (Sundays).')
    expect(queuedCellSentence(line('next'), false, false, sched)).toBe("Queued for tonight's run (02:17 UTC).")
    expect(queuedCellSentence(line('next'), false, true, sched)).toBe(PREVIEW_QUEUED)
    // 0.8 runs on Sundays for every package
    expect(queuedCellSentence(line('0.8'), false, true, sched)).toBe('Queued for the first weekly CI run (Sundays).')
    const all = fx.lines.lines.map((l) => ({ ...l }))
    expect(queuedCellsSentence(all, ['0.8', '0.9', 'next'], false, sched)).toBe(
      'Queued: 0.9 tonight (02:17 UTC), 0.8 and next on Sunday.',
    )
    expect(queuedCellsSentence(all, ['0.8', '0.9', 'next'], true, sched)).toBe(
      'Queued for the first CI runs: 0.9 nightly, 0.8 and next weekly (Sundays).',
    )
    expect(queuedCellsSentence(all, [], true, sched)).toBe(
      'Queued for the first CI runs: 0.9 and next nightly, 0.8 weekly (Sundays).',
    )
    expect(previewQueuedLines([{ key: '0.9', cadence: 'nightly' }], 'Sunday')).toBe(PREVIEW_QUEUED)
    expect(previewQueued('weekly', null)).toBe('Queued for the first weekly CI run.')
    // the header of /compat names the packages a new app already has (lines in the order of the page)
    const ordered = ['0.8', '0.9', 'next'].map(line)
    expect(cadenceSentence(ordered, sched, true, ['next'])).toBe(
      'Planned runs: 0.9 and next every night, 0.8 every Sunday. A package a new app already has runs on next every Sunday only.',
    )
    expect(cadenceSentence(ordered, sched, false, [])).toBe('Runs: 0.9 and next every night, 0.8 every Sunday.')
  })
})
