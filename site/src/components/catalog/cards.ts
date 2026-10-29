// The module browser's model (home and /c/*): one card per entry of browserSet plus the hidden ones (on hold,
// examples), the sidebar's categories and the `Made by` counts. Every number is counted here from the emitted data,
// over the same cards, so the hero, the sidebar, the filter and the grid agree (review of 26 Oct: 46, 31 + 7 and 40).
import { presetFlagOf } from '../../../../lib/core/plan.ts'
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
 * when the fallback says so. The agents keep the steps apart in the plan. A step the command already runs is not
 * added twice (the enterprise command ends in `&& yarn generate`). The page uses it for every command of every line
 * (review of 28 Oct: the other versions gave the bare add command).
 */
export function installLine(
  cli: string,
  then: readonly string[] | null,
  fallback: { generate: boolean; migrate: boolean },
): string {
  const has = cli.split(' && ')
  const generate = (then ? then.includes('yarn generate') : fallback.generate) && !has.includes('yarn generate')
  const migrate =
    (then ? then.some((t) => t.startsWith('yarn db:migrate')) : fallback.migrate) && !has.includes('yarn db:migrate')
  return [cli, ...(generate ? ['yarn generate'] : []), ...(migrate ? ['yarn db:migrate'] : [])].join(' && ')
}

/**
 * The create-mercato-module way under the main command, or null when the data has none or it is the same command.
 * It ends like the main command (review of 28 Oct: `npx create-mercato-module install` only adds and enables the
 * module, it runs neither `yarn generate` nor `yarn db:migrate`, so the bare command left the module unregistered and
 * without tables).
 */
export function installAltLine(
  cli: string,
  cmm: string | null | undefined,
  then: readonly string[] | null,
  fallback: { generate: boolean; migrate: boolean },
): string | null {
  return cmm && cmm !== cli ? installLine(cmm, then, fallback) : null
}

/** A plan line run in a shell, as opposed to an edit by hand (`Remove { id ... } from src/modules.ts`). */
const isShellStep = (s: string): boolean => /^(?:yarn|npx|npm|node|pnpm|bun|echo) /.test(s)

/** A plan line that installs another package (`yarn add`, `module add`, `create-mercato-module install`). */
const addsPackage = (s: string): boolean =>
  /^(?:yarn add |yarn mercato module add |npx create-mercato-module install )/.test(s)

/** Consecutive `yarn add` lines as one (`yarn add @open-mercato/web-research@0.9.0 @open-mercato/web-research-model@0.9.0`). */
function mergeYarnAdds(steps: readonly string[]): string[] {
  const out: string[] = []
  for (const s of steps) {
    const prev = out[out.length - 1]
    const plain = (x: string): boolean => x.startsWith('yarn add ') && !x.includes(' && ')
    if (prev && plain(prev) && plain(s)) out[out.length - 1] = `${prev} ${s.slice('yarn add '.length)}`
    else out.push(s)
  }
  return out
}

/** The steps of a line's install plan as the Install card gives them (`planInstallLine`). */
export interface PlanInstallLine {
  /** Edits by hand, each its own step before the command (plan order: the removal comes first). */
  manual: string[]
  /** The plan's shell commands joined with &&, then yarn generate and yarn db:migrate as the plan runs them. */
  command: string
  /** The same with the entry's own `module add` swapped for create-mercato-module, or null. */
  alt: string | null
  /** Packages the command installs before the entry's own (its requires). */
  required: number
}

/**
 * The command a person copies for one line, from that line's install plan (audit of 29 Oct, R3: the card gave the
 * package's own command, without the UI library terminal-tracking needs, durable-work, or the removal of data_sync).
 * Shell lines join with &&; an edit by hand (`Remove { id ... } from src/modules.ts`) is never joined into the command,
 * it stands as a step of its own. The create-mercato-module way swaps only the entry's own `module add` and keeps the
 * other packages. Without a plan, or with a plan that has no command of the entry, the entry's own command.
 */
