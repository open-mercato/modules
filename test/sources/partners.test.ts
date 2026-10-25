import { describe, expect, it } from 'vitest'
import { fetchPartners, isPartnerCompany, parsePartners } from '../../lib/sources/partners.ts'
import { offlineHttp } from './helpers.ts'

describe('partners.ts (D25): partners[].contributors[] of certified-partners.yml', () => {
  it('reads the recorded file from open-mercato/open-mercato main', async () => {
    const p = await fetchPartners(offlineHttp())
    expect(p.companies).toContain('Fast White Cat')
    expect(p.companies).toContain('Full Stack House')
    expect(p.companies).toContain('Freight Tech')
    expect(p.contributors.get('lbajsarowicz')).toBe('Fast White Cat')
    expect(p.contributors.get('jtomaszewski')).toBe('Full Stack House')
    expect(p.contributors.get('mkadziolka')).toBe('FilaNovum')
    // logins are case-insensitive keys
    expect(p.contributors.get('radnok')).toBe('8lines')
  })
  it('ignores unknown fields, rejects a file without partners, matches companies loosely', () => {
    const p = parsePartners('partners:\n  - company: Acme  Corp\n    contributors: [Alice]\n    owners: [x]\n')
    expect(isPartnerCompany(p, 'acme corp')).toBe(true)
    expect(p.contributors.get('alice')).toBe('Acme  Corp')
    expect(() => parsePartners('owners: [a]')).toThrow()
  })
})
