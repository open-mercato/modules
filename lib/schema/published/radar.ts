// /radar/next.json (also data/radar/next.json) and /surface.json (spec 4.6).
import { z } from 'zod'
import { IsoDateTime, Locator, SemVer, StableSemVer, Step } from '../common.ts'

export const Radar = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: IsoDateTime,
    next: SemVer,
    base: StableSemVer,
    summary: z.string(),
    changedApis: z.array(
      z.object({ symbol: z.string(), change: z.enum(['signature', 'removed']), modules: z.array(Locator) }).strict(),
    ),
    staticBreaks: z.array(z.object({ locator: Locator, missing: z.array(z.string()) }).strict()),
    receiptsOnNext: z.object({ verified: z.number().int(), broken: z.number().int() }).strict(),
    sameFailure: z.array(z.object({ signature: z.string(), step: Step, modules: z.array(Locator) }).strict()),
    loadBearing: z.array(z.object({ symbol: z.string(), modules: z.number().int(), of: z.number().int() }).strict()),
  })
  .strict()

// only packages outside @open-mercato
export const Surface = z.object({
  schemaVersion: z.literal(1),
  generatedAt: IsoDateTime,
  base: StableSemVer,
  externalPackages: z.number().int(),
  symbols: z.array(z.object({ symbol: z.string(), modules: z.array(Locator) })), // symbol: 'pkg/subpath#Name'
})

export type Radar = z.infer<typeof Radar>
export type Surface = z.infer<typeof Surface>
