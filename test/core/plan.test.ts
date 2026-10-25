// Install commands (4.6, D10, D46) and plan_install (8.2) on fixture entries and the corpus.
import { describe, expect, it } from 'vitest'
import { withSlotConflicts } from '../../lib/core/entry.ts'
import { builtInEnableCommand, installInfo, planInstall, type PlanContext } from '../../lib/core/plan.ts'
import { INSTALLABLE_META_KEY } from '../../lib/core/policy.ts'
import { RefError } from '../../lib/core/refs.ts'
import { BuiltInIndex } from '../../lib/schema/published/builtin.ts'
import { InstallPlan } from '../../lib/schema/tools.ts'
import {
  builtInIndex,
  consentsBrokenThenGated,
  corpusBuiltIn,
  corpusEntries,
  fixtureBuiltIn,
  fixtureEntries,
  fixtureEntry,
  LOC,
  loadFixture,
  NOW,
} from './helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines
const fixture: PlanContext = {
  entries: fixtureEntries(fx),
  builtIn: fixtureBuiltIn(fx),
  lines,
  presets: fx.presets,
  now: NOW,
}
// corpus entries for packages outside the fixture, fixture entries (real receipts) where they exist
const fixtureLocs = new Set(fixture.entries.map((e) => e.locator))
const corpus: PlanContext = {
  entries: withSlotConflicts([...fixture.entries, ...corpusEntries().filter((e) => !fixtureLocs.has(e.locator))]),
  builtIn: corpusBuiltIn(),
  lines,
  presets: fx.presets,
  now: NOW,
}
const app09 = { omVersion: '0.9.0', enabledModules: fx.presets['0.9']!.empty! }