export function planInstallLine(
  own: string,
  cmm: string | null | undefined,
  /** npm name, or the GitHub repository, that finds the entry's own command among the plan's. */
  name: string | null,
  commands: readonly string[] | null | undefined,
  then: readonly string[] | null,
  fallback: { generate: boolean; migrate: boolean },
): PlanInstallLine {
  const shell = (commands ?? []).filter(isShellStep)
  const mentions = (c: string): boolean =>
    !!name && c.split(' ').some((t) => t === name || t.startsWith(`${name}@`) || t === `npm:${name}`)
  const at = shell.findLastIndex(mentions)
  if (at < 0) {
    return {
      manual: [],
      command: installLine(own, then, fallback),
      alt: installAltLine(own, cmm, then, fallback),
      required: 0,
    }
  }
  const manual = (commands ?? []).filter((c) => !isShellStep(c))
  const join = (steps: readonly string[]): string => installLine(mergeYarnAdds(steps).join(' && '), then, fallback)
  const command = join(shell)
  const swap = cmm && shell[at]!.startsWith('yarn mercato module add ') ? shell.with(at, cmm) : null
  const alt = swap ? join(swap) : null
  return {
    manual,
    command,
    alt: alt && alt !== command ? alt : null,
    required: shell.filter((c, i) => i !== at && addsPackage(c)).length,
  }
}

/** The text of a step done by hand (`Remove { id: 'data_sync', from: '@open-mercato/core' } from src/modules.ts`). */
export function manualStepText(step: string): string {
  const m = /^Remove (\{.*\}) from (\S+)$/.exec(step)
  return m ? `In ${m[2]}, remove ${m[1]}.` : `${step.replace(/\.$/, '')}.`
}

/**
 * The fine print under the README note (audit of 29 Oct, R9): the catalog tests the Install steps of a module only;
 * for a kind the nightly run never installs, the words of the skipped strip say so. Null where Install has no steps.
 */
export function readmeInstallFine(variant: string, skip: string | null): string | null {
  if (variant !== 'steps' && variant !== 'preset') return null
  return skip
    ? `${skip} The catalog has not tested these steps.`
    : 'The catalog tests those steps. Install notes in the README may be out of date.'
}

/** The words around the install command of a module page, from the kind of the entry. */
export interface InstallWords {
  /** One sentence above the steps that says what the package is, or null for a module. */
  lead: string | null
  /** The text of the first step, the one with the command. */
  first: string
  /** True when `Restart the app.` closes the steps. */
  restart: boolean
}

/**
 * What the Install card says around the command, written once from the kind, never per package (Piotr, 28 Oct: the
 * web-research page said `yarn add` and `Restart the app.`, which does not turn on a module). A module, and a provider
 * that ships modules, is added and registered. A library is a dependency other modules use, nothing to turn on and no
 * restart (the install plan has none). A provider without modules is an adapter that `yarn generate` registers (OM
 * docs: framework/ai-assistant/web-research). A tool runs in a terminal.
 */
export function installWords(
  kind: IndexEntry['kind'],
  hasModules: boolean,
  does: { generate: boolean; migrate: boolean },
  /**
   * Packages the command adds before the entry's own: the catalog libraries of a provider (sandbox test of 28 Oct:
   * web-research-model), the requires of a module (audit of 29 Oct, R3: terminal-tracking adds @freighttech/ui).
   */
  required = 0,
): InstallWords {
  if (kind === 'tool') return { lead: null, first: 'Run this in a terminal.', restart: false }
  const what = kind === 'library' ? 'library' : kind === 'provider' && !hasModules ? 'provider' : 'module'
  const noun = what === 'provider' ? ['library', 'libraries'] : ['package', 'packages']
  const withPeers = required > 0 ? ` with the ${required === 1 ? noun[0] : noun[1]} it needs` : ''
  const parts = [
    `adds the ${what}${withPeers}`,
    ...(does.generate ? ['registers it'] : []),
    ...(does.migrate ? ['creates its database tables'] : []),
  ]
  const first = `Run this in your app folder. It ${parts.length <= 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`}.`
  if (what === 'library')
    return {
      lead: 'A library other modules use, not a module. There is nothing to turn on in the app.',
      first,
      restart: false,
    }
  if (what === 'provider')
    return {
      lead: `A provider for the modules that use it, not a module of its own.${does.generate ? ' After yarn add, yarn generate registers it so those modules can use it.' : ''}`,
      first,
      restart: true,
    }
  return { lead: null, first, restart: true }
}

/** Entries whose install command needs `--allow-third-party` (How to add a module says so only when one does). */
export const needsThirdPartyFlag = (entries: readonly Pick<IndexEntry, 'install'>[]): boolean =>
  entries.some((e) => e.install.cli.includes('--allow-third-party'))

/**
 * One real install command for `How to add a module`: from the list in recommended order, a module a new app of the
 * latest line does not have yet (an `Included in new apps` module has nothing to install, one it registers behind an
 * env flag is turned on another way) and that is verified there, official first. Null when the list has none.
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
      // a new app registers storage_s3 behind a flag, where module add would add it twice (audit of 29 Oct, C07)
      !presetFlagOf(e) &&
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
