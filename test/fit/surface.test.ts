import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Surface } from '../../lib/schema/index.ts'
import { buildSurface, externalModules, isOfficialScope, loadBearing, usedSymbols } from '../../lib/fit/surface.ts'
import { FIT_FIXTURES } from './helpers.ts'

interface Pkg {
  set: string
  locator: string
  version: string
  imports: Record<string, Record<string, string[]>>
}
const pkgs = (JSON.parse(readFileSync(join(FIT_FIXTURES, 'g2-imports.json'), 'utf8')) as { packages: Pkg[] }).packages

describe('surface on the g2 packages', () => {
  const surface = buildSurface(pkgs, '0.9.0', '2026-10-23T00:00:00.000Z')

  it('counts the 16 packages outside @open-mercato and 341 symbols', () => {
    expect(Surface.parse(surface)).toEqual(surface)
    expect(surface.externalPackages).toBe(16)
    expect(surface.symbols).toHaveLength(341)
  })

  it('createRequestContainer is used by 15 of 16', () => {
    expect(loadBearing(surface, 4)).toEqual([
      { symbol: '@open-mercato/shared/lib/di/container#createRequestContainer', modules: 15, of: 16 },
      { symbol: '@open-mercato/shared/lib/di/container#AppContainer', modules: 13, of: 16 },
      { symbol: '@open-mercato/shared/modules/setup#ModuleSetupConfig', modules: 12, of: 16 },
      { symbol: '@open-mercato/shared/modules/registry#ModuleInfo', modules: 11, of: 16 },
    ])
  })

  it('stays within the 60 KB budget of /surface.json', () => {
    expect(JSON.stringify(surface).length).toBeLessThan(60 * 1024)
    const trimmed = buildSurface(pkgs, '0.9.0', '2026-10-23T00:00:00.000Z', { minModules: 2 })
    expect(trimmed.externalPackages).toBe(16)
    expect(trimmed.symbols.every((x) => x.modules.length >= 2)).toBe(true)
    expect(trimmed.symbols.length).toBeLessThan(341)
  })

  it('leaves out official packages, star imports, side effects and modules without OM imports', () => {
    expect(isOfficialScope('npm:@open-mercato/gateway-stripe')).toBe(true)
    expect(isOfficialScope('npm:create-mercato-module')).toBe(false)
    expect([
      ...usedSymbols({
        '@open-mercato/ui': { '.': ['*', '(side-effect)', 'Button', 'Ns.Type'] },
        react: { '.': ['useState'] },
      }),
    ]).toEqual(['@open-mercato/ui#Button', '@open-mercato/ui#Ns'])
    expect(
      externalModules([
        { locator: 'npm:tool', imports: {} },
        { locator: 'npm:@open-mercato/x', imports: { '@open-mercato/ui': { '.': ['A'] } } },
        { locator: 'npm:@a/b', imports: { '@open-mercato/ui': { '.': ['A'] } } },
      ]).map((m) => m.locator),
    ).toEqual(['npm:@a/b'])
  })
})
