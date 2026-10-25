import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dataFileRule } from '../../lib/schema/data/index.ts'
import type {
  BuiltinData,
  Facts,
  FitResult,
  Health,
  Presets,
  Receipt,
  SyncRecord,
} from '../../lib/schema/data/index.ts'
import { locatorToPath } from '../../lib/schema/locator.ts'
import { DATA, readJson, readJsonl, rel, walk } from './helpers.ts'

const NEXT = '0.10.1-develop.7583.1.0c886d0a14'
const ENTRIES: Record<string, { locator: string; version: string | null }> = {
  ksef: { locator: 'npm:@fastwhitecat/integration-ksef-direct', version: '0.1.8' },
  consents: { locator: 'npm:@piotrkarwatka/marketing-consents', version: '0.1.0' },
  durable: { locator: 'npm:@fullstackhouse/open-mercato-durable-work', version: '0.6.0' },
  datasync: { locator: 'npm:@fullstackhouse/open-mercato-data-sync-durable', version: '0.6.0' },
  stripe: { locator: 'npm:@open-mercato/gateway-stripe', version: '0.9.0' },
  tpay: { locator: 'npm:@open-mercato/gateway-tpay', version: '0.8.1-develop.7442.1.4c1dbf1f0e' },
  enterprise: { locator: 'npm:@open-mercato/enterprise', version: '0.9.0' },
  treg: { locator: 'github:Chmarusso/open-mercato-enrichment-treg', version: null },
}
const path = (k: string) => locatorToPath(ENTRIES[k]!.locator)
const receipts = (k: string) => readJsonl(`${DATA}/receipts/${path(k)}.jsonl`) as Receipt[]
const health = (k: string) => readJson(`${DATA}/health/${path(k)}.json`) as Health
const facts = (k: string) => readJson(`${DATA}/facts/${path(k)}/${ENTRIES[k]!.version}.json`) as Facts

