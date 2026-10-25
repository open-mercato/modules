// data/receipts/<locpath>.jsonl and data/receipts/_baseline.jsonl (spec 4.5). Written only by `collect`.
import { z } from 'zod'
import { CellStatus, IsoDate, IsoDateTime, LineKey, Locator, NpmName, SemVer, StarterPreset, Step } from '../common.ts'

export const Receipt = z
  .object({
    schema: z.literal(1),
    id: z.string().regex(/^r_\d{8}_[a-f0-9]{12}$/), // r_<yyyymmdd>_<12 chars of cellKey>
    cellKey: z.string().regex(/^[a-f0-9]{64}$/),
    module: z.object({ locator: Locator, version: SemVer, integrity: z.string().nullable() }).strict().nullable(), // null = baseline
    // preset (additive, 24 Oct): `classic` receipts give the main verdict, `empty` ones the signal `in isolation`; every
    // receipt before 24 Oct says `empty`, and a receipt without the field reads as `empty` (lib/core/lines.ts receiptPreset)
    om: z.object({ line: LineKey, version: SemVer, createApp: z.string(), preset: StarterPreset.optional() }).strict(),
    harness: z
      .object({
        version: z.string(),
        node: z.string(),
        yarn: z.string(),
        // 'preview-docker': local preview runner (harness/local/run-cell.sh), never the CI matrix; marked so it is
        // never mistaken for a GitHub runner result.
        runner: z.enum(['ubuntu-latest', 'preview-docker']),
        mode: z.enum(['realistic', 'early']),
        patches: z.array(z.object({ id: z.string(), why: z.string(), ref: z.string().url() }).strict()),
        // additive (24 Oct): the memory limit of the cell container of the preview runner (`--memory`, e.g. `8g`); CI
        // receipts have none (a GitHub runner has 16 GB). A step that limit cut short is infra (classify.ts cell-oom).
        memory: z
          .string()
          .regex(/^[1-9][0-9]?g$/)
          .optional(),
      })
      .strict(),
    // culprits (additive, 24 Oct): the packages of a new app the night's red baseline was held against (result.culprits
    // of that baseline); a module cell outside them is judged on its own run (lib/receipts/state.ts)
    baseline: z
      .object({ status: CellStatus, receipt: z.string().nullable(), culprits: z.array(NpmName).max(10).optional() })
      .strict()
      .nullable(),
    requiresInstalled: z.array(z.string().max(220)).max(10), // requires closure installed before the module
    steps: z.array(
      z
        .object({
          name: Step,
          status: z.enum(['pass', 'fail', 'skipped']),
          sec: z.number().int().nullable(),
          signature: z.string().nullable(),
          excerpt: z.string().max(1200).nullable(),
          file: z.string().max(300).nullable(),
          line: z.number().int().nullable(),
        })
        .strict(),
    ),
    result: z
      .object({
        status: CellStatus,
        failedStep: Step.nullable(),
        alsoFailed: z.array(Step),
        classification: z.enum(['pass', 'module-fail', 'harness-red', 'infra', 'quarantine']),
        quarantineUntil: IsoDate.nullable(),
        // additive (24 Oct), a red baseline of the classic preset only: the catalog packages its new app registers whose
        // failure alone made it red (the smoke check of their route, or TS errors in their files only). The line is
        // not red for the other modules then: each is judged on its own run, and these packages' cells as on a green line.
        culprits: z.array(NpmName).max(10).optional(),
      })
      .strict(),
    transition: z.object({ from: CellStatus.nullable(), to: CellStatus, confirmed: z.boolean() }).strict(),
    run: z
      .object({
        id: z.number().int(),
        attempt: z.number().int(),
        url: z.string().url(),
        at: IsoDateTime,
        durationSec: z.number().int(),
      })
      .strict(),
    attestation: z.null(),
    // Additive (WP07): notes of spec 5.3 / D10 that have no other field. 'in-preset': the module is registered by the
    // empty preset, so `add` was `yarn add` only. 'flaky': red on the first attempt, green on the retry.
    notes: z
      .array(z.enum(['in-preset', 'flaky']))
      .max(4)
      .optional(),
  })
  .strict()

export type Receipt = z.infer<typeof Receipt>
