// picker.json for create-mercato-app #8118 (audit of 29 Oct). C30: installByLine has no command on a line whose new app
// (the classic preset) already registers the module, so an app from another preset planned nothing there; the
// additive installEmptyPresetByLine gives the command of an app from the empty preset on each verified line where it
// differs from installByLine.
import { describe, expect, test } from 'vitest'
import { presetsOrFallback } from '../../lib/core/lines.ts'
import { buildPicker } from '../../lib/emit/picker.ts'
import { PickerIndex } from '../../lib/schema/published/picker.ts'
import type { IndexEntry } from '../../lib/schema/published/modules.ts'
import { corpusEntries, fixtureBuiltIn, fixtureEntries, loadFixture, NOW } from '../core/helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines
const presets = presetsOrFallback(fx.presets, lines, NOW)
const entries = fixtureEntries(fx)
const picker = (es: readonly IndexEntry[] = entries, p = presets) =>
  PickerIndex.parse(buildPicker(es, fixtureBuiltIn(fx), lines, p, NOW))
const row = (p: PickerIndex, id: string) => p.modules.find((m) => m.id === id && m.source !== 'core')!

describe('installEmptyPresetByLine (C30)', () => {
  test('a module a new app registers gets the empty preset command on its verified line', () => {
    const stripe = row(picker(), 'gateway_stripe')
    expect(stripe.inPresets).toContain('0.9')
    expect(stripe.installByLine).toEqual({})
    expect(stripe.installEmptyPresetByLine).toEqual({
      '0.9': 'yarn mercato module add @open-mercato/gateway-stripe@0.9.0',
    })
  })

  test('where the empty preset registers it too, yarn add, never module add', () => {
    const both = Object.fromEntries(
      Object.entries(presets).map(([k, v]) => [
        k,
        { ...v, empty: [...v.empty, { id: 'gateway_stripe', from: '@open-mercato/gateway-stripe' }] },
      ]),
    ) as typeof presets
    expect(row(picker(entries, both), 'gateway_stripe').installEmptyPresetByLine).toEqual({
      '0.9': 'yarn add @open-mercato/gateway-stripe@0.9.0',
    })
  })

  test('a module that is in no preset has none: installByLine is already the command', () => {
    const ksef = row(picker(), 'integration_ksef_direct')
    expect(Object.keys(ksef.installByLine).length).toBeGreaterThan(0)
    expect(ksef.installEmptyPresetByLine).toBeUndefined()
    // the enterprise package is in both presets with the same flags
    expect(row(picker(), 'record_locks').installEmptyPresetByLine).toBeUndefined()
  })

  test('a module a new app registers behind an env flag: module add and the flag in an app from the empty preset', () => {
    const e = corpusEntries().find((x) => x.locator === 'npm:@open-mercato/storage-s3')!
    const s3 = { ...e, listed: true, compat: { ...e.compat, verifiedOn: ['0.9'] } }
    const r = row(picker([s3]), 'storage_s3')
    expect(r.installByLine['0.9']).toBe(
      'yarn add @open-mercato/storage-s3@0.9.0 && echo OM_ENABLE_STORAGE_S3=true >> .env && yarn generate',
    )
    expect(r.installEmptyPresetByLine).toEqual({
      '0.9':
        'yarn mercato module add @open-mercato/storage-s3@0.9.0 && echo OM_ENABLE_STORAGE_S3=true >> .env && yarn generate',
    })
  })
})
