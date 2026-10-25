import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Descriptor } from '../../lib/schema/descriptor.ts'
import { assertPathMatches } from '../../lib/schema/locator.ts'
import { INVALID_DESCRIPTORS, VALID_DESCRIPTORS, readYaml, rel, walk } from './helpers.ts'

const valid = walk(VALID_DESCRIPTORS).filter((p) => p.endsWith('.yml'))
const invalid = walk(INVALID_DESCRIPTORS).filter((p) => p.endsWith('.yml'))

describe('Descriptor (spec 4.3)', () => {
  it('has the spec examples and the fixture entries', () => {
    expect(valid.map((p) => rel(VALID_DESCRIPTORS, p)).sort()).toEqual([
      'modules/@fastwhitecat/integration-ksef-direct.yml',
      'modules/@fullstackhouse/open-mercato-data-sync-durable.yml',
      'modules/@fullstackhouse/open-mercato-durable-work.yml',
      'modules/@open-mercato/enterprise.yml',
      'modules/@open-mercato/gateway-stripe.yml',
      'modules/@open-mercato/gateway-tpay.yml',
      'modules/@piotrkarwatka/marketing-consents.yml',
      'modules/github/chmarusso/open-mercato-enrichment-treg.yml',
    ])
  })

  it.each(valid.map((p) => [rel(VALID_DESCRIPTORS, p), p]))('accepts %s and its path', (relPath, p) => {
    const r = Descriptor.safeParse(readYaml(p))
    expect(r.error?.issues ?? []).toEqual([])
    expect(() => assertPathMatches(relPath, r.data!)).not.toThrow()
  })

  it('applies defaults', () => {
    const d = Descriptor.parse(
      readYaml(`${VALID_DESCRIPTORS}/modules/github/chmarusso/open-mercato-enrichment-treg.yml`),
    )
    expect(d).toMatchObject({
      kind: 'module',
      tags: [],
      providers: [],
      links: {},
      pricing: 'free',
      status: 'active',
      featured: false,
    })
  })

  it.each(invalid.map((p) => [basename(p), p]))('rejects %s', (_name, p) => {
    const header = readFileSync(p, 'utf8').split('\n')[0] ?? ''
    const m = /^# expect-(path|message): (.+)$/.exec(header)
    expect(m, `missing expectation header in ${p}`).not.toBeNull()
    const r = Descriptor.safeParse(readYaml(p))
    expect(r.success).toBe(false)
    const issues = r.error!.issues
    if (m![1] === 'path') {
      const field = m![2]!.trim()
      const hit = issues.some(
        (i) =>
          i.path[0] === field || (i.code === 'unrecognized_keys' && (i as { keys: string[] }).keys.includes(field)),
      )
      expect(hit, JSON.stringify(issues)).toBe(true)
    } else expect(issues.map((i) => i.message).join('\n')).toContain(m![2]!.trim())
  })

  it('rejects unknown fields instead of dropping them', () => {
    const r = Descriptor.safeParse({
      npm: '@acme/x',
      category: 'devtools',
      summary: 'A valid summary that is long enough.',
      whenToUse: 'Use when a test needs a descriptor with one extra field.',
      stars: 5,
    })
    expect(r.success).toBe(false)
  })
})
