// Search of spec 8.2 (MiniSearch 7.2.0, BM25 with anatomy fields): one ranking for the site, the MCP Worker,
// WebMCP, the skill and the CLI parity tests. `buildSearchIndex` makes /search-index.json, `searchModules`
// answers `search_modules` (tools@1). Isomorphic: no Node APIs.
import MiniSearch, { type AsPlainObject, type Options, type SearchResult } from 'minisearch'
import type { CategoryId, CellStatus, Kind, LicenseKind, OriginType } from '../schema/common.ts'
import type { Policy } from '../schema/data/health.ts'
import type { BuiltInModule } from '../schema/published/builtin.ts'
import type { AnatomySummary, IndexEntry } from '../schema/published/modules.ts'
import type { BuiltInCard, ModuleCard, SearchModulesInput, SearchModulesOutput } from '../schema/tools.ts'
import { latestLine, resolveLine, type LineInfo } from './lines.ts'
import { builtInEnableCommand, builtInPresetText, installInfo, isAdapter } from './plan.ts'
import {
  emptyPresetVersion,
  INSTALLABLE_META_KEY,
  installVersion,
  judgedLines,
  newAppInstallText,
  presetInstallText,
} from './policy.ts'
import type { ReceiptSource } from './source.ts'

/** Searchable fields and their weights (spec 8.2). */
export const SEARCH_BOOST = {
  title: 3,
  npm: 3,
  summary: 2,
  whenToUse: 2,
  providers: 2,
  tags: 1.5,
  aliases: 1.5,
  renamedFrom: 1,
  category: 1,
  anatomy: 1,
} as const
export type SearchField = keyof typeof SEARCH_BOOST
export const SEARCH_FIELDS = Object.keys(SEARCH_BOOST) as SearchField[]

/** `_meta` key that carries curator aliases (descriptor `aliases`) into the index entry. */
export const ALIASES_META_KEY = 'com.openmercato.modules/aliases'

/** Built-in group: at most 5, shown when its score reaches half of the best module score (spec 8.2). */
export const BUILTIN_MAX = 5
export const BUILTIN_RATIO = 0.5
export const BOOST_VERIFIED = 0.15
export const BOOST_OFFICIAL = 0.1
/** Below this many AND hits, OR hits fill the list after them. */
export const MIN_AND_RESULTS = 3
/**
 * An OR hit (one that misses some query words) that matched no query word as typed, only a fuzzy or prefix variant,
 * and scores below this share of the best hit is noise and is dropped (finding of 25 Oct: `when a deal is won`
 * listed 52 modules for a fuzzy `real`, `exchange rates` five for `change` and `rated`). AND hits, which match every
 * word, are never cut.
 */
export const WEAK_HIT_RATIO = 0.2

// Words that carry no meaning in a module query. Dropped from documents and queries alike, so an AND query
// such as "web search for agents" does not need the word "for" in a summary.
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'i',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'module',
  'modules',
  'my',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'this',
  'to',
  'via',
  'we',
  'with',
  'you',
  'your',
  // question words of a query in plain language, and the `Use when` every whenToUse starts with (finding of 25 Oct:
  // `when` matched every module)
  'can',
  'do',
  'does',
  'how',
  'need',
  'needs',
  'use',
  'used',
  'uses',
  'want',
  'wants',
  'what',
  'when',
  'which',
])

/**
 * Lower case, split on `[\s\-_.:/@]` and any other punctuation, plus whole identifiers joined by dots,
 * underscores or hyphens as extra tokens, so `customers.deal.won`, `data_sync` and `e-invoicing` also match
 * in one piece.
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const out = lower.split(/[^a-z0-9*]+/).filter((t) => t !== '')
  for (const m of lower.matchAll(/[a-z0-9]+(?:[._-][a-z0-9*]+)+/g)) out.push(m[0])
  return out
}

/** Drops stop words and one-character terms (a lone `e` of `e-invoicing` would prefix-match everything). */
export function processTerm(term: string): string | null {
  return term.length < 2 || STOPWORDS.has(term) ? null : term
}

interface Doc {
  id: string
  group: 'module' | 'builtin'
  title: string
  npm: string
  summary: string
  whenToUse: string
  providers: string
  tags: string
  aliases: string
  renamedFrom: string
  category: string
  anatomy: string
}

