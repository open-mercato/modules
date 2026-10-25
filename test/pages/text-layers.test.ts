// /compat cell texts (site/src/lib/compat-cells.ts, rendered by CompatMatrix) and the /radar text layer over
// RadarTables (site/src/pages/_radar-text.ts).
import { describe, expect, test } from 'vitest'
import {
  FIT_GLYPH,
  cellAria,
  fitByDefault,
  fitOf,
  isDayZero,
  metaLine,
  stateSentence,
  type CellText,
} from '../../site/src/lib/compat-cells.ts'
import { markChangedLoadBearing } from '../../site/src/pages/_radar-text.ts'

const cell = (extra: Partial<CellText> = {}): CellText => ({
  line: '0.9',
  status: 'untested',
  fit: 'fit',
  moduleVersion: '0.4.0',
  omVersion: '0.9.0',
  range: '>=0.7.0 <0.8.0',
  declared: false,
  skipped: null,
  step: null,
  since: null,
  at: null,
  ...extra,
})

type Status = 'verified' | 'broken' | 'untested' | 'skipped'
const matrix = (cells: Status[][], baseline: Partial<Record<string, { status: Status }>> = {}) =>
  ({
    rows: cells.map((r) => ({
      cells: Object.fromEntries(r.map((st, i) => [['0.8', '0.9', 'next'][i]!, { status: st }])),
    })),
    baseline,
  }) as unknown as Parameters<typeof isDayZero>[0]
const KEYS = ['0.8', '0.9', 'next']

describe('/compat cells', () => {
  test('drift counts as a fit on /compat (D14); one glyph per fit', () => {
    expect(fitOf('ok')).toBe('fit')
    expect(fitOf('drift')).toBe('fit')
    expect(fitOf('no-fit')).toBe('no-fit')
    expect(fitOf(null)).toBe('unknown')
    expect(FIT_GLYPH).toEqual({ fit: 'F', 'no-fit': '×', unknown: '?' })
  })

  test('day 0 is one predicate: no baseline and no judged module cell', () => {
    expect(isDayZero(matrix([['untested', 'untested', 'skipped']]), KEYS)).toBe(true)
    expect(isDayZero(matrix([['untested', 'untested', 'untested']], { '0.9': { status: 'verified' } }), KEYS)).toBe(
      false,
    )
    expect(isDayZero(matrix([['untested', 'broken', 'untested']]), KEYS)).toBe(false)
  })

  test('the fit layer starts on while more than half of the cells are queued', () => {
    expect(fitByDefault(matrix([['untested', 'untested', 'verified']]), KEYS)).toBe(true)
    expect(fitByDefault(matrix([['untested', 'verified', 'verified']]), KEYS)).toBe(false)
  })

  test('popover sentences (spec 7.8) and accessible names', () => {
    const q = "Queued for tonight's run (02:17 UTC)."
    expect(stateSentence(cell(), q)).toBe(q)
    expect(stateSentence(cell({ status: 'verified' }), q)).toBe('Verified on 0.9.')
    // the shape of the break sentence (review r8)
    expect(stateSentence(cell({ status: 'verified', since: '2026-10-23' }), q)).toBe('Verified on 0.9 since 23 Oct.')
    // the sentences of lib/core/policy.ts with the line (review r7), so the popover reads like the strip
    expect(stateSentence(cell({ status: 'broken', step: 'typecheck', since: '2026-10-09' }), q)).toBe(
      'Broken at typecheck on 0.9 since 9 Oct.',
    )
    expect(stateSentence(cell({ status: 'infra-error', at: '2026-10-23T09:27:00Z' }), q)).toBe(
      'Not judged on 0.9: the run did not finish on 23 Oct.',
    )
    expect(stateSentence(cell({ status: 'skipped', skipped: 'Skipped. Enterprise.' }), q)).toBe('Skipped. Enterprise.')
    expect(metaLine(cell())).toBe(
      'Module 0.4.0 · OM 0.9.0 · Built for >=0.7.0 <0.8.0 (peers reject 0.9) · Fits statically',
    )
    expect(
      metaLine(
        cell({ range: null, moduleVersion: null, fit: 'unknown', omVersion: '0.10.1-develop.7583.1.0c886d0a14' }),
      ),
    ).toBe('No release for this line · OM 0.10.1-develop.7583 · No peer range · Static fit not analyzed')
    expect(cellAria(cell({ fit: 'no-fit' }), true)).toBe('0.9: queued, does not fit statically')
  })
})

describe('/radar load-bearing APIs that changed', () => {
  const meter = (name: string, pkg: string) =>
    `<li class="radar__meter" data-astro-cid-y><span class="radar__sym" data-astro-cid-y><code class="radar__name" translate="no" data-astro-cid-y><span class="nw">${name}</span></code><code class="radar__pkg" translate="no" data-astro-cid-y><span class="nw">${pkg.split('/').join('/</span><wbr><span class="nw">')}</span></code></span><span class="radar__bar"></span><span class="radar__of" data-astro-cid-y>5 of 16</span></li>`
  const html = `<h3 id="rt-load" class="radar__h" data-astro-cid-y>Load-bearing APIs</h3><ol>${meter('ModuleCli', '@open-mercato/shared/modules/registry')}${meter('AppContainer', '@open-mercato/shared/lib/di/container')}</ol>`

  test('marks the changed symbol and counts it in the header', () => {
    const r = markChangedLoadBearing(html, new Map([['@open-mercato/shared/modules/registry#ModuleCli', 'signature']]))
    expect(r.marked).toBe(1)
    expect(r.html).toContain('Load-bearing APIs <span class="radar__n rd-n--changed">1 changed</span></h3>')
    expect(r.html.match(/rd-chg/g)).toHaveLength(1)
    expect(r.html).toMatch(
      /ModuleCli[\s\S]*radar__chg--signature rd-chg">signature<\/span><\/span><span class="radar__bar">/,
    )
  })

  test('nothing changed: the markup stays as it was', () => {
    expect(markChangedLoadBearing(html, new Map())).toEqual({ html, marked: 0 })
  })
})
