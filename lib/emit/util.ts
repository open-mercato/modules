// Small helpers shared by the emitter files. Isomorphic: no Node APIs.
import type { LineInfo } from '../core/lines.ts'
import { orderedLines } from '../core/lines.ts'
import type { Lines } from '../schema/data/index.ts'

/** Published JSON: compact, one trailing newline. */
export const toJson = (value: unknown): string => `${JSON.stringify(value)}\n`

/** Site data and golden files: indented. */
export const toPrettyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** XML text and attribute escaping (badges, Atom feed, redirect pages). */
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

/** Lines in display order (latest, previous, next) as LineInfo. */
export function lineList(lines: Lines | null): (LineInfo & Lines['lines'][number])[] {
  return lines ? orderedLines(lines.lines) : []
}

/** Byte length of a UTF-8 string. */
export function byteLength(s: string | Uint8Array): number {
  return typeof s === 'string' ? new TextEncoder().encode(s).length : s.length
}

/** Comma list with a tail: `a, b, c and 4 more`. */
export function listMore(items: readonly string[], max: number, more = ''): string {
  const shown = items.slice(0, max).join(', ')
  return items.length > max ? `${shown} and ${items.length - max} more${more}` : shown
}

/** `MIT (osi)`, or the kind alone when there is no SPDX value (`proprietary`, `enterprise`, `unknown`). */
export function licenseLabel(l: { spdx: string | null; kind: string }): string {
  return l.spdx ? `${l.spdx} (${l.kind})` : l.kind
}
