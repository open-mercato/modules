// State machine of the nightly receipts (spec 5.3 "Job collect" steps 4-5, 4.5 retention).
// - A red baseline on a line makes every module cell of that line and preset `harness-red` (modules are not punished).
//   Each starter preset (classic, the main verdict; empty, `in isolation`) has its own baseline and history.
// - Except a red baseline of the classic preset whose failure names only packages its new app registers (review of 24
//   Oct: checkout breaking the classic app read as Open Mercato itself failing, and checkout never got `broken`): the
//   baseline keeps `harness-red` with those packages as `result.culprits`, their cells are judged as on a green line,
//   and every other cell on its own run (a pass is verified, a failure stays `harness-red`: it may be the culprit's).
// - infra: one retry, then `infra-error`; the previous state stays decisive (lib/core/lines.ts skips it).
// - The first red `module-fail` is unconfirmed; a retry (attempt 2) confirms `broken` or turns it into `verified` with the
//   note `flaky`. A red cell whose last receipt with the same key is already a confirmed `broken` needs no retry.
// - A confirmed verified -> broken transition with a green baseline is a regression: a `receipt-transition` change.
// - Retention: a receipt line is written on a change of status, key or confirmation, after a retry, or when the last
//   line of the same cell (locator or baseline, line, mode) is 7 days old.
import type { Step } from '../schema/common.ts'
import type { Change } from '../schema/data/changes.ts'
import type { Presets } from '../schema/data/lines.ts'
import { Receipt } from '../schema/data/receipt.ts'
import type { HarnessLinesFile } from '../schema/policy.ts'
import { ModuleId, NpmName } from '../schema/common.ts'
import { daysBetween, receiptPreset, sortReceipts, type PresetId } from '../core/lines.ts'
import { compareVersions } from '../core/semver.ts'
import type { StepFailure } from './classify.ts'
import { harnessVersion, receiptId } from './cell-key.ts'
import { LADDER, type BundleAttempt, type CellOutcome, type NightBundle } from './from-actions.ts'
import type { MatrixCell, NotRunCell } from './matrix.ts'

export const RETENTION_DAYS = 7
type CellStatus = Receipt['result']['status']

/** Patch metadata for receipts: harness/lines.yml plus the per-entry slot swap. */
export const SLOT_SWAP = {
  id: 'slot-swap',
  why: 'The entry replaces a core module; its core registration is removed before add (module add refuses the same ID).',
  ref: 'https://github.com/open-mercato/open-mercato/blob/main/packages/cli/src/lib/module-install.ts',
} as const

export interface RawResult {
  klass: 'pass' | 'module-fail' | 'infra' | 'quarantine'
  failedStep: Step | null
  alsoFailed: Step[]
  primary: StepFailure | null
}

const isFailed = (c: string | null) => c === 'failure' || c === 'cancelled'

/** One attempt of one cell, before baselines and retries are taken into account. */
export function rawResult(o: CellOutcome, baseline: boolean): RawResult {
  if (!o.jobFound) return { klass: 'infra', failedStep: null, alsoFailed: [], primary: null }
  const failed = LADDER.filter((s) => isFailed(o.ladder[s].conclusion))
  if (failed.length === 0) {
    const harnessFailure = o.failures.find((f) => !(LADDER as readonly string[]).includes(f.step)) ?? null
    const required = LADDER.filter((s) => !(baseline && s === 'add'))
    const complete = required.every((s) => o.ladder[s].conclusion === 'success')
    if (complete && !harnessFailure) return { klass: 'pass', failedStep: null, alsoFailed: [], primary: null }
    return { klass: 'infra', failedStep: null, alsoFailed: [], primary: harnessFailure }
  }
  const first = failed[0] as Step
  const primary = o.failures.find((f) => f.step === first) ?? null
  return {
    klass: primary?.classification ?? (first === 'scaffold' || first === 'install' ? 'infra' : 'module-fail'),
    failedStep: first,
    alsoFailed: failed.slice(1),
    primary,
  }
}

/** Receipts of one cell subject: a locator, or the baseline (null). */
export type History = (locator: string | null) => readonly Receipt[]

function lastOf(history: readonly Receipt[], line: string, mode: string, preset: PresetId): Receipt | null {
  return (
    sortReceipts(
      history.filter((r) => r.om.line === line && r.harness.mode === mode && receiptPreset(r) === preset),
    ).at(-1) ?? null
  )
}

