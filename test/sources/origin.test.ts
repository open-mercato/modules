import { describe, expect, it } from 'vitest'
import { CommunityFile, OfficialMaintainersFile } from '../../lib/schema/index.ts'
import { originOf, type OriginContext, type OriginInput } from '../../lib/sources/origin.ts'
import { parsePartners } from '../../lib/sources/partners.ts'

const partners = parsePartners(
  'partners:\n  - company: Fast White Cat\n    contributors: [lbajsarowicz]\n  - company: Full Stack House\n    contributors: [jtomaszewski]\n  - company: FilaNovum\n    contributors: [mkadziolka]\n',
)
const officialMaintainers = OfficialMaintainersFile.parse({
  githubOrg: 'open-mercato',
  npm: ['pat-lewczuk', 'patryk.andrzejewski', 'piotrkarwatka'],
})
const noOrgs = CommunityFile.parse({ owners: ['pkarw'], orgs: [], npmScopes: ['@piotrkarwatka'] })
const withOrgs = CommunityFile.parse({
  owners: ['pkarw'],
  orgs: [
    { company: 'Fast White Cat', org: 'fastwhitecat' },
    { company: 'Full Stack House', org: 'fullstackhouse' },
  ],
  npmScopes: ['@piotrkarwatka'],
})
const members = new Set(['someone-in-om'])
const ctx = (community = noOrgs): OriginContext => ({
  community,
  officialMaintainers,
  partners,
  isOmMember: async (l) => members.has(l.toLowerCase()),
})
const input = (o: Partial<OriginInput>): OriginInput => ({
  locator: 'npm:x',
  kind: 'module',
  repo: null,
  repoExists: true,
  ownerType: 'User',
  npmMaintainers: [],
  ...o,
})

describe('type (spec 6.1, D25, D38, D-OPEN-6)', () => {
  it('official by scope only for npm:@open-mercato/*', async () => {
    expect(
      await originOf(input({ locator: 'npm:@open-mercato/gateway-stripe', repo: 'open-mercato/open-mercato' }), ctx()),
    ).toEqual({ type: 'official', typeReason: 'Scope @open-mercato.' })
    // a module (not a tool) from the org is not official without the scope
    expect(
      (
        await originOf(
          input({
            locator: 'npm:om-thing',
            repo: 'open-mercato/x',
            ownerType: 'Organization',
            npmMaintainers: ['piotrkarwatka'],
          }),
          ctx(),
        )
      ).type,
    ).toBe('3rd-party')
  })
  it('D38: a tool from the open-mercato org published only by OM npm maintainers', async () => {
    const tool = input({
      locator: 'npm:create-mercato-module',
      kind: 'tool',
      repo: 'open-mercato/create-mercato-module',
      ownerType: 'Organization',
      npmMaintainers: ['piotrkarwatka'],
    })
    expect((await originOf(tool, ctx())).type).toBe('official')
    expect((await originOf({ ...tool, npmMaintainers: ['piotrkarwatka', 'stranger'] }, ctx())).type).toBe('3rd-party')
    expect((await originOf({ ...tool, npmMaintainers: [] }, ctx())).type).toBe('3rd-party')
  })
  it('community: policy owners, public members of open-mercato, partner contributors', async () => {
    expect(await originOf(input({ repo: 'pkarw/marketing-consents' }), ctx())).toEqual({
      type: 'community',
      typeReason: 'Repository owner pkarw is listed in policy/community.yml.',
    })
    expect((await originOf(input({ repo: 'Someone-In-OM/x' }), ctx())).typeReason).toContain(
      'public member of open-mercato',
    )
    expect((await originOf(input({ repo: 'mkadziolka/open-mercato-rust-client' }), ctx())).typeReason).toBe(
      'Repository owner mkadziolka is a contributor of certified partner FilaNovum.',
    )
  })
  it('D-OPEN-6: partner orgs count only once the curator maps them in community.yml', async () => {
    const ksef = input({
      locator: 'npm:@fastwhitecat/integration-ksef-direct',
      repo: 'FastWhiteCat/openmercato-module-ksef',
      ownerType: 'Organization',
    })
    expect((await originOf(ksef, ctx(noOrgs))).type).toBe('3rd-party')
    expect(await originOf(ksef, ctx(withOrgs))).toEqual({
      type: 'community',
      typeReason:
        'Repository owner FastWhiteCat is the GitHub org of certified partner Fast White Cat (policy/community.yml).',
    })
  })
  it('without a resolvable repository: npm scope from community.yml, else 3rd-party', async () => {
    expect(
      await originOf(
        input({ locator: 'npm:@piotrkarwatka/visits', repo: 'pkarw/visits-example', repoExists: false }),
        ctx(),
      ),
    ).toEqual({
      type: 'community',
      typeReason:
        'Repository pkarw/visits-example returns 404; npm scope @piotrkarwatka is listed in policy/community.yml.',
    })
    // a 404 repository owner is not trusted, even when the owner would count (fullstackhouse/open-mercato-durable)
    const durable = input({
      locator: 'npm:@fullstackhouse/open-mercato-durable-work',
      repo: 'fullstackhouse/open-mercato-durable',
      repoExists: false,
    })
    expect((await originOf(durable, ctx(withOrgs))).type).toBe('3rd-party')
    expect((await originOf(input({ locator: 'npm:@freighttech/ui', repo: null }), ctx(withOrgs))).typeReason).toBe(
      'No repository in package.json; npm scope is not in policy/community.yml.',
    )
  })
  it('organizations are never looked up as public members', async () => {
    let called = false
    const c = { ...ctx(), isOmMember: async () => ((called = true), true) }
    expect(
      (await originOf(input({ repo: 'Northbound-Run/open-mercato-shopify', ownerType: 'Organization' }), c)).type,
    ).toBe('3rd-party')
    expect(called).toBe(false)
  })
})
