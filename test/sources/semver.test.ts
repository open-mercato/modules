import { describe, expect, it } from 'vitest'
import { compareVersions, isoSeconds, isSemVer, isStable, lineKeyOf } from '../../lib/sources/semver.ts'

describe('semver helpers', () => {
  it('orders by SemVer 2.0.0 precedence', () => {
    const list = [
      '1.0.0',
      '0.10.1-develop.7583.1.0c886d0a14',
      '0.9.0',
      '0.10.0',
      '1.0.0-rc.1',
      '0.10.1',
      '0.9.10',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
    ]
    expect([...list].sort(compareVersions)).toEqual([
      '0.9.0',
      '0.9.10',
      '0.10.0',
      '0.10.1-develop.7583.1.0c886d0a14',
      '0.10.1',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-rc.1',
      '1.0.0',
    ])
  })
  it('tells stable from prerelease and keys lines', () => {
    expect(isStable('0.9.0')).toBe(true)
    expect(isStable('0.8.1-develop.7442.1.4c1dbf1f0e')).toBe(false)
    expect(isSemVer('0.8.1-develop.7442.1.4c1dbf1f0e')).toBe(true)
    expect(isSemVer('v1.0.0')).toBe(false)
    expect(lineKeyOf('0.10.1-develop.1')).toBe('0.10')
    expect(isoSeconds('2026-10-09T19:25:40.123Z')).toBe('2026-10-09T19:25:40Z')
    expect(isoSeconds('2026-10-23T06:00:00+02:00')).toBe('2026-10-23T04:00:00Z')
    expect(isoSeconds('nope')).toBeNull()
  })
})
