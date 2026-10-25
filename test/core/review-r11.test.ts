// Review r11 (P1), decision of 24 Oct: create-mercato-app makes a new app from the `classic` preset unless told `--preset
// empty` (DEFAULT_PRESET_ID, packages/create-app/src/lib/starter-presets.ts), and classic keeps the template's
// src/modules.ts: currencies, workflows, checkout, webhooks and the channels are on in such an app. Since 24 Oct `a new
// app` is that app: the catalog knows both presets per line (`registeredIn`), plan_install plans for a new app and names
// the steps of an app from the empty preset apart, and every channel says one sentence.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { checkCompat } from '../../lib/core/compat.ts'
import { CLASSIC_PRESET_FALLBACK, newAppLines, presetsOrFallback, registeredIn } from '../../lib/core/lines.ts'
import { builtInEnableCommand, builtInPresetText, planInstall, type PlanContext } from '../../lib/core/plan.ts'
import { claimLabel, newAppInstallText } from '../../lib/core/policy.ts'
import { presetFromModulesTs } from '../../lib/receipts/state.ts'
import { Lines } from '../../lib/schema/data/index.ts'
import { defaultPresetFrom } from '../../lib/sources/lines.ts'
import { fixtureBuiltIn, fixtureEntries, fixtureEntry, LOC, loadFixture, NOW, ROOT, SITE } from './helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines
const presets = presetsOrFallback(fx.presets, lines, NOW)
const template = (v: string): string =>
  readFileSync(join(ROOT, 'test', 'fixtures', 'create-app', `modules-${v}.ts.txt`), 'utf8')
const CURRENCIES = builtInEnableCommand('currencies')
const STRIPE_ADD = 'yarn mercato module add @open-mercato/gateway-stripe@0.9.0'

describe('the default preset of a line', () => {
  test('watch reads it from the tarball: DEFAULT_PRESET_ID and the template modules', () => {
    const dist = 'var x = 1;\nvar DEFAULT_PRESET_ID = "classic";\n'
    const d = defaultPresetFrom(template('0.9.0'), dist)
    expect(d?.id).toBe('classic')
    expect(d?.modules).toContainEqual({ id: 'currencies', from: '@open-mercato/core' })
    expect(d?.modules).toContainEqual({ id: 'checkout', from: '@open-mercato/checkout' })
    // the `@app` probe, a commented entry and the env blocks are not in a new app
    expect(d?.modules.some((m) => m.id === 'ratelimit_probe')).toBe(false)
    expect(d?.modules.some((m) => m.id === 'customer_groups')).toBe(false)
    expect(d?.modules.some((m) => m.from === '@open-mercato/enterprise')).toBe(false)
    // another default preset, or none read: not known
    expect(defaultPresetFrom(template('0.9.0'), 'var DEFAULT_PRESET_ID = "empty";')).toBeNull()
    expect(defaultPresetFrom(undefined, dist)).toBeNull()
    // the lines.json field validates
    const withPreset = { ...fx.lines, lines: fx.lines.lines.map((l) => ({ ...l, defaultPreset: d })) }
    expect(Lines.safeParse(withPreset).success).toBe(true)
  })

  test('the day-0 fallback is what the parser reads from the 0.8.0 and 0.9.0 templates', () => {
    const sorted = (xs: readonly { id: string; from: string }[]) => xs.map((m) => `${m.from}:${m.id}`).sort()
    for (const v of ['0.8.0', '0.9.0'])
      expect(sorted(CLASSIC_PRESET_FALLBACK[v]!)).toEqual(sorted(presetFromModulesTs(template(v), 160)))
  })

  test('registeredIn: a new app (classic) and an app from the empty preset', () => {
    expect(registeredIn(presets, '0.9', 'empty', '@open-mercato/events', ['events'])).toBe(true)
    expect(registeredIn(presets, '0.9', 'classic', '@open-mercato/events', ['events'])).toBe(true)
    expect(registeredIn(presets, '0.9', 'classic', '@open-mercato/core', ['currencies'])).toBe(true)
    expect(registeredIn(presets, '0.9', 'empty', '@open-mercato/core', ['currencies'])).toBe(false)
    expect(registeredIn(presets, '0.9', 'classic', '@open-mercato/gateway-stripe', ['gateway_stripe'])).toBe(true)
    expect(registeredIn(presets, '0.9', 'classic', '@fastwhitecat/integration-ksef-direct')).toBe(false)
    // telemetry joined the template in 0.9.0
    expect(newAppLines(presets, lines, '@open-mercato/telemetry').sort()).toEqual(['0.9', 'next'])
    // presets.json alone (no classic list): not known, so never on
    expect(registeredIn(fx.presets, '0.9', 'classic', '@open-mercato/core', ['currencies'])).toBe(false)
  })
})