/** Options shared by indexing and loading (MiniSearch needs the same ones on both sides). */
export const SEARCH_OPTIONS: Options<Doc> = {
  idField: 'id',
  fields: SEARCH_FIELDS,
  storeFields: ['group'],
  tokenize,
  processTerm,
  searchOptions: { prefix: true, fuzzy: 0.2, boost: { ...SEARCH_BOOST } },
}

/** Identifiers of an anatomy, by chip kind (matchedOn). */
export interface AnatomyIds {
  /** Emitted and consumed events together (matchedOn chips). */
  event: string[]
  /** Emitted events only (`emits` filter). */
  emits: string[]
  /** Consumed events only (`consumes` filter). */
  consumes: string[]
  entity: string[]
  permission: string[]
  env: string[]
  host: string[]
  setting: string[]
  module: string[]
}

/** Per-entry data the search needs for filters and cards (compact; stored in /search-index.json). */
export interface ModuleMeta {
  locator: string
  path: string
  npm: string | null
  title: string
  summary: string
  whenToUse: string
  type: OriginType
  kind: Exclude<Kind, 'built-in'>
  category: CategoryId
  license: { spdx: string | null; kind: LicenseKind }
  tier: 'listed' | 'verified' | null
  omQuality: boolean
  verifiedOn: string[]
  lines: Record<string, { status: CellStatus; at: string | null }>
  policy: Record<string, Policy>
  version: Pick<IndexEntry['version'], 'latest' | 'preview' | 'installableFrom' | 'gitRef' | 'recommended'>
  /** Newest stable version past the age gate per line, when the entry says (INSTALLABLE_META_KEY). */
  installable?: Record<string, string | null>
  install: string
  moduleFlag: string | null
  moduleIds: string[]
  /** Lines whose new app (classic) registers the package, and lines whose app from the empty preset does too (24 Oct). */
  inPresets?: string[]
  inEmptyPreset?: string[]
  /**
   * Per line of `inPresets`, the version the command of an app from the empty preset installs where it is not the
   * install version (`emptyPresetVersion`: checkout 0.8.0 on 0.8, review of 24 Oct); absent for none.
   */
  emptyVersions?: Record<string, string>
  /**
   * An adapter's catalog entries it requires (npm locators): the libraries among them join its `yarn add` on other
   * lines too (sandbox test of 28 Oct); absent for every other entry.
   */
  peers?: string[]
  featured: boolean
  example: boolean
  listed: boolean
  providers: { name: string; label: string }[]
  tags: string[]
  ids: AnatomyIds
  page: string
}

export interface BuiltInMeta {
  id: string
  title: string
  description: string
  category: CategoryId
  install: string
  page: string
  ids: AnatomyIds
  /** Lines whose new app (classic) has it on, and lines whose app from the empty preset has it on too. */
  inPresets?: string[]
  inEmptyPreset?: string[]
}

/** /search-index.json: serialized MiniSearch plus what the cards need. */
export interface SearchIndexData {
  schemaVersion: 1
  dataVersion: string
  generatedAt: string
  /** Site root without a trailing slash; card URLs are built from it. */
  site: string
  lines: LineInfo[]
  index: AsPlainObject
  modules: Record<string, ModuleMeta>
  builtIn: Record<string, BuiltInMeta>
  /** Where the statuses come from (`dataAsOf.source`); `preview`: a preview run, not CI (review r6). */
  receiptSource?: ReceiptSource | null
}

export interface Searcher {
  ms: MiniSearch<Doc>
  data: Omit<SearchIndexData, 'index'>
}

function anatomyIds(a: Pick<AnatomySummary, 'lists'> | null | undefined, moduleIds: readonly string[]): AnatomyIds {
  const l = a?.lists
  return {
    event: [...new Set([...(l?.eventsEmitted ?? []), ...(l?.eventsConsumed ?? [])])],
    emits: [...(l?.eventsEmitted ?? [])],
    consumes: [...(l?.eventsConsumed ?? [])],
    entity: l?.tables ?? [],
    permission: l?.aclFeatures ?? [],
    env: l?.env ?? [],
    host: l?.hosts ?? [],
    setting: (l?.credentials ?? []).map((c) => c.key),
    module: [...moduleIds],
  }
}

const anatomyText = (ids: AnatomyIds) =>
  [...ids.module, ...ids.entity, ...ids.event, ...ids.permission, ...ids.setting, ...ids.env, ...ids.host].join(' ')

