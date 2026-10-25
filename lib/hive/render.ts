// Static SVG of The Hive (spec 7.5): rendered once in the build, scaled to the column width (max 560 px).
// The whole SVG is aria-hidden and every link has tabindex="-1": the registry below it is the accessible equivalent.
import { axialToPixel, clockAngle, ringCells, WEDGES } from './layout.ts'
import type { HiveGroup, Wedge } from './layout.ts'

export interface HiveCell {
  key: string
  q: number
  r: number
  group: HiveGroup
  wedge: Wedge
  /** Origin type of a catalog entry (the colour of its cell); absent for core cells. */
  type?: 'official' | 'community' | '3rd-party'
  href: string
  /** Native tooltip, e.g. "Stripe gateway · official · verified on 0.9". */
  title: string
}

export interface HiveRenderOptions {
  /** Cell radius in SVG units (spec: 11). */
  cellRadius?: number
  /** Wedge labels and the dial around the map (mono 10, #9E9E9E). */
  labels?: boolean
  /** Rendered width in CSS px the labels are sized for (spec: max 560). */
  width?: number
  /** Free cells of the lattice drawn under the map (the Tonik hex grid, like og-default). Default true. */
  lattice?: boolean
  className?: string
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
const n1 = (v: number): string => String(Math.round(v * 10) / 10)

/** Colour by type, as in the type chips (review r1): official lime, community violet, third party yellow. */
export const TYPE_COLOUR = { official: '#B4F372', community: '#BC9AFF', '3rd-party': '#EEFB63' } as const

export interface Sector {
  wedge: Wedge
  /** Clock angles (0 = top, clockwise) of the sector's first and last cell and its centre. */
  from: number
  to: number
  mid: number
}

/** Sectors of the non-core cells, clockwise: the angular span each wedge occupies on the map. */
export function hiveSectors(
  cells: readonly (Pick<HiveCell, 'q' | 'r' | 'group' | 'wedge'> & { clock?: number })[],
): Sector[] {
  const out: Sector[] = []
  const outer = cells.filter((c) => c.group !== 'core')
  if (outer.length === 0) return out
  // each sector is measured around its own circular mean, so a sector that straddles the top stays one span
  for (const w of WEDGES) {
    const xs = outer.filter((c) => c.wedge === w).map((c) => c.clock ?? clockAngle(c))
    if (xs.length === 0) continue
    const sx = xs.reduce((n, a) => n + Math.cos((a * Math.PI) / 180), 0)
    const sy = xs.reduce((n, a) => n + Math.sin((a * Math.PI) / 180), 0)
    const mean = ((((Math.atan2(sy, sx) * 180) / Math.PI) % 360) + 360) % 360
    const rel = xs.map((a) => ((((a - mean) % 360) + 540) % 360) - 180)
    const from = mean + Math.min(...rel)
    const to = mean + Math.max(...rel)
    out.push({ wedge: w, from, to, mid: (from + to) / 2 })
  }
  return out.sort((a, b) => a.from - b.from)
}

/** Renders the Hive as an SVG string. Cells are ordered core, official, ecosystem so hover outlines stack well. */
export function renderHive(cells: HiveCell[], opts: HiveRenderOptions = {}): string {
  const R = opts.cellRadius ?? 11
  const pitch = R * Math.sqrt(3)
  const drawn = R - 0.9 // 1.8 unit gap between neighbours
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const t = ((-90 + 60 * i) * Math.PI) / 180
    pts.push(`${n1(drawn * Math.cos(t))},${n1(drawn * Math.sin(t))}`)
  }
  // the plate is centred in its dial: the centre is the middle of the cells' bounding box (a partial outer shell
  // can make one side a row taller), and every radius below is measured from it
  const px = cells.map((c) => axialToPixel(c, R))
  const cx = px.length ? (Math.min(...px.map((p) => p.x)) + Math.max(...px.map((p) => p.x))) / 2 : 0
  const cy = px.length ? (Math.min(...px.map((p) => p.y)) + Math.max(...px.map((p) => p.y))) / 2 : 0
  const fromCentre = (p: { x: number; y: number }): number => Math.hypot(p.x - cx, p.y - cy)
  const maxD = px.reduce((m, p) => Math.max(m, fromCentre(p) / pitch), 0)
  const withLattice = opts.lattice !== false
  const withLabels = opts.labels !== false
  // the lattice reaches about one cell past the map; the dial sits just outside it, the labels outside the dial
  const latticeD = maxD + 1.05
  const mapEdge = (withLattice ? latticeD : maxD) * pitch + R
  const dialR = mapEdge + 0.55 * R
  let extent = withLabels ? dialR + 3.9 * R : mapEdge + R

