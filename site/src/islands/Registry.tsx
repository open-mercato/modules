// Registry (spec 7.6, 7.7 A.4, G): the list of modules. The server renders it with the default filters, so the list
// works without JavaScript; once hydrated it adds filters, sorting, the search from the Ask bar and keeps all of it
// in the URL (`?q=&cat=&type=&kind=&on=&tier=&lic=&held=&examples=&sort=`, history.replaceState).
// Rows are the WP11 ModuleRow, fed a slim projection of IndexEntry (only the fields a row and the filters read), so
// the island props stay small.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { renderSigil, sigilLabel } from '../../../lib/sigil/sigil.ts'
import type { BuiltInCard, ModuleCard } from '../../../lib/schema/tools.ts'
import type { IndexEntry, Line } from '../../../lib/schema/index.ts'
import ModuleRow, { ModuleRowHead } from './ModuleRow.tsx'
import { CommandChipView, Icon, Square, TypeChipView, Wrap } from '../lib/ui.tsx'
import { ISOLATION_MARK, ISO_DIFFERS, STATE_LEGEND, isoMark, isolationDot, markOf } from '../lib/status.ts'
import { PREVIEW_CHIP } from '../../../lib/core/source.ts'
import { EMPTY_PRESET_LEAD, lineVersion } from '../../../lib/core/policy.ts'
import type { Others } from '../lib/status.ts'
import { unpackEntry, type PackedEntry } from '../lib/registry-pack.ts'
import { builtInPage, href } from '../lib/url.ts'
import { HELD_STATES, cannotInstall, catalogSkip, withSkipped } from '../pages/c/_data.ts'
import { QUERY_EVENT, RESULTS_EVENT, askQuery, heldMatchText, loadSearcher, readQueryParam } from './AskBar.tsx'
import type { QueryDetail, ResultsDetail } from './AskBar.tsx'

/** The fields of an IndexEntry that a row, the filters and the sort read. */
export type RegistryEntry = Pick<
  IndexEntry,
  | 'locator'
  | 'path'
  | 'npm'
  | 'github'
  | 'kind'
  | 'type'
  | 'enterprise'
  | 'title'
  | 'summary'
  | 'category'
  | 'tags'
  | 'status'
  | 'listed'
  | 'featured'
  | 'license'
  | 'tier'
  | 'quality'
  | 'sigil'
> & {
  version: Pick<IndexEntry['version'], 'publishedAt' | 'recommended'>
  compat: {
    lines: Record<string, Pick<IndexEntry['compat']['lines'][string], 'status' | 'at' | 'step'>>
    verifiedOn: string[]
    /** Lines whose new app (classic) already registers the package: nothing to install there. */
    inPresets?: string[]
    /** Lines whose app from the empty preset registers it too: nothing to install in either app. */
    inEmptyPreset?: string[]
    /**
     * The signal `in isolation` per line (an app from the empty preset): the dot beside the square, never its state.
     * `named`: its receipt is about another version than the line's main one (`lineVersion`), so the row's label names
     * it, as the card and /compat do (review of 24 Oct).
     */
    isolation?: Record<
      string,
      Pick<IndexEntry['compat']['lines'][string], 'status' | 'at' | 'step' | 'moduleVersion'> & { named: boolean }
    >
  }
  /** The sigil's aria-label, computed in the build (review r3: the 16 anatomy counts per row weighed more than the
   * row; the HTML of / has a 60 KB budget). */
  anatomyLabel: string
  install: Pick<IndexEntry['install'], 'cli'>
  links: Pick<IndexEntry['links'], 'npm' | 'repo'>
  /**
   * Why the strip column has no squares before any receipt: `skip` (the nightly run never installs this kind,
   * 5.3) or `cannot` (no src/dist pair, no pinned tag). Rows print one word instead (`Not run`, `Can't install`);
   * WP11's SignalStrip prints `Queued` for the rest.
   */
  idle: 'skip' | 'cannot' | null
  /** Listed while the latest-line square is green: the first failed VER rule (`levelNote`, review r3). */
  levelNote?: string
  /** Lines whose receipt judged another version (review r6): outlined squares with the sentence as their label. */
  others?: Others
}

/**
 * Build-time projection for the island props. Entries the nightly run never installs, and entries it cannot
 * install, get `skipped` lines (5.3), so their rows draw no squares instead of three `untested` ones.
 */
export function toRegistryEntry(
  raw: IndexEntry,
  all: readonly Pick<Line, 'key' | 'version'>[],
  levelNote?: string | null,
  others?: Others,
): RegistryEntry {
  const cannot = !catalogSkip(raw) && cannotInstall(raw)
  const e = withSkipped(raw, all)
  const lines: RegistryEntry['compat']['lines'] = {}
  for (const [k, c] of Object.entries(e.compat.lines)) lines[k] = { status: c.status, at: c.at, step: c.step }
  // the catalog cannot install it: no line will ever have a receipt (an `untested` cell would print `Queued`)
  if (cannot) for (const l of all) lines[l.key] = { status: 'skipped', at: null, step: null }
  return {
    locator: e.locator,
    path: e.path,
    npm: e.npm,
    // the row names an npm entry by its package and links npm: its repository is not read here (review r4, packing)
    github: e.npm ? null : e.github,
    kind: e.kind,
    type: e.type,
    enterprise: e.enterprise,
    title: e.title,
    summary: e.summary,
    category: e.category,
    tags: e.tags.includes('example') ? ['example'] : [],
    status: e.status,
    listed: e.listed,
    featured: e.featured,
    license: e.license,
    tier: e.tier,
    quality: e.quality,
    sigil: e.sigil,
    version: {
      publishedAt: e.version.publishedAt,
      recommended: Object.fromEntries(all.map((l) => [l.key, e.version.recommended[l.key] ?? null])),
    },
    compat: {
      lines,
      verifiedOn: e.compat.verifiedOn,
      ...(e.compat.inPresets?.length ? { inPresets: e.compat.inPresets } : {}),
      ...(e.compat.inEmptyPreset?.length ? { inEmptyPreset: e.compat.inEmptyPreset } : {}),
      ...(e.compat.isolation && Object.keys(e.compat.isolation).length
        ? {
            isolation: Object.fromEntries(
              Object.entries(e.compat.isolation).map(([k, c]) => [
                k,
                {
                  status: c.status,
                  at: c.at,
                  step: c.step,
                  moduleVersion: c.moduleVersion,
                  named: !!c.moduleVersion && c.moduleVersion !== lineVersion(raw, k),
                },
              ]),
            ),
          }
        : {}),
    },
    anatomyLabel: sigilLabel(e.anatomy?.counts ?? null, { enterprise: e.enterprise }),
    install: { cli: e.install.cli },
    links: { npm: e.links.npm, repo: e.npm ? null : e.links.repo },
    idle: catalogSkip(raw) ? 'skip' : cannot ? 'cannot' : null,
    ...(levelNote ? { levelNote } : {}),
    ...(others && Object.keys(others).length ? { others } : {}),
  }
}

