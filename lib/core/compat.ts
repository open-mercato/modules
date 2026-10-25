// `check_compat` (spec 8.2): per ref, Built for (declaration), Fits statically, the receipt, `recommended` (D46)
// and the agent policy for the requested Open Mercato version. Isomorphic: no Node APIs.
import type { Policy } from '../schema/data/health.ts'
import type { IndexEntry } from '../schema/published/modules.ts'
import type { CheckCompatInput, CheckCompatOutput } from '../schema/tools.ts'
import { resolveLine, type LineInfo } from './lines.ts'
import { builtInNotes, installInfo } from './plan.ts'
import {
  agentPolicy,
  builtInPolicy,
  builtForText,
  collisionEvidence,
  collisionNote,
  collisionStatic,
  declaredOn,
  emptyCommandCaution,
  emptyPresetOn,
  emptyPresetVersion,
  heldBack,
  isolationLineText,
  judgeLine,
  lineVersion,
  newAppInstallText,
  notJudgedText,
  otherVersionText,
  pinnedText,
  presetOn,
  untestedText,
} from './policy.ts'
import { resolveRef, type BuiltInRef } from './refs.ts'
import { isStable, isVersion, satisfiesRange } from './semver.ts'
import { PREVIEW_LINE, type ReceiptSource } from './source.ts'
import { clipText } from './text.ts'

/** A note of `check_compat` within its 200 characters, cut at a word with an ellipsis (review of 24 Oct). */
const note = (n: string): string => clipText(n, 200)

const NOTE_MAX = 200
const NOTES_MAX = 5

/**
 * The notes within the five of the schema, none dropped while two neighbours fit one note (round 15: the cap cut
 * `Built for ... A declaration, not a test.` and `Fits statically is not an install test.`, the caveats of the fit an
 * agent reads next to them). The shortest pair of neighbours is joined first, so a long sentence stays whole; the first
 * note keeps its place (the preview line, review r6). Only when no pair fits does the cap cut the last notes.
 */
export function packNotes(notes: readonly string[], max = NOTES_MAX, room = NOTE_MAX): string[] {
  const out = [...notes]
  while (out.length > max) {
    let best = -1
    for (let i = 0; i + 1 < out.length; i++) {
      const len = out[i]!.length + 1 + out[i + 1]!.length
      if (len <= room && (best < 0 || len < out[best]!.length + 1 + out[best + 1]!.length)) best = i
    }
    if (best < 0) break
    out.splice(best, 2, `${out[best]} ${out[best + 1]}`)
  }
  return out.slice(0, max)
}

export interface CompatContext {
  entries: readonly IndexEntry[]
  builtIn: readonly BuiltInRef[]
  lines: readonly LineInfo[]
  /** Site root without a trailing slash, for receipt URLs (e.g. https://open-mercato.github.io/modules). */
  site: string
  /** Core line of the built-in data; default: the latest line. */
  coreLine?: string
  now?: string
  /** Where the receipts come from (`dataAsOf.source` of modules.json); `preview` adds the preview note (review r6). */
  receiptSource?: ReceiptSource | null
}

type Result = CheckCompatOutput['results'][number]

const UNKNOWN: Policy = { decision: 'refuse', reasons: [{ code: 'UNKNOWN', text: 'Not in the catalog.' }] }