describe('install commands', () => {
  it('module add with the exact recommended version and --allow-third-party outside @open-mercato', () => {
    const ksef = fixture.entries.find((e) => e.locator === LOC.ksef)!
    expect(ksef.install).toEqual({
      cli: 'yarn mercato module add @fastwhitecat/integration-ksef-direct@0.1.8 --allow-third-party',
      cmm: 'npx create-mercato-module install @fastwhitecat/integration-ksef-direct@0.1.8',
      needsAllowThirdParty: true,
      moduleFlag: null,
    })
    expect(fixture.entries.find((e) => e.locator === LOC.stripe)!.install.cli).toBe(
      'yarn mercato module add @open-mercato/gateway-stripe@0.9.0',
    )
  })

  it('a module already in the empty preset installs with yarn add (D10)', () => {
    const events = {
      npm: '@open-mercato/events',
      locator: 'npm:@open-mercato/events',
      moduleIds: ['events'],
      moduleFlag: null,
    }
    const version = {
      latest: '0.9.0',
      preview: null,
      publishedAt: null,
      integrity: null,
      installableFrom: null,
      gitRef: null,
      recommended: { '0.9': '0.9.0' },
    }
    expect(installInfo({ ...events, version }, '0.9', fx.presets['0.9']!.empty)).toEqual({
      cli: 'yarn add @open-mercato/events@0.9.0',
      cmm: 'npx create-mercato-module install @open-mercato/events@0.9.0',
      needsAllowThirdParty: false,
      moduleFlag: null,
    })
  })

  it('a library is a dependency and a CLI tool runs with npx: neither gets module add (finding of 25 Oct)', () => {
    const version = {
      latest: '0.5.1',
      preview: null,
      publishedAt: null,
      integrity: null,
      installableFrom: null,
      gitRef: null,
      recommended: { '0.9': '0.5.1' },
    }
    const target = {
      npm: 'create-mercato-module',
      locator: 'npm:create-mercato-module',
      moduleIds: [],
      moduleFlag: null,
    }
    expect(installInfo({ ...target, version, kind: 'tool', tags: ['cli', 'scaffold'] }, '0.9')).toEqual({
      cli: 'npx create-mercato-module@0.5.1',
      cmm: null,
      needsAllowThirdParty: false,
      moduleFlag: null,
    })
    // a tool without a command line (a dev-only widget) is a dependency
    expect(installInfo({ ...target, version, kind: 'tool', tags: ['dev-only'] }, '0.9').cli).toBe(
      'yarn add create-mercato-module@0.5.1',
    )
    const ui = { npm: '@freighttech/ui', locator: 'npm:@freighttech/ui', moduleIds: [], moduleFlag: null }
    expect(installInfo({ ...ui, version, kind: 'library' }, '0.9').cli).toBe('yarn add @freighttech/ui@0.5.1')
    // a module keeps module add
    expect(installInfo({ ...ui, version, kind: 'module' }, '0.9').cli).toBe(
      'yarn mercato module add @freighttech/ui@0.5.1 --allow-third-party',
    )
  })

  it('a provider without a module of its own is a dependency, then yarn generate (finding of 25 Oct)', () => {
    const version = {
      latest: '0.9.0',
      preview: null,
      publishedAt: null,
      integrity: null,
      installableFrom: null,
      gitRef: null,
      recommended: { '0.9': '0.9.0' },
    }
    const exa = {
      npm: '@open-mercato/web-research-exa',
      locator: 'npm:@open-mercato/web-research-exa',
      moduleFlag: null,
      version,
      kind: 'provider' as const,
    }
    // `module add` throws `has no modules in src/modules/ or dist/modules/` on the adapter
    expect(installInfo({ ...exa, moduleIds: [] }, '0.9')).toEqual({
      cli: 'yarn add @open-mercato/web-research-exa@0.9.0',
      cmm: null,
      needsAllowThirdParty: false,
      moduleFlag: null,
    })
    // a provider that ships a module keeps module add
    expect(installInfo({ ...exa, moduleIds: ['exa'] }, '0.9').cli).toBe(
      'yarn mercato module add @open-mercato/web-research-exa@0.9.0',
    )
  })

  it('a package with several modules and none named gets one command per module (finding of 25 Oct)', () => {
    const version = {
      latest: '1.0.0',
      preview: null,
      publishedAt: null,
      integrity: null,
      installableFrom: null,
      gitRef: null,
      recommended: { '0.9': '1.0.0' },
    }
    const info = installInfo(
      { npm: '@acme/suite', locator: 'npm:@acme/suite', moduleIds: ['a_one', 'b_two'], moduleFlag: null, version },
      '0.9',
    )
    expect(info).toEqual({
      cli: 'yarn mercato module add @acme/suite@1.0.0 --allow-third-party --module a_one && yarn mercato module add @acme/suite@1.0.0 --allow-third-party --module b_two',
      cmm: null,
      needsAllowThirdParty: true,
      moduleFlag: null,
    })
    // named, one command
    expect(
      installInfo(
        { npm: '@acme/suite', locator: 'npm:@acme/suite', moduleIds: ['a_one', 'b_two'], moduleFlag: 'b_two', version },
        '0.9',
      ).cli,
    ).toBe('yarn mercato module add @acme/suite@1.0.0 --allow-third-party --module b_two')
  })

  it('the enterprise package is turned on in .env, as a new app does it (finding of 25 Oct)', () => {
    const ent = fixture.entries.find((e) => e.locator === LOC.enterprise)!
    expect(ent.moduleIds.length).toBeGreaterThan(1)
    expect(ent.install).toEqual({
      cli: 'echo OM_ENABLE_ENTERPRISE_MODULES=true >> .env && yarn generate',
      cmm: null,
      needsAllowThirdParty: false,
      moduleFlag: null,
    })
    const plan = InstallPlan.parse(planInstall({ refs: [LOC.enterprise] }, fixture))
    expect(plan.commands).toEqual(['echo OM_ENABLE_ENTERPRISE_MODULES=true >> .env'])
    expect(plan.then[0]).toMatch(/^A new app already has @open-mercato\/enterprise\. /)
    expect(plan.then.join('\n')).toContain('OM_ENABLE_ENTERPRISE_MODULES_SSO=true')
    expect(plan.then).toContain('yarn generate')
    expect(plan.then).toContain('yarn db:migrate (ask the user first)')
    // never a bare module add of a package with several modules
    for (const c of [...plan.commands, ...(plan.emptyPreset?.commands ?? [])])
      expect(c).not.toMatch(/module add @open-mercato\/enterprise@[^ ]+$/)
  })

  it('no entry gets a module add that the OM CLI refuses: a module to add, and --module where there are several', () => {
    // the fixture entries as the emitter builds them, and every corpus entry (all kinds) through installInfo
    const commands = [
      ...fixture.entries.map((e) => ({ e, cli: e.install.cli })),
      ...corpus.entries.map((e) => ({ e, cli: installInfo({ ...e, moduleFlag: e.install.moduleFlag }, '0.9').cli })),
    ]
    for (const { e, cli } of commands) {
      for (const cmd of cli.split(' && ').filter((c) => c.includes(' module add '))) {
        expect(e.moduleIds.length, e.locator).toBeGreaterThan(0)
        if (e.moduleIds.length > 1) expect(cmd, e.locator).toMatch(/ --module [a-z][a-z0-9_]*$/)
      }
    }
  })

  it('GitHub-only entries install through create-mercato-module with --ref', () => {
    const version = {
      latest: '0.2.0',
      preview: null,
      publishedAt: null,
      integrity: null,
      installableFrom: null,
      gitRef: 'v0.2.0',
      recommended: {},
    }
    expect(
      installInfo({ npm: null, locator: LOC.treg, moduleIds: ['enrichment_treg'], moduleFlag: null, version }, '0.9')
        .cli,
    ).toBe('npx create-mercato-module install Chmarusso/open-mercato-enrichment-treg --ref v0.2.0')
  })

  it('built-in modules use module enable, never module add', () => {
    const idx = BuiltInIndex.parse(builtInIndex(fixtureBuiltIn(fx)))
    expect(idx.modules.map((m) => m.install)).toEqual([
      'yarn mercato module enable @open-mercato/core --module currencies',
      'yarn mercato module enable @open-mercato/core --module data_sync',
      'yarn mercato module enable @open-mercato/core --module wms',
    ])
    expect(builtInEnableCommand('wms')).not.toContain('module add')
  })
})