/** A line and preset, the scope of one baseline. */
const scope = (c: { line: string; preset?: string }) => `${c.line} ${c.preset === 'classic' ? 'classic' : 'empty'}`

function confirmedBrokenSameKey(history: readonly Receipt[], key: string): boolean {
  const r = sortReceipts(history.filter((x) => x.cellKey === key)).at(-1)
  return !!r && r.result.status === 'broken' && r.transition.confirmed
}

/**
 * The packages of a new app a red baseline is held against (see the header), or null: a baseline of the classic preset
 * whose failed step names only catalog packages its app registers (`StepFailure.packages` within `presetPackages`).
 */
export function baselineCulprits(cell: MatrixCell, r: RawResult): string[] | null {
  if (!cell.baseline || cell.preset !== 'classic' || r.klass !== 'module-fail' || !r.primary) return null
  const pk = r.primary.packages ?? []
  return pk.length > 0 && pk.length <= 10 && pk.every((p) => cell.presetPackages.includes(p)) ? [...pk].sort() : null
}

/** How a module cell stands to its line's red baseline: one of its culprits, another cell, or no culprit known. */
type CulpritRole = 'self' | 'other' | null

function roleOf(cell: MatrixCell, culprits: readonly string[] | null | undefined): CulpritRole {
  if (!culprits || culprits.length === 0 || cell.baseline) return null
  return cell.moduleNpm && culprits.includes(cell.moduleNpm) ? 'self' : 'other'
}

/** Status of the baseline of each line and preset on the first attempt: red ones do not retry their module cells. */
function baselineRawByLine(
  cells: readonly MatrixCell[],
  outcomes: readonly CellOutcome[],
): Map<string, { raw: RawResult; culprits: string[] | null }> {
  const out = new Map<string, { raw: RawResult; culprits: string[] | null }>()
  for (const c of cells) {
    if (!c.baseline) continue
    const o = outcomes.find((x) => x.key === c.key)
    if (!o) continue
    const raw = rawResult(o, true)
    out.set(scope(c), { raw, culprits: baselineCulprits(c, raw) })
  }
  return out
}

/** Keys of the cells to run again (attempt 2) after the first attempt. */
export function retryKeys(cells: readonly MatrixCell[], outcomes: readonly CellOutcome[], history: History): string[] {
  const base = baselineRawByLine(cells, outcomes)
  const out: string[] = []
  for (const c of cells) {
    const o = outcomes.find((x) => x.key === c.key)
    if (!o || c.mode === 'early') continue
    const r = rawResult(o, c.baseline)
    if (c.baseline) {
      if (r.klass !== 'pass') out.push(c.key)
      continue
    }
    const b = base.get(scope(c))
    // a stream of `cells-local --shard` without the baseline (shard 1 has them all): the last baseline the data holds,
    // as applyNight reads it, so a red baseline written by shard 1 spares the other shards their retries (review of
    // 24 Oct: about 6 hours of retries on Cezar)
    const last = b ? null : lastOf(history(null), c.line, 'realistic', c.preset)
    const red = b ? b.raw.klass !== 'pass' && b.raw.klass !== 'infra' : last?.result.status === 'harness-red'
    // a red line spares its cells their retries, except the culprits of a baseline held against them (see the header)
    if (red && roleOf(c, b ? b.culprits : last?.result.culprits) !== 'self') continue
    if (r.klass === 'infra') out.push(c.key)
    else if (r.klass === 'module-fail' && !confirmedBrokenSameKey(history(c.locator), c.key)) out.push(c.key)
  }
  return out
}

interface Decision {
  status: CellStatus
  classification: Receipt['result']['classification']
  confirmed: boolean
  outcome: CellOutcome
  raw: RawResult
  flaky: boolean
}

