// Review r11, decision of 24 Oct. (1) A module a new app (the classic preset) has on and an app from the empty preset has
// off says one sentence on every channel: the card, raw/modules.md, llms-full.txt, built-in.json and plan_install. (2)
// An official package has no claim word in the card's Trust line, as on the page.
import { describe, expect, test } from 'vitest'
import { builtInEnableCommand, builtInPresetText } from '../../lib/core/plan.ts'
import { newAppInstallText, presetInstallText } from '../../lib/core/policy.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import type { BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import type { ModulesIndex } from '../../lib/schema/published/modules.ts'
import { runTool } from '../../mcp/handlers.ts'
import { createCatalogSource } from '../../mcp/index-cache.ts'
import { OPTS, fixtureData, json, skillsDir, text } from './helpers.ts'

const STRIPE = 'npm:@open-mercato/gateway-stripe'
const STRIPE_ADD = 'yarn mercato module add @open-mercato/gateway-stripe@0.9.0'
const CURRENCIES = builtInEnableCommand('currencies')

describe('a new app and the empty preset on every channel (review r11, 24 Oct)', () => {
  const out = buildEmit(fixtureData({ skills: skillsDir() }), OPTS)
  const index = json<ModulesIndex>(out, 'modules.json')
  const builtIn = json<BuiltInIndex>(out, 'built-in.json')

  test('golden: modules.json and built-in.json name the lines', () => {
    expect(index.lines.map((l) => l.defaultPreset)).toEqual(['classic', 'classic', 'classic'])
    expect(index.lines.every((l) => l.presets?.classic?.some((m) => m.id === 'currencies'))).toBe(true)
    const stripe = index.entries.find((e) => e.locator === STRIPE)!
    expect(stripe.compat.inPresets).toEqual(['0.8', '0.9', 'next'])
    expect(stripe.compat.inEmptyPreset).toBeUndefined()
    const cur = builtIn.modules.find((m) => m.id === 'currencies')!
    expect(cur.inPresets).toEqual(['0.8', '0.9', 'next'])
    expect(cur.inEmptyPreset).toBeUndefined()
  })

  test('golden: the card, raw/modules.md and llms-full.txt say the same sentence', () => {
    const sentence = newAppInstallText(['gateway_stripe'], STRIPE_ADD)
    const raw = text(out, 'raw/modules.md')
    expect(raw).toContain(`\n${sentence}\n`)
    const card = text(out, 'm/@open-mercato/gateway-stripe.md')
    expect(card).toContain(`## Install plan (0.9)\n${sentence}\n`)
    expect(card).toContain('\ninstall: null\n')
    expect(card).toContain(`\ninstall_empty_preset: ${STRIPE_ADD}\n`)
    const full = text(out, 'llms-full.txt')
    expect(full).toContain(builtInPresetText({ id: 'currencies', inPresets: ['0.9'] }, '0.9')!)
  })

  test('golden: plan_install without the app plans a new app and names the empty preset apart', async () => {
    const files = out.public
    const site = OPTS.site
    const source = createCatalogSource({
      indexUrl: `${site}/modules.json`,
      fetch: async (url) => {
        const body = files.get(decodeURIComponent(url.slice(site.length + 1)))
        return body === undefined ? new Response('nf', { status: 404 }) : new Response(body as string)
      },
    })
    const cur = await runTool('plan_install', { refs: ['currencies'] }, source, OPTS.now)
    expect(cur.ok && cur.value.commands).toEqual([])
    expect(cur.ok && cur.value.then).toContain('currencies is on in a new app on 0.9: nothing to enable.')
    expect(cur.ok && cur.value.emptyPreset?.commands).toEqual([CURRENCIES])
    const stripe = await runTool('plan_install', { refs: [STRIPE] }, source, OPTS.now)
    expect(stripe.ok && stripe.value.commands).toEqual([])
    expect(stripe.ok && stripe.value.then[0]).toBe(presetInstallText(['gateway_stripe']))
    expect(stripe.ok && stripe.value.emptyPreset?.commands).toEqual([STRIPE_ADD])
  })
})

describe('no claim word for an official package (review r11)', () => {
  const out = buildEmit(fixtureData({ skills: skillsDir() }), OPTS)
  const trust = (path: string): string => {
    const card = text(out, path)
    return card.slice(card.indexOf('## Trust'), card.indexOf('Card:', card.indexOf('## Trust')))
  }
  test('golden: the Trust line of an official card has none, a community card says Unclaimed', () => {
    expect(trust('m/@open-mercato/gateway-stripe.md')).not.toContain('Unclaimed')
    expect(trust('m/@open-mercato/gateway-stripe.md')).not.toContain('Claimed')
    expect(trust('m/@open-mercato/enterprise.md')).not.toContain('Unclaimed')
    expect(trust('m/@fastwhitecat/integration-ksef-direct.md')).toContain(' · Unclaimed · ')
  })
})