function aliasesOf(e: IndexEntry): string[] {
  const v = e._meta?.[ALIASES_META_KEY]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function installableField(e: IndexEntry): Pick<ModuleMeta, 'installable'> {
  const v = e._meta?.[INSTALLABLE_META_KEY]
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, string | null> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === 'string' || x === null) out[k] = x
  return { installable: out }
}

function emptyVersionsField(e: IndexEntry): Pick<ModuleMeta, 'emptyVersions'> {
  const out: Record<string, string> = {}
  for (const k of e.compat.inPresets ?? []) {
    const v = emptyPresetVersion(e, k)
    if (v && v !== installVersion(e, k)) out[k] = v
  }
  return Object.keys(out).length ? { emptyVersions: out } : {}
}

function peersField(e: IndexEntry): Pick<ModuleMeta, 'peers'> {
  if (!isAdapter(e)) return {}
  const out = e.requires.flatMap((r) => (r.resolvesTo?.startsWith('npm:') ? [r.resolvesTo] : []))
  return out.length ? { peers: out } : {}
}

export function moduleMeta(e: IndexEntry): ModuleMeta {
  // statuses of the versions a fresh app installs: a receipt of another version is not the line's verdict (review r6)
  const lines: ModuleMeta['lines'] = {}
  for (const [k, c] of Object.entries(judgedLines(e))) lines[k] = { status: c.status, at: c.at }
  return {
    locator: e.locator,
    path: e.path,
    npm: e.npm,
    title: e.title,
    summary: e.summary,
    whenToUse: e.whenToUse,
    type: e.type,
    kind: e.kind,
    category: e.category,
    license: { spdx: e.license.spdx, kind: e.license.kind },
    tier: e.tier,
    omQuality: e.quality !== null,
    verifiedOn: e.compat.verifiedOn,
    lines,
    policy: e.agentPolicy,
    version: {
      latest: e.version.latest,
      preview: e.version.preview,
      installableFrom: e.version.installableFrom,
      gitRef: e.version.gitRef,
      recommended: e.version.recommended,
    },
    ...installableField(e),
    install: e.install.cli,
    moduleFlag: e.install.moduleFlag,
    moduleIds: e.moduleIds,
    ...(e.compat.inPresets?.length ? { inPresets: e.compat.inPresets } : {}),
    ...(e.compat.inEmptyPreset?.length ? { inEmptyPreset: e.compat.inEmptyPreset } : {}),
    ...emptyVersionsField(e),
    ...peersField(e),
    featured: e.featured,
    example: e.tags.includes('example'),
    listed: e.listed,
    providers: e.providers,
    tags: e.tags,
    ids: anatomyIds(e.anatomy, e.moduleIds),
    page: e.links.page,
  }
}

export function builtInMeta(b: BuiltInModule): BuiltInMeta {
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    category: b.category,
    install: b.install,
    page: b.page,
    ids: anatomyIds(b.anatomy, [b.id]),
    ...(b.inPresets.length ? { inPresets: b.inPresets } : {}),
    ...(b.inEmptyPreset?.length ? { inEmptyPreset: b.inEmptyPreset } : {}),
  }
}

/**
 * What a new app (classic) of the line has of a built-in module, for the card (review r11: the card on / said `Enable
 * it` for currencies, which every app made the usual way has on): null when a new app has it off.
 */
export function builtInPresetNote(
  b: Pick<BuiltInMeta, 'id' | 'install' | 'inPresets' | 'inEmptyPreset'>,
  line: string | null,
): string | null {
  return builtInPresetText(b, line)
}

function moduleDoc(e: IndexEntry, m: ModuleMeta): Doc {
  return {
    id: e.locator,
    group: 'module',
    title: e.title,
    npm: [e.npm ?? e.locator.replace(/^github:/, ''), e.path].join(' '),
    summary: e.summary,
    whenToUse: e.whenToUse,
    providers: e.providers.map((p) => `${p.name} ${p.label}`).join(' '),
    tags: e.tags.join(' '),
    aliases: aliasesOf(e).join(' '),
    renamedFrom: e.renamedFrom.map((l) => l.replace(/^(npm|github):/, '')).join(' '),
    category: e.category,
    anatomy: anatomyText(m.ids),
  }
}

