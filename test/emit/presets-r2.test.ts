// The final review of the two presets (24 Oct), the published side. Golden cases: the command of an app from the empty
// preset installs the version a new app ships where the other one broke there, in every channel; the steps of the empty
// preset name that preset; the isolation reasons carry their version and read as one sentence in the card; the
// registry's labels name the version as the card does; the Verified title of a package a new app has.
import { describe, expect, test } from 'vitest'
import { planInstall } from '../../lib/core/plan.ts'
import {
  agentPolicy,
  emptyPresetVersion,
  isolationFindingReason,
  reasonsText,
  ISOLATION_LEAD,
} from '../../lib/core/policy.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import type { EmitData } from '../../lib/emit/types.ts'
import { Receipt } from '../../lib/schema/data/index.ts'
import type { IndexEntry, ModulesIndex } from '../../lib/schema/published/modules.ts'
import type { InstallPlan } from '../../lib/schema/tools.ts'
import { runTool } from '../../mcp/handlers.ts'
import { createCatalogSource } from '../../mcp/index-cache.ts'
import { toRegistryEntry } from '../../site/src/islands/Registry.tsx'
import { sealOf } from '../../site/src/lib/chips.ts'
import { packEntry, unpackEntry } from '../../site/src/lib/registry-pack.ts'
import { stripCells } from '../../site/src/lib/status.ts'
import { NOW, OPTS, fixtureData, json, skillsDir } from './helpers.ts'

const STRIPE = 'npm:@open-mercato/gateway-stripe'
const DEVELOP = '0.10.1-develop.7583.1.0c886d0a14'

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

/** The fixture with gateway-stripe 0.9.0 broken at typecheck in an app from the empty preset of 0.8 (checkout). */
function brokenOn08(): EmitData {
  const d = fixtureData({ skills: skillsDir() })
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
  return { ...d, receipts }
}