function decide(
  cell: MatrixCell,
  o1: CellOutcome,
  o2: CellOutcome | null,
  baselineRed: boolean,
  history: readonly Receipt[],
  culprit: CulpritRole = null,
): Decision {
  const r1 = rawResult(o1, cell.baseline)
  const r2 = o2 ? rawResult(o2, cell.baseline) : null
  const d = (
    status: CellStatus,
    classification: Decision['classification'],
    confirmed: boolean,
    second: boolean,
    flaky = false,
  ): Decision => ({
    status,
    classification,
    confirmed,
    outcome: second && o2 ? o2 : o1,
    raw: second && r2 ? r2 : r1,
    flaky,
  })
  if (cell.baseline) {
    const r = r2 ?? r1
    const second = r2 !== null
    if (r.klass === 'pass') return d('verified', 'pass', true, second, second && r1.klass === 'module-fail')
    if (r.klass === 'infra') return d('infra-error', 'infra', false, second)
    return d('harness-red', 'harness-red', second, second)
  }
  // a red baseline held against culprits (see the header): another cell's pass stands, its failure is not judged; a
  // culprit's cell is judged below as on a green line
  if (baselineRed && culprit === 'other')
    return r1.klass === 'pass'
      ? d('verified', 'pass', true, false)
      : d('harness-red', 'harness-red', false, r2 !== null)
  if (baselineRed && culprit !== 'self') return d('harness-red', 'harness-red', false, r2 !== null)
  if (cell.mode === 'early') {
    if (r1.klass === 'pass') return d('verified', 'pass', true, false)
    if (r1.klass === 'infra') return d('infra-error', 'infra', false, false)
    if (r1.klass === 'quarantine') return d('quarantine', 'quarantine', false, false)
    return d('broken', 'module-fail', false, false)
  }
  switch (r1.klass) {
    case 'pass':
      return d('verified', 'pass', true, false)
    case 'quarantine':
      return d('quarantine', 'quarantine', false, false)
    case 'module-fail':
      if (!r2) return d('broken', 'module-fail', confirmedBrokenSameKey(history, cell.key), false)
      if (r2.klass === 'pass') return d('verified', 'pass', true, true, true)
      if (r2.klass === 'module-fail') return d('broken', 'module-fail', true, true)
      if (r2.klass === 'quarantine') return d('quarantine', 'quarantine', false, true)
      return d('broken', 'module-fail', false, false)
    case 'infra':
      if (!r2 || r2.klass === 'infra') return d('infra-error', 'infra', false, r2 !== null)
      if (r2.klass === 'pass') return d('verified', 'pass', true, true)
      if (r2.klass === 'quarantine') return d('quarantine', 'quarantine', false, true)
      return d('broken', 'module-fail', false, true)
  }
}

function stepRows(o: CellOutcome, baseline: boolean): Receipt['steps'] {
  return LADDER.map((name) => {
    const s = o.ladder[name]
    const status: 'pass' | 'fail' | 'skipped' =
      baseline && name === 'add'
        ? 'skipped'
        : s.conclusion === 'success'
          ? 'pass'
          : isFailed(s.conclusion)
            ? 'fail'
            : 'skipped'
    const f = status === 'fail' ? (o.failures.find((x) => x.step === name) ?? null) : null
    return {
      name,
      status,
      sec: status === 'skipped' ? null : s.sec,
      signature: f?.signature ?? null,
      excerpt: f?.excerpt ?? null,
      file: f?.file ?? null,
      line: f?.line ?? null,
    }
  })
}

function patchesOf(ids: readonly string[], harness: HarnessLinesFile): Receipt['harness']['patches'] {
  const out: Receipt['harness']['patches'] = []
  for (const id of ids) {
    if (id === SLOT_SWAP.id) out.push({ ...SLOT_SWAP })
    const p = harness.patches.find((x) => x.id === id)
    if (p) out.push({ id: p.id, why: p.why, ref: p.ref })
  }
  return out
}

/**
 * `{ id, from }` entries of the `enabledModules` array literal of a scaffolded src/modules.ts (data/presets.json).
 * Only the literal of the declaration counts, up to its first `]`: entries pushed later in `if` blocks (the
 * enterprise modules behind OM_ENABLE_ENTERPRISE_MODULES*, agent_examples) are not in a new app by default.
 * Block comments and line comments (`//` at the start of a line or after a space) are dropped first. harness/steps.sh has the same parser in JavaScript (PRESET_JS) for the add step;
 * test/receipts/state.test.ts keeps the two in step.
 */
export function presetFromModulesTs(text: string, max = 80): { id: string; from: string }[] {
  const out: { id: string; from: string }[] = []
  const src = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n')
  const decl = /\bconst\s+enabledModules\b[^=]*=\s*\[([^\]]*)\]/.exec(src)
  if (!decl) return out
  const re = /\{\s*id:\s*['"]([^'"]+)['"]\s*,\s*from:\s*['"]([^'"]+)['"]\s*\}/g
  for (const m of (decl[1] as string).matchAll(re)) {
    const id = m[1] as string
    const from = m[2] as string
    if (ModuleId.safeParse(id).success && NpmName.safeParse(from).success && !out.some((x) => x.id === id))
      out.push({ id, from })
  }
  return out.slice(0, max)
}

