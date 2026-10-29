// /built-in.json (spec 4.6). Install command is `module enable`, never `module add` (add would replace core).
import { z } from 'zod'
import { CategoryId, IsoDateTime, ModuleId, StableSemVer, Wedge } from '../common.ts'
import { AnatomySummary } from './modules.ts'

export const BuiltInModule = z.object({
  id: ModuleId,
  title: z.string(),
  description: z.string(),
  category: CategoryId,
  wedge: Wedge,
  requires: z.array(z.string()),
  // additive (review round 3): /picker.json carries it for its built-in rows, as for package rows (audit C26)
  requiresCore: z
    .array(ModuleId)
    .optional()
    .describe('The entries of requires that are core modules (@open-mercato/core), by module ID. Absent: none.'),
  // lines whose new app (classic preset, what create-mercato-app makes without --preset) has the module on (redefined
  // 24 Oct: it named the empty preset before)
  inPresets: z
    .array(z.string())
    .describe(
      'Lines whose new app (from the classic preset, what create-mercato-app makes without --preset) already enables the module: nothing to enable there. `install` is for an app that does not have it.',
    ),
  // additive (24 Oct): lines whose app from the empty preset has the module on too
  inEmptyPreset: z
    .array(z.string())
    .optional()
    .describe('Lines whose app from the empty preset has the module on too, so no app of the line needs `install`.'),
  anatomy: AnatomySummary,
  install: z.string(), // "yarn mercato module enable @open-mercato/core --module <id>"
  page: z.string(), // "/built-in/<id>"
})

export const BuiltInIndex = z.object({
  schemaVersion: z.literal(1),
  coreVersion: StableSemVer,
  generatedAt: IsoDateTime,
  modules: z.array(BuiltInModule),
})

export type BuiltInModule = z.infer<typeof BuiltInModule>
export type BuiltInIndex = z.infer<typeof BuiltInIndex>
