// The Hive: slot stability through `yarn om hive` on two consecutive snapshots, and the render budget (spec 12.2 WP11).
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parse as parseYaml, stringify } from 'yaml'
import {
  angularDistance,
  assignSlots,
  axialToPixel,
  cellAngle,
  clockAngle,
  discViolations,
  dist2,
  sectorCentres,
  oklabDistance,
  oklchChroma,
  inWedge,
  plateClock,
  plateDist2,
  ring,
  ringCells,
  WEDGE_CENTRE,
  WEDGES,
  wedgeColour,
} from '../../lib/hive/layout.ts'
import type { HiveCandidate, HiveGroup, HiveSlotsFile, Wedge } from '../../lib/hive/layout.ts'
import { renderHive } from '../../lib/hive/render.ts'
import { CategoriesFile, HiveSlots } from '../../lib/schema/index.ts'
import { locatorToPath } from '../../lib/schema/locator.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const FIX = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'hive-entries.json'), 'utf8')) as {
  entries: { locator: string; kind: 'module' | 'provider'; type: string; category: string; tags: string[] }[]
  builtinCategories: Record<string, string>
}
const MODULE_FACTS = JSON.parse(
  readFileSync(join(ROOT, 'node_modules/@open-mercato/cli/dist/agentic/guides/module-facts.v2.json'), 'utf8'),
) as Record<string, { sourcePackage: string }>
/** Core modules of 0.9.0, read from the CLI facts file (the source of data/builtin/<core>.json). */
const CORE_IDS = Object.entries(MODULE_FACTS)
  .filter(([, m]) => m.sourcePackage === '@open-mercato/core')
  .map(([id]) => id)
  .sort()