function builtInDoc(b: BuiltInMeta): Doc {
  return {
    id: `core:${b.id}`,
    group: 'builtin',
    title: b.title,
    npm: b.id,
    summary: b.description,
    whenToUse: '',
    providers: '',
    tags: '',
    aliases: '',
    renamedFrom: '',
    category: b.category,
    anatomy: anatomyText(b.ids),
  }
}

export interface BuildSearchIndexInput {
  entries: readonly IndexEntry[]
  builtIn: readonly BuiltInModule[]
  lines: readonly LineInfo[]
  dataVersion: string
  generatedAt: string
  site: string
  /** `dataAsOf.source` of modules.json (review r6). */
  receiptSource?: ReceiptSource | null
}

/** Builds the index and its metadata (for /search-index.json and in-memory use). */
export function buildSearchIndex(i: BuildSearchIndexInput): SearchIndexData {
  const ms = new MiniSearch<Doc>(SEARCH_OPTIONS)
  const modules: Record<string, ModuleMeta> = {}
  const builtIn: Record<string, BuiltInMeta> = {}
  const docs: Doc[] = []
  for (const e of i.entries) {
    const m = moduleMeta(e)
    modules[e.locator] = m
    docs.push(moduleDoc(e, m))
  }
  for (const b of i.builtIn) {
    const m = builtInMeta(b)
    builtIn[b.id] = m
    docs.push(builtInDoc(m))
  }
  ms.addAll(docs)
  return {
    schemaVersion: 1,
    dataVersion: i.dataVersion,
    generatedAt: i.generatedAt,
    site: i.site.replace(/\/+$/, ''),
    lines: i.lines.map((l) => ({ key: l.key, version: l.version, source: l.source })),
    index: ms.toJSON(),
    modules,
    builtIn,
    ...(i.receiptSource !== undefined ? { receiptSource: i.receiptSource } : {}),
  }
}

/** Searcher from /search-index.json (or from buildSearchIndex output). */
export function loadSearchIndex(data: SearchIndexData): Searcher {
  const { index, ...rest } = data
  return { ms: MiniSearch.loadJS<Doc>(index, SEARCH_OPTIONS), data: rest }
}

