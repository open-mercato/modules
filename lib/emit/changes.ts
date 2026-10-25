// /changes.json (Change[] of the last 90 days, newest first, at most 60 KB) and /feed.xml (Atom of the same
// changes) (spec 4.6). Pure.
import type { Change } from '../schema/data/index.ts'
import type { IndexEntry } from '../schema/published/modules.ts'
import { PREVIEW_CHIP } from '../core/source.ts'
import { byteLength, escapeXml } from './util.ts'

export const CHANGES_DAYS = 90
export const CHANGES_MAX_BYTES = 60 * 1024

/**
 * Changes of the last 90 days before `now`, newest first, trimmed (oldest first) to the 60 KB budget. A change with a
 * `reason` is no change of the module (`preset-model`: the switch of the main verdict to a new app on 24 Oct, review of
 * 24 Oct: about 24 `verified to listed` would read as regressions) and stays out.
 */
export function recentChanges(changes: readonly Change[], now: string): { changes: Change[]; truncated: boolean } {
  const from = Date.parse(now) - CHANGES_DAYS * 86_400_000
  const seen = new Set<string>()
  const list = changes
    .filter((c) => !c.reason)
    .filter((c) => Date.parse(c.at) >= from && Date.parse(c.at) <= Date.parse(now))
    .filter((c) => {
      const k = JSON.stringify(c)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.locator.localeCompare(b.locator))
  // `[` + items joined by `,` + `]` + newline
  let total = 3 + list.reduce((n, c) => n + byteLength(JSON.stringify(c)) + 1, 0) - (list.length > 0 ? 1 : 0)
  let truncated = false
  while (list.length > 0 && total > CHANGES_MAX_BYTES) {
    total -= byteLength(JSON.stringify(list.pop())) + 1
    truncated = true
  }
  return { changes: list, truncated }
}

/**
 * Level changes that the entry's current level contradicts (review r9: the feed announced `Search: level listed to
 * verified.` while a later rule kept search Listed): for each entry the last level change must end at its current level, else that change is left out.
 * Earlier changes stay, they were true when they happened.
 */
export function withCurrentLevels(
  changes: readonly Change[],
  entries: readonly Pick<IndexEntry, 'locator' | 'tier'>[],
): Change[] {
  const tier = new Map(entries.map((e) => [e.locator, e.tier ?? 'none']))
  const last = new Map<string, Change>()
  for (const c of changes)
    if (c.type === 'tier-change' && !c.reason) {
      const prev = last.get(c.locator)
      if (!prev || Date.parse(c.at) >= Date.parse(prev.at)) last.set(c.locator, c)
    }
  const stale = new Set(
    [...last.values()].filter((c) => tier.has(c.locator) && (c.to ?? 'none') !== tier.get(c.locator)),
  )
  return changes.filter((c) => !stale.has(c))
}

/** A change a preview run decided says so in the feed (review r9): its title and summary end with the preview chip. */
const PREVIEW_TYPES: ReadonlySet<Change['type']> = new Set(['receipt-transition', 'tier-change'])
/** The one chip of lib/core/source.ts in a parenthesis: `preview, not CI`. */
const PREVIEW_NOTE = `${PREVIEW_CHIP.charAt(0).toLowerCase()}${PREVIEW_CHIP.slice(1)}`

/** One line for people: `KSeF Integration 0.1.9 published.` */
export function changeText(c: Change, title: string): string {
  const on = c.line ? ` on ${c.line}` : ''
  switch (c.type) {
    case 'new-entry':
      return `${title} is listed.`
    case 'new-version':
      return `${title}${c.version ? ` ${c.version}` : ''} published.`
    case 'receipt-transition':
      return `${title}${on}: ${c.from ?? 'none'} to ${c.to ?? 'none'}.`
    case 'tier-change':
      return `${title}: level ${c.from ?? 'none'} to ${c.to ?? 'none'}.`
    case 'status-change':
      return `${title}: status ${c.from ?? 'none'} to ${c.to ?? 'none'}.`
    case 'quality-granted':
      return `${title}${c.version ? ` ${c.version}` : ''} holds OM Quality.`
    case 'quality-revoked':
      return `${title}${c.version ? ` ${c.version}` : ''}: OM Quality revoked.`
  }
}

/**
 * Atom entry ID of a change, built only from the change itself (never its position in the list), so an entry keeps
 * its ID when newer changes arrive and feed readers do not show it again: `at~type~locator`, then each optional
 * field that is set as `~name=value` in a fixed order (values encoded, they may be free strings).
 */
export function changeId(c: Change, site: string): string {
  const opt = (['line', 'version', 'from', 'to'] as const)
    .filter((k) => c[k] !== undefined)
    .map((k) => `~${k}=${encodeURIComponent(c[k]!)}`)
    .join('')
  return `${site}/changes.json#${c.at}~${c.type}~${c.locator}${opt}`
}

/** Atom feed of the changes (`application/atom+xml`). */
export function buildFeed(
  changes: readonly Change[],
  entries: readonly IndexEntry[],
  site: string,
  now: string,
  /** The receipts come from a preview run (`dataAsOf.source`): level and receipt changes say so. */
  preview = false,
): string {
  const byLoc = new Map(entries.map((e) => [e.locator, e]))
  const updated = changes[0]?.at ?? now
  const items = changes.map((c) => {
    const e = byLoc.get(c.locator)
    const title = e?.title ?? c.locator.replace(/^(npm|github):/, '')
    const link = e ? e.links.page : `${site}/`
    const base = changeText(c, title)
    const text = preview && PREVIEW_TYPES.has(c.type) ? `${base.replace(/\.$/, '')} (${PREVIEW_NOTE}).` : base
    const id = changeId(c, site)
    return [
      '  <entry>',
      `    <id>${escapeXml(id)}</id>`,
      `    <title>${escapeXml(text)}</title>`,
      `    <updated>${escapeXml(c.at)}</updated>`,
      `    <link href="${escapeXml(link)}"/>`,
      `    <category term="${escapeXml(c.type)}"/>`,
      `    <summary>${escapeXml(text)}</summary>`,
      '  </entry>',
    ].join('\n')
  })
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '  <title>Open Mercato Modules changes</title>',
    `  <id>${escapeXml(`${site}/feed.xml`)}</id>`,
    `  <link rel="self" href="${escapeXml(`${site}/feed.xml`)}"/>`,
    `  <link href="${escapeXml(`${site}/`)}"/>`,
    `  <updated>${escapeXml(updated)}</updated>`,
    '  <author><name>Open Mercato Modules</name></author>',
    ...items,
    '</feed>',
    '',
  ].join('\n')
}
