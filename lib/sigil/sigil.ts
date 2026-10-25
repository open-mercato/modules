// Anatomy sigil (spec 7.4): seven pointy-top hexagons, one per organ, as an SVG string of at most 1.5 KB.
// Isomorphic (no Node APIs): the same function feeds the list, the module page, the Hive, README badges and OG.
import { sha256 } from './sha256.ts'

/** Organ order of the glyph: Data (centre), then petals clockwise from the upper right. */
export const ORGANS = ['data', 'api', 'ui', 'events', 'background', 'ai', 'extends'] as const
export type Organ = (typeof ORGANS)[number]
export type OrganLevel = 0 | 1 | 2 | 3
export type SigilKind = 'module' | 'provider' | 'library' | 'tool' | 'built-in'
export const SIGIL_SIZES = [16, 24, 32, 48, 96] as const
export type SigilSize = (typeof SIGIL_SIZES)[number]

/** Petal angles in degrees (screen coordinates, y down): API at -60 (upper right), clockwise. */
export const PETAL_ANGLES: Record<Exclude<Organ, 'data'>, number> = {
  api: -60,
  ui: 0,
  events: 60,
  background: 120,
  ai: 180,
  extends: 240,
}

/** Anatomy counts the sigil needs (a subset of AnatomySummary.counts; `customEntities` from facts when known). */
export interface SigilCounts {
  entities: number
  customEntities?: number
  tables?: number
  migrations: number
  routes: number | null
  publicRoutes: number | null
  backendPages: number
  frontendPages: number
  widgets: number
  eventsEmitted: number
  eventsConsumed: number
  workers: number
  cli: number
  aiTools: number
  aiAgents: number
  extends: number
}

/** 0 = none, 1 = one, 2 = two to nine, 3 = ten or more. */
export function organLevel(n: number | null | undefined): OrganLevel {
  if (!n || n <= 0) return 0
  if (n === 1) return 1
  return n >= 10 ? 3 : 2
}

/** Raw organ sizes. Data = entities + custom entities, plus 1 when the package ships migrations. */
export function organCounts(c: SigilCounts): Record<Organ, number> {
  return {
    data: c.entities + (c.customEntities ?? 0) + (c.migrations > 0 ? 1 : 0),
    api: c.routes ?? 0,
    ui: c.backendPages + c.frontendPages + c.widgets,
    events: c.eventsEmitted + c.eventsConsumed,
    background: c.workers + c.cli,
    ai: c.aiTools + c.aiAgents,
    extends: c.extends,
  }
}

/** Seven digits 0-3 in the order D, A, U, E, B, I, X. */
export function glyphFromCounts(c: SigilCounts): string {
  const o = organCounts(c)
  return ORGANS.map((k) => organLevel(o[k])).join('')
}

/** Phase in degrees from the first byte of sha256(locator): round(b / 256 * 360). Built-in keys are `core:<id>`. */
export function sigilPhase(locator: string): number {
  return Math.round(((sha256(locator)[0] as number) / 256) * 360) % 360
}

const STOPS: [number, [number, number, number]][] = [
  [0, [0xb4, 0xf3, 0x72]],
  [120, [0xee, 0xfb, 0x63]],
  [240, [0xbc, 0x9a, 0xff]],
  [360, [0xb4, 0xf3, 0x72]],
]

/** Brand gradient sampled cyclically: lime 0, yellow 120, violet 240, lime 360; linear in sRGB (legend swatches only). */
export function brandAt(angle: number): string {
  const a = ((angle % 360) + 360) % 360
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a0, c0] = STOPS[i] as [number, [number, number, number]]
    const [a1, c1] = STOPS[i + 1] as [number, [number, number, number]]
    if (a >= a0 && a <= a1) {
      const t = (a - a0) / (a1 - a0)
      return (
        '#' +
        c0
          .map((v, j) =>
            Math.round(v + ((c1[j] as number) - v) * t)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
          .toUpperCase()
      )
    }
  }
  return '#B4F372'
}