/** Entries the registry can ever show: listed ones, plus held and unmaintained ones behind the switch (6.4). */
export function registryCandidates(entries: readonly IndexEntry[]): IndexEntry[] {
  return entries.filter((e) => e.listed || HELD_STATES.has(e.status))
}

const isHeld = (e: RegistryEntry): boolean => HELD_STATES.has(e.status)
const isExample = (e: RegistryEntry): boolean => e.tags.includes('example')

type Sort = 'relevance' | 'verified' | 'published' | 'name'
type KindFilter = 'modules' | 'tools'
export interface Filters {
  q: string
  cat: string
  type: string[]
  kind: KindFilter
  on: string
  tier: string[]
  lic: string[]
  held: boolean
  examples: boolean
  sort: Sort
}
export const DEFAULTS: Filters = {
  q: '',
  cat: '',
  type: [],
  kind: 'modules',
  on: '',
  tier: [],
  lic: [],
  held: false,
  examples: false,
  sort: 'relevance',
}
const SORTS: { id: Sort; label: string }[] = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'verified', label: 'Recently verified' },
  { id: 'published', label: 'Recently published' },
  { id: 'name', label: 'Name' },
]
const TYPES = [
  { id: 'official', label: 'Official' },
  { id: 'community', label: 'Community' },
  { id: '3rd-party', label: '3rd-party' },
]
const TIERS = [
  { id: 'quality', label: 'OM Quality' },
  { id: 'verified', label: 'Verified' },
  { id: 'listed', label: 'Listed' },
  // enterprise has no level (6.3); the row keeps the facet adding up to the list
  { id: 'none', label: 'No level (enterprise)' },
]
const LICENSES = [
  { id: 'osi', label: 'Open source (OSI)' },
  { id: 'proprietary', label: 'Proprietary' },
  { id: 'enterprise', label: 'Enterprise' },
  { id: 'unknown', label: 'Unknown' },
]
const KINDS: { id: KindFilter; label: string; kinds: string[] }[] = [
  { id: 'modules', label: 'Modules', kinds: ['module', 'provider'] },
  { id: 'tools', label: 'Tools & libraries', kinds: ['tool', 'library'] },
]

const list = (v: string | null): string[] => (v ? v.split(',').filter(Boolean) : [])

function fromUrl(base: Filters): Filters {
  let p: URLSearchParams
  try {
    p = new URLSearchParams(window.location.search)
  } catch {
    return base
  }
  const sort = p.get('sort')
  const kind = p.get('kind')
  return {
    q: readQueryParam(),
    cat: p.get('cat') ?? base.cat,
    type: list(p.get('type')),
    kind: kind === 'tools' ? 'tools' : kind === 'modules' ? 'modules' : base.kind,
    on: p.get('on') ?? '',
    tier: list(p.get('tier')),
    lic: list(p.get('lic')),
    held: p.get('held') === '1',
    examples: p.get('examples') === '1',
    sort: SORTS.some((s) => s.id === sort) ? (sort as Sort) : 'relevance',
  }
}

function toUrl(f: Filters, fixedCat: string | null, fixedKind: KindFilter): void {
  try {
    const p = new URLSearchParams()
    if (f.q) p.set('q', f.q)
    if (f.cat && f.cat !== fixedCat) p.set('cat', f.cat)
    if (f.type.length) p.set('type', f.type.join(','))
    if (f.kind !== fixedKind) p.set('kind', f.kind)
    if (f.on) p.set('on', f.on)
    if (f.tier.length) p.set('tier', f.tier.join(','))
    if (f.lic.length) p.set('lic', f.lic.join(','))
    if (f.held) p.set('held', '1')
    if (f.examples) p.set('examples', '1')
    if (f.sort !== 'relevance') p.set('sort', f.sort)
    const qs = p.toString()
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
      history.replaceState(history.state, '', url)
  } catch {
    // a sandboxed frame may refuse replaceState; the filters still work
  }
}

const tierKey = (e: RegistryEntry): string => (e.quality ? 'quality' : (e.tier ?? 'none'))
const verifiedOn = (e: RegistryEntry, line: string): boolean =>
  e.compat.verifiedOn.includes(line) || !!e.version.recommended[line]

/** Facet tests; `skip` leaves one facet out (its own counts). */
export function passes(e: RegistryEntry, f: Filters, skip?: keyof Filters): boolean {
  if (isHeld(e) && !f.held) return false
  if (!e.listed && !isHeld(e)) return false
  if (isExample(e) && !f.examples) return false
  if (skip !== 'kind' && !(KINDS.find((k) => k.id === f.kind)?.kinds ?? []).includes(e.kind)) return false
  if (skip !== 'cat' && f.cat && e.category !== f.cat) return false
  if (skip !== 'type' && f.type.length && !f.type.includes(e.type)) return false
  if (skip !== 'tier' && f.tier.length && !f.tier.includes(tierKey(e))) return false
  if (skip !== 'lic' && f.lic.length && !f.lic.includes(e.license.kind)) return false
  if (skip !== 'on' && f.on && !verifiedOn(e, f.on)) return false
  return true
}

/** Relevance without a query (spec 8.2, same order as relevanceCompare in lib/core/search.ts). */
function relevance(latest: string | null) {
  const level = (e: RegistryEntry): number => (e.quality ? 0 : e.tier === 'verified' ? 1 : e.tier === 'listed' ? 2 : 3)
  const fresh = (e: RegistryEntry): number => {
    const at = latest ? e.compat.lines[latest]?.at : null
    return at ? Date.parse(at) : 0
  }
  return (a: RegistryEntry, b: RegistryEntry): number =>
    level(a) - level(b) ||
    Number(b.featured) - Number(a.featured) ||
    fresh(b) - fresh(a) ||
    a.title.localeCompare(b.title)
}

function lastVerified(e: RegistryEntry): number {
  let best = 0
  for (const c of Object.values(e.compat.lines))
    if (c.status === 'verified' && c.at) best = Math.max(best, Date.parse(c.at))
  return best
}

/**
 * The `matched:` chip (spec 7.6) explains a hit the row does not show by itself (review r2): none when the query hits
 * the title or the package name, which the row already shows; an anatomy identifier first; then a tag or provider.
 * A summary hit alone needs no chip either: the summary is on the row.
 */
const ANATOMY_CHIP = /^(event|entity|permission|env|setting|host|module) /
const pickMatch = (chips: readonly string[]): string | null =>
  chips.includes('name')
    ? null
    : (chips.find((m) => ANATOMY_CHIP.test(m)) ?? chips.find((m) => m !== 'name' && m !== 'summary') ?? null)

