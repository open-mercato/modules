// Shared inputs for test/receipts: the plan input from test/fixtures (no network), cell outcomes built by hand in the
// shape buildOutcomes returns, and a harness config read from the real harness/lines.yml.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { HarnessLinesFile } from '../../lib/schema/policy.ts'
import { Receipt, SyncRecord } from '../../lib/schema/data/index.ts'
import type { Descriptor } from '../../lib/schema/descriptor.ts'
import { LADDER, type CellOutcome } from '../../lib/receipts/from-actions.ts'
import { classifyStep, type AnyStep } from '../../lib/receipts/classify.ts'
import type { MatrixCell } from '../../lib/receipts/matrix.ts'
import { planMatrix, type PlanEntry, type PlanInput } from '../../lib/receipts/plan.ts'
import { loadFixture, LOC, ROOT, type Fixture } from '../core/helpers.ts'

export { LOC, ROOT, loadFixture }
export const NIGHT = '2026-10-23T02:17:00Z' // Friday
export const SUNDAY = '2026-10-25T02:17:00Z'
export const HASH = 'a'.repeat(64)

export function harness(): HarnessLinesFile {
  return HarnessLinesFile.parse(parse(readFileSync(join(ROOT, 'harness', 'lines.yml'), 'utf8')))
}

export function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `om-receipts-${prefix}-`))
}

export interface Extra {
  locator: string
  d: Descriptor
  sync: SyncRecord | null
  facts?: PlanEntry['facts']
  receipts?: Receipt[]
}

/** Plan entries of the 8 fixture descriptors (plus extras), with fixture sync, facts and receipts. */
export function fixturePlanEntries(fx: Fixture, o: { receipts?: (loc: string) => Receipt[]; extra?: Extra[] } = {}) {
  const entries: PlanEntry[] = [...fx.descriptors.entries()].map(([locator, d]) => ({
    locator,
    d,
    sync: fx.sync(locator),
    facts: (v: string) => fx.facts(locator, v),
    receipts: o.receipts ? o.receipts(locator) : [],
  }))
  for (const e of o.extra ?? [])
    entries.push({
      locator: e.locator,
      d: e.d,
      sync: e.sync,
      facts: e.facts ?? (() => null),
      receipts: e.receipts ?? [],
    })
  return entries
}

export function planInput(fx: Fixture, over: Partial<PlanInput> = {}): PlanInput {
  return {
    entries: fixturePlanEntries(fx),
    lines: fx.lines,
    presets: fx.presets,
    builtinIds: new Set(fx.builtin.modules.map((m) => m.id)),
    baselineReceipts: [],
    harness: harness(),
    harnessHash: HASH,
    now: NIGHT,
    event: 'schedule',
    // the rules of these tests are the ones of the empty preset (the signal `in isolation`, since 24 Oct); the classic
    // preset and the plan of both have their own tests (test/receipts/presets.test.ts)
    onlyPresets: ['empty'],
    ...over,
  }
}

export function plan(fx: Fixture, over: Partial<PlanInput> = {}) {
  return planMatrix(planInput(fx, over))
}

/** A green or red outcome of a cell. `fail` maps failed steps to their log text. */
export function outcome(
  cell: MatrixCell,
  o: {
    attempt?: number
    fail?: Partial<Record<AnyStep, string>>
    missing?: boolean
    notes?: string[]
    patches?: string[]
    modulesTs?: string
    memory?: string
  } = {},
): CellOutcome {
  const attempt = o.attempt ?? 1
  const fail = o.fail ?? {}
  // Step conditions of nightly.yml: initialize also runs after a red typecheck.
  const c: Record<string, 'success' | 'failure' | 'skipped'> = {}
  const run = (s: string, cond: boolean) => (c[s] = cond ? (s in fail ? 'failure' : 'success') : 'skipped')
  const ok = (s: string) => c[s] === 'success'
  const pre = !('prepare' in fail) && !('patch' in fail) && !('env' in fail)
  run('scaffold', !('prepare' in fail))
  run('install', ok('scaffold') && pre)
  run('add', !cell.baseline && ok('install'))
  run('generate', ok('add') || (cell.baseline && ok('install')))
  run('typecheck', ok('generate'))
  run('initialize', ok('generate'))
  run('build', ok('initialize'))
  run('start', ok('build'))
  run('smoke', ok('start'))
  const ladder = Object.fromEntries(
    LADDER.map((s) => [s, { conclusion: c[s] ?? 'skipped', sec: c[s] === 'skipped' ? null : 5 }]),
  ) as CellOutcome['ladder']
  const harnessFail = (['prepare', 'patch', 'env'] as const).filter((h) => h in fail)
  return {
    key: cell.key,
    key12: cell.key12,
    line: cell.line,
    attempt,
    jobFound: !o.missing,
    jobConclusion: o.missing ? null : Object.keys(fail).length > 0 ? 'failure' : 'success',
    url: `https://github.com/wojciechszyjka/modules/actions/runs/${attempt === 1 ? 100 : 200}/job/1`,
    startedAt: NIGHT,
    durationSec: 420,
    ladder,
    harnessSteps: Object.fromEntries(
      (['prepare', 'patch', 'env', 'pack'] as const).map((h) => [
        h,
        harnessFail.includes(h as never) ? 'failure' : 'success',
      ]),
    ),
    failures: (Object.keys(fail) as AnyStep[]).map((s) => classifyStep(s, fail[s] ?? '', { attempt })),
    patches: o.patches ?? cell.patches,
    notes: o.notes ?? [],
    yarn: '4.17.1',
    modulesTs: o.modulesTs ?? null,
    memory: o.memory ?? null,
  }
}

export const CONSENTS_TS =
  "node_modules/@piotrkarwatka/marketing-consents/types/modules/marketing_consents/components/ConsentsTable.tsx(154,13): error TS2321: Excessive stack depth comparing types '{ title: string; titleHeadingLevel: 1; columns: LegacyColumnDef<ConsentRow>[]; data: ConsentRow[]; ...' and 'IntrinsicAttributes & DataTableProps...\n" +
  "node_modules/@piotrkarwatka/marketing-consents/types/modules/marketing_consents/components/ConsentsTable.tsx(154,89): error TS2322: Type 'LegacyColumnDef<ConsentRow>[]' is not assignable to type 'LegacyColumnDef<ConsentRow, any>[]'.\n"
export const CONSENTS_BUILD = `Creating an optimized production build ...\n${CONSENTS_TS}Failed to type check.\n`
export const API_KEY_INIT =
  'Restoring module defaults...\nModule defaults restored\nSetting up RBAC and users...\nPassword policy validation skipped for setup.\nInitialization failed: Metadata for entity ApiKey not found\n'

export const MODULES_TS_09 = `import type { ModuleEntry } from '@open-mercato/shared/modules/registry'
export const enabledModules: ModuleEntry[] = [
  { id: 'auth', from: '@open-mercato/core' },
  { id: 'directory', from: '@open-mercato/core' },
  { id: 'configs', from: '@open-mercato/core' },
  { id: 'entities', from: '@open-mercato/core' },
  { id: 'query_index', from: '@open-mercato/core' },
  { id: 'api_docs', from: '@open-mercato/core' },
  { id: 'audit_logs', from: '@open-mercato/core' },
  { id: 'notifications', from: '@open-mercato/core' },
  { id: 'dashboards', from: '@open-mercato/core' },
  { id: 'events', from: '@open-mercato/events' },
  { id: 'search', from: '@open-mercato/search' },
  { id: 'attachments', from: '@open-mercato/core' },
  // { id: 'example', from: '@app' },
]
`