export function checkCompat(input: CheckCompatInput, ctx: CompatContext): CheckCompatOutput {
  const resolved = resolveLine(input.omVersion, ctx.lines)
  const line = resolved.line
  const exact = resolved.version ?? input.omVersion.replace(/^[v=^~]/, '')
  // the app's own version when it is a release other than the one the line tested (finding of 25 Oct: an app on 0.9.0
  // read `satisfied` for a module pinned to 0.9.1 once the line moved to 0.9.1): Built for is judged on the app's
  // version and a note says the receipts are of another one; the verdict and the policy stay the line's (D10)
  const asked = input.omVersion.trim().replace(/^(?:v|=)\s*/, '')
  const appVersion = line && resolved.version && isVersion(asked) && asked !== resolved.version ? asked : null
  const appStable = appVersion !== null && isStable(appVersion)
  const lineKey = line ?? /^(\d+\.\d+)/.exec(exact)?.[1] ?? 'unknown'
  const latestKey = ctx.lines.find((l) => l.source === 'latest')?.key ?? null
  const coreLine = ctx.coreLine ?? latestKey ?? lineKey
  const results: Result[] = input.refs.map((ref) => {
    const r = resolveRef(ref, ctx.entries, ctx.builtIn)
    const notes: string[] = []
    if (!line && resolved.note) notes.push(resolved.note)
    if (r.kind === 'builtin') {
      // what a new app of the line has (review r11: `Enable it` for currencies, which every app made the usual way has)
      notes.push(...builtInNotes(r.builtIn, line))
      if (r.candidates.length > 0) notes.push(`Catalog entries with the same module ID: ${r.candidates.join(', ')}.`)
      return {
        ref,
        locator: null,
        version: null,
        builtFor: { range: null, kind: 'missing', satisfied: false },
        fitsStatically: null,
        receipt: null,
        status: null,
        recommendedVersion: null,
        installableFrom: null,
        agentPolicy: builtInPolicy(coreLine, line),
        receiptUrl: null,
        notes: packNotes(notes.map(note)),
      }
    }
    if (r.kind === 'none') {
      notes.push(
        r.candidates.length > 0
          ? `Unknown or ambiguous ref. Candidates: ${r.candidates.join(', ')}.`
          : 'Unknown module.',
      )
      return {
        ref,
        locator: null,
        version: null,
        builtFor: { range: null, kind: 'missing', satisfied: false },
        fitsStatically: null,
        receipt: null,
        status: null,
        recommendedVersion: null,
        installableFrom: null,
        agentPolicy: UNKNOWN,
        receiptUrl: null,
        notes: packNotes(notes.map(note)),
      }
    }
    const e = r.entry
    const bf = e.compat.builtFor
    const cell = line ? (e.compat.lines[line] ?? null) : null
    const recommended = line ? (e.version.recommended[line] ?? null) : null
    // one version per line for every field (review of 24 Oct): the version a new app has there (`lineVersion`), and
    // `builtFor`, `fitsStatically` and the notes describe that version (webhooks 0.8.0 on 0.8 is built for 0.8 even
    // though the latest release, whose range the entry names, declares 0.9.0; checkout in a new 0.8 app is 0.8.0)
    const version = lineVersion(e, line)
    const declared = line ? declaredOn(bf, line) : null
    const unread = declared !== null && !declared.read
    const range = declared ? (declared.read ? declared.range : bf.range) : bf.range
    // `accepts` is the line's (its tested version); a stable app version of its own is checked against the range itself
    const satisfied =
      !unread &&
      range !== null &&
      (appStable ? satisfiesRange(appVersion, range) : declared?.accepts ? true : satisfiesRange(exact, range))
    const builtFor: Result['builtFor'] = {
      range,
      kind: range === null ? 'missing' : bf.kind,
      satisfied,
      // the version the declaration is of: `version`, unless the catalog has not read its peers (a develop snapshot)
      version: unread ? lineVersion(e, latestKey) : version,
    }
    // status of the install version (`signals.receipt`), not of a newer release in the age gate (D46, 6.5)
    const status = line ? (recommended ? 'verified' : (e.signals.receipt[line] ?? cell?.status ?? 'untested')) : null
    // a status that rests on a preview run says so first, so the five-note cap never cuts it (review r6)
    if (ctx.receiptSource === 'preview' && line && (cell || status === 'verified')) notes.push(PREVIEW_LINE)
    if (appVersion) notes.push(`Receipts are from Open Mercato ${resolved.version}; your app has ${appVersion}.`)
    // a package a new app of the line already registers (D10): nothing to install there, the command of an app from the
    // empty preset after it (decision of 24 Oct); the line's verdict is the receipt of the version a new app ships
    const preset = presetOn(e, line)
    if (line && preset)
      notes.push(
        newAppInstallText(
          e.moduleIds,
          emptyPresetOn(e, line)
            ? null
            : installInfo({ ...e, moduleFlag: e.install.moduleFlag }, line, null, emptyPresetVersion(e, line)).cli,
        ),
      )
    // why the line broke in a new app, the sentence under the module page's strip (round 14: the page named the
    // duplicate backend route, the tools said only `broken`)
    const judgedCell = line ? judgeLine(e, line).cell : null
    if (line && judgedCell?.status === 'broken' && judgedCell.finding) notes.push(`${line}: ${judgedCell.finding}`)
    // a run Yarn's age gate stopped on a dependency judged nothing (round 13): the one sentence of the page and the card
    if (line && cell && heldBack(cell)) notes.push(notJudgedText(line, 'quarantine', cell.at ?? null))
    // a backend route a new app already has, on a line without a verdict (round 14): the static check and what the
    // same version did on the other lines, in one note when it fits, as the page and the card print it
    const collide = collisionNote(e, line)
    if (collide && collide.length <= 200) notes.push(collide)
    else if (collide)
      notes.push(...[collisionStatic(e, line), collisionEvidence(e, line)].filter((x): x is string => !!x))
    // no receipt from a new app yet: the signal `in isolation` named as such, never the verdict; with a verdict, the
    // signal follows it when it says something else. Where a new app ships the package and the empty preset does not,
    // the note of the empty preset's command (round 14: `no receipt for 0.8.0 yet`, as the plan, the box and the card)
    const iso = line ? (e.compat.isolation?.[line] ?? null) : null
    const caution =
      line && preset && !emptyPresetOn(e, line) ? emptyCommandCaution(e, line, emptyPresetVersion(e, line)) : null
    if (caution) notes.push(caution)
    else if (line && !cell && status === 'untested') notes.push(untestedText(line, iso, version))
    else if (line && cell) {
      const t = isolationLineText(e, line)
      if (t) notes.push(t)
    }
    if (unread && version)
      notes.push(
        `Peers of ${version} not read yet; builtFor is the declaration of ${builtFor.version ?? 'another version'}.`,
      )
    else if (range !== null && !satisfied) notes.push(`${builtForText(e)}. A declaration, not a test.`)
    const judged = line ? judgeLine(e, line) : null
    const newer = line ? (e.compat.newerBreaks?.[line] ?? null) : null
    if (cell && recommended && cell.moduleVersion !== recommended && cell.status !== 'verified')
      notes.push(`${cell.moduleVersion} is ${cell.status} on ${line}. Install ${recommended} until then.`)
    else if (line && judged?.other && judged.installs)
      // the one sentence of the page and the card (review r6): the receipt is about another version
      notes.push(otherVersionText(line, judged.installs, judged.other))
    else if (cell && !recommended && version && cell.moduleVersion !== version)
      notes.push(`${cell.moduleVersion} is ${cell.status} on ${line}. This result is for ${version}.`)
    // a newer release broke where the cell judged the install version: the page's pin sentence (review r8)
    else if (line && newer && cell?.moduleVersion) notes.push(pinnedText(line, cell.moduleVersion, newer))
    if (line && e.signals.fit[line] && e.signals.fit[line] !== 'unknown' && status !== 'verified')
      notes.push('Fits statically is not an install test.')
    return {
      ref,
      locator: e.locator,
      version,
      builtFor,
      fitsStatically: line ? (e.signals.fit[line] ?? 'unknown') : null,
      receipt: cell,
      status: status as Result['status'],
      recommendedVersion: recommended,
      installableFrom: e.version.installableFrom,
      agentPolicy: agentPolicy(e, lineKey, undefined, { now: ctx.now }),
      receiptUrl: cell?.receipt ? `${ctx.site}/r/${cell.receipt}` : null,
      notes: packNotes(notes.map(note)),
    }
  })
  return {
    line,
    omVersion: input.omVersion,
    results,
    ...(ctx.receiptSource !== undefined ? { receiptSource: ctx.receiptSource } : {}),
  }
}
