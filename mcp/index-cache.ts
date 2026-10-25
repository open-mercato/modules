// Catalog data for the MCP Worker and WebMCP (spec 8.3, 8.4): `modules.json` and `built-in.json` from the site,
// fetched with `cf: { cacheTtl: 600 }` and kept in memory for 10 minutes; the search index is built once per load
// with the same lib/core function the site uses. Other site files (module details, cards, changes) are fetched on
// demand with the same cache rules. Isomorphic: Web APIs only (Workers, browsers, Node 24).
import { coreLineOf } from '../lib/core/plan.ts'
import { buildSearchIndex, loadSearchIndex, type Searcher } from '../lib/core/search.ts'
import type { LineInfo, PresetModule } from '../lib/core/lines.ts'

/** A line of the catalog: the core's LineInfo plus the preset lists modules.json publishes (24 Oct). */
export type CatalogLine = LineInfo & {
  presets?: { classic: readonly PresetModule[] | null; empty: readonly PresetModule[] }
}
import type { Change } from '../lib/schema/data/changes.ts'
import { BuiltInIndex } from '../lib/schema/published/builtin.ts'
import { ChangesFile } from '../lib/schema/published/misc.ts'
import { ModulesIndex } from '../lib/schema/published/modules.ts'

/** Memo lifetime in the isolate (spec 8.3: 10 minutes) and the edge cache TTL in seconds. */
export const CACHE_TTL_MS = 10 * 60 * 1000
export const EDGE_TTL_S = 600
/** Most per-path entries kept in memory (module details, cards). */
const PATH_MEMO_MAX = 64

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type CfInit = RequestInit & { cf?: { cacheTtl?: number; cacheEverything?: boolean } }

export interface Catalog {
  index: ModulesIndex
  builtIn: BuiltInIndex | null
  searcher: Searcher
  /** Site root without a trailing slash (`ModulesIndex.site`). */
  site: string
  lines: CatalogLine[]
  /** Line key of the core version of the built-in data. */
  coreLine: string | undefined
  /** Date.now() of the load. */
  loadedAt: number
}

export interface CatalogSource {
  /** The catalog (memoized; a failed refresh keeps serving the last good copy). */
  catalog(): Promise<Catalog>
  /** `/changes.json` (90 days), memoized like the catalog. */
  changes(): Promise<Change[]>
  /** A site file next to `modules.json` as text, or null on 404. `path` is site-relative, e.g. `m/@x/y.md`. */
  text(path: string): Promise<string | null>
  /** A site JSON file, or null on 404. */
  json(path: string): Promise<unknown>
  /** Absolute URL of a site-relative path. */
  url(path: string): string
}

export interface SourceOptions {
  /** URL of `/modules.json` (wrangler var MODULES_INDEX_URL). */
  indexUrl: string
  /** URL of `/built-in.json` (BUILTIN_INDEX_URL); default: next to `modules.json`. */
  builtInUrl?: string
  fetch?: FetchLike
  ttlMs?: number
  clock?: () => number
}

export class CatalogUnavailable extends Error {}

const SAFE_PATH = /^[A-Za-z0-9@._\-/]+$/

/** Directory URL of `modules.json` (with a trailing slash). */
export function baseOf(indexUrl: string): string {
  const u = new URL(indexUrl)
  u.search = ''
  u.hash = ''
  u.pathname = u.pathname.replace(/[^/]*$/, '')
  return u.toString()
}

interface Memo<T> {
  value: T | null
  at: number
  pending: Promise<T> | null
}

