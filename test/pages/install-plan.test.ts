// The Install card gives the steps of the line's install plan (audit of 29 Oct, R3): the packages a module requires and
// the removal of the built-in module it replaces, never only the package's own command.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { withSlotConflicts } from '../../lib/core/entry.ts'
import { presetsOrFallback } from '../../lib/core/lines.ts'
import { planInstall, type PlanContext } from '../../lib/core/plan.ts'
import type { IndexEntry } from '../../lib/schema/published/modules.ts'
import { manualStepText, planInstallLine, installWords } from '../../site/src/components/catalog/cards.ts'
import {
  corpusBuiltIn,
  corpusEntries,
  fixtureBuiltIn,
  fixtureEntries,
  LOC,
  loadFixture,
  NOW,
  ROOT,
} from '../core/helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines
// the presets as the emitter fills them (lib/emit/index.ts)
const presets = presetsOrFallback(fx.presets, lines, NOW)
const fixture: PlanContext = {
  entries: fixtureEntries(fx),
  builtIn: fixtureBuiltIn(fx),
  lines,
  presets,
  now: NOW,
}
const UI = 'npm:@freighttech/ui'
const TERMINAL = 'npm:@freighttech/terminal-tracking'
// terminal-tracking peers on @freighttech/ui (its npm peerDependencies, `requires` of modules.json)
const corpus: PlanContext = {
  entries: withSlotConflicts(
    corpusEntries().map((e) =>
      e.locator === TERMINAL ? { ...e, requires: [{ raw: '@freighttech/ui', resolvesTo: UI }] } : e,
    ),
  ),
  builtIn: corpusBuiltIn(),
  lines,
  presets,
  now: NOW,
}
const FALLBACK = { generate: true, migrate: true }
const card = (ctx: PlanContext, loc: string) => {
  const e = ctx.entries.find((x) => x.locator === loc) as IndexEntry
  const plan = planInstall({ refs: [loc], app: { omVersion: '0.9.0' } }, ctx)
  return { e, plan, line: planInstallLine(e.install.cli, e.install.cmm, e.npm, plan.commands, plan.then, FALLBACK) }
}

describe('the Install command follows the install plan (R3)', () => {
  test('terminal-tracking adds the UI library before its own module add', () => {
    const { e, plan, line: own } = card(corpus, TERMINAL)
    // the corpus has no create-mercato-module command; the emitter gives one to every npm module (lib/core/plan.ts)
    const cmm = 'npx create-mercato-module install @freighttech/terminal-tracking@0.7.3'
    const line = planInstallLine(e.install.cli, cmm, e.npm, plan.commands, plan.then, FALLBACK)
    expect(own.command).toBe(line.command)
    const ui = corpus.entries.find((x) => x.locator === UI)!
    const add = `yarn add @freighttech/ui@${ui.version.latest}`
    expect(line.command.startsWith(`${add} && ${e.install.cli}`)).toBe(true)
    expect(line.command).toContain(' && yarn generate')
    expect(line.manual).toEqual([])
    expect(line.required).toBe(1)
    // the create-mercato-module way keeps the library and swaps only the module's own command
    expect(line.alt).toBe(line.command.replace(e.install.cli, cmm))
    expect(installWords('module', true, { generate: true, migrate: false }, line.required).first).toBe(
      'Run this in your app folder. It adds the module with the package it needs and registers it.',
    )
  })

  test('data-sync-durable adds durable-work, and the removal of data_sync is a step of its own', () => {
    const { e, plan, line } = card(fixture, LOC.datasync)
    expect(plan.commands).toContain("Remove { id: 'data_sync', from: '@open-mercato/core' } from src/modules.ts")
    expect(line.command).toBe(
      [
        'yarn mercato module add @fullstackhouse/open-mercato-durable-work@0.6.0 --allow-third-party',
        e.install.cli,
        'yarn generate',
        'yarn db:migrate',
      ].join(' && '),
    )
    expect(line.command).not.toContain('Remove')
    expect(line.alt).not.toContain('Remove')
    expect(line.alt).toContain('open-mercato-durable-work@0.6.0')
    expect(line.alt).toContain(e.install.cmm!)
    expect(line.manual).toEqual(["Remove { id: 'data_sync', from: '@open-mercato/core' } from src/modules.ts"])
    expect(manualStepText(line.manual[0]!)).toBe(
      "In src/modules.ts, remove { id: 'data_sync', from: '@open-mercato/core' }.",
    )
  })

  test('a module without requires keeps its own command; no plan falls back to it', () => {
    const { e, line } = card(fixture, LOC.ksef)
    expect(line.command).toBe(`${e.install.cli} && yarn generate && yarn db:migrate`)
    expect(line.required).toBe(0)
    const none = planInstallLine(e.install.cli, e.install.cmm, e.npm, null, null, FALLBACK)
    expect(none).toEqual({
      manual: [],
      command: `${e.install.cli} && yarn generate && yarn db:migrate`,
      alt: `${e.install.cmm} && yarn generate && yarn db:migrate`,
      required: 0,
    })
  })

  test('an adapter adds the library it peers on in the same yarn add', () => {
    const model = 'npm:@open-mercato/web-research-model'
    const ctx: PlanContext = {
      ...corpus,
      entries: corpus.entries.map((e) =>
        e.locator === model
          ? { ...e, requires: [{ raw: '@open-mercato/web-research', resolvesTo: 'npm:@open-mercato/web-research' }] }
          : e,
      ),
    }
    const { plan, line } = card(ctx, model)
    expect(plan.commands.length).toBe(2)
    expect(line.command).toMatch(
      /^yarn add @open-mercato\/web-research@\S+ @open-mercato\/web-research-model@\S+ && yarn generate$/,
    )
    expect(line.alt).toBeNull()
    expect(line.required).toBe(1)
  })

  test('the page builds every command of the card from the plan', () => {
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'm', '[...path].astro'), 'utf8')
    expect(page).not.toContain('installLine(entry.install.cli, latestThen, installFallback)')
    expect(page).toContain('planInstallLine(')
    expect(page).toContain('manualStepText(')
  })
})