interface SearchState {
  q: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  /**
   * Locators in rank order with the matched chip. `exact`: every word of the query is in the entry (title, package,
   * summary, use, tags, providers or an anatomy identifier); the rest are fuzzy or partial hits, shown as
   * `Closest matches` without a count. `pinned`: a tool or library among the top 3 of every kind, shown in the
   * Modules view too.
   */
  hits: { locator: string; matched: string | null; exact: boolean; pinned?: boolean }[]
  /** Locators that match the query with no category, type or kind filter: the facet counts follow the query. */
  pool: string[]
  /** The pool's entries with every word of the query (`exact`): what a cleared filter set would show. */
  poolExact: string[]
  builtIn: BuiltInCard[]
  total: number
  /** Nothing matched the query; the results are for this spelling of it (`stirpe` -> `stripe`). */
  didYouMean?: string
}

/** Words of a text as the search tokenizes them. */
type Tokenize = (text: string) => string[]
type ProcessTerm = (term: string) => string | null

/** Query terms (stop words and one-letter terms dropped, like the index does). */
function queryTerms(q: string, tokenize: Tokenize, processTerm: ProcessTerm): string[] {
  return [
    ...new Set(
      tokenize(q)
        .map(processTerm)
        .filter((t): t is string => !!t),
    ),
  ]
}

/** True when every term starts a word of the entry (or a word of 4+ letters starts the term: `rates` / `rate`). */
function coversAll(words: ReadonlySet<string>, terms: readonly string[]): boolean {
  const list = [...words]
  return terms.every(
    (t) =>
      words.has(t) ||
      list.some((w) => w.startsWith(t) || (w.length >= 4 && t.startsWith(w) && t.length - w.length <= 2)),
  )
}

const CLOSE_MAX = 5
const EMPTY_SEARCH: SearchState = { q: '', status: 'idle', hits: [], pool: [], poolExact: [], builtIn: [], total: 0 }

export interface RegistryProps {
  /** The rows, packed for the props (lib/registry-pack.ts). */
  entries: PackedEntry[]
  lines: Pick<Line, 'key' | 'version' | 'source'>[]
  categories: { id: string; title: string }[]
  /** /search-index.json under the base path. */
  indexUrl: string
  /** Site root plus base (prompts). */
  site: string
  /** Category page: the category is fixed and its facet is hidden. */
  category?: string | null
  /** Show the registry's own search field (pages without the Ask bar). */
  searchField?: boolean
  /** Number of built-in modules (the empty state points at them). */
  builtInCount: number
  /** Kind shown first: `tools` on a category page that has tools and no modules. */
  initialKind?: KindFilter
  /** Receipt strip and level columns in the rows (off before the first night). */
  signals?: boolean
  /** Sigil glyph and phase of every built-in module (the core answer card draws it). */
  builtInSigils?: Record<string, { glyph: string; phase: number }>
  /**
   * The receipts come from a preview run (`dataAsOf.source`, review r10): the legend of the squares carries the preview
   * chip, and the Verified seals say so in their titles.
   */
  preview?: boolean
}

