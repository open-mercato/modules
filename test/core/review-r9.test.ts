// Review r9: day 0 knows what a new app ships, one `Built for` sentence for the page, the card and the tools, and the
// `partial` anatomy note says only what the facts show.
import { describe, expect, test } from 'vitest'
import { anatomyNote } from '../../lib/core/entry.ts'
import { NEW_APP_PACKAGES, newAppLines, presetsOrFallback, registeredIn } from '../../lib/core/lines.ts'
import { builtForText } from '../../lib/core/policy.ts'
import type { AnatomySummary, IndexEntry } from '../../lib/schema/published/modules.ts'
import { fixtureEntries, LOC, loadFixture } from './helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines

describe('day 0: the presets are known before the first night writes presets.json', () => {
  test('the fallback is the packages outside core of every scaffold the baselines read', () => {
    for (const k of Object.keys(fx.presets)) {
      const outsideCore = fx.presets[k]!.empty!.filter((m) => m.from !== '@open-mercato/core')
      expect(outsideCore).toEqual(NEW_APP_PACKAGES)
    }
  })

  test('without presets.json every line knows both presets; a collected line keeps its own lists', () => {
    const day0 = presetsOrFallback(null, lines, '2026-10-23T09:39:38Z')
    expect(newAppLines(day0, lines, '@open-mercato/events').sort()).toEqual(['0.8', '0.9', 'next'])
    expect(lines.filter((l) => registeredIn(day0, l.key, 'empty', '@open-mercato/events')).length).toBe(3)
    // a new app (classic) has gateway-stripe on, an app from the empty preset does not
    expect(newAppLines(day0, lines, '@open-mercato/gateway-stripe').sort()).toEqual(['0.8', '0.9', 'next'])
    expect(registeredIn(day0, '0.9', 'empty', '@open-mercato/gateway-stripe')).toBe(false)
    const some = presetsOrFallback({ '0.9': fx.presets['0.9']! }, lines, '2026-10-23T09:39:38Z')
    // a collected line keeps its own empty preset and gains the classic one read by hand
    expect(some['0.9']?.empty).toEqual(fx.presets['0.9']!.empty)
    expect(some['0.9']?.classic?.some((m) => m.id === 'currencies')).toBe(true)
    // a classic list a baseline wrote wins over the one read by hand
    const own = presetsOrFallback(
      { '0.9': { ...fx.presets['0.9']!, classic: [{ id: 'auth', from: '@open-mercato/core' }] } },
      lines,
      '2026-10-23T09:39:38Z',
    )
    expect(own['0.9']?.classic).toEqual([{ id: 'auth', from: '@open-mercato/core' }])
    // a version read by hand (0.8.0) fills its whole empty preset, the scaffold the baselines read
    expect(some['0.8']?.empty).toEqual(fx.presets['0.8']!.empty)
    // an unknown version still has events and search in the empty preset, its classic preset unknown
    const later = presetsOrFallback(null, [{ ...lines[0]!, version: '0.11.0' }], '2026-10-23T09:39:38Z')
    expect(later['0.9']?.empty).toEqual(NEW_APP_PACKAGES)
    expect(later['0.9']?.classic).toBeUndefined()
  })
})

describe('Built for in one sentence (review r9)', () => {
  const entries = fixtureEntries(fx)
  test('a bounded range names its minor and its peers', () => {
    const ksef = entries.find((e) => e.locator === LOC.ksef)!
    expect(builtForText(ksef)).toBe('Built for 0.7 (peers >=0.7.0 <0.8.0)')
  })
  test('lines that install different versions name the versions (webhooks)', () => {
    const e = {
      version: { recommended: { '0.8': '0.8.0', '0.9': '0.9.0' }, latest: '0.9.0', preview: null },
      compat: { builtFor: { range: '0.9.0', kind: 'exact-pin', lines: ['0.8', '0.9'] } },
    } as unknown as IndexEntry
    expect(builtForText(e)).toBe('Built for 0.8 and 0.9 (peers of 0.8.0 and 0.9.0)')
  })
  test('no range', () => {
    const e = {
      version: { recommended: {} },
      compat: { builtFor: { range: null, kind: 'missing', lines: [] } },
    } as unknown as IndexEntry
    expect(builtForText(e)).toBe('Built for: no Open Mercato peer range')
  })
})

describe('the partial anatomy note (review r9)', () => {
  const ZERO = {
    entities: 0,
    tables: 0,
    migrations: 0,
    routes: 0,
    publicRoutes: 0,
    aclFeatures: 0,
    eventsEmitted: 0,
    eventsConsumed: 0,
    backendPages: 0,
    frontendPages: 0,
    widgets: 0,
    workers: 0,
    cli: 0,
    aiTools: 0,
    aiAgents: 0,
    extends: 0,
  }
  const counts = (o: Partial<AnatomySummary['counts']>): AnatomySummary =>
    ({ coverage: 'partial', counts: { ...ZERO, ...o } }) as unknown as AnatomySummary
  test('plugs into a host only when it extends or requires one and has no tables and routes of its own', () => {
    expect(anatomyNote({ anatomy: counts({ extends: 3 }), requires: [] })).toEqual({
      text: 'Few contracts. This package mostly plugs into an existing host module.',
      plugs: true,
    })
    expect(anatomyNote({ anatomy: counts({ routes: 0 }), requires: [{}] })?.plugs).toBe(true)
  })
  test('events: routes and a queue, plugs into nothing: the neutral sentence', () => {
    expect(anatomyNote({ anatomy: counts({ routes: 2, workers: 1 }), requires: [] })).toEqual({
      text: 'Few contracts read from src/.',
      plugs: false,
    })
    expect(anatomyNote({ anatomy: counts({ extends: 1, routes: 2 }), requires: [] })?.plugs).toBe(false)
  })
  test('three organs or more (consents: tables, routes, permissions; partial for its route auth): partly read', () => {
    expect(anatomyNote({ anatomy: counts({ tables: 2, routes: 4, eventsEmitted: 1 }), requires: [] })).toEqual({
      text: 'Partly read: some contracts could not be resolved statically.',
      plugs: false,
    })
  })
  test('a full anatomy has no note', () => {
    expect(anatomyNote({ anatomy: { ...counts({}), coverage: 'full' }, requires: [] })).toBeNull()
    expect(anatomyNote({ anatomy: null, requires: [] })).toBeNull()
  })
})