describe('test/fixtures/data is a complete, valid snapshot of the data branch', () => {
  const files = walk(DATA)

  it.each(files.map((p) => [rel(DATA, p), p]))('%s matches a data rule and validates', (relPath, p) => {
    const rule = dataFileRule(relPath)
    expect(rule, `no rule for ${relPath}`).not.toBeNull()
    const docs = rule!.jsonl ? readJsonl(p) : [readJson(p)]
    expect(docs.length).toBeGreaterThan(0)
    for (const d of docs) {
      const r = rule!.schema.safeParse(d)
      expect(r.error?.issues ?? []).toEqual([])
    }
  })

  it('has every per-entry file for the 8 entries', () => {
    for (const [k, e] of Object.entries(ENTRIES)) {
      expect(existsSync(`${DATA}/sync/${path(k)}.json`), k).toBe(true)
      expect(existsSync(`${DATA}/health/${path(k)}.json`), k).toBe(true)
      if (e.version) expect(existsSync(`${DATA}/facts/${path(k)}/${e.version}.json`), k).toBe(true)
      const h = health(k)
      expect(h.locator).toBe(e.locator)
      expect(h.version).toBe(e.version)
    }
    for (const f of ['lines.json', 'presets.json', 'hive.json', 'claims.json', 'stats.json', 'radar/next.json'])
      expect(existsSync(`${DATA}/${f}`), f).toBe(true)
    for (const v of ['0.8.0', '0.9.0', NEXT]) expect(existsSync(`${DATA}/fit/${v}.json`), v).toBe(true)
  })

  it('keeps file paths, locators and receipt IDs consistent', () => {
    for (const p of files.filter((f) => rel(DATA, f).startsWith('facts/'))) {
      const f = readJson(p) as Facts
      expect(rel(DATA, p)).toBe(`facts/${locatorToPath(f.package.locator)}/${f.package.version}.json`)
    }
    for (const p of files.filter((f) => rel(DATA, f).startsWith('sync/'))) {
      const s = readJson(p) as SyncRecord
      expect(rel(DATA, p)).toBe(`sync/${locatorToPath(s.locator)}.json`)
    }
    for (const p of files.filter((f) => rel(DATA, f).startsWith('receipts/'))) {
      for (const r of readJsonl(p) as Receipt[]) {
        expect(r.id).toBe(`r_${r.run.at.slice(0, 10).replace(/-/g, '')}_${r.cellKey.slice(0, 12)}`)
        expect(r.steps.map((s) => s.name)).toEqual([
          'scaffold',
          'install',
          'add',
          'generate',
          'typecheck',
          'initialize',
          'build',
          'start',
          'smoke',
        ])
        if (!rel(DATA, p).includes('_baseline'))
          expect(rel(DATA, p)).toBe(`receipts/${locatorToPath(r.module!.locator)}.jsonl`)
      }
    }
  })

  it('baseline 0.9 is green with the api-keys harness patch', () => {
    // the measured rows scaffolded the empty preset; their classic copies have no api-keys patch (README)
    const base = (readJsonl(`${DATA}/receipts/_baseline.jsonl`) as Receipt[]).filter((r) => r.om.preset === 'empty')
    const b09 = base.find((r) => r.om.line === '0.9')!
    expect(b09.module).toBeNull()
    expect(b09.result.status).toBe('verified')
    expect(b09.harness.patches.map((p) => p.id)).toEqual(['api-keys'])
    expect(b09.harness.yarn).toBe('4.17.1')
    expect(b09.steps.find((s) => s.name === 'add')!.status).toBe('skipped')
    expect(base.find((r) => r.om.line === 'next')!.harness.patches).toEqual([])
  })

  it('ksef is verified on 0.9 and next (spike rows A and C)', () => {
    const rs = receipts('ksef').filter((r) => r.om.preset === 'empty')
    expect(rs.map((r) => [r.om.line, r.result.status])).toEqual([
      ['0.9', 'verified'],
      ['next', 'verified'],
    ])
    expect(rs[0]!.steps.find((s) => s.name === 'build')!.sec).toBe(139)
    expect(rs[1]!.om.version).toBe(NEXT)
    expect(health('ksef').signals.receipt).toEqual({ '0.8': 'untested', '0.9': 'verified', next: 'verified' })
  })

  it('consents is broken at typecheck on 0.9, build also failed, confirmed by a retry (spike row B1)', () => {
    const rs = receipts('consents').filter((r) => r.om.preset === 'empty')
    expect(rs).toHaveLength(2)
    const last = rs[1]!
    expect(last.result).toMatchObject({
      status: 'broken',
      failedStep: 'typecheck',
      alsoFailed: ['build'],
      classification: 'module-fail',
    })
    expect(last.transition.confirmed).toBe(true)
    expect(rs[0]!.transition.confirmed).toBe(false)
    const tc = last.steps.find((s) => s.name === 'typecheck')!
    expect(tc).toMatchObject({ status: 'fail', sec: 72, line: 154 })
    expect(tc.excerpt).toContain('TS2321')
    expect(last.steps.find((s) => s.name === 'initialize')!.status).toBe('pass')
    expect(health('consents').agentPolicy['0.9']!.decision).toBe('refuse')
    const fit = readJson(`${DATA}/fit/0.9.0.json`) as FitResult
    expect(fit.cells['npm:@piotrkarwatka/marketing-consents@0.1.0']!.hostDuplicates).toEqual([
      { name: '@tanstack/react-table', moduleRange: '9.2.6', appVersion: '9.3.1' },
    ])
    const fit08 = readJson(`${DATA}/fit/0.8.0.json`) as FitResult
    expect(fit08.cells['npm:@piotrkarwatka/marketing-consents@0.1.0']!.status).toBe('no-fit')
  })

  it('every measured row has its synthetic classic copy with the classic baseline of its line (24 Oct)', () => {
    const base = readJsonl(`${DATA}/receipts/_baseline.jsonl`) as Receipt[]
    for (const k of ['ksef', 'consents', 'durable', 'stripe'] as const) {
      const all = receipts(k)
      const copies = all.filter((r) => r.om.preset === 'classic')
      expect(copies.length, k).toBe(all.length / 2)
      for (const c of copies) {
        const b = base.find((x) => x.id === c.baseline?.receipt)
        expect(b?.om.preset, k).toBe('classic')
        expect(c.harness.patches.map((p) => p.id)).not.toContain('api-keys')
      }
    }
  })

  it('durable-work is verified on 0.9 (spike row B2)', () => {
    const rs = receipts('durable').filter((r) => r.om.preset === 'empty')
    expect(rs.map((r) => [r.om.line, r.result.status])).toEqual([['0.9', 'verified']])
    expect(health('durable').tier).toBe('verified')
  })

  it('carries the g2 anatomy numbers of ksef', () => {
    const m = facts('ksef').modules[0]!
    expect(m.id).toBe('integration_ksef_direct')
    expect(m.data.entities).toHaveLength(3)
    expect(m.events.emits).toHaveLength(9)
    expect(m.security.aclFeatures).toHaveLength(7)
    expect(m.http.routes).toHaveLength(8)
    expect(m.background.workers).toHaveLength(3)
    expect(m.ui.backendPages).toHaveLength(4)
    expect(m.config.credentials.map((c) => c.key)).toEqual(['ksef_token', 'nip', 'environment'])
    expect(m.lint.map((l) => l.code)).toContain('event-prefix')
  })

  it('covers the edge cases of the 8 entries', () => {
    expect(health('enterprise').tier).toBeNull()
    expect(health('enterprise').signals.anatomy).toBe('hidden')
    expect(facts('enterprise').modules.map((m) => m.id)).toEqual([
      'agent_orchestrator',
      'record_locks',
      'security',
      'sso',
      'system_status_overlays',
    ])
    expect(health('tpay').agentPolicy.next!.decision).toBe('ask')
    expect(health('tpay').agentPolicy.next!.reasons.map((r) => r.code)).toContain('NOT_VERIFIED')
    expect((readJson(`${DATA}/sync/${path('tpay')}.json`) as SyncRecord).npm!.latestStable).toBeNull()
    expect(health('datasync').agentPolicy['0.9']!.reasons.map((r) => r.code)).toContain('REPLACES')
    expect(health('ksef').agentPolicy['0.9']!.reasons.map((r) => r.code)).toEqual(['THIRD_PARTY'])
    expect(health('stripe').agentPolicy['0.9']!.decision).toBe('allow')
    expect(health('treg').agentPolicy['0.9']!.reasons[0]!.code).toBe('UNPINNED_GIT')
    expect((readJson(`${DATA}/sync/${path('stripe')}.json`) as SyncRecord).npm!.latestStable).toBe('0.9.0')
  })

  it('has 3 built-in modules from the CLI facts of 0.9.0', () => {
    const b = readJson(`${DATA}/builtin/0.9.0.json`) as BuiltinData
    expect(b.modules.map((m) => m.id)).toEqual(['currencies', 'data_sync', 'wms'])
    expect(b.routesMeasured).toBe(false)
    expect(b.modules[0]!.data.entities.map((e) => e.table)).toEqual([
      'currencies',
      'exchange_rates',
      'currency_fetch_configs',
    ])
  })

  it('records the empty presets per line: api_keys only on next', () => {
    const p = readJson(`${DATA}/presets.json`) as Presets
    expect(p['0.9']!.empty!.map((m) => m.id)).toContain('events')
    expect(p['0.9']!.empty!.map((m) => m.id)).toContain('search')
    expect(p['0.9']!.empty!.map((m) => m.id)).not.toContain('api_keys')
    expect(p.next!.empty!.map((m) => m.id)).toContain('api_keys')
  })
})
