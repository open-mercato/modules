// Review round 1 of the two presets (24 Oct). (1) One version per line for a new app: on a line whose new app already
// registers the package (gateway-stripe stands in for checkout), check_compat, plan_install (MCP and plans.json), the
// /compat cell and the agent card all name the version a new app ships there (0.8.0 on 0.8, the develop snapshot on
// next), and builtFor, fitsStatically and the popover's peers describe that version. (2) No unlabeled `module add`
// next to `allow` and `Nothing to install` in search_modules. (3) The empty preset's command says when that very
// version broke in isolation.
import { describe, expect, test } from 'vitest'
import {
  INSTALLABLE_META_KEY,
  emptyCommandCaution,
  emptyPresetVersion,
  presetInstallText,
} from '../../lib/core/policy.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import type { EmitData } from '../../lib/emit/types.ts'
import type { CompatIndex } from '../../lib/schema/published/compat.ts'
import type { ModulesIndex } from '../../lib/schema/published/modules.ts'
import type { InstallPlan } from '../../lib/schema/tools.ts'
import { Receipt, type FitCell } from '../../lib/schema/data/index.ts'
import { runTool } from '../../mcp/handlers.ts'
import { createCatalogSource } from '../../mcp/index-cache.ts'
import { cellPeers, cellVersion, metaLine } from '../../site/src/lib/compat-cells.ts'
import { OPTS, fixtureData, json, skillsDir, text } from './helpers.ts'

const STRIPE = 'npm:@open-mercato/gateway-stripe'
const DEVELOP = '0.10.1-develop.7583.1.0c886d0a14'

/** The fixture plus the static fit of gateway-stripe 0.8.0 in a 0.8.0 app, the version a new 0.8 app ships. */
function data(): EmitData {
  const d = fixtureData({ skills: skillsDir() })
  const fit = new Map(d.fit)
  const on08 = structuredClone(fit.get('0.8.0')!)
  const cell: FitCell = {
    status: 'drift',
    checked: 50,
    missing: [],
    drift: [],
    declared: { range: '0.8.0', kind: 'exact-pin', satisfied: true },
    hostDuplicates: [],
  }
  on08.cells[`${STRIPE}@0.8.0`] = cell
  fit.set('0.8.0', on08)
  return { ...d, fit }
}

function source(files: Map<string, string | Uint8Array>) {
  const site = OPTS.site
  return createCatalogSource({
    indexUrl: `${site}/modules.json`,
    fetch: async (url) => {
      const body = files.get(decodeURIComponent(url.slice(site.length + 1)))
      return body === undefined ? new Response('nf', { status: 404 }) : new Response(body as string)
    },
  })
}

