// Round 13: freighttech shipment-tracking in a new app (classic) of 0.8, the preview night of 24 Oct. `module add`
// ran `yarn mercato generate`, which refused /backend/webhooks: the webhooks module of a new app (from
// @open-mercato/webhooks) already has that backend page. The log is the real tail of
// out/preview/1792876663/artifacts/cell-f1e0a350281f-0.8-a2/add.log.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyStep } from '../../lib/receipts/classify.ts'
import { duplicateRoute, duplicateRouteText, explainFailure, findingText } from '../../lib/core/finding.ts'
import { appModules, newAppContext } from '../../site/src/lib/receipts.ts'
import { ROOT } from './helpers.ts'

const LOG = readFileSync(
  join(ROOT, 'test', 'fixtures', 'logs', 'freighttech-shipment-tracking-classic-0.8-add.log.txt'),
  'utf8',
)

const SENTENCE =
  'In a new app from the default preset, the module adds the backend route /backend/webhooks, which the webhooks module (@open-mercato/webhooks) already has.'

/** What a new app of 0.8 registers, as the site data says it (built-in.json and modules.json). */
const APP = appModules({
  builtIn: { modules: [{ id: 'auth', inPresets: ['0.8', '0.9', 'next'], inEmptyPreset: ['0.8', '0.9', 'next'] }] },
  modules: {
    entries: [
      { npm: '@open-mercato/webhooks', moduleIds: ['webhooks'], compat: { inPresets: ['0.8', '0.9', 'next'] } },
      { npm: '@freighttech/shipment-tracking', moduleIds: ['shipment_tracking'], compat: {} },
    ],
  },
})

describe('a duplicate backend route (generate)', () => {
  it('classifies the add step as module-fail with the excerpt at the generate error', () => {
    const f = classifyStep('add', LOG, { attempt: 2 })
    expect(f.classification).toBe('module-fail')
    expect(f.rule).toBe('duplicate-route')
    expect(f.excerpt?.split('\n')[0]).toMatch(/^\[generate\] Duplicate backend route pattern "\/backend\/webhooks"/)
    expect(duplicateRoute(f.excerpt)).toEqual({
      route: '/backend/webhooks',
      modules: ['webhooks', 'shipment_tracking'],
    })
  })

  it('names the preset, the route and the package that has it, the same on the page, the drawer and /r', () => {
    const f = classifyStep('add', LOG, { attempt: 2 })
    const ctx = newAppContext(APP, '0.8', undefined, 'classic')
    expect(explainFailure('add', f.excerpt, ctx)).toBe(SENTENCE)
    const receipt = {
      result: { status: 'broken', failedStep: 'add' },
      steps: [{ name: 'add', excerpt: f.excerpt }],
    }
    // after `Found while testing on 0.8:` the sentence continues in lower case
    expect(findingText(receipt, ctx)).toBe(`i${SENTENCE.slice(1)}`)
  })

  it('a built-in module is called built-in; the empty preset is named; without the app both modules are named', () => {
    const d = { route: '/backend/sales', modules: ['sales', 'my_sales'] as const }
    expect(
      duplicateRouteText(d, {
        preset: 'empty',
        registeredBy: (id) => (id === 'sales' ? '@open-mercato/core' : undefined),
      }),
    ).toBe(
      'In an app from the empty preset, the module adds the backend route /backend/sales, which the built-in sales module already has.',
    )
    expect(duplicateRouteText(d)).toBe('Two modules generate the backend route /backend/sales: sales and my_sales.')
  })
})

describe('scripts/reexcerpt.ts', () => {
  it('re-reads the excerpt of a preview receipt from its log, keeping id, status and transition', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync: read } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { pathToFileURL } = await import('node:url')
    const { reexcerptData } = await import('../../scripts/reexcerpt.ts')
    const root = mkdtempSync(join(tmpdir(), 'om-reexcerpt-'))
    const logs = join(root, 'cell')
    mkdirSync(logs)
    writeFileSync(join(logs, 'add.log'), LOG)
    const old = classifyStep('add', LOG.replace(/Duplicate backend route pattern/g, 'Duplicate route'), { attempt: 2 })
    const receipt = {
      ...JSON.parse(
        read(
          join(ROOT, 'test', 'fixtures', 'data', 'receipts', '@fastwhitecat', 'integration-ksef-direct.jsonl'),
          'utf8',
        ).split('\n')[0]!,
      ),
    }
    receipt.steps = receipt.steps.map((s: { name: string }) =>
      s.name === 'add'
        ? { ...s, status: 'fail', excerpt: old.excerpt, signature: old.signature }
        : { ...s, status: 'skipped', sec: null, excerpt: null, signature: null },
    )
    receipt.result = { ...receipt.result, status: 'broken', failedStep: 'add', classification: 'module-fail' }
    receipt.run = { ...receipt.run, url: pathToFileURL(`${logs}/`).href }
    mkdirSync(join(root, 'data', 'receipts', '@x'), { recursive: true })
    const file = join(root, 'data', 'receipts', '@x', 'y.jsonl')
    writeFileSync(file, `${JSON.stringify(receipt)}\n`)
    expect(reexcerptData(join(root, 'data'), true).changed).toEqual([`${receipt.id} add: duplicate-route`])
    expect(read(file, 'utf8')).toBe(`${JSON.stringify(receipt)}\n`)
    reexcerptData(join(root, 'data'))
    const after = JSON.parse(read(file, 'utf8').trim())
    expect(after.steps.find((s: { name: string }) => s.name === 'add').excerpt).toMatch(
      /^\[generate\] Duplicate backend route/,
    )
    expect({ id: after.id, result: after.result, transition: after.transition }).toEqual({
      id: receipt.id,
      result: receipt.result,
      transition: receipt.transition,
    })
    expect(reexcerptData(join(root, 'data')).changed).toEqual([])
  })
})

describe('an excerpt collected before the rule', () => {
  it('a Yarn progress line is no finding: the step name alone', async () => {
    const { findingText, stepErrorText } = await import('../../lib/core/finding.ts')
    const receipt = {
      result: { status: 'broken', failedStep: 'add' },
      steps: [{ name: 'add', excerpt: '➤ YN0000: · Yarn 4.17.1\n➤ YN0000: ┌ Resolution step' }],
    }
    expect(stepErrorText(receipt)).toBe('')
    expect(findingText(receipt)).toBe('add failed.')
  })
})
