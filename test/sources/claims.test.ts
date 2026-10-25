import { describe, expect, it } from 'vitest'
import { claimFromHistory, type ClaimContext, type ClaimInput } from '../../lib/sources/claims.ts'
import { offlineHttp } from './helpers.ts'
import { SHAS } from './make-claims-fixtures.ts'

// PR history of the catalog repository: synthetic recordings in test/fixtures/http (see make-claims-fixtures.ts)
const ctx: ClaimContext = { http: offlineHttp(), modulesRepo: 'wojciechszyjka/modules', curators: ['wojciechszyjka'] }
const none = { status: 'none', sourceRepo: null, commit: null, workflow: null } as const
const consents = (commits: string[], o: Partial<ClaimInput> = {}): ClaimInput => ({
  locator: 'npm:@piotrkarwatka/marketing-consents',
  entryRepo: 'pkarw/marketing-consents',
  tarballRepo: 'pkarw/marketing-consents',
  ownerType: 'User',
  provenance: none,
  commits: commits.map((sha) => ({ sha })),
  ...o,
})
const ksef = (commits: string[], o: Partial<ClaimInput> = {}): ClaimInput => ({
  locator: 'npm:@fastwhitecat/integration-ksef-direct',
  entryRepo: 'FastWhiteCat/openmercato-module-ksef',
  tarballRepo: 'FastWhiteCat/openmercato-module-ksef',
  ownerType: 'Organization',
  provenance: none,
  commits: commits.map((sha) => ({ sha })),
  ...o,
})

describe('claims from the PR history (D26)', () => {
  it('a curator-seeded entry stays Unclaimed', async () => {
    expect(await claimFromHistory(consents([SHAS.seed]), ctx)).toBeNull()
  })
  it('the repository owner claims through a merged PR (newest commit first in, oldest PR wins)', async () => {
    expect(await claimFromHistory(consents([SHAS.strangerEdit, SHAS.ownerEdit, SHAS.seed]), ctx)).toEqual({
      by: 'pkarw',
      method: 'repo-owner',
      pr: 7,
      at: '2026-10-30',
    })
  })
  it('an unmerged PR does not claim', async () => {
    expect(await claimFromHistory(consents([SHAS.openPr]), ctx)).toBeNull()
  })
  it('a public member of the owning org claims; a stranger does not', async () => {
    expect(await claimFromHistory(ksef([SHAS.memberEdit, SHAS.seed]), ctx)).toEqual({
      by: 'lbajsarowicz',
      method: 'org-member',
      pr: 9,
      at: '2026-11-02',
    })
    expect(await claimFromHistory(ksef([SHAS.strangerEdit]), ctx)).toBeNull()
  })
  it('provenance to the entry repository lets the PR author claim', async () => {
    const verified = {
      status: 'verified',
      sourceRepo: 'FastWhiteCat/openmercato-module-ksef',
      commit: 'df48a8c',
      workflow: null,
    } as const
    expect(await claimFromHistory(ksef([SHAS.strangerEdit], { provenance: verified }), ctx)).toEqual({
      by: 'someone-else',
      method: 'provenance',
      pr: 11,
      at: '2026-11-03',
    })
    const elsewhere = { ...verified, sourceRepo: 'other/repo' }
    expect(await claimFromHistory(ksef([SHAS.strangerEdit], { provenance: elsewhere }), ctx)).toBeNull()
  })
  it('no claim when repository.url of the package is not the entry repository', async () => {
    expect(await claimFromHistory(consents([SHAS.ownerEdit], { tarballRepo: 'someone/else' }), ctx)).toBeNull()
    expect(await claimFromHistory(consents([SHAS.ownerEdit], { tarballRepo: null }), ctx)).toBeNull()
  })
})
