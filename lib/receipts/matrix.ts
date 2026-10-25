// out/matrix.json (spec 5.3 "Plan macierzy"): the cells of one nightly run, written by `yarn om plan-matrix` in the
// `plan` job (no foreign code) and read by the `cell` jobs (as the GitHub matrix), by `collect` (artifact `matrix-a<n>`)
// and by the preview runner (`yarn om cells-local`).
import { z } from 'zod'
import { IsoDate, IsoDateTime, LineKey, Locator, ModuleId, NpmName, SemVer, StarterPreset } from '../schema/common.ts'

export const Runner = z.enum(['ubuntu-latest', 'preview-docker'])
export type Runner = z.infer<typeof Runner>
export const CellMode = z.enum(['realistic', 'early'])
export type CellMode = z.infer<typeof CellMode>

const Key = z.string().regex(/^[a-f0-9]{64}$/)
const Key12 = z.string().regex(/^[a-f0-9]{12}$/)
/** A GET path the smoke test may request: no parameters, no query. */
const SmokePath = z.string().regex(/^\/[A-Za-z0-9/_.-]+$/)
/** `<npm>=<route>`: a package of a new app and the GET route its baseline smoke-tests (harness/smoke.sh SMOKE_PRESET). */
const PresetSmoke = z
  .string()
  .max(260)
  .regex(/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*=\/[A-Za-z0-9/_.-]+$/)
/**
 * `core:<id>` (enable a core module), `<npm>@<exact version>` (catalog module) or `lib:<npm>@<exact version>` (a
 * catalog library the module peers on, installed with `yarn add`).
 */
const RequireSpec = z
  .string()
  .max(220)
  .regex(
    /^(core:[a-z][a-z0-9_]*|(?:lib:)?(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/,
  )
/** `<npm>@<exact version>`, or `<npm>@https://codeload.github.com/<owner>/<repo>/tar.gz/<tag>` for GitHub-only tags. */
const ModuleSpec = z
  .string()
  .max(300)
  .regex(
    /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*@(?:\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|https:\/\/codeload\.github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/tar\.gz\/[A-Za-z0-9._/-]+)$/,
  )

export const MatrixCell = z
  .object({
    key: Key,
    key12: Key12,
    /** True for the app of a line and preset as scaffolded, nothing added ("Open Mercato itself"). */
    baseline: z.boolean(),
    locator: Locator.nullable(),
    version: SemVer.nullable(),
    integrity: z.string().nullable(),
    line: LineKey,
    omVersion: SemVer,
    createApp: z.string(),
    /** Starter preset of the scaffold (24 Oct): classic gives the main verdict, empty the signal `in isolation`. A
     * matrix planned before 24 Oct has no field: every cell of it scaffolded the empty preset. */
    preset: StarterPreset.default('empty'),
    moduleSpec: ModuleSpec.nullable(),
    moduleNpm: NpmName.nullable(),
    moduleIds: z.array(ModuleId).max(60),
    moduleFlag: ModuleId.nullable(),
    thirdParty: z.boolean(),
    requiresSpecs: z.array(RequireSpec).max(10),
    replaces: z.array(ModuleId).max(3),
    official: z.boolean(),
    mode: CellMode,
    patches: z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).max(10),
    smokeApi: SmokePath.nullable(),
    backendPage: SmokePath.nullable(),
    smokePaths: z.array(SmokePath).max(5),
    /**
     * A baseline of the classic preset (review of 24 Oct): the catalog packages its new app registers. A red baseline
     * whose failure names only these (the smoke check of their route, TS errors in their files only) is held against
     * them, not against the line (lib/receipts/state.ts `baselineCulprits`). [] elsewhere.
     */
    presetPackages: z.array(NpmName).max(60).default([]),
    /**
     * A baseline of the classic preset: `<npm>=<route>`, the first authenticated GET route of each of `presetPackages`
     * that has one, smoke-tested in the baseline (harness/smoke.sh SMOKE_PRESET): what a new app ships is checked
     * every night, also where its packages' own cells run on the weekly night only. [] elsewhere.
     */
    presetSmoke: z.array(PresetSmoke).max(40).default([]),
    /** baseline 0, latest line 1, official 2, the rest 3 (order of the overflow cut). */
    priority: z.number().int().min(0).max(3),
    label: z.string().max(300),
  })
  .strict()
export type MatrixCell = z.infer<typeof MatrixCell>

/** A cell decided without a run: quarantine (age gate), untested (with a reason) or skipped (kind, enterprise). */
export const NotRunCell = z
  .object({
    key: Key,
    key12: Key12,
    locator: Locator,
    version: SemVer.nullable(),
    integrity: z.string().nullable(),
    line: LineKey,
    omVersion: SemVer,
    preset: StarterPreset.default('empty'),
    mode: CellMode,
    status: z.enum(['quarantine', 'untested', 'skipped']),
    reason: z.string().max(200),
    quarantineUntil: IsoDate.nullable(),
  })
  .strict()
export type NotRunCell = z.infer<typeof NotRunCell>

export const Matrix = z
  .object({
    schema: z.literal(1),
    generatedAt: IsoDateTime,
    attempt: z.number().int().min(1),
    runner: Runner,
    node: z.string().regex(/^\d+\.\d+\.\d+$/),
    harness: z.object({ hash: Key, version: z.string().regex(/^[a-f0-9]{12}$/) }).strict(),
    lines: z
      .array(
        z
          .object({
            key: LineKey,
            version: SemVer,
            source: z.enum(['latest', 'previous', 'develop']),
            createApp: z.string(),
            due: z.boolean(),
          })
          .strict(),
      )
      .max(4),
    cells: z.array(MatrixCell).max(256),
    notRun: z.array(NotRunCell),
    /** Cells cut by the budget, run on a later night (spec 5.3: baseline, latest, official, rest). */
    deferred: z.array(z.object({ key: Key, label: z.string().max(300) }).strict()),
    /**
     * Due cells skipped because a confirmed receipt with the same key is younger than 7 days, or, for a cell of the
     * empty preset, a confirmed receipt of the same version there under any harness (`memoIsolation` of them).
     */
    memo: z.number().int().min(0),
    /** The part of `memo` that rests on fresh isolation receipts of any harness (additive, 24 Oct). */
    memoIsolation: z.number().int().min(0).optional(),
    /** When the first of those receipts is 7 days old and its cell runs again. */
    memoIsolationUntil: IsoDateTime.nullable().optional(),
    estimate: z
      .object({
        parallel: z.number().int().positive(),
        minutesPerCell: z.number().positive(),
        budgetMin: z.number().positive(),
        windowMin: z.number().min(0),
      })
      .strict(),
  })
  .strict()
export type Matrix = z.infer<typeof Matrix>

/** GitHub job name of a cell; `collect` reads the key back from it (the step status comes from the API). */
export function cellJobName(c: Pick<MatrixCell, 'key12' | 'line'>): string {
  return `cell ${c.key12} ${c.line}`
}

export function parseCellJobName(name: string): { key12: string; line: string } | null {
  const m = /^cell ([a-f0-9]{12}) (\d+\.\d+|next)$/.exec(name.trim())
  return m ? { key12: m[1] as string, line: m[2] as string } : null
}

export function cellArtifactName(c: Pick<MatrixCell, 'key12' | 'line'>, attempt: number): string {
  return `cell-${c.key12}-${c.line}-a${attempt}`
}

export function matrixArtifactName(attempt: number): string {
  return `matrix-a${attempt}`
}