/**
 * Petal colour: the brand stop nearest to the petal angle shifted by the phase (lime 0, yellow 120, violet 240).
 * Quantised, never interpolated: a linear sRGB mix of yellow and violet is beige, and the sigil must read at 16 px.
 * Spec 7.4 amendment 23.10 (review round 1): "kolor = najbliższy przystanek gradientu".
 */
export function brandStop(angle: number): string {
  const a = ((angle % 360) + 360) % 360
  return BRAND_STOPS[Math.floor((a + 60) / 120) % 3] as string
}
const BRAND_STOPS = ['#B4F372', '#EEFB63', '#BC9AFF'] as const

const GREYS: Record<OrganLevel, string> = { 0: 'none', 1: '#B6B6B6', 2: '#7C7C7C', 3: '#434343' }
const R = 9
/** Level 1: a filled inner hexagon inside the empty outline, so one fact reads as "a little" in every theme. */
const R1 = 4.6
/** Level 2 petal: a full colour hexagon a step smaller than level 3, so the two levels differ by size in every theme. */
const R2 = 7.2
const STEP = 17.2 // centre distance: sqrt(3) * 9 + 1.6 gap
const C = 32
/** Strokes stay 1 device pixel at every size (16 px included). */
const NSS = 'vector-effect="non-scaling-stroke"'

const n1 = (v: number): string => String(Math.round(v * 10) / 10)

/** Pointy-top hexagon as a closed sub-path with relative steps (shorter than polygon points). */
function hexPath(cx: number, cy: number, r: number): string {
  const w = n1((r * Math.sqrt(3)) / 2)
  const h = n1(r / 2)
  return `M${n1(cx)} ${n1(cy - r)}l${w} ${h}v${n1(r)}l-${w} ${h}-${w}-${h}v-${n1(r)}z`
}

