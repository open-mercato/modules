// Audit of 29 Oct (C01, C07): src/modules.ts of a new app (the classic preset) registers storage_s3 behind
// OM_ENABLE_STORAGE_S3, and `yarn mercato module add` on 0.9.0 then adds a second entry with no condition
// (open-mercato#8112). A new app adds the package and sets the flag; an app from the empty preset, which has no such
// block, keeps `module add` and sets the flag too (core attachments read it for S3 partitions).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { presetsOrFallback } from '../../lib/core/lines.ts'
import { PRESET_FLAGS, planInstall, presetFlagOf, type PlanContext } from '../../lib/core/plan.ts'
import { promptParts } from '../../lib/core/prompt.ts'
import { buildPicker } from '../../lib/emit/picker.ts'
import type { IndexEntry } from '../../lib/schema/published/modules.ts'
import { installExample } from '../../site/src/components/catalog/cards.ts'
import { corpusBuiltIn, corpusEntries, fixtureBuiltIn, loadFixture, NOW, ROOT } from './helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines
const presets = presetsOrFallback(fx.presets, lines, NOW)
const S3 = 'npm:@open-mercato/storage-s3'
const s3 = (): IndexEntry => {
  const e = corpusEntries().find((x) => x.locator === S3)!
  return { ...e, listed: true, compat: { ...e.compat, verifiedOn: ['0.9'] } }
}
const ctx: PlanContext = {
  entries: corpusEntries().map((e) => (e.locator === S3 ? s3() : e)),
  builtIn: corpusBuiltIn(),
  lines,
  presets,
  now: NOW,
}
const FLAG = 'echo OM_ENABLE_STORAGE_S3=true >> .env'

describe('a module the classic preset registers behind an env flag', () => {
  test('the flags are the ones of the 0.8.0 and 0.9.0 templates', () => {
    for (const v of ['0.8.0', '0.9.0']) {
      const t = readFileSync(join(ROOT, 'test', 'fixtures', 'create-app', `modules-${v}.ts.txt`), 'utf8')
      for (const f of PRESET_FLAGS)
        expect(t, v).toContain(
          `if (parseBooleanWithDefault(process.env.${f.env}, false)) {\n  enabledModules.push({ id: '${f.id}', from: '${f.from}' })`,
        )
    }
    expect(presetFlagOf(s3())?.env).toBe('OM_ENABLE_STORAGE_S3')
    expect(presetFlagOf(corpusEntries().find((e) => e.locator === 'npm:@open-mercato/gateway-stripe')!)).toBeNull()
  })

  test('a new app adds the package and sets the flag; no module add', () => {
    const plan = planInstall({ refs: [S3], app: { omVersion: '0.9.0' } }, ctx)
    expect(plan.commands).toEqual(['yarn add @open-mercato/storage-s3@0.9.0', FLAG])
    expect(plan.commands.join('\n')).not.toContain('module add')
    expect(plan.then).toContain('yarn generate')
    expect(plan.then[0]).toBe(
      'A new app registers storage_s3 in src/modules.ts behind OM_ENABLE_STORAGE_S3, so yarn add and the flag turn it on. yarn mercato module add would register it a second time.',
    )
    // an app from the empty preset has no such block: module add, then the flag
    expect(plan.emptyPreset?.commands).toEqual(['yarn mercato module add @open-mercato/storage-s3@0.9.0', FLAG])
  })

  test('the picker gives a new app the same command on every verified line', () => {
    const p = buildPicker([s3()], fixtureBuiltIn(fx), lines, presets, NOW)
    const row = p.modules.find((m) => m.id === 'storage_s3')!
    expect(row.installByLine).toEqual({ '0.9': `yarn add @open-mercato/storage-s3@0.9.0 && ${FLAG}` })
    expect(row.install).toBe(row.installByLine['0.9'])
  })

  test('the agent prompt sends the agent to the plan, with no module add', () => {
    expect(promptParts(s3(), { site: 'https://example.com', line: '0.9' }).command).toBeNull()
  })

  test('the example of How to add a module is never such a module', () => {
    const e = s3()
    expect(installExample([{ ...e, type: 'official' }], { key: '0.9' })).toBeNull()
  })
})
