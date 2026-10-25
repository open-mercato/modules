// Review r9 (P1), 24 Oct: one finding, one sentence, for people and for agents. A package an app from the empty preset
// registers (here gateway-stripe on 0.9 and next, as events and search are) fails its smoke check there with a 403,
// while its receipt in a new app (classic) passes: a signal in isolation, never the verdict. The module page, the agent
// card, /compat.json and `check_compat` say the same sentence (spec 1.1 item 4).
import { describe, expect, test } from 'vitest'
import { checkCompat } from '../../lib/core/compat.ts'
import { isolationText } from '../../lib/core/policy.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import type { EmitData } from '../../lib/emit/types.ts'
import { Receipt, type Presets } from '../../lib/schema/data/index.ts'
import type { BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import type { CompatIndex } from '../../lib/schema/published/compat.ts'
import type { ModulesIndex } from '../../lib/schema/published/modules.ts'
import { findingOf, whyHtml } from '../../site/src/lib/receipts.ts'
import { OPTS, fixtureData, json, text } from './helpers.ts'

const STRIPE = 'npm:@open-mercato/gateway-stripe'
const ROUTE = 'GET /api/gateway_stripe/health'
const SENTENCE = `${ROUTE} needs the workflows.view feature, and the empty preset does not enable the workflows module.`

function presetData(): { data: EmitData; receipt: Receipt } {
  const data = fixtureData()
  const presets = structuredClone(data.presets) as Presets
  for (const k of ['0.9', 'next'])
    presets[k] = {
      ...presets[k]!,
      empty: [...presets[k]!.empty!, { id: 'gateway_stripe', from: '@open-mercato/gateway-stripe' }],
    }
  const own = data.receipts.get(STRIPE)!
  // the row of the empty preset: its receipt in a new app (the classic copy) stays verified
  const r = structuredClone(own.find((x) => x.om.line === '0.9' && x.om.preset === 'empty')!)
  r.id = 'r_20261023_00000000bb02'
  r.result = { ...r.result, status: 'broken', failedStep: 'smoke', alsoFailed: [], classification: 'module-fail' }
  r.steps = r.steps.map((s) =>
    s.name === 'smoke'
      ? {
          ...s,
          status: 'fail' as const,
          excerpt: `smoke: FAIL module api ${ROUTE} -> 403 (expected 2[0-9][0-9])\n{"error":"Forbidden","requiredFeatures":["workflows.view"]}\nsmoke: 1 check(s) failed`,
        }
      : s,
  )
  r.transition = { from: null, to: 'broken', confirmed: true }
  r.run = { ...r.run, at: '2026-10-23T02:40:00Z' }
  const receipt = Receipt.parse(r)
  const receipts = new Map(data.receipts)
  receipts.set(STRIPE, [...own, receipt])
  return { data: { ...data, presets, receipts }, receipt }
}

describe('one finding sentence everywhere (review r9)', () => {
  const { data, receipt } = presetData()
  const out = buildEmit(data, OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const entry = index.entries.find((e) => e.locator === STRIPE)!
  const found = isolationText(entry.compat.isolation!['0.9']!, '0.9.0')

  test('golden: the entry carries the sentence as the signal in isolation, the verdict stays verified', () => {
    expect(entry.compat.inEmptyPreset).toEqual(['0.9', 'next'])
    expect(entry.compat.lines['0.9']?.status).toBe('verified')
    expect(entry.compat.isolation?.['0.9']).toMatchObject({ status: 'broken', step: 'smoke', finding: SENTENCE })
    // compat.json keeps the verdict; the signal in isolation is modules.json's (budget of the matrix)
    expect(json<CompatIndex>(out, 'compat.json').rows.find((r) => r.locator === STRIPE)?.cells['0.9']?.status).toBe(
      'verified',
    )
    expect(found).toBe(`In isolation (empty preset): broken at smoke on 23 Oct. ${SENTENCE}`)
  })

  test('golden: the agent card says the sentence of the page, never `the smoke step failed`', () => {
    const card = text(out, 'm/@open-mercato/gateway-stripe.md')
    expect(card).toContain(`0.9: ${found}`)
    expect(card).toContain(`broken at smoke, 23 Oct ${OPTS.site}/r/${receipt.id}`)
    expect(card).not.toContain('step failed')
  })

  test('golden: check_compat says the same sentence', () => {
    const r = checkCompat(
      { omVersion: '0.9.0', refs: ['@open-mercato/gateway-stripe'] },
      { entries: index.entries, builtIn: [], lines: index.lines, site: OPTS.site, now: OPTS.now },
    ).results[0]!
    expect(r.status).toBe('verified')
    expect(r.notes).toContain(found.slice(0, 200))
  })

  test('golden: the page reads the same sentence for the receipt behind the cell, identifiers in mono', () => {
    const builtIn = json<BuiltInIndex>(out, 'built-in.json')
    expect(findingOf(receipt, builtIn, entry)).toBe(SENTENCE)
    const html = whyHtml(found)
    expect(html.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ')).toBe(found)
    expect(html).toContain(`<code translate="no">${ROUTE.replace(' ', '\u00a0')}</code>`)
    expect(html).toContain('<code translate="no">workflows.view</code>')
    expect(html).toContain('does not enable the <code translate="no">workflows</code> module.')
    // round 14: the preset in words, as every other sentence (`empty` in mono read as an ID)
    expect(html).toContain('the empty preset does not enable')
    expect(html).not.toContain('<code translate="no">empty</code>')
  })
})
