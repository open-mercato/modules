// Resolving a `Ref` of tools@1 (locator | npm name | locpath | module ID) to an entry or a built-in module.
// Isomorphic: no Node APIs.
import type { IndexEntry } from '../schema/published/modules.ts'

export interface BuiltInRef {
  id: string
  title: string
  /** Lines whose new app (classic) has it on (`built-in.json` `inPresets`). */
  inPresets?: readonly string[]
  /** Lines whose app from the empty preset has it on too (`built-in.json` `inEmptyPreset`). */
  inEmptyPreset?: readonly string[]
}

export type Resolved<E, B> =
  | { kind: 'entry'; entry: E; candidates: string[] }
  | { kind: 'builtin'; builtIn: B; candidates: string[] }
  | { kind: 'none'; candidates: string[] }

type RefEntry = Pick<IndexEntry, 'locator' | 'path' | 'npm' | 'moduleIds' | 'renamedFrom' | 'type' | 'tier'>

const norm = (s: string) => s.trim().toLowerCase()

/** Name without a trailing `@<version>` (`@x/y@1.2.3` -> `@x/y`). */
export function stripVersion(ref: string): { name: string; version: string | null } {
  const m = /^(.+?)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(ref.trim())
  return m ? { name: m[1] as string, version: m[2] as string } : { name: ref.trim(), version: null }
}

function rankEntry(e: RefEntry): number {
  return (e.type === 'official' ? 0 : 2) + (e.tier === 'verified' ? 0 : 1)
}

/**
 * Resolves a ref. A module ID that is also a built-in resolves to the built-in (built-in first); entries that
 * share the ID are returned as candidates. Several entries with one ID and no built-in: `none` + candidates.
 */
export function resolveRef<E extends RefEntry, B extends BuiltInRef>(
  ref: string,
  entries: readonly E[],
  builtIn: readonly B[] = [],
): Resolved<E, B> {
  const { name } = stripVersion(ref)
  const r = norm(name)
  const direct = entries.find(
    (e) =>
      norm(e.locator) === r ||
      (e.npm !== null && norm(e.npm) === r) ||
      norm(e.path) === r ||
      norm(`/m/${e.path}`) === r ||
      e.renamedFrom.some((x) => norm(x) === r || norm(x) === `npm:${r}`),
  )
  if (direct) return { kind: 'entry', entry: direct, candidates: [] }
  const ghPath = r.startsWith('github:') ? `github/${r.slice(7)}` : r.replace(/^https:\/\/github\.com\//, 'github/')
  const gh = entries.find((e) => norm(e.path) === ghPath)
  if (gh) return { kind: 'entry', entry: gh, candidates: [] }

  const id = r.replace(/^core:/, '')
  const byId = entries.filter((e) => e.moduleIds.includes(id)).sort((a, b) => rankEntry(a) - rankEntry(b))
  const bi = builtIn.find((b) => b.id === id)
  if (bi) return { kind: 'builtin', builtIn: bi, candidates: byId.map((e) => e.locator).slice(0, 10) }
  if (byId.length === 1) return { kind: 'entry', entry: byId[0] as E, candidates: [] }
  if (byId.length > 1) return { kind: 'none', candidates: byId.map((e) => e.locator).slice(0, 10) }

  const loose = entries
    .filter(
      (e) =>
        r.length >= 3 && (norm(e.locator).includes(r) || e.moduleIds.some((m) => m.includes(r.replace(/-/g, '_')))),
    )
    .sort((a, b) => rankEntry(a) - rankEntry(b))
  return { kind: 'none', candidates: loose.map((e) => e.locator).slice(0, 10) }
}

export class RefError extends Error {
  readonly ref: string
  readonly candidates: string[]
  constructor(ref: string, candidates: string[]) {
    super(
      candidates.length > 0
        ? `Unknown module "${ref.slice(0, 80)}". Did you mean: ${candidates.join(', ')}?`
        : `Unknown module "${ref.slice(0, 80)}".`,
    )
    this.ref = ref
    this.candidates = candidates
  }
}
