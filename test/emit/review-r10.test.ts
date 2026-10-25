// Review r10, after the decision of 24 Oct. (1) The receipts events had on 23 Oct came from an app from the empty preset:
// they are the signal `in isolation`, never the verdict of a line, which a new app (classic) gives; the version a new
// app ships judges a line whose new app registers the package. gateway-stripe stands in for events, as in
// test/emit/finding.test.ts. (2) Every text channel for agents carries the one preview line. (3) The page,
// raw/modules.md and the agent card say the same install sentence for a package a new app registers.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { checkCompat } from '../../lib/core/compat.ts'
import { isolationLineText, presetInstallText } from '../../lib/core/policy.ts'
import { PREVIEW_LINE } from '../../lib/core/source.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import type { EmitData } from '../../lib/emit/types.ts'
import { Receipt, type Presets } from '../../lib/schema/data/index.ts'
import type { ModulesIndex } from '../../lib/schema/published/modules.ts'
import { runTool } from '../../mcp/handlers.ts'
import { createCatalogSource } from '../../mcp/index-cache.ts'
import { explainReceipt, receiptWord, transitionRows } from '../../site/src/lib/receipts.ts'
import { OPTS, ROOT, fixtureData, json, skillsDir, text } from './helpers.ts'

const STRIPE = 'npm:@open-mercato/gateway-stripe'
const ROUTE = 'GET /api/gateway_stripe/health'
const SENTENCE = `${ROUTE} needs the workflows.view feature, and the empty preset does not enable the workflows module.`
const FORBIDDEN = `smoke: FAIL module api ${ROUTE} -> 403 (expected 2[0-9][0-9])\n{"error":"Forbidden","requiredFeatures":["workflows.view"]}\nsmoke: 1 check(s) failed`
const DEVELOP = '0.10.1-develop.7583.1.0c886d0a14'

/** stripe registered by both presets on every line, with the receipts events had on 23 Oct (empty preset). */
function presetData(): { data: EmitData; other: Receipt; shipped: Receipt; nextOther: Receipt } {
  const data = fixtureData()
  const presets = structuredClone(data.presets) as Presets
  for (const k of Object.keys(presets))
    presets[k] = {
      ...presets[k]!,
      empty: [...presets[k]!.empty!, { id: 'gateway_stripe', from: '@open-mercato/gateway-stripe' }],
    }
  const own = data.receipts.get(STRIPE)!
  const base = own.find((x) => x.om.line === '0.9' && x.om.preset === 'empty')!
  const make = (
    id: string,
    line: string,
    om: string,
    version: string,
    at: string,
    step: 'typecheck' | 'smoke',
    from: Receipt['transition']['from'],
  ): Receipt => {
    const r = structuredClone(base)
    r.id = id
    r.om = { ...r.om, line, version: om, createApp: `create-mercato-app@${om}` }
    r.module = { ...r.module!, version }
    r.result = { ...r.result, status: 'broken', failedStep: step, alsoFailed: [], classification: 'module-fail' }
    r.steps = r.steps.map((s) =>
      s.name === step
        ? {
            ...s,
            status: 'fail' as const,
            excerpt:
              step === 'smoke'
                ? FORBIDDEN
                : "src/modules/x.ts(1,1): error TS2561: Object literal may only specify known properties, but 'pinOrganizationId' does not exist",
          }
        : s,
    )
    r.transition = { from, to: 'broken', confirmed: true }
    r.run = { ...r.run, at }
    return Receipt.parse(r)
  }
  // 0.8: the run first installed 0.9.0 into a 0.8.0 app (typecheck), then 0.8.0, the version a new 0.8 app ships
  const other = make('r_20261023_0000000ddc81', '0.8', '0.8.0', '0.9.0', '2026-10-23T14:46:32Z', 'typecheck', null)
  const shipped = make('r_20261023_0000000040d9', '0.8', '0.8.0', '0.8.0', '2026-10-23T18:21:51Z', 'smoke', 'broken')
  // next: 0.9.0 in a develop app, whose new app ships the develop snapshot
  const nextOther = make('r_20261023_000000000abd', 'next', DEVELOP, '0.9.0', '2026-10-23T15:39:42Z', 'smoke', null)
  const receipts = new Map(data.receipts)
  receipts.set(STRIPE, [...own, other, shipped, nextOther])
  return { data: { ...data, presets, receipts }, other, shipped, nextOther }
}

