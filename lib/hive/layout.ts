// The Hive (spec 7.5): stable slots on a pointy-top hex grid. `layout.ts` computes, `yarn om hive` persists
// (data/hive.json), emit only reads. Isomorphic: no Node APIs.

export type Wedge = 'sell' | 'operate' | 'money' | 'connect' | 'think' | 'platform'
export type HiveGroup = 'core' | 'official' | 'ecosystem'

/** Wedge centre angles in degrees, screen coordinates (y down): sell points up. */
export const WEDGE_CENTRE: Record<Wedge, number> = {
  sell: -90,
  operate: -30,
  money: 30,
  connect: 90,
  think: 150,
  platform: 210,
}
export const WEDGES = Object.keys(WEDGE_CENTRE) as Wedge[]
const GROUP_ORDER: Record<HiveGroup, number> = { core: 0, official: 1, ecosystem: 2 }

export interface Axial {
  q: number
  r: number
}
export interface Slot extends Axial {
  /** IsoDate the slot was assigned. */
  at: string
}
export interface HiveSlotsFile {
  version: 1
  /** `disc`: laid out by the round-plate rules (review r1). Files without it predate them and are laid out again. */
  layout?: 'disc'
  slots: Record<string, Slot>
}

/** True when a stored file follows the round-plate rules; older files are laid out again once (spec 7.5 amendment). */
export const isDiscLayout = (file: HiveSlotsFile | null | undefined): boolean => file?.layout === 'disc'

/** The file `yarn om hive` and emit start from: a stored disc layout as is, anything older as an empty map. */
export function discBase(file: HiveSlotsFile | null | undefined): HiveSlotsFile {
  return file && isDiscLayout(file) ? file : { version: 1, layout: 'disc', slots: {} }
}

/** A cell that wants a slot: key is a locator or `core:<id>`. */
export interface HiveCandidate {
  key: string
  group: HiveGroup
  wedge: Wedge
  /** IsoDate or IsoDateTime: SyncRecord.firstSeenAt; built-in modules use the core release date or ''. */
  addedAt: string
}

export const ring = (a: Axial): number => (Math.abs(a.q) + Math.abs(a.r) + Math.abs(a.q + a.r)) / 2

/** Unit-radius pixel centre of an axial cell (pointy-top). */
export function axialToPixel(a: Axial, radius = 1): { x: number; y: number } {
  return { x: radius * Math.sqrt(3) * (a.q + a.r / 2), y: radius * 1.5 * a.r }
}

/** Angle of a cell centre in degrees, in (-180, 180]; the origin has no angle (NaN). */
export function cellAngle(a: Axial): number {
  if (a.q === 0 && a.r === 0) return Number.NaN
  const p = axialToPixel(a)
  return (Math.atan2(p.y, p.x) * 180) / Math.PI
}

export function angularDistance(a: number, b: number): number {
  const d = Math.abs(((((a - b) % 360) + 540) % 360) - 180)
  return d
}

/** A cell belongs to a wedge when its angle is within 30 degrees of the wedge centre; the origin fits every wedge. */
export function inWedge(a: Axial, wedge: Wedge): boolean {
  const ang = cellAngle(a)
  if (Number.isNaN(ang)) return true
  return angularDistance(ang, WEDGE_CENTRE[wedge]) <= 30 + 1e-9
}

/** Cells of ring k (k = 0 is the origin), in a fixed order. */
export function ringCells(k: number): Axial[] {
  if (k === 0) return [{ q: 0, r: 0 }]
  const dirs: Axial[] = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ]
  const out: Axial[] = []
  let cur: Axial = { q: -k, r: k } // start at direction 4 scaled
  for (const d of dirs) {
    for (let i = 0; i < k; i++) {
      out.push(cur)
      cur = { q: cur.q + d.q, r: cur.r + d.r }
    }
  }
  return out
}

const keyOf = (a: Axial): string => `${a.q},${a.r}`

