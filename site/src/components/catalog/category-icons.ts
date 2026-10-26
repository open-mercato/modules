// One outline icon per category for the module browser (home and /c/*): a 24 px grid, stroke 1.5, currentColor, the
// same look as the Heroicons in ../icons. Drawn for this site from plain shapes. Decorative: aria-hidden.
import type { CategoryId } from '../../../../lib/schema/common.ts'

const p = (d: string): string => `<path d="${d}"/>`
const rect = (x: number, y: number, w: number, h: number, r = 1.5): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`
const circle = (cx: number, cy: number, r: number): string => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`

const SHAPES: Record<CategoryId | 'all', string> = {
  all:
    rect(3.75, 3.75, 6.75, 6.75) +
    rect(13.5, 3.75, 6.75, 6.75) +
    rect(3.75, 13.5, 6.75, 6.75) +
    rect(13.5, 13.5, 6.75, 6.75),
  'crm-sales':
    circle(9, 8, 3) +
    p('M3.75 19.5a5.25 5.25 0 0 1 10.5 0') +
    circle(17.25, 9, 2.25) +
    p('M15.75 14.6a4.5 4.5 0 0 1 4.5 4.9'),
  'catalog-pricing': p('M3.75 3.75h7.5l9 9-7.5 7.5-9-9Z') + circle(7.88, 7.88, 1.13),
  'orders-checkout':
    p('M2.25 3.75h2.4l2.1 10.5h11.25l2.25-7.5H5.7') + circle(8.25, 18.75, 1.25) + circle(16.5, 18.75, 1.25),
  'marketing-loyalty':
    p('M3.75 9.75v4.5h3l7.5 4.5V5.25l-7.5 4.5Z') + p('M17.25 9a4.5 4.5 0 0 1 0 6') + p('M7.5 14.25 9 19.5'),
  'warehouse-shipping': p('M12 3l8.25 4.5v9L12 21l-8.25-4.5v-9Z') + p('M3.75 7.5 12 12l8.25-4.5') + p('M12 12v9'),
  operations:
    rect(3.75, 7.5, 16.5, 12) +
    p('M9 7.5V5.25a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5V7.5') +
    p('M3.75 12.75h16.5'),
  'payments-finance': rect(2.25, 5.25, 19.5, 13.5, 2) + p('M2.25 9.75h19.5') + p('M6 15h4.5'),
  'localization-compliance':
    circle(12, 12, 8.25) +
    p('M3.75 12h16.5') +
    p('M12 3.75c2.25 2.25 3.38 5 3.38 8.25S14.25 18 12 20.25C9.75 18 8.63 15.25 8.63 12S9.75 6 12 3.75Z'),
  'integrations-sync':
    p('M16.5 3.75 20.25 7.5l-3.75 3.75M20.25 7.5H6') + p('M7.5 12.75 3.75 16.5l3.75 3.75M3.75 16.5H18'),
  communication:
    p(
      'M4.5 5.25h15a.75.75 0 0 1 .75.75v9.75a.75.75 0 0 1-.75.75h-9l-4.5 3.75V16.5H4.5a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 .75-.75Z',
    ) + p('M8.25 9.75h7.5M8.25 12.75h4.5'),
  'ai-automation':
    p('M10.5 3.75l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6Z') +
    p('M18 14.25l.75 2.25 2.25.75-2.25.75-.75 2.25-.75-2.25-2.25-.75 2.25-.75Z'),
  'search-analytics':
    p('M3.75 20.25h16.5') + rect(5.25, 12, 3, 5.25, 0.5) + rect(10.5, 6, 3, 11.25, 0.5) + rect(15.75, 9, 3, 8.25, 0.5),
  'auth-security': rect(5.25, 10.5, 13.5, 9.75) + p('M8.25 10.5V7.5a3.75 3.75 0 0 1 7.5 0v3') + p('M12 14.25v2.25'),
  'content-portal':
    p('M6.75 3h7.5l4.5 4.5v12.75a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75V3.75A.75.75 0 0 1 6.75 3Z') +
    p('M14.25 3v4.5h4.5') +
    p('M9 12.75h6M9 15.75h6'),
  'storage-infrastructure': rect(3.75, 4.5, 16.5, 6) + rect(3.75, 13.5, 16.5, 6) + p('M7.5 7.5h.01M7.5 16.5h.01'),
  devtools: p('M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5'),
}

/** Inline SVG of a category icon (`all` is the grid of four squares); an unknown id draws `all`. */
export function categoryIconSvg(id: string, size = 20): string {
  const shape = SHAPES[id as CategoryId] ?? SHAPES.all
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="icon">${shape}</svg>`
}
