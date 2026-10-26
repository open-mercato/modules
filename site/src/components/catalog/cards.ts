// The module browser's model (home and /c/*): one card per entry of browserSet plus the hidden ones (on hold,
// examples), the sidebar's categories and the `Made by` counts. Every number is counted here from the emitted data,
// over the same cards, so the hero, the sidebar, the filter and the grid agree (review of 26 Oct: 46, 31 + 7 and 40).
import type { IndexEntry, Line } from '../../../../lib/schema/index.ts'
import {
  MADE_BY,
  authorOf,
  browserSet,
  cardState,
  extraOf,
  isToolKind,
  madeByHint,
  madeByLabel,
  popularity,
  providerParents,
  recommended,
  registryDefault,
} from '../../pages/c/_data.ts'
import type { CardStateKind } from '../../pages/c/_data.ts'

export interface Card {
  path: string
  title: string
  author: string | null
  /** The human sentence of the card: what the module does (the lead of its page), built-in ids named by their titles. */
  blurb: string
  category: string
  categoryTitle: string
  type: IndexEntry['type']
  typeLabel: string
  typeHint: string
  state: { kind: CardStateKind; text: string; title: string }
  pop: { text: string; icon: 'download' | 'star'; label: string } | null
  /** Tool or library: shown with `Show more`, `Tools and libraries` or a search. */
  tool: boolean
  /** `Tool` or `Library` on the card, null for modules. */
  kindLabel: string | null
  /** A provider folded into its parent's card: shown by a search only. */
  sub: boolean
  /** The number of providers folded into this card. */
  providers: number
  /** `On hold`, `Example` or `Not listed`: shown with `Show more`, `Examples and paused modules` or a search. */
  extra: string | null
  /** Lowercase text the search matches: title, summary, when to use, tags, providers, npm name. */
  search: string
  /** Sort keys: recommended rank, name, last release day, downloads. */
  rank: number
  updated: string
  downloads: number
}

export interface SideCategory {
  id: string
  title: string
  /** Cards shown by default. */
  modules: number
  /** Default cards plus tools and libraries. */
  all: number
}

export interface MadeByCount {
  id: IndexEntry['type'] | ''
  label: string
  hint: string
  modules: number
  all: number
}

interface CardOptions {
  categories: readonly { id: string; title: string }[]
  /** Built-in modules: a snake_case id in a sentence reads as the module's title (`data_sync` is Data Sync). */
  builtIn?: readonly { id: string; title: string }[]
}

/** A card shown by default: not a tool, not a folded provider, not on hold or an example. */
export const isDefaultCard = (c: Pick<Card, 'tool' | 'sub' | 'extra'>): boolean => !c.tool && !c.sub && !c.extra

export function cardsOf(
  entries: readonly IndexEntry[],
  latest: Pick<Line, 'key' | 'version'> | null,
  opts: CardOptions,
): Card[] {
  const key = latest?.key ?? null
  const parents = providerParents(entries)
  const groups = new Map<string, IndexEntry[]>()
  for (const e of entries) {
    const p = parents.get(e.locator)
    if (p) groups.set(p, [...(groups.get(p) ?? []), e])
  }
  const browse = browserSet(entries)
  const inBrowse = new Set(browse)
  const hidden = entries.filter((e) => !inBrowse.has(e))
  const ordered = [...recommended(browse, key), ...recommended(hidden, key)]
  const cat = new Map(opts.categories.map((c) => [c.id, c.title]))
  const core = new Map((opts.builtIn ?? []).map((b) => [b.id, b.title]))
  const human = (s: string): string => s.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (id) => core.get(id) ?? id)
  return ordered.map((e, rank) => {
    const subs = groups.get(e.locator) ?? []
    const parent = subs.length > 0
    return {
      path: e.path,
      title: e.title,
      author: authorOf(e),
      // review of 26 Oct: forty cards opened on `Use when...`; `When to use` stays on the module page
      blurb: human(e.summary || e.whenToUse),
      category: e.category,
      categoryTitle: cat.get(e.category) ?? e.category,
      type: e.type,
      typeLabel: madeByLabel(e.type),
      typeHint: madeByHint(e.type),
      state: cardState(e, latest),
      pop: e.enterprise ? null : popularity(e),
      tool: isToolKind(e) && !parent,
      kindLabel: e.kind === 'tool' ? 'Tool' : e.kind === 'library' && !parent ? 'Library' : null,
      sub: parents.has(e.locator),
      providers: subs.length,
      extra: extraOf(e),
      search: [
        e.title,
        e.summary,
        e.whenToUse,
        ...e.tags,
        ...e.providers.flatMap((p) => [p.name, p.label]),
        ...subs.map((s) => s.title),
        e.npm ?? '',
      ]
        .join(' ')
        .toLowerCase(),
      rank,
      updated: e.version.publishedAt ?? e.updatedAt.slice(0, 10),
      downloads: e.stats?.downloads30d ?? -1,
    }
  })
}

