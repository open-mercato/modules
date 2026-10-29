// data/fit/<omVersion>.json (spec 4.5). Written only by `watch`.
import { z } from 'zod'
import { BuiltForKind, IsoDateTime, SemVer } from '../common.ts'

export const FitStatus = z.enum(['ok', 'drift', 'no-fit', 'unknown'])

export const FitCell = z
  .object({
    status: FitStatus,
    checked: z.number().int(),
    missing: z
      .array(
        z
          .object({
            pkg: z.string(),
            subpath: z.string(),
            symbol: z.string().nullable(),
            kind: z.enum(['subpath', 'symbol']),
          })
          .strict(),
      )
      .max(50),
    drift: z.array(z.string().max(160)).max(50), // 'pkg/subpath#Symbol' (only against latest)
    declared: z.object({ range: z.string().nullable(), kind: BuiltForKind, satisfied: z.boolean() }).strict(),
    hostDuplicates: z
      .array(z.object({ name: z.string(), moduleRange: z.string(), appVersion: z.string() }).strict())
      .max(30), // lint host-dependency-duplication
  })
  .strict()

// cell key: 'npm:@x/y@1.2.3'. driftAgainst (additive, review round 3): the `latest` version every cell's drift was
// computed against, null when there was no latest line; a file without it, or with another version than the current
// latest, is refit by the next watch (lib/sources/watch.ts pendingFitLines).
export const FitResult = z
  .object({
    om: SemVer,
    computedAt: IsoDateTime,
    driftAgainst: SemVer.nullable().optional(),
    cells: z.record(z.string(), FitCell),
  })
  .strict()

export type FitStatus = z.infer<typeof FitStatus>
export type FitCell = z.infer<typeof FitCell>
export type FitResult = z.infer<typeof FitResult>
