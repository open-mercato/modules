// Hive hover (spec 7.5): on wide screens a card follows the cursor over a cell (title, type chip, signal strip,
// summary), and the cells that do not match the current query fade to 18 % (120 ms). The Hive itself is static
// SVG from the build (Hive.astro); this island only adds behaviour, so the map is complete without JavaScript.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { CellStatus } from '../../../lib/schema/index.ts'
import { STATUS } from '../lib/status.ts'
import { StripView, TypeChipView } from '../lib/ui.tsx'
import type { StripCell } from '../lib/status.ts'
import { RESULTS_EVENT } from './AskBar.tsx'
import type { ResultsDetail } from './AskBar.tsx'

export interface HiveCard {
  /** Title. */
  t: string
  /** Origin chip. */
  ty: 'official' | 'community' | '3rd-party' | 'built-in'
  /** Summary (author text for entries, description for built-in). */
  s: string
  /** One status letter per line in display order (STATUS letters, `VVX`); empty for built-in. A string, not an
   * array: Astro wraps every array item of a prop in its own pair (review r4, HTML budget of /). */
  st: string
}

export interface HiveHoverProps {
  /** Keyed like the Hive cells: locator or `core:<id>`. */
  cards: Record<string, HiveCard>
  /** Line keys in display order (labels of the strip). */
  lines: string[]
}

interface Hover {
  key: string
  x: number
  y: number
}

const CARD_W = 300
const BY_LETTER = Object.fromEntries(Object.entries(STATUS).map(([st, m]) => [m.letter, st as CellStatus]))

