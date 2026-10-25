// Receipt helpers for the strip, the matrix and the paper receipt. Build time (pages and Astro components).
import type { CellStatus, IndexEntry, Receipt, Step } from '../../../lib/schema/index.ts'
import {
  explainReceiptStep,
  findingText,
  stepErrorText,
  type ExplainContext,
  type RouteFact,
} from '../../../lib/core/finding.ts'

import { STEPS as LADDER } from '../../../lib/core/steps.ts'
import { receiptPreset } from '../../../lib/core/lines.ts'
import { PREVIEW_CHIP, PREVIEW_SENTENCE } from '../../../lib/core/source.ts'
import { STATUS } from './status.ts'
import { breakSegments, wbrHtml } from './wrap.ts'

/** The nine steps of a receipt, from the one ladder of lib/core/steps.ts. */
export const STEPS: Step[] = [...LADDER]

/** Last receipt of a line (by run time). */
export function lastReceipt(receipts: Receipt[], line: string): Receipt | null {
  let best: Receipt | null = null
  for (const r of receipts) if (r.om.line === line && (!best || r.run.at > best.run.at)) best = r
  return best
}

/**
 * Status per night for the last `nights` nights ending at `end` (IsoDate). Receipts are stored only on transitions
 * and weekly refreshes (spec 4.5), so a night carries the status of the latest receipt at or before it; nights
 * before the first receipt are null.
 */
export function nightHistory(receipts: Receipt[], line: string, end: string, nights = 30): (CellStatus | null)[] {
  const mine = receipts.filter((r) => r.om.line === line).sort((a, b) => (a.run.at < b.run.at ? -1 : 1))
  const endMs = Date.parse(`${end}T23:59:59Z`)
  const out: (CellStatus | null)[] = []
  for (let i = nights - 1; i >= 0; i--) {
    const t = endMs - i * 86_400_000
    let s: CellStatus | null = null
    for (const r of mine) if (Date.parse(r.run.at) <= t) s = r.result.status
    out.push(s)
  }
  return out
}

/**
 * `nightHistory` with the mark of each night (round 14, spec 6.7): a run Yarn's age gate stopped on a dependency is
 * `held`, the neutral plate of a run that judged nothing, never the yellow of a release in the gate.
 */
export function nightMarks(
  receipts: Receipt[],
  line: string,
  end: string,
  nights = 30,
): (CellStatus | 'held' | null)[] {
  const mine = receipts.filter((r) => r.om.line === line).sort((a, b) => (a.run.at < b.run.at ? -1 : 1))
  const endMs = Date.parse(`${end}T23:59:59Z`)
  const out: (CellStatus | 'held' | null)[] = []
  for (let i = nights - 1; i >= 0; i--) {
    const t = endMs - i * 86_400_000
    let s: CellStatus | 'held' | null = null
    for (const r of mine)
      if (Date.parse(r.run.at) <= t)
        s = r.result.status === 'quarantine' && r.result.failedStep ? 'held' : r.result.status
    out.push(s)
  }
  return out
}

/**
 * Whether a failed `add` failed in the `generate` that `yarn mercato module add` runs itself (round 14: the paper read
 * `add FAIL` and `generate SKIP` above `[generate] Duplicate backend route ...`, as if generate never ran): the excerpt
 * of the add step starts a line with `[generate]`.
 */
export function generateInAdd(r: Pick<Receipt, 'result' | 'steps'>): boolean {
  if (r.result.failedStep !== 'add') return false
  const excerpt = r.steps.find((s) => s.name === 'add')?.excerpt ?? ''
  return /^\s*\[generate\]/m.test(excerpt)
}

export type StepMark = 'pass' | 'fail' | 'skipped' | 'none'

/** Nine marks, one per ladder step, from a receipt (none when there is no receipt). */
export function stepMarks(r: Receipt | null): StepMark[] {
  return STEPS.map((name) => {
    const s = r?.steps.find((x) => x.name === name)
    return s ? s.status : 'none'
  })
}

