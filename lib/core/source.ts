// Where the receipts come from (review r6): nightly CI on GitHub Actions, or a preview run of the local runner
// (`yarn om cells-local`, Docker on the maintainer's machine) before the first CI night. One chip and one sentence,
// used by the site, the agent cards, llms.txt and the tool responses, so the same state never reads eight ways.
// Isomorphic: no Node APIs.

/** `dataAsOf.source` of modules.json and `receiptSource` of the tool responses. */
export type ReceiptSource = 'ci' | 'preview'

/** The chip next to anything a preview receipt decided (header stamp, strip, drawer, /compat, /r/<id>, hero). */
export const PREVIEW_CHIP = 'Preview, not CI'

/** The one sentence about preview receipts, everywhere it is said (pages, tooltips, .md cards, llms.txt, tools). */
export const PREVIEW_SENTENCE =
  "Preview run in Docker on the maintainer's machine, not CI. The first nightly CI run replaces it."

/**
 * The one line every text channel for agents carries while the receipts come from a preview run (review r10:
 * raw/modules.md said `Verified on 0.8, 0.9 and next` 25 times and never `not CI`): llms.txt, llms-full.txt,
 * raw/modules.md, every agent card, `get_module` warnings and `check_compat` notes.
 */
export const PREVIEW_LINE = `Receipts: ${PREVIEW_SENTENCE}`

/** `[PREVIEW_LINE]` for a preview source (or `true`), else `[]`: spread into a list of lines. */
export function previewLines(source: ReceiptSource | boolean | null | undefined): string[] {
  return source === 'preview' || source === true ? [PREVIEW_LINE] : []
}

/** Queue sentence while the receipts come from a preview run: no nightly CI run exists yet to promise `tonight`. */
export const PREVIEW_QUEUED = 'Queued for the first nightly CI run.'

/**
 * The preview queue sentence of a cadence (review of 24 Oct: a cell that runs on the weekly night only, a package a new
 * app on next already has, said `Queued for the first nightly CI run.`): `Queued for the first weekly CI run
 * (Sundays).` for a weekly cell, else `PREVIEW_QUEUED`.
 */
export function previewQueued(cadence: string, weeklyDay: string | null): string {
  return cadence === 'weekly'
    ? `Queued for the first weekly CI run${weeklyDay ? ` (${weeklyDay}s)` : ''}.`
    : PREVIEW_QUEUED
}

/**
 * One preview queue sentence for several lines, each by its cadence: `PREVIEW_QUEUED` when all run nightly, the weekly
 * sentence when all run weekly, else `Queued for the first CI runs: 0.9 nightly, 0.8 and next weekly (Sundays).`
 */
export function previewQueuedLines(
  lines: readonly { key: string; cadence: string }[],
  weeklyDay: string | null,
): string {
  const weekly = lines.filter((l) => l.cadence === 'weekly').map((l) => l.key)
  const nightly = lines.filter((l) => l.cadence !== 'weekly').map((l) => l.key)
  if (weekly.length === 0 || nightly.length === 0) return previewQueued(weekly.length ? 'weekly' : 'nightly', weeklyDay)
  const and = (xs: string[]): string =>
    xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
  return `Queued for the first CI runs: ${and(nightly)} nightly, ${and(weekly)} weekly${weeklyDay ? ` (${weeklyDay}s)` : ''}.`
}

/** Runner of a receipt (`harness.runner`) to its source. */
export const sourceOfRunner = (runner: string | null | undefined): ReceiptSource =>
  runner === 'preview-docker' ? 'preview' : 'ci'

/**
 * Source of a set of receipts: the runner of the newest one (a CI night replaces the preview cells it covers), or
 * null without receipts.
 */
export function receiptSource(
  receipts: readonly { run: { at: string }; harness: { runner: string } }[],
): ReceiptSource | null {
  let newest: { run: { at: string }; harness: { runner: string } } | null = null
  for (const r of receipts) if (!newest || Date.parse(r.run.at) >= Date.parse(newest.run.at)) newest = r
  return newest ? sourceOfRunner(newest.harness.runner) : null
}
