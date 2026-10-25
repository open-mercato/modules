// README badges (spec 6.7): `/badge/<path>.svg` (20 px, black left part with a 12 px sigil and `OM MODULES`,
// right part by state) and the shields.io endpoint `/badge/<path>.json`. Every text is XML-escaped; at most 2 KB.
// Pure and isomorphic (lib/sigil renders the mini sigil).
import { latestLine, type LineInfo } from '../core/lines.ts'
import { renderSigil } from '../sigil/sigil.ts'
import type { ShieldsBadge } from './types.ts'
import type { IndexEntry } from '../schema/published/modules.ts'
import { escapeXml } from './util.ts'
import { PREVIEW_CHIP, type ReceiptSource } from '../core/source.ts'

export const BADGE_MAX_BYTES = 2048
const CHAR_W = 6.6
const H = 20
const FONT = `'Geist Mono', ui-monospace, Menlo, monospace`

export interface BadgeState {
  kind: 'quality' | 'failing' | 'verified' | 'preview' | 'enterprise' | 'listed' | 'unlisted'
  /** Right part, upper case (`VERIFIED · 0.9`). */
  text: string
  /** shields.io message, lower case. */
  message: string
  fill: string
  ink: string
}

/**
 * State of the badge: OM Quality > failing on latest > verified on latest > listed > not listed. Receipts of a preview
 * run (`source: 'preview'`, review r8) decide neither failing nor verified: until the first nightly CI run the badge says
 * `PREVIEW · 0.9`, so an author's README never shows a preview verdict as a CI one.
 */
export function badgeState(e: IndexEntry, lines: readonly LineInfo[], source: ReceiptSource | null = null): BadgeState {
  const latest = latestLine(lines)?.key ?? null
  if (e.quality) {
    const t = `OM QUALITY ${e.quality.version}`
    return { kind: 'quality', text: t, message: t.toLowerCase(), fill: 'url(#g)', ink: '#0C0C0C' }
  }
  if (latest && source === 'preview' && (e.signals.receipt[latest] === 'broken' || e.tier === 'verified')) {
    const t = `PREVIEW · ${latest}`
    return { kind: 'preview', text: t, message: t.toLowerCase(), fill: '#ECECEC', ink: '#0C0C0C' }
  }
  if (latest && e.signals.receipt[latest] === 'broken') {
    const t = `FAILING ON ${latest}`
    return { kind: 'failing', text: t, message: t.toLowerCase(), fill: '#B3261E', ink: '#FFFFFF' }
  }
  if (latest && e.tier === 'verified') {
    const t = `VERIFIED · ${latest}`
    return { kind: 'verified', text: t, message: t.toLowerCase(), fill: '#B4F372', ink: '#2F520B' }
  }
  // enterprise has no level (tier null, spec 7): its chip, never `LISTED` read as a level (finding of 25 Oct)
  if (e.enterprise && e.tier === null)
    return {
      kind: 'enterprise',
      text: 'ENTERPRISE LICENSE',
      message: 'enterprise license',
      fill: '#ECECEC',
      ink: '#0C0C0C',
    }
  if (e.listed) return { kind: 'listed', text: 'LISTED', message: 'listed', fill: '#ECECEC', ink: '#0C0C0C' }
  return { kind: 'unlisted', text: 'NOT LISTED', message: 'not listed', fill: '#ECECEC', ink: '#0C0C0C' }
}

const n1 = (v: number): string => String(Math.round(v * 10) / 10)

/** The badge SVG. */
export function badgeSvg(e: IndexEntry, lines: readonly LineInfo[], source: ReceiptSource | null = null): string {
  const s = badgeState(e, lines, source)
  const leftText = 'OM MODULES'
  const leftW = 4 + 12 + 5 + leftText.length * CHAR_W + 6
  const rightW = 7 + s.text.length * CHAR_W + 7
  const w = leftW + rightW
  const name = e.npm ?? e.locator.replace(/^github:/, '')
  const title = `Open Mercato Modules: ${e.title} (${name}), ${s.message}${s.kind === 'preview' ? ` (${PREVIEW_CHIP})` : ''}`
  // mini sigil: the WP11 sigil nested at 12 px; its own role and label are dropped (the badge has a <title>)
  const sigil = renderSigil({
    glyph: e.sigil.glyph,
    phase: e.sigil.phase,
    kind: e.kind,
    enterprise: e.enterprise,
    publicRoutes: false,
    size: 16,
    color: '#FFFFFF',
  })
    .replace(/ width="16" height="16"/, ` x="4" y="4" width="12" height="12"`)
    .replace(/ role="img" aria-label="[^"]*"/, '')
  const grad =
    s.kind === 'quality'
      ? '<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#B4F372"/><stop offset=".5" stop-color="#EEFB63"/><stop offset="1" stop-color="#BC9AFF"/></linearGradient></defs>'
      : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(w)}" height="${H}" viewBox="0 0 ${n1(w)} ${H}" role="img">` +
    `<title>${escapeXml(title)}</title>${grad}` +
    `<rect width="${n1(leftW)}" height="${H}" fill="#0C0C0C"/>` +
    `<rect x="${n1(leftW)}" width="${n1(rightW)}" height="${H}" fill="${s.fill}"/>` +
    sigil +
    `<g font-family="${FONT}" font-size="11">` +
    `<text x="${n1(4 + 12 + 5)}" y="14" fill="#FFFFFF">${escapeXml(leftText)}</text>` +
    `<text x="${n1(leftW + 7)}" y="14" fill="${s.ink}">${escapeXml(s.text)}</text>` +
    `</g></svg>`
  )
}

/** shields.io endpoint (spec 6.7): `{"schemaVersion":1,"label":"OM modules","message":"verified · 0.9",...}`. */
export function shieldsBadge(
  e: IndexEntry,
  lines: readonly LineInfo[],
  source: ReceiptSource | null = null,
): ShieldsBadge {
  const s = badgeState(e, lines, source)
  const color = s.kind === 'quality' ? 'BC9AFF' : s.fill.replace('#', '')
  return { schemaVersion: 1, label: 'OM modules', message: s.message, color, labelColor: '0C0C0C' }
}
