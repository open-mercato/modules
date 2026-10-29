// Round 2 of the audit of 29 Oct (C01, Codex review of int/audit): every published command of a new app (the classic
// preset) for a module it registers behind an env flag is the install plan's, joined: `yarn add`, the flag, `yarn
// generate`. Round 1 fixed the plan, the page and the picker; modules.json `install.cli`, the card's front matter and
// search_modules still gave `module add`, which registers storage_s3 a second time. The enterprise package, whose
// modules a new app also turns on in .env, is held to the same rule. An app from the empty preset keeps `module add`
// with the flag.
import { parse } from 'yaml'
import { describe, expect, test } from 'vitest'
import { presetsOrFallback } from '../../lib/core/lines.ts'
import { planInstall, type PlanContext } from '../../lib/core/plan.ts'
import { buildSearchIndex, installFields } from '../../lib/core/search.ts'
import { moduleCard } from '../../lib/emit/markdown.ts'
import { buildEntryContexts } from '../../lib/emit/modules-json.ts'
import { buildPicker } from '../../lib/emit/picker.ts'
import { IndexEntry } from '../../lib/schema/published/modules.ts'
import { fixtureData, OPTS } from '../emit/helpers.ts'
import { fixtureBuiltIn, fixtureEntries, fixtureEntry, LOC, loadFixture, NOW, SITE, type Fixture } from './helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines
const latest = lines.find((l) => l.source === 'latest')!.key
const presets = presetsOrFallback(fx.presets, lines, NOW)
const S3 = 'npm:@open-mercato/storage-s3'

// storage-s3 from the data of gateway-stripe, an official one-module package: the same receipts and facts under the
// name and module ID the classic template registers behind OM_ENABLE_STORAGE_S3 (the presets stay as they are, so no
// preset list names it)
const swap = <T>(x: T): T =>
  JSON.parse(
    JSON.stringify(x).replaceAll('gateway-stripe', 'storage-s3').replaceAll('gateway_stripe', 'storage_s3'),
  ) as T
const s3Fx: Fixture = {
  ...fx,
  descriptors: new Map([...fx.descriptors, [S3, swap(fx.descriptors.get(LOC.stripe)!)]]),
  sync: (l) => (l === S3 ? swap(fx.sync(LOC.stripe)) : fx.sync(l)),
  facts: (l, v) => (l === S3 ? swap(fx.facts(LOC.stripe, v)) : fx.facts(l, v)),
  fit: (l, v) => (l === S3 ? swap(fx.fit(LOC.stripe, v)) : fx.fit(l, v)),
  receipts: (l) => (l === S3 ? swap(fx.receipts(LOC.stripe)) : fx.receipts(l)),
}
const s3 = fixtureEntry(s3Fx, S3)
const enterprise = fixtureEntry(fx, LOC.enterprise)
const entries = [...fixtureEntries(fx).filter((e) => e.locator !== LOC.stripe), s3]
const ctx: PlanContext = { entries, builtIn: fixtureBuiltIn(fx), lines, presets, now: NOW }

/** The plan of a new app on a line, as one command: its commands, then yarn generate as its `then` runs it. */
const planned = (loc: string, key: string): string => {
  const l = lines.find((x) => x.key === key)!
  const p = planInstall({ refs: [loc], app: { omVersion: l.version } }, ctx)
  expect(p.then, `${loc} ${key}`).toContain('yarn generate')
  return [...p.commands, 'yarn generate'].join(' && ')
}

/** The front matter of the card `.md`. */
const frontMatter = (e: IndexEntry): Record<string, unknown> => {
  const data = fixtureData()
  const base = buildEntryContexts(data, OPTS, () => {}).find((c) => c.entry.npm === '@open-mercato/gateway-stripe')!
  const card = moduleCard({ ctx: { ...base, entry: e }, lines, site: SITE, dataVersion: '1.0.0-1.h000000', plan: null })
  return parse(card.split('---\n')[1]!) as Record<string, unknown>
}

const search = buildSearchIndex({
  entries,
  builtIn: fixtureBuiltIn(fx),
  lines,
  dataVersion: '1.0.0-202610230305.habcdef',
  generatedAt: NOW,
  site: SITE,
})

describe('storage-s3: every published command of a new app is the plan', () => {
  test('the plan is yarn add, the flag and yarn generate; the empty preset keeps module add with the flag', () => {
    const cmd = planned(S3, latest)
    expect(cmd).toBe(
      'yarn add @open-mercato/storage-s3@0.9.0 && echo OM_ENABLE_STORAGE_S3=true >> .env && yarn generate',
    )
    const p = planInstall({ refs: [S3], app: { omVersion: '0.9.0' } }, ctx)
    expect(p.emptyPreset?.commands).toEqual([
      'yarn mercato module add @open-mercato/storage-s3@0.9.0',
      'echo OM_ENABLE_STORAGE_S3=true >> .env',
    ])
  })

  test('modules.json install.cli', () => {
    expect(IndexEntry.parse(s3).install).toEqual({
      cli: planned(S3, latest),
      cmm: null,
      needsAllowThirdParty: false,
      moduleFlag: null,
    })
  })

  test('the card .md: install is the plan, install_empty_preset the empty preset', () => {
    const fm = frontMatter(s3)
    expect(fm.install).toBe(planned(S3, latest))
    expect(fm.install_empty_preset).toBe(
      'yarn mercato module add @open-mercato/storage-s3@0.9.0 && echo OM_ENABLE_STORAGE_S3=true >> .env && yarn generate',
    )
  })

  test('search_modules on every line', () => {
    const m = search.modules[S3]!
    for (const l of lines) {
      const f = installFields(m, l.key, latest, search.modules)
      expect(f.install, l.key).toBe(planned(S3, l.key))
      expect(f.install, l.key).not.toContain('module add')
    }
  })

  test('the picker on every verified line', () => {
    const row = buildPicker([{ ...s3, listed: true }], fixtureBuiltIn(fx), lines, presets, NOW).modules.find(
      (m) => m.id === 'storage_s3',
    )!
    expect(row.install).toBe(planned(S3, latest))
    expect(Object.keys(row.installByLine).length).toBeGreaterThan(0)
    for (const [key, cmd] of Object.entries(row.installByLine)) expect(cmd, key).toBe(planned(S3, key))
  })
})

describe('the enterprise package: the same rule', () => {
  test('modules.json, the card .md, search_modules and the picker give the plan of a new app', () => {
    const cmd = planned(LOC.enterprise, latest)
    expect(cmd).toBe('echo OM_ENABLE_ENTERPRISE_MODULES=true >> .env && yarn generate')
    expect(enterprise.install.cli).toBe(cmd)
    expect(frontMatter(enterprise).install).toBe(cmd)
    const s = buildSearchIndex({
      entries: [enterprise],
      builtIn: [],
      lines,
      dataVersion: '1.0.0-1.h000000',
      generatedAt: NOW,
      site: SITE,
    })
    for (const l of lines)
      expect(installFields(s.modules[LOC.enterprise]!, l.key, latest).install, l.key).toBe(
        planned(LOC.enterprise, l.key),
      )
    const row = buildPicker([{ ...enterprise, listed: true }], [], lines, presets, NOW).modules.find(
      (m) => m.id === 'record_locks',
    )!
    expect(row.install).toBe(cmd)
    for (const [key, c] of Object.entries(row.installByLine)) expect(c, key).toBe(planned(LOC.enterprise, key))
  })
})
