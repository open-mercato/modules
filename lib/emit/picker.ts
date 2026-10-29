// /picker.json (spec 4.6, 9.2): 1:1 with `CatalogModule` of the create-mercato-app picker. One item per module ID
// of each listed `kind: module` npm entry (install with `--module <id>` when the package has several modules; a module
// of the enterprise package is turned on in .env, `enterpriseEnableCommand`), plus the built-in modules as
// `source: core`. Pure.
// The picker belongs to create-mercato-app, which makes the classic preset by default (decision of 24 Oct): the
// commands per line are those of a new app (the classic preset), and a line whose new app already registers the module
// has no command (`inPresets` names it), as the site and the tools say `Nothing to install` there.
import { installInfo, presetFlagCommand, presetFlagEmptyCommand } from '../core/plan.ts'
import { emptyPresetVersion, installVersion } from '../core/policy.ts'
import { ascendingKeys, latestLine, registeredIn, type LineInfo } from '../core/lines.ts'
import { collisionLintText } from '../core/finding.ts'
import { INSTALLABLE_META_KEY, presetInstallText } from '../core/policy.ts'
import type { BuiltInModule } from '../schema/published/builtin.ts'
import type { IndexEntry } from '../schema/published/modules.ts'
import type { PickerIndex, PickerModule } from '../schema/published/picker.ts'
import type { Presets } from '../schema/data/index.ts'

function source(e: IndexEntry): PickerModule['source'] {
  if (e.enterprise) return 'enterprise'
  if (e.type === '3rd-party') return 'third-party'
  return e.type
}

/**
 * The modules of a new app whose backend route the entry adds too, on any line (`compat.collisions`), and the lint
 * sentence of the first one with its lines, as the module page's Hygiene list says it. Null without a collision.
 */
function collisionsOf(e: IndexEntry, lines: readonly LineInfo[]): { ids: string[]; text: string } | null {
  const ids: string[] = []
  let first: { c: NonNullable<IndexEntry['compat']['collisions']>[string][number]; keys: string[] } | null = null
  for (const key of ascendingKeys(
    lines.map((l) => l.key),
    lines,
  )) {
    for (const c of e.compat.collisions?.[key] ?? []) {
      if (!ids.includes(c.module)) ids.push(c.module)
      if (!first) first = { c, keys: [key] }
      else if (first.c.route === c.route && first.c.module === c.module && !first.keys.includes(key))
        first.keys.push(key)
    }
  }
  return first ? { ids, text: collisionLintText(first.c, first.keys) } : null
}

export function buildPicker(
  entries: readonly IndexEntry[],
  builtIn: readonly BuiltInModule[],
  lines: readonly LineInfo[],
  presets: Presets | null,
  now: string,
): PickerIndex {
  const latest = latestLine(lines)
  const preset = latest ? (presets?.[latest.key]?.empty ?? null) : null
  const classic = (key: string) => presets?.[key]?.classic ?? null
  const modules: PickerModule[] = []
  for (const e of entries) {
    if (e.kind !== 'module' || !e.listed || e.npm === null) continue
    const collide = collisionsOf(e, lines)
    // module IDs (core:<id> -> <id>); a catalog peer keeps its raw npm name
    const requires = e.requires.map((r) => (r.resolvesTo?.startsWith('core:') ? r.resolvesTo.slice(5) : r.raw))
    // the requirements that are core modules, by module ID (audit of 29 Oct, C26: `data_sync` of sync-shopify matched
    // a package that publishes data_sync too); additive, `requires` keeps its values for readers of v1
    const requiresCore = e.requires.filter((r) => r.resolvesTo?.startsWith('core:')).map((r) => r.resolvesTo!.slice(5))
    for (const id of e.moduleIds) {
      const several = e.moduleIds.length > 1
      const target = {
        npm: e.npm,
        locator: e.locator,
        moduleIds: [id],
        version: e.version,
        _meta: { [INSTALLABLE_META_KEY]: e._meta?.[INSTALLABLE_META_KEY] },
        moduleFlag: several ? id : e.install.moduleFlag,
      }
      // a module a new app registers behind an env flag (storage_s3): the package and the flag, never module add, which
      // registers it a second time (audit of 29 Oct, C01)
      const flagged = (key: string | null): string | null => presetFlagCommand(e, installVersion(e, key))
      const install =
        flagged(latest?.key ?? null) ?? (several ? installInfo(target, latest?.key ?? null, preset).cli : e.install.cli)
      // lines whose new app already registers this module ID from this package: nothing to propose there
      const inPresets = ascendingKeys(
        lines.filter((l) => registeredIn(presets, l.key, 'classic', e.npm, [id])).map((l) => l.key),
        lines,
      )
      // the install version of each verified line (D46): a create-mercato-app on 0.8 or next never gets the
      // version that only the latest line verified; the command of a new app (classic), none where it has the module
      const installByLine: Record<string, string> = {}
      for (const key of e.compat.verifiedOn)
        if (!inPresets.includes(key)) installByLine[key] = flagged(key) ?? installInfo(target, key, classic(key)).cli
      // the command of an app from the empty preset on each verified line, where it is not the one of installByLine
      // (audit of 29 Oct, C30: a crm or empty app planned nothing on a line whose new app registers the module): module
      // add, `yarn add` where that preset registers it too, module add and the flag for a module behind one
      const installEmptyPresetByLine: Record<string, string> = {}
      for (const key of e.compat.verifiedOn) {
        const v = emptyPresetVersion(e, key)
        const cmd = presetFlagEmptyCommand(target, v) ?? installInfo(target, key, presets?.[key]?.empty ?? null, v).cli
        if (cmd !== installByLine[key]) installEmptyPresetByLine[key] = cmd
      }
      modules.push({
        id,
        from: e.npm,
        title: e.title,
        description: e.summary,
        requires,
        ...(requiresCore.length ? { requiresCore } : {}),
        source: source(e),
        locator: e.locator,
        license: { spdx: e.license.spdx, kind: e.license.kind },
        tier: e.tier,
        verifiedOn: e.compat.verifiedOn,
        install,
        installByLine,
        ...(Object.keys(installEmptyPresetByLine).length ? { installEmptyPresetByLine } : {}),
        ...(inPresets.length ? { inPresets } : {}),
        // the latest line's new app has it (round 13): `install` is the empty preset's, the note says so
        ...(latest && inPresets.includes(latest.key) ? { presetNote: presetInstallText([id]) } : {}),
        // a backend route a new app already has (round 15): the lint sentence of the page's Hygiene list
        ...(collide ? { conflictsWith: collide.ids, warning: collide.text } : {}),
      })
    }
  }
  for (const b of builtIn)
    modules.push({
      id: b.id,
      from: '@open-mercato/core',
      title: b.title,
      description: b.description,
      requires: b.requires,
      // the same contract as a package row: absent means no core requirement (review round 3)
      ...(b.requiresCore?.length ? { requiresCore: [...b.requiresCore] } : {}),
      source: 'core',
      locator: 'npm:@open-mercato/core',
      license: { spdx: 'MIT', kind: 'osi' }, // packages/core/package.json of the monorepo

      tier: null,
      verifiedOn: [],
      install: b.install,
      installByLine: {},
      ...(b.inPresets.length ? { inPresets: [...b.inPresets] } : {}),
      ...(latest && b.inPresets.includes(latest.key) ? { presetNote: presetInstallText([b.id]) } : {}),
    })
  return { schemaVersion: 1, generatedAt: now, lines: lines.map((l) => l.key), modules }
}