describe('planInstall', () => {
  it('ksef on a fresh 0.9 app: enable integrations, add with exact version, ask', async () => {
    const plan = InstallPlan.parse(
      planInstall({ refs: ['@fastwhitecat/integration-ksef-direct'], app: app09 }, fixture),
    )
    expect(plan.line).toBe('0.9')
    expect(plan.order).toEqual([
      {
        locator: LOC.ksef,
        version: '0.1.8',
        moduleIds: ['integration_ksef_direct'],
        reason: 'requested',
        requiredBy: [],
      },
    ])
    expect(plan.builtInNeeded).toEqual([
      {
        id: 'integrations',
        enabled: false,
        command: 'yarn mercato module enable @open-mercato/core --module integrations',
      },
    ])
    expect(plan.commands).toEqual([
      'yarn mercato module enable @open-mercato/core --module integrations',
      'yarn mercato module add @fastwhitecat/integration-ksef-direct@0.1.8 --allow-third-party',
    ])
    expect(plan.then.slice(0, 2)).toEqual(['yarn generate', 'yarn db:migrate (ask the user first)'])
    expect(plan.then[2]).toMatch(/^Grant these permissions to roles the user names: integration_ksef_direct\./)
    expect(plan.agentPolicy.decision).toBe('ask')
    expect(plan.consentText).toBe('Install @fastwhitecat/integration-ksef-direct@0.1.8')
    await expect(`${JSON.stringify(plan, null, 2)}\n`).toMatchFileSnapshot('golden/plan/ksef-0.9.json')
  })

  it('data-sync-durable: remove the core registration first, slot conflict with an enabled core data_sync', async () => {
    const app = {
      omVersion: '0.9.0',
      enabledModules: [...app09.enabledModules, { id: 'data_sync', from: '@open-mercato/core' }],
    }
    const plan = InstallPlan.parse(planInstall({ refs: [LOC.datasync], app }, fixture))
    // durable-work is a peer of data-sync-durable and a catalog module: Yarn does not install peers (spec 5.3)
    expect(plan.order.map((o) => [o.locator, o.version, o.reason, o.requiredBy])).toEqual([
      [LOC.durable, '0.6.0', 'required', [LOC.datasync]],
      [LOC.datasync, '0.6.0', 'requested', []],
    ])
    expect(plan.commands).toEqual([
      'yarn mercato module add @fullstackhouse/open-mercato-durable-work@0.6.0 --allow-third-party',
      "Remove { id: 'data_sync', from: '@open-mercato/core' } from src/modules.ts",
      'yarn mercato module add @fullstackhouse/open-mercato-data-sync-durable@0.6.0 --allow-third-party',
    ])
    expect(plan.consentText).toBe(
      'Install @fullstackhouse/open-mercato-durable-work@0.6.0, @fullstackhouse/open-mercato-data-sync-durable@0.6.0',
    )
    expect(plan.conflicts.map((c) => c.kind)).toEqual(['slot', 'replaces'])
    expect(plan.conflicts[0]).toEqual({
      kind: 'slot',
      detail: 'Competes for slot data_sync with @open-mercato/core. You can enable only one.',
      with: '@open-mercato/core',
    })
    expect(plan.agentPolicy.reasons.map((r) => r.code)).toEqual(['THIRD_PARTY', 'NOT_VERIFIED', 'REPLACES', 'SLOT'])
    await expect(`${JSON.stringify(plan, null, 2)}\n`).toMatchFileSnapshot('golden/plan/data-sync-durable-0.9.json')
  })

  it('cpq-billing-connector: requires closure, cpq and billing first (deepest first)', async () => {
    const plan = InstallPlan.parse(planInstall({ refs: ['@dainamite/cpq-billing-connector'], app: app09 }, corpus))
    expect(plan.order.map((o) => [o.locator, o.reason, o.requiredBy])).toEqual([
      ['npm:@dainamite/cpq', 'required', ['npm:@dainamite/cpq-billing-connector']],
      ['npm:@dainamite/billing', 'required', ['npm:@dainamite/cpq-billing-connector']],
      ['npm:@dainamite/cpq-billing-connector', 'requested', []],
    ])
    const needed = Object.fromEntries(plan.builtInNeeded.map((b) => [b.id, b.enabled]))
    expect(needed).toMatchObject({
      auth: true,
      directory: true,
      catalog: false,
      sales: false,
      customers: false,
      dictionaries: false,
      configs: true,
      payment_gateways: false,
    })
    const adds = plan.commands.filter((c) => c.startsWith('yarn mercato module add'))
    expect(adds).toEqual([
      'yarn mercato module add @dainamite/cpq@0.4.0 --allow-third-party',
      'yarn mercato module add @dainamite/billing@0.19.0 --allow-third-party',
      'yarn mercato module add @dainamite/cpq-billing-connector@1.0.0 --allow-third-party',
    ])
    expect(plan.commands.some((c) => c.includes('--module auth'))).toBe(false)
    expect(plan.commands.indexOf('yarn mercato module enable @open-mercato/core --module catalog')).toBeLessThan(
      plan.commands.indexOf(adds[0]!),
    )
    expect(plan.consentText).toBe(
      'Install @dainamite/cpq@0.4.0, @dainamite/billing@0.19.0, @dainamite/cpq-billing-connector@1.0.0',
    )
    await expect(`${JSON.stringify(plan, null, 2)}\n`).toMatchFileSnapshot('golden/plan/cpq-billing-connector-0.9.json')
  })

  it('search in an app with the empty preset: Already enabled.', () => {
    const plan = InstallPlan.parse(planInstall({ refs: ['@open-mercato/search'], app: app09 }, corpus))
    // `commands` holds only steps to run; the note goes to `then`
    expect(plan.commands).toEqual([])
    expect(plan.then).toEqual(['Already enabled. @open-mercato/search is registered in src/modules.ts.'])
  })

  it('a third-party release in the age gate without recommended: the older installable stable version', async () => {
    // durable-work 0.7.0 published 2 days before NOW (gate until 26 Oct), 0.6.0 installable; no receipts yet
    const sync = structuredClone(fx.sync(LOC.durable)!)
    sync.npm!.previousStable = '0.6.0'
    sync.npm!.latestStable = '0.7.0'
    sync.npm!.publishedAt['0.7.0'] = '2026-10-21T10:00:00Z'
    const durable = fixtureEntry(fx, LOC.durable, { sync, receipts: [] })
    expect(durable.version.latest).toBe('0.7.0')
    expect(durable.version.installableFrom).toBe('2026-10-26')
    expect(durable.version.recommended['0.9']).toBeNull()
    expect(durable._meta[INSTALLABLE_META_KEY]).toEqual({ '0.9': '0.6.0', '0.8': '0.6.0', next: '0.6.0' })
    expect(durable.install.cli).toBe(
      'yarn mercato module add @fullstackhouse/open-mercato-durable-work@0.6.0 --allow-third-party',
    )
    expect(durable.agentPolicy['0.9']?.decision).toBe('ask')
    expect(durable.agentPolicy['0.9']?.consentText).toBe('Install @fullstackhouse/open-mercato-durable-work@0.6.0')
    const ctx: PlanContext = {
      ...fixture,
      entries: fixture.entries.map((e) => (e.locator === LOC.durable ? durable : e)),
    }
    const plan = InstallPlan.parse(planInstall({ refs: [LOC.durable], app: app09 }, ctx))
    expect(plan.order.map((o) => o.version)).toEqual(['0.6.0'])
    expect(plan.commands).toEqual([
      'yarn mercato module add @fullstackhouse/open-mercato-durable-work@0.6.0 --allow-third-party',
    ])
    expect(plan.agentPolicy.decision).toBe('ask')
    expect(plan.agentPolicy.reasons.map((r) => r.code)).toEqual(['THIRD_PARTY', 'NOT_VERIFIED'])
    expect(plan.consentText).toBe('Install @fullstackhouse/open-mercato-durable-work@0.6.0')
    await expect(`${JSON.stringify({ install: durable.install, plan }, null, 2)}\n`).toMatchFileSnapshot(
      'golden/plan/durable-work-gated-latest-0.9.json',
    )
    // the same release with no older stable version: QUARANTINE until 26 Oct, command on the gated version
    const only = structuredClone(sync)
    only.npm!.previousStable = null
    only.npm!.publishedAt = { '0.7.0': '2026-10-21T10:00:00Z' }
    const fresh = fixtureEntry(fx, LOC.durable, { sync: only, receipts: [] })
    expect(fresh.install.cli).toBe(
      'yarn mercato module add @fullstackhouse/open-mercato-durable-work@0.7.0 --allow-third-party',
    )
    expect(fresh.agentPolicy['0.9']).toMatchObject({ decision: 'refuse', until: '2026-10-26' })
    expect(fresh.agentPolicy['0.9']?.reasons[0]?.code).toBe('QUARANTINE')
  })

  it('a built-in ref plans module enable', () => {
    const plan = InstallPlan.parse(planInstall({ refs: ['currencies'], app: app09 }, fixture))
    expect(plan.order).toEqual([])
    expect(plan.builtInNeeded).toEqual([
      {
        id: 'currencies',
        enabled: false,
        command: 'yarn mercato module enable @open-mercato/core --module currencies',
      },
    ])
    expect(plan.commands).toEqual(['yarn mercato module enable @open-mercato/core --module currencies'])
    expect(plan.agentPolicy.decision).toBe('allow')
  })

  it('consents on 0.9 refuses; an unknown ref throws with candidates', () => {
    expect(planInstall({ refs: [LOC.consents], app: app09 }, fixture).agentPolicy.decision).toBe('refuse')
    expect(() => planInstall({ refs: ['@nobody/nothing'] }, fixture)).toThrow(RefError)
    try {
      planInstall({ refs: ['durable'] }, fixture)
    } catch (err) {
      expect((err as RefError).candidates).toContain(LOC.durable)
    }
  })

  it('consents confirmed broken on 0.1.0 with 0.1.1 in the age gate: refuse BROKEN, no consent text', () => {
    const consents = fixtureEntry(fx, LOC.consents, consentsBrokenThenGated(fx))
    const ctx: PlanContext = {
      ...fixture,
      entries: fixture.entries.map((e) => (e.locator === LOC.consents ? consents : e)),
    }
    const plan = InstallPlan.parse(planInstall({ refs: [LOC.consents], app: app09 }, ctx))
    expect(plan.agentPolicy.decision).toBe('refuse')
    expect(plan.agentPolicy.reasons[0]).toEqual({ code: 'BROKEN', text: 'Broken at typecheck on 0.9 since 23 Oct.' })
    expect(plan.agentPolicy.reasons.map((r) => r.code)).not.toContain('NOT_VERIFIED')
    expect(plan.agentPolicy.consentText).toBeUndefined()
    expect(plan.consentText).toBeNull()
  })

  it('a GitHub-only entry without a tag: no command, a note, refuse', () => {
    const plan = InstallPlan.parse(planInstall({ refs: [LOC.treg], app: app09 }, fixture))
    expect(plan.order).toEqual([])
    expect(plan.commands).toEqual([])
    expect(plan.then).toContain(`${LOC.treg} has no installable version (no stable release or pinned tag).`)
    expect(plan.agentPolicy.decision).toBe('refuse')
    expect(plan.agentPolicy.reasons[0]?.code).toBe('UNPINNED_GIT')
  })

  it('without app context: preset modules are assumed, built-ins outside the preset get a command', () => {
    const plan = InstallPlan.parse(planInstall({ refs: [LOC.ksef] }, fixture))
    expect(plan.line).toBe('0.9')
    expect(plan.builtInNeeded[0]).toEqual({
      id: 'integrations',
      enabled: null,
      command: builtInEnableCommand('integrations'),
    })
    expect(plan.commands[0]).toBe(builtInEnableCommand('integrations'))
  })
})
