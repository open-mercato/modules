// Typed access to `semver` 7.8.5 (spec 3.3). The package ships no types and `@types/semver` is not a dependency,
// so it is loaded through createRequire with the small surface Fit needs. Node only (lib/fit is not isomorphic).
import { createRequire } from 'node:module'

export interface RangeOptions {
  includePrerelease?: boolean
  loose?: boolean
}

interface SemverApi {
  valid(v: string): string | null
  satisfies(v: string, range: string, opts?: RangeOptions): boolean
  maxSatisfying(versions: readonly string[], range: string, opts?: RangeOptions): string | null
  validRange(range: string, opts?: RangeOptions): string | null
  rcompare(a: string, b: string): number
  compare(a: string, b: string): number
  prerelease(v: string): readonly (string | number)[] | null
  minVersion(range: string): { version: string } | null
}

const api = createRequire(import.meta.url)('semver') as SemverApi

export const valid = (v: string): string | null => api.valid(v)
export const validRange = (r: string): string | null => api.validRange(r)
export const satisfies = (v: string, range: string, opts?: RangeOptions): boolean => {
  try {
    return api.satisfies(v, range, opts)
  } catch {
    return false
  }
}
export const maxSatisfying = (versions: readonly string[], range: string, opts?: RangeOptions): string | null => {
  try {
    return api.maxSatisfying(versions, range, opts)
  } catch {
    return null
  }
}
export const compare = (a: string, b: string): number => api.compare(a, b)
export const rcompare = (a: string, b: string): number => api.rcompare(a, b)
export const isPrerelease = (v: string): boolean => api.prerelease(v) !== null
export const minVersion = (range: string): string | null => {
  try {
    return api.minVersion(range)?.version ?? null
  } catch {
    return null
  }
}
