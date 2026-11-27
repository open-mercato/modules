import { describe, expect, it } from 'vitest'
import { absoluteUrl, href, npmFileUrl, sourceLink, TAR_NAME_MAX } from '../../site/src/lib/url.ts'

describe('href', () => {
  it('links the home page with a trailing slash, so Pages does not redirect it', () => {
    expect(href('/', '/modules')).toBe('/modules/')
    expect(href('/', '')).toBe('/')
    expect(absoluteUrl('https://open-mercato.github.io', '/', '/modules')).toBe(
      'https://open-mercato.github.io/modules/',
    )
  })
  it('links other pages without a trailing slash', () => {
    expect(href('/compat', '/modules')).toBe('/modules/compat')
    expect(href('/compat/', '/modules')).toBe('/modules/compat')
    expect(href('/m/@x/y?tab=readme#a', '/modules')).toBe('/modules/m/@x/y?tab=readme#a')
  })
})

describe('npmFileUrl', () => {
  const V = '0.0.0-canary.20260603190311.74d2590'
  it('links jsDelivr, or unpkg for a path jsDelivr indexes cut at the 100 characters of a tar name', () => {
    // audit of 27 Nov 2026: 101 characters with `package/`, so jsDelivr answers 404 for it and 200 for `.../route.t`
    const long = 'src/modules/forms/api/distributions/[distributionId]/invitations/[invitationId]/send/route.ts'
    expect(`package/${long}`.length).toBe(TAR_NAME_MAX + 1)
    expect(npmFileUrl('@open-mercato/forms', V, long)).toBe(`https://unpkg.com/@open-mercato/forms@${V}/${long}`)
    const short = 'src/modules/forms/api/distributions/[distributionId]/invitations/[invitationId]/route.ts'
    expect(npmFileUrl('@open-mercato/forms', V, short)).toBe(
      `https://cdn.jsdelivr.net/npm/@open-mercato/forms@${V}/${short}`,
    )
    const exactly = 'x'.repeat(TAR_NAME_MAX - 'package/'.length)
    expect(npmFileUrl('a', '1.0.0', exactly)).toBe(`https://cdn.jsdelivr.net/npm/a@1.0.0/${exactly}`)
    expect(sourceLink({ npm: 'a', github: null, version: '1.0.0', gitRef: null }, `${exactly}y`, 3)).toBe(
      `https://unpkg.com/a@1.0.0/${exactly}y`,
    )
  })
})
