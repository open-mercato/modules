import { describe, expect, it } from 'vitest'
import { fetchRepos, parseRepoUrl, repoQuery } from '../../lib/sources/github.ts'
import { createHttp } from '../../lib/sources/http.ts'

describe('github source', () => {
  it('parses repository URLs from package.json', () => {
    expect(parseRepoUrl('git+https://github.com/FastWhiteCat/openmercato-module-ksef.git')).toBe(
      'FastWhiteCat/openmercato-module-ksef',
    )
    expect(parseRepoUrl('https://github.com/open-mercato/open-mercato/tree/main/packages/x')).toBe(
      'open-mercato/open-mercato',
    )
    expect(parseRepoUrl('git@github.com:pkarw/visits-example.git')).toBe('pkarw/visits-example')
    expect(parseRepoUrl('github:Chmarusso/open-mercato-enrichment-treg')).toBe('Chmarusso/open-mercato-enrichment-treg')
    expect(parseRepoUrl('open-mercato/open-mercato#main/packages/gateway-stripe')).toBe('open-mercato/open-mercato')
    expect(parseRepoUrl('https://gitlab.com/a/b')).toBeNull()
    expect(parseRepoUrl(null)).toBeNull()
  })

  it('escapes names in the GraphQL query', () => {
    expect(repoQuery(['a/b"c'])).toContain('name: "b\\"c"')
  })

  it('maps GraphQL results: found, renamed (redirect) and NOT_FOUND', async () => {
    const node = (nameWithOwner: string) => ({
      nameWithOwner,
      isArchived: false,
      pushedAt: '2026-10-08T15:57:01Z',
      updatedAt: '2026-10-08T15:57:01Z',
      stargazerCount: 3,
      defaultBranchRef: { name: 'main' },
      licenseInfo: { spdxId: 'NOASSERTION' },
      repositoryTopics: { nodes: [{ topic: { name: 'open-mercato-module' } }] },
      owner: { __typename: 'Organization', login: nameWithOwner.split('/')[0] },
      refs: {
        nodes: [
          { name: 'v1.0.0', target: { oid: 'tagobj', target: { oid: 'commit1' } } },
          { name: '0.9.0', target: { oid: 'commit2' } },
        ],
      },
    })
    const f = (async () =>
      new Response(
        JSON.stringify({
          data: { r0: node('a/one'), r1: node('new-owner/two'), r2: null },
          errors: [{ type: 'NOT_FOUND', path: ['r2'], message: 'Could not resolve' }],
        }),
        { status: 200 },
      )) as typeof fetch
    const res = await fetchRepos(createHttp({ fetchImpl: f, gapMs: 0 }), ['a/one', 'b/two', 'c/three'])
    expect(res.repos.get('a/one')).toMatchObject({
      repo: 'a/one',
      redirectedFrom: null,
      license: null,
      ownerType: 'Organization',
      tags: [
        { name: 'v1.0.0', sha: 'commit1' },
        { name: '0.9.0', sha: 'commit2' },
      ],
    })
    expect(res.repos.get('b/two')).toMatchObject({ repo: 'new-owner/two', redirectedFrom: 'b/two' })
    expect(res.repos.get('c/three')).toBeNull()
    expect(res.errors.size).toBe(0)
  })
})
