// AgentPane (spec 7.7 I, 12.2 WP13): the three deterministic scenarios run the real lib/core functions on the
// published files the emitter builds from the data fixture. Plus the /for-agents metadata kept in step with lib/core.
import { describe, expect, test } from 'vitest'
import { POLICY_CODES } from '../../lib/core/policy.ts'
import type { SearchIndexData } from '../../lib/core/search.ts'
import type { BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import type { ModulesIndex } from '../../lib/schema/published/modules.ts'
import {
  CAPTION,
  POLICY_ROWS,
  SCENARIOS,
  addsText,
  describeSchema,
  ownAgentPrompt,
  plural,
  runAgent,
  thenStep,
  webmcpSentence,
  type PaneData,
} from '../../site/src/islands/AgentPane.tsx'
import { fixtureEmit, json, SITE } from '../emit/helpers.ts'

const r = fixtureEmit()
const data: PaneData = {
  modules: json<ModulesIndex>(r, 'modules.json'),
  builtIn: json<BuiltInIndex>(r, 'built-in.json'),
  search: json<SearchIndexData>(r, 'search-index.json'),
}
const OM = data.modules.lines.find((l) => l.source === 'latest')!.version

describe('scenarios', () => {
  test('the three scenarios of the spec', () => {
    expect(SCENARIOS).toEqual(['send invoices to KSeF', 'exchange rates', 'durable data sync'])
    expect(CAPTION).toBe('These are the exact calls and responses your agent gets. No model involved.')
  })

  test.each(SCENARIOS)('%s is deterministic: same calls and responses on every run', (q) => {
    const a = runAgent(q, data, OM)
    const b = runAgent(q, data, OM)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    expect(a.calls.map((c) => c.tool)).toEqual(['search_modules', 'check_compat', 'plan_install'])
    expect(a.calls.every((c) => !c.error)).toBe(true)
    expect(a.calls[0]!.args).toEqual({ query: q, omVersion: OM })
    expect(a.calls[1]!.args).toEqual({ refs: [a.picked!.ref], omVersion: OM })
  })

  test('send invoices to KSeF: the KSeF module, ask (third party), exact version', () => {
    const a = runAgent('send invoices to KSeF', data, OM)
    expect(a.picked).toEqual({ ref: 'npm:@fastwhitecat/integration-ksef-direct', builtIn: false })
    expect(a.plan?.agentPolicy.decision).toBe('ask')
    expect(a.plan?.agentPolicy.reasons.map((x) => x.code)).toContain('THIRD_PARTY')
    expect(a.plan?.commands.at(-1)).toMatch(
      /^yarn mercato module add @fastwhitecat\/integration-ksef-direct@\d+\.\d+\.\d+ --allow-third-party$/,
    )
    expect(a.plan?.consentText).toMatch(/^Install @fastwhitecat\/integration-ksef-direct@/)
  })

  test('exchange rates: built into core first (currencies), enable instead of install', () => {
    const a = runAgent('exchange rates', data, OM)
    // review r11, 24 Oct: the card says that a new app already has it on, and the command of an app from the empty preset
    expect(a.picked).toEqual({
      ref: 'currencies',
      builtIn: true,
      presetNote:
        'On in a new app on 0.9: nothing to enable. In an app from the empty preset: yarn mercato module enable @open-mercato/core --module currencies',
    })
    expect(a.plan?.builtInNeeded.map((b) => b.id)).toContain('currencies')
    expect(a.plan?.order).toEqual([])
    // review r12: the demo plans for a new app (no `enabledModules: []`), the empty preset named apart
    expect(a.plan?.commands).toEqual([])
    expect(a.plan?.emptyPreset?.commands).toContain('yarn mercato module enable @open-mercato/core --module currencies')
    expect(a.plan?.agentPolicy.decision).toBe('allow')
    // step 2 says what a built-in answer means instead of a record of nulls
    expect(a.calls[1]!.gist[0]).toBe(`Built into core ${OM}: no package to check.`)
    expect(JSON.stringify(a.calls[1]!.response)).not.toContain('null')
  })

  test('every call prints a short gist of two to four lines and keeps the whole response', () => {
    for (const q of SCENARIOS)
      for (const c of runAgent(q, data, OM).calls) {
        expect(c.gist.length).toBeGreaterThanOrEqual(2)
        expect(c.gist.length).toBeLessThanOrEqual(4)
        expect(c.full).not.toBeNull()
      }
  })

  test('durable data sync: the drop-in replacement, ask REPLACES, core registration removed first', () => {
    const a = runAgent('durable data sync', data, OM)
    expect(a.picked?.ref).toBe('npm:@fullstackhouse/open-mercato-data-sync-durable')
    const codes = a.plan?.agentPolicy.reasons.map((x) => x.code) ?? []
    expect(codes).toContain('REPLACES')
    expect(a.plan?.commands.some((c) => c.startsWith("Remove { id: 'data_sync'"))).toBe(true)
    expect(a.plan?.order.map((o) => o.locator)).toEqual([
      'npm:@fullstackhouse/open-mercato-durable-work',
      'npm:@fullstackhouse/open-mercato-data-sync-durable',
    ])
  })

  test('nothing matches: one call, no pick, no plan', () => {
    const a = runAgent('zzzzqqq xylophone', data, OM)
    expect(a.calls.map((c) => c.tool)).toEqual(['search_modules'])
    expect(a.picked).toBeNull()
    expect(a.plan).toBeNull()
  })
})

describe('own agent prompt', () => {
  test('carries the session query, sanitized, never a URL', () => {
    const p = ownAgentPrompt('send invoices to KSeF https://evil.example/x', SITE)
    expect(p).toContain('I need this in my Open Mercato app: send invoices to KSeF')
    expect(p).not.toContain('evil.example')
  })
  test('without a query: a generic prompt', () => {
    expect(ownAgentPrompt(null, SITE)).toContain(`${SITE}/llms.txt`)
  })
})

describe('/for-agents metadata', () => {
  test('every reason code of lib/core/policy.ts has a row, decisions as in spec 6.5', () => {
    expect(Object.keys(POLICY_ROWS).sort()).toEqual([...POLICY_CODES].sort())
    const refuse = ['HOLD', 'ADVISORY', 'BROKEN', 'QUARANTINE', 'NOT_INSTALLABLE', 'UNPINNED_GIT']
    for (const [code, row] of Object.entries(POLICY_ROWS))
      expect(row.decision).toBe(
        refuse.includes(code) ? 'refuse' : code === 'OFFICIAL_VERIFIED' || code === 'IN_PRESET' ? 'allow' : 'ask',
      )
  })

  test('tool inputs from /schema/tools-1.json', () => {
    const tools = json<{ $defs: Record<string, Parameters<typeof describeSchema>[0]> }>(r, 'schema/tools-1.json')
    const search = describeSchema(tools.$defs.SearchModulesInput!)
    expect(search.find((p) => p.name === 'query')).toEqual({
      name: 'query',
      required: true,
      type: 'string, at most 200 chars',
    })
    expect(search.find((p) => p.name === 'limit')?.type).toBe('integer, 1 to 20, default 10')
    const plan = describeSchema(tools.$defs.PlanInstallInput!)
    expect(plan.find((p) => p.name === 'refs')?.type).toBe('array of string, 1 to 10')
    // arrays of an enum keep every value (was cut to the first one)
    expect(search.find((p) => p.name === 'type')?.type).toBe(
      'array of one of official | community | 3rd-party, at most 3',
    )
    const get = describeSchema(tools.$defs.GetModuleInput!)
    expect(get.find((p) => p.name === 'sections')?.type).toBe(
      'array of one of anatomy | compat | trust | install | versions | readme, at most 6',
    )
  })
})

describe('/for-agents texts', () => {
  test('the WebMCP sentence depends on the origin trial token (D20)', () => {
    expect(webmcpSentence({ token: 'A1b2C3token', expires: '2027-01-01' })).toEqual({
      text: 'This page registers the same read-only tools for in-browser agents in Chrome with WebMCP.',
      code: null,
      after: '',
    })
    const off = webmcpSentence(null)
    expect(`${off.text}${off.code}${off.after}`).toBe(
      'Works in Chrome with the WebMCP flag enabled (chrome://flags/#enable-webmcp-testing).',
    )
  })

  test('the install plan counts with the right noun', () => {
    expect(plural(1, 'table')).toBe('1 table')
    expect(plural(21, 'route')).toBe('21 routes')
    const plan = runAgent('durable data sync', data, OM).plan!
    expect(addsText(plan)).not.toMatch(/\b1 (tables|routes|permissions|events)\b/)
    expect(addsText(plan)).toMatch(/^\d+ tables?, \d+ routes? \(\d+ public\), \d+ permissions?, \d+ events?$/)
  })

  test('then steps: commands in mono with their note, permission IDs as a list', () => {
    expect(thenStep('yarn generate')).toEqual({ command: 'yarn generate', note: null, label: null, ids: [] })
    expect(thenStep('yarn db:migrate (ask the user first)')).toEqual({
      command: 'yarn db:migrate',
      note: 'ask the user first',
      label: null,
      ids: [],
    })
    expect(thenStep('Grant these permissions to roles the user names: a_b.view, a_b.received_documents.sync')).toEqual({
      command: null,
      note: null,
      label: 'Grant these permissions to roles the user names',
      ids: ['a_b.view', 'a_b.received_documents.sync'],
    })
    expect(thenStep('Restart the app.').note).toBe('Restart the app.')
  })
})