describe('the command of an app from the empty preset installs a version that does not break there (P2)', () => {
  const out = buildEmit(brokenOn08(), OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const entry = index.entries.find((e) => e.locator === STRIPE)!
  const plans = JSON.parse(out.site.get('plans.json') as string) as Record<string, Record<string, InstallPlan | null>>
  const src = source(out.public)

  test('golden: 0.8.0 on 0.8 in the plan, search_modules and check_compat; the latest line keeps its version', async () => {
    expect(emptyPresetVersion(entry, '0.8')).toBe('0.8.0')
    expect(plans[STRIPE]!['0.8']!.emptyPreset?.commands).toEqual([
      'yarn mercato module add @open-mercato/gateway-stripe@0.8.0',
    ])
    const s = await runTool('search_modules', { query: 'stripe', omVersion: '0.8.0' }, src, OPTS.now)
    const hit = s.ok ? s.value.results.find((x) => x.locator === STRIPE) : undefined
    expect(hit?.installEmptyPreset).toBe('yarn mercato module add @open-mercato/gateway-stripe@0.8.0')
    const cc = await runTool('check_compat', { refs: [STRIPE], omVersion: '0.8.0' }, src, OPTS.now)
    const notes = cc.ok ? cc.value.results[0]!.notes : []
    expect(
      notes.some((n) =>
        n.endsWith('In an app from the empty preset: yarn mercato module add @open-mercato/gateway-stripe@0.8.0'),
      ),
    ).toBe(true)
    // the latest line, where nothing broke: the version a fresh app installs there
    expect(entry.install.cli).toBe('yarn mercato module add @open-mercato/gateway-stripe@0.9.0')
  })
})

describe('the steps and the reasons of the empty preset say it (P3)', () => {
  const out = buildEmit(fixtureData({ skills: skillsDir() }), OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const stripe = index.entries.find((e) => e.locator === STRIPE)!

  test('golden: a package both presets register has no `a new app` in the block of the empty preset', () => {
    const both = [{ id: 'gateway_stripe', from: '@open-mercato/gateway-stripe' }]
    const plan = planInstall(
      { refs: [STRIPE], app: { omVersion: '0.9.0' } },
      {
        entries: index.entries,
        builtIn: [],
        lines: index.lines,
        presets: { '0.9': { classic: both, empty: both } },
      },
    )
    expect(plan.then[0]).toBe('Nothing to install: a new app already registers gateway_stripe in src/modules.ts.')
    expect(plan.emptyPreset?.then[0]).toBe(
      'An app from the empty preset registers gateway_stripe too: nothing to install.',
    )
    expect(plan.emptyPreset?.then.join(' ')).not.toMatch(/a new app/)
  })

  test('golden: the finding reason names the version it is about, and the card reads both as one sentence', () => {
    const finding =
      'GET /api/events needs the workflows.view feature, and the empty preset does not enable the workflows module.'
    const iso = {
      status: 'broken' as const,
      step: 'smoke' as const,
      at: '2026-10-23T09:00:00Z',
      moduleVersion: '0.9.0',
      finding,
    }
    expect(isolationFindingReason(iso, DEVELOP)).toBe(`${ISOLATION_LEAD} in 0.9.0, ${finding}`)
    expect(isolationFindingReason(iso, '0.9.0')).toBe(`${ISOLATION_LEAD} ${finding}`)
    expect(
      reasonsText([
        { text: `Not yet tested in a new app on next. ${ISOLATION_LEAD} 0.9.0 broken at smoke on 23 Oct.` },
        { text: `${ISOLATION_LEAD} in 0.9.0, ${finding}` },
      ]),
    ).toBe(`Not yet tested in a new app on next. ${ISOLATION_LEAD} 0.9.0 broken at smoke on 23 Oct. ${finding}`)
    // the policy of a line with no receipt from a new app yet and that finding in isolation
    const e: IndexEntry = {
      ...stripe,
      compat: {
        ...stripe.compat,
        lines: Object.fromEntries(Object.entries(stripe.compat.lines).filter(([k]) => k !== 'next')),
        isolation: { ...stripe.compat.isolation, next: { ...iso, receipt: null } },
      },
      agentPolicy: { ...stripe.agentPolicy, next: { decision: 'ask', reasons: [] } },
    }
    const p = agentPolicy(e, 'next', undefined, { now: NOW })
    const texts = p.reasons.map((r) => r.text)
    expect(texts.filter((t) => t.includes(ISOLATION_LEAD))).toHaveLength(2)
    expect(texts.some((t) => t.startsWith(`${ISOLATION_LEAD} in 0.9.0, GET /api/events needs`))).toBe(true)
    expect(reasonsText(p.reasons).split(ISOLATION_LEAD)).toHaveLength(2)
  })
})

describe('the registry, the seal and llms.txt speak like the card (P3)', () => {
  const out = buildEmit(fixtureData({ skills: skillsDir() }), OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const stripe = index.entries.find((e) => e.locator === STRIPE)!
  const at = '2026-10-23T09:00:00Z'
  const e: IndexEntry = {
    ...stripe,
    compat: {
      ...stripe.compat,
      isolation: {
        '0.9': { status: 'verified', step: null, moduleVersion: '0.9.0', at, receipt: null },
        next: { status: 'verified', step: null, moduleVersion: '0.9.0', at, receipt: null },
      },
    },
  }

  test('golden: the label of a square names the isolation version where it is not the line main version', () => {
    const label = (cells: ReturnType<typeof stripCells>, k: string) => cells.find((c) => c.key === k)!.label
    const full = stripCells(e, index.lines)
    expect(label(full, 'next')).toMatch(/; in isolation \(empty preset\): 0\.9\.0 verified on 23 Oct$/)
    expect(label(full, '0.9')).toMatch(/; in isolation \(empty preset\): verified on 23 Oct$/)
    // the registry's slim rows, before and after packing, say the same
    const slim = toRegistryEntry(e, index.lines)
    expect(slim.compat.isolation?.next?.named).toBe(true)
    expect(slim.compat.isolation?.['0.9']?.named).toBe(false)
    const unpacked = unpackEntry(
      packEntry(slim),
      index.lines.map((l) => l.key),
    )
    // ModuleRow hands the slim row to stripCells as an entry (Registry.tsx)
    const asEntry = (x: unknown) => x as IndexEntry
    for (const k of ['0.9', 'next']) {
      expect(label(stripCells(asEntry(slim), index.lines), k)).toBe(label(full, k))
      expect(label(stripCells(asEntry(unpacked), index.lines), k)).toBe(label(full, k))
    }
  })

  test('the Verified title of a package a new app already has, and the in-preset sentence of llms.txt beside Verified', () => {
    const latest = index.lines.find((l) => l.source === 'latest')!.key
    expect(sealOf({ ...stripe, tier: 'verified' }, latest).title).toMatch(
      /^Verified on 0\.9: a new Open Mercato app that already has it passed all nine steps, /,
    )
    const ksef = index.entries.find((x) => x.npm === '@fastwhitecat/integration-ksef-direct')!
    expect(sealOf({ ...ksef, tier: 'verified' }, latest).title).toMatch(
      /a fresh Open Mercato app installed it and passed/,
    )
    const llms = (out.public.get('llms.txt') as string).split('\n')
    expect(llms.find((l) => l.includes('/gateway-stripe.md)'))).toMatch(
      /Verified on 0\.9\. Already on in a new app on 0\.8, 0\.9 and next\.$/,
    )
  })
})
