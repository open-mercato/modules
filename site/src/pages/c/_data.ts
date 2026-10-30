// Page helpers shared by `/`, `/c/*`, `/m/*`, `/r/*` and `/404` (WP12). The underscore keeps the file out of routing.
// Isomorphic (no Node API): the Registry island imports it too.
import type { CellSummary, IndexEntry, Line } from '../../../../lib/schema/index.ts'
import { catalogSkipText, otherVersionCells } from '../../../../lib/core/policy.ts'

type ReceiptLike = { id: string; run: { attempt?: number | null }; transition?: { confirmed?: boolean } }

/**
 * One record per receipt id. `collect` appends a confirmation (the retry) under the same id as the first record
 * (spec 4.5), so a list can hold the same receipt twice, in either order (data files are oldest first, the
 * published module receipts newest first). The record of the later attempt wins, then the confirmed one; the
 * position of the first appearance is kept.
 */
export function uniqueReceipts<T extends ReceiptLike>(list: readonly T[]): T[] {
  const rank = (r: T): number => (r.run.attempt ?? 0) * 2 + (r.transition?.confirmed ? 1 : 0)
  const byId = new Map<string, T>()
  for (const r of list) {
    const seen = byId.get(r.id)
    if (!seen || rank(r) >= rank(seen)) byId.set(r.id, r)
  }
  return [...byId.values()]
}

/**
 * A category title inside a sentence (live review of 30 Oct: `1 module for crm & sales`): words in lower case, an
 * acronym (`CRM`, `AI`) as it is.
 */
export function categoryInSentence(title: string): string {
  return title.replace(/[A-Za-z]+/g, (w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))
}

/** Held states that the registry hides behind its switch (6.4). */
export const HELD_STATES: ReadonlySet<string> = new Set(['hold', 'unmaintained', 'deprecated', 'archived', 'stale'])

/**
 * The default set of the registry, the Hive and every "N modules" on the site: listed modules and providers without
 * the `example` tag (7.5, 7.7 A.4). One definition, so the hero, the registry, the legend and the 404 agree.
 */
export function registryDefault<T extends Pick<IndexEntry, 'listed' | 'kind' | 'tags' | 'status'>>(
  entries: readonly T[],
): T[] {
  return entries.filter(
    (e) =>
      e.listed &&
      !HELD_STATES.has(e.status) &&
      (e.kind === 'module' || e.kind === 'provider') &&
      !e.tags.includes('example'),
  )
}

/**
 * Why the nightly run never installs this entry (spec 5.3: only `kind: module` rows, enterprise needs flags), or
 * null when it does. Such lines are `skipped`, not `untested`.
 */
export function catalogSkip(entry: Pick<IndexEntry, 'enterprise' | 'kind'>): string | null {
  // the words of the agent policy (lib/core/policy.ts), so the strip and the reason never part
  return catalogSkipText(entry)
}

/**
 * The entry's compat with `skipped` on every line that has no cell, for entries the nightly run never installs, and
 * on the lines the signals mark skipped (a preview-only release has no stable version for 0.8 and 0.9), so the
 * module page, the registry and /compat say the same thing per line.
 */
export function withSkipped<T extends Pick<IndexEntry, 'enterprise' | 'kind' | 'compat'>>(
  entry: T,
  lines: readonly Pick<Line, 'key' | 'version'>[],
): T {
  const signal = (entry as { signals?: { receipt?: Record<string, string> } }).signals?.receipt ?? {}
  const all = !!catalogSkip(entry)
  const filled: Record<string, CellSummary> = { ...entry.compat.lines }
  let changed = false
  for (const l of lines) {
    if (filled[l.key] || !(all || signal[l.key] === 'skipped')) continue
    changed = true
    filled[l.key] = {
      status: 'skipped',
      step: null,
      omVersion: l.version,
      moduleVersion: null,
      at: null,
      receipt: null,
      since: null,
      precheck: null,
      patches: [],
    }
  }
  return changed ? { ...entry, compat: { ...entry.compat, lines: filled } } : entry
}

/** True when the policy says the catalog cannot install this entry at all (no src/dist pair, no pinned tag). */
export function cannotInstall(entry: Pick<IndexEntry, 'agentPolicy'>): boolean {
  return Object.values(entry.agentPolicy).some((p) =>
    p.reasons.some((r) => r.code === 'NOT_INSTALLABLE' || r.code === 'UNPINNED_GIT'),
  )
}