export interface ApplyInput {
  bundle: NightBundle
  history: History
  harness: HarnessLinesFile
  presets: Presets | null
}

export interface ApplyResult {
  /** New receipt lines per subject: locator, or null for the baseline. */
  receipts: { locator: string | null; receipt: Receipt }[]
  presets: Presets | null
  changes: Change[]
  /** One line per decided cell, for the job summary. */
  report: string[]
}

function shouldWrite(prev: Receipt | null, next: Receipt, retried: boolean): boolean {
  if (!prev || retried) return true
  return (
    prev.result.status !== next.result.status ||
    prev.cellKey !== next.cellKey ||
    prev.transition.confirmed !== next.transition.confirmed ||
    daysBetween(prev.run.at, next.run.at) >= RETENTION_DAYS
  )
}

/**
 * `base` (receiptId of the run's UTC day and the cell key) unless a receipt of another run already holds it, then
 * `base_2`, `base_3` ... (finding of 25 Oct: a rerun of a night or a second preview run on the same day gave the same
 * id, and r/<id>.json of the first run was replaced silently). The first run keeps the plain id, so ids already
 * published never change; a receipt of the same run (collect run again) keeps its own.
 */
export function uniqueReceiptId(base: string, runId: number, taken: readonly Pick<Receipt, 'id' | 'run'>[]): string {
  const clash = (id: string) => taken.some((r) => r.id === id && r.run.id !== runId)
  if (!clash(base)) return base
  for (let n = 2; n <= 999; n++) if (!clash(`${base}_${n}`)) return `${base}_${n}`
  throw new Error(`receipt id ${base}: more than 999 runs of one cell on one day`)
}

function newestAt(times: readonly string[]): string {
  return times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a))
}

