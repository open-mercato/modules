// The nightly plan and the receipts of two starter presets (decision of 24 Oct): classic, what `npx create-mercato-app`
// makes, gives the main verdict; empty is the signal `in isolation`. Golden cases: the plan holds both presets, classic
// first; a package a new app registers is tested at the version that app ships; `--preset` plans one; the night budget
// weighs a classic cell double; collect keeps a baseline per line and preset and writes both lists into presets.json.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cellEnv, parseArgs as parseCellsArgs, shardOf } from '../../lib/commands/cells-local.ts'
import { parseArgs as parsePlanArgs } from '../../lib/commands/plan-matrix.ts'
import { cellKey } from '../../lib/receipts/cell-key.ts'
import type { BundleAttempt, CellOutcome, NightBundle } from '../../lib/receipts/from-actions.ts'
import { Matrix, type MatrixCell } from '../../lib/receipts/matrix.ts'
import { MINUTES_BY_PRESET } from '../../lib/receipts/plan.ts'
import { applyNight } from '../../lib/receipts/state.ts'
import { Presets } from '../../lib/schema/data/lines.ts'
import { Descriptor } from '../../lib/schema/descriptor.ts'
import { SyncRecord } from '../../lib/schema/data/index.ts'
import {
  fixturePlanEntries,
  harness,
  HASH,
  loadFixture,
  LOC,
  NIGHT,
  outcome,
  plan,
  ROOT,
  type Extra,
} from './helpers.ts'

const fx = loadFixture()
const both = plan(fx, { onlyPresets: null })
const of = (m: Matrix, loc: string | null, line: string, preset: 'classic' | 'empty'): MatrixCell | undefined =>
  m.cells.find((c) => c.locator === loc && c.line === line && c.preset === preset && c.mode === 'realistic')

