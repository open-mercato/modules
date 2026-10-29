// data/lines.json, data/presets.json, data/hive.json (spec 4.5).
import { z } from 'zod'
import { IsoDate, IsoDateTime, LineKey, ModuleId, NpmName, SemVer, StableSemVer } from '../common.ts'

const PresetModule = z.object({ id: ModuleId, from: NpmName }).strict()

export const DefaultPreset = z
  .object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/), modules: z.array(PresetModule).max(160) })
  .strict()

export const Lines = z
  .object({
    resolvedAt: IsoDateTime,
    coreLatest: StableSemVer,
    keepaliveAt: IsoDateTime.nullable(),
    lines: z
      .array(
        z
          .object({
            key: LineKey,
            version: SemVer,
            source: z.enum(['latest', 'previous', 'develop']),
            createApp: z.string(),
            cadence: z.enum(['nightly', 'weekly']),
            // npmPreapprovedPackages from template/.yarnrc.yml.template of create-mercato-app for this line (today "@open-mercato/*")
            preapproved: z.array(z.string().max(100)).max(20),
            // additive (review r11): the default starter preset of this version (`DEFAULT_PRESET_ID` of dist/index.js,
            // `classic`) and the modules its src/modules.ts registers (the template's `enabledModules` literal, without
            // comments, `@app` and the `if (env)` blocks), read with `preapproved` from the same tarball. null: read, not
            // known (the default preset is not `classic`, or the tarball has no template). Absent: not read yet.
            defaultPreset: DefaultPreset.nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict()

// data/presets.json: from src/modules.ts after the baseline scaffold (baseline cell artifact, written by collect), per
// line and starter preset (24 Oct): `empty` from the baseline of the empty preset, `classic` (additive) from the baseline
// of the classic preset, what a new app registers. A line has the key of each preset whose baseline was collected; the
// core fills the rest (lib/core/lines.ts presetsOrFallback).
export const Presets = z.record(
  LineKey,
  z
    .object({
      omVersion: SemVer,
      empty: z.array(PresetModule).max(80).optional(),
      classic: z.array(PresetModule).max(160).optional(),
      at: IsoDateTime,
      // additive (review round 4): when the night that last wrote a preset list of this entry measured it (its first
      // attempt). `at` is stamped by every collected night, measured or not, so only this tells a late retry whether a
      // newer night measured the line. Absent on entries written before it.
      measuredAt: IsoDateTime.optional(),
    })
    .strict(),
)

// key: locator or 'core:<id>'
export const HiveSlots = z
  .object({
    version: z.literal(1),
    // 'disc': laid out by the round-plate rules (spec 7.5 amendment); a file without it is laid out again once
    layout: z.literal('disc').optional(),
    slots: z.record(z.string(), z.object({ q: z.number().int(), r: z.number().int(), at: IsoDate }).strict()),
  })
  .strict()

export type Lines = z.infer<typeof Lines>
export type Presets = z.infer<typeof Presets>
export type HiveSlots = z.infer<typeof HiveSlots>
export type DefaultPreset = z.infer<typeof DefaultPreset>