export function applyNight(input: ApplyInput): ApplyResult {
  const { bundle, harness } = input
  // History of the same runner only: a preview-docker receipt is never `prev`, the last baseline or the start of a
  // regression for a CI night, and the other way round (review round 2).
  const history: History = (locator) => input.history(locator).filter((r) => r.harness.runner === bundle.runner)
  const a1 = bundle.attempts.find((a) => a.attempt === 1)
  if (!a1) throw new Error('bundle has no first attempt')
  const a2 = bundle.attempts.find((a) => a.attempt === 2) ?? null
  const runner = bundle.runner
  const hv = harnessVersion(bundle.matrix.harness.hash)
  const out: ApplyResult = {
    receipts: [],
    presets: input.presets ? { ...input.presets } : null,
    changes: [],
    report: [],
  }
  const outcomeIn = (a: BundleAttempt | null, key: string) => a?.outcomes.find((o) => o.key === key) ?? null
  // ids are checked against every stored receipt of the subject (any runner) and the ones this collect writes
  const issued: Receipt[] = []
  const idFor = (at: string, key: string, locator: string | null) =>
    uniqueReceiptId(receiptId(at, key), bundle.night.id, [...input.history(locator), ...issued])
  const runAt = (a: BundleAttempt) => a.run.at
  // When this night measured its lines: its first attempt, the same for a late retry of this (provisional) night.
  const measuredAt = newestAt([bundle.night.at, a1.run.at])
  // Whether the stored entry of a line was measured by a newer night, which a late retry never replaces (review rounds
  // 3 and 4). An entry with `measuredAt` answers it alone: neither `at` (every night stamps it) nor the version (a tag
  // may roll back, lib/sources/lines.ts) says who measured. An entry written before `measuredAt` keeps the old rule: a
  // later `at` with a newer version, or with this preset of the same version.
  const measuredByNewer = (line: string, cell: { omVersion: string; preset: PresetId }) => {
    const stored = input.presets?.[line]
    if (!stored) return false
    if (stored.measuredAt) return Date.parse(stored.measuredAt) > Date.parse(measuredAt)
    if (Date.parse(stored.at) <= Date.parse(measuredAt)) return false
    const order = compareVersions(stored.omVersion, cell.omVersion)
    return order > 0 || (order === 0 && stored[cell.preset] !== undefined)
  }

  // Baselines first: their final status decides harness-red for the module cells of the line.
  const baselineFinal = new Map<string, { status: CellStatus; id: string; culprits: string[] | null }>()
  const ordered = [...bundle.matrix.cells].sort((x, y) => Number(y.baseline) - Number(x.baseline))
  for (const cell of ordered) {
    const o1 = outcomeIn(a1, cell.key)
    if (!o1) continue
    const o2 = outcomeIn(a2, cell.key)
    const own = history(cell.locator)
    let baselineRed = false
    let baselineRef: Receipt['baseline'] = null
    let culprits: string[] | null = null
    if (!cell.baseline) {
      const tonight = baselineFinal.get(scope(cell))
      const lastBase = lastOf(history(null), cell.line, 'realistic', cell.preset)
      const status = tonight?.status ?? lastBase?.result.status ?? null
      baselineRed = status === 'harness-red'
      culprits = baselineRed ? (tonight ? tonight.culprits : (lastBase?.result.culprits ?? null)) : null
      baselineRef = status
        ? { status, receipt: tonight?.id ?? lastBase?.id ?? null, ...(culprits ? { culprits } : {}) }
        : null
    }
    const dec = decide(cell, o1, o2, baselineRed, own, roleOf(cell, culprits))
    // the packages a red baseline of the classic preset is held against, from the decisive attempt
    const heldAgainst = cell.baseline && dec.status === 'harness-red' ? baselineCulprits(cell, dec.raw) : null
    const attempt = dec.outcome === o2 && a2 ? a2 : a1
    const at = runAt(attempt)
    const prev = lastOf(own, cell.line, cell.mode, cell.preset)
    const notes: ('in-preset' | 'flaky')[] = []
    if (dec.outcome.notes.includes('in-preset')) notes.push('in-preset')
    if (dec.flaky) notes.push('flaky')
    const receipt = Receipt.parse({
      schema: 1,
      id: idFor(at, cell.key, cell.locator),
      cellKey: cell.key,
      module: cell.locator ? { locator: cell.locator, version: cell.version, integrity: cell.integrity } : null,
      om: { line: cell.line, version: cell.omVersion, createApp: cell.createApp, preset: cell.preset },
      harness: {
        version: hv,
        node: bundle.matrix.node,
        yarn: dec.outcome.yarn ?? o1.yarn ?? 'unknown',
        runner,
        mode: cell.mode,
        patches: patchesOf(dec.outcome.patches, harness),
        // the memory limit of a preview cell, so a failure under a small limit can be told apart later (review of 24 Oct)
        ...(dec.outcome.memory ? { memory: dec.outcome.memory } : {}),
      },
      baseline: baselineRef,
      requiresInstalled: cell.requiresSpecs,
      steps: stepRows(dec.outcome, cell.baseline),
      result: {
        status: dec.status,
        failedStep: dec.status === 'verified' ? null : dec.raw.failedStep,
        alsoFailed: dec.status === 'verified' ? [] : dec.raw.alsoFailed,
        classification: dec.classification,
        quarantineUntil: null,
        ...(heldAgainst ? { culprits: heldAgainst } : {}),
      },
      transition: { from: prev?.result.status ?? null, to: dec.status, confirmed: dec.confirmed },
      run: {
        id: bundle.night.id,
        attempt: attempt.attempt,
        url: dec.outcome.url,
        at,
        durationSec: dec.outcome.durationSec,
      },
      attestation: null,
      ...(notes.length > 0 ? { notes } : {}),
    })
    const retried = o2 !== null
    const write = shouldWrite(prev, receipt, retried)
    // a baseline that retention does not write is linked through the stored receipt it repeats (same status, key and
    // confirmation), so a module receipt never points at an id that exists nowhere (audit R6)
    if (cell.baseline)
      baselineFinal.set(scope(cell), {
        status: dec.status,
        id: write ? receipt.id : (prev?.id ?? receipt.id),
        culprits: heldAgainst,
      })
    if (write) {
      out.receipts.push({ locator: cell.locator, receipt })
      issued.push(receipt)
    }
    out.report.push(
      `${cell.label}: ${dec.status}${dec.raw.failedStep ? ` at ${dec.raw.failedStep}` : ''}${dec.confirmed ? '' : ' (unconfirmed)'}${notes.length ? ` [${notes.join(', ')}]` : ''}${heldAgainst ? ` (held against ${heldAgainst.join(', ')})` : ''}`,
    )
    // Regression: confirmed verified -> broken with a green baseline, or a red one held against this very package.
    if (
      !cell.baseline &&
      cell.mode === 'realistic' &&
      prev?.result.status === 'verified' &&
      dec.status === 'broken' &&
      dec.confirmed &&
      (baselineRef?.status === 'verified' || roleOf(cell, culprits) === 'self') &&
      cell.locator
    ) {
      out.changes.push({
        at,
        type: 'receipt-transition',
        locator: cell.locator,
        line: cell.line,
        from: 'verified',
        to: 'broken',
        ...(cell.version ? { version: cell.version } : {}),
      })
    }
    // data/presets.json from the scaffold of the baseline, under the key of its preset (`empty`, `classic`); `at` is
    // set for every line after the loop. A line whose Open Mercato version changed starts a new entry. `measuredAt`
    // records this night as the one that measured the entry.
    if (
      cell.baseline &&
      !measuredByNewer(cell.line, cell) &&
      dec.outcome.modulesTs &&
      dec.outcome.ladder.scaffold.conclusion === 'success'
    ) {
      const list = presetFromModulesTs(dec.outcome.modulesTs, cell.preset === 'classic' ? 160 : 80)
      if (list.length > 0) {
        const prior = out.presets?.[cell.line]
        const base = prior && prior.omVersion === cell.omVersion ? prior : { omVersion: cell.omVersion, at }
        out.presets = { ...(out.presets ?? {}), [cell.line]: { ...base, [cell.preset]: list, measuredAt } }
      }
    }
  }

  // Quarantine entries decided by the plan, without a run.
  for (const nr of bundle.matrix.notRun) {
    if (nr.status !== 'quarantine' || !nr.version) continue
    const own = history(nr.locator)
    const prev = lastOf(own, nr.line, nr.mode, nr.preset)
    const receipt = quarantineReceipt(nr, bundle, hv, prev, idFor(bundle.night.at, nr.key, nr.locator))
    if (shouldWrite(prev, receipt, false)) {
      out.receipts.push({ locator: nr.locator, receipt })
      issued.push(receipt)
    }
    out.report.push(
      `${nr.locator}@${nr.version} on ${nr.line}${nr.preset === 'classic' ? ' (classic)' : ''}: quarantine until ${nr.quarantineUntil ?? '?'}`,
    )
  }
  // `at` of every line in data/presets.json = the newest run of this collected night, also on nights without a baseline
  // cell (the baseline key is memoized 6 nights of 7). WP09 reads dataAsOf.nightly from it (review round 2). A late retry
  // of an older night never moves it back.
  if (out.presets) {
    const nightAt = newestAt([bundle.night.at, ...bundle.attempts.map(runAt)])
    out.presets = Object.fromEntries(
      Object.entries(out.presets).map(([k, v]) => {
        const stored = input.presets?.[k]?.at
        return [k, { ...v, at: newestAt([...(stored ? [stored] : []), v.at, nightAt]) }]
      }),
    )
  }
  return out
}

