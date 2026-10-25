// Hive cells for the site (spec 7.5): slots from data/hive.json (written by `yarn om hive`, WP11), group and wedge
// from lib/hive/candidates. Emit only reads slots; a candidate without a stored slot (data branch not yet
// refreshed) is placed in memory with the same `assignSlots`, never written back, and reported. A stored file from
// before the disc rules (no `layout: "disc"`) is never drawn: the whole map is laid out in memory, as the next
// `yarn om hive` will store it. The disc rules are checked on what is drawn and every broken rule is reported. Pure.
import { hiveCandidates } from '../hive/candidates.ts'
import { assignSlots, discBase, discViolations, isDiscLayout, type HiveSlotsFile } from '../hive/layout.ts'
import type { HiveCell } from '../hive/render.ts'
import type { BuiltInModule } from '../schema/published/builtin.ts'
import type { IndexEntry } from '../schema/published/modules.ts'
import type { EmitData, EntryContext } from './types.ts'

export function hiveCells(
  data: EmitData,
  ctxs: readonly EntryContext[],
  builtIn: readonly BuiltInModule[],
  latestKey: string | null,
  today: string,
  warn: (m: string) => void,
): HiveCell[] {
  const byLoc = new Map<string, IndexEntry>(ctxs.map((c) => [c.entry.locator, c.entry]))
  const { candidates, warnings } = hiveCandidates({
    descriptors: ctxs.map((c) => ({
      locator: c.entry.locator,
      kind: c.descriptor.kind,
      category: c.descriptor.category,
      tags: c.descriptor.tags,
      status: c.descriptor.status,
    })),
    sync: new Map(
      ctxs
        .filter((c) => c.sync)
        .map((c) => [c.entry.locator, { type: c.sync!.type, firstSeenAt: c.sync!.firstSeenAt }]),
    ),
    listed: new Map(ctxs.map((c) => [c.entry.locator, c.entry.listed])),
    builtIn: builtIn.map((b) => b.id),
    builtInAddedAt: '',
    categoryWedge: new Map(data.categories.map((c) => [c.id, c.wedge])),
    builtinCategories: new Map(builtIn.map((b) => [b.id, b.category])),
  })
  for (const w of warnings) warn(`hive: ${w}`)
  const raw = data.hive as HiveSlotsFile | null
  const legacy = raw !== null && !isDiscLayout(raw) && Object.keys(raw.slots).length > 0
  if (legacy)
    warn('hive: data/hive.json predates the disc layout; laid out again for this build only (run yarn om hive)')
  const { file, added } = assignSlots(discBase(raw), candidates, today)
  if (added.length > 0 && !legacy)
    warn(
      `hive: ${added.length} cells have no slot in data/hive.json yet; placed for this build only (run yarn om hive)`,
    )
  const infoByKey = new Map(candidates.map((c) => [c.key, c]))
  const broken = discViolations(
    Object.fromEntries(candidates.flatMap((c) => (file.slots[c.key] ? [[c.key, file.slots[c.key]!]] : []))),
    (k) => {
      const c = infoByKey.get(k)
      if (!c) return null
      return { wedge: c.wedge, official: c.group === 'official' }
    },
  )
  for (const b of broken) warn(`hive: disc rule broken: ${b}`)
  const builtInById = new Map(builtIn.map((b) => [b.id, b]))
  const cells: HiveCell[] = []
  for (const c of candidates) {
    const slot = file.slots[c.key]
    if (!slot) continue
    if (c.key.startsWith('core:')) {
      const b = builtInById.get(c.key.slice(5))
      cells.push({
        key: c.key,
        q: slot.q,
        r: slot.r,
        group: c.group,
        wedge: c.wedge,
        href: b?.page ?? `/built-in/${c.key.slice(5)}`,
        title: `${b?.title ?? c.key.slice(5)} · built into core`,
      })
      continue
    }
    const e = byLoc.get(c.key)
    if (!e) continue
    const level =
      latestKey && e.compat.verifiedOn.includes(latestKey)
        ? `verified on ${latestKey}`
        : e.compat.verifiedOn.length
          ? `verified on ${e.compat.verifiedOn.join(', ')}`
          : latestKey && e.compat.inPresets?.includes(latestKey)
            ? 'in a new app'
            : 'listed'
    cells.push({
      key: c.key,
      q: slot.q,
      r: slot.r,
      group: c.group,
      wedge: c.wedge,
      type: e.type,
      href: `/m/${e.path}`,
      title: `${e.title} · ${e.type} · ${level}`,
    })
  }
  return cells
}
