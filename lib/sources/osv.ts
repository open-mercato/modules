// OSV (read only): advisories for the current version of each npm entry (spec 5.2 `querybatch`, 6.2 Supply chain).
import type { SyncRecord } from '../schema/index.ts'
import type { Http } from './http.ts'
import { getJson } from './http.ts'
import { compareVersions, isoSeconds } from './semver.ts'

export const API = 'https://api.osv.dev/v1'
export type Advisory = SyncRecord['advisories'][number]

interface OsvVuln {
  id: string
  published?: string
  modified?: string
  database_specific?: { severity?: string }
  affected?: { package?: { ecosystem?: string; name?: string }; ranges?: { events?: { fixed?: string }[] }[] }[]
}

const SEVERITY: Record<string, Advisory['severity']> = {
  LOW: 'low',
  MODERATE: 'moderate',
  MEDIUM: 'moderate',
  HIGH: 'high',
  CRITICAL: 'critical',
}

/**
 * `version` is the version the advisory was queried for: `fixedIn` is then the lowest fix above it (a fix on
 * another major says nothing about the listed one), or null when no range has one.
 */
export function toAdvisory(v: OsvVuln, pkg: string, version?: string): Advisory {
  const fixes = (v.affected ?? [])
    .filter((a) => a.package?.name === pkg)
    .flatMap((a) => a.ranges ?? [])
    .flatMap((r) => r.events ?? [])
    .map((e) => e.fixed)
    .filter((f): f is string => typeof f === 'string')
  const fixed =
    version === undefined ? fixes[0] : fixes.filter((f) => compareVersions(f, version) > 0).sort(compareVersions)[0]
  return {
    id: v.id,
    // without a GitHub severity the advisory is kept as moderate (shown, does not fail Supply chain alone)
    severity: SEVERITY[(v.database_specific?.severity ?? '').toUpperCase()] ?? 'moderate',
    publishedAt: isoSeconds(v.published ?? v.modified) ?? '1970-01-01T00:00:00Z',
    fixedIn: fixed ?? null,
  }
}

/** Advisories per package for the given versions: one `querybatch`, then `GET /vulns/<id>` per unique ID. */
export async function advisories(
  http: Http,
  queries: { name: string; version: string }[],
): Promise<Map<string, Advisory[]>> {
  const out = new Map<string, Advisory[]>()
  if (queries.length === 0) return out
  const ids = new Map<string, Set<string>>()
  const versions = new Map(queries.map((q) => [q.name, q.version]))
  for (let i = 0; i < queries.length; i += 1000) {
    const chunk = queries.slice(i, i + 1000)
    const res = await getJson<{ results?: { vulns?: { id: string }[] }[] }>(http, `${API}/querybatch`, {
      method: 'POST',
      body: { queries: chunk.map((q) => ({ package: { ecosystem: 'npm', name: q.name }, version: q.version })) },
    })
    chunk.forEach((q, j) => {
      const found = res.results?.[j]?.vulns ?? []
      ids.set(q.name, new Set(found.map((v) => v.id)))
    })
  }
  const unique = [...new Set([...ids.values()].flatMap((s) => [...s]))].sort()
  const details = new Map<string, OsvVuln>()
  await Promise.all(
    unique.map(async (id) => details.set(id, await getJson<OsvVuln>(http, `${API}/vulns/${encodeURIComponent(id)}`))),
  )
  for (const [name, set] of ids)
    out.set(
      name,
      [...set]
        .sort()
        .map((id) => details.get(id))
        .filter((v): v is OsvVuln => !!v)
        .map((v) => toAdvisory(v, name, versions.get(name))),
    )
  return out
}
