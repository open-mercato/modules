import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../../lib/sigil/sha256.ts'
import {
  brandAt,
  brandStop,
  glyphFromCounts,
  organLevel,
  renderSigil,
  sigilFromCounts,
  sigilLabel,
  sigilPhase,
  SIGIL_SIZES,
} from '../../lib/sigil/sigil.ts'
import type { SigilCounts, SigilKind } from '../../lib/sigil/sigil.ts'

interface Case {
  name: string
  locator: string
  kind: SigilKind
  enterprise?: boolean
  counts: SigilCounts | null
}
const cases = (
  JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'sigil-cases.json'), 'utf8')) as { cases: Case[] }
).cases

function render(c: Case, size: (typeof SIGIL_SIZES)[number] = 48, optical = false): string {
  const s = sigilFromCounts(c.locator, c.counts)
  return renderSigil({
    glyph: c.enterprise ? '0000000' : s.glyph,
    phase: s.phase,
    kind: c.kind,
    enterprise: c.enterprise === true,
    publicRoutes: s.publicRoutes ? (c.counts?.publicRoutes ?? true) : false,
    size,
    optical,
    label: sigilLabel(c.counts, { enterprise: c.enterprise === true }),
  })
}

describe('sha256', () => {
  it('matches known vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
    for (const s of ['zażółć gęślą jaźń', 'npm:@fastwhitecat/integration-ksef-direct', 'x'.repeat(55), 'y'.repeat(64)])
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'))
  })
})

describe('organ levels and glyph', () => {
  it('maps counts to 0..3', () => {
    expect([0, 1, 2, 9, 10, 500].map(organLevel)).toEqual([0, 1, 2, 2, 3, 3])
    expect(organLevel(null)).toBe(0)
  })
  it('orders the glyph D, A, U, E, B, I, X', () => {
    const glyphs = Object.fromEntries(cases.filter((c) => c.counts).map((c) => [c.name, glyphFromCounts(c.counts!)]))
    expect(glyphs).toEqual({
      'dainamite-cpq': '3333102',
      'channel-gmail': '0000002',
      'fullstackhouse-health': '0000000',
      'web-research-exa': '0000001',
      'builtin-customers': '3033230',
    })
  })
  it('counts migrations as one data contract', () => {
    const base = cases.find((c) => c.name === 'fullstackhouse-health')!.counts!
    expect(glyphFromCounts({ ...base, migrations: 4 })[0]).toBe('1')
  })
})

describe('phase and colour', () => {
  it('is a stable function of the locator', () => {
    const p = sigilPhase('npm:@fastwhitecat/integration-ksef-direct')
    expect(p).toBe(sigilPhase('npm:@fastwhitecat/integration-ksef-direct'))
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThan(360)
  })
  it('samples the brand gradient cyclically', () => {
    expect(brandAt(0)).toBe('#B4F372')
    expect(brandAt(120)).toBe('#EEFB63')
    expect(brandAt(240)).toBe('#BC9AFF')
    expect(brandAt(360)).toBe('#B4F372')
    expect(brandAt(-120)).toBe('#BC9AFF')
  })
  it('quantises petals to the nearest brand stop, never a yellow-violet mix', () => {
    expect([0, 59, 60, 179, 180, 299, 300, 359, -90].map(brandStop)).toEqual([
      '#B4F372',
      '#B4F372',
      '#EEFB63',
      '#EEFB63',
      '#BC9AFF',
      '#BC9AFF',
      '#B4F372',
      '#B4F372',
      '#BC9AFF',
    ])
  })
})

