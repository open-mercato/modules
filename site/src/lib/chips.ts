// Models of the identity chips and the tier seal (spec 6.7). Astro components and Preact islands render the same
// markup from these, so the list (island) and the module page (Astro) never drift apart.
import { PREVIEW_CHIP } from '../../../lib/core/source.ts'
import type { IndexEntry, LicenseKind, OriginType } from '../../../lib/schema/index.ts'
import { day, yearMonth } from './format.ts'
import { STEPS, STEPS_WORD } from '../../../lib/core/steps.ts'

export interface TypeChipModel {
  num: string | null
  label: string
  variant: 'official' | 'community' | 'third' | 'builtin'
  title: string
}

export function typeChip(type: OriginType | 'built-in'): TypeChipModel {
  switch (type) {
    case 'official':
      return {
        num: '01',
        label: 'Official',
        variant: 'official',
        title: 'Published by Open Mercato (npm scope @open-mercato).',
      }
    case 'community':
      return {
        num: '02',
        label: 'Community',
        variant: 'community',
        title: 'Published by an Open Mercato community member.',
      }
    case '3rd-party':
      return { num: '03', label: '3rd-party', variant: 'third', title: 'Published by a third party.' }
    case 'built-in':
      return { num: null, label: 'Built-in', variant: 'builtin', title: 'Ships with Open Mercato core.' }
  }
}

export interface LicenseChipModel {
  label: string
  variant: 'plain' | 'unknown' | 'enterprise'
  mismatch: boolean
  title: string
}

export function licenseChip(l: { spdx: string | null; kind: LicenseKind; mismatch: boolean }): LicenseChipModel {
  const mismatch = l.mismatch
  const note = mismatch ? ' License sources disagree.' : ''
  switch (l.kind) {
    case 'enterprise':
      return { label: 'Enterprise license', variant: 'enterprise', mismatch, title: `Commercial license.${note}` }
    case 'proprietary':
      return {
        label: 'Proprietary',
        variant: 'plain',
        mismatch,
        title: `License: proprietary${l.spdx ? ` (${l.spdx})` : ''}.${note}`,
      }
    case 'unknown':
      return { label: 'License unknown', variant: 'unknown', mismatch, title: `No license found.${note}` }
    case 'osi':
      return {
        label: l.spdx ?? 'OSI',
        variant: 'plain',
        mismatch,
        title: `License: ${l.spdx ?? 'OSI approved'}.${note}`,
      }
  }
}

export type SealModel =
  | { kind: 'quality'; version: string; until: string; title: string }
  | { kind: 'revoked'; version: string; at: string; title: string }
  | { kind: 'verified'; line: string; title: string }
  | { kind: 'listed'; title: string; note?: string }
  | { kind: 'none'; title: string }

/**
 * Seal of an entry: OM Quality (human review) over Verified (machine, on the latest line) over Listed.
 * `latestKey` is the key of the `latest` line (e.g. '0.9').
 */
export function sealOf(
  entry: Pick<IndexEntry, 'tier' | 'quality' | 'compat'> & {
    revoked?: { version: string; at: string } | null
    /** Why an entry verified on the latest line is still Listed (`levelNote`); shown as `≠` next to the chip. */
    levelNote?: string | null
  },
  latestKey: string,
  /** The receipts come from a preview run (`dataAsOf.source`): the Verified seal says so (review r10). */
  preview = false,
): SealModel {
  if (entry.quality)
    return {
      kind: 'quality',
      version: entry.quality.version,
      until: yearMonth(entry.quality.until),
      title: `OM Quality: a core team reviewer and a second approver checked ${entry.quality.version}. Review time can be paid for. The result cannot.`,
    }
  if (entry.revoked)
    return {
      kind: 'revoked',
      version: entry.revoked.version,
      at: entry.revoked.at,
      title: `OM Quality revoked on ${entry.revoked.at}.`,
    }
  if (entry.tier === 'verified')
    return {
      kind: 'verified',
      line: latestKey,
      // a verdict of a preview run never reads as CI (review r10): the badge says PREVIEW, the seal's title says it too;
      // a package a new app already has was not installed into it (review of 24 Oct)
      title: `Verified on ${latestKey}: ${entry.compat.inPresets?.includes(latestKey) ? 'a new Open Mercato app that already has it' : 'a fresh Open Mercato app installed it and'} passed all ${STEPS_WORD} steps, ${STEPS[0]} to ${STEPS[STEPS.length - 1]}. A compatibility signal, not a security review.${preview ? ` ${PREVIEW_CHIP}.` : ''}`,
    }
  if (entry.tier === 'listed')
    return entry.levelNote
      ? { kind: 'listed', title: `Listed, not Verified. ${entry.levelNote}`, note: entry.levelNote }
      : { kind: 'listed', title: 'Listed: the descriptor, package and license checks passed.' }
  return { kind: 'none', title: 'Not listed.' }
}

/** One LST/VER rule of `/m/<path>.json` (`ModuleDetail.rules`). */
export interface LevelRule {
  id: string
  pass: boolean
  detail: string
}

/**
 * The first failed VER rule of an entry whose latest-line square is green but whose level is Listed (review r3):
 * the strip and the chip disagree, so the chip says why (`≠` and a title). Null when they agree.
 */
export function levelNote(
  entry: Pick<IndexEntry, 'tier' | 'compat'>,
  rules: readonly LevelRule[] | null | undefined,
  latestKey: string,
): string | null {
  if (entry.tier !== 'listed' || entry.compat.lines[latestKey]?.status !== 'verified') return null
  const failed = (rules ?? []).find((r) => r.id.startsWith('VER-') && !r.pass)
  return failed ? `${failed.id}: ${failed.detail}` : null
}

/**
 * Title of the VER rule list on the Quality tab (review r4): `Verified on` is the word of a receipt (spec 1.2), so it
 * titles the list only when the entry holds the level; otherwise the list is the rules the level needs.
 */
export function rulesHeading(tier: IndexEntry['tier'], line: string, passed: number, total: number): string {
  return tier === 'verified'
    ? `Verified on ${line} · ${passed} of ${total} rules pass`
    : `Rules for Verified · ${line} · ${passed} of ${total} pass`
}

/**
 * The note under the VER rules: what the nightly test is. In the past tense with the date (6.8) only when the last
 * receipt on the line is verified; before that, what the run does; nothing for an entry the run never installs.
 */
export function verifiedTestNote(o: {
  installs: boolean
  last: { status: string; at: string } | null
  omVersion: string
  /** The receipts come from a preview run (review r12: `The nightly run installs it` spoke of a CI run not running yet). */
  preview?: boolean
}): string | null {
  if (!o.installs) return null
  const tail = `${STEPS.join(', ')}. A module's own code runs during the test. Verified is a compatibility signal, not a security review.`
  // a new app is one from the classic preset, what create-mercato-app makes (decision of 24 Oct)
  return o.last?.status === 'verified'
    ? `Installed in a new Open Mercato ${o.omVersion} app on ${day(o.last.at)}: ${tail}`
    : `${o.preview ? 'Each run' : 'The nightly run'} installs it in a new Open Mercato ${o.omVersion} app: ${tail}`
}
