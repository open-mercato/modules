// Load-bearing API map (spec 1.1 pkt 3, 4.6 `/surface.json`): which OM symbols the modules outside the
// `@open-mercato` scope import, and how many of them use each one (g2: createRequestContainer 15 of 16).
import type { Surface } from '../schema/index.ts'
import { symbolKey } from './drift.ts'
import type { ImportMap } from './static.ts'
import { isLookupSymbol } from './static.ts'

export interface SurfaceModule {
  locator: string
  imports: ImportMap
}

/** Locators of official packages (scope `@open-mercato`) are not part of the surface. */
export const isOfficialScope = (locator: string): boolean => locator.startsWith('npm:@open-mercato/')

/** Symbol keys (`pkg/subpath#Name`) a module looks up in `@open-mercato/*` packages. */
export function usedSymbols(imports: ImportMap): Set<string> {
  const out = new Set<string>()
  for (const [pkg, subs] of Object.entries(imports)) {
    if (!pkg.startsWith('@open-mercato/')) continue
    for (const [subpath, symbols] of Object.entries(subs))
      for (const s of symbols) if (isLookupSymbol(s)) out.add(symbolKey(pkg, subpath, s.split('.')[0] as string))
  }
  return out
}

/** Modules counted by the surface: outside the `@open-mercato` scope, with at least one OM symbol import. */
export function externalModules(mods: readonly SurfaceModule[]): SurfaceModule[] {
  return mods.filter((m) => !isOfficialScope(m.locator) && usedSymbols(m.imports).size > 0)
}

/**
 * `/surface.json`: every OM symbol used by external modules, most used first (ties by symbol). `minModules`
 * drops symbols used by fewer modules (the 60 KB budget: 16 packages and 341 symbols already take 54.6 KB).
 */
export function buildSurface(
  mods: readonly SurfaceModule[],
  base: string,
  generatedAt: string,
  opts: { minModules?: number } = {},
): Surface {
  const ext = externalModules(mods)
  const users = new Map<string, Set<string>>()
  for (const m of ext)
    for (const key of usedSymbols(m.imports)) {
      const set = users.get(key) ?? new Set<string>()
      set.add(m.locator)
      users.set(key, set)
    }
  const symbols = [...users.entries()]
    .map(([symbol, set]) => ({ symbol, modules: [...set].sort() }))
    .filter((x) => x.modules.length >= (opts.minModules ?? 1))
    .sort((a, b) => b.modules.length - a.modules.length || a.symbol.localeCompare(b.symbol))
  return {
    schemaVersion: 1,
    generatedAt,
    base,
    externalPackages: new Set(ext.map((m) => m.locator)).size,
    symbols,
  }
}

/** Top symbols for the radar (`createRequestContainer · 15 of 16`). */
export function loadBearing(surface: Surface, top = 15): { symbol: string; modules: number; of: number }[] {
  return surface.symbols
    .slice(0, top)
    .map((s) => ({ symbol: s.symbol, modules: s.modules.length, of: surface.externalPackages }))
}
