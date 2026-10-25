// Round 15 (critics of round 14): every agent channel says what the page says. The picker and plan_install carry the
// backend route collision, the card's table speaks in the words of the legend, a broken line without a rule names its
// first error, Hygiene lists the same rules everywhere, check_compat keeps its caveats, the /for-agents demo numbers the
// card's steps, and on day 0 the empty preset's command for checkout on 0.8 is the version a new 0.8 app ships.
import { describe, expect, test } from 'vitest'
import { checkCompat, packNotes } from '../../lib/core/compat.ts'
import { errorFindingText } from '../../lib/core/finding.ts'
import { numberedSteps, planInstall, presetsFromPublished } from '../../lib/core/plan.ts'
import { declaredRangeOf, emptyPresetVersion } from '../../lib/core/policy.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import { cardStatusWord } from '../../lib/emit/markdown.ts'
import type { BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import type { IndexEntry, ModulesIndex } from '../../lib/schema/published/modules.ts'
import type { PickerIndex } from '../../lib/schema/published/picker.ts'
import { demoSteps, POLICY_ROWS } from '../../site/src/islands/AgentPane.tsx'
import { KSEF, STATIC, WEBHOOKS, scene } from './collision-scene.ts'
import { OPTS, fixtureEmit, json, text } from './helpers.ts'

describe('round 15: the collision in every agent channel', () => {
  const { data, version } = scene()
  const out = buildEmit(data, OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const builtIn = json<BuiltInIndex>(out, 'built-in.json')
  const entry = index.entries.find((e) => e.locator === KSEF)!
  const card = text(out, 'm/@fastwhitecat/integration-ksef-direct.md')
  const plan = (omVersion: string, enabledModules?: { id: string; from: string }[]) =>
    planInstall(
      { refs: [KSEF], app: { omVersion, ...(enabledModules ? { enabledModules } : {}) } },
      {
        entries: index.entries,
        builtIn: builtIn.modules,
        lines: index.lines,
        presets: presetsFromPublished({ entries: index.entries, builtIn: builtIn.modules, lines: index.lines }),
        now: OPTS.now,
      },
    )

  test('plan_install: a route conflict where the policy names ROUTE_COLLISION, and the backend pages it adds', () => {
    const p = plan('0.9.0')
    expect(p.agentPolicy.reasons.some((r) => r.code === 'ROUTE_COLLISION')).toBe(true)
    expect(p.conflicts).toContainEqual({
      kind: 'route',
      detail: `Static check: @fastwhitecat/integration-ksef-direct adds the backend route /backend/webhooks, which a new app already has from the webhooks module (${WEBHOOKS}).`,
      with: WEBHOOKS,
    })
    // the anatomy's backend pages (the scene adds /backend/webhooks to the collision keys only)
    expect(p.adds.backendPages.length).toBeGreaterThan(0)
    expect(p.adds.backendPages).toEqual(entry.anatomy!.lists.backendPages)
    // a line with a verdict has the same fact: the conflict does not depend on the receipts
    expect(plan('0.8.0').conflicts.some((c) => c.kind === 'route')).toBe(true)
    // a given app: only when it registers the module the route collides with, in its words
    expect(plan('0.9.0', [{ id: 'auth', from: '@open-mercato/core' }]).conflicts.some((c) => c.kind === 'route')).toBe(
      false,
    )
    expect(
      plan('0.9.0', [
        { id: 'auth', from: '@open-mercato/core' },
        { id: 'webhooks', from: WEBHOOKS },
      ]).conflicts.find((c) => c.kind === 'route')?.detail,
    ).toContain('which this app already has')
  })

  test('picker.json: the modules a new app has that the route collides with, and the lint sentence', () => {
    const picker = json<PickerIndex>(out, 'picker.json')
    const m = picker.modules.find((x) => x.locator === KSEF)!
    expect(m.conflictsWith).toEqual(['webhooks'])
    expect(m.warning).toBe(
      `Adds the backend route /backend/webhooks, which a new app on 0.8, 0.9 and next already has from the webhooks module (${WEBHOOKS}). The generate step refuses two modules with one backend route.`,
    )
    expect(picker.modules.filter((x) => x.conflictsWith).map((x) => x.locator)).toEqual([KSEF])
  })

  test('Hygiene names the rule in signals.hygiene.failing, the card and the page alike', () => {
    expect(entry.signals.hygiene.failing).toContain('backend-route-collision')
    expect(entry.signals.hygiene.status).not.toBe('ok')
    expect(card).toMatch(/Hygiene: (warn|fail) \([^)]*backend-route-collision/)
  })

  test("the card's table says `not judged (age gate)`, never the raw `quarantine`", () => {
    const table = card.split('\n').filter((l) => l.startsWith('| '))
    expect(table.find((l) => l.startsWith('| 0.9 '))).toContain('| not judged (age gate) |')
    expect(table.join('\n')).not.toMatch(/\| quarantine \|/)
    expect(text(out, 'llms-full.txt')).not.toMatch(/\| quarantine \|/)
    expect(cardStatusWord({ status: 'quarantine', step: null }, 'untested')).toBe('new release (age gate)')
    expect(cardStatusWord({ status: 'infra-error', step: 'install' }, 'untested')).toBe(
      'not judged (run did not finish)',
    )
    expect(cardStatusWord(undefined, 'untested')).toBe('untested')
  })

  test('check_compat: the static check and its evidence in one note, as the card prints them', () => {
    const evidence = `${version} broke at add on 0.8 and next for this reason.`
    const r = checkCompat(
      { omVersion: '0.9.0', refs: [KSEF] },
      { entries: index.entries, builtIn: [], lines: index.lines, site: OPTS.site, now: OPTS.now },
    ).results[0]!
    expect(r.notes).toContain(`${STATIC} ${evidence}`)
    expect(card).toContain(`0.9: ${STATIC} ${evidence}`)
    expect(r.notes.length).toBeLessThanOrEqual(5)
    for (const n of r.notes) expect(n.length).toBeLessThanOrEqual(200)
  })
})

describe('round 15: notes within the five of the schema', () => {
  test('neighbours that fit one note are joined, shortest pair first, the first note keeps its place', () => {
    const notes = [
      'Receipts: Preview run.',
      'Not judged on 0.9.',
      'x'.repeat(190),
      'y'.repeat(170),
      'Built for 0.6 (peers 0.6.2). A declaration, not a test.',
      'Fits statically is not an install test.',
    ]
    const out = packNotes(notes)
    expect(out).toHaveLength(5)
    expect(out[0]).toBe('Receipts: Preview run. Not judged on 0.9.')
    expect(out.slice(-2)).toEqual([notes[4], notes[5]])
    expect(packNotes([...notes, 'z'.repeat(150)])).toEqual([
      'Receipts: Preview run. Not judged on 0.9.',
      'x'.repeat(190),
      'y'.repeat(170),
      `${notes[4]} ${notes[5]}`,
      'z'.repeat(150),
    ])
    // nothing to join: the cap cuts the last
    expect(packNotes(['a'.repeat(150), 'b'.repeat(150), 'c'.repeat(150)], 2)).toEqual([
      'a'.repeat(150),
      'b'.repeat(150),
    ])
  })
})

describe('round 15: the first error of a broken line no rule explains', () => {
  test('`Typecheck failed: TS...`, the words of the isolation sentence; null for a step that printed nothing', () => {
    const r = (excerpt: string | null) => ({
      result: { status: 'broken', failedStep: 'typecheck' },
      steps: [{ name: 'typecheck', excerpt }],
    })
    expect(
      errorFindingText(
        r("src/a.ts(1,1): error TS7016: Could not find a declaration file for module '@open-mercato/ai-assistant'."),
      ),
    ).toBe("Typecheck failed: TS7016 Could not find a declaration file for module '@open-mercato/ai-assistant'.")
    expect(errorFindingText(r('➤ YN0000: · Yarn 4.17.1'))).toBeNull()
    expect(errorFindingText({ ...r('error'), result: { status: 'verified', failedStep: null } })).toBeNull()
  })

  test('the fixture: a typecheck break carries it in compat.lines, the card and check_compat', () => {
    const out = fixtureEmit()
    const index = json<ModulesIndex>(out, 'modules.json')
    const e = index.entries.find((x) => x.locator === 'npm:@piotrkarwatka/marketing-consents')!
    const f = e.compat.lines['0.9']?.finding
    expect(f).toMatch(/^Typecheck failed: TS\d+ /)
    expect(text(out, 'm/@piotrkarwatka/marketing-consents.md')).toContain(`0.9: ${f}`)
    const r = checkCompat(
      { omVersion: '0.9.0', refs: [e.locator] },
      { entries: index.entries, builtIn: [], lines: index.lines, site: OPTS.site, now: OPTS.now },
    ).results[0]!
    expect(r.notes.join(' ')).toContain(`0.9: ${f!.slice(0, 120)}`)
  })
})

describe('round 15: the /for-agents demo numbers the steps of the card', () => {
  test('ksef: the same steps and numbers as the card, notes unnumbered under their step', () => {
    const out = fixtureEmit()
    const index = json<ModulesIndex>(out, 'modules.json')
    const builtIn = json<BuiltInIndex>(out, 'built-in.json')
    const latest = index.lines.find((l) => l.source === 'latest')!
    const p = planInstall(
      { refs: ['@fastwhitecat/integration-ksef-direct'], app: { omVersion: latest.version } },
      {
        entries: index.entries,
        builtIn: builtIn.modules,
        lines: index.lines,
        presets: presetsFromPublished({ entries: index.entries, builtIn: builtIn.modules, lines: index.lines }),
        now: OPTS.now,
      },
    )
    const render = (gs: ReturnType<typeof demoSteps>) =>
      gs.flatMap((g) => (g.n === null ? g.notes : [`${g.n}. ${g.text}`, ...g.notes.map((t) => `   - ${t}`)]))
    const card = text(out, 'm/@fastwhitecat/integration-ksef-direct.md').split('\n')
    const at = card.indexOf(`## Install plan (${latest.key})`)
    const section = card.slice(
      at + 1,
      card.findIndex((l, i) => i > at && l.startsWith('Agent policy')),
    )
    const main = render(demoSteps(p.commands, p.then))
    expect(section.slice(0, main.length)).toEqual(main)
    if (p.emptyPreset) {
      const iso = render(demoSteps(p.emptyPreset.commands, p.emptyPreset.then))
      const lead = section.indexOf('In an app from the empty preset:')
      expect(section.slice(lead + 1, lead + 1 + iso.length)).toEqual(iso)
      // the Grant step of that app is listed (round 14 filtered it out where it equals a new app's)
      const grant = p.emptyPreset.then.find((t) => t.startsWith('Grant '))
      if (grant) expect(iso.some((l) => l.endsWith(grant))).toBe(true)
    }
    // a note is never numbered
    for (const g of numberedSteps([...p.commands, ...p.then]))
      if (g.n !== null) expect(g.text).toMatch(/^(yarn|npx|Grant|Remove)/)
  })

  test('the policy table says when ROUTE_COLLISION speaks, with what it comes with', () => {
    expect(POLICY_ROWS.ROUTE_COLLISION!.when).toBe(
      'On a line without a verdict: the module adds a backend route a new app already has (read statically), or the same version broke on another line for this reason. Comes with NOT_VERIFIED, so the decision stays ask.',
    )
  })
})

describe('round 15: the empty preset command on day 0 (peers of the newest release)', () => {
  // checkout before the first night of the empty preset: 0.9.0 pins its peers to 0.9.0, a new 0.8 app ships 0.8.0
  const checkout = (isolation?: IndexEntry['compat']['isolation']) =>
    ({
      version: {
        latest: '0.9.0',
        preview: null,
        publishedAt: '2026-10-09',
        integrity: null,
        installableFrom: '2026-10-09',
        gitRef: null,
        recommended: { '0.8': null, '0.9': null, next: null },
      },
      installableVersions: { '0.8': '0.9.0', '0.9': '0.9.0', next: '0.9.0' },
      compat: {
        lines: {},
        verifiedOn: [],
        builtFor: {
          range: '0.9.0',
          kind: 'exact-pin',
          lines: ['0.8', '0.9'],
          ranges: { '0.9': '0.9.0', '0.8': '0.8.0' },
        },
        ships: { '0.8': '0.8.0', '0.9': '0.9.0', next: '0.10.1-develop.7583.1.0c886d0a14' },
        ...(isolation ? { isolation } : {}),
      },
    }) as unknown as IndexEntry & { installableVersions: Record<string, string> }

  test('0.9.0 declares 0.9.0 only, so an app from the empty preset of 0.8 gets 0.8.0', () => {
    expect(declaredRangeOf(checkout(), '0.9.0')).toBe('0.9.0')
    expect(declaredRangeOf(checkout(), '0.8.0')).toBe('0.8.0')
    expect(emptyPresetVersion(checkout(), '0.8')).toBe('0.8.0')
    expect(emptyPresetVersion(checkout(), '0.9')).toBe('0.9.0')
    // next ships a develop snapshot: the stable version stays
    expect(emptyPresetVersion(checkout(), 'next')).toBe('0.9.0')
  })

  test('a receipt in isolation wins over the declaration', () => {
    const at = '2026-10-23T15:39:42Z'
    const cell = (status: 'verified' | 'broken') => ({
      '0.8': {
        status,
        step: status === 'broken' ? ('typecheck' as const) : null,
        moduleVersion: '0.9.0',
        at,
        receipt: 'r_x',
      },
    })
    expect(emptyPresetVersion(checkout(cell('verified')), '0.8')).toBe('0.9.0')
    expect(emptyPresetVersion(checkout(cell('broken')), '0.8')).toBe('0.8.0')
  })
})

describe('round 15: an error line reads as the app sees it', () => {
  test('a quoted path in the cell app starts at node_modules/, and its file is no ID in mono', async () => {
    const r = {
      result: { status: 'broken', failedStep: 'typecheck' },
      steps: [
        {
          name: 'typecheck',
          excerpt:
            "src/a.ts(1,1): error TS7016: Could not find a declaration file for module '@open-mercato/ai-assistant'. '/home/om-cell/app/node_modules/@open-mercato/ai-assistant/dist/index.js' implicitly has an 'any' type.",
        },
      ],
    }
    const f = errorFindingText(r)
    expect(f).toBe(
      "Typecheck failed: TS7016 Could not find a declaration file for module '@open-mercato/ai-assistant'. 'node_modules/@open-mercato/ai-assistant/dist/index.js' implicitly has an 'any' type.",
    )
    const { whyHtml } = await import('../../site/src/lib/receipts.ts')
    expect(whyHtml(f!)).not.toContain('<code')
    expect(whyHtml('GET /api/events needs the workflows.view feature.')).toContain(
      '<code translate="no">workflows.view</code>',
    )
  })

  test('the demo copies shell commands only: `Remove { id ... }` is an edit', () => {
    const steps = demoSteps(
      [
        'yarn mercato module add @x/a@1.0.0 --allow-third-party',
        "Remove { id: 'data_sync', from: '@open-mercato/core' } from src/modules.ts",
      ],
      ['yarn generate'],
    )
    expect(steps.map((s) => [s.n, s.command])).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ])
  })
})