const absolute = (site: string, page: string) => (/^https?:\/\//.test(page) ? page : `${site}${page}`)

/** Chips for the fields a result matched on (spec 8.2): name, summary, provider, event, entity, permission, env. */
export function matchedOn(
  match: SearchResult['match'],
  meta: {
    providers?: readonly { name: string; label: string }[]
    tags?: readonly string[]
    ids: AnatomyIds
    category?: string
  },
  queryTerms: readonly string[] = [],
): string[] {
  const chips: string[] = []
  const add = (c: string) => {
    if (!chips.includes(c)) chips.push(c)
  }
  const has = (id: string, term: string) => tokenize(id).includes(term)
  const order: SearchField[] = [
    'title',
    'npm',
    'aliases',
    'renamedFrom',
    'providers',
    'anatomy',
    'summary',
    'whenToUse',
    'tags',
    'category',
  ]
  // terms typed in the query first, longer first: a whole identifier (`customers.deal.won`) names the chip
  // before its parts and before terms that only matched by prefix or fuzziness
  const typed = new Set(queryTerms)
  const fieldsByTerm = Object.entries(match).sort(
    (a, b) => Number(typed.has(b[0])) - Number(typed.has(a[0])) || b[0].length - a[0].length,
  )
  for (const field of order) {
    for (const [term, fields] of fieldsByTerm) {
      if (!fields.includes(field)) continue
      if (field === 'title' || field === 'npm' || field === 'aliases' || field === 'renamedFrom') add('name')
      else if (field === 'summary' || field === 'whenToUse') add('summary')
      else if (field === 'tags') {
        const tag = meta.tags?.find((t) => has(t, term))
        add(tag ? `tag ${tag}` : 'summary')
      } else if (field === 'category' && meta.category) add(`category ${meta.category}`)
      else if (field === 'providers') {
        const p = meta.providers?.find((x) => has(x.name, term) || has(x.label, term))
        add(p ? `provider ${p.label}` : 'provider')
      } else if (field === 'anatomy') anatomyChips(meta.ids, fieldsByTerm, has).forEach(add)
    }
  }
  return chips.slice(0, 5)
}

/**
 * Anatomy chips of a hit: the identifier that covers the most query terms first (review r4: `when a deal is won`
 * named `customers.deal.created`, because `deal` was longer than `won` and took the first id with `deal` in it), then
 * the next one for the terms still uncovered. Ties keep the old order: an exact id, the earlier term (typed, longer),
 * then the kind order event, entity, permission, env, setting, host, module.
 */
function anatomyChips(
  ids: AnatomyIds,
  fieldsByTerm: readonly (readonly [string, readonly string[]])[],
  has: (id: string, term: string) => boolean,
): string[] {
  const kinds: (keyof AnatomyIds)[] = ['event', 'entity', 'permission', 'env', 'setting', 'host', 'module']
  const terms = fieldsByTerm.filter(([, f]) => f.includes('anatomy')).map(([t]) => t)
  const left = new Set(terms)
  const out: string[] = []
  while (left.size > 0) {
    let best: { chip: string; covers: string[]; exact: boolean; first: number } | null = null
    for (const k of kinds)
      for (const id of ids[k]) {
        const covers = terms.filter((t) => left.has(t) && (id === t || has(id, t)))
        if (covers.length === 0) continue
        const exact = covers.includes(id)
        const first = terms.indexOf(covers[0] as string)
        const better =
          !best ||
          covers.length > best.covers.length ||
          (covers.length === best.covers.length &&
            (exact && !best.exact ? true : exact === best.exact && first < best.first))
        if (better) best = { chip: `${k} ${id}`, covers, exact, first }
      }
    if (!best) break
    out.push(best.chip)
    for (const t of best.covers) left.delete(t)
  }
  return out
}

/** Relevance order without a query (spec 8.2): OM Quality > Verified > Listed, featured, receipt freshness, name. */
export function relevanceCompare(line: string | null) {
  const level = (m: Pick<ModuleMeta, 'omQuality' | 'tier'>) =>
    m.omQuality ? 0 : m.tier === 'verified' ? 1 : m.tier === 'listed' ? 2 : 3
  const fresh = (m: Pick<ModuleMeta, 'lines'>) => {
    const at = line ? m.lines[line]?.at : null
    return at ? Date.parse(at) : 0
  }
  return (
    a: Pick<ModuleMeta, 'omQuality' | 'tier' | 'featured' | 'lines' | 'title'>,
    b: Pick<ModuleMeta, 'omQuality' | 'tier' | 'featured' | 'lines' | 'title'>,
  ) =>
    level(a) - level(b) ||
    Number(b.featured) - Number(a.featured) ||
    fresh(b) - fresh(a) ||
    a.title.localeCompare(b.title)
}

/** Line status of an entry: `recommended` counts as verified (D46). */
function statusOn(m: ModuleMeta, line: string): CellStatus {
  if (m.version.recommended[line]) return 'verified'
  return m.lines[line]?.status ?? 'untested'
}

/** The command of an app that does not register the package yet (an app from the empty preset), on a line. */
function commandFor(
  m: ModuleMeta,
  line: string | null,
  latest: string | null,
  metas: Readonly<Record<string, ModuleMeta>> = {},
): string {
  if (line === null || line === latest) return m.install
  // where the empty preset registers it too (events), `yarn add`, never `module add` (D10)
  const both = !!m.npm && (m.inEmptyPreset ?? []).includes(line)
  return installInfo(
    {
      npm: m.npm,
      locator: m.locator,
      moduleIds: m.moduleIds,
      version: { ...m.version, publishedAt: null, integrity: null },
      ...(m.installable ? { installableVersions: m.installable } : {}),
      moduleFlag: m.moduleFlag,
      kind: m.kind,
      tags: m.tags,
      requires: (m.peers ?? []).map((l) => ({ raw: l.slice(4), resolvesTo: l })),
    },
    line,
    both ? m.moduleIds.map((id) => ({ id, from: m.npm as string })) : null,
    m.emptyVersions?.[line],
    (l) => {
      const p = metas[l]
      return p
        ? {
            locator: p.locator,
            npm: p.npm,
            kind: p.kind,
            version: { ...p.version, publishedAt: null, integrity: null },
            ...(p.installable ? { installableVersions: p.installable } : {}),
          }
        : null
    },
  ).cli
}

/**
 * What a card says about installing on a line (review of 24 Oct: `install` gave `yarn mercato module add
 * @open-mercato/webhooks@0.9.0` with no label next to `allow` and `Nothing to install: a new app already registers
 * webhooks`). Where a new app already registers the package, `install` is that sentence, `presetNote` the page's whole
 * install sentence and `installEmptyPreset` the command of an app from the empty preset (null when that preset
 * registers it too); elsewhere `install` is the command.
 */
export function installFields(
  m: ModuleMeta,
  line: string | null,
  latest: string | null,
  /** The search index's entries, for the libraries an adapter peers on (`peerLibrarySpecs`). */
  metas: Readonly<Record<string, ModuleMeta>> = {},
): Pick<ModuleCard, 'install' | 'presetNote' | 'installEmptyPreset'> {
  const command = commandFor(m, line, latest, metas)
  if (line === null || !(m.inPresets ?? []).includes(line)) return { install: command }
  const empty = (m.inEmptyPreset ?? []).includes(line) ? null : command
  return {
    install: presetInstallText(m.moduleIds),
    presetNote: newAppInstallText(m.moduleIds, empty),
    installEmptyPreset: empty,
  }
}

/**
 * The query with one swap of two adjacent letters undone in one word (`stirpe` -> `stripe`, `ksfe` -> `ksef`):
 * MiniSearch counts a swap as two edits, more than `fuzzy: 0.2` allows a word under ten letters (finding of 25 Oct:
 * a one-letter slip read `No module does that yet` with Stripe and KSeF in the catalog). At most 60 variants.
 */
export function swapVariants(query: string): string[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length > 6) return []
  const out: string[] = []
  words.forEach((w, i) => {
    // a stop word is not a typo to undo (`use when` read as `ues when` and found channel-ses)
    if (w.length < 3 || w.length > 24 || !/^[a-z0-9]+$/.test(w) || processTerm(w) === null) return
    for (let j = 0; j < w.length - 1; j++) {
      if (w[j] === w[j + 1]) continue
      const swapped = `${w.slice(0, j)}${w[j + 1]}${w[j]}${w.slice(j + 2)}`
      out.push([...words.slice(0, i), swapped, ...words.slice(i + 1)].join(' '))
    }
  })
  return [...new Set(out)].slice(0, 60)
}