const escHtml = (s: string): string => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/**
 * HTML of an identifier that wraps only at token boundaries: after `_`, `/` and `-`, before `.` and `:`. A table
 * name, an event or an extension target never breaks inside a word.
 */
export function idWrapHtml(text: string): string {
  return escHtml(text)
    .replace(/([_/-])(?=[^\s])/g, '$1<wbr>')
    .replace(/(?<=[^\s])([.:])/g, '<wbr>$1')
}

/**
 * Column spans of cells laid out in order in a grid of `cols` columns: a cell asks for 1 or 2, a cell that does not
 * fit the rest of its row moves down and the cell before it takes the rest, and the last row ends at the edge.
 */
export function rowSpans(
  ids: readonly string[],
  want: Readonly<Record<string, number>>,
  cols: number,
): Record<string, number> {
  const out: Record<string, number> = {}
  let col = 0
  let prev: string | null = null
  for (const id of ids) {
    const n = Math.min(cols, want[id] ?? 1)
    if (col + n > cols && prev) {
      out[prev] = (out[prev] ?? 1) + (cols - col)
      col = 0
    }
    out[id] = n
    col += n
    if (col >= cols) col = 0
    prev = id
  }
  if (col > 0 && prev) out[prev] = (out[prev] ?? 1) + (cols - col)
  return out
}

// ---------- module browser (home and /c/*, the nuxt.com/modules style of 26 Oct) ----------

/**
 * Words for the origin of an entry: the `Made by` filter, the quiet chip on a card and its hint. The hints say what
 * the sync computes (policy/community.yml): official is the @open-mercato scope, community is a member of the
 * open-mercato org or a certified partner, third-party is anyone else.
 */
export const MADE_BY: readonly { id: IndexEntry['type']; label: string; hint: string }[] = [
  { id: 'official', label: 'Official', hint: 'Made by the Open Mercato team.' },
  { id: 'community', label: 'Community', hint: 'Made by Open Mercato team members and certified partners.' },
  { id: '3rd-party', label: 'Third-party', hint: 'Made by other authors.' },
]
export const madeByLabel = (type: IndexEntry['type']): string => MADE_BY.find((m) => m.id === type)?.label ?? type
export const madeByHint = (type: IndexEntry['type']): string => MADE_BY.find((m) => m.id === type)?.hint ?? ''

/** Tools and libraries: shown behind `Show more`, never in the default set. */
export const isToolKind = (e: Pick<IndexEntry, 'kind'>): boolean => e.kind === 'tool' || e.kind === 'library'

/**
 * The set of the browser: the default set (registryDefault) plus listed tools and libraries without the `example` tag
 * and outside the held states. Examples and held entries are behind their own switch (extraOf).
 */
export function browserSet<T extends Pick<IndexEntry, 'listed' | 'kind' | 'tags' | 'status'>>(
  entries: readonly T[],
): T[] {
  const base = new Set(registryDefault(entries))
  return entries.filter(
    (e) => base.has(e) || (e.listed && isToolKind(e) && !HELD_STATES.has(e.status) && !e.tags.includes('example')),
  )
}

/** Why an entry outside the browser set is hidden by default: `On hold`, `Example` or `Not listed`; null inside it. */
export function extraOf(e: Pick<IndexEntry, 'listed' | 'kind' | 'tags' | 'status'>): string | null {
  if (browserSet([e]).length > 0) return null
  if (HELD_STATES.has(e.status) || e.status === 'delisted') return 'On hold'
  if (e.tags.includes('example')) return 'Example'
  return 'Not listed'
}

type Grouped = Pick<IndexEntry, 'locator' | 'kind' | 'requires' | 'listed' | 'tags' | 'status'>

/**
 * Providers that plug into a library or a module of the browser set (the seven web-research adapters): provider
 * locator to parent locator. A person sees one card for the parent, `7 providers`, and finds the adapters by search.
 */
export function providerParents<T extends Grouped>(entries: readonly T[]): Map<string, string> {
  const set = new Map(browserSet(entries).map((e) => [e.locator, e]))
  const out = new Map<string, string>()
  for (const e of registryDefault(entries)) {
    if (e.kind !== 'provider') continue
    const parent = e.requires
      .map((r) => r.resolvesTo)
      .find((l): l is string => !!l && !!set.get(l) && set.get(l)!.kind !== 'provider')
    if (parent) out.set(e.locator, parent)
  }
  return out
}

