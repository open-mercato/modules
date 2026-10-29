// Audit of 29 Oct (R7): a stored preset list belongs to the Open Mercato version it was read from. When `watch` moves a
// line (a new develop snapshot under `next`, a patch under `0.9`), the lists of the old version no longer say what a
// new app has, the same rule the writer keeps (lib/receipts/state.ts: a line whose version changed starts a new entry).
import { describe, expect, test } from 'vitest'
import { newAppLines, presetsOrFallback, registeredIn, type LineInfo } from '../../lib/core/lines.ts'

const AT = '2026-10-29T03:00:00Z'
const OLD = '0.10.1-develop.7583.1.0c886d0a14'
const NEW = '0.10.1-develop.7650.1.1a2b3c4d5e'
const stored = {
  next: {
    omVersion: OLD,
    empty: [{ id: 'auth', from: '@open-mercato/core' }],
    classic: [
      { id: 'auth', from: '@open-mercato/core' },
      { id: 'old_one', from: '@open-mercato/old-one' },
    ],
    at: '2026-10-28T03:00:00Z',
  },
}
const line = (
  version: string,
): LineInfo & { defaultPreset: { id: string; modules: { id: string; from: string }[] } } => ({
  key: 'next',
  version,
  source: 'develop',
  defaultPreset: {
    id: 'classic',
    modules: [
      { id: 'auth', from: '@open-mercato/core' },
      { id: 'new_one', from: '@open-mercato/new-one' },
    ],
  },
})

describe('a stored preset list is used only on its own version (R7)', () => {
  test('a line that moved to a new version takes the lists of that version', () => {
    const lines = [line(NEW)]
    const out = presetsOrFallback(stored, lines, AT)
    expect(out.next?.omVersion).toBe(NEW)
    expect(out.next?.classic).toEqual(lines[0]!.defaultPreset.modules)
    expect(out.next?.empty.some((m) => m.from === '@open-mercato/events')).toBe(true)
    expect(registeredIn(out, 'next', 'classic', '@open-mercato/old-one')).toBe(false)
    expect(newAppLines(out, lines, '@open-mercato/new-one')).toEqual(['next'])
  })

  test('the same version keeps the stored lists', () => {
    const lines = [line(OLD)]
    const out = presetsOrFallback(stored, lines, AT)
    expect(out.next?.omVersion).toBe(OLD)
    expect(out.next?.classic).toEqual(stored.next.classic)
    expect(out.next?.empty).toEqual(stored.next.empty)
    expect(newAppLines(out, lines, '@open-mercato/old-one')).toEqual(['next'])
  })

  test('a stored line that is not among the lines stays as it is', () => {
    const out = presetsOrFallback(stored, [], AT)
    expect(out.next?.omVersion).toBe(OLD)
    expect(out.next?.classic).toEqual(stored.next.classic)
  })
})
