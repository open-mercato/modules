// Browser-side freshness check of the DataStamp (spec 7.6). Plain ES5 so it can be inlined as is.
// A preview build (dataAsOf.source = 'preview', review r6) has no nightly run to be late: its stamps carry no
// data-nightly, so the check never turns them stale and the STALE DATA banner never says a night did not finish.
// Base.astro prints it right after #stale-banner; it still waits for DOMContentLoaded so that every stamp on the
// page exists. Each `.stamp[data-nightly]` gets `is-stale` when its night is older than 48 h, measured against its
// own `data-now` (demo stamps with a fixed instant) or Date.now(). Only the stamp marked `data-primary` (the
// header stamp) switches the banner, so a second stamp on the page can never contradict the header.
import { day, hoursBetween, stamp, timeUtc } from './format.ts'
import { PREVIEW_SENTENCE } from '../../../lib/core/source.ts'

export const STALE_HOURS = 48

export const STALE_CHECK_JS = `(function () {
  function run() {
    var els = document.querySelectorAll('.stamp[data-nightly]')
    var banner = document.getElementById('stale-banner')
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      var t = Date.parse(el.getAttribute('data-nightly') || '')
      if (!t) continue
      var now = Date.parse(el.getAttribute('data-now') || '') || Date.now()
      var stale = now - t > ${STALE_HOURS} * 3600 * 1000
      el.classList.toggle('is-stale', stale)
      if (banner && el.hasAttribute('data-primary')) {
        banner.hidden = !stale
        var d = banner.querySelector('[data-stale-day]')
        if (d) d.textContent = el.getAttribute('data-day')
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run)
  else run()
})()`

/** `dataAsOf` as the pages read it (modules.json, review r6: `source` names a preview run). */
export interface DataAsOf {
  nightly: string | null
  npm: string | null
  source?: 'ci' | 'preview' | null
}

/** The receipts come from a preview run, not CI: no freshness check, no `tonight` promises. */
export const isPreviewData = (d: Pick<DataAsOf, 'source'>): boolean => d.source === 'preview'

/** What the DataStamp shows (spec 7.6, review r6), as a pure function of the data and the build clock. */
export interface StampModel {
  label: string
  title: string
  /** `data-nightly` for the browser check; undefined on preview data, so no clock can ever turn it stale. */
  nightlyAttr: string | undefined
  /** No-JS fallback of the 48 h rule. */
  stale: boolean
  preview: boolean
  pending: boolean
  /** `data-day` for the banner text. */
  dayAttr: string
}

export function stampModel(d: DataAsOf, now: string | Date): StampModel {
  const nightly = d.nightly
  const preview = !!nightly && isPreviewData(d)
  const at = nightly ?? d.npm
  const npmChecked = `npm checked ${d.npm ? stamp(d.npm) : 'not yet'}.`
  return {
    // a preview run gives its day only (review r6): the run panel names its own hours, and a retry is not a new run;
    // `Updated`, not `Preview` (review of 26 Oct: a word for developers on every page), the tooltip says the rest
    label: preview ? `Updated ${day(nightly!)}` : at ? `Data ${stamp(at)}` : 'Data pending',
    title: nightly
      ? preview
        ? `${PREVIEW_SENTENCE} Last receipt ${stamp(nightly)}. ${npmChecked}`
        : `Nightly install data from ${stamp(nightly)}. ${npmChecked}`
      : at
        ? `npm data from ${stamp(at)}. No nightly receipt yet.`
        : 'No data yet.',
    nightlyAttr: preview ? undefined : (nightly ?? ''),
    stale: nightly && !preview ? hoursBetween(nightly, now) > STALE_HOURS : false,
    preview,
    pending: !at,
    dayAttr: nightly && !preview ? day(nightly) : '',
  }
}

/** Cells as the run panel counts them (`judgedLines` of the listed entries), only their receipt time. */
export interface SpanCell {
  at: string | null
}

/**
 * The span of the receipts behind the counts of the run panel (review r8: the panel said `baseline 23 Oct 14:47 · last
 * receipt 18:21 UTC` while 58 of its 74 verified cells came from the 09:27 run, judged against the 09:27 baseline).
 * From the oldest to the newest receipt among the counted cells, without a dash: `receipts 23 Oct 09:27 to 18:21 UTC`.
 * A baseline is named on its line only when it differs from the start of the span (`baselineNote`). Null without cells.
 */
export function receiptSpan(cells: readonly SpanCell[]): { from: string; to: string; text: string } | null {
  const ats = cells
    .map((c) => c.at)
    .filter((a): a is string => !!a && !Number.isNaN(Date.parse(a)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  const from = ats[0]
  const to = ats.at(-1)
  if (!from || !to) return null
  const hm = (v: string): string => timeUtc(v).replace(' UTC', '')
  const end = day(from) === day(to) ? `${hm(to)} UTC` : `${day(to)} ${hm(to)} UTC`
  const text = from === to ? `receipts ${day(from)} ${hm(from)} UTC` : `receipts ${day(from)} ${hm(from)} to ${end}`
  return { from, to, text }
}

/**
 * The time of a line's baseline in the run panel, next to its `baseline pass`: `14:47 UTC` (`22 Oct 14:47 UTC` on
 * another day) when it is not the start of the span, '' otherwise, so the panel never reads as if every count came
 * from one baseline run.
 */
export function baselineNote(baselineAt: string | null, span: { from: string } | null): string {
  if (!baselineAt || !span || baselineAt === span.from) return ''
  return day(baselineAt) === day(span.from) ? timeUtc(baselineAt) : `${day(baselineAt)} ${timeUtc(baselineAt)}`
}
