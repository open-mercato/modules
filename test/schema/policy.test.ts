import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CategoryId } from '../../lib/schema/common.ts'
import {
  CategoriesFile,
  CommunityFile,
  HarnessLinesFile,
  IgnoreFile,
  OfficialMaintainersFile,
  QualityReview,
  qualityGranted,
  ReservedFile,
  RevocationsFile,
  SiteFile,
} from '../../lib/schema/policy.ts'
import { ROOT, readYaml } from './helpers.ts'

describe('policy files (spec 4.4)', () => {
  it('categories.yml lists the 16 category IDs with wedges and aliases', () => {
    const c = CategoriesFile.parse(readYaml(`${ROOT}/policy/categories.yml`))
    expect(c.categories.map((x) => x.id).sort()).toEqual([...CategoryId.options].sort())
    const byId = Object.fromEntries(c.categories.map((x) => [x.id, x]))
    expect(byId.operations!.aliases).toContain('industry-packs')
    expect(byId['localization-compliance']!.wedge).toBe('money')
    expect(byId.devtools!.aliases).toEqual(['dev-tools', 'example'])
  })

  it('community, official maintainers, reserved and site parse', () => {
    const community = CommunityFile.parse(readYaml(`${ROOT}/policy/community.yml`))
    // D-OPEN-6 = yes (orchestrator decision E6): the three partner orgs and their npm scopes are community
    expect(community).toEqual({
      owners: ['pkarw'],
      orgs: [
        { company: 'Fast White Cat', org: 'fastwhitecat' },
        { company: 'Full Stack House', org: 'fullstackhouse' },
        { company: 'Freight Tech', org: 'freighttech' },
      ],
      npmScopes: ['@piotrkarwatka', '@fastwhitecat', '@fullstackhouse', '@freighttech'],
    })
    expect(OfficialMaintainersFile.parse(readYaml(`${ROOT}/policy/official-maintainers.yml`)).npm).toEqual([
      'pat-lewczuk',
      'patryk.andrzejewski',
      'piotrkarwatka',
    ])
    expect(ReservedFile.parse(readYaml(`${ROOT}/policy/reserved.yml`)).names).toEqual([
      'catalog',
      'directory',
      'modules',
      'official',
      'open-mercato',
    ])
    expect(SiteFile.parse(readYaml(`${ROOT}/policy/site.yml`))).toEqual({ cliSearchSince: null })
  })

  it('accepts the D-OPEN-6 orgs mapping when the curator adds it', () => {
    expect(
      CommunityFile.safeParse({
        owners: ['pkarw'],
        orgs: [
          { company: 'Fast White Cat', org: 'fastwhitecat' },
          { company: 'Full Stack House', org: 'fullstackhouse' },
          { company: 'Freight Tech', org: 'freighttech' },
        ],
        npmScopes: ['@piotrkarwatka'],
      }).success,
    ).toBe(true)
  })

  it('ignore.yml and harness/lines.yml schemas accept the spec examples', () => {
    expect(
      IgnoreFile.safeParse([
        { locator: 'npm:@sensinum/strapi-plugin-open-mercato', reason: 'Strapi plugin, not an Open Mercato module' },
        { locator: 'npm:@open-mercato/cezar*', reason: 'framework infrastructure or tooling, not modules' },
        { locator: 'github:open-mercato/n8n-nodes', reason: 'n8n integration, not a module' },
      ]).success,
    ).toBe(true)
    expect(IgnoreFile.safeParse([{ locator: 'npm:@x/y' }]).success).toBe(false)
    expect(
      HarnessLinesFile.safeParse({
        patches: [
          {
            id: 'api-keys',
            applies: '>=0.9.0 <0.10.0',
            script: 'patches/api-keys.sh',
            why: 'OM 0.9.0 empty preset omits api_keys (fixed on main in #7473, not in release/v0.9.x)',
            ref: 'https://github.com/open-mercato/open-mercato/pull/7473',
          },
        ],
        cadence: { latest: 'nightly', next: 'nightly', previous: 'weekly' },
        weeklyDay: 0,
      }).success,
    ).toBe(true)
  })

  it('quality starts with 0 reviews and an empty revocation list', () => {
    expect(RevocationsFile.parse(readYaml(`${ROOT}/quality/revocations.yml`))).toEqual([])
    expect(existsSync(`${ROOT}/quality/reviews/.gitkeep`)).toBe(true)
    const checklist = readFileSync(`${ROOT}/quality/checklist/v1.md`, 'utf8')
    for (let i = 1; i <= 12; i++) expect(checklist).toContain(`OMQ-${String(i).padStart(2, '0')}`)
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `OMQ-${String(i + 1).padStart(2, '0')}`,
      pass: true,
      note: 'ok',
      file: null,
      line: null,
    }))
    const review = {
      version: '1.4.2',
      integrity: 'sha512-x',
      checklistVersion: 1,
      items,
      reviewers: ['a', 'b'],
      reviewedAt: '2026-10-23',
      until: '2027-10-23',
      reportUrl: 'https://github.com/wojciechszyjka/modules/issues/1',
    }
    expect(QualityReview.safeParse(review).success).toBe(true)
    expect(QualityReview.safeParse({ ...review, reviewers: ['a'] }).success).toBe(false)
    // finding of 25 Oct: twelve copies of one item, the same reviewer twice, an end before the review
    const same = items.map((x) => ({ ...x, id: 'OMQ-01' }))
    expect(QualityReview.safeParse({ ...review, items: same }).success).toBe(false)
    expect(QualityReview.safeParse({ ...review, reviewers: ['pkarw', '@PKARW'] }).success).toBe(false)
    expect(QualityReview.safeParse({ ...review, until: '2026-10-01' }).success).toBe(false)
    // a review that records a failed item parses (it is a record) but grants nothing
    const failed = { ...review, items: items.map((x, i) => (i === 3 ? { ...x, pass: false } : x)) }
    expect(QualityReview.safeParse(failed).success).toBe(true)
    expect(qualityGranted(failed)).toBe(false)
    expect(qualityGranted(review)).toBe(true)
  })
})