function petalCentre(angle: number): [number, number] {
  const t = (angle * Math.PI) / 180
  return [C + STEP * Math.cos(t), C + STEP * Math.sin(t)]
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** Accessible description, e.g. "Anatomy: 3 tables, 8 routes (0 public), 9 events, 3 queues". */
export function sigilLabel(c: SigilCounts | null, opts: { enterprise?: boolean } = {}): string {
  if (opts.enterprise) return 'Anatomy not published. Commercial license.'
  if (!c) return 'Anatomy not read yet.'
  const parts: string[] = []
  const tables = c.tables ?? c.entities
  if (tables > 0) parts.push(plural(tables, 'table'))
  if (c.routes === null) parts.push('routes not measured')
  else if (c.routes > 0) parts.push(`${plural(c.routes, 'route')} (${c.publicRoutes ?? 0} public)`)
  const pages = c.backendPages + c.frontendPages
  if (pages > 0) parts.push(plural(pages, 'page'))
  if (c.widgets > 0) parts.push(plural(c.widgets, 'widget'))
  const events = c.eventsEmitted + c.eventsConsumed
  if (events > 0) parts.push(plural(events, 'event'))
  if (c.workers > 0) parts.push(plural(c.workers, 'queue'))
  if (c.cli > 0) parts.push(plural(c.cli, 'CLI command'))
  const ai = c.aiTools + c.aiAgents
  if (ai > 0) parts.push(plural(ai, 'AI tool'))
  if (c.extends > 0) parts.push(plural(c.extends, 'extension'))
  return parts.length ? `Anatomy: ${parts.join(', ')}` : 'Anatomy: no contracts found'
}

export interface SigilInput {
  /** Seven digits 0-3 (D, A, U, E, B, I, X), as in IndexEntry.sigil.glyph and ModuleFacts.glyph. */
  glyph: string
  /** 0-359, as in IndexEntry.sigil.phase (see sigilPhase). */
  phase: number
  kind: SigilKind
  enterprise?: boolean
  /** Red dot on the API petal: the package has routes without requireAuth. A number adds the count to the tooltip. */
  publicRoutes?: boolean | number
  size?: SigilSize
  /** aria-label; use sigilLabel(). */
  label?: string
  /** Extra class on the <svg>. */
  className?: string
  /** CSS colour for currentColor (centre and empty outlines); default inherits. */
  color?: string
  /** view-transition-name for the list-to-page flight (spec 7.3). */
  transitionName?: string
  /**
   * Optical size for 16 px and below (opt-in, so README badges keep their golden form): empty petals and level
   * edges are left out (a 0.5 px outline carries nothing at that size), every organ with facts is a full petal,
   * and the centre gets a 1 px edge so the glyph keeps its shape. Size 24 and up never use it.
   */
  optical?: boolean
}

function levels(glyph: string): OrganLevel[] {
  if (!/^[0-3]{7}$/.test(glyph)) throw new Error(`invalid glyph ${JSON.stringify(glyph)}`)
  return glyph.split('').map((d) => Number(d) as OrganLevel)
}

/** Renders the sigil as an SVG string (role="img", aria-label, width and height from `size`). */
export function renderSigil(input: SigilInput): string {
  const lv = levels(input.glyph)
  const size = input.size ?? 32
  const builtIn = input.kind === 'built-in'
  const ent = input.enterprise === true
  const out: string[] = []
  // Sub-paths grouped by paint, so a sigil is a handful of <path> elements whatever its anatomy.
  const empties: string[] = []
  const filled = new Map<string, string[]>() // "colour|level" -> sub-paths
  const add = (key: string, d: string): void => {
    const list = filled.get(key)
    if (list) list.push(d)
    else filled.set(key, [d])
  }

  const optical = input.optical === true && !ent
  ORGANS.slice(1).forEach((organ, i) => {
    const angle = PETAL_ANGLES[organ as Exclude<Organ, 'data'>]
    const [x, y] = petalCentre(angle)
    const level = lv[i + 1] as OrganLevel
    const d = hexPath(x, y, R)
    if (ent) add('ent', d)
    else if (optical) {
      if (level > 0) add(builtIn ? `${GREYS[level]}|b${level}` : `${brandStop(angle + input.phase)}|f`, d)
    } else if (level === 0) empties.push(d)
    else if (builtIn) add(`${GREYS[level]}|b${level}`, d)
    else if (level === 1) {
      empties.push(d)
      add(`${brandStop(angle + input.phase)}|1`, hexPath(x, y, R1))
    } else if (level === 2) {
      // the frame of the petal stays, filled almost to the edge: between level 1 (a small core) and 3 (full + edge)
      empties.push(d)
      add(`${brandStop(angle + input.phase)}|2`, hexPath(x, y, R2))
    } else add(`${brandStop(angle + input.phase)}|${level}`, d)
  })

  const center = hexPath(C, C, R)
  const dataLevel = lv[0] as OrganLevel
  const centerMarks: string[] = []
  if (ent) add('ent', center)
  else if (builtIn) add('#6D6D6D|bc', center)
  else if (input.kind === 'provider')
    centerMarks.push(`<path d="${hexPath(C, C, R - 1)}" fill="none" stroke="currentColor" stroke-width="2"/>`)
  else if (input.kind === 'library') {
    empties.push(center)
    centerMarks.push(
      `<g fill="currentColor"><circle cx="32" cy="28.6" r="2"/><circle cx="28.9" cy="34" r="2"/><circle cx="35.1" cy="34" r="2"/></g>`,
    )
  } else if (input.kind === 'tool') {
    empties.push(center)
    centerMarks.push(
      `<path d="M32 32V25.5M32 32l5.6 3.3M32 32l-5.6 3.3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="square"/>`,
    )
  } else if (optical)
    centerMarks.push(
      `<path d="${center}" fill="currentColor" fill-opacity="${dataLevel === 0 ? 0 : dataLevel === 3 ? 1 : 0.5}" stroke="currentColor" ${NSS}/>`,
    )
  else if (dataLevel === 0) empties.push(center)
  else if (dataLevel === 1) {
    empties.push(center)
    centerMarks.push(`<path d="${hexPath(C, C, R1)}" fill="currentColor"/>`)
  } else
    // the data centre is ink (review r1: a 50 % grey centre read as switched off); level 3 adds an ink edge
    centerMarks.push(
      dataLevel === 3
        ? `<path d="${center}" fill="currentColor" stroke="currentColor" stroke-width="1.5" ${NSS}/>`
        : `<path d="${center}" fill="currentColor"/>`,
    )

  // level 0 (and the frame of level 1): a 1 px outline at 40 % that survives 16 px; at 32 px and below 55 % (review r4:
  // a row of mostly empty sigils in the light list read as icons that failed to load)
  if (empties.length)
    out.push(
      `<path d="${empties.join('')}" fill="none" stroke="currentColor" stroke-opacity="${size <= 32 ? '.55' : '.4'}" ${NSS}/>`,
    )
  // levels by shape, the same in both themes (review r1: 2 and 3 must differ at 24 px; an opacity turns olive on
  // dark): 1 = inner hexagon, 2 = a slightly smaller full-colour petal, 3 = full petal with a 1.5 px ink edge
  for (const [key, ds] of filled) {
    const d = ds.join('')
    if (key === 'ent') {
      out.push(`<path d="${d}" fill="#1B1B1B" stroke="#B4F372" ${NSS}/>`)
      continue
    }
    const [color, lvl] = key.split('|') as [string, string]
    // built-in greys carry their level as a class: the dark theme turns the scale around (more anatomy, more ink:
    // light greys on #0C0C0C), the attribute stays the light-theme value for badges and standalone files
    if (lvl.startsWith('b')) {
      out.push(`<path d="${d}" fill="${color}" class="sg-${lvl}"/>`)
      continue
    }
    out.push(
      lvl === '3'
        ? `<path d="${d}" fill="${color}" stroke="currentColor" stroke-width="1.5" ${NSS}/>`
        : `<path d="${d}" fill="${color}"/>`,
    )
  }
  out.push(...centerMarks)

  // public routes: a fact, not a verdict (tooltip "N public routes")
  if (input.publicRoutes && !ent) {
    const [x, y] = petalCentre(PETAL_ANGLES.api)
    const n = typeof input.publicRoutes === 'number' ? input.publicRoutes : null
    const tip = n === null ? 'Public routes' : n === 1 ? '1 public route' : `${n} public routes`
    out.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="3" fill="#F32828"><title>${tip}</title></circle>`)
  }

  const attrs = [
    'xmlns="http://www.w3.org/2000/svg"',
    'viewBox="0 0 64 64"',
    `width="${size}"`,
    `height="${size}"`,
    'role="img"',
    `aria-label="${escapeXml(input.label ?? 'Module anatomy')}"`,
  ]
  if (input.className) attrs.push(`class="${escapeXml(input.className)}"`)
  const style: string[] = []
  if (input.color) style.push(`color:${input.color}`)
  if (input.transitionName) style.push(`view-transition-name:${input.transitionName}`)
  if (style.length) attrs.push(`style="${escapeXml(style.join(';'))}"`)
  return `<svg ${attrs.join(' ')}>${out.join('')}</svg>`
}

/** Glyph, phase and the public-route flag from counts and a locator (what the emitter stores in IndexEntry.sigil). */
export function sigilFromCounts(
  locator: string,
  c: SigilCounts | null,
): {
  glyph: string
  phase: number
  publicRoutes: boolean
} {
  return {
    glyph: c ? glyphFromCounts(c) : '0000000',
    phase: sigilPhase(locator),
    publicRoutes: (c?.publicRoutes ?? 0) > 0,
  }
}
