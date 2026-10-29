import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  BuiltinData,
  Change,
  Claims,
  DATA_FILES,
  dataFileRule,
  Facts,
  FitResult,
  Health,
  HiveSlots,
  Lines,
  Presets,
  ProvisionalNights,
  Receipt,
  Stats,
  SyncRecord,
} from '../../lib/schema/data/index.ts'
import { Radar } from '../../lib/schema/published/radar.ts'
import { DATA, readJson, readJsonl } from './helpers.ts'

const sample = {
  sync: () => readJson(`${DATA}/sync/@fastwhitecat/integration-ksef-direct.json`) as Record<string, unknown>,
  facts: () => readJson(`${DATA}/facts/@fastwhitecat/integration-ksef-direct/0.1.8.json`) as Record<string, unknown>,
  fit: () => readJson(`${DATA}/fit/0.9.0.json`) as Record<string, unknown>,
  receipt: () => readJsonl(`${DATA}/receipts/_baseline.jsonl`)[0] as Record<string, unknown>,
  health: () => readJson(`${DATA}/health/@fastwhitecat/integration-ksef-direct.json`) as Record<string, unknown>,
  builtin: () => readJson(`${DATA}/builtin/0.9.0.json`) as Record<string, unknown>,
  lines: () => readJson(`${DATA}/lines.json`) as Record<string, unknown>,
  hive: () => readJson(`${DATA}/hive.json`) as Record<string, unknown>,
  stats: () => readJson(`${DATA}/stats.json`) as Record<string, unknown>,
  radar: () => readJson(`${DATA}/radar/next.json`) as Record<string, unknown>,
  change: () => readJsonl(`${DATA}/changes/2026-10.jsonl`)[0] as Record<string, unknown>,
}

const cases: [string, z.ZodType, () => Record<string, unknown>][] = [
  ['SyncRecord', SyncRecord, sample.sync],
  ['Facts', Facts, sample.facts],
  ['FitResult', FitResult, sample.fit],
  ['Receipt', Receipt, sample.receipt],
  ['Health', Health, sample.health],
  ['BuiltinData', BuiltinData, sample.builtin],
  ['Lines', Lines, sample.lines],
  ['HiveSlots', HiveSlots, sample.hive],
  ['Stats', Stats, sample.stats],
  ['Radar', Radar, sample.radar],
  ['Change', Change, sample.change],
]

describe('data branch schemas are strict (spec 4.5)', () => {
  it.each(cases)('%s accepts the fixture and rejects an unknown top-level field', (_n, s, get) => {
    expect(s.safeParse(get()).success).toBe(true)
    expect(s.safeParse({ ...get(), unexpected: true }).success).toBe(false)
  })

  it('rejects unknown nested fields', () => {
    const sync = sample.sync()
    ;(sync.npm as Record<string, unknown>).extra = 1
    expect(SyncRecord.safeParse(sync).success).toBe(false)
    const facts = sample.facts()
    ;((facts.modules as Record<string, unknown>[])[0]!.http as Record<string, unknown>).extra = 1
    expect(Facts.safeParse(facts).success).toBe(false)
    const receipt = sample.receipt()
    ;(receipt.result as Record<string, unknown>).extra = 1
    expect(Receipt.safeParse(receipt).success).toBe(false)
    const health = sample.health()
    ;(health.signals as Record<string, unknown>).extra = 1
    expect(Health.safeParse(health).success).toBe(false)
    const lines = sample.lines()
    ;(lines.lines as Record<string, unknown>[])[0]!.extra = 1
    expect(Lines.safeParse(lines).success).toBe(false)
  })

  it('strict records: Presets and Claims values', () => {
    const presets = readJson(`${DATA}/presets.json`) as Record<string, Record<string, unknown>>
    expect(Presets.safeParse(presets).success).toBe(true)
    presets['0.9']!.extra = 1
    expect(Presets.safeParse(presets).success).toBe(false)
    expect(Claims.safeParse({ 'npm:@x/y': { by: 'a', method: 'repo-owner', pr: 1, at: '2026-10-23' } }).success).toBe(
      true,
    )
    expect(
      Claims.safeParse({ 'npm:@x/y': { by: 'a', method: 'repo-owner', pr: 1, at: '2026-10-23', x: 1 } }).success,
    ).toBe(false)
    expect(Claims.safeParse({ '@x/y': { by: 'a', method: 'repo-owner', pr: 1, at: '2026-10-23' } }).success).toBe(false)
  })

  it('keeps keepaliveAt in Lines (dropped fields would be silent with strip)', () => {
    const lines = { ...sample.lines(), keepaliveAt: '2026-10-23T00:17:00Z' }
    expect(Lines.parse(lines).keepaliveAt).toBe('2026-10-23T00:17:00Z')
  })

  it('maps data branch paths to schemas', () => {
    expect(dataFileRule('sync/@x/y.json')?.schema).toBe(SyncRecord)
    expect(dataFileRule('sync/github/owner/repo.json')?.schema).toBe(SyncRecord)
    expect(dataFileRule('facts/@x/y/1.2.3.json')?.schema).toBe(Facts)
    expect(dataFileRule('facts/@x/y/0.8.1-develop.7442.1.4c1dbf1f0e.json')?.schema).toBe(Facts)
    expect(dataFileRule('fit/0.10.1-develop.7583.1.0c886d0a14.json')?.schema).toBe(FitResult)
    expect(dataFileRule('receipts/_baseline.jsonl')?.jsonl).toBe(true)
    expect(dataFileRule('receipts/create-mercato-module.jsonl')?.schema).toBe(Receipt)
    expect(dataFileRule('receipts/_provisional.json')?.schema).toBe(ProvisionalNights)
    expect(dataFileRule('health/@x/y.json')?.schema).toBe(Health)
    expect(dataFileRule('builtin/0.9.0.json')?.schema).toBe(BuiltinData)
    expect(dataFileRule('changes/2026-10.jsonl')?.schema).toBe(Change)
    expect(dataFileRule('radar/next.json')?.schema).toBe(Radar)
    expect(dataFileRule('sync/@X/y.json')).toBeNull()
    expect(dataFileRule('notes.txt')).toBeNull()
    expect(DATA_FILES.length).toBe(16)
  })
})