/** Defaults of SearchModulesInput (lib/schema/tools.ts), applied without Zod so the browser search stays small. */
export const SEARCH_DEFAULTS = { verifiedOnly: false, includeBuiltIn: true, includeExamples: false, limit: 10 } as const

/**
 * `search_modules` (tools@1). The caller validates untrusted input with SearchModulesInput (the MCP handler and the
 * CLI do; the site passes typed input), this function applies the defaults; `combineWith` is AND, with OR as a
 * fallback when nothing matches. Without a query (absent, blank, or stop words only next to a filter) the
 * filters alone pick the modules, in the relevance order of the registry; built-ins then come only with a category,
 * event or kind filter. Zod stays out of
 * this module so the site's search chunk does not carry it.
 */
export function searchModules(searcher: Searcher, rawInput: SearchModulesInput): SearchModulesOutput {
  return search(searcher, rawInput, SEARCH_MAX_LIMIT)
}

/** The cap of `limit` in the tool contract (tools@1 SearchModulesInput). */
export const SEARCH_MAX_LIMIT = 20

/**
 * The registry page's search: the same ranking as `search_modules` with every match returned (finding of 25 Oct). The
 * page holds the whole index and applies level, license, line and held after the search, so the cap of 20 hid the
 * matching entries of a level ranked below it (`module` + Listed showed none of 17). The tools keep the cap.
 */
export function searchAll(searcher: Searcher, rawInput: Omit<SearchModulesInput, 'limit'>): SearchModulesOutput {
  return search(searcher, { ...rawInput, limit: Number.POSITIVE_INFINITY }, Number.POSITIVE_INFINITY)
}

