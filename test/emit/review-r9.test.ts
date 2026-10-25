// Review r9: the feed never announces a level a later rule took back, a preview run says so in the feed, the radar
// tile sums up, and llms.txt names a refused install in the words of the page.
import { describe, expect, test } from 'vitest'
import { buildFeed, withCurrentLevels } from '../../lib/emit/changes.ts'
import { radarTile } from '../../lib/emit/index.ts'
import { llmsTxt } from '../../lib/emit/llms.ts'
import type { Change } from '../../lib/schema/data/index.ts'
import type { IndexEntry, ModulesIndex } from '../../lib/schema/published/modules.ts'
import { OPTS, fixtureEmit, json } from './helpers.ts'

const SEARCH = 'npm:@open-mercato/search'
const CF = 'npm:@northbound-run/search-cloudflare'

describe('level changes that the current level contradicts (review r9)', () => {
  const changes: Change[] = [
    { at: '2026-10-23T17:51:31Z', type: 'tier-change', locator: SEARCH, from: 'listed', to: 'verified' },
    { at: '2026-10-23T19:53:43Z', type: 'tier-change', locator: CF, from: 'listed', to: 'verified' },
  ]
  const entries = [
    { locator: SEARCH, tier: 'listed' },
    { locator: CF, tier: 'verified' },
  ] as Pick<IndexEntry, 'locator' | 'tier'>[]

  test('search is Listed today: its promotion is left out, the true one stays', () => {
    expect(withCurrentLevels(changes, entries)).toEqual([changes[1]])
  })

  test('a preview run says so in the title and the summary of the feed', () => {
    const feed = buildFeed([changes[1]!], [], OPTS.site, OPTS.now, true)
    expect(feed).toContain(
      '<title>@northbound-run/search-cloudflare: level listed to verified (preview, not CI).</title>',
    )
    expect(feed).toContain(
      '<summary>@northbound-run/search-cloudflare: level listed to verified (preview, not CI).</summary>',
    )
    expect(buildFeed([changes[1]!], [], OPTS.site, OPTS.now)).not.toContain('preview')
  })
})

describe('the Receipts on next tile sums up (review r9)', () => {
  test('every module of the population in one state', () => {
    const row = (st: string | null, listed = true) => ({
      listed,
      compat: { lines: st ? { next: { status: st } } : {} },
    })
    const t = radarTile([row('verified'), row('broken'), row('skipped'), row(null), row('infra-error')], 6)
    expect(t).toEqual({ population: 6, verified: 1, broken: 1, quarantine: 0, notJudged: 1, queued: 2, skipped: 1 })
    expect(t.verified + t.broken + t.quarantine + t.notJudged + t.queued + t.skipped).toBe(t.population)
  })
})

describe('llms.txt names a refused install (review r9)', () => {
  test('a module broken on the latest line says how, not `not verified yet`', () => {
    const index = json<ModulesIndex>(fixtureEmit(), 'modules.json')
    const consents = index.entries.find((e) => e.locator === 'npm:@piotrkarwatka/marketing-consents')!
    const why = consents.agentPolicy['0.9']?.reasons.find((r) => r.code === 'BROKEN')?.text
    expect(why).toMatch(/^Broken at typecheck on 0\.9/)
    // an official module broken on the latest line (Discord, Consents and Billing in the preview run)
    const official = { ...consents, type: 'official' as const }
    const txt = llmsTxt({
      entries: [official],
      builtIn: [],
      lines: index.lines,
      site: OPTS.site,
      mcpUrl: null,
      refreshedAt: OPTS.now,
    })
    expect(txt).toContain(`): ${consents.summary} ${why}`)
    expect(txt).not.toContain('Listed, not verified yet.')
    // verified on another line does not hide the break on the latest one
    const older = { ...official, compat: { ...official.compat, verifiedOn: ['0.8'] } }
    expect(
      llmsTxt({
        entries: [older],
        builtIn: [],
        lines: index.lines,
        site: OPTS.site,
        mcpUrl: null,
        refreshedAt: OPTS.now,
      }),
    ).toContain(why!)
  })
})
