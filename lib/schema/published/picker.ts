// /picker.json (spec 4.6), 1:1 with CatalogModule of the create-mercato-app picker spec. Only kind module, listed.
import { z } from 'zod'
import { IsoDateTime, LicenseKind, LineKey, Locator, ModuleId, NpmName } from '../common.ts'

export const PickerModule = z.object({
  id: ModuleId,
  from: NpmName,
  title: z.string(),
  description: z.string(),
  requires: z.array(z.string()),
  source: z.enum(['core', 'official', 'community', 'third-party', 'enterprise']),
  locator: Locator,
  license: z.object({ spdx: z.string().nullable(), kind: LicenseKind }),
  tier: z.enum(['listed', 'verified']).nullable(),
  verifiedOn: z.array(LineKey),
  /** Command with the version of the latest line (`recommended`, D46). */
  install: z.string(),
  /**
   * Command per line in `verifiedOn`, with the version verified on that line (D46), for a new app (the classic preset,
   * what create-mercato-app makes); a line of `inPresets` has none. Added after v1, optional for readers.
   */
  installByLine: z.record(LineKey, z.string()),
  // additive (29 Oct, audit C30): installByLine is for a new app (the classic preset) and has no command on a line
  // whose new app registers the module, so an app from another preset had nothing to run there
  installEmptyPresetByLine: z
    .record(LineKey, z.string())
    .optional()
    .describe(
      'Command per line in verifiedOn for an app from the empty preset, or another app that does not register the module, where it differs from installByLine: a line of inPresets (`yarn mercato module add`, or `yarn add` when the empty preset registers it too) and a module a new app registers behind an env flag (`module add` and the flag). A picker for a preset other than classic prefers it and falls back to installByLine, then install. Absent line or field: installByLine is that command.',
    ),
  // additive (24 Oct): create-mercato-app makes the classic preset by default, and that preset already registers some
  // modules (checkout, webhooks, currencies): the picker offers nothing to install for them on those lines
  inPresets: z
    .array(LineKey)
    .optional()
    .describe(
      'Lines whose new app (from the classic preset, what create-mercato-app makes by default) already registers this module: nothing to install there, and installByLine has no command for them. `install` is then the command of an app that does not register it yet (an app from the empty preset). Absent: no such line.',
    ),
  // additive (round 13): the latest line is in `inPresets`, so `install` is not for a new app; the sentence the site,
  // the cards and search_modules print there, for a picker to show instead of offering the command
  presetNote: z
    .string()
    .optional()
    .describe(
      'Set when the latest line is in inPresets: `Nothing to install: a new app already registers <id> in src/modules.ts.` A picker for a new app (the classic preset) shows this and offers no command; `install` is only for an app from the empty preset. Absent otherwise.',
    ),
  // additive (round 15): a backend route of the module that a module of a new app already has (lint
  // `backend-route-collision`, `compat.collisions`): `yarn generate` refuses it in `module add`, so a picker for a new
  // app shows the warning next to the command; the site, the card and the tools say the same
  conflictsWith: z
    .array(ModuleId)
    .optional()
    .describe(
      'Module IDs of a new app (the classic preset) on some line whose backend route this module adds too. yarn generate refuses two modules with one backend route, so module add fails there. `warning` says it in one sentence. Absent: no collision found.',
    ),
  warning: z
    .string()
    .max(300)
    .optional()
    .describe(
      'Set with conflictsWith: `Adds the backend route /backend/webhooks, which a new app on 0.8 and 0.9 already has from the webhooks module (@open-mercato/webhooks). The generate step refuses two modules with one backend route.`',
    ),
})

export const PickerIndex = z.object({
  schemaVersion: z.literal(1),
  generatedAt: IsoDateTime,
  lines: z.array(LineKey),
  modules: z.array(PickerModule),
})

export type PickerModule = z.infer<typeof PickerModule>
export type PickerIndex = z.infer<typeof PickerIndex>
