// `yarn om health` on the fixture: valid Health for all 8 entries, golden files, levels from the rules of 6.3.
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import health from '../../lib/commands/health.ts'
import { Change, Health } from '../../lib/schema/data/index.ts'
import { locatorToPath } from '../../lib/schema/locator.ts'
import {
  consentsBrokenThenGated,
  DATA,
  DESCRIPTORS,
  durableGatedRelease,
  LOC,
  loadFixture,
  NOW,
  ROOT,
  readJson,
  readJsonl,
  walk,
} from './helpers.ts'

let dir = ''
const quiet = () => {
  const log = console.log
  const err = console.error
  console.log = () => {}
  console.error = () => {}
  return () => {
    console.log = log
    console.error = err
  }
}
const run = (args: string[], data = dir) => {
  const restore = quiet()
  try {
    return health({
      args: [...args, '--modules', DESCRIPTORS, '--now', NOW],
      flags: { data, out: 'out', offline: true, json: false },
      root: ROOT,
    })
  } finally {
    restore()
  }
}
const read = (loc: string) => Health.parse(readJson(join(dir, 'health', `${locatorToPath(loc)}.json`)))

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'wp08-health-'))
  cpSync(DATA, dir, { recursive: true })
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('yarn om health on the fixture', () => {
  it('writes a valid Health for every descriptor and exits 0', () => {
    expect(run(['--all'])).toBe(0)
    const files = walk(join(dir, 'health'))
    expect(files).toHaveLength(8)
    for (const f of files) expect(Health.safeParse(readJson(f)).success, f).toBe(true)
  })

  it.each(Object.entries(LOC))('%s matches its golden file', async (_k, loc) => {
    const h = read(loc)
    await expect(`${JSON.stringify(h, null, 2)}\n`).toMatchFileSnapshot(`golden/health/${locatorToPath(loc)}.json`)
  })

  it('levels follow the rules of 6.3 on the fixture data', () => {
    expect(read(LOC.ksef).tier).toBe('verified') // event-prefix is warn, not error (6.6): VER-4 passes
    expect(read(LOC.stripe).tier).toBe('verified')
    expect(read(LOC.durable).tier).toBe('verified')
    expect(read(LOC.consents).tier).toBe('listed')
    expect(read(LOC.consents).signals.receipt['0.9']).toBe('broken')
    expect(read(LOC.datasync).tier).toBe('listed')
    expect(read(LOC.tpay).tier).toBe('listed')
    expect(read(LOC.treg).tier).toBe('listed')
    expect(read(LOC.enterprise).tier).toBeNull()
    expect(read(LOC.enterprise).signals.anatomy).toBe('hidden')
  })

  it('E5: each line is judged on its own version (enterprise 0.9.0 is no-fit on 0.8, so 0.8 judges 0.8.0)', () => {
    const e = read(LOC.enterprise)
    expect(e.evaluated).toEqual({ '0.9': '0.9.0', '0.8': '0.8.0', next: '0.9.0' })
    expect(read(LOC.ksef).recommended).toEqual({ '0.9': '0.1.8', '0.8': null, next: '0.1.8' })
  })

  it('ksef would be Listed only with a lint error (the 12.2 example assumes event-prefix as error)', () => {
    const h = read(LOC.ksef)
    expect(h.signals.hygiene).toEqual({ status: 'warn', failing: ['event-prefix'] })
    expect(h.rules.find((r) => r.id === 'VER-4')?.pass).toBe(true)
  })

  it('agrees with the WP01 reference on tier, signals, identity and decisions', () => {
    for (const loc of Object.values(LOC)) {
      const mine = read(loc)
      const ref = Health.parse(readJson(join(DATA, 'health', `${locatorToPath(loc)}.json`)))
      expect(mine.tier, loc).toBe(ref.tier)
      expect(mine.state, loc).toBe(ref.state)
      // E5: line 0.8 of enterprise is judged on 0.8.0 (0.9.0 is no-fit there); the fixture has no Fit for 0.8.0.
      // The catalog never installs an enterprise module, so it has no receipt to set against its peers (finding of
      // 25 Oct: `Built for 0.9; verified on no line.` on every entry the night skips).
      const want =
        loc === LOC.enterprise
          ? {
              ...ref.signals,
              fit: { ...ref.signals.fit, '0.8': 'unknown' },
              declaredVsObserved: { status: 'match', notes: [] },
            }
          : ref.signals
      expect(mine.signals, loc).toEqual(want)
      expect(mine.identity, loc).toEqual(ref.identity)
      for (const [line, p] of Object.entries(ref.agentPolicy)) {
        expect(mine.agentPolicy[line]?.decision, `${loc} ${line}`).toBe(p.decision)
        expect(
          mine.agentPolicy[line]?.reasons.map((r) => r.code),
          `${loc} ${line}`,
        ).toEqual(p.reasons.map((r) => r.code))
      }
    }
  })

  it('--changed keeps unchanged files and records tier changes', () => {
    const before = readFileSync(join(dir, 'health', `${locatorToPath(LOC.ksef)}.json`), 'utf8')
    expect(run(['--changed'])).toBe(0)
    expect(readFileSync(join(dir, 'health', `${locatorToPath(LOC.ksef)}.json`), 'utf8')).toBe(before)
    // a later clock ages the receipts past 14 days: Verified entries drop to Listed and changes are logged
    const restore = quiet()
    try {
      health({
        args: ['--changed', '--modules', DESCRIPTORS, '--now', '2026-11-20T03:05:00Z'],
        flags: { data: dir, out: 'out', offline: true, json: false },
        root: ROOT,
      })
    } finally {
      restore()
    }
    expect(read(LOC.ksef).tier).toBe('listed')
    const changes = readJsonl(join(dir, 'changes', '2026-11.jsonl')).map((c) => Change.parse(c))
    expect(changes).toContainEqual({
      at: '2026-11-20T03:05:00Z',
      type: 'tier-change',
      locator: LOC.ksef,
      from: 'verified',
      to: 'listed',
    })
  })

  it('exits 2 without lines.json', () => {
    const empty = mkdtempSync(join(tmpdir(), 'wp08-empty-'))
    try {
      expect(run(['--all'], empty)).toBe(2)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('yarn om health with a new release in the age gate (review round 2)', () => {
  let d2 = ''
  const read2 = (loc: string) => Health.parse(readJson(join(d2, 'health', `${locatorToPath(loc)}.json`)))
  beforeAll(() => {
    d2 = mkdtempSync(join(tmpdir(), 'wp08-gated-'))
    cpSync(DATA, d2, { recursive: true })
    expect(run(['--all'], d2)).toBe(0)
    // durable-work 0.7.0 and consents 0.1.1 published on 21 Oct; no facts or Fit for either
    const fx = loadFixture()
    const json = (x: unknown) => `${JSON.stringify(x, null, 2)}\n`
    writeFileSync(join(d2, 'sync', `${locatorToPath(LOC.durable)}.json`), json(durableGatedRelease(fx)))
    const consents = consentsBrokenThenGated(fx)
    writeFileSync(join(d2, 'sync', `${locatorToPath(LOC.consents)}.json`), json(consents.sync))
    appendFileSync(
      join(d2, 'receipts', `${locatorToPath(LOC.consents)}.jsonl`),
      `${JSON.stringify(consents.receipts.at(-1))}\n`,
    )
    expect(existsSync(join(d2, 'facts', locatorToPath(LOC.durable), '0.7.0.json'))).toBe(false)
    expect(existsSync(join(d2, 'facts', locatorToPath(LOC.consents), '0.1.1.json'))).toBe(false)
    expect(run(['--changed'], d2)).toBe(0)
  })
  afterAll(() => rmSync(d2, { recursive: true, force: true }))

  it('durable-work keeps Verified and every rule; no tier change is logged', () => {
    const h = read2(LOC.durable)
    expect(h.version).toBe('0.7.0')
    expect(h.tier).toBe('verified')
    expect(h.rules.filter((r) => !r.pass)).toEqual([])
    expect(h.signals.fit['0.9']).not.toBe('unknown')
    expect(h.agentPolicy['0.9']?.consentText).toBe('Install @fullstackhouse/open-mercato-durable-work@0.6.0')
    const changes = readJsonl(join(d2, 'changes', '2026-10.jsonl')).map((c) => Change.parse(c))
    const before = readJsonl(join(DATA, 'changes', '2026-10.jsonl')).length
    expect(changes.slice(before)).toEqual([])
  })

  it('consents stays refuse BROKEN on 0.9 with no consent text', () => {
    const h = read2(LOC.consents)
    expect(h.tier).toBe('listed')
    expect(h.signals.receipt['0.9']).toBe('broken')
    const p = h.agentPolicy['0.9']!
    expect(p.decision).toBe('refuse')
    expect(p.reasons.map((r) => r.code)).toEqual(['BROKEN', 'THIRD_PARTY', 'LICENSE'])
    expect(p.reasons[0]?.text).toBe('Broken at typecheck on 0.9 since 23 Oct.')
    expect(p.consentText).toBeUndefined()
  })
})