export default function Registry({
  entries: packed,
  lines,
  categories,
  indexUrl,
  site,
  category = null,
  searchField = false,
  builtInCount,
  initialKind = 'modules',
  signals = true,
  builtInSigils = {},
  preview = false,
}: RegistryProps) {
  const entries = useMemo(
    () =>
      packed.map((p) =>
        unpackEntry(
          p,
          lines.map((l) => l.key),
        ),
      ),
    [packed],
  )
  const fixed: Filters = { ...DEFAULTS, cat: category ?? '', kind: initialKind }
  const [f, setF] = useState<Filters>(fixed)
  const [hydrated, setHydrated] = useState(false)
  const [sheet, setSheet] = useState(false)
  /** Closest matches beyond the first CLOSE_MAX are behind a button (fuzzy hits are a hint, not a list). */
  const [allClose, setAllClose] = useState(false)
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH)
  const dialog = useRef<HTMLDialogElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const latest = lines.find((l) => l.source === 'latest')?.key ?? null
  const catTitle = (id: string): string => categories.find((c) => c.id === id)?.title ?? id
  const byLocator = useMemo(() => new Map(entries.map((e) => [e.locator, e])), [entries])

  const update = (patch: Partial<Filters>): void => setF((cur) => ({ ...cur, ...patch }))

  // state from the URL, then follow the Ask bar
  useEffect(() => {
    // text typed into the Ask bar before this island hydrated (it is client:painted="idle", the Ask bar client:painted)
    const start = fromUrl(fixed)
    const typed = askQuery() || (document.getElementById('ask-input') as HTMLInputElement | null)?.value.trim() || ''
    setF(typed && !start.q ? { ...start, q: typed.slice(0, 200) } : start)
    setHydrated(true)
    const onQuery = (ev: Event): void => {
      const d = (ev as CustomEvent<QueryDetail>).detail
      if (d && d.source !== 'registry') setF((cur) => (cur.q === d.q ? cur : { ...cur, q: d.q }))
    }
    document.addEventListener(QUERY_EVENT, onQuery)
    return () => document.removeEventListener(QUERY_EVENT, onQuery)
  }, [])

  useEffect(() => {
    if (hydrated) toUrl(f, category, initialKind)
  }, [f, hydrated])

  // run the search for the current query (the index is loaded once and shared with the Ask bar)
  useEffect(() => {
    const q = f.q.trim()
    if (!q) {
      setSearch(EMPTY_SEARCH)
      return
    }
    let live = true
    setAllClose(false)
    setSearch((s) => ({ ...s, q, status: s.status === 'ready' ? 'ready' : 'loading' }))
    loadSearcher(indexUrl)
      .then(async (searcher) => {
        const { searchAll, tokenize, processTerm } = await import('../../../lib/core/search.ts')
        // every match, not the tools' top 20 (finding of 25 Oct): level, license, line and held are applied here
        // afterwards, and a match ranked past 20 was lost to them; the filters the search knows still go in
        const kinds = (KINDS.find((k) => k.id === f.kind)?.kinds ?? []) as (
          'module' | 'provider' | 'tool' | 'library'
        )[]
        const out = searchAll(searcher, {
          query: q,
          includeExamples: f.examples,
          ...(f.on ? { omVersion: f.on } : {}),
          ...(f.cat ? { category: f.cat as ModuleCard['category'] } : {}),
          ...(f.type.length ? { type: f.type as ModuleCard['type'][] } : {}),
          kind: [...kinds, 'built-in'],
        })
        // the same query over every kind, category and type: what the facet counts show while searching
        const pool = searchAll(searcher, {
          query: q,
          includeExamples: true,
          includeBuiltIn: false,
          kind: ['module', 'provider', 'tool', 'library'],
        })
        if (!live) return
        // a query nothing matched is judged by the spelling the results are for (`stirpe` -> `stripe`)
        const terms = queryTerms(out.didYouMean ?? q, tokenize, processTerm)
        const exact = (locator: string): boolean => {
          const m = searcher.data.modules[locator]
          if (!m || terms.length === 0) return true
          const text = [
            m.title,
            m.npm ?? m.locator,
            m.summary,
            m.whenToUse,
            ...m.tags,
            ...m.providers.flatMap((p) => [p.name, p.label]),
            ...m.moduleIds,
            ...Object.values(m.ids).flat(),
          ].join(' ')
          return coversAll(new Set(tokenize(text)), terms)
        }
        const poolAll = [
          ...new Set([...pool.results.map((r: ModuleCard) => r.locator), ...out.results.map((r) => r.locator)]),
        ]
        // a library or a tool among the top 3 of every kind is shown in the Modules view too, at its rank (golden
        // query `web search for agents`: the engine web-research, a library, sat behind `Tools & libraries 1` while
        // its adapters filled the list)
        const hits: SearchState['hits'] = out.results.map((r: ModuleCard) => ({
          locator: r.locator,
          matched: pickMatch(r.matchedOn),
          exact: exact(r.locator),
        }))
        if (f.kind === 'modules')
          pool.results.slice(0, 3).forEach((r: ModuleCard, rank: number) => {
            if ((r.kind !== 'library' && r.kind !== 'tool') || !exact(r.locator)) return
            if (hits.some((h) => h.locator === r.locator)) return
            hits.splice(Math.min(rank, hits.length), 0, {
              locator: r.locator,
              matched: pickMatch(r.matchedOn),
              exact: true,
              pinned: true,
            })
          })
        setSearch({
          q,
          status: 'ready',
          hits,
          pool: poolAll,
          poolExact: poolAll.filter(exact),
          builtIn: out.builtIn,
          total: out.total,
          ...(out.didYouMean ? { didYouMean: out.didYouMean } : {}),
        })
      })
      .catch(() => {
        if (live) setSearch({ ...EMPTY_SEARCH, q, status: 'error' })
      })
    return () => {
      live = false
    }
  }, [f.q, f.examples, f.on, f.cat, f.kind, f.type.join(',')])

  const searching = f.q.trim() !== '' && search.status === 'ready' && search.q === f.q.trim()

  const shown = useMemo(() => {
    if (searching)
      return search.hits
        .map((h) => ({ e: byLocator.get(h.locator), matched: h.matched, exact: h.exact, pinned: !!h.pinned }))
        .filter(
          (x): x is { e: RegistryEntry; matched: string | null; exact: boolean; pinned: boolean } =>
            !!x.e && passes(x.e, f, x.pinned ? 'kind' : undefined),
        )
    const base = entries.filter((e) => passes(e, f))
    const sorted =
      f.sort === 'name'
        ? base.sort((a, b) => a.title.localeCompare(b.title))
        : f.sort === 'published'
          ? base.sort(
              (a, b) =>
                (b.version.publishedAt ?? '').localeCompare(a.version.publishedAt ?? '') ||
                a.title.localeCompare(b.title),
            )
          : f.sort === 'verified'
            ? base.sort((a, b) => lastVerified(b) - lastVerified(a) || relevance(latest)(a, b))
            : base.sort(relevance(latest))
    return sorted.map((e) => ({ e, matched: null as string | null, exact: true }))
  }, [entries, f, searching, search])
  const exactRows = searching ? shown.filter((x) => x.exact) : shown
  const closeRows = searching ? shown.filter((x) => !x.exact) : []
  /** No module has every word of the query, but a core module answers it. */
  const coreAnswer = searching && search.builtIn.length > 0 && exactRows.length === 0

  // tell the Hive which cells match the query
  useEffect(() => {
    const keys = searching ? [...exactRows.map((x) => x.e.locator), ...search.builtIn.map((b) => `core:${b.id}`)] : null
    document.dispatchEvent(
      new CustomEvent<ResultsDetail>(RESULTS_EVENT, {
        detail: {
          q: searching ? search.q : '',
          keys,
          matches: exactRows.length,
          core: searching ? search.builtIn.length : 0,
          coreTitles: searching ? search.builtIn.map((b) => b.title) : [],
          // computed further down in this render; the effect runs after it
          held: heldHits.length,
        },
      }),
    )
  }, [shown, searching])

  // facet counts follow the query while searching (the hits of the query over every facet), else the whole list
  const facetBase = useMemo(
    () => (searching ? search.pool.map((l) => byLocator.get(l)).filter((e): e is RegistryEntry => !!e) : entries),
    [entries, searching, search],
  )
  const count = (skip: keyof Filters, test: (e: RegistryEntry) => boolean): number =>
    facetBase.filter((e) => passes(e, f, skip) && test(e)).length

  // a list shorter than the rail beside it (review r4: a three-hit query cut the rail at 360 px into a small scrolling
  // box, `3rd-party` sliced in half): the rail stops being sticky and shows whole, the list column gets its height.
  // A longer list keeps the sticky rail that scrolls on its own. Without JavaScript the full list is always longer.
  useEffect(() => {
    const el = root.current
    const main = el?.querySelector<HTMLElement>('.reg__main')
    const rail = el?.querySelector<HTMLElement>('.reg__rail')
    if (!el || !main || !rail) return
    // filters below the rail's edge (review r4: at 1440 x 900 the cut fell on a hairline and nothing said Category
    // was there): `More filters` sits on the rail's edge while more of it is below, and goes at its end
    const more = (): void => {
      rail.toggleAttribute('data-more', rail.scrollHeight - rail.scrollTop - rail.clientHeight > 4)
    }
    const fit = (): void => {
      if (!rail.offsetParent) {
        el.removeAttribute('data-short')
        main.style.minHeight = ''
        return
      }
      const top = main.getBoundingClientRect().top
      const natural = Array.from(main.children).reduce((m, k) => Math.max(m, k.getBoundingClientRect().bottom - top), 0)
      const railH = rail.scrollHeight
      const short = natural <= railH
      el.toggleAttribute('data-short', short)
      main.style.minHeight = short ? `${railH}px` : ''
      more()
    }
    fit()
    rail.addEventListener('scroll', more, { passive: true })
    if (typeof ResizeObserver === 'undefined') return () => rail.removeEventListener('scroll', more)
    const ro = new ResizeObserver(fit)
    ro.observe(rail)
    ro.observe(main)
    return () => {
      ro.disconnect()
      rail.removeEventListener('scroll', more)
    }
  })

  const toggle = (key: 'type' | 'tier' | 'lic', id: string): void =>
    setF((cur) => ({
      ...cur,
      [key]: cur[key].includes(id) ? cur[key].filter((x) => x !== id) : [...cur[key], id],
    }))

  const active: { label: string; clear: () => void }[] = [
    ...(f.on ? [{ label: `Verified on ${f.on}`, clear: () => update({ on: '' }) }] : []),
    ...f.tier.map((t) => ({ label: TIERS.find((x) => x.id === t)?.label ?? t, clear: () => toggle('tier', t) })),
    ...f.type.map((t) => ({ label: TYPES.find((x) => x.id === t)?.label ?? t, clear: () => toggle('type', t) })),
    ...(f.kind !== initialKind
      ? [{ label: KINDS.find((k) => k.id === f.kind)?.label ?? f.kind, clear: () => update({ kind: initialKind }) }]
      : []),
    ...f.lic.map((t) => ({ label: LICENSES.find((x) => x.id === t)?.label ?? t, clear: () => toggle('lic', t) })),
    ...(f.cat && f.cat !== category ? [{ label: catTitle(f.cat), clear: () => update({ cat: '' }) }] : []),
    ...(f.held ? [{ label: 'Held and unmaintained', clear: () => update({ held: false }) }] : []),
    ...(f.examples ? [{ label: 'Examples', clear: () => update({ examples: false }) }] : []),
  ]
  // the other kind of the Kind facet (the empty state offers it when the current one has nothing)
  const otherKindDef = KINDS.find((k) => k.id !== f.kind) ?? KINDS[0]!
  const otherKind = {
    id: otherKindDef.id,
    label: otherKindDef.label,
    n: facetBase.filter((e) => passes(e, { ...f, kind: otherKindDef.id })).length,
  }
  const clearAll = (): void => setF((cur) => ({ ...fixed, q: cur.q, sort: cur.sort }))

  const openSheet = (): void => {
    setSheet(true)
    requestAnimationFrame(() => dialog.current?.showModal())
  }
  const closeSheet = (): void => {
    dialog.current?.close()
    setSheet(false)
  }

  // while a query is typed, a facet whose options would not change the list (fewer than two with a hit) leaves the
  // rail, unless one of its options is on (review r4); the rail of a three-hit query is two or three groups
  const tierOpts = TIERS.map((t) => ({ ...t, n: count('tier', (e) => tierKey(e) === t.id) }))
  const typeOpts = TYPES.map((t) => ({ ...t, n: count('type', (e) => e.type === t.id) }))
  const kindOpts = KINDS.map((k) => ({ ...k, n: count('kind', (e) => k.kinds.includes(e.kind)) }))
  const licOpts = LICENSES.map((t) => ({ ...t, n: count('lic', (e) => e.license.kind === t.id) }))
  const catOpts = categories.map((c) => ({ ...c, n: count('cat', (e) => e.category === c.id) }))
  const useful = (opts: readonly { n: number }[], on: boolean): boolean =>
    !searching || on || opts.filter((o) => o.n > 0).length >= 2

  const groups = (
    <>
      {signals && (
        <fieldset class="reg__group">
          <legend class="reg__legend">Verified on</legend>
          <div class="reg__seg" role="radiogroup" aria-label="Verified on">
            {[{ key: '', label: 'Any' }, ...lines.map((l) => ({ key: l.key, label: l.key }))].map((o) => (
              <label class={`reg__segbtn${f.on === o.key ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="reg-on"
                  value={o.key}
                  checked={f.on === o.key}
                  onChange={() => update({ on: o.key })}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <p class="reg__hint">Lines the catalog installed the module on. Fit alone never counts.</p>
        </fieldset>
      )}
      {/* before the first night every entry is Listed: the level facet would count one value */}
      {signals && useful(tierOpts, f.tier.length > 0) && (
        <fieldset class="reg__group">
          <legend class="reg__legend">Level</legend>
          {/* OM Quality with 0 stays off the facet (R17, spec 6.3: its zero is said on /quality only, finding of 25 Oct) */}
          {tierOpts.map((t) =>
            (t.id === 'none' || t.id === 'quality' || searching) && t.n === 0 && !f.tier.includes(t.id) ? null : (
              <Check
                label={t.label}
                checked={f.tier.includes(t.id)}
                count={t.n}
                onChange={() => toggle('tier', t.id)}
              />
            ),
          )}
        </fieldset>
      )}
      {useful(typeOpts, f.type.length > 0) && (
        <fieldset class="reg__group">
          <legend class="reg__legend">Type</legend>
          {typeOpts.map((t) => (
            <Check
              label={t.label}
              checked={f.type.includes(t.id)}
              count={t.n}
              onChange={() => toggle('type', t.id)}
              hideZero={searching}
            />
          ))}
        </fieldset>
      )}
      {useful(kindOpts, f.kind !== initialKind) && (
        <fieldset class="reg__group">
          <legend class="reg__legend">Kind</legend>
          {kindOpts.map((k) => (
            <label class="reg__check">
              <input type="radio" name="reg-kind" checked={f.kind === k.id} onChange={() => update({ kind: k.id })} />
              <span class="reg__lbl">{k.label}</span>
              <span class="reg__n">{k.n}</span>
            </label>
          ))}
        </fieldset>
      )}
      {useful(licOpts, f.lic.length > 0) && (
        <fieldset class="reg__group">
          <legend class="reg__legend">License</legend>
          {licOpts.map((t) => (
            <Check
              label={t.label}
              checked={f.lic.includes(t.id)}
              count={t.n}
              onChange={() => toggle('lic', t.id)}
              hideZero={searching}
            />
          ))}
        </fieldset>
      )}
      {!category && useful(catOpts, f.cat !== '') && (
        <fieldset class="reg__group">
          <legend class="reg__legend">Category</legend>
          <label class="reg__check">
            <input type="radio" name="reg-cat" checked={f.cat === ''} onChange={() => update({ cat: '' })} />
            <span class="reg__lbl">All categories</span>
            <span class="reg__n">{count('cat', () => true)}</span>
          </label>
          {catOpts.map((c) => {
            const n = c.n
            if (searching && n === 0 && f.cat !== c.id) return null
            return (
              <label class={`reg__check${n === 0 && f.cat !== c.id ? ' is-zero' : ''}`}>
                <input type="radio" name="reg-cat" checked={f.cat === c.id} onChange={() => update({ cat: c.id })} />
                <span class="reg__lbl">{c.title}</span>
                <span class="reg__n">{n}</span>
              </label>
            )
          })}
        </fieldset>
      )}
      <fieldset class="reg__group">
        <legend class="reg__legend">Show</legend>
        <Switch label="Held and unmaintained" checked={f.held} onChange={() => update({ held: !f.held })} />
        <Switch label="Examples" checked={f.examples} onChange={() => update({ examples: !f.examples })} />
      </fieldset>
    </>
  )

  const q = f.q.trim()
  const unit = f.kind === 'tools' ? ['tool or library', 'tools and libraries'] : ['module', 'modules']
  // a hit the filters hide is not `No module does that yet` (review r4: /?q=ksef&type=community): say how many the
  // filters hide and offer to clear them
  const cleared: Filters = { ...fixed, q: f.q, sort: f.sort }
  const hidden =
    searching && exactRows.length === 0 && active.length > 0
      ? search.poolExact.filter((l) => {
          const e = byLocator.get(l)
          return !!e && passes(e, cleared)
        }).length
      : 0
  // a query that matches only held entries (Przelewy24, PayU, InPost) is not `No module does that yet` with `Build it`:
  // say which held entries match and offer to show them (finding of 25 Oct)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const heldText = (e: RegistryEntry): string =>
    `${e.title} ${e.npm ?? e.locator} ${e.summary} ${e.tags.join(' ')}`.toLowerCase()
  const heldHits =
    searching && exactRows.length === 0 && hidden === 0 && !f.held
      ? entries.filter(
          (e) =>
            isHeld(e) &&
            passes(e, { ...cleared, held: true }) &&
            (search.poolExact.includes(e.locator) || (words.length > 0 && words.every((w) => heldText(e).includes(w)))),
        )
      : []
  // a list without a query says how many held entries its filters leave out (a category with held gateways)
  const heldHidden =
    !searching && !f.held ? entries.filter((e) => isHeld(e) && passes(e, { ...f, held: true })).length : 0
  const matches = (n: number): string => `${n} ${n === 1 ? 'match' : 'matches'}`
  // the words the results answer: the query, or the spelling of it the search fell back to (`stirpe` -> `stripe`)
  const asked = search.didYouMean ? `"${search.didYouMean}" (no match for "${search.q}")` : `"${search.q}"`
  const loose = closeRows.length
    ? ` · ${closeRows.length} loosely related ${closeRows.length === 1 ? 'module' : 'modules'}`
    : ''
  const summary = searching
    ? exactRows.length
      ? `${matches(exactRows.length)} for ${asked}${closeRows.length === 0 && search.total > search.hits.length ? `, top ${search.hits.length} shown` : ''}`
      : hidden > 0
        ? `${matches(hidden)} for ${asked} hidden by filters`
        : coreAnswer
          ? // the core module is the answer, as the Ask bar says (review r1, demo C1): never `No exact match` above it
            `In core: ${search.builtIn
              .slice(0, 2)
              .map((b) => b.title)
              .join(', ')}${loose}`
          : heldHits.length > 0
            ? // the body names the held entries and offers to show them (finding of 25 Oct): not `No exact match`
              `${heldMatchText(heldHits.length)} ${asked}`
            : `No exact match for ${asked}`
    : `${shown.length} ${shown.length === 1 ? unit[0] : unit[1]}${heldHidden > 0 ? ` · ${heldHidden} held, not shown` : ''}`
  // the squares of the list in words, once above it (review r4: four glyphs and no legend on / and on phones); only
  // the states the list shows, the same words as /compat
  // one entry per mark (round 14): a dependency the age gate held back is not a release in the gate
  const present = new Set(
    exactRows.flatMap((x) => lines.filter((l) => !x.e.others?.[l.key]).map((l) => markOf(x.e.compat.lines[l.key]))),
  )
  const legend = STATE_LEGEND.filter((st) => present.has(st.mark))
  // a receipt of another version than the one a fresh app installs (review r6): its own mark, its own words
  const anyOther = exactRows.some((x) => lines.some((l) => x.e.others?.[l.key]))
  // the signal `in isolation` (24 Oct): the dot and its words, one key per way the list draws it (decision Ia of
  // 25 Oct: grey where it agrees with the square, in colour only where it differs)
  const isoMarks = new Set(
    exactRows.flatMap((x) =>
      lines.flatMap((l) => {
        const iso = x.e.compat.isolation?.[l.key]
        const m = iso
          ? isoMark(x.e.compat.lines[l.key]?.status ?? 'untested', isolationDot(iso), !!x.e.others?.[l.key])
          : null
        return m ? [m] : []
      }),
    ),
  )
  const anyIso = isoMarks.size > 0
  // the yellow sign before a license (finding of 25 Oct): its words were only a tooltip, which phones never show
  const anyLicenseMismatch = exactRows.some((x) => !x.e.enterprise && x.e.license.mismatch)

  const rowList = (rows: { e: RegistryEntry; matched: string | null }[]) => (
    <div class="reg__list" role="list">
      {rows.map(({ e, matched }) => (
        <div role="listitem" key={e.locator} class={`reg__item${e.idle ? ` is-${e.idle}` : ''}`}>
          {/* ModuleRow prints the hit on its own line under the summary, the identifier whole (WP11b) */}
          <ModuleRow
            entry={e as unknown as IndexEntry}
            lines={lines}
            categoryTitle={catTitle(e.category)}
            matched={matched}
            signals={signals}
            preview={preview}
          />
        </div>
      ))}
    </div>
  )

  return (
    <div class={`reg${category ? ' reg--cat' : ''}${hydrated ? ' is-live' : ''}`} ref={root}>
      <aside class="reg__rail" aria-label="Filters">
        {groups}
      </aside>
      <div class="reg__main">
        {searchField && (
          <form class="reg__search" role="search" aria-label="Search modules" onSubmit={(ev) => ev.preventDefault()}>
            <Icon name="search" size={18} />
            <label class="sr-only" for="reg-q">
              Search modules
            </label>
            <input
              id="reg-q"
              type="search"
              value={f.q}
              placeholder="Search in this category"
              autocomplete="off"
              maxLength={200}
              data-search-input
              onFocus={() => void loadSearcher(indexUrl).catch(() => undefined)}
              onInput={(ev) => update({ q: (ev.currentTarget as HTMLInputElement).value })}
              onKeyDown={(ev) => {
                if (ev.key === 'Escape') update({ q: '' })
              }}
            />
          </form>
        )}
        <div class="reg__bar">
          <button type="button" class="btn btn--secondary btn--sm reg__filters" onClick={openSheet}>
            Filters{active.length > 0 && <span class="reg__badge">{active.length}</span>}
          </button>
          <p class="reg__count" aria-live="polite">
            {summary}
          </p>
          <label class="reg__sort">
            <span>Sort</span>
            <select
              aria-label="Sort"
              value={searching && f.sort === 'relevance' ? 'relevance' : f.sort}
              disabled={searching}
              title={searching ? 'Search results are ranked by relevance.' : undefined}
              onChange={(ev) => update({ sort: (ev.currentTarget as HTMLSelectElement).value as Sort })}
            >
              {SORTS.map((s) => (
                <option value={s.id}>{s.label}</option>
              ))}
            </select>
            <Icon name="chevron-down" size={14} />
          </label>
        </div>
        {active.length > 0 && (
          <ul class="reg__active" role="list" aria-label="Active filters">
            {active.map((a) => (
              <li>
                <button type="button" class="reg__chip" onClick={a.clear} aria-label={`Remove filter ${a.label}`}>
                  {a.label}
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" class="reg__clear" onClick={clearAll}>
                Clear all
              </button>
            </li>
          </ul>
        )}
        {search.status === 'error' && q && (
          <p class="reg__notice" role="status">
            Search index unavailable. Showing the full list.
          </p>
        )}
        {coreAnswer ? (
          /* no module has every word, but core does (demo C1, `exchange rates`): the core module is the answer,
             never an empty state next to a hit (review r1) */
          <section class="reg__answer" aria-labelledby="reg-core-h">
            <h3 class="t-tagline reg__answer-h" id="reg-core-h">
              Already in Open Mercato core
            </h3>
            {search.builtIn.slice(0, 1).map((b) => (
              <CoreAnswer b={b} sigil={builtInSigils[b.id]} />
            ))}
            {search.builtIn.length > 1 && <CoreList cards={search.builtIn.slice(1)} />}
            {closeRows.length > 0 && (
              <details class="reg__loose">
                <summary>
                  <Icon name="chevron-down" size={14} />
                  {closeRows.length} loosely related {closeRows.length === 1 ? 'module' : 'modules'}
                </summary>
                <p class="reg__close-note">Not every word of the query is in these modules.</p>
                {rowList(closeRows)}
              </details>
            )}
          </section>
        ) : (
          <>
            {searching && search.builtIn.length > 0 && (
              <section class="reg__core" aria-labelledby="reg-core-h">
                <h3 class="reg__core-h" id="reg-core-h">
                  <span class="t-tagline">Already in Open Mercato core</span>
                  <span class="reg__core-n">
                    {search.builtIn.some((b) => b.presetNote)
                      ? 'Use it instead of installing a package.'
                      : 'Enable it instead of installing a package.'}
                  </span>
                </h3>
                <CoreList cards={search.builtIn} />
              </section>
            )}
            {exactRows.length > 0 ? (
              <>
                {searching && search.builtIn.length > 0 && <p class="t-tagline reg__mods-h">Modules</p>}
                {((signals && (preview || anyOther || anyIso || legend.some((st) => st.status !== 'verified'))) ||
                  anyLicenseMismatch) && (
                  <ul
                    class="reg__key"
                    role="list"
                    aria-label="Key to the list. Squares: the last receipt in a new app on each line, for the version it has or installs there"
                  >
                    {(signals ? legend : []).map((st) => (
                      <li title={st.title}>
                        <Square status={st.status} step={st.step ?? null} />
                        <span>{st.text}</span>
                        {st.title && <span class="sr-only">. {st.title}</span>}
                      </li>
                    ))}
                    {signals && isoMarks.has('agree') && (
                      <li>
                        <span class="sq-iso-key sq-iso-key--agree" aria-hidden="true" />
                        <span>{ISOLATION_MARK.legend}</span>
                      </li>
                    )}
                    {signals &&
                      ISO_DIFFERS.filter((m) => isoMarks.has(m)).map((m) => (
                        <li>
                          <span class={`sq-iso-key sq-iso-key--${m}`} aria-hidden="true" />
                          <span>{ISOLATION_MARK.differs[m]}</span>
                        </li>
                      ))}
                    {signals && anyOther && (
                      <li>
                        <Square status="untested" other />
                        <span>receipt for another version</span>
                      </li>
                    )}
                    {anyLicenseMismatch && (
                      <li>
                        <span class="chip__neq" aria-hidden="true">
                          ≠
                        </span>
                        <span>license sources disagree</span>
                      </li>
                    )}
                    {/* the squares and the seals rest on a preview run (review r10): the one chip, at the legend */}
                    {signals && preview && (
                      <li class="reg__key-preview">
                        <span class="chip chip--preview">{PREVIEW_CHIP}</span>
                      </li>
                    )}
                  </ul>
                )}
                <ModuleRowHead lines={lines} signals={signals} />
                {rowList(exactRows)}
              </>
            ) : q && search.status === 'loading' ? (
              <p class="reg__notice">Searching.</p>
            ) : (
              <div class={`reg__empty${closeRows.length > 0 ? ' reg__empty--compact' : ''}`}>
                <svg class="reg__hex" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
                  <polygon
                    points="32,5 55.4,18.5 55.4,45.5 32,59 8.6,45.5 8.6,18.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1"
                    stroke-dasharray="3 3"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>
                {q && hidden > 0 ? (
                  <>
                    <p class="t-h3">{matches(hidden)} hidden by filters.</p>
                    <div class="reg__empty-actions">
                      <button type="button" class="btn btn--secondary btn--sm" onClick={clearAll}>
                        Clear filters
                      </button>
                    </div>
                  </>
                ) : q && heldHits.length > 0 ? (
                  <>
                    <p class="t-h3">
                      {heldMatchText(heldHits.length)}:{' '}
                      {heldHits
                        .slice(0, 3)
                        .map((e) => e.title)
                        .join(', ')}
                      {heldHits.length > 3 ? ` and ${heldHits.length - 3} more` : ''}.
                    </p>
                    <p class="reg__empty-text">
                      Held entries are hidden: they cannot be installed or recommended yet. Each page says why.
                    </p>
                    <div class="reg__empty-actions">
                      <button type="button" class="btn btn--secondary btn--sm" onClick={() => update({ held: true })}>
                        Show held entries
                      </button>
                    </div>
                  </>
                ) : q ? (
                  <>
                    <p class="t-h3">No module does that yet.</p>
                    <p class="reg__empty-text">
                      Check the <a href={href('/built-in')}>{builtInCount} modules built into core</a>, then build it.
                    </p>
                    <div class="reg__empty-cmd">
                      <span class="t-tagline">Build it</span>
                      <CommandChipView command="npx create-mercato-module init" />
                    </div>
                    <div class="reg__empty-actions">
                      <span class="t-tagline">Ask an agent</span>
                      <button type="button" class="btn btn--secondary btn--sm" onClick={() => void copyPrompt(q, site)}>
                        <Icon name="copy" size={16} /> Copy prompt
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p class="t-h3">No module matches these filters.</p>
                    <div class="reg__empty-actions">
                      {otherKind.n > 0 && (
                        <button
                          type="button"
                          class="btn btn--secondary btn--sm"
                          onClick={() => update({ kind: otherKind.id })}
                        >
                          Show {otherKind.n} {otherKind.label.toLowerCase()}
                        </button>
                      )}
                      {active.length > 0 && (
                        <button type="button" class="btn btn--ghost btn--sm" onClick={clearAll}>
                          Clear filters
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            {closeRows.length > 0 && (
              <section class="reg__close" aria-labelledby="reg-close-h">
                <h3 class="t-tagline reg__mods-h" id="reg-close-h">
                  Closest matches
                </h3>
                <p class="reg__close-note">Not every word of the query is in these modules.</p>
                {rowList(allClose ? closeRows : closeRows.slice(0, CLOSE_MAX))}
                {!allClose && closeRows.length > CLOSE_MAX && (
                  <p class="reg__close-more">
                    <button type="button" class="btn btn--ghost btn--sm" onClick={() => setAllClose(true)}>
                      Show {closeRows.length - CLOSE_MAX} more
                    </button>
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {sheet && (
        <dialog
          ref={dialog}
          class="reg__sheet"
          aria-label="Filters"
          onClose={() => setSheet(false)}
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) closeSheet()
          }}
        >
          <div class="reg__sheet-in">
            <div class="reg__sheet-head">
              <p class="t-h3">Filters</p>
              <button type="button" class="btn btn--ghost btn--sm" onClick={clearAll}>
                Clear all
              </button>
            </div>
            <div class="reg__sheet-body">{groups}</div>
            <div class="reg__sheet-foot">
              <button type="button" class="btn btn--tertiary reg__sheet-done" onClick={closeSheet}>
                Show {summary}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  )
}

/** Copies "search the Open Mercato modules for <query>, then propose build vs install" (spec 7.8). */
async function copyPrompt(q: string, site: string): Promise<void> {
  const { buildSearchPrompt } = await import('../../../lib/core/prompt.ts')
  const text = buildSearchPrompt(q, site)
  let ok = false
  try {
    if (text) {
      await navigator.clipboard.writeText(text)
      ok = true
    }
  } catch {
    ok = false
  }
  const toast = document.getElementById('om-toast')
  if (!toast) return
  toast.textContent = ok ? 'Prompt copied' : 'Copy failed'
  toast.setAttribute('data-on', '')
  setTimeout(() => toast.removeAttribute('data-on'), 1600)
}

function Check({
  label,
  checked,
  count,
  onChange,
  hideZero = false,
}: {
  label: string
  checked: boolean
  count: number
  onChange: () => void
  /** While a query is typed, options with nothing to show leave the rail. */
  hideZero?: boolean
}) {
  if (hideZero && count === 0 && !checked) return null
  return (
    <label class={`reg__check${count === 0 && !checked ? ' is-zero' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span class="reg__lbl">{label}</span>
      <span class="reg__n">{count}</span>
    </label>
  )
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label class="reg__switch">
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} />
      <span class="reg__track" aria-hidden="true" />
      <span class="reg__lbl">{label}</span>
    </label>
  )
}

/** The whole identifier of an anatomy hit (`event currencies.exchange_rate.created`), or null. */
const anatomyHit = (b: BuiltInCard): string | null => b.matchedOn.find((m) => ANATOMY_CHIP.test(m)) ?? null

/**
 * A built-in card's preset note split for the card (review r11): what a new app has (`On in a new app on 0.9: nothing
 * to enable.`) and, when an app from the empty preset has it off, the lead of the command for that app. Null: a new
 * app has it off.
 */
function presetParts(b: BuiltInCard): { head: string; lead: string | null } | null {
  const n = b.presetNote
  if (!n) return null
  const i = n.indexOf(EMPTY_PRESET_LEAD)
  return i < 0 ? { head: n, lead: null } : { head: n.slice(0, i).trim(), lead: EMPTY_PRESET_LEAD.replace(/:$/, '') }
}

/** The core module that answers the query: sigil, title, ID, the hit and the enable command with Copy. */
function CoreAnswer({ b, sigil }: { b: BuiltInCard; sigil?: { glyph: string; phase: number } }) {
  const hit = anatomyHit(b)
  const preset = presetParts(b)
  const svg = renderSigil({
    glyph: sigil?.glyph ?? '0000000',
    phase: sigil?.phase ?? 0,
    kind: 'built-in',
    size: 48,
    label: `${b.title}, built into core`,
  })
  return (
    <article class="reg__ans">
      <span class="reg__ans-sig" dangerouslySetInnerHTML={{ __html: svg }} />
      <div class="reg__ans-main">
        <p class="reg__ans-title">
          <a href={href(builtInPage(b.id))}>{b.title}</a>
          <TypeChipView type="built-in" />
        </p>
        <code class="reg__ans-id">{b.id}</code>
        <p class="reg__ans-desc">{b.description}</p>
        {hit && (
          <p class="reg__core-match">
            <span class="reg__core-mk">matched</span>{' '}
            <code>
              <Wrap text={hit} dots />
            </code>
          </p>
        )}
      </div>
      <div class="reg__ans-act">
        {preset && <p class="reg__ans-on">{preset.head}</p>}
        {(!preset || preset.lead) && (
          <>
            <p class="t-tagline">{preset?.lead ?? 'Enable it'}</p>
            <CommandChipView command={b.install} label="Copy enable command" />
          </>
        )}
        <a class="reg__ans-open" href={href(builtInPage(b.id))}>
          Open {b.title} <span aria-hidden="true">→</span>
        </a>
      </div>
    </article>
  )
}

/** Compact rows of built-in modules: chip, title, ID, description, the hit, copy of the enable command. */
function CoreList({ cards }: { cards: BuiltInCard[] }) {
  return (
    <ul class="reg__core-list" role="list">
      {cards.map((b) => {
        const hit = anatomyHit(b)
        return (
          <li class="reg__core-item">
            <TypeChipView type="built-in" />
            <a class="reg__core-title" href={href(builtInPage(b.id))}>
              {b.title}
            </a>
            <code class="reg__core-id">{b.id}</code>
            <span class="reg__core-desc">{b.description}</span>
            {hit && (
              <span class="reg__core-match">
                <span class="reg__core-mk">matched</span>{' '}
                <code>
                  <Wrap text={hit} dots />
                </code>
              </span>
            )}
            {/* on in a new app (review r11): the word first; the copy stays for an app from the empty preset */}
            {presetParts(b) && (
              <span class="reg__core-on" title={b.presetNote ?? undefined}>
                On
              </span>
            )}
            {presetParts(b)?.lead !== null && (
              <button
                type="button"
                class="btn btn--ghost btn--icon btn--sm reg__core-copy"
                data-copy={b.install}
                aria-label={`Copy enable command for ${b.id}`}
                title={b.install}
              >
                <Icon name="terminal" size={16} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