export default function HiveHover({ cards, lines }: HiveHoverProps) {
  const [hover, setHover] = useState<Hover | null>(null)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-hive]')
    const svg = root?.querySelector('svg')
    if (!root || !svg) return
    // the custom card replaces the native SVG tooltip
    for (const t of Array.from(svg.querySelectorAll('a[data-k] > title'))) t.remove()
    const cellOf = (ev: Event): HTMLElement | null =>
      ((ev.target as Element | null)?.closest('a[data-k]') as HTMLElement | null) ?? null
    const move = (ev: PointerEvent): void => {
      const a = cellOf(ev)
      if (!a || ev.pointerType === 'touch') {
        setHover(null)
        return
      }
      setHover({ key: a.dataset.k ?? '', x: ev.clientX, y: ev.clientY })
    }
    const leave = (): void => setHover(null)
    svg.addEventListener('pointermove', move)
    svg.addEventListener('pointerleave', leave)
    window.addEventListener('scroll', leave, { passive: true })

    const tags = Array.from(root.querySelectorAll<HTMLElement>('[data-hive-tag]'))
    const onResults = (ev: Event): void => {
      const d = (ev as CustomEvent<ResultsDetail>).detail
      const keys = d?.keys ? new Set(d.keys) : null
      root.classList.toggle('is-filtering', keys !== null)
      const hits: HTMLElement[] = []
      for (const a of Array.from(svg.querySelectorAll<HTMLElement>('a[data-k]'))) {
        const hit = keys !== null && keys.has(a.dataset.k ?? '')
        a.classList.toggle('is-dim', keys !== null && !hit)
        a.classList.toggle('is-hit', hit)
        if (hit) hits.push(a)
      }
      // the first three hits in result order get their names beside them, core and catalog cells alike (review r3:
      // a core hit was labelled and a module hit was not); the rest stay outlined
      const rank = new Map((d?.keys ?? []).map((k, i) => [k, i]))
      hits.sort((a, b) => (rank.get(a.dataset.k ?? '') ?? 0) - (rank.get(b.dataset.k ?? '') ?? 0))
      const vb = svg.viewBox.baseVal
      const box = svg.getBoundingClientRect()
      const k = box.width / vb.width
      const midX = vb.x + vb.width / 2
      // label boxes in CSS px: beside the cell, towards the outside of the map first, the other side when that would
      // cover an earlier label; a label that fits neither way is left out (the cell keeps its outline)
      const placed: { x0: number; x1: number; y: number }[] = []
      // every hit cell as a box too, so a label never hides another answer
      const hitBoxes = hits.map((a) => ({
        x: (Number(a.dataset.x) - vb.x) * k,
        y: (Number(a.dataset.y) - vb.y) * k,
        el: a,
      }))
      const r = 11 * k
      // the sector names of the dial (SELL, PLATFORM, ...) as boxes too (review r11: `Customer Relationship
      // Management` covered PLATFORM down to `PLAT`): a label takes the side that clears them, and a sector name a label
      // still covers fades while the answer is on the map
      const sectors = Array.from(svg.querySelectorAll<SVGTextElement>('.hl text')).map((t) => {
        const b = t.getBoundingClientRect()
        t.classList.remove('is-under')
        return { x0: b.left - box.left - 4, x1: b.right - box.left + 4, y0: b.top - box.top, y1: b.bottom - box.top, t }
      })
      const sectorHits = (x0: number, w: number, y: number) =>
        sectors.filter((q) => x0 < q.x1 && x0 + w > q.x0 && y + 10 > q.y0 && y - 10 < q.y1)
      let shown = 0
      for (const tag of tags) tag.hidden = true
      for (const cell of hits) {
        const tag = tags[shown]
        if (!tag) break
        const name = cards[cell.dataset.k ?? '']?.t
        if (!name) continue
        const cx = (Number(cell.dataset.x) - vb.x) * k
        const y = (Number(cell.dataset.y) - vb.y) * k
        const w = name.length * 6.7 + 16
        const off = 11 * k + 2
        const sides = Number(cell.dataset.x) > midX ? [true, false] : [false, true]
        const fits = (left: boolean): boolean => {
          const x0 = left ? cx - off - w : cx + off
          const overLabel = placed.some((p) => Math.abs(p.y - y) < 20 && x0 < p.x1 && x0 + w > p.x0)
          // a pointy-top cell is r/2 tall at its sides and r at its tips: a 20 px label beside one row clears the
          // tips of the next row (rows are 1.5 r apart)
          const overCell = hitBoxes.some(
            (b) => b.el !== cell && Math.abs(b.y - y) < 0.75 * r + 10 && x0 < b.x + r && x0 + w > b.x - r,
          )
          const inside = x0 >= 0 && x0 + w <= box.width
          return inside && !overLabel && !overCell
        }
        const clear = (left: boolean): boolean => sectorHits(left ? cx - off - w : cx + off, w, y).length === 0
        const side = sides.find((left) => fits(left) && clear(left)) ?? sides.find(fits)
        if (side === undefined) continue
        for (const q of sectorHits(side ? cx - off - w : cx + off, w, y)) q.t.classList.add('is-under')
        const x = side ? cx - off : cx + off
        placed.push({ x0: side ? x - w : x, x1: side ? x : x + w, y })
        tag.classList.toggle('is-left', side)
        tag.style.left = `${x}px`
        tag.style.top = `${y}px`
        tag.textContent = name
        tag.hidden = false
        shown++
      }
    }
    document.addEventListener(RESULTS_EVENT, onResults)
    return () => {
      svg.removeEventListener('pointermove', move)
      svg.removeEventListener('pointerleave', leave)
      window.removeEventListener('scroll', leave)
      document.removeEventListener(RESULTS_EVENT, onResults)
    }
  }, [])

  const data = hover ? cards[hover.key] : undefined
  if (!hover || !data) return <div class="hcard" hidden ref={card} />
  // keep the card inside the viewport: right of the cursor, or left of it near the edge
  const vw = typeof window === 'undefined' ? 1440 : window.innerWidth
  const vh = typeof window === 'undefined' ? 900 : window.innerHeight
  const left = hover.x + 18 + CARD_W > vw - 12 ? hover.x - 18 - CARD_W : hover.x + 18
  const top = Math.min(hover.y + 18, vh - 180)
  const cells: StripCell[] = [...data.st].map((letter, i) => {
    const status: CellStatus = BY_LETTER[letter] ?? 'untested'
    return { key: lines[i] ?? '', status, label: `${lines[i] ?? ''}: ${status}`, step: null, receipt: null }
  })
  return (
    <div class="hcard" ref={card} style={`left:${left}px;top:${top}px;width:${CARD_W}px`} aria-hidden="true">
      <div class="hcard__head">
        <span class="hcard__title">{data.t}</span>
        <TypeChipView type={data.ty} />
      </div>
      {cells.length > 0 && (
        <div class="hcard__strip">
          <StripView cells={cells} />
        </div>
      )}
      <p class="hcard__sum">{data.s}</p>
      <p class="hcard__hint">Click to open</p>
    </div>
  )
}
