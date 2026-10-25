// Review r8 (P1): the run panel of / names the span of the receipts its counts come from, not the newest baseline.
// On the preview data 58 of the 74 verified cells came from the 09:27 run, judged against the 09:27 baseline, while
// the panel said `baseline 23 Oct 14:47 · last receipt 18:21 UTC`.
import { describe, expect, test } from 'vitest'
import { baselineNote, receiptSpan } from '../../site/src/lib/freshness.ts'

const cells = [
  { at: '2026-10-23T09:27:06Z' },
  { at: '2026-10-23T14:47:00Z' },
  { at: null },
  { at: '2026-10-23T18:21:51Z' },
  { at: '2026-10-23T09:27:06Z' },
]

describe('receiptSpan (review r8)', () => {
  test('golden: from the oldest to the newest counted cell, without a dash', () => {
    const span = receiptSpan(cells)
    expect(span?.text).toBe('receipts 23 Oct 09:27 to 18:21 UTC')
    expect(span?.text).toContain('09:27')
    expect(span?.text).not.toMatch(/[–—-]/)
  })

  test('a span over two days names both days; one receipt names one time', () => {
    expect(receiptSpan([{ at: '2026-10-22T23:50:00Z' }, { at: '2026-10-23T02:10:00Z' }])?.text).toBe(
      'receipts 22 Oct 23:50 to 23 Oct 02:10 UTC',
    )
    expect(receiptSpan([{ at: '2026-10-23T02:10:00Z' }])?.text).toBe('receipts 23 Oct 02:10 UTC')
    expect(receiptSpan([{ at: null }])).toBeNull()
  })

  test('a line names its baseline only when it is not where the span starts', () => {
    const span = receiptSpan(cells)
    expect(baselineNote('2026-10-23T14:47:00Z', span)).toBe('14:47 UTC')
    expect(baselineNote('2026-10-23T09:27:06Z', span)).toBe('')
    expect(baselineNote('2026-10-22T09:27:06Z', span)).toBe('22 Oct 09:27 UTC')
    expect(baselineNote(null, span)).toBe('')
  })
})
