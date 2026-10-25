// Version helpers for npm data (SemVer 2.0.0 precedence). Small on purpose: the `semver` package ships
// no types and the sources only need parse, compare and stable checks.

export interface Parsed {
  major: number
  minor: number
  patch: number
  pre: (string | number)[]
}

const RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function parseVersion(v: string): Parsed | null {
  const m = RE.exec(v.trim())
  if (!m) return null
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : []
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre }
}

/** `^\d+\.\d+\.\d+$` (spec 4.1 StableSemVer). */
export function isStable(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v)
}

/** `^\d+\.\d+\.\d+(-...)?$` without a `v` prefix or build metadata (spec 4.1 SemVer). */
export function isSemVer(v: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v)
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0
  for (const k of ['major', 'minor', 'patch'] as const) if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1
    if (typeof x === 'number') return -1
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  return 0
}

/** `major.minor` line key of a version (`0.9.0` -> `0.9`). */
export function lineKeyOf(v: string): string | null {
  const p = parseVersion(v)
  return p ? `${p.major}.${p.minor}` : null
}

/** ISO date-time without milliseconds (`2026-10-09T19:25:40Z`), or null when unparsable. */
export function isoSeconds(s: string | Date | null | undefined): string | null {
  if (s === null || s === undefined) return null
  const d = s instanceof Date ? s : new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
