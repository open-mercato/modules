// Round 16 (review of 0d1d99f): the install plan's Grant row counts the plan's full list of permissions (freighttech
// shipment-tracking read `11 permissions` for its 14, and `see the card` stood as a permission ID), the card names the
// route conflict plan_install names, next gets the static check from the newest line that has the module, a given app
// without the colliding module gets no ROUTE_COLLISION, and an isolation finding starts with a capital letter.
import { describe, expect, test } from 'vitest'
import { planInstall, presetsFromPublished, type PlanContext } from '../../lib/core/plan.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import type { BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import type { IndexEntry, ModulesIndex } from '../../lib/schema/published/modules.ts'
import { grantRow } from '../../site/src/lib/grant.ts'
import { KSEF, WEBHOOKS, scene } from './collision-scene.ts'
import { OPTS, fixtureEmit, json, text } from './helpers.ts'

const STRIPE = 'npm:@open-mercato/gateway-stripe'
const NEXT = '0.10.1-develop.7583.1.0c886d0a14'

function context(entries: IndexEntry[], builtIn: BuiltInIndex, index: ModulesIndex): PlanContext {
  return {
    entries,
    builtIn: builtIn.modules,
    lines: index.lines,
    presets: presetsFromPublished({ entries, builtIn: builtIn.modules, lines: index.lines }),
    now: OPTS.now,
  }
}