describe('the plan of both presets', () => {
  it('golden: one baseline per line and preset, classic first, and every empty cell keeps its key', () => {
    expect(Matrix.safeParse(both).success).toBe(true)
    expect(both.cells.filter((c) => c.baseline).map((c) => `${c.line} ${c.preset}`)).toEqual([
      '0.9 classic',
      'next classic',
      '0.9 empty',
      'next empty',
    ])
    const i = both.cells.findIndex((c) => c.preset === 'empty')
    expect(both.cells.slice(0, i).every((c) => c.preset === 'classic')).toBe(true)
    // the empty cells are the cells of the plan before 24 Oct, key for key
    const before = plan(fx)
    for (const c of before.cells)
      expect(
        both.cells.some((x) => x.key === c.key && x.preset === 'empty'),
        c.label,
      ).toBe(true)
    const k = of(both, LOC.ksef, '0.9', 'classic')!
    expect(k.key).toBe(
      cellKey({
        locator: LOC.ksef,
        version: '0.1.8',
        integrity: k.integrity,
        omVersion: '0.9.0',
        harnessHash: HASH,
        node: '24.21.0',
        mode: 'realistic',
        preset: 'classic',
      }),
    )
    expect(k.label).toBe(`${LOC.ksef}@0.1.8 on 0.9 (classic)`)
  })

  it('a requirement a new app has on is not enabled again: ksef needs no core integrations in classic', () => {
    expect(of(both, LOC.ksef, '0.9', 'empty')!.requiresSpecs).toEqual(['core:integrations'])
    expect(of(both, LOC.ksef, '0.9', 'classic')!.requiresSpecs).toEqual([])
  })

  it('a package a new app registers is tested at the version it ships (yarn add of it, note in-preset)', () => {
    // gateway-stripe is in the classic preset of every line (the template's src/modules.ts)
    const s = of(both, LOC.stripe, '0.9', 'classic')!
    expect(s.moduleSpec).toBe('@open-mercato/gateway-stripe@0.9.0')
    // only the shipped version runs in classic: no early cell, no other version
    expect(
      both.cells.filter((c) => c.locator === LOC.stripe && c.preset === 'classic' && c.line === '0.9'),
    ).toHaveLength(1)
    // on next a new app ships the develop snapshot (npm dist-tag develop): that version, never 0.9.0, with the module
    // IDs and smoke paths of the facts of the version a fresh app installs (no facts of the snapshot yet); a new
    // snapshot comes most nights, so a regular night leaves it to the weekly one (review of 24 Oct)
    expect(of(both, LOC.stripe, 'next', 'classic')).toBeUndefined()
    expect(
      both.notRun.find((x) => x.locator === LOC.stripe && x.line === 'next' && x.preset === 'classic')?.reason,
    ).toBe('a new app on next ships the develop snapshot, a new one most nights: tested on the weekly night')
    const weekly = plan(fx, { onlyPresets: null, now: '2026-10-25T02:17:00Z' })
    const dispatch = plan(fx, { onlyPresets: null, event: 'workflow_dispatch' })
    expect(of(dispatch, LOC.stripe, 'next', 'classic')?.key).toBe(of(weekly, LOC.stripe, 'next', 'classic')?.key)
    const n = of(weekly, LOC.stripe, 'next', 'classic')!
    expect(n.moduleSpec).toBe('@open-mercato/gateway-stripe@0.10.1-develop.7583.1.0c886d0a14')
    expect(n.moduleIds).toEqual(['gateway_stripe'])
    // without npm data for the shipped version the cell is untested, never another version
    const sync = structuredClone(fx.sync(LOC.stripe)!) as SyncRecord
    sync.npm!.distTags = { latest: '0.9.0' }
    const entries = fixturePlanEntries(fx).map((e) => (e.locator === LOC.stripe ? { ...e, sync } : e))
    const p = plan(fx, { onlyPresets: ['classic'], entries, event: 'workflow_dispatch' })
    expect(p.cells.some((c) => c.locator === LOC.stripe && c.line === 'next')).toBe(false)
    const nr = p.notRun.find((x) => x.locator === LOC.stripe && x.line === 'next')
    expect([nr?.status, nr?.reason]).toEqual([
      'untested',
      'a new app on next ships 0.10.1-develop.7583.1.0c886d0a14, which the npm data does not list yet',
    ])
  })

  it('--preset plans one preset only; the night of classic alone has no empty cell', () => {
    const c = plan(fx, { onlyPresets: ['classic'] })
    expect(c.cells.length).toBeGreaterThan(0)
    expect(c.cells.every((x) => x.preset === 'classic')).toBe(true)
    expect(c.notRun.every((x) => x.preset === 'classic')).toBe(true)
    const o = parsePlanArgs(['--preset', 'classic'], ROOT)
    expect(typeof o !== 'string' && o.presets).toEqual(['classic'])
    expect(parsePlanArgs(['--preset', 'bogus'], ROOT)).toBe('--preset: classic, empty or both')
    const e = parsePlanArgs(['--preset', ''], ROOT)
    expect(typeof e !== 'string' && e.presets).toEqual([])
  })

  it('golden: a classic cell weighs an estimated 20 minutes in the night budget (CI has no Yarn cache)', () => {
    expect(MINUTES_BY_PRESET).toEqual({ empty: 7.5, classic: 20 })
    const extra: Extra[] = []
    const ksefD = fx.descriptors.get(LOC.ksef)!
    const ksefSync = fx.sync(LOC.ksef)!
    const ksefFacts = fx.facts(LOC.ksef, '0.1.8')!
    for (let i = 0; i < 70; i++) {
      const name = `@fixture/mod-${String(i).padStart(2, '0')}`
      const locator = `npm:${name}`
      extra.push({
        locator,
        d: Descriptor.parse({ ...ksefD, npm: name, github: undefined, renamedFrom: undefined }),
        sync: SyncRecord.parse({ ...ksefSync, locator, npm: { ...ksefSync.npm!, name } }),
        facts: () => ({ ...ksefFacts, package: { ...ksefFacts.package, locator, name } }),
      })
    }
    const classicOnly = plan(fx, { onlyPresets: ['classic'], entries: fixturePlanEntries(fx, { extra }) })
    // 70 minutes, 6 at a time, 20 minutes each: 20 cells (9 waves of 7.5 minutes hold 54 empty cells)
    expect(classicOnly.cells.length).toBe(20)
    expect(classicOnly.deferred.length).toBeGreaterThan(0)
    expect(classicOnly.estimate.windowMin).toBeLessThanOrEqual(70)
    expect(classicOnly.estimate.minutesPerCell).toBe(20)
    // with both presets the classic cells stop one wave short and the empty preset fills it (review of 24 Oct: the
    // signal `in isolation` starved behind 27 classic cells)
    const night = plan(fx, { onlyPresets: null, entries: fixturePlanEntries(fx, { extra }) })
    const empty = night.cells.filter((c) => c.preset === 'empty')
    expect(empty.length).toBeGreaterThanOrEqual(6)
    expect(night.cells.filter((c) => c.preset === 'classic').length).toBeLessThan(20)
    expect(night.estimate.windowMin).toBeLessThanOrEqual(70)
    // in the classic preset the packages a new app ships come after the packages outside the preset
    const classic = night.cells.filter((c) => c.preset === 'classic' && !c.baseline)
    const firstShip = classic.findIndex((c) => c.locator === LOC.stripe)
    expect(firstShip === -1 || classic.slice(firstShip).every((c) => c.locator === LOC.stripe)).toBe(true)
  })

  it('a fresh receipt in isolation counts as memo whatever harness wrote it; a classic cell keeps its own memo', () => {
    // the fixture receipts carry another harness hash than HASH: the keys differ, the version and line do not
    const entries = fixturePlanEntries(fx, { receipts: (loc) => fx.receipts(loc) })
    const p = plan(fx, { onlyPresets: null, entries })
    expect(of(p, LOC.ksef, '0.9', 'empty')).toBeUndefined()
    expect(of(p, LOC.ksef, '0.9', 'classic')).toBeDefined()
    // after MEMO_DAYS the signal runs again
    const later = plan(fx, { onlyPresets: null, entries, now: '2026-11-02T02:17:00Z' })
    expect(of(later, LOC.ksef, '0.9', 'empty')).toBeDefined()
  })

  it('the preview env file and the workflow pass PRESET to steps.sh', () => {
    const k = of(both, LOC.ksef, '0.9', 'classic')!
    expect(cellEnv(k)).toContain("PRESET='classic'\n")
    expect(cellEnv(of(both, LOC.ksef, '0.9', 'empty')!)).toContain("PRESET='empty'\n")
    expect(typeof parseCellsArgs([], '/tmp')).toBe('object')
    const runCell = readFileSync(join(ROOT, 'harness', 'local', 'run-cell.sh'), 'utf8')
    expect(runCell).toMatch(/VARS=\(KEY12 LINE BASELINE OM_VERSION PRESET /)
    const nightly = readFileSync(join(ROOT, '.github', 'workflows', 'nightly.yml'), 'utf8')
    expect(nightly).toContain('PRESET: ${{ matrix.cell.preset }}')
    expect(nightly).toContain('--preset "$PRESET_ONLY"')
  })

  it('cells-local --shard i/n splits one matrix: every cell once, the baselines first in shard 1', () => {
    const shards = [1, 2, 3].map((i) => shardOf(both.cells, i, 3))
    expect(
      shards
        .flat()
        .map((c) => c.key)
        .sort(),
    ).toEqual(both.cells.map((c) => c.key).sort())
    expect(shards[0]!.slice(0, 4).every((c) => c.baseline)).toBe(true)
    expect(shards[1]!.some((c) => c.baseline)).toBe(false)
    const o = parseCellsArgs(['--shard', '2/3'], '/tmp')
    expect(typeof o !== 'string' && o.shard).toEqual({ i: 2, n: 3 })
    expect(parseCellsArgs(['--shard', '4/3'], '/tmp')).toBe('--shard: <i>/<n> with 1 <= i <= n')
    // three classic cells at once fill a 30 GB host: a cell can get less memory (review of 24 Oct)
    const m = parseCellsArgs(['--memory', '8g'], '/tmp')
    expect(typeof m !== 'string' && m.memory).toBe('8g')
    expect(typeof o !== 'string' && o.memory).toBe('10g')
    expect(parseCellsArgs(['--memory', '8'], '/tmp')).toBe('--memory: gigabytes, e.g. 8g')
    const runCell = readFileSync(join(ROOT, 'harness', 'local', 'run-cell.sh'), 'utf8')
    expect(runCell).toContain('--memory "$memory" --memory-swap "$memory"')
  })

  it('a matrix planned before 24 Oct (no preset field) reads as the empty preset', () => {
    const raw = JSON.parse(JSON.stringify(plan(fx))) as { cells: Record<string, unknown>[] }
    for (const c of raw.cells) delete c['preset']
    expect(Matrix.parse(raw).cells.every((c) => c.preset === 'empty')).toBe(true)
  })
})

describe('collect with both presets', () => {
  const m = both
  const bundle = (outcomes: CellOutcome[]): NightBundle => {
    const attempts: BundleAttempt[] = [
      {
        attempt: 1,
        run: { id: 100, url: 'https://github.com/wojciechszyjka/modules/actions/runs/100', at: NIGHT },
        outcomes,
      },
    ]
    return {
      schema: 1,
      runner: 'ubuntu-latest',
      night: { id: 100, url: 'https://github.com/wojciechszyjka/modules/actions/runs/100', at: NIGHT },
      matrix: m,
      attempts,
      retry: [],
      notes: [],
    }
  }
  const apply = (outcomes: CellOutcome[]) =>
    applyNight({ bundle: bundle(outcomes), history: () => [], harness: harness(), presets: null })
  const base = (preset: 'classic' | 'empty') => of(m, null, '0.9', preset)!
  const ksef = (preset: 'classic' | 'empty') => of(m, LOC.ksef, '0.9', preset)!
  const template = readFileSync(join(ROOT, 'test', 'fixtures', 'create-app', 'modules-0.9.0.ts.txt'), 'utf8')

  it('golden: a red baseline of the empty preset makes only its own cells harness-red', () => {
    const res = apply([
      outcome(base('classic')),
      outcome(base('empty'), { fail: { initialize: 'Initialization failed: Metadata for entity ApiKey not found\n' } }),
      outcome(ksef('classic')),
      outcome(ksef('empty')),
    ])
    const r = (preset: string) => res.receipts.find((x) => x.locator === LOC.ksef && x.receipt.om.preset === preset)!
    expect(r('classic').receipt.result.status).toBe('verified')
    expect(r('empty').receipt.result.status).toBe('harness-red')
    expect(r('classic').receipt.baseline?.receipt).toBe(
      res.receipts.find((x) => x.locator === null && x.receipt.om.preset === 'classic')!.receipt.id,
    )
    expect(r('classic').receipt.om.preset).toBe('classic')
  })

  it('golden: presets.json gets `classic` from the classic baseline and `empty` from the empty one', () => {
    const res = apply([
      outcome(base('classic'), { modulesTs: template }),
      outcome(base('empty'), {
        modulesTs: readFileSync(join(ROOT, 'test', 'fixtures', 'create-app', 'modules-0.9.0.ts.txt'), 'utf8').replace(
          /\{ id: '(?!auth|directory|configs)[a-z_]+', from: '[^']+' \},?/g,
          '',
        ),
      }),
    ])
    const p = Presets.parse(res.presets)['0.9']!
    expect(p.classic?.some((x) => x.id === 'currencies')).toBe(true)
    expect(p.classic?.some((x) => x.id === 'checkout' && x.from === '@open-mercato/checkout')).toBe(true)
    expect(p.empty?.map((x) => x.id)).toEqual(['auth', 'directory', 'configs'])
    // an existing entry of another Open Mercato version is not mixed in
    const again = applyNight({
      bundle: bundle([outcome(base('classic'), { modulesTs: template })]),
      history: () => [],
      harness: harness(),
      presets: { '0.9': { omVersion: '0.8.0', empty: [{ id: 'auth', from: '@open-mercato/core' }], at: NIGHT } },
    })
    expect(Presets.parse(again.presets)['0.9']!.empty).toBeUndefined()
  })
})
