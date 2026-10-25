// jsDelivr (read only): flat file listing of a published npm version, without downloading the tarball
// (D28; also the discovery filter of spec 5.2: a `src/modules/<id>/index.ts` + `dist/modules/<id>/` pair).
import type { Http } from './http.ts'
import { HttpError } from './http.ts'
import { encodeName } from './npm.ts'

export const DATA_API = 'https://data.jsdelivr.com/v1'

/** Paths (without the leading slash) of every file in `<name>@<version>`. Null on 404. */
export async function listFiles(http: Http, name: string, version: string): Promise<string[] | null> {
  const url = `${DATA_API}/packages/npm/${encodeName(name).replace('%2F', '/')}@${encodeURIComponent(version)}?structure=flat`
  const res = await http.request(url)
  if (res.status === 404) return null
  if (res.status !== 200 || res.json === null) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  const files = (res.json as { files?: { name?: string }[] }).files ?? []
  return files.map((f) => (f.name ?? '').replace(/^\//, '')).filter(Boolean)
}

const ID_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

export interface ModulePairs {
  /** IDs with both `src/modules/<id>/index.ts` and at least one file under `dist/modules/<id>/`. */
  pairs: string[]
  srcOnly: string[]
  distOnly: string[]
}

/** Module directories of a package listing (gate of `module add`, spec 4.3 `kind`). */
export function modulePairs(paths: string[]): ModulePairs {
  const src = new Set<string>()
  const dist = new Set<string>()
  for (const p of paths) {
    const s = /^src\/modules\/([^/]+)\/index\.ts$/.exec(p)
    if (s && ID_RE.test(s[1] as string)) src.add(s[1] as string)
    const d = /^dist\/modules\/([^/]+)\/./.exec(p)
    if (d && ID_RE.test(d[1] as string)) dist.add(d[1] as string)
  }
  return {
    pairs: [...src].filter((id) => dist.has(id)).sort(),
    srcOnly: [...src].filter((id) => !dist.has(id)).sort(),
    distOnly: [...dist].filter((id) => !src.has(id)).sort(),
  }
}

/** Recording slimmer: listings keep only the files under src/modules and dist/modules (what modulePairs reads). */
export function slimListing(url: string, json: unknown): unknown {
  if (!url.startsWith(`${DATA_API}/packages/npm/`)) return json
  const l = json as { files?: { name?: string }[] } & Record<string, unknown>
  if (!l || !Array.isArray(l.files)) return json
  const keep = l.files.filter((f) => /^\/(src|dist)\/modules\//.test(f.name ?? ''))
  const seenDist = new Set<string>()
  // one dist file per module is enough for the pair check
  const files = keep.filter((f) => {
    const d = /^\/dist\/modules\/([^/]+)\//.exec(f.name ?? '')
    if (!d) return /^\/src\/modules\/[^/]+\/index\.ts$/.test(f.name ?? '')
    if (seenDist.has(d[1] as string)) return false
    seenDist.add(d[1] as string)
    return true
  })
  return { type: l.type, name: l.name, version: l.version, files: files.map((f) => ({ name: f.name })) }
}