  const order: Record<HiveGroup, number> = { core: 0, official: 1, ecosystem: 2 }
  const sorted = [...cells].sort((a, b) => order[a.group] - order[b.group] || (a.key < b.key ? -1 : 1))
  const body: string[] = []
  for (const c of sorted) {
    const p = axialToPixel(c, R)
    const type = c.type ?? (c.group === 'official' ? 'official' : c.group === 'ecosystem' ? '3rd-party' : undefined)
    const paint =
      c.group === 'core'
        ? 'class="hc"'
        : type === 'official'
          ? `class="ho" fill="${TYPE_COLOUR.official}"`
          : `class="he" stroke="${TYPE_COLOUR[type ?? '3rd-party']}"`
    body.push(
      `<a href="${esc(c.href)}" tabindex="-1" data-k="${esc(c.key)}" data-x="${n1(p.x)}" data-y="${n1(p.y)}"><title>${esc(c.title)}</title><use href="#omh" x="${n1(p.x)}" y="${n1(p.y)}" ${paint}/></a>`,
    )
  }
  // the lattice: every free cell up to about one cell past the map, so empty slots read as free cells
  const lattice: string[] = []
  if (withLattice) {
    const taken = new Set(cells.map((c) => `${c.q},${c.r}`))
    const lim = latticeD * pitch
    const reach = Math.ceil(latticeD + Math.hypot(cx, cy) / pitch) + 1
    for (let k = 0; k <= reach; k++)
      for (const a of ringCells(k)) {
        if (taken.has(`${a.q},${a.r}`)) continue
        const p = axialToPixel(a, R)
        if (fromCentre(p) > lim + 1e-6) continue
        lattice.push(`<use href="#omh" x="${n1(p.x)}" y="${n1(p.y)}"/>`)
      }
  }
  // the dial: a hairline circle with a tick at every sector boundary and each wedge name on the bisector of its arc
  let dial = ''
  if (withLabels) {
    const local = cells.map((c) => {
      const p = axialToPixel(c, R)
      const ang = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI
      return { ...c, clock: (((ang + 90) % 360) + 360) % 360 }
    })
    const sectors = hiveSectors(local)
    const at = (deg: number, r: number): { x: number; y: number } => {
      const t = ((deg - 90) * Math.PI) / 180
      return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }
    }
    // boundaries halfway between neighbouring sectors; a sector's arc runs from its left to its right boundary
    const bounds = sectors.map((s, i) => {
      const next = sectors[(i + 1) % sectors.length] as Sector
      const nextFrom = i + 1 < sectors.length ? next.from : next.from + 360
      return (s.to + nextFrom) / 2
    })
    // each boundary is the same graduation of the dial (review r4: spokes from the plate edge had six lengths and
    // read as scratches across the lattice): a short tick inside the ring, then a spoke out to the label radius;
    // nothing inside the dial but cells
    const SPOKE_IN = 0.35 * R
    const SPOKE_OUT = 1.1 * R
    const ticks: string[] = []
    if (sectors.length > 1)
      for (const b of bounds) {
        const a1 = at(b, dialR - SPOKE_IN)
        const a2 = at(b, dialR + SPOKE_OUT)
        ticks.push(`<path d="M${n1(a1.x)} ${n1(a1.y)}L${n1(a2.x)} ${n1(a2.y)}"/>`)
      }
    const bisector = sectors.map((s, i) => {
      if (sectors.length === 1) return s.mid
      const left = bounds[(i + sectors.length - 1) % sectors.length] as number
      const right = bounds[i] as number
      const l = i === 0 ? left - 360 : left
      return (l + right) / 2
    })
    // names keep at least MIN_SEP degrees between them (review r4: a narrow sector put OPERATE next to SELL); a pair
    // closer than that is pushed apart around its middle, repeated until every gap holds
    const MIN_SEP = 30
    const labelDeg = [...bisector]
    if (sectors.length > 1 && sectors.length * MIN_SEP <= 360)
      for (let pass = 0; pass < 60; pass++) {
        let moved = false
        for (let i = 0; i < labelDeg.length; i++) {
          const j = (i + 1) % labelDeg.length
          const a = labelDeg[i] as number
          const b = (labelDeg[j] as number) + (j === 0 ? 360 : 0)
          const gap = b - a
          if (gap >= MIN_SEP - 1e-6) continue
          const push = (MIN_SEP - gap) / 2
          labelDeg[i] = a - push
          labelDeg[j] = (labelDeg[j] as number) + push
          moved = true
        }
        if (!moved) break
      }
    // labels are 10 CSS px at the rendered width; the box of each label stands just outside the dial, centred on
    // its angle. Labels that would still touch are spread a degree at a time.
    const fit = (): { fs: number; boxes: { x: number; y: number; w: number; h: number; deg: number }[] } => {
      const fs = (10 * 2 * extent) / (opts.width ?? 560)
      // the label box starts past the end of the spokes, so a name never touches a graduation
      const gap = SPOKE_OUT + 0.3 * R
      const place = (deg: number, text: string): { x: number; y: number; w: number; h: number; deg: number } => {
        const w = fs * (0.68 * text.length - 0.08)
        const h = fs
        const t = (deg * Math.PI) / 180
        const r = dialR + gap + (Math.abs(Math.sin(t)) * w) / 2 + (Math.abs(Math.cos(t)) * h) / 2
        const p = at(deg, r)
        return { x: p.x, y: p.y, w, h, deg }
      }
      const degs = [...labelDeg]
      const overlap = (
        a: { x: number; y: number; w: number; h: number },
        b: { x: number; y: number; w: number; h: number },
      ): boolean => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 0.6 * R && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 0.3 * R
      let boxes = degs.map((d, i) => place(d, (sectors[i] as Sector).wedge))
      for (let pass = 0; pass < 40 && sectors.length > 1; pass++) {
        let moved = false
        for (let i = 0; i < boxes.length; i++) {
          const j = (i + 1) % boxes.length
          if (j === i || !overlap(boxes[i]!, boxes[j]!)) continue
          degs[i] = (degs[i] as number) - 1
          degs[j] = (degs[j] as number) + 1
          moved = true
        }
        boxes = degs.map((d, i) => place(d, (sectors[i] as Sector).wedge))
        if (!moved) break
      }
      return { fs, boxes }
    }
    let { fs, boxes } = fit()
    // grow the view until every label is inside it (the font size follows the view, so fit twice)
    for (let k = 0; k < 2; k++) {
      const need = boxes.reduce(
        (m, b) => Math.max(m, Math.abs(b.x - cx) + b.w / 2, Math.abs(b.y - cy) + b.h / 2),
        dialR + R,
      )
      if (need + 0.4 * R <= extent) break
      extent = need + 0.4 * R
      ;({ fs, boxes } = fit())
    }
    const labels = sectors.map((s, i) => {
      const b = boxes[i] as { x: number; y: number; w: number; h: number; deg: number }
      return `<text x="${n1(b.x)}" y="${n1(b.y)}" text-anchor="middle">${s.wedge.toUpperCase()}</text>`
    })
    dial = `<g class="hd"><circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(dialR)}"/>${ticks.join('')}</g><g class="hl" font-family="'Geist Mono',ui-monospace,monospace" font-size="${n1(fs)}" letter-spacing=".08em" fill="#9E9E9E" dominant-baseline="central">${labels.join('')}</g>`
  }
  const vb = `${n1(cx - extent)} ${n1(cy - extent)} ${n1(extent * 2)} ${n1(extent * 2)}`
  const style =
    '<style>.omhive .hg use{fill:none;stroke:#1C1C1C;stroke-width:1;vector-effect:non-scaling-stroke}.omhive .hd circle,.omhive .hd path{fill:none;stroke:#2A2A2A;stroke-width:1;vector-effect:non-scaling-stroke}.omhive .hc{fill:#3A3A3A;stroke:var(--film,#0C0C0C);stroke-width:1.5}.omhive .he{fill:var(--film-2,#141414);stroke-width:1.5}.omhive a{transition:opacity 120ms cubic-bezier(.2,0,0,1)}@media (prefers-reduced-motion:reduce){.omhive a{transition:none}}</style>'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true" focusable="false" class="omhive${opts.className ? ` ${esc(opts.className)}` : ''}">${style}<defs><polygon id="omh" points="${pts.join(' ')}"/></defs>${lattice.length ? `<g class="hg">${lattice.join('')}</g>` : ''}${dial}<g class="hx">${body.join('')}</g></svg>`
}
