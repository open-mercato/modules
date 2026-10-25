// Contrast check of spec 7.9 (WP11 acceptance): every pair meets WCAG and matches the value printed in the spec.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrast, pairs } from './contrast.ts'

const ROOT = join(import.meta.dirname, '..', '..')

describe('colour contrast (spec 7.9)', () => {
  for (const p of pairs(ROOT)) {
    it(`${p.name}: ${p.fg} on ${p.bg}`, () => {
      const c = contrast(p.fg, p.bg)
      expect(c).toBeGreaterThanOrEqual(p.min)
      if (p.spec !== undefined) expect(Math.abs(c - p.spec)).toBeLessThan(0.03)
    })
  }
  it('knows the extremes', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })
})
