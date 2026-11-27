// The title and the meta description of a receipt page (site/src/pages/r/[id].astro). Audit of 27 Nov 2026: titles of
// about 140 characters (the full id, the full package name, the full develop version and the site name), and receipts of
// the same subject, version, result and day with byte-identical descriptions.
import { shortVersion } from './format.ts'

/** The hash part of a receipt id (`r_20261116_032ca8f9281e` gives `032ca8f9281e`), else the id. */
export function receiptHash(id: string): string {
  return /^r_\d{8}_([0-9a-f]+)$/.exec(id)?.[1] ?? id
}

/**
 * `Receipt 032ca8f9281e · open-mercato-data-sync-durable on 0.10.1-develop.8214`: the hash (unique per receipt), the
 * package name without its scope and the short Open Mercato version.
 */
export function receiptTitle(id: string, name: string, omVersion: string): string {
  return `Receipt ${receiptHash(id)} · ${name.replace(/^@[^/]+\//, '')} on ${shortVersion(omVersion)}`
}

/** The description: the sentence of the heading, then the receipt's id, so no two receipts share one. */
export function receiptDescription(sentence: string, id: string): string {
  return `${sentence} Receipt ${id}.`
}