describe('round 16: the Grant row counts every permission of the plan', () => {
  // freighttech shipment-tracking 0.9: 14 permissions; an app from the empty preset installs scheduler too (3 more)
  const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}.f${i + 1}.view`)
  const SHIPMENT = ids('shipment_tracking', 14)
  const SCHEDULER = ['scheduler.jobs.view', 'scheduler.jobs.manage', 'scheduler.jobs.trigger']

  test('the full list: 14 permissions, ten IDs and +4 more, never `see the card`', () => {
    const step = `Grant these permissions to roles the user names: ${SHIPMENT.slice(0, 10).join(', ')} and 4 more, see the card`
    const g = grantRow(step, SHIPMENT)!
    expect(g.label).toBe('14 permissions to roles the user names')
    expect(g.prefix).toBe('shipment_tracking.')
    expect(g.shown).toHaveLength(10)
    expect(g.rest).toEqual(['f11.view', 'f12.view', 'f13.view', 'f14.view'])
    expect(g.unnamed).toBe(0)
    expect(JSON.stringify(g)).not.toMatch(/see the card|and \d+ more/)
    // the empty preset's list (scheduler first, as the requires closure orders it): 17
    expect(grantRow(step, [...SCHEDULER, ...SHIPMENT])!.label).toBe('17 permissions to roles the user names')
    // @dainamite/billing: 19
    expect(grantRow(step, ids('billing', 19))!.label).toBe('19 permissions to roles the user names')
  })

  test('without the full list, the text is read and its tail is a count, never an ID', () => {
    const step = `Grant these permissions to roles the user names: ${SHIPMENT.slice(0, 10).join(', ')} and 4 more, see the card`
    const g = grantRow(step)!
    expect(g.label).toBe('14 permissions to roles the user names')
    expect(g.shown).toHaveLength(10)
    expect(g.shown.every((id) => /^f\d+\.view$/.test(id))).toBe(true)
    expect(g.unnamed).toBe(4)
    expect(grantRow('Grant the new permissions to roles the user names.')!.label).toBe(
      'the new permissions to roles the user names',
    )
    expect(grantRow('yarn generate')).toBeNull()
  })

  test('plan_install: adds.aclFeatures and emptyPreset.aclFeatures are the lists of the Grant steps', () => {
    const { data } = scene()
    const out = buildEmit(data, OPTS)
    const index = json<ModulesIndex>(out, 'modules.json')
    const builtIn = json<BuiltInIndex>(out, 'built-in.json')
    const entries = structuredClone(index.entries)
    const ksef = entries.find((e) => e.locator === KSEF)!
    const stripe = entries.find((e) => e.locator === STRIPE)!
    // the module requires a package a new app has and an app from the empty preset does not (scheduler)
    ksef.anatomy!.lists.aclFeatures = SHIPMENT
    ksef.requires = [...ksef.requires, { raw: '@open-mercato/gateway-stripe', resolvesTo: STRIPE }]
    stripe.anatomy!.lists.aclFeatures = SCHEDULER
    const ctx = context(entries, builtIn, index)
    const presets = Object.fromEntries(
      Object.entries(ctx.presets ?? {}).map(([k, v]) => [
        k,
        { ...v, classic: [...(v?.classic ?? []), { id: stripe.moduleIds[0]!, from: stripe.npm! }] },
      ]),
    )
    const p = planInstall({ refs: [KSEF], app: { omVersion: '0.9.0' } }, { ...ctx, presets })
    const step = (then: readonly string[]) => then.find((t) => t.startsWith('Grant '))!
    expect(step(p.then)).toMatch(/and 4 more, see the card$/)
    expect(p.adds.aclFeatures).toEqual(SHIPMENT)
    expect(grantRow(step(p.then), p.adds.aclFeatures)!.label).toBe('14 permissions to roles the user names')
    expect(p.emptyPreset!.aclFeatures).toEqual([...SCHEDULER, ...SHIPMENT])
    expect(grantRow(step(p.emptyPreset!.then), p.emptyPreset!.aclFeatures)!.label).toBe(
      '17 permissions to roles the user names',
    )
  })
})

describe('round 16: the route conflict in the card, on next and in a given app', () => {
  const { data } = scene()
  const out = buildEmit(data, OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const builtIn = json<BuiltInIndex>(out, 'built-in.json')
  const card = text(out, 'm/@fastwhitecat/integration-ksef-direct.md')
  const ctx = context(index.entries, builtIn, index)
  const plan = (omVersion: string, enabledModules?: { id: string; from: string }[]) =>
    planInstall({ refs: [KSEF], app: { omVersion, ...(enabledModules ? { enabledModules } : {}) } }, ctx)
  const ITEM =
    'backend route /backend/webhooks with the webhooks module (@open-mercato/webhooks) in a new app on 0.8, 0.9 and next (static check)'

  test('the card and llms-full.txt name the route conflict, never `none` beside it', () => {
    expect(card).toContain(`- Replaces or conflicts: ${ITEM}`)
    expect(card).not.toContain('- Replaces or conflicts: none')
    expect(text(out, 'llms-full.txt')).toContain(`- Replaces or conflicts: ${ITEM}`)
  })

  test('parity: every route conflict of plan_install on a line is in the card, with that line', () => {
    const line = card.split('\n').find((l) => l.startsWith('- Replaces or conflicts: '))!
    for (const l of index.lines) {
      const route = plan(l.version).conflicts.filter((c) => c.kind === 'route')
      expect(route.length).toBeGreaterThan(0)
      for (const c of route) {
        expect(line).toContain(`(${c.with})`)
        expect(line).toContain(/\/backend\/\S+/.exec(c.detail)![0].replace(/,$/, ''))
      }
      expect(line).toMatch(new RegExp(`on [^(]*\\b${l.key.replace('.', '\\.')}\\b`))
    }
    // an entry without a collision: none in both
    const plain = text(fixtureEmit(), 'm/@piotrkarwatka/marketing-consents.md')
    expect(plain).toContain('- Replaces or conflicts: none')
  })

  test('day 0 on next: the static check reads the webhooks module of the newest line that has it', () => {
    const day0 = structuredClone(data)
    day0.receipts = new Map(data.receipts)
    day0.receipts.set(KSEF, [])
    const o = buildEmit(day0, OPTS)
    const idx = json<ModulesIndex>(o, 'modules.json')
    const e = idx.entries.find((x) => x.locator === KSEF)!
    expect(e.compat.collisions?.next).toEqual([{ route: '/backend/webhooks', module: 'webhooks', from: WEBHOOKS }])
    const p = planInstall(
      { refs: [KSEF], app: { omVersion: NEXT } },
      context(idx.entries, json<BuiltInIndex>(o, 'built-in.json'), idx),
    )
    expect(p.conflicts.some((c) => c.kind === 'route' && c.with === WEBHOOKS)).toBe(true)
    expect(p.agentPolicy.reasons.find((r) => r.code === 'ROUTE_COLLISION')?.text).toContain('/backend/webhooks')
  })

  test('a given app without the colliding module: no ROUTE_COLLISION and no route conflict; with it, `this app`', () => {
    const without = plan('0.9.0', [{ id: 'auth', from: '@open-mercato/core' }])
    expect(without.conflicts.some((c) => c.kind === 'route')).toBe(false)
    expect(without.agentPolicy.reasons.some((r) => r.code === 'ROUTE_COLLISION')).toBe(false)
    const withIt = plan('0.9.0', [
      { id: 'auth', from: '@open-mercato/core' },
      { id: 'webhooks', from: WEBHOOKS },
    ])
    expect(withIt.conflicts.some((c) => c.kind === 'route')).toBe(true)
    expect(withIt.agentPolicy.reasons.find((r) => r.code === 'ROUTE_COLLISION')?.text).toContain(
      'which this app already has',
    )
    // a new app (no enabledModules) keeps the reason
    expect(plan('0.9.0').agentPolicy.reasons.some((r) => r.code === 'ROUTE_COLLISION')).toBe(true)
  })
})

test('round 16: a finding starts with a capital letter in compat.lines and compat.isolation alike', () => {
  const index = json<ModulesIndex>(fixtureEmit(), 'modules.json')
  const findings = index.entries.flatMap((e) => [
    ...Object.values(e.compat.lines).map((c) => c?.finding),
    ...Object.values(e.compat.isolation ?? {}).map((c) => c?.finding),
  ])
  const some = findings.filter((f): f is string => !!f)
  expect(some.length).toBeGreaterThan(0)
  for (const f of some) expect(f.charAt(0)).toBe(f.charAt(0).toUpperCase())
  const consents = index.entries.find((e) => e.locator === 'npm:@piotrkarwatka/marketing-consents')!
  expect(Object.values(consents.compat.isolation ?? {}).some((c) => c.finding?.startsWith('Typecheck failed: '))).toBe(
    true,
  )
})