describe('renderSigil', () => {
  it('stays within 1.5 KB at every size', () => {
    for (const c of cases) for (const size of SIGIL_SIZES) expect(render(c, size).length).toBeLessThanOrEqual(1536)
  })
  it('stays within 1.5 KB for every glyph, phase and kind, with the public-route tooltip and a long label', () => {
    const label = sigilLabel(cases[0]!.counts!)
    let worst = 0
    for (let g = 0; g < 4 ** 7; g++) {
      const glyph = g.toString(4).padStart(7, '0')
      for (const phase of [0, 30, 59, 90, 200])
        for (const kind of ['module', 'provider', 'library', 'tool', 'built-in'] as const)
          worst = Math.max(
            worst,
            renderSigil({ glyph, phase, kind, publicRoutes: 123, size: 96, label, transitionName: 'sig-0123abcd' })
              .length,
          )
    }
    expect(worst).toBeLessThanOrEqual(1536)
    // 4^7 glyphs x 5 phases x 5 kinds: about 400 000 renders; a loaded CI box needs more than the 5 s default
  }, 20_000)
  it('draws the three levels as three shapes, the same in both themes (no theme class)', () => {
    const at = (glyph: string): string => renderSigil({ glyph, phase: 0, kind: 'module' })
    const one = at('0100000')
    const two = at('0200000')
    const three = at('0300000')
    // level 1: the empty outline plus a filled inner hexagon; level 2: a smaller full petal; level 3: a full petal
    // with an ink edge (review r1: 2 and 3 must differ at 24 px)
    const api = 'M40.6 8.1l7.8 4.5v9l-7.8 4.5-7.8-4.5v-9z'
    // the empty outline is 55 % at 32 px and below (review r4: pale rows in the light list), 40 % above
    expect(one).toMatch(/<path d="[^"]*M40\.6 8\.1l7\.8[^"]*" fill="none" stroke="currentColor" stroke-opacity="\.55"/)
    expect(renderSigil({ glyph: '0100000', phase: 0, kind: 'module', size: 96 })).toContain('stroke-opacity=".4"')
    expect(one).toMatch(/<path d="M40\.6 [\d.]+l4 2\.3v4\.6[^"]*" fill="#B4F372"\/>/)
    expect(two).toMatch(/<path d="M40\.6 [\d.]+l6\.2 3\.6v7\.2[^"]*" fill="#B4F372"\/>/)
    expect(three).toContain(`<path d="${api}" fill="#B4F372" stroke="currentColor" stroke-width="1.5"`)
    expect(new Set([one, two, three]).size).toBe(3)
    for (const svg of [one, two, three]) expect(svg).not.toContain('class=')
  })
  it('built-in greys carry their level as a class, so the dark theme can turn the scale around (review r4)', () => {
    const svg = renderSigil({ glyph: '2130000', phase: 0, kind: 'built-in' })
    expect(svg).toContain('fill="#434343" class="sg-b3"')
    expect(svg).toContain('fill="#B6B6B6" class="sg-b1"')
    expect(svg).toContain('fill="#6D6D6D" class="sg-bc"')
  })
  it('is an accessible image', () => {
    const svg = render(cases[0]!)
    expect(svg).toContain('role="img"')
    expect(svg).toContain(
      'aria-label="Anatomy: 20 tables, 91 routes (0 public), 18 pages, 4 widgets, 11 events, 1 CLI command, 4 extensions"',
    )
    expect(svg).toContain('width="48" height="48"')
  })
  it('marks public routes with a red dot', () => {
    const c = { ...cases[0]!, counts: { ...cases[0]!.counts!, publicRoutes: 2 } }
    expect(render(c)).toContain('fill="#F32828"><title>2 public routes</title>')
    expect(render(cases[0]!)).not.toContain('#F32828')
  })
  it('escapes the label', () => {
    const svg = renderSigil({ glyph: '1111111', phase: 0, kind: 'module', label: '<script>"x"</script>' })
    expect(svg).not.toContain('<script>')
  })
  it('rejects a bad glyph', () => {
    expect(() => renderSigil({ glyph: '12', phase: 0, kind: 'module' })).toThrow()
  })
  for (const c of cases) {
    it(`golden: ${c.name}`, async () => {
      await expect(render(c, 96)).toMatchFileSnapshot(join('golden', 'sigil', `${c.name}.svg`))
    })
  }
})

describe('optical size (16 px)', () => {
  const cpq = cases.find((c) => c.name === 'dainamite-cpq')!
  it('leaves out empty outlines and level edges, gives the centre an edge', () => {
    const svg = render(cpq, 16, true)
    expect(svg).not.toContain('stroke-opacity=".4"')
    expect(svg).not.toContain('stroke-width="1.25"')
    expect(svg).toMatch(/fill="currentColor" fill-opacity="[\d.]+" stroke="currentColor"/)
  })
  it('draws nothing but the centre edge for an empty anatomy', () => {
    const empty = renderSigil({ glyph: '0000000', phase: 0, kind: 'module', size: 16, optical: true })
    expect(empty.match(/<path/g)?.length).toBe(1)
  })
  it('keeps 24 px and up unchanged', () => {
    expect(render(cpq, 24)).toContain('stroke-width="1.5"')
  })
  for (const c of cases) {
    it(`golden 16 px: ${c.name}`, async () => {
      await expect(render(c, 16, true)).toMatchFileSnapshot(join('golden', 'sigil-16', `${c.name}.svg`))
    })
  }
})