/** Categories with at least one card, in the order of policy/categories.yml, with both counts over `cards`. */
export function sideCategories(
  categories: readonly { id: string; title: string }[],
  cards: readonly Card[],
  /** Kept even without a card: the category of the page. */
  keep = '',
): SideCategory[] {
  return categories
    .map((c) => {
      const mine = cards.filter((x) => x.category === c.id && !x.sub && !x.extra)
      return { id: c.id, title: c.title, modules: mine.filter((x) => !x.tool).length, all: mine.length }
    })
    .filter((c) => c.all > 0 || c.id === keep)
}

/** All, Official, Community, Third-party, with counts over `cards` (types without a card are left out). */
export function madeByCounts(cards: readonly Card[]): MadeByCount[] {
  const n = (type: string, tools: boolean): number =>
    cards.filter((c) => (type === '' || c.type === type) && !c.sub && !c.extra && (tools || !c.tool)).length
  return [
    { id: '' as const, label: 'Anyone', hint: '', modules: n('', false), all: n('', true) },
    ...MADE_BY.map((m) => ({ id: m.id, label: m.label, hint: m.hint, modules: n(m.id, false), all: n(m.id, true) })),
  ].filter((m) => m.id === '' || m.all > 0)
}

/**
 * The install line a person copies (review of 26 Oct: `one command` on the home page, then five steps on the module
 * page): the add command, then `yarn generate` and `yarn db:migrate` when the install plan of the line runs them, else
 * when the fallback says so. The agents keep the steps apart in the plan.
 */
export function installLine(
  cli: string,
  then: readonly string[] | null,
  fallback: { generate: boolean; migrate: boolean },
): string {
  const generate = then ? then.includes('yarn generate') : fallback.generate
  const migrate = then ? then.some((t) => t.startsWith('yarn db:migrate')) : fallback.migrate
  return [cli, ...(generate ? ['yarn generate'] : []), ...(migrate ? ['yarn db:migrate'] : [])].join(' && ')
}

/** Entries whose install command needs `--allow-third-party` (How to add a module says so only when one does). */
export const needsThirdPartyFlag = (entries: readonly Pick<IndexEntry, 'install'>[]): boolean =>
  entries.some((e) => e.install.cli.includes('--allow-third-party'))

/**
 * One real install command for `How to add a module`: from the list in recommended order, a module a new app of the
 * latest line does not have yet (an `Included in new apps` module has nothing to install) and that is verified there,
 * official first. Null when the list has none.
 */
export function installExample(
  entries: readonly IndexEntry[],
  latest: Pick<Line, 'key'> | null,
  /** The install plans of the site data, so the example is the same line its module page gives. */
  plans: Readonly<Record<string, Readonly<Record<string, { then: string[] } | null>>>> = {},
): { title: string; path: string; cli: string } | null {
  const key = latest?.key ?? null
  const list = recommended(registryDefault(entries), key).filter(
    (e) =>
      !e.enterprise &&
      e.install.cli.startsWith('yarn mercato module add') &&
      !(key && e.compat.inPresets?.includes(key)),
  )
  const verified = (e: IndexEntry): boolean => !!key && e.compat.verifiedOn.includes(key)
  const e = list.find((x) => x.type === 'official' && verified(x)) ?? list.find(verified)
  if (!e) return null
  const then = (key && plans[e.locator]?.[key]?.then) || null
  const tables = (e.anatomy?.counts.tables ?? 0) > 0 || (e.anatomy?.counts.migrations ?? 0) > 0
  const cli = installLine(e.install.cli, then, {
    generate: e.kind === 'module' || e.kind === 'provider',
    migrate: tables,
  })
  return { title: e.title, path: e.path, cli }
}
