// DataStamp browser check (spec 7.6): a page built while data was fresh and opened 3 days later shows the banner.
// The inline script is run against a minimal fake DOM; the layout order (script after #stale-banner) is read from
// Base.astro. The real browser path is exercised by test/design/shots/gallery-shots.mjs (page.clock, Cezar).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STALE_CHECK_JS, stampModel } from '../../site/src/lib/freshness.ts'
import { PREVIEW_SENTENCE } from '../../lib/core/source.ts'

type Attrs = Record<string, string>

function stampEl(attrs: Attrs) {
  const classes = new Set<string>()
  return {
    attrs,
    classes,
    getAttribute: (n: string) => (n in attrs ? (attrs[n] as string) : null),
    hasAttribute: (n: string) => n in attrs,
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
  }
}

function fakePage(stamps: ReturnType<typeof stampEl>[], readyState = 'complete') {
  const day = { textContent: '' }
  const banner = { hidden: true, querySelector: () => day }
  const listeners: Record<string, () => void> = {}
  const document = {
    readyState,
    querySelectorAll: () => stamps,
    getElementById: (id: string) => (id === 'stale-banner' ? banner : null),
    addEventListener: (ev: string, f: () => void) => (listeners[ev] = f),
  }
  return { document, banner, day, listeners }
}

function run(document: unknown, nowMs: number): void {
  const FakeDate = { parse: Date.parse, now: () => nowMs }
  new Function('document', 'Date', STALE_CHECK_JS)(document, FakeDate)
}

const NIGHTLY = '2026-10-23T02:17:00Z'
const header = () => stampEl({ 'data-nightly': NIGHTLY, 'data-day': '23 Oct', 'data-primary': '' })

describe('stale-data check in the browser', () => {
  it('shows the banner when a fresh build is opened 3 days later', () => {
    const h = header()
    const p = fakePage([h])
    run(p.document, Date.parse(NIGHTLY) + 72 * 3600_000)
    expect(p.banner.hidden).toBe(false)
    expect(p.day.textContent).toBe('23 Oct')
    expect(h.classes.has('is-stale')).toBe(true)
  })

  it('keeps the banner hidden within 48 h', () => {
    const h = header()
    const p = fakePage([h])
    run(p.document, Date.parse(NIGHTLY) + 47 * 3600_000)
    expect(p.banner.hidden).toBe(true)
    expect(h.classes.has('is-stale')).toBe(false)
  })

  it('waits for DOMContentLoaded while the document is still loading', () => {
    const p = fakePage([header()], 'loading')
    run(p.document, Date.parse(NIGHTLY) + 72 * 3600_000)
    expect(p.banner.hidden).toBe(true)
    p.listeners.DOMContentLoaded?.()
    expect(p.banner.hidden).toBe(false)
  })

  it('lets only the header stamp drive the banner; demo stamps keep their fixed instant', () => {
    const h = header()
    const demoStale = stampEl({
      'data-nightly': '2026-10-20T03:12:00Z',
      'data-now': '2026-10-23T09:00:00Z',
      'data-day': '20 Oct',
    })
    const demoFresh = stampEl({ 'data-nightly': NIGHTLY, 'data-now': NIGHTLY, 'data-day': '23 Oct' })
    const p = fakePage([h, demoStale, demoFresh])
    run(p.document, Date.parse(NIGHTLY) + 3600_000)
    expect(p.banner.hidden).toBe(true)
    expect(demoStale.classes.has('is-stale')).toBe(true)
    expect(demoFresh.classes.has('is-stale')).toBe(false)
  })

  it('is printed after #stale-banner in the layout, and DataStamp has no script of its own', () => {
    const base = readFileSync('site/src/layouts/Base.astro', 'utf8')
    const banner = base.indexOf('id="stale-banner"')
    const script = base.indexOf('set:html={STALE_CHECK_JS}')
    expect(banner).toBeGreaterThan(0)
    expect(script).toBeGreaterThan(banner)
    expect(readFileSync('site/src/components/DataStamp.astro', 'utf8')).not.toMatch(/<script/)
  })

  // review r6 (P0): a build of preview receipts opened on 27 Oct, four days after the run, said `STALE DATA. The
  // nightly run did not finish.` on every page, about a nightly run that does not exist yet
  describe('preview data (dataAsOf.source = preview) with the clock frozen at 27 Oct', () => {
    const PREVIEW = { nightly: '2026-10-23T15:39:42Z', npm: '2026-10-23T09:39:38Z', source: 'preview' as const }
    const CLOCK = '2026-10-27T10:00:00Z'

    it('the stamp has no data-nightly, is not stale and names the preview by its day only', () => {
      const m = stampModel(PREVIEW, CLOCK)
      expect(m.nightlyAttr).toBeUndefined()
      expect(m.stale).toBe(false)
      expect(m.preview).toBe(true)
      expect(m.label).toBe('Preview 23 Oct')
      expect(m.title.startsWith(PREVIEW_SENTENCE)).toBe(true)
      expect(m.dayAttr).toBe('')
    })

    it('the browser check leaves the banner hidden: the stamp carries nothing to measure', () => {
      const m = stampModel(PREVIEW, CLOCK)
      const h = stampEl({
        ...(m.nightlyAttr === undefined ? {} : { 'data-nightly': m.nightlyAttr }),
        'data-primary': '',
      })
      const p = fakePage([h])
      run(p.document, Date.parse(CLOCK))
      expect(p.banner.hidden).toBe(true)
      expect(h.classes.has('is-stale')).toBe(false)
    })

    it('the same instant on CI data still shows the banner (48 h rule unchanged)', () => {
      const m = stampModel({ ...PREVIEW, source: 'ci' }, CLOCK)
      expect(m.stale).toBe(true)
      expect(m.label).toBe('Data 23 OCT 15:39 UTC')
      const h = stampEl({ 'data-nightly': m.nightlyAttr ?? '', 'data-day': m.dayAttr, 'data-primary': '' })
      const p = fakePage([h])
      run(p.document, Date.parse(CLOCK))
      expect(p.banner.hidden).toBe(false)
    })

    it('the layout never renders the banner on preview data, whatever the build clock', () => {
      const base = readFileSync('site/src/layouts/Base.astro', 'utf8')
      expect(base).toMatch(/dataAsOf\.nightly && !isPreviewData\(dataAsOf\)/)
      // and the banner itself is left out of a preview build
      expect(base).toMatch(/!isPreviewData\(dataAsOf\) && \(\s*<div class="sheet stale-wrap" id="stale-banner"/)
    })
  })
})