function compareCandidates(a: HiveCandidate, b: HiveCandidate): number {
  return (
    GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
    (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  )
}

export interface AssignResult {
  file: HiveSlotsFile
  added: string[]
}

/** Clockwise angle from the top (sell, -90 degrees), 0..360: the reading order of the official ring. */
export function clockAngle(a: Axial): number {
  const ang = cellAngle(a)
  return Number.isNaN(ang) ? 0 : (((ang + 90) % 360) + 360) % 360
}
/** Wedge order around the map, clockwise from sell. */
const WEDGE_ORDER = (w: Wedge): number => ((((WEDGE_CENTRE[w] + 90) % 360) + 360) % 360) / 60

/** Squared distance of a cell centre from the origin, in neighbour units (q^2 + qr + r^2): equal values form a shell. */
export const dist2 = (a: Axial): number => a.q * a.q + a.q * a.r + a.r * a.r

/**
 * Centre of the plate (spec 7.5 amendment, review r3): the top corner of the origin cell, where three cells meet, in
 * unit-radius pixels. Around a corner the cells at equal distance come in threes and mirror about the vertical, so
 * every band can be laid out symmetric about the vertical axis (around a cell centre 46 core cells cannot be).
 */
export const PLATE_CENTRE = { x: 0, y: -1 } as const

/** Squared distance of a cell centre from the plate centre, in neighbour units (a neighbour is 1 away). */
export function plateDist2(a: Axial): number {
  const p = axialToPixel(a)
  return ((p.x - PLATE_CENTRE.x) ** 2 + (p.y - PLATE_CENTRE.y) ** 2) / 3
}

/** Clockwise angle around the plate centre from the top, 0..360. */
export function plateClock(a: Axial): number {
  const p = axialToPixel(a)
  const ang = (Math.atan2(p.y - PLATE_CENTRE.y, p.x - PLATE_CENTRE.x) * 180) / Math.PI
  return (((ang + 90) % 360) + 360) % 360
}

/** Horizontal offset of a cell centre from the vertical axis of the plate, in unit-radius pixels. */
const plateX = (a: Axial): number => axialToPixel(a).x - PLATE_CENTRE.x
const EPS = 1e-6

/** Every lattice cell within `maxDist` neighbour units of the plate centre, in shells of equal distance from it. */
function shells(maxDist = 12): Axial[][] {
  const by = new Map<number, Axial[]>()
  const rings = Math.ceil(maxDist / (Math.sqrt(3) / 2)) + 2
  for (let k = 0; k <= rings; k++)
    for (const a of ringCells(k)) {
      const d = plateDist2(a)
      if (d > maxDist * maxDist + EPS) continue
      const key = Math.round(d * 1e6)
      const list = by.get(key) ?? []
      list.push(a)
      by.set(key, list)
    }
  return [...by.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([, cells]) => cells.sort((a, b) => plateClock(a) - plateClock(b)))
}

/**
 * `need` cells of one shell, symmetric about the vertical axis of the plate: one cell on the axis when `need` is odd
 * (the top one first), then mirror pairs spread evenly around the clock. A shell without an axis cell and an odd
 * `need` gives one unpaired cell, the lowest left.
 */
function symmetricPick(shell: Axial[], need: number): Axial[] {
  const axis = shell.filter((a) => Math.abs(plateX(a)) < EPS).sort((a, b) => axialToPixel(a).y - axialToPixel(b).y)
  const right = shell.filter((a) => plateX(a) > EPS).sort((a, b) => plateClock(a) - plateClock(b))
  const mirror = (a: Axial): Axial | undefined =>
    shell.find((b) => Math.abs(plateX(b) + plateX(a)) < EPS && Math.abs(axialToPixel(b).y - axialToPixel(a).y) < EPS)
  const out: Axial[] = []
  let n = need
  if (n % 2 === 1 && axis.length > 0) {
    out.push(axis[0] as Axial)
    n--
  }
  const pairs = Math.min(Math.floor(n / 2), right.length)
  for (let i = 0; i < pairs; i++) {
    const a = right[Math.floor(((i + 0.5) * right.length) / pairs)] as Axial
    const m = mirror(a)
    out.push(a)
    if (m) out.push(m)
  }
  // an odd cell left over sits at the bottom, where an unpaired cell reads least
  const rest = shell
    .filter((a) => !out.includes(a))
    .sort((a, b) => axialToPixel(b).y - axialToPixel(a).y || plateX(a) - plateX(b))
  while (out.length < need && rest.length > 0) out.push(rest.shift() as Axial)
  return out
}

/**
 * The next `n` free cells nearest to the plate centre: whole shells first, and a shell that is only partly needed
 * gives cells symmetric about the vertical axis, spread around the clock, so each band stays round and its
 * silhouette mirrors left to right.
 */
function nearestCells(n: number, taken: Set<string>): Axial[] {
  const out: Axial[] = []
  for (const shell of shells()) {
    if (out.length >= n) break
    const free = shell.filter((a) => !taken.has(keyOf(a)))
    const need = n - out.length
    out.push(...(free.length <= need ? free : symmetricPick(free, need)))
  }
  for (const a of out) taken.add(keyOf(a))
  return out
}

/** Wedge order around the map, clockwise from sell (0..5). */
export const wedgeIndex = (w: Wedge): number => Math.round(WEDGE_ORDER(w))

/**
 * Lays `items` (sorted by wedge) on `cells` as clockwise sectors: cells sorted by clock angle, the sector of the
 * first wedge centred on the top. Within a sector the first items of `items` take the cells nearest the centre.
 */
function sectorFill<T extends { wedge: Wedge }>(cells: Axial[], items: T[], inner: (t: T) => number): Map<T, Axial> {
  const out = new Map<T, Axial>()
  if (items.length === 0) return out
  const ring = [...cells].sort((a, b) => plateClock(a) - plateClock(b) || plateDist2(a) - plateDist2(b))
  const ordered = [...items].sort((a, b) => wedgeIndex(a.wedge) - wedgeIndex(b.wedge))
  // rotate so the first sector straddles the top (clock angle 0)
  const firstWedge = ordered[0]!.wedge
  const firstSize = ordered.filter((t) => t.wedge === firstWedge).length
  const shift = Math.floor(firstSize / 2)
  const rotated = ring.map((_, i) => ring[(i - shift + ring.length) % ring.length] as Axial)
  let i = 0
  for (const w of WEDGES) {
    const group = ordered.filter((t) => t.wedge === w)
    if (group.length === 0) continue
    const sector = rotated
      .slice(i, i + group.length)
      .sort((a, b) => plateDist2(a) - plateDist2(b) || plateClock(a) - plateClock(b))
    const byInner = [...group].sort((a, b) => inner(a) - inner(b))
    byInner.forEach((t, j) => out.set(t, sector[j] as Axial))
    i += group.length
  }
  return out
}

/** Circular mean of clock angles, 0..360. */
function circularMean(xs: readonly number[]): number {
  const sx = xs.reduce((n, a) => n + Math.cos((a * Math.PI) / 180), 0)
  const sy = xs.reduce((n, a) => n + Math.sin((a * Math.PI) / 180), 0)
  return ((((Math.atan2(sy, sx) * 180) / Math.PI) % 360) + 360) % 360
}

/**
 * Clock angle each wedge's ecosystem cells aim for: the middle of the wedge's official sector, or, for a wedge with
 * no official cell, the boundary where its sector would be (between the neighbours before and after it).
 */
function sectorTargets(official: ReadonlyMap<HiveCandidate, Axial>): Map<Wedge, number> {
  const mids = new Map<Wedge, number>()
  for (const w of WEDGES) {
    const xs = [...official].filter(([c]) => c.wedge === w).map(([, a]) => plateClock(a))
    if (xs.length > 0) mids.set(w, circularMean(xs))
  }
  const out = new Map<Wedge, number>()
  WEDGES.forEach((w, i) => {
    const own = mids.get(w)
    if (own !== undefined) return void out.set(w, own)
    const before = [...Array(6).keys()].map((k) => WEDGES[(i - 1 - k + 12) % 6] as Wedge).find((x) => mids.has(x))
    const after = [...Array(6).keys()].map((k) => WEDGES[(i + 1 + k) % 6] as Wedge).find((x) => mids.has(x))
    if (before === undefined || after === undefined) return void out.set(w, (wedgeIndex(w) * 60) % 360)
    const a = mids.get(before) as number
    const b = mids.get(after) as number
    out.set(w, (a + ((b - a + 360) % 360 || 360) / 2) % 360)
  })
  return out
}

/**
 * Lays `items` on `cells` keeping the clockwise order of their targets: items sorted by `order`, cells by clock
 * angle, and the rotation with the least total angular distance to the targets wins. Each wedge's ecosystem cells then sit
 * next to each other, outside its official sector, while the set of cells stays the symmetric band.
 */
function orderedMatch<T>(cells: Axial[], items: T[], target: (t: T) => number, order: (t: T) => number): Map<T, Axial> {
  const out = new Map<T, Axial>()
  if (items.length === 0) return out
  const ring = [...cells].sort((a, b) => plateClock(a) - plateClock(b) || plateDist2(a) - plateDist2(b))
  const ordered = [...items].sort((a, b) => order(a) - order(b))
  let best = 0
  let bestCost = Infinity
  for (let s = 0; s < ring.length; s++) {
    let cost = 0
    ordered.forEach((t, j) => {
      cost += angularDistance(target(t), plateClock(ring[(j + s) % ring.length] as Axial))
    })
    if (cost < bestCost - EPS) {
      bestCost = cost
      best = s
    }
  }
  ordered.forEach((t, j) => out.set(t, ring[(j + best) % ring.length] as Axial))
  return out
}

/**
 * Assigns slots to new candidates and keeps every existing slot (spec 7.5): keys already in `existing` never move;
 * slots of keys no longer present stay reserved (a freed slot is never reused).
 *
 * Spec 7.5 amendment (review r1 "a disc, not a crescent", review r3 "a closed ring, mirrored"): on a first layout (no
 * core slot stored, or `yarn om hive --relayout`) the map is one round plate of three concentric bands around the
 * plate centre (`PLATE_CENTRE`, a cell corner):
 * - Core: the cells nearest to the centre, so the core is a solid disc in the middle.
 * - Official: the next cells, a closed ring around the core. Its cells are cut into six clockwise sectors, one per
 *   wedge, each as large as its number of official modules, the sell sector centred on the top.
 * - Ecosystem (community and third party): the next cells, outside the official ring. Each wedge's ecosystem modules
 *   sit side by side on the rim, as close as the band allows to the middle of the wedge's official sector.
 * Every band takes whole shells of equal distance and a partly needed shell symmetric about the vertical axis, so the
 * silhouette mirrors left to right whatever the counts. Later additions keep every stored slot: a new module takes
 * the free cell nearest to the centre within its wedge's sector and outside the band before its own; a new core
 * module takes the free cell nearest to the centre.
 */
export function assignSlots(existing: HiveSlotsFile, candidates: HiveCandidate[], at: string): AssignResult {
  const slots: Record<string, Slot> = { ...existing.slots }
  const taken = new Set(Object.values(slots).map(keyOf))
  const known = new Map<string, HiveCandidate>(candidates.map((c) => [c.key, c]))
  const groupOf = (key: string): HiveGroup | null => known.get(key)?.group ?? (key.startsWith('core:') ? 'core' : null)
  const hadCore = Object.keys(existing.slots).some((k) => groupOf(k) === 'core')

  const fresh = candidates.filter((c) => !(c.key in slots)).sort(compareCandidates)
  const added: string[] = []
  const put = (c: HiveCandidate, a: Axial): void => {
    slots[c.key] = { q: a.q, r: a.r, at }
    taken.add(keyOf(a))
    added.push(c.key)
  }

  if (!hadCore) {
    const core = fresh.filter((x) => x.group === 'core')
    const official = fresh.filter((x) => x.group === 'official')
    const eco = fresh.filter((x) => x.group === 'ecosystem')
    for (const [c, a] of sectorFill(nearestCells(core.length, taken), core, (t) => core.indexOf(t))) put(c, a)
    const off = sectorFill(nearestCells(official.length, taken), official, (t) => official.indexOf(t))
    for (const [c, a] of off) put(c, a)
    const targets = sectorTargets(off)
    const ecoCells = nearestCells(eco.length, taken)
    // clockwise from the sell sector, so the wedge order survives the wrap at the top; within a wedge, candidate order
    const start = (targets.get('sell') ?? 0) - 30
    const fromStart = (t: HiveCandidate): number => ((((targets.get(t.wedge) ?? 0) - start) % 360) + 360) % 360
    const placed = orderedMatch(
      ecoCells,
      eco,
      (t) => targets.get(t.wedge) ?? 0,
      (t) => fromStart(t) * 1e3 + eco.indexOf(t),
    )
    for (const [c, a] of placed) put(c, a)
    return { file: { version: 1, layout: 'disc', slots }, added }
  }

  // later additions: stored slots stay; each new cell goes to the nearest free cell of its sector, outside its band
  const center = sectorCentres(slots, (k) => known.get(k)?.wedge ?? null, groupOf)
  const bandEdge = (g: HiveGroup): number =>
    Math.max(
      0,
      ...Object.entries(slots)
        .filter(([k]) => GROUP_ORDER[groupOf(k) ?? 'ecosystem'] < GROUP_ORDER[g])
        .map(([, a]) => plateDist2(a)),
    )
  for (const c of fresh) {
    const free = shells()
      .flat()
      .filter((a) => !taken.has(keyOf(a)))
    if (c.group === 'core') {
      put(c, free[0] as Axial)
      continue
    }
    const edge = bandEdge(c.group)
    const mid = center.get(c.wedge) ?? (WEDGE_CENTRE[c.wedge] + 90 + 360) % 360
    const best = free
      .filter((a) => plateDist2(a) >= edge - EPS)
      .sort((a, b) => {
        const da = angularDistance(plateClock(a), mid)
        const db = angularDistance(plateClock(b), mid)
        // nearest shell first among the cells within 30 degrees of the sector centre, then the angle
        const wa = da <= 30 ? 0 : 1
        const wb = db <= 30 ? 0 : 1
        return wa - wb || plateDist2(a) - plateDist2(b) || da - db
      })[0] as Axial
    put(c, best)
  }
  return { file: existing.layout ? { version: 1, layout: existing.layout, slots } : { version: 1, slots }, added }
}

/** What a disc rule check needs to know about a key. */
export interface DiscKeyInfo {
  wedge: Wedge
  /** Official catalog entries sit nearer the core than the ecosystem of their sector. */
  official: boolean
}

/**
 * The round-plate rules (spec 7.5 amendment, reviews r1 and r3) as a list of broken rules, empty when the map is a
 * plate: the core is the disc nearest the plate centre, the official modules a ring right around it and the
 * ecosystem outside that ring; each band runs its wedges as one clockwise sector each; one plate without holes; a
 * round outline (at most about one shell past a perfect disc of the same number of cells). Core keys start with
 * `core:`.
 */
export function discViolations(
  slots: Readonly<Record<string, Axial>>,
  infoOf: (key: string) => DiscKeyInfo | null,
): string[] {
  const out: string[] = []
  const entries = Object.entries(slots)
  const core = entries.filter(([k]) => k.startsWith('core:'))
  const outer = entries
    .filter(([k]) => !k.startsWith('core:'))
    .map(([k, s]) => ({ k, s, info: infoOf(k) }))
    .filter((x): x is { k: string; s: Axial; info: DiscKeyInfo } => x.info !== null)
  if (entries.length === 0) return out
  if (core.length > 0) {
    const coreMax = Math.max(...core.map(([, s]) => plateDist2(s)))
    const inside = outer.filter((x) => plateDist2(x.s) < coreMax - EPS)
    if (inside.length) out.push(`${inside.length} catalog cells sit inside the core disc (${inside[0]!.k})`)
  }
  const official = outer.filter((x) => x.info.official)
  const eco = outer.filter((x) => !x.info.official)
  if (official.length && eco.length) {
    const ringMax = Math.max(...official.map((x) => plateDist2(x.s)))
    const inner = eco.filter((x) => plateDist2(x.s) < ringMax - EPS)
    if (inner.length) out.push(`${inner.length} ecosystem cells sit inside the official ring (${inner[0]!.k})`)
  }
  for (const [band, cells] of [
    ['official', official],
    ['ecosystem', eco],
  ] as const) {
    const round = cells.map((x) => ({ w: x.info.wedge, a: plateClock(x.s), d: plateDist2(x.s) }))
    round.sort((a, b) => a.a - b.a || a.d - b.d)
    const runs = round.filter((x, i) => x.w !== round[(i + round.length - 1) % round.length]!.w).length
    const present = new Set(round.map((x) => x.w)).size
    if (present > 1 && runs !== present)
      out.push(`${band}: categories form ${runs} runs around the clock, not ${present} sectors`)
  }
  const plate = new Set(entries.map(([, s]) => keyOf(s)))
  const maxRing = Math.max(...entries.map(([, s]) => ring(s)))
  const holes = interiorHoles(plate, maxRing - 1)
  if (holes > 0) out.push(`${holes} free cells inside the plate`)
  const discR = Math.sqrt((entries.length * Math.sqrt(3)) / (2 * Math.PI))
  const reach = Math.sqrt(Math.max(...entries.map(([, s]) => plateDist2(s))))
  if (reach > discR + 1.2) out.push(`the map reaches ${reach.toFixed(1)} cells, a disc of its size ${discR.toFixed(1)}`)
  return out
}

/** Mean clock angle of the non-core cells of each wedge (the centre of its sector on the map). */
export function sectorCentres(
  slots: Record<string, Axial>,
  wedgeOf: (key: string) => Wedge | null,
  groupOf: (key: string) => HiveGroup | null,
): Map<Wedge, number> {
  const acc = new Map<Wedge, { x: number; y: number }>()
  for (const [k, s] of Object.entries(slots)) {
    if (groupOf(k) === 'core') continue
    const w = wedgeOf(k)
    if (!w) continue
    const t = (plateClock(s) * Math.PI) / 180
    const v = acc.get(w) ?? { x: 0, y: 0 }
    acc.set(w, { x: v.x + Math.cos(t), y: v.y + Math.sin(t) })
  }
  const out = new Map<Wedge, number>()
  for (const [w, v] of acc) out.set(w, ((((Math.atan2(v.y, v.x) * 180) / Math.PI) % 360) + 360) % 360)
  return out
}

/** Lowest ring with a free cell. */
export function firstFreeRing(taken: Set<string>): number {
  for (let k = 0; k < 200; k++) if (ringCells(k).some((a) => !taken.has(keyOf(a)))) return k
  return 200
}

const NEIGHBOURS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]
/** Empty cells up to ring `upTo` with 4 or more taken neighbours: the gaps that make a map read as a comb. */
export function interiorHoles(taken: Set<string>, upTo: number): number {
  let n = 0
  for (let k = 1; k <= upTo; k++)
    for (const a of ringCells(k)) {
      if (taken.has(keyOf(a))) continue
      const filled = NEIGHBOURS.filter((d) => taken.has(keyOf({ q: a.q + d.q, r: a.r + d.r }))).length
      if (filled >= 4) n++
    }
  return n
}

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gam = (c: number): number => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}
function toOklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function fromOklab([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${rgb
    .map((c) => gam(c).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

/**
 * Six wedge tones, clockwise from sell (spec 7.5 amendment, review WP11b round 2). The OKLab path from yellow to
 * violet (and from violet to lime) runs through grey and beige, so the two brand families never blend: the warm
 * arc (platform|sell boundary to money|connect boundary) runs lime #B4F372, yellow #EEFB63, deep yellow #C4CF1D;
 * the violet arc runs violet #BC9AFF, then two deeper violets of the same hue. The family edges fall on wedge
 * boundaries, so no cell is a mix of yellow and violet. Every tone has OKLCH chroma >= 0.14 and neighbours stay at
 * least 7 OKLab units apart (test/design/hive.test.ts).
 */
const RAMP: { at: number; hex: string }[] = [
  { at: 0, hex: '#B4F372' }, // sell: lime
  { at: 60, hex: '#EEFB63' }, // operate: yellow
  { at: 120, hex: '#C4CF1D' }, // money: deep yellow (the light-theme edge shade of yellow)
  { at: 180, hex: '#BC9AFF' }, // connect: violet
  { at: 240, hex: '#A07BF0' }, // think: violet, OKLCH 0.67 0.17
  { at: 300, hex: '#825CDE' }, // platform: violet, OKLCH 0.58 0.19
]
/** The ramp at a clockwise angle from the top: OKLab blends inside a family, a hard edge at 150 and 330 degrees. */
export function brandRamp(clock: number): string {
  const x = ((clock % 360) + 360) % 360
  const warm = x < 150 || x >= 330
  const t = warm ? (x >= 330 ? x - 360 : x) : x
  const stops = RAMP.filter((s) => s.at < 150 === warm)
  const first = stops[0] as { at: number; hex: string }
  const last = stops[stops.length - 1] as { at: number; hex: string }
  if (t <= first.at) return first.hex
  if (t >= last.at) return last.hex
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i] as { at: number; hex: string }
    const b = stops[i + 1] as { at: number; hex: string }
    if (t <= b.at) return mixOklab(a.hex, b.hex, (t - a.at) / (b.at - a.at))
  }
  return last.hex
}
/** Tone of a wedge: the ramp at the wedge centre. Official cells are filled with it, ecosystem outlines drawn in
 * it, and the legend swatches show it, so position, colour and label all say the same wedge. */
export function wedgeColour(wedge: Wedge): string {
  return brandRamp(WEDGE_ORDER(wedge) * 60)
}

/** OKLCH chroma of a colour (about 0.17 for the brand lime and yellow, 0.15 for the violet; grey is 0). */
export function oklchChroma(hex: string): number {
  const [, a, b] = toOklab(hex)
  return Math.hypot(a, b)
}

function mixOklab(a: string, b: string, t: number): string {
  const p = toOklab(a)
  const q = toOklab(b)
  return fromOklab(
    [0, 1, 2].map((j) => (p[j] as number) + ((q[j] as number) - (p[j] as number)) * t) as [number, number, number],
  )
}

/** Distance of two colours in OKLab, x100 (about 2 is a just noticeable difference). */
export function oklabDistance(a: string, b: string): number {
  const p = toOklab(a)
  const q = toOklab(b)
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}
