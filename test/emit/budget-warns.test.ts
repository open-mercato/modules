// Owner decision H of 25 Oct: compat.json has an 80 KB budget, and a file over any budget is a warning of
// `yarn om emit`, never a failed build or CI check.
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { checkBudgets, COMPAT_MAX_BYTES } from '../../lib/emit/budgets.ts'
import emit from '../../lib/commands/emit.ts'
import { DATA, DESCRIPTORS, NOW, ROOT, skillsDir, tmp } from './helpers.ts'

const KB = 1024
const compatOf = (bytes: number) => new Map([['compat.json', 'x'.repeat(bytes)]])

describe('compat.json budget (H)', () => {
  test('80 KB raw: 79 KB passes, 81 KB is one issue against 80 KB', () => {
    expect(COMPAT_MAX_BYTES).toBe(80 * KB)
    expect(checkBudgets(compatOf(79 * KB))).toEqual([])
    expect(checkBudgets(compatOf(81 * KB))).toEqual([
      { path: 'compat.json', label: 'compat.json', bytes: 81 * KB, max: 80 * KB, gzip: false },
    ])
  })

  test('emit over budget prints a warning and exits 0', async () => {
    const budgets = await import('../../lib/emit/budgets.ts')
    const spy = vi
      .spyOn(budgets, 'checkBudgets')
      .mockReturnValue([{ path: 'compat.json', label: 'compat.json', bytes: 90 * KB, max: 80 * KB, gzip: false }])
    const errors: string[] = []
    const log = console.log
    const err = console.error
    console.log = () => {}
    console.error = (...a: unknown[]) => void errors.push(a.join(' '))
    try {
      const code = emit({
        args: ['--to', join(tmp(), 'generated'), '--modules', DESCRIPTORS, '--now', NOW, '--skills', skillsDir()],
        flags: { data: DATA, out: 'out', offline: true, json: false },
        root: ROOT,
      })
      expect(code).toBe(0)
    } finally {
      console.log = log
      console.error = err
      spy.mockRestore()
    }
    expect(errors).toContain('om emit: over budget: compat.json 90.0 KB > 80.0 KB (compat.json)')
  })
})