describe('receipts of the empty preset are the signal in isolation (review r10, 24 Oct)', () => {
  const { data, other, shipped, nextOther } = presetData()
  const out = buildEmit(data, OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const entry = index.entries.find((e) => e.locator === STRIPE)!

  test('golden: no receipt of a new app on 0.8 and next: untested there, the empty receipts beside it', () => {
    expect(entry.compat.inPresets).toEqual(['0.8', '0.9', 'next'])
    expect(entry.compat.inEmptyPreset).toEqual(['0.8', '0.9', 'next'])
    expect(entry.compat.ships).toEqual({ '0.8': '0.8.0', '0.9': '0.9.0', next: DEVELOP })
    expect(entry.compat.lines['0.8']).toBeUndefined()
    expect(entry.compat.lines.next).toBeUndefined()
    expect(entry.compat.lines['0.9']?.status).toBe('verified')
    expect(entry.compat.verifiedOn).toEqual(['0.9'])
    expect(entry.compat.isolation?.['0.8']?.receipt).toBe(shipped.id)
    expect(entry.compat.isolation?.['0.8']?.finding).toBe(SENTENCE)
    expect(entry.compat.isolation?.next?.receipt).toBe(nextOther.id)
    expect(isolationLineText(entry, '0.8')).toBe(
      `Not yet tested in a new app on 0.8. In isolation (empty preset): broken at smoke on 23 Oct. ${SENTENCE}`,
    )
    // a receipt of another version in isolation names its version
    expect(isolationLineText(entry, 'next')).toBe(
      `Not yet tested in a new app on next. In isolation (empty preset): 0.9.0 broken at smoke on 23 Oct. ${SENTENCE}`,
    )
  })

  test('golden: /r reads the words of the signal in isolation, a receipt of a new app the dictionary word', () => {
    expect(receiptWord(other)).toBe('in isolation, broken at typecheck')
    expect(receiptWord(shipped)).toBe('in isolation, broken at smoke')
    const verdict = data.receipts.get(STRIPE)!.find((r) => r.om.preset === 'classic')!
    expect(receiptWord(verdict)).toBe('verified')
    // the explanation names the empty preset only for its own receipts
    const builtIn = { modules: [{ id: 'workflows', inPresets: ['0.8', '0.9', 'next'], inEmptyPreset: [] as string[] }] }
    const routes = [
      { method: 'GET', path: '/api/gateway_stripe/health', requireAuth: true, requireFeatures: ['workflows.view'] },
    ]
    expect(explainReceipt(nextOther, builtIn, routes)).toBe(SENTENCE)
    const classic403 = Receipt.parse({ ...nextOther, om: { ...nextOther.om, preset: 'classic' } })
    expect(explainReceipt(classic403, builtIn, routes)).toBe(`${ROUTE} needs the workflows.view feature.`)
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'r', '[id].astro'), 'utf8')
    expect(page).toContain('const own = receiptWord(r)')
  })

  test('golden: Transitions name the receipts in isolation', () => {
    const rows = transitionRows(data.receipts.get(STRIPE)!).map((x) => `${x.r.om.line} ${x.from} -> ${x.to}`)
    expect(rows).toContain('0.8 in isolation: new -> broken at typecheck')
    expect(rows).toContain('next in isolation: new -> broken at smoke')
  })

  test('golden: the card says untested in a new app and the signal in isolation in its own column', () => {
    const card = text(out, 'm/@open-mercato/gateway-stripe.md')
    expect(card).toContain('| Line | Module | Status | Since | Receipt | In isolation (empty preset) |')
    // the version a new app has on the line in its own column, and the isolation receipt's version where it tested
    // another one (review of 24 Oct)
    expect(card).toContain(
      `| next (${DEVELOP}) | ${DEVELOP} | untested | - | - | 0.9.0 broken at smoke, 23 Oct ${OPTS.site}/r/${nextOther.id} |`,
    )
    expect(card).toContain(isolationLineText(entry, '0.8')!)
    const raw = text(out, 'raw/modules.md')
    const block = raw.slice(raw.indexOf('### Stripe'), raw.indexOf('Card:', raw.indexOf('### Stripe')))
    expect(block).toContain('Already on in a new app on 0.8, 0.9 and next.\n')
  })

  test('golden: compat.json counts the cell as untested, the signal in isolation stays in modules.json', () => {
    const compat = json<{ rows: { locator: string; cells: Record<string, { status: string }> }[] }>(out, 'compat.json')
    const row = compat.rows.find((x) => x.locator === STRIPE)!
    expect(row.cells.next?.status).toBe('untested')
    expect(row.cells['0.8']?.status).toBe('untested')
    expect(Object.keys(row)).not.toContain('isolation')
    expect(entry.compat.isolation?.['0.8']?.status).toBe('broken')
  })

  test('golden: the page, raw/modules.md and the agent card say the same install sentence (spec 1.1 item 4)', () => {
    const sentence = presetInstallText(entry.moduleIds)
    expect(sentence).toBe('Nothing to install: a new app already registers gateway_stripe in src/modules.ts.')
    const raw = text(out, 'raw/modules.md')
    const block = raw.slice(raw.indexOf('### Stripe'), raw.indexOf('Card:', raw.indexOf('### Stripe')))
    expect(block).toContain(sentence)
    expect(block).toContain('Level: Verified on 0.9 · official')
    expect(block).not.toContain('Install: ')
    const card = text(out, 'm/@open-mercato/gateway-stripe.md')
    expect(card).toContain('\ninstall: null\n')
    expect(card).not.toContain('install_empty_preset')
    expect(card).toContain(`## Install plan (0.9)\n${sentence}\n`)
    // the module page hands the install box the same sentence (site/src/pages/m/[...path].astro)
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'm', '[...path].astro'), 'utf8')
    expect(page).toContain('shippedText: presetInstallText(entry.moduleIds)')
  })
})

