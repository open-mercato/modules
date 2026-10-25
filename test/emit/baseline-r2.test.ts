// The final review of the two presets (24 Oct): the packages a red baseline of a new app is held against reach
// compat.json, and `health` runs the migration of 24 Oct by itself, once (the marker migrations.json).
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import health from '../../lib/commands/health.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import { MIGRATIONS_FILE, presetModelPending } from '../../lib/receipts/preset-model.ts'
import { Receipt } from '../../lib/schema/data/index.ts'
import type { CompatIndex } from '../../lib/schema/published/compat.ts'
import { DATA, DESCRIPTORS, NOW, OPTS, ROOT, fixtureData, json, skillsDir } from './helpers.ts'

describe('compat.json names the packages a red baseline is held against (P2)', () => {
  test('golden: baselineCulprits per line, absent without them', () => {
    const d = fixtureData({ skills: skillsDir() })
    const plain = json<CompatIndex>(buildEmit(d, OPTS), 'compat.json')
    expect(plain.baselineCulprits).toBeUndefined()
    const baseline = d.baseline.map((r) =>
      r.om.line === '0.9' && r.om.preset === 'classic'
        ? Receipt.parse({
            ...r,
            result: {
              ...r.result,
              status: 'harness-red',
              failedStep: 'smoke',
              classification: 'harness-red',
              culprits: ['@open-mercato/gateway-stripe'],
            },
          })
        : r,
    )
    const compat = json<CompatIndex>(buildEmit({ ...d, baseline }, OPTS), 'compat.json')
    expect(compat.baseline['0.9']?.status).toBe('harness-red')
    expect(compat.baselineCulprits).toEqual({ '0.9': ['@open-mercato/gateway-stripe'] })
  })
})

describe('health runs the migration of 24 Oct by itself, once (P3)', () => {
  test('golden: the first health with a receipt of a new app writes the marker; the next run leaves it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'om-presets-r2-health-'))
    cpSync(DATA, dir, { recursive: true })
    expect(presetModelPending(dir)).toBe(true)
    const run = () => {
      const log = console.log
      const err = console.error
      console.log = () => {}
      console.error = () => {}
      try {
        return health({
          args: ['--changed', '--modules', DESCRIPTORS, '--now', NOW],
          flags: { data: dir, out: 'out', offline: true, json: false },
          root: ROOT,
        })
      } finally {
        console.log = log
        console.error = err
      }
    }
    expect(run()).toBe(0)
    expect(existsSync(join(dir, MIGRATIONS_FILE))).toBe(true)
    const marker = JSON.parse(readFileSync(join(dir, MIGRATIONS_FILE), 'utf8')) as Record<string, { since: string }>
    expect(marker['preset-model']?.since).toBe('2026-10-23T02:17:00Z')
    expect(presetModelPending(dir)).toBe(false)
    const before = readFileSync(join(dir, MIGRATIONS_FILE), 'utf8')
    expect(run()).toBe(0)
    expect(readFileSync(join(dir, MIGRATIONS_FILE), 'utf8')).toBe(before)
  })
})
