import { describe, expect, it } from 'vitest'
import { align, chromeOf, contentLines, firstDifference, parseMatrix, words } from '../../lib/import-webflow/landing.ts'
import type { WfNode } from '../../lib/import-webflow/export.ts'

const text = (id: string, html: string): WfNode => ({ id, type: 'text', text: { html, text: '' } })

describe('lib/import-webflow/landing.ts (Landings)', () => {
  it('finds the navbar and footer as the lines every page shares', () => {
    const a = ['Nav', 'Menu', 'A body', 'Foot', '©']
    const b = ['Nav', 'Menu', 'B body', 'more', 'Foot', '©']
    expect(chromeOf([a, b])).toEqual({ prefix: 2, suffix: 2 })
    expect(contentLines(b, chromeOf([a, b]))).toEqual(['B body', 'more'])
    expect(chromeOf([a])).toEqual({ prefix: 0, suffix: 0 })
  })

  it('compares words without symbols or invisible characters', () => {
    expect(words('Discuss ↗ the  ‍plan · now ✓')).toEqual(['Discuss', 'the', 'plan', 'now'])
    expect(firstDifference(['a', 'b'], ['a', 'b'])).toBeUndefined()
    expect(firstDifference(['a', 'b'], ['a', 'c'])).toMatch(/^word 2:/)
  })

  it('aligns DOM nodes with the visible lines and gives the lines between them as gaps', () => {
    const lines = ['Eyebrow', 'Title', 'Discuss', '↗', 'Question one?', 'Answer one.']
    const parts = align(
      [
        text('1', '<h1>Title</h1>'),
        text('2', '<a href="/c">Discuss<span>↗</span></a>'),
        text('3', '<p>Answer one.</p>'),
      ],
      lines,
    )
    expect(parts.map((p) => (p.kind === 'gap' ? p.lines : p.kind === 'node' ? p.tag : p.kind))).toEqual([
      ['Eyebrow'],
      'h1',
      'a',
      ['Question one?'],
      'p',
    ])
  })

  it('stops when a DOM node is not in the visible text', () => {
    expect(() => align([text('1', '<p>Missing words</p>')], ['Other text'])).toThrow(/is not in the visible text/)
  })

  it('reads the capability matrix: notes, group titles and the last row', () => {
    const lines = [
      'What your team gets',
      'GROW ON YOUR TERMS',
      'Open Mercato',
      'Core CRM',
      'HubSpot',
      'Sales CRM',
      'Where Open Mercato adds control',
      'Run on your infrastructure',
      '✓',
      '×',
      'HubSpot-hosted',
      '$0 licence fee',
      '✓',
      'Hosting extra',
      '×',
      'Free tools: 2 users',
      'Capabilities available in both',
      'Company records',
      '✓',
      '✓',
      'Custom objects',
      '↗',
      '↗',
      'Enterprise subscription',
    ]
    const m = parseMatrix(lines)
    expect(m.label).toBe('What your team gets')
    expect(m.columns).toEqual([
      { name: 'Open Mercato', note: 'Core CRM' },
      { name: 'HubSpot', note: 'Sales CRM' },
    ])
    expect(m.groups.map((g) => g.title)).toEqual(['Where Open Mercato adds control', 'Capabilities available in both'])
    expect(m.groups[0]!.rows).toEqual([
      { label: 'Run on your infrastructure', ours: 'yes', theirs: 'no', theirsNote: 'HubSpot-hosted' },
      {
        label: '$0 licence fee',
        ours: 'yes',
        oursNote: 'Hosting extra',
        theirs: 'no',
        theirsNote: 'Free tools: 2 users',
      },
    ])
    expect(m.groups[1]!.rows).toEqual([
      { label: 'Company records', ours: 'yes', theirs: 'yes' },
      { label: 'Custom objects', ours: 'build', theirs: 'build', theirsNote: 'Enterprise subscription' },
    ])
  })

  it('refuses a matrix header it does not know', () => {
    expect(() => parseMatrix(['Label', 'Group', 'Row', '✓', '✓'])).toThrow(/header has 1 lines/)
  })
})