export function createCatalogSource(o: SourceOptions): CatalogSource {
  const doFetch: FetchLike = o.fetch ?? ((input, init) => fetch(input, init))
  const ttl = o.ttlMs ?? CACHE_TTL_MS
  const clock = o.clock ?? (() => Date.now())
  const base = baseOf(o.indexUrl)
  const url = (path: string): string => {
    const p = path.replace(/^\/+/, '')
    if (!SAFE_PATH.test(p) || p.split('/').includes('..')) throw new Error(`Unsafe path: ${path.slice(0, 80)}`)
    return new URL(p, base).toString()
  }
  const init: CfInit = { cf: { cacheTtl: EDGE_TTL_S, cacheEverything: true }, headers: { accept: '*/*' } }

  async function get(target: string): Promise<Response | null> {
    const res = await doFetch(target, init)
    if (res.status === 404) return null
    if (!res.ok) throw new CatalogUnavailable(`${target} answered ${res.status}`)
    return res
  }

  function memoized<T>(load: () => Promise<T>): () => Promise<T> {
    const m: Memo<T> = { value: null, at: 0, pending: null }
    return async () => {
      const now = clock()
      if (m.value !== null && now - m.at < ttl) return m.value
      if (!m.pending) {
        m.pending = load()
          .then((v) => {
            m.value = v
            m.at = clock()
            return v
          })
          .finally(() => {
            m.pending = null
          })
      }
      try {
        return await m.pending
      } catch (err) {
        if (m.value !== null) return m.value // stale beats nothing
        throw err instanceof CatalogUnavailable ? err : new CatalogUnavailable(String((err as Error).message ?? err))
      }
    }
  }

  const catalog = memoized<Catalog>(async () => {
    const [ir, br] = await Promise.all([get(o.indexUrl), get(o.builtInUrl ?? url('built-in.json'))])
    if (!ir) throw new CatalogUnavailable(`${o.indexUrl} not found`)
    const parsed = ModulesIndex.safeParse(await ir.json())
    if (!parsed.success) throw new CatalogUnavailable('modules.json does not match schema modules-1')
    const index = parsed.data
    const bi = br ? BuiltInIndex.safeParse(await br.json()) : null
    const builtIn = bi?.success ? bi.data : null
    // the preset lists of each line (modules.json `lines[].presets`, 24 Oct) go along, plan_install plans with them
    const lines: CatalogLine[] = index.lines.map((l) => ({
      key: l.key,
      version: l.version,
      source: l.source,
      ...(l.presets ? { presets: l.presets } : {}),
    }))
    const site = index.site.replace(/\/+$/, '')
    // same input as the published /search-index.json: listed entries only (WP09 deviation 12)
    const searcher = loadSearchIndex(
      buildSearchIndex({
        entries: index.entries.filter((e) => e.listed),
        builtIn: builtIn?.modules ?? [],
        lines,
        dataVersion: index.dataVersion,
        generatedAt: index.generatedAt,
        site,
        receiptSource: index.dataAsOf.source ?? null,
      }),
    )
    const coreVersion = builtIn?.coreVersion ?? index.builtIn.coreVersion
    return {
      index,
      builtIn,
      searcher,
      site,
      lines,
      coreLine: coreLineOf(coreVersion, lines) ?? undefined,
      loadedAt: clock(),
    }
  })

  const changes = memoized<Change[]>(async () => {
    const r = await get(url('changes.json'))
    if (!r) return []
    const parsed = ChangesFile.safeParse(await r.json())
    if (!parsed.success) throw new CatalogUnavailable('changes.json does not match its schema')
    return parsed.data
  })

  const paths = new Map<string, { at: number; value: string | null }>()
  async function text(path: string): Promise<string | null> {
    const target = url(path)
    const hit = paths.get(target)
    if (hit && clock() - hit.at < ttl) return hit.value
    const r = await get(target)
    const value = r ? await r.text() : null
    paths.set(target, { at: clock(), value })
    if (paths.size > PATH_MEMO_MAX) paths.delete(paths.keys().next().value as string)
    return value
  }

  return {
    catalog,
    changes,
    text,
    async json(path: string): Promise<unknown> {
      const t = await text(path)
      return t === null ? null : (JSON.parse(t) as unknown)
    },
    url,
  }
}