/**
 * The modules a person browses by default, the one count of every page for people (home, /c/*, 404, the note on
 * /compat): registryDefault, with grouped providers folded into their parent card.
 */
export function browseDefault<T extends Grouped>(entries: readonly T[]): T[] {
  const parents = providerParents(entries)
  const parentSet = new Set(parents.values())
  const def = new Set(registryDefault(entries))
  return entries.filter((e) => parentSet.has(e.locator) || (def.has(e) && !parents.has(e.locator)))
}

/** Who made it, in a few words: Open Mercato for official entries, else the npm scope, else the GitHub owner. */
export function authorOf(e: Pick<IndexEntry, 'type' | 'npm' | 'github'>): string | null {
  if (e.type === 'official') return 'Open Mercato'
  const scope = e.npm?.match(/^@([^/]+)\//)?.[1]
  if (scope) return scope
  const owner = e.github?.split('/')[0]
  return owner || null
}

export type CardStateKind = 'preset' | 'works' | 'broken' | 'untested' | 'enterprise'

/**
 * The one state of a card, the same five words on every card (review of 26 Oct: a broken module looked healthy on
 * its card): a new app of the latest line has it, a receipt verified it there, a receipt broke on it there, or nothing
 * judged it yet. The module page says the same in its pill.
 */
export function cardState(
  e: IndexEntry,
  latest: Pick<Line, 'key' | 'version'> | null,
): { kind: CardStateKind; text: string; title: string } {
  if (e.enterprise)
    return { kind: 'enterprise', text: 'Enterprise license', title: 'Needs an Open Mercato Enterprise subscription.' }
  const key = latest?.key ?? null
  const v = latest ? `Open Mercato ${latest.version}, the latest version` : 'the latest Open Mercato version'
  if (key && e.compat.inPresets?.includes(key))
    return { kind: 'preset', text: 'Comes with new apps', title: `Every new app on ${v} already has it.` }
  if (key && e.compat.verifiedOn.includes(key))
    return { kind: 'works', text: 'Works on latest', title: `The install test passed on ${v}.` }
  const broken = !!key && e.compat.lines[key]?.status === 'broken' && !otherVersionCells(e)[key]
  if (broken) return { kind: 'broken', text: 'Not working on latest', title: `The install test failed on ${v}.` }
  // an entry the nightly run never installs (a provider, a library) is not waiting for a test: the page's own words
  if (catalogSkip(e)) return { kind: 'untested', text: 'Not tested', title: catalogSkip(e)! }
  return { kind: 'untested', text: 'Not tested yet', title: `No install test on ${v} yet.` }
}

/** `950`, `1.2k`, `12k`, `1.3M`. */
export function compactCount(n: number): string {
  const short = (v: number, unit: string): string => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`
  if (n >= 1_000_000) return short(n / 1_000_000, 'M')
  if (n >= 1_000) return short(n / 1_000, 'k')
  return String(n)
}

/** Downloads per month (else GitHub stars above zero) as a short number, its icon and a sentence for screen readers. */
export function popularity(
  e: Pick<IndexEntry, 'stats'>,
): { text: string; icon: 'download' | 'star'; label: string } | null {
  const d = e.stats?.downloads30d
  if (d != null)
    return {
      text: compactCount(d),
      icon: 'download',
      label: `${d.toLocaleString('en-US')} downloads in the last 30 days`,
    }
  const s = e.stats?.stars
  if (s) return { text: compactCount(s), icon: 'star', label: `${s} GitHub ${s === 1 ? 'star' : 'stars'}` }
  return null
}

/**
 * Recommended order (review of 26 Oct: third-party and broken modules stood on top): featured, then the ones that
 * work on the latest line, then the untested, broken last; within each, official first, then downloads, then the title.
 */
export function recommended<T extends Pick<IndexEntry, 'featured' | 'compat' | 'stats' | 'type' | 'title'>>(
  entries: readonly T[],
  latestKey: string | null,
): T[] {
  const health = (e: T): number =>
    latestKey && (e.compat.verifiedOn.includes(latestKey) || e.compat.inPresets?.includes(latestKey))
      ? 0
      : latestKey && e.compat.lines[latestKey]?.status === 'broken'
        ? 2
        : 1
  const dl = (e: T): number => e.stats?.downloads30d ?? -1
  return [...entries].sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      health(a) - health(b) ||
      Number(b.type === 'official') - Number(a.type === 'official') ||
      dl(b) - dl(a) ||
      a.title.localeCompare(b.title),
  )
}
