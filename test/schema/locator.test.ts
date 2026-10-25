import { describe, expect, it } from 'vitest'
import {
  assertPathMatches,
  descriptorFile,
  descriptorLocator,
  LocatorError,
  locatorToPath,
  pagePath,
  parseLocator,
  pathToLocator,
} from '../../lib/schema/locator.ts'

describe('locator (spec 4.2)', () => {
  it('parses npm and github locators', () => {
    expect(parseLocator('npm:@fastwhitecat/integration-ksef-direct')).toEqual({
      source: 'npm',
      locator: 'npm:@fastwhitecat/integration-ksef-direct',
      name: '@fastwhitecat/integration-ksef-direct',
    })
    expect(parseLocator('github:Chmarusso/open-mercato-enrichment-treg')).toMatchObject({
      source: 'github',
      owner: 'Chmarusso',
      repo: 'open-mercato-enrichment-treg',
    })
    expect(() => parseLocator('@x/y')).toThrow(LocatorError)
  })

  it('maps the three examples of the table to paths and pages', () => {
    expect(descriptorFile('npm:@fastwhitecat/integration-ksef-direct')).toBe(
      'modules/@fastwhitecat/integration-ksef-direct.yml',
    )
    expect(descriptorFile('npm:create-mercato-module')).toBe('modules/create-mercato-module.yml')
    expect(descriptorFile('github:Chmarusso/open-mercato-enrichment-treg')).toBe(
      'modules/github/chmarusso/open-mercato-enrichment-treg.yml',
    )
    expect(pagePath('github:Chmarusso/open-mercato-enrichment-treg')).toBe(
      '/m/github/chmarusso/open-mercato-enrichment-treg',
    )
  })

  it('keeps @a-b/c and @a/b-c apart (flat slugs would collide)', () => {
    const a = locatorToPath('npm:@a-b/c')
    const b = locatorToPath('npm:@a/b-c')
    expect(a).toBe('@a-b/c')
    expect(b).toBe('@a/b-c')
    expect(a).not.toBe(b)
    expect(descriptorFile('npm:@a-b/c')).not.toBe(descriptorFile('npm:@a/b-c'))
  })

  it('round-trips paths; GitHub paths are lower case', () => {
    for (const loc of ['npm:@x/y', 'npm:create-mercato-module', 'github:owner/repo'])
      expect(pathToLocator(locatorToPath(loc))).toBe(loc)
    expect(pathToLocator(locatorToPath('github:Chmarusso/Repo'))).toBe('github:chmarusso/repo')
    expect(() => pathToLocator('github/Chmarusso/x')).toThrow(LocatorError)
  })

  it('prefers npm over github in a descriptor', () => {
    expect(descriptorLocator({ npm: '@x/y', github: 'o/r' })).toBe('npm:@x/y')
    expect(descriptorLocator({ github: 'o/r' })).toBe('github:o/r')
    expect(() => descriptorLocator({})).toThrow('npm or github is required')
  })

  it('asserts that the file path matches the locator', () => {
    const d = { npm: '@fastwhitecat/integration-ksef-direct', github: 'FastWhiteCat/openmercato-module-ksef' }
    expect(() => assertPathMatches('modules/@fastwhitecat/integration-ksef-direct.yml', d)).not.toThrow()
    expect(() => assertPathMatches('/repo/modules/@fastwhitecat/integration-ksef-direct.yml', d)).not.toThrow()
    expect(() => assertPathMatches('modules/fastwhitecat-integration-ksef-direct.yml', d)).toThrow(LocatorError)
    expect(() =>
      assertPathMatches('modules/github/Chmarusso/open-mercato-enrichment-treg.yml', {
        github: 'Chmarusso/open-mercato-enrichment-treg',
      }),
    ).toThrow(LocatorError)
  })
})
