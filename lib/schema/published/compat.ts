// /compat.json (spec 4.6). peersRejectFitting feeds the D13 sentence, computed from data.
import { z } from 'zod'
import { IsoDateTime, LineKey, Locator, LocPath, NpmName, SemVer } from '../common.ts'
import { FitStatus } from '../data/fit.ts'
import { BuiltFor, CellSummary, Line, ModulesIndex } from './modules.ts'

// `installs` (finding of 25 Oct) is a field of CellSummary, so compat.json, modules.json and /m/*.json carry it alike
export const CompatCell = CellSummary.extend({ fit: FitStatus })

export const CompatIndex = z.object({
  schemaVersion: z.literal(1),
  generatedAt: IsoDateTime,
  // additive (review r8): where the receipts come from, the `dataAsOf` of modules.json, so a machine reader of the
  // matrix sees a preview run as one (`source: 'preview'`) and never takes its cells for nightly CI
  dataAsOf: ModulesIndex.shape.dataAsOf.optional(),
  lines: z.array(Line),
  // the Open Mercato itself row per line: a new app (classic preset), and (additive, 24 Oct) an app from the empty preset
  baseline: z.record(LineKey, CellSummary),
  isolationBaseline: z
    .record(LineKey, CellSummary)
    .optional()
    .describe(
      "The Open Mercato itself row of an app from the empty preset per line: the baseline of the signal 'in isolation'.",
    ),
  // additive (24 Oct): a red baseline of a new app whose failure names only packages that app ships
  baselineCulprits: z
    .record(LineKey, z.array(NpmName))
    .optional()
    .describe(
      'Per line whose baseline (a new app, nothing added) is red only because of packages that app already registers: those packages (the smoke check of their route failed, or every TS error was in their files). Their cells are judged as on a green line, the other modules on their own runs. Absent: no such line.',
    ),
  rows: z.array(
    z.object({
      locator: Locator,
      path: LocPath,
      title: z.string(),
      // the version a new app has on the latest line (IndexEntry.compat.ships, else the version it installs)
      version: SemVer.nullable(),
      builtFor: BuiltFor,
      cells: z.record(LineKey, CompatCell),
      // additive (review r8, redefined 24 Oct): `IndexEntry.compat.inPresets`, the lines whose new app (classic) already
      // registers the package
      inPresets: z
        .array(LineKey)
        .optional()
        .describe(
          "Lines whose new app (from the classic preset) already registers the package. Their cells are the receipts of the version a new app ships there (IndexEntry.compat.ships): a verdict like any other. The signal 'in isolation' of each cell is IndexEntry.compat.isolation in modules.json.",
        ),
      // additive (24 Oct): the version a new app ships per line of inPresets, the version of that line's cell before a
      // receipt (`version` is the latest line's)
      ships: z
        .record(LineKey, SemVer)
        .optional()
        .describe(
          "On a line of inPresets, the version of the package a new app ships there (IndexEntry.compat.ships): the version that line's cell is about, with or without a receipt. `version` is the one of the latest line; builtFor.ranges names the declared range per line.",
        ),
    }),
  ),
  peersRejectFitting: z.object({ rejected: z.number().int(), fitting: z.number().int() }),
})

export type CompatCell = z.infer<typeof CompatCell>
export type CompatIndex = z.infer<typeof CompatIndex>