describe('one sentence for a module a new app has on and the empty preset has off', () => {
  const ctx: PlanContext = {
    entries: fixtureEntries(fx),
    builtIn: fixtureBuiltIn(fx),
    lines,
    presets,
    now: NOW,
  }

  test('plan_install without the app: the plan of a new app, the empty preset named apart', () => {
    for (const app of [{ omVersion: '0.9.0' }, undefined]) {
      const c = planInstall({ refs: ['currencies'], ...(app ? { app } : {}) }, ctx)
      expect(c.commands).toEqual([])
      expect(c.then).toContain('currencies is on in a new app on 0.9: nothing to enable.')
      expect(c.then).not.toContain('yarn generate')
      expect(c.builtInNeeded).toEqual([{ id: 'currencies', enabled: null, command: CURRENCIES, inNewApp: true }])
      expect(c.emptyPreset?.commands).toEqual([CURRENCIES])
    }
    const stripe = planInstall({ refs: [LOC.stripe] }, ctx)
    expect(stripe.commands).toEqual([])
    expect(stripe.then[0]).toBe('Nothing to install: a new app already registers gateway_stripe in src/modules.ts.')
    expect(stripe.emptyPreset?.commands).toEqual([STRIPE_ADD])
  })

  test('plan_install for an app with its modules: the steps of that app, nothing named apart', () => {
    const app = { omVersion: '0.9.0', enabledModules: presets['0.9']!.empty }
    const p = planInstall({ refs: [LOC.stripe], app }, ctx)
    expect(p.commands).toContain(STRIPE_ADD)
    expect(p.emptyPreset).toBeUndefined()
    const app2 = { omVersion: '0.9.0', enabledModules: presets['0.9']!.classic! }
    const q = planInstall({ refs: [LOC.stripe], app: app2 }, ctx)
    expect(q.commands).toEqual([])
    expect(q.then[0]).toBe('Already enabled. @open-mercato/gateway-stripe is registered in src/modules.ts.')
  })

  test('check_compat says it for the built-in module and for the package', () => {
    const builtIn = fixtureBuiltIn(fx).map((b) => ({
      ...b,
      inPresets: ['0.8', '0.9', 'next'].filter((k) =>
        registeredIn(presets, k, 'classic', '@open-mercato/core', [b.id]),
      ),
      inEmptyPreset: ['0.8', '0.9', 'next'].filter((k) =>
        registeredIn(presets, k, 'empty', '@open-mercato/core', [b.id]),
      ),
    }))
    const stripe = fixtureEntry({ ...fx, presets }, LOC.stripe)
    expect(stripe.compat.inPresets).toEqual(['0.8', '0.9', 'next'])
    expect(stripe.compat.inEmptyPreset).toBeUndefined()
    const out = checkCompat(
      { refs: ['currencies', LOC.stripe], omVersion: '0.9.0' },
      { entries: [stripe], builtIn, lines, site: SITE, now: NOW },
    )
    const sentence = builtInPresetText({ id: 'currencies', inPresets: ['0.9'] }, '0.9')
    expect(sentence).toBe(`On in a new app on 0.9: nothing to enable. In an app from the empty preset: ${CURRENCIES}`)
    expect(out.results[0]!.notes).toEqual(['Built into Open Mercato core as currencies.', sentence])
    expect(out.results[1]!.notes).toContain(newAppInstallText(['gateway_stripe'], STRIPE_ADD))
  })
})

describe('claims and findings (review r11)', () => {
  test('an official package has no claim word; a community one says Claimed or Unclaimed', () => {
    const entries = fixtureEntries(fx)
    expect(claimLabel(entries.find((e) => e.locator === LOC.stripe)!)).toBeNull()
    expect(claimLabel(entries.find((e) => e.locator === LOC.ksef)!)).toBe('Unclaimed')
    expect(claimLabel({ type: 'community', identity: { claimed: true } })).toBe('Claimed')
  })
})
