// Isomorphic access to `semver` (spec 3.3): function modules only, no Node APIs, never throws.
import semverCompare from 'semver/functions/compare.js'
import semverPrerelease from 'semver/functions/prerelease.js'
import semverSatisfies from 'semver/functions/satisfies.js'
import semverValid from 'semver/functions/valid.js'

const STABLE = /^\d+\.\d+\.\d+$/

/** Valid SemVer 2.0.0 version (prerelease allowed, no `v` prefix, no build metadata). */
export function isVersion(v: string): boolean {
  try {
    return semverValid(v) === v
  } catch {
    return false
  }
}

export function isStable(v: string): boolean {
  return STABLE.test(v)
}

export function isPrerelease(v: string): boolean {
  try {
    return semverPrerelease(v) !== null
  } catch {
    return false
  }
}

/** Ascending comparison; invalid versions sort first, ties by string. */
export function compareVersions(a: string, b: string): number {
  const va = isVersion(a)
  const vb = isVersion(b)
  if (va && vb) return semverCompare(a, b)
  if (va !== vb) return va ? 1 : -1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Highest version of a list, or null. */
export function maxVersion(versions: readonly string[]): string | null {
  let best: string | null = null
  for (const v of versions) if (best === null || compareVersions(v, best) > 0) best = v
  return best
}

/**
 * Range check with prereleases included (an Open Mercato develop snapshot counts as its own version).
 * An invalid range or version is `false`, never an exception.
 */
export function satisfiesRange(version: string, range: string): boolean {
  try {
    return semverSatisfies(version, range, { includePrerelease: true })
  } catch {
    return false
  }
}