/** Built-in modules with the lines whose app from the empty preset enables them (`built-in.json` `inEmptyPreset`). */
export interface NewAppModules {
  modules: readonly { id: string; inPresets: readonly string[]; inEmptyPreset?: readonly string[] }[]
  /**
   * Catalog packages with the lines whose new app (classic) and app from the empty preset register them (round 13),
   * so a finding can name the package that already has a module (`the webhooks module (@open-mercato/webhooks)`).
   */
  packages?: readonly {
    npm: string | null
    moduleIds: readonly string[]
    compat: { inPresets?: readonly string[]; inEmptyPreset?: readonly string[] }
  }[]
  /**
   * The lists of src/modules.ts per line and preset the emitter judged with (modules.json `lines[].presets`, round 14),
   * so a finding names the package that registers a module even when that package is no catalog entry, exactly as
   * the cell's `finding` of lib/core/health.ts does. Absent in older data: the two lists above.
   */
  presets?: Readonly<
    Record<
      string,
      { classic: readonly { id: string; from: string }[] | null; empty: readonly { id: string; from: string }[] }
    >
  >
}

/** What a receipt's app registers: the built-in modules and the catalog packages of the site data (round 13). */
export function appModules(d: {
  builtIn: NewAppModules
  modules: {
    entries: NonNullable<NewAppModules['packages']>
    lines?: readonly { key: string; presets?: NonNullable<NewAppModules['presets']>[string] }[]
  }
}): NewAppModules {
  const presets = Object.fromEntries((d.modules.lines ?? []).flatMap((l) => (l.presets ? [[l.key, l.presets]] : [])))
  return {
    modules: d.builtIn.modules,
    packages: d.modules.entries,
    ...(Object.keys(presets).length > 0 ? { presets } : {}),
  }
}

/**
 * The explanation context of a receipt (lib/core/finding.ts): for a receipt of an app from the empty preset, what that
 * preset enables on the line (undefined for an ID that is not built in), so a 403 names the module it has off; a
 * receipt of a new app (classic) says nothing about the empty preset. `routes` are the facts of the installed version,
 * so an old smoke excerpt still names its route.
 */
export function newAppContext(
  builtIn: NewAppModules,
  line: string,
  routes?: readonly RouteFact[],
  preset: 'classic' | 'empty' = 'empty',
): ExplainContext {
  const byId = new Map(builtIn.modules.map((b) => [b.id, b.inEmptyPreset ?? []]))
  const on = (lines: readonly string[] | undefined): boolean => (lines ?? []).includes(line)
  const registeredBy = (id: string): string | undefined => {
    // the exact list of the line and preset, when the data carries it (round 14)
    const list = builtIn.presets?.[line]?.[preset]
    if (list) return list.find((m) => m.id === id)?.from
    const b = builtIn.modules.find((m) => m.id === id)
    if (b && on(preset === 'classic' ? b.inPresets : b.inEmptyPreset)) return '@open-mercato/core'
    const p = builtIn.packages?.find(
      (x) =>
        x.npm && x.moduleIds.includes(id) && on(preset === 'classic' ? x.compat.inPresets : x.compat.inEmptyPreset),
    )
    return p?.npm ?? undefined
  }
  return {
    ...(preset === 'empty'
      ? { enabledInEmptyPreset: (id: string) => (byId.has(id) ? byId.get(id)!.includes(line) : undefined) }
      : {}),
    ...(routes ? { routes } : {}),
    preset,
    registeredBy,
  }
}

/** Routes of a facts file (the module page's `detail.facts`), for `newAppContext`. */
export function routesOf(
  facts: { modules: readonly { http: { routes: readonly RouteFact[] } }[] } | null | undefined,
): RouteFact[] | undefined {
  return facts ? facts.modules.flatMap((m) => [...m.http.routes]) : undefined
}

/** Why the failed step of a receipt failed, in one sentence, when its excerpt says it plainly (lib/core/finding.ts). */
export function explainReceipt(
  r: Receipt | null,
  builtIn: NewAppModules,
  routes?: readonly RouteFact[],
): string | null {
  if (!r) return null
  return explainReceiptStep(r, newAppContext(builtIn, r.om.line, routes, receiptPreset(r)))
}

