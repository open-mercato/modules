// deps.dev v3 (read only): SLSA provenance of a published npm version (spec 6.1 Built from, 4.5 provenance).
import type { SyncRecord } from '../schema/index.ts'
import type { Http } from './http.ts'
import { HttpError } from './http.ts'
import { parseRepoUrl, sameRepo } from './github.ts'

export const API = 'https://api.deps.dev/v3'

export interface VersionProvenance {
  verified: boolean
  sourceRepo: string | null
  commit: string | null
}

export type Provenance = SyncRecord['provenance']

export function versionUrl(name: string, version: string): string {
  return `${API}/systems/npm/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`
}

/** Provenance of one version, or null when deps.dev does not know the version (404). */
export async function versionProvenance(http: Http, name: string, version: string): Promise<VersionProvenance | null> {
  const url = versionUrl(name, version)
  const res = await http.request(url)
  if (res.status === 404) return null
  if (res.status !== 200 || res.json === null) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  const body = res.json as {
    slsaProvenances?: { sourceRepository?: string; commit?: string; verified?: boolean }[]
    attestations?: { sourceRepository?: string; commit?: string; verified?: boolean }[]
  }
  const all = [...(body.slsaProvenances ?? []), ...(body.attestations ?? [])]
  const good = all.find((p) => p.verified === true && p.sourceRepository)
  const any = good ?? all.find((p) => p.sourceRepository)
  return {
    verified: !!good,
    sourceRepo: parseRepoUrl(any?.sourceRepository ?? null),
    commit: any?.commit ?? null,
  }
}

/**
 * SyncRecord.provenance: `verified` when the current version has a verified attestation whose source repository is
 * the entry's repository (when known); `lost` when the previous stable had one and the current has not; else `none`.
 */
export function provenanceStatus(
  current: VersionProvenance | null,
  previous: VersionProvenance | null,
  entryRepo: string | null,
): Provenance {
  const ok = (p: VersionProvenance | null) => !!p && p.verified && (!entryRepo || sameRepo(p.sourceRepo, entryRepo))
  if (ok(current))
    return {
      status: 'verified',
      sourceRepo: current?.sourceRepo ?? null,
      commit: current?.commit ?? null,
      workflow: null,
    }
  if (ok(previous)) return { status: 'lost', sourceRepo: previous?.sourceRepo ?? null, commit: null, workflow: null }
  return { status: 'none', sourceRepo: null, commit: null, workflow: null }
}

/** Recording slimmer: keep only the provenance fields. */
export function slimDepsDev(url: string, json: unknown): unknown {
  if (!url.startsWith(`${API}/systems/npm/packages/`)) return json
  const b = json as Record<string, unknown>
  if (!b || typeof b !== 'object') return json
  return {
    versionKey: b.versionKey,
    publishedAt: b.publishedAt,
    slsaProvenances: b.slsaProvenances ?? [],
    attestations: b.attestations ?? [],
  }
}