function search(searcher: Searcher, rawInput: SearchModulesInput, maxLimit: number): SearchModulesOutput {
  const input = {
    ...rawInput,
    query: rawInput.query ?? '',
    verifiedOnly: rawInput.verifiedOnly ?? SEARCH_DEFAULTS.verifiedOnly,
    includeBuiltIn: rawInput.includeBuiltIn ?? SEARCH_DEFAULTS.includeBuiltIn,
    includeExamples: rawInput.includeExamples ?? SEARCH_DEFAULTS.includeExamples,
    limit: Math.min(maxLimit, Math.max(1, Math.floor(rawInput.limit ?? SEARCH_DEFAULTS.limit))),
  }
  const { data } = searcher
  const latest = latestLine(data.lines)?.key ?? null
  const line = input.omVersion ? resolveLine(input.omVersion, data.lines).line : latest
  const boostDocument = (id: unknown) => {
    const m = data.modules[String(id)]
    if (!m) return 1
    const verified = line !== null && statusOn(m, line) === 'verified' ? 1 : 0
    return 1 + BOOST_VERIFIED * verified + BOOST_OFFICIAL * (m.type === 'official' ? 1 : 0)
  }
  const wantKinds = input.kind
  const moduleOk = (m: ModuleMeta) =>
    m.listed &&
    (input.includeExamples || !m.example) &&
    (!input.category || m.category === input.category) &&
    (!input.type || input.type.includes(m.type)) &&
    (!wantKinds || wantKinds.includes(m.kind)) &&
    (!input.verifiedOnly || (line !== null && statusOn(m, line) === 'verified')) &&
    (!input.emits || m.ids.emits.includes(input.emits)) &&
    (!input.consumes || m.ids.consumes.includes(input.consumes)) &&
    (!input.provider ||
      m.providers.some(
        (p) => p.name === input.provider!.toLowerCase() || p.label.toLowerCase() === input.provider!.toLowerCase(),
      ))
  const builtInOk = (b: BuiltInMeta) =>
    input.includeBuiltIn &&
    (!wantKinds || wantKinds.includes('built-in')) &&
    (!input.type || input.type.includes('official')) &&
    (!input.category || b.category === input.category) &&
    !input.provider &&
    !input.verifiedOnly &&
    (!input.emits || b.ids.emits.includes(input.emits)) &&
    (!input.consumes || b.ids.consumes.includes(input.consumes))

  const moduleCard = (m: ModuleMeta, chips: string[]): ModuleCard => ({
    locator: m.locator,
    path: m.path,
    title: m.title,
    summary: m.summary,
    whenToUse: m.whenToUse,
    type: m.type,
    kind: m.kind,
    category: m.category,
    license: m.license,
    tier: m.tier,
    omQuality: m.omQuality,
    verifiedOn: m.verifiedOn,
    line,
    status: line ? statusOn(m, line) : null,
    agentPolicy: line ? (m.policy[line] ?? null) : null,
    installableFrom: m.version.installableFrom,
    ...installFields(m, line, latest, data.modules),
    matchedOn: chips,
    card: absolute(data.site, m.page),
  })
  const builtInCard = (b: BuiltInMeta, chips: string[]): BuiltInCard => ({
    id: b.id,
    title: b.title,
    description: b.description,
    category: b.category,
    enabled: null,
    install: b.install || builtInEnableCommand(b.id),
    page: absolute(data.site, b.page),
    matchedOn: chips,
    presetNote: builtInPresetNote(b, line),
  })
  const output = (
    results: ModuleCard[],
    builtIn: BuiltInCard[],
    total: number,
    didYouMean: string | null,
  ): SearchModulesOutput => ({
    results,
    builtIn,
    total,
    line,
    dataVersion: data.dataVersion,
    generatedAt: data.generatedAt,
    ...(data.receiptSource !== undefined ? { receiptSource: data.receiptSource } : {}),
    ...(didYouMean ? { didYouMean } : {}),
  })

  // no query (finding of 25 Oct: `{ consumes }` alone and `query: ""` were refused): the filters pick, the chips name
  // the filters a card matched. A query of stop words only (`when`, `use`) next to a filter counts as no query, so a
  // filler word does not empty the answer the filter alone gives (review of 25 Oct); without a filter it finds nothing.
  const filtered = !!(
    input.category ||
    input.emits ||
    input.consumes ||
    input.provider ||
    input.type ||
    wantKinds ||
    input.verifiedOnly
  )
  const words = tokenize(input.query).some((t) => processTerm(t) !== null)
  if (input.query.trim() === '' || (filtered && !words)) {
    const filterChips = (category: string, providers: readonly { name: string; label: string }[]): string[] => [
      ...(input.emits ? [`event ${input.emits}`] : []),
      ...(input.consumes && input.consumes !== input.emits ? [`event ${input.consumes}`] : []),
      ...(input.provider
        ? providers
            .filter(
              (p) =>
                p.name === input.provider!.toLowerCase() || p.label.toLowerCase() === input.provider!.toLowerCase(),
            )
            .slice(0, 1)
            .map((p) => `provider ${p.label}`)
        : []),
      ...(input.category ? [`category ${category}`] : []),
    ]
    const mods = Object.values(data.modules).filter(moduleOk).sort(relevanceCompare(line))
    const narrowed = !!(input.category || input.emits || input.consumes || wantKinds)
    const bis = narrowed
      ? Object.values(data.builtIn)
          .filter(builtInOk)
          .sort((a, b) => a.title.localeCompare(b.title))
      : []
    return output(
      mods.slice(0, input.limit).map((m) => moduleCard(m, filterChips(m.category, m.providers))),
      bis.slice(0, BUILTIN_MAX).map((b) => builtInCard(b, filterChips(b.category, []))),
      mods.length,
      null,
    )
  }

  const run = (combineWith: 'AND' | 'OR', query: string = input.query) => {
    const hits = searcher.ms.search(query, {
      combineWith,
      prefix: true,
      fuzzy: 0.2,
      boost: { ...SEARCH_BOOST },
      boostDocument,
    })
    const mods: { m: ModuleMeta; r: SearchResult }[] = []
    const bis: { b: BuiltInMeta; r: SearchResult }[] = []
    for (const r of hits) {
      const id = String(r.id)
      if (r['group'] === 'builtin') {
        const b = data.builtIn[id.replace(/^core:/, '')]
        if (b && builtInOk(b)) bis.push({ b, r })
      } else {
        const m = data.modules[id]
        if (m && moduleOk(m)) mods.push({ m, r })
      }
    }
    return { mods, bis }
  }
  // AND first; nothing at all: OR (spec 8.2). Fewer than MIN_AND_RESULTS modules: OR-only modules are appended
  // after the AND ones, so a two-word query still shows close matches.
  const none = (x: ReturnType<typeof run>): boolean => x.mods.length === 0 && x.bis.length === 0
  const topOf = (x: ReturnType<typeof run>): number => Math.max(x.mods[0]?.r.score ?? 0, x.bis[0]?.r.score ?? 0)
  // weak OR hits (no word as typed, below WEAK_HIT_RATIO of the best score), modules and built-ins alike, are dropped
  const typed = new Set(tokenize(input.query).filter((t) => processTerm(t) !== null))
  const strong = <T extends { r: SearchResult }>(xs: readonly T[], top: number): T[] =>
    xs.filter((x) => x.r.score >= WEAK_HIT_RATIO * top || Object.keys(x.r.match).some((t) => typed.has(t)))
  let found = run('AND')
  let didYouMean: string | null = null
  if (none(found)) {
    const or = run('OR')
    const top = topOf(or)
    found = { mods: strong(or.mods, top), bis: strong(or.bis, top) }
    // still nothing: one swapped pair of letters (`stirpe`), the variant with the best hit wins
    if (none(found)) {
      let best: { v: string; f: typeof found; top: number } | null = null
      for (const v of swapVariants(input.query)) {
        const f = run('AND', v)
        const top = Math.max(f.mods[0]?.r.score ?? 0, f.bis[0]?.r.score ?? 0)
        if (!none(f) && (!best || top > best.top)) best = { v, f, top }
      }
      if (best) {
        found = best.f
        didYouMean = best.v
      }
    }
  } else if (found.mods.length < MIN_AND_RESULTS && tokenize(input.query).filter((t) => processTerm(t)).length > 1) {
    const or = run('OR')
    const top = Math.max(topOf(found), topOf(or))
    const seen = new Set(found.mods.map((x) => x.m.locator))
    found = { mods: [...found.mods, ...strong(or.mods, top).filter((x) => !seen.has(x.m.locator))], bis: found.bis }
  }

  const best = found.mods[0]?.r.score ?? 0
  const q = (didYouMean ?? input.query).trim().toLowerCase()
  const builtIn: BuiltInCard[] = found.bis
    .filter(
      ({ b, r }) =>
        r.score >= BUILTIN_RATIO * best || b.title.toLowerCase() === q || b.id === q.replace(/[\s-]+/g, '_'),
    )
    .slice(0, BUILTIN_MAX)
    .map(({ b, r }) => builtInCard(b, matchedOn(r.match, { ids: b.ids }, r.queryTerms)))
  const results = found.mods.slice(0, input.limit).map(({ m, r }) => moduleCard(m, matchedOn(r.match, m, r.queryTerms)))
  return output(results, builtIn, found.mods.length, didYouMean)
}
