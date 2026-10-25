// Round 14 (critics of round 13): the finding of a broken line reaches every agent channel, and a backend route a new
// app already has is a warning on a line without a verdict (lint `backend-route-collision`). The scene is the classic
// preview night of 24 Oct: freighttech shipment-tracking broke at add on 0.8 and next (generate refused
// /backend/webhooks, which the webhooks module of a new app has), and Yarn's age gate held back a dependency on 0.9.
// Here the fixture entry ksef plays that module, with the real add log of that night.
import { describe, expect, test } from 'vitest'
import { checkCompat } from '../../lib/core/compat.ts'
import { backendRouteCollisions, backendRouteKey, collisionLintText, collisionText } from '../../lib/core/finding.ts'
import { agentPolicy, collisionEvidence, collisionNote, collisionStatic } from '../../lib/core/policy.ts'
import { isPlanStep } from '../../lib/core/plan.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import type { BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import type { ModulesIndex } from '../../lib/schema/published/modules.ts'
import { appModules, errorLine, explainReceipt, firstError, generateInAdd } from '../../site/src/lib/receipts.ts'
import { OPTS, json, text } from './helpers.ts'
import { KSEF, SENTENCE, STATIC, WEBHOOKS, scene } from './collision-scene.ts'

describe('round 14: the finding of a broken line in every channel', () => {
  const { data, broken, held, version } = scene()
  const out = buildEmit(data, OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const entry = index.entries.find((e) => e.locator === KSEF)!
  const builtIn = json<BuiltInIndex>(out, 'built-in.json')
  const card = text(out, 'm/@fastwhitecat/integration-ksef-direct.md')
  const compat = (omVersion: string) =>
    checkCompat(
      { omVersion, refs: [KSEF] },
      { entries: index.entries, builtIn: [], lines: index.lines, site: OPTS.site, now: OPTS.now },
    ).results[0]!

  test('the broken cells carry the sentence of the page (compat.lines[line].finding)', () => {
    expect(entry.compat.lines['0.8']).toMatchObject({ status: 'broken', step: 'add', finding: SENTENCE })
    expect(entry.compat.lines.next?.finding).toBe(SENTENCE)
    expect(entry.compat.lines['0.9']?.finding).toBeUndefined()
  })

  test('parity: page (explainReceipt), card, raw/modules.md and check_compat say the same sentence', () => {
    // the page and the drawer explain the receipt with the site's context; the strip reads the cell's finding
    expect(explainReceipt(broken, appModules({ builtIn, modules: index }))).toBe(SENTENCE)
    expect(card).toContain(`0.8 and next: ${SENTENCE}`)
    expect(text(out, 'raw/modules.md')).toContain(`0.8 and next: ${SENTENCE}`)
    expect(compat('0.8.0').notes).toContain(`0.8: ${SENTENCE}`)
    expect(text(out, 'llms-full.txt')).toContain(`0.8 and next: ${SENTENCE}`)
  })

  test('lint backend-route-collision: read statically per line; next from the newest line that has the module', () => {
    expect(entry.compat.collisions?.['0.9']).toEqual([
      { route: '/backend/webhooks', module: 'webhooks', from: WEBHOOKS },
    ])
    expect(entry.compat.collisions?.['0.8']).toHaveLength(1)
    // round 16: the catalog has no facts of the develop snapshot, so next reads the webhooks module of 0.9
    expect(entry.compat.collisions?.next).toEqual(entry.compat.collisions?.['0.9'])
  })

  test('the warning speaks on the line without a verdict only, with what the same version did elsewhere', () => {
    // round 15: `broke`, so the two sentences fit one note of check_compat
    const evidence = `${version} broke at add on 0.8 and next for this reason.`
    expect(collisionStatic(entry, '0.9')).toBe(STATIC)
    expect(collisionEvidence(entry, '0.9')).toBe(evidence)
    expect(collisionNote(entry, '0.9')).toBe(`${STATIC} ${evidence}`)
    // a verdict speaks for itself
    expect(collisionNote(entry, '0.8')).toBeNull()
    expect(card).toContain(`0.9: ${STATIC} ${evidence}`)
    // one note, as the card prints them (round 15: two notes read `for this reason` without a subject)
    const notes = compat('0.9.0').notes
    expect(notes).toContain(`${STATIC} ${evidence}`)
  })

  test('the policy asks with the reason, the decision does not change', () => {
    const p = entry.agentPolicy['0.9']!
    expect(p.decision).toBe('ask')
    expect(p.reasons.find((r) => r.code === 'ROUTE_COLLISION')?.text).toBe(STATIC)
    const { collisions: _drop, ...rest } = entry.compat
    expect(agentPolicy({ ...entry, compat: rest }, '0.9', undefined, { now: OPTS.now }).decision).toBe(p.decision)
    expect(entry.agentPolicy['0.8']?.reasons.some((r) => r.code === 'ROUTE_COLLISION')).toBe(false)
  })

  test('a run the age gate held back has no error line (drawer, /compat popover)', () => {
    expect(errorLine(held, 140, appModules({ builtIn, modules: index }))).toBeNull()
    expect(firstError(held)).toBeNull()
    expect(errorLine(broken, 140, appModules({ builtIn, modules: index }))).toBe(SENTENCE)
  })

  test('the paper receipt says generate ran in add', () => {
    expect(generateInAdd(broken)).toBe(true)
    expect(generateInAdd(held)).toBe(false)
  })

  test('the card numbers steps only; a note stands under its step', () => {
    for (const p of out.public.keys()) {
      if (!p.endsWith('.md') || !p.startsWith('m/')) continue
      for (const l of text(out, p).split('\n')) {
        const m = /^\d+\. (.*)$/.exec(l)
        if (m) expect(isPlanStep(m[1]!), `${p}: ${l}`).toBe(true)
      }
    }
  })
})

describe('round 14: backend route collisions (lib/core/finding.ts)', () => {
  test('a dynamic segment is a dynamic segment', () => {
    expect(backendRouteKey('/backend/hooks/[id]/')).toBe(backendRouteKey('/backend/hooks/[hookId]'))
    expect(
      backendRouteCollisions(
        ['/backend/a', '/backend/hooks/[id]'],
        [{ id: 'hooks', from: '@open-mercato/core', routes: ['/backend/hooks/[hookId]'] }],
      ),
    ).toEqual([{ route: '/backend/hooks/[id]', module: 'hooks', from: '@open-mercato/core' }])
  })

  test('one sentence: a built-in module is called built-in, more routes are counted', () => {
    expect(collisionText([{ route: '/backend/sales', module: 'sales', from: '@open-mercato/core' }])).toBe(
      'Static check: the module adds the backend route /backend/sales, which a new app already has from the built-in sales module.',
    )
    expect(
      collisionText([
        { route: '/backend/a', module: 'x', from: '@x/x' },
        { route: '/backend/b', module: 'x', from: '@x/x' },
        { route: '/backend/c', module: 'y', from: '@y/y' },
      ]),
    ).toBe(
      'Static check: the module adds the backend routes /backend/a and /backend/b, which a new app already has from the x module (@x/x). 1 more backend route collides with other modules.',
    )
    expect(collisionText([])).toBeNull()
    expect(collisionLintText({ route: '/backend/webhooks', module: 'webhooks', from: WEBHOOKS }, ['0.8', '0.9'])).toBe(
      'Adds the backend route /backend/webhooks, which a new app on 0.8 and 0.9 already has from the webhooks module (@open-mercato/webhooks). The generate step refuses two modules with one backend route.',
    )
  })
})

describe('round 14: identifiers of a finding in mono, a log line untouched', () => {
  test('the route and the package of the sentence; a path inside a TS error stays breakable text', async () => {
    const { whyHtml } = await import('../../site/src/lib/receipts.ts')
    const html = whyHtml(SENTENCE)
    expect(html).toContain('<code translate="no">/backend/webhooks</code>,')
    expect(html).toContain('(<code translate="no" class="nw">@open-mercato/webhooks</code>)')
    const log = whyHtml(
      "typecheck failed: TS2307 Cannot find module '@freighttech/ui/backend/dynamic-table/server' or its corresponding type declarations.",
    )
    expect(log).not.toContain('class="nw"')
    expect(log).not.toContain('<code translate="no">/backend')
  })
})
