// What the collections of Phase 4 (case studies, partners, jobs) share: the order of a list and the BreadcrumbList of
// a detail page. Isomorphic.
import { canonicalUrl } from './blog.ts'

/** An entry as a list orders it: its slug, an optional manual order and the Webflow id it was imported with. */
export interface Orderable {
  id: string
  data: { order?: number; webflowId?: string }
}

/**
 * The order of a list: entries with a manual `order` first (lowest first), then newest first. Webflow lists these
 * collections newest first, and a Webflow id begins with the item's creation time (8 hex digits, seconds), so a
 * descending id is the live site's order; an entry written after the import has no id and counts as the newest.
 * Ties fall back to the slug, so the order never depends on the file system.
 */
export function listOrder(a: Orderable, b: Orderable): number {
  const oa = a.data.order
  const ob = b.data.order
  if (oa !== undefined || ob !== undefined) {
    if (oa === undefined) return 1
    if (ob === undefined) return -1
    if (oa !== ob) return oa - ob
  }
  const wa = a.data.webflowId
  const wb = b.data.webflowId
  if (wa !== wb) {
    if (wa === undefined) return -1
    if (wb === undefined) return 1
    return wa < wb ? 1 : -1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The entries that are not drafts, in list order. */
export function publishedEntries<T extends Orderable & { data: { draft: boolean } }>(all: readonly T[]): T[] {
  return all.filter((e) => !e.data.draft).sort(listOrder)
}

/** A `BreadcrumbList` of site paths on `origin`. */
export function breadcrumbJsonLd(origin: string, crumbs: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: canonicalUrl(origin, c.path),
    })),
  }
}