describe('one version per line for a new app (presets review r1, P1)', () => {
  const out = buildEmit(data(), OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const entry = index.entries.find((e) => e.locator === STRIPE)!
  const compat = json<CompatIndex>(out, 'compat.json')
  const row = compat.rows.find((r) => r.locator === STRIPE)!
  const plans = JSON.parse(out.site.get('plans.json') as string) as Record<string, Record<string, InstallPlan | null>>
  const card = text(out, 'm/@open-mercato/gateway-stripe.md')
  const src = source(out.public)
  const omOf = (line: string) => index.lines.find((l) => l.key === line)!.version
  /** The `Module` column of the card's table row of a line. */
  const cardVersion = (line: string): string | undefined =>
    card
      .split('\n')
      .find((l) => l.startsWith(`| ${line} (`))
      ?.split('|')[2]
      ?.trim()

  test('golden: the version a new app ships, the same in check_compat, plan_install, plans.json, /compat and the card', async () => {
    expect(entry.compat.ships).toEqual({ '0.8': '0.8.0', '0.9': '0.9.0', next: DEVELOP })
    for (const [line, want] of [
      ['0.8', '0.8.0'],
      ['0.9', '0.9.0'],
      ['next', DEVELOP],
    ] as const) {
      const cc = await runTool('check_compat', { refs: [STRIPE], omVersion: omOf(line) }, src, OPTS.now)
      expect(cc.ok && cc.value.results[0]!.version, `check_compat ${line}`).toBe(want)
      const plan = await runTool('plan_install', { refs: [STRIPE], app: { omVersion: omOf(line) } }, src, OPTS.now)
      expect(plan.ok && plan.value.order[0]!.version, `plan_install ${line}`).toBe(want)
      // the plan of the page (InstallPlan's header reads order[0].version)
      expect(plans[STRIPE]![line]!.order[0]!.version, `plans.json ${line}`).toBe(want)
      expect(row.cells[line]?.moduleVersion ?? cellVersion(row, line), `/compat ${line}`).toBe(want)
      expect(cardVersion(line), `card ${line}`).toBe(want)
    }
  })

  test('golden: builtFor and fitsStatically describe that version, or say they cannot', async () => {
    const cc08 = await runTool('check_compat', { refs: [STRIPE], omVersion: '0.8.0' }, src, OPTS.now)
    const r08 = cc08.ok ? cc08.value.results[0]! : null
    // checkout-like: 0.8.0 pins 0.8.0, so its peers accept 0.8 (review: `Built for 0.9.0 (peers reject 0.8)`)
    expect(r08?.builtFor).toEqual({ range: '0.8.0', kind: 'exact-pin', satisfied: true, version: '0.8.0' })
    expect(r08?.fitsStatically).toBe('drift')
    expect(entry.compat.builtFor.lines).toEqual(['0.8', '0.9'])
    expect(entry.compat.builtFor.ranges).toEqual({ '0.8': '0.8.0', '0.9': '0.9.0' })
    // the develop snapshot a new app ships on next: its peers are not read, and the result names whose declaration it
    // carries instead
    const ccNext = await runTool('check_compat', { refs: [STRIPE], omVersion: DEVELOP }, src, OPTS.now)
    const rNext = ccNext.ok ? ccNext.value.results[0]! : null
    expect(rNext?.version).toBe(DEVELOP)
    expect(rNext?.builtFor.satisfied).toBe(false)
    expect(rNext?.builtFor.version).toBe('0.9.0')
    expect(rNext?.fitsStatically).toBe('unknown')
    expect(rNext?.notes).toContain(`Peers of ${DEVELOP} not read yet; builtFor is the declaration of 0.9.0.`)
    // the /compat popover of the same cells
    const meta = (line: string) =>
      metaLine({
        ...cellPeers(row, line),
        line,
        moduleVersion: cellVersion(row, line),
        omVersion: omOf(line),
        fit: row.cells[line]?.fit === 'unknown' ? 'unknown' : 'fit',
      })
    expect(meta('0.8')).toBe('Module 0.8.0 · OM 0.8.0 · Built for 0.8.0 (peers accept 0.8) · Fits statically')
    expect(meta('next')).toBe(
      'Module 0.10.1-develop.7583 · OM 0.10.1-develop.7583 · Peers not read yet · Static fit not analyzed',
    )
  })
})

describe('search_modules labels the command of the empty preset (presets review r1, P1)', () => {
  const out = buildEmit(data(), OPTS)
  const src = source(out.public)

  test('golden: no unlabeled `module add` next to allow where a new app registers the package', async () => {
    for (const omVersion of ['0.8.0', '0.9.0', DEVELOP]) {
      const r = await runTool('search_modules', { query: 'stripe', omVersion }, src, OPTS.now)
      const hit = r.ok ? r.value.results.find((x) => x.locator === STRIPE) : undefined
      expect(hit, omVersion).toBeDefined()
      expect(hit!.install, omVersion).toBe(presetInstallText(['gateway_stripe']))
      expect(hit!.install).not.toMatch(/module add/)
      expect(hit!.presetNote).toMatch(
        /^Nothing to install: a new app already registers gateway_stripe in src\/modules\.ts\. In an app from the empty preset: yarn mercato module add @open-mercato\/gateway-stripe@/,
      )
      expect(hit!.installEmptyPreset).toMatch(/^yarn mercato module add @open-mercato\/gateway-stripe@/)
    }
    // a line verified in a new app: allow, and still no bare command
    const r = await runTool('search_modules', { query: 'stripe', omVersion: '0.9.0' }, src, OPTS.now)
    const hit = r.ok ? r.value.results.find((x) => x.locator === STRIPE)! : null
    expect(hit?.agentPolicy?.decision).toBe('allow')
    // an entry no new app registers keeps its command and no preset fields
    const k = await runTool('search_modules', { query: 'ksef', omVersion: '0.9.0' }, src, OPTS.now)
    const ksef = k.ok ? k.value.results.find((x) => x.locator === 'npm:@fastwhitecat/integration-ksef-direct')! : null
    expect(ksef?.install).toMatch(/^yarn mercato module add @fastwhitecat\/integration-ksef-direct@/)
    expect(ksef?.presetNote).toBeUndefined()
  })
})

describe('the empty preset command says when that version broke in isolation (presets review r1, P2)', () => {
  // gateway-stripe 0.9.0 broken at typecheck in an app from the empty preset of 0.8, the version a fresh app installs
  // there (checkout on 0.8 in the review); since the final review of 24 Oct that command installs 0.8.0 instead, the
  // version a new 0.8 app ships, and the sentence stays for the case with no other version
  const d = data()
  const own = d.receipts.get(STRIPE)!
  const base = own.find((x) => x.om.line === '0.9' && x.om.preset === 'empty')!
  const broken = structuredClone(base)
  broken.id = 'r_20261023_0000000ddc81'
  broken.om = { ...broken.om, line: '0.8', version: '0.8.0', createApp: 'create-mercato-app@0.8.0' }
  broken.module = { ...broken.module!, version: '0.9.0' }
  broken.result = {
    ...broken.result,
    status: 'broken',
    failedStep: 'typecheck',
    alsoFailed: [],
    classification: 'module-fail',
  }
  broken.transition = { from: null, to: 'broken', confirmed: true }
  const receipts = new Map(d.receipts)
  receipts.set(STRIPE, [...own, Receipt.parse(broken)])
  const out = buildEmit({ ...d, receipts }, OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const entry = index.entries.find((e) => e.locator === STRIPE)!
  const plans = JSON.parse(out.site.get('plans.json') as string) as Record<string, Record<string, InstallPlan | null>>

  test('golden: one sentence after the command in the plan, never in the main verdict or the policy', () => {
    const caution = emptyCommandCaution(entry, '0.8', '0.9.0')
    expect(caution).toBe('In isolation (empty preset): 0.9.0 broken at typecheck on 23 Oct.')
    // the command of the empty preset installs the version a new 0.8 app ships, not the one that broke (final review)
    expect(emptyPresetVersion(entry, '0.8')).toBe('0.8.0')
    const plan = plans[STRIPE]!['0.8']!
    expect(plan.emptyPreset?.commands).toEqual(['yarn mercato module add @open-mercato/gateway-stripe@0.8.0'])
    expect(plan.emptyPreset?.then).not.toContain(caution)
    expect(plan.then).not.toContain(caution)
    expect(entry.compat.lines['0.8']).toBeUndefined()
    // with no other version (a new app ships the broken one) the command stays and the sentence follows it
    // (and a fresh 0.8 app installs it too: the lockstep 0.8.0 is out of the picture)
    const installable = { ...(entry._meta?.[INSTALLABLE_META_KEY] as Record<string, string | null>), '0.8': '0.9.0' }
    const same = {
      ...entry,
      _meta: { ...entry._meta, [INSTALLABLE_META_KEY]: installable },
      compat: { ...entry.compat, ships: { ...entry.compat.ships, '0.8': '0.9.0' } },
    }
    expect(emptyPresetVersion(same, '0.8')).toBe('0.9.0')
    expect(emptyCommandCaution(same, '0.8', emptyPresetVersion(same, '0.8'))).toBe(
      'In isolation (empty preset): broken at typecheck on 23 Oct.',
    )
    // a version that did not break says nothing
    expect(emptyCommandCaution(entry, '0.9', '0.9.0')).toBeNull()
  })
})