function quarantineReceipt(nr: NotRunCell, bundle: NightBundle, hv: string, prev: Receipt | null, id: string): Receipt {
  return Receipt.parse({
    schema: 1,
    id,
    cellKey: nr.key,
    module: { locator: nr.locator, version: nr.version, integrity: nr.integrity },
    om: {
      line: nr.line,
      version: nr.omVersion,
      createApp: `create-mercato-app@${nr.omVersion}`,
      preset: nr.preset,
    },
    harness: {
      version: hv,
      node: bundle.matrix.node,
      yarn: 'unknown',
      runner: bundle.runner,
      mode: nr.mode,
      patches: [],
    },
    baseline: null,
    requiresInstalled: [],
    steps: LADDER.map((name) => ({
      name,
      status: 'skipped',
      sec: null,
      signature: null,
      excerpt: null,
      file: null,
      line: null,
    })),
    result: {
      status: 'quarantine',
      failedStep: null,
      alsoFailed: [],
      classification: 'quarantine',
      quarantineUntil: nr.quarantineUntil,
    },
    transition: { from: prev?.result.status ?? null, to: 'quarantine', confirmed: false },
    run: { id: bundle.night.id, attempt: 1, url: bundle.night.url, at: bundle.night.at, durationSec: 0 },
    attestation: null,
  })
}