const tmp = mkdtempSync(join(tmpdir(), 'om-hive-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function writeSnapshot(dir: string, entries: typeof FIX.entries): void {
  rmSync(dir, { recursive: true, force: true })
  const modules = join(dir, 'modules')
  const data = join(dir, 'data')
  const policy = join(dir, 'policy')
  mkdirSync(policy, { recursive: true })
  cpSync(join(ROOT, 'policy', 'categories.yml'), join(policy, 'categories.yml'))
  writeFileSync(join(policy, 'builtin-categories.yml'), stringify(FIX.builtinCategories))
  entries.forEach((e, i) => {
    const d: Record<string, unknown> = e.locator.startsWith('npm:')
      ? { npm: e.locator.slice(4) }
      : { github: e.locator.slice(7) }
    d.kind = e.kind
    d.category = e.category
    if (e.tags.length) d.tags = e.tags
    d.summary = 'A module used to test the stable Hive layout.'
    d.whenToUse = 'Use when the Hive layout test needs one more listed entry.'
    if (e.kind === 'provider') d.extends = 'npm:@open-mercato/web-research'
    const file = join(modules, `${locatorToPath(e.locator)}.yml`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, stringify(d))
    const sync = join(data, 'sync', `${locatorToPath(e.locator)}.json`)
    mkdirSync(dirname(sync), { recursive: true })
    const at = new Date(Date.UTC(2026, 9, 23, 0, 0, i)).toISOString().replace('.000Z', 'Z')
    writeFileSync(sync, JSON.stringify({ locator: e.locator, type: e.type, firstSeenAt: at }))
  })
  // data/builtin/0.9.0.json: the fixture file with one ModuleFacts per core module ID
  const builtin = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/data/builtin/0.9.0.json'), 'utf8'))
  const proto = builtin.modules[0]
  builtin.modules = CORE_IDS.map((id) => ({ ...proto, id, collisionKeys: { ...proto.collisionKeys, moduleId: id } }))
  mkdirSync(join(data, 'builtin'), { recursive: true })
  writeFileSync(join(data, 'builtin', '0.9.0.json'), JSON.stringify(builtin))
  cpSync(join(ROOT, 'test/fixtures/data/lines.json'), join(data, 'lines.json'))
}

function runHiveCli(dir: string, date: string): { cells: number; added: string[]; warnings: string[] } {
  const out = execFileSync(
    process.execPath,
    [
      join(ROOT, 'lib', 'cli.ts'),
      'hive',
      '--data',
      join(dir, 'data'),
      '--modules',
      join(dir, 'modules'),
      '--policy',
      join(dir, 'policy'),
      '--date',
      date,
      '--json',
    ],
    { encoding: 'utf8' },
  )
  return JSON.parse(out) as { cells: number; added: string[]; warnings: string[] }
}

const readSlots = (dir: string): HiveSlotsFile =>
  HiveSlots.parse(JSON.parse(readFileSync(join(dir, 'data', 'hive.json'), 'utf8'))) as HiveSlotsFile

describe('geometry', () => {
  it('ring k has 6k cells, all at distance k', () => {
    for (let k = 1; k < 8; k++) {
      const cells = ringCells(k)
      expect(cells).toHaveLength(6 * k)
      expect(new Set(cells.map((c) => `${c.q},${c.r}`)).size).toBe(6 * k)
      for (const c of cells) expect(ring(c)).toBe(k)
    }
  })
  it('wedges cover every cell of a ring', () => {
    for (const c of ringCells(5)) expect(Object.keys(WEDGE_CENTRE).some((w) => inWedge(c, w as Wedge))).toBe(true)
  })
  it('sell points up', () => {
    expect(cellAngle({ q: 1, r: -2 })).toBeCloseTo(-90)
  })
})

describe('yarn om hive on two consecutive snapshots', () => {
  const dir = join(tmp, 'snap')
  const visible = FIX.entries.filter((e) => !e.tags.includes('example'))
  const first = visible.filter((e) => e.locator !== 'npm:@dainamite/cpq-billing-connector')

  it('first snapshot: 46 core modules and every listed module and provider without the example tag', () => {
    writeSnapshot(dir, first)
    const res = runHiveCli(dir, '2026-10-23')
    expect(CORE_IDS).toHaveLength(46)
    expect(res.cells).toBe(46 + first.length)
    expect(res.added).toHaveLength(46 + first.length)
    expect(res.warnings).toEqual([])
    const slots = readSlots(dir).slots
    expect(Object.keys(slots)).not.toContain('npm:@piotrkarwatka/visits')
    const wedgeByKey = new Map<string, Wedge>(first.map((e) => [e.locator, wedgeOf(e.category)] as [string, Wedge]))
    const typeByKey = new Map(first.map((e) => [e.locator, e.type]))
    checkDiscRules(slots, wedgeByKey, typeByKey)
  })

  it('second snapshot: an added entry does not move existing slots, a freed slot is not reused', () => {
    const before = readSlots(dir).slots
    // add the connector, remove ksef (its slot is freed), add one more after it
    const second = [
      ...first.filter((e) => e.locator !== 'npm:@fastwhitecat/integration-ksef-direct'),
      visible.find((e) => e.locator === 'npm:@dainamite/cpq-billing-connector')!,
    ]
    writeSnapshot(join(tmp, 'snap2'), second)
    cpSync(join(dir, 'data', 'hive.json'), join(tmp, 'snap2', 'data', 'hive.json'))
    const res = runHiveCli(join(tmp, 'snap2'), '2026-10-24')
    expect(res.added).toEqual(['npm:@dainamite/cpq-billing-connector'])
    const after = readSlots(join(tmp, 'snap2')).slots
    for (const [k, s] of Object.entries(before)) expect(after[k]).toEqual(s)
    const freed = before['npm:@fastwhitecat/integration-ksef-direct']!
    const added = after['npm:@dainamite/cpq-billing-connector']!
    expect(added.at).toBe('2026-10-24')
    expect(`${added.q},${added.r}`).not.toBe(`${freed.q},${freed.r}`)
    // a third run with the same input changes nothing
    const again = runHiveCli(join(tmp, 'snap2'), '2026-10-25')
    expect(again.added).toEqual([])
    expect(readSlots(join(tmp, 'snap2')).slots).toEqual(after)
  })

  it('places the next free cell beside the sector of its category', () => {
    const before = readSlots(dir).slots
    const slots = readSlots(join(tmp, 'snap2')).slots
    const c = slots['npm:@dainamite/cpq-billing-connector']!
    // the sector centre as `yarn om hive` saw it: entries of the second snapshot (ksef left, its slot reserved)
    const wedge = new Map<string, Wedge>(
      visible
        .filter((e) => e.locator !== 'npm:@fastwhitecat/integration-ksef-direct')
        .map((e) => [e.locator, wedgeOf(e.category)] as [string, Wedge]),
    )
    const centre = sectorCentres(
      before,
      (k) => wedge.get(k) ?? null,
      (k) => (k.startsWith('core:') ? 'core' : 'official'),
    ).get('money')!
    expect(angularDistance(plateClock(c), centre)).toBeLessThanOrEqual(30)
  })
})

describe('yarn om hive input validation', () => {
  it('exits 2 and writes nothing when --data does not exist', () => {
    const missing = join(tmp, 'no-such-data')
    let code = 0
    try {
      execFileSync(process.execPath, [join(ROOT, 'lib', 'cli.ts'), 'hive', '--data', missing], { stdio: 'pipe' })
    } catch (err) {
      code = (err as { status: number }).status
    }
    expect(code).toBe(2)
    expect(existsSync(missing)).toBe(false)
  })
  it('--relayout lays the whole map out again from the current rules', () => {
    const dir = join(tmp, 'relayout')
    writeSnapshot(dir, FIX.entries.filter((e) => !e.tags.includes('example')).slice(0, 4))
    writeFileSync(
      join(dir, 'data', 'hive.json'),
      JSON.stringify({ version: 1, slots: { 'core:gone': { q: 0, r: 0, at: '2026-01-01' } } }),
    )
    const base = ['--data', join(dir, 'data'), '--modules', join(dir, 'modules'), '--policy', join(dir, 'policy')]
    execFileSync(process.execPath, [join(ROOT, 'lib', 'cli.ts'), 'hive', ...base, '--relayout', '--json'])
    const slots = readSlots(dir).slots
    expect(slots['core:gone']).toBeUndefined()
    expect(Object.values(slots).some((s) => s.q === 0 && s.r === 0)).toBe(true)
  })
  it('lays a file from before the disc rules out again once, then keeps it', () => {
    const dir = join(tmp, 'legacy')
    const entries = FIX.entries.filter((e) => !e.tags.includes('example'))
    writeSnapshot(dir, entries)
    // the crescent of the first data run: core cells far from the centre, a catalog cell in the middle
    const legacy: HiveSlotsFile = {
      version: 1,
      slots: Object.fromEntries([
        [entries[0]!.locator, { q: 0, r: 0, at: '2026-10-22' }],
        ...CORE_IDS.map((id, i) => [`core:${id}`, { q: 3 + (i % 5), r: -Math.floor(i / 5), at: '2026-10-22' }]),
      ]),
    }
    writeFileSync(join(dir, 'data', 'hive.json'), JSON.stringify(legacy))
    const res = runHiveCli(dir, '2026-10-23')
    expect(res.warnings).toEqual(['data/hive.json predates the disc layout; the whole map was laid out again'])
    const file = readSlots(dir)
    expect(file.layout).toBe('disc')
    const wedgeByKey = new Map<string, Wedge>(entries.map((e) => [e.locator, wedgeOf(e.category)] as [string, Wedge]))
    checkDiscRules(file.slots, wedgeByKey, new Map(entries.map((e) => [e.locator, e.type])))
    const again = runHiveCli(dir, '2026-10-24')
    expect(again.warnings).toEqual([])
    expect(again.added).toEqual([])
    expect(readSlots(dir)).toEqual(file)
  })
  it('warns with the file path when a sync or health record is broken, and skips it', () => {
    const dir = join(tmp, 'broken')
    const entries = FIX.entries.filter((e) => !e.tags.includes('example')).slice(0, 3)
    writeSnapshot(dir, entries)
    const syncFile = join(dir, 'data', 'sync', `${locatorToPath(entries[0]!.locator)}.json`)
    writeFileSync(syncFile, JSON.stringify({ locator: entries[0]!.locator, type: 'friendly', firstSeenAt: 'x' }))
    mkdirSync(join(dir, 'data', 'health', 'npm'), { recursive: true })
    writeFileSync(join(dir, 'data', 'health', 'npm', 'broken.json'), '{"locator":')
    const res = runHiveCli(dir, '2026-10-23')
    expect(res.warnings).toHaveLength(2)
    expect(res.warnings[0]).toMatch(new RegExp(`^data/sync/${locatorToPath(entries[0]!.locator)}\\.json: type `))
    expect(res.warnings[1]).toMatch(/^data\/health\/npm\/broken\.json: not JSON/)
  })
})

describe('assignSlots', () => {
  it('reserves freed slots even when a newcomer would fit there', () => {
    const existing: HiveSlotsFile = { version: 1, slots: { 'core:gone': { q: 0, r: 0, at: '2026-01-01' } } }
    const cand: HiveCandidate[] = [{ key: 'core:new', group: 'core', wedge: 'sell', addedAt: '' }]
    const { file } = assignSlots(existing, cand, '2026-10-23')
    expect(file.slots['core:new']).not.toMatchObject({ q: 0, r: 0 })
    expect(file.slots['core:gone']).toEqual({ q: 0, r: 0, at: '2026-01-01' })
  })
})

describe('wedge colours', () => {
  it('six brand tones at the wedge centres: lime, yellow, deep yellow, then three violets', () => {
    const tones = WEDGES.map(wedgeColour)
    expect(new Set(tones).size).toBe(6)
    expect(wedgeColour('sell')).toBe('#B4F372')
    expect(wedgeColour('operate')).toBe('#EEFB63')
    expect(wedgeColour('connect')).toBe('#BC9AFF')
  })
  it('every tone is chromatic (OKLCH chroma >= 0.12): yellow and violet never blend into grey or beige', () => {
    for (const w of WEDGES) expect(oklchChroma(wedgeColour(w)), w).toBeGreaterThanOrEqual(0.12)
  })
  it('neighbouring wedges are at least 7 OKLab units apart (sell and platform included)', () => {
    const ring = ['sell', 'operate', 'money', 'connect', 'think', 'platform'] as Wedge[]
    ring.forEach((w, i) => {
      const next = ring[(i + 1) % ring.length]!
      expect(oklabDistance(wedgeColour(w), wedgeColour(next))).toBeGreaterThanOrEqual(7)
    })
  })
})

describe('render', () => {
  it('46 built-in + 48 modules and providers stays within 40 KB', () => {
    const cands: HiveCandidate[] = [
      ...CORE_IDS.map((id) => ({
        key: `core:${id}`,
        group: 'core' as const,
        wedge: wedgeOf(FIX.builtinCategories[id] ?? 'operations'),
        addedAt: '',
      })),
      ...FIX.entries.map((e, i) => ({
        key: e.locator,
        group: e.type === 'official' ? ('official' as const) : ('ecosystem' as const),
        wedge: wedgeOf(e.category),
        addedAt: `2026-10-23T00:00:${String(i).padStart(2, '0')}Z`,
      })),
    ]
    const { file } = assignSlots({ version: 1, slots: {} }, cands, '2026-10-23')
    const cells = cands.map((c) => ({
      ...c,
      ...file.slots[c.key]!,
      href: c.key.startsWith('core:') ? `/modules/built-in/${c.key.slice(5)}` : `/modules/m/${locatorToPath(c.key)}`,
      title: `${c.key} · ${c.group} · verified on 0.9`,
    }))
    expect(cells).toHaveLength(94)
    const svg = renderHive(cells)
    expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(40 * 1024)
    expect(svg).toContain('aria-hidden="true"')
    expect(svg.match(/tabindex="-1"/g)).toHaveLength(94)
    expect(svg).toContain('>PLATFORM</text>')
  })
})

/** category -> wedge from policy/categories.yml, the same source runHive reads. */
const CATEGORY_WEDGE = new Map<string, Wedge>(
  CategoriesFile.parse(parseYaml(readFileSync(join(ROOT, 'policy', 'categories.yml'), 'utf8'))).categories.map((c) => [
    c.id,
    c.wedge,
  ]),
)
function wedgeOf(category: string): Wedge {
  return CATEGORY_WEDGE.get(category) ?? 'operate'
}

/**
 * The slot rules (spec 7.5 amendment, review r1): the core is the disc nearest the centre, the catalog modules ring
 * it in one clockwise sector per category (sell centred on the top), official modules nearer the core than the
 * ecosystem of their own sector, and the whole map is one plate without holes (`discViolations`, also run by emit).
 */
function checkDiscRules(
  slots: HiveSlotsFile['slots'],
  wedgeByKey: Map<string, Wedge>,
  typeByKey: Map<string, string>,
): void {
  const broken = discViolations(slots, (k) =>
    wedgeByKey.has(k) ? { wedge: wedgeByKey.get(k)!, official: typeByKey.get(k) === 'official' } : null,
  )
  expect(broken).toEqual([])
}

describe('slot rules on the catalog of 23 Oct 2026', () => {
  // The official modules per wedge of the first data run (sell 1, operate 0, money 2, connect 11, think 9,
  // platform 8) and its ecosystem (sell 3, operate 2, money 3, connect 4, think 1, platform 2): the lopsided case
  // that drew a comb in round 1.
  const perWedge: Record<Wedge, [number, number]> = {
    sell: [1, 3],
    operate: [0, 2],
    money: [2, 3],
    connect: [11, 4],
    think: [9, 1],
    platform: [8, 2],
  }
  const cands: HiveCandidate[] = CORE_IDS.map((id) => ({
    key: `core:${id}`,
    group: 'core' as const,
    wedge: wedgeOf(FIX.builtinCategories[id] ?? 'operations'),
    addedAt: '',
  }))
  const wedgeByKey = new Map<string, Wedge>()
  const typeByKey = new Map<string, string>()
  let i = 0
  for (const w of WEDGES) {
    const [off, eco] = perWedge[w]
    for (let j = 0; j < off + eco; j++) {
      const key = `npm:@t/${w}-${j}`
      const official = j < off
      cands.push({ key, group: official ? 'official' : 'ecosystem', wedge: w, addedAt: `2026-10-${10 + (i++ % 13)}` })
      wedgeByKey.set(key, w)
      typeByKey.set(key, official ? 'official' : 'community')
    }
  }
  it('lays a round plate: core disc, category sectors around it, official before the ecosystem, no holes', () => {
    const { file } = assignSlots({ version: 1, slots: {} }, cands, '2026-10-23')
    checkDiscRules(file.slots, wedgeByKey, typeByKey)
    // the sell sector straddles the top of the clock (spec 7.5: sell -90 degrees)
    const sell = Object.entries(file.slots)
      .filter(([k]) => wedgeByKey.get(k) === 'sell')
      .map(([, s]) => clockAngle(s))
    expect(Math.min(...sell.map((a) => angularDistance(a, 0)))).toBeLessThanOrEqual(15)
  })

  it('mirrors left to right at 46 core, 31 official and 15 ecosystem cells (review r3)', () => {
    const counts = { core: 46, official: 31, ecosystem: 15 }
    // the catalog of 23 Oct 2026 by wedge: official 6, 5, 5, 5, 5, 5 and ecosystem 3, 3, 3, 2, 2, 2
    const picked: HiveCandidate[] = [
      ...CORE_IDS.slice(0, counts.core).map((id) => ({
        key: `core:${id}`,
        group: 'core' as const,
        wedge: wedgeOf(FIX.builtinCategories[id] ?? 'operations'),
        addedAt: '',
      })),
      ...WEDGES.flatMap((w, wi) =>
        [...Array(wi === 0 ? 6 : 5).keys()].map((j) => ({
          key: `npm:@o/${w}-${j}`,
          group: 'official' as HiveGroup,
          wedge: w,
          addedAt: `2026-10-${10 + wi}`,
        })),
      ),
      ...WEDGES.flatMap((w, wi) =>
        [...Array(wi < 3 ? 3 : 2).keys()].map((j) => ({
          key: `npm:@e/${w}-${j}`,
          group: 'ecosystem' as HiveGroup,
          wedge: w,
          addedAt: `2026-10-${10 + wi}`,
        })),
      ),
    ]
    for (const [g, n] of Object.entries(counts)) expect(picked.filter((c) => c.group === g)).toHaveLength(n)
    const { file } = assignSlots({ version: 1, slots: {} }, picked, '2026-10-23')
    for (const group of ['core', 'official', 'ecosystem'] as const) {
      const cells = picked.filter((c) => c.group === group).map((c) => axialToPixel(file.slots[c.key]!))
      const unpaired = cells.filter((p) => !cells.some((o) => Math.abs(o.x + p.x) < 1e-6 && Math.abs(o.y - p.y) < 1e-6))
      expect(unpaired, group).toEqual([])
    }
    // the official ring is closed: every ecosystem cell is outside it, no core cell outside it
    const d = (g: string) => picked.filter((c) => c.group === g).map((c) => plateDist2(file.slots[c.key]!))
    expect(Math.min(...d('ecosystem'))).toBeGreaterThanOrEqual(Math.max(...d('official')) - 1e-9)
    expect(Math.max(...d('core'))).toBeLessThanOrEqual(Math.min(...d('official')) + 1e-9)
  })
})
