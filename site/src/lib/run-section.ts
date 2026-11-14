// Which page of the Run menu a site path belongs to (navbar of 14 Nov, lib/core/main-site.ts RUN_MENU). The header
// marks that row of the Run panel as the current page, and the context line at the top of each page names it.
// "Modules" is the home of the catalog: current on /, on category pages (/c/*), on module pages (/m/*) and on
// built-in modules. "Templates" likewise on its template pages (/t/*), "Compatibility" on its receipts (/r/*). Every
// other item is current on its own path and below it.
import { RUN_MENU, type RunMenuItem } from '../../../lib/core/main-site.ts'

const BELOW: Record<string, readonly string[]> = {
  '/': ['/m/', '/c/', '/built-in'],
  '/templates': ['/t/'],
  '/compat': ['/r/'],
}

/** Whether the Run item at `item` (a site path such as '/compat') is the section of the page at `path`. */
export function isRunCurrent(item: string, path: string): boolean {
  const below = BELOW[item] ?? []
  if (item === '/') return path === '/' || below.some((p) => path.startsWith(p))
  return path === item || path.startsWith(`${item}/`) || below.some((p) => path.startsWith(p))
}

/** The Run item of the page at `path`, or null for a page outside the six (About, Submit, the 404 page). */
export function runSection(path: string): RunMenuItem | null {
  return RUN_MENU.items.find((i) => isRunCurrent(i.path, path)) ?? null
}

/** Names of the catalog pages outside the Run menu, for the context line. */
const OTHER: Record<string, string> = {
  '/about': 'About this data',
  '/submit': 'Submit a module',
}

/** The words after "Run /" in the context line of the page at `path`; null when the page has no address. */
export function sectionName(path: string | null): string | null {
  if (path === null) return null
  return runSection(path)?.label ?? OTHER[path] ?? null
}