/**
 * First error of a receipt in one sentence: the explanation when the excerpt gives one ("GET /api/events needs the
 * workflows.view feature ..."), else "Broken at typecheck: TS2321 Excessive stack depth ...".
 */
export function firstError(r: Receipt | null, max = 140, builtIn?: NewAppModules): string | null {
  // a run Yarn's age gate stopped on a dependency judged nothing (round 14): its install log is no error of the module
  if (!r || !r.result.failedStep || r.result.status === 'quarantine') return null
  const why = builtIn ? explainReceipt(r, builtIn) : null
  if (why) return why
  const text = stepErrorText(r)
  // the dictionary word of a break (review r6), as in the strip and the agent policy
  const sentence = `Broken at ${r.result.failedStep}${text ? `: ${text}` : '.'}`
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence
}

/**
 * The error of a receipt without the `Broken at <step>:` prefix, for places whose first sentence already names the
 * state (review r8: the drawer said `Broken at typecheck on 0.8 since 23 Oct.` and then `Broken at typecheck: TS2307
 * ...`, as the /compat popover did before r7): the explanation when the excerpt gives one, else what the step
 * printed, else `<step> failed.`
 */
export function errorLine(r: Receipt | null, max = 140, builtIn?: NewAppModules): string | null {
  // a run Yarn's age gate stopped on a dependency (round 14: `Failed with errors in 29s 11ms` under `Not judged on 0.8`):
  // the sentence above it says why, the install log is no error of the module
  if (!r || !r.result.failedStep || r.result.status === 'quarantine') return null
  const why = builtIn ? explainReceipt(r, builtIn) : null
  // an explanation is one written sentence: never cut in the middle (round 13: `(@open-mercato/webhook…`)
  if (why) return why
  const text = stepErrorText(r) || `${r.result.failedStep} failed.`
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** One row of the Transitions list of a module page: the receipt and its state before and after, in words. */
export interface TransitionRow {
  r: Receipt
  from: string
  to: string
}

/**
 * The Transitions of a module page, newest first: the collector's `transition` of each receipt (per line and preset,
 * lib/receipts/state.ts), in the dictionary words (`verified -> broken at typecheck`), a receipt of an app from the
 * empty preset named as such (`in isolation: verified -> broken at smoke`).
 */
export function transitionRows(receipts: readonly Receipt[]): TransitionRow[] {
  const all = [...receipts].sort((a, b) => (a.run.at < b.run.at ? -1 : 1))
  const out: TransitionRow[] = []
  for (const r of all) {
    if (r.transition.from === r.transition.to) continue
    const iso = r.module !== null && receiptPreset(r) === 'empty' ? 'in isolation: ' : ''
    out.push({
      r,
      from: `${iso}${r.transition.from ? STATUS[r.transition.from].word : 'new'}`,
      // a step only for a break: `not judged (age gate)` needs no `at install` (round 13)
      to: `${STATUS[r.transition.to].word}${r.result.failedStep && r.transition.to === 'broken' ? ` at ${r.result.failedStep}` : ''}`,
    })
  }
  return out.reverse()
}

/**
 * What a receipt found (review r8, r9): for the receipt behind a line's isolation cell the entry's
 * `compat.isolation[line].finding`, the sentence the agent card and `check_compat` print; for any other receipt the
 * same function of lib/core/finding.ts on that receipt. Null for a receipt that failed nothing.
 */
export function findingOf(
  r: Receipt | null,
  builtIn: NewAppModules,
  entry?: Pick<IndexEntry, 'compat'> | null,
  routes?: readonly RouteFact[],
): string | null {
  if (!r) return null
  const iso = entry?.compat.isolation?.[r.om.line]
  if (iso?.finding && iso.receipt === r.id) return iso.finding
  return findingText(r, newAppContext(builtIn, r.om.line, routes, receiptPreset(r)))
}

/**
 * HTML of one value on the paper receipt. Values break only at token boundaries; ' · ' separated values (harness)
 * break only at the separators. A list (requires, patches) breaks after each comma, and a package name inside it
 * only after its '/' or before its version (review r3: one nowrap span ran 896 px wide on a phone and was cut by
 * the paper mask on desktop).
 */
export function receiptValueHtml(v: string, list = false): string {
  if (list)
    return v
      .split(', ')
      .map((item) => wbrHtml(item))
      .join(', ')
  return v
    .split(' · ')
    .map((part) => `<span class="nw">${wbrHtml(part)}</span>`)
    .join(' · ')
}

/** HARNESS value: hash, Node and Yarn; a runner that did not record Yarn prints no `yarn unknown` (review r3). */
export function harnessText(h: Pick<Receipt['harness'], 'version' | 'node' | 'yarn'>): string {
  const yarn = h.yarn && h.yarn !== 'unknown' ? ` · yarn ${h.yarn}` : ''
  return `${h.version.slice(0, 6)} · node ${h.node}${yarn}`
}

const escHtml = (s: string): string => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/** Longest token of a log line kept on one line; a longer one (minified JSON, a hash) may break anywhere. */
export const LOG_TOKEN_MAX = 28

/**
 * HTML of one first-error log line: identifiers break only at token boundaries (`wbrHtml`), but a token longer than
 * LOG_TOKEN_MAX characters (a JSON body such as `{"error":"Forbidden","requiredFeatures":[...]}`) gets a span that
 * may break anywhere, so the log never pushes the paper wider than a 360 px phone (review r3).
 */
export function logLineHtml(text: string): string {
  return breakSegments(text)
    .map((seg, i, all) => {
      const space = seg.endsWith(' ')
      const body = space ? seg.slice(0, -1) : seg
      const sep = i === all.length - 1 ? '' : space ? ' ' : '<wbr>'
      const cls = body.length > LOG_TOKEN_MAX ? 'rcpt__any' : 'nw'
      return `${body ? `<span class="${cls}">${escHtml(body)}</span>` : ''}${sep}`
    })
    .join('')
}

/**
 * A receipt of the local preview runner (harness/local/run-cell.sh in Docker), never a CI result: the schema marks it
 * so it is never mistaken for a GitHub runner (lib/schema/data/receipt.ts). Its run has no public page.
 */
export const isPreview = (r: Pick<Receipt, 'harness'>): boolean => r.harness.runner === 'preview-docker'

/** RUNNER value of the paper receipt: where it ran and the runner id, in the same shape for both runners. */
export const RUNNER_TEXT: Record<Receipt['harness']['runner'], string> = {
  'ubuntu-latest': 'GitHub Actions, ubuntu-latest',
  'preview-docker': 'Local Docker, preview-docker',
}

/**
 * Where the status of a receipt comes from, one sentence per runner (round 5: a preview never reads as CI). The
 * preview sentence is the one of lib/core/source.ts, as everywhere else (review r6).
 */
export const SOURCE_TEXT: Record<Receipt['harness']['runner'], string> = {
  'ubuntu-latest': 'Status comes from the GitHub Actions API, not from files the module could write.',
  'preview-docker': PREVIEW_SENTENCE,
}

/** Label of the chip next to a preview receipt: the one chip of lib/core/source.ts (review r6). */
export { PREVIEW_CHIP }

/**
 * The state of one receipt in a few words, the words of the /r heading, its meta description and its neighbour links:
 * a run that judged nothing `not judged`, a baseline `passed`, else the dictionary word (`broken at typecheck`). A
 * receipt of an app from the empty preset is the signal `in isolation` (decision of 24 Oct) and says so first.
 */
export function receiptWord(r: Pick<Receipt, 'module' | 'result' | 'om'>): string {
  const s = r.result.status
  const step = r.result.failedStep ? ` at ${r.result.failedStep}` : ''
  // a run Yarn's age gate stopped on a dependency judged nothing either (round 13)
  if (s === 'harness-red' || s === 'infra-error' || (s === 'quarantine' && r.result.failedStep)) return 'not judged'
  if (r.module === null) return s === 'verified' ? 'passed' : s === 'broken' ? `failed${step}` : STATE_WORD[s]
  const iso = receiptPreset(r) === 'empty' ? 'in isolation, ' : ''
  return `${iso}${STATE_WORD[s]}${s === 'broken' ? step : ''}`
}
const STATE_WORD: Record<CellStatus, string> = {
  verified: 'verified',
  broken: 'broken',
  quarantine: 'in the age gate',
  'harness-red': 'not judged',
  'infra-error': 'not judged',
  untested: 'queued',
  skipped: 'skipped',
}

/**
 * Markdown for an issue: the receipt, its state in the words of its page (`receiptWord`), the explanation when there is
 * one and where to see it. A CI receipt links its run; a preview receipt links its own page (its run has no public
 * page).
 */
export function issueText(r: Receipt, pageUrl: string, why: string | null = null): string {
  const what = r.module
    ? `\`${r.module.locator.replace(/^npm:|^github:/, '')}@${r.module.version}\``
    : `The ${receiptPreset(r) === 'empty' ? 'app from the empty preset' : 'new app'}`
  const run = isPreview(r) ? `Run: ${PREVIEW_SENTENCE}` : `Run: ${r.run.url}`
  return [
    `${what} on Open Mercato ${r.om.version}: ${receiptWord(r)}.`,
    ...(why ? [why] : []),
    `Receipt: ${pageUrl}`,
    run,
  ].join('\n')
}

/**
 * HTML of an explanation sentence with its identifiers in mono: the route (`GET /api/events`), features
 * (`workflows.view`) and the module IDs it does not enable (`does not enable the workflows module`, review r9). The
 * preset is words (`the empty preset`, round 14). The rest is escaped text.
 */
export function whyHtml(text: string): string {
  const MODS = /\bdoes not enable the ((?:[a-z][a-z0-9_]*(?:, | and ))*[a-z][a-z0-9_]*) (modules?)\b/g
  // round 14: a backend route standing as a word (`the backend route /backend/webhooks,`) and a package in
  // parentheses (`(@open-mercato/webhooks)`) are identifiers too, a package never broken at its hyphen; a path inside
  // a log line (`'@freighttech/ui/backend/...'`) stays text, so it still breaks at its slashes, and so does the file at
  // its end (round 15: `.../dist/index.js` read as a feature ID in mono)
  const ID =
    /((?:GET|POST|PUT|PATCH|DELETE) \/\S*[^\s.;,]|(?<=\s)\/backend(?:\/[^\s,;)']*[^\s.,;)'])?(?=[\s,.;)]|$)|(?<=\()@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*[a-z0-9](?=\))|(?<![/.@\w-])\b[a-z][a-z0-9_]*(?:\.[a-z0-9_*]+)+\b(?!\/))/g
  const code = (s: string): string =>
    `<code translate="no"${s.startsWith('@') ? ' class="nw"' : ''}>${escHtml(s)}</code>`
  const ids = (part: string): string => {
    let out = ''
    let last = 0
    for (const m of part.matchAll(ID)) {
      const i = m.index ?? 0
      // a route keeps its method on its line (`GET /api/events`, a no-break space)
      out += escHtml(part.slice(last, i)) + code(m[0].replace(/^([A-Z]+) /, '$1\u00a0'))
      last = i + m[0].length
    }
    return out + escHtml(part.slice(last))
  }
  // the preset is named in words (round 14: `the empty preset`, as every other sentence; `empty` in mono read as an ID)
  const plain = ids
  let out = ''
  let last = 0
  for (const m of text.matchAll(MODS)) {
    const i = m.index ?? 0
    const list = (m[1] as string)
      .split(/(, | and )/)
      .map((x, j) => (j % 2 ? escHtml(x) : code(x)))
      .join('')
    out += `${plain(text.slice(last, i))}does not enable the ${list} ${escHtml(m[2] as string)}`
    last = i + m[0].length
  }
  return out + plain(text.slice(last))
}
