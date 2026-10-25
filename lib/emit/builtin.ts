// /built-in.json (spec 4.6, 11.2): modules that ship with @open-mercato/core, from data/builtin/<coreLatest>.json.
// Category from policy/builtin-categories.yml; a module outside the map goes to `operations` with a warning and
// never stops the emit (spec 4.4). The install command is `module enable` (lib/core builtInModule). Pure.
import { builtInModule } from '../core/entry.ts'
import type { CategoryId, Wedge } from '../schema/common.ts'
import type { BuiltInIndex, BuiltInModule } from '../schema/published/builtin.ts'
import type { EmitData } from './types.ts'

export function buildBuiltInModules(data: EmitData, warn: (m: string) => void): BuiltInModule[] {
  const b = data.builtin
  if (!b) return []
  const wedgeOf = new Map<string, Wedge>(data.categories.map((c) => [c.id, c.wedge]))
  const map = data.builtinCategories
  if (!map) warn('policy/builtin-categories.yml is missing; every core module goes to operations')
  const ids = new Set(b.modules.map((m) => m.id))
  const upcoming = new Set(data.builtinUpcoming ?? [])
  const extra = map ? Object.keys(map).filter((id) => !ids.has(id) && !upcoming.has(id)) : []
  if (extra.length > 0)
    warn(
      `policy/builtin-categories.yml: ${extra.length} IDs are not core modules of ${b.coreVersion}: ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? ', ...' : ''}`,
    )
  const shipped = [...upcoming].filter((id) => ids.has(id)).sort()
  if (shipped.length > 0)
    warn(`policy/builtin-upcoming.yml: core ${b.coreVersion} ships ${shipped.join(', ')}; remove them from that file`)
  return b.modules
    .map((m) => {
      let category: CategoryId | undefined = map?.[m.id]
      if (!category) {
        if (map) warn(`core module ${m.id} is not in policy/builtin-categories.yml; placed in operations`)
        category = 'operations'
      }
      return builtInModule({
        module: m,
        coreVersion: b.coreVersion,
        category,
        wedge: wedgeOf.get(category) ?? 'operate',
        presets: data.presets,
        routesMeasured: b.routesMeasured,
      })
    })
    .sort((a, b2) => a.id.localeCompare(b2.id))
}

export function buildBuiltInIndex(coreVersion: string, modules: BuiltInModule[], now: string): BuiltInIndex {
  return { schemaVersion: 1, coreVersion, generatedAt: now, modules }
}