/** The fixture with every receipt from the local preview runner. */
function previewData(): EmitData {
  const data = fixtureData({ skills: skillsDir() })
  const preview = (r: Receipt): Receipt => ({ ...r, harness: { ...r.harness, runner: 'preview-docker' } })
  data.baseline = data.baseline.map(preview)
  for (const [k, list] of data.receipts) data.receipts.set(k, list.map(preview))
  return data
}

/** llms.txt, llms-full.txt, raw/modules.md and every agent card. */
const channels = (files: Map<string, string | Uint8Array>): string[] =>
  [...files.keys()].filter((p) => ['llms.txt', 'llms-full.txt', 'raw/modules.md'].includes(p) || /^m\/.+\.md$/.test(p))

describe('one preview line in every text channel for agents (review r10)', () => {
  const preview = buildEmit(previewData(), OPTS)
  const ci = buildEmit(fixtureData({ skills: skillsDir() }), OPTS)

  test('golden: llms.txt, llms-full.txt, raw/modules.md and every card carry it on preview data, none on CI data', () => {
    const paths = channels(preview.public)
    expect(paths.length).toBeGreaterThan(8)
    for (const p of paths) expect(text(preview, p), p).toContain(PREVIEW_LINE)
    for (const p of channels(ci.public)) expect(text(ci, p), p).not.toContain(PREVIEW_LINE)
    // raw/modules.md says it under its heading, before any `Verified on`
    const raw = text(preview, 'raw/modules.md')
    expect(raw.indexOf(PREVIEW_LINE)).toBeLessThan(raw.indexOf('Verified on'))
  })

  test('golden: get_module warns with it first, check_compat notes it first', async () => {
    const files = preview.public
    const site = OPTS.site
    const source = createCatalogSource({
      indexUrl: `${site}/modules.json`,
      fetch: async (url) => {
        const body = files.get(decodeURIComponent(url.slice(site.length + 1)))
        return body === undefined ? new Response('nf', { status: 404 }) : new Response(body as string)
      },
    })
    const got = await runTool('get_module', { ref: 'npm:@fastwhitecat/integration-ksef-direct' }, source, OPTS.now)
    expect(got.ok && got.value.warnings[0]).toBe(PREVIEW_LINE)
    const index = json<ModulesIndex>(preview, 'modules.json')
    const r = checkCompat(
      { refs: ['npm:@fastwhitecat/integration-ksef-direct'], omVersion: '0.9.0' },
      {
        entries: index.entries,
        builtIn: [],
        lines: index.lines,
        site,
        now: OPTS.now,
        receiptSource: index.dataAsOf.source ?? null,
      },
    ).results[0]!
    expect(r.notes[0]).toBe(PREVIEW_LINE)
  })
})
