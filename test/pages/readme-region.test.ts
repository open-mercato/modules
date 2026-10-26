// The README of a module page is rendered from Markdown and flows with the page (review of 26 Oct: raw `##` and
// fences in a box with its own scroll, cut mid-sentence). No inner scroll region is left for a keyboard to reach.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildEmit } from '../../lib/emit/index.ts'
import { README_CUT_TEXT, README_EXCERPT_MAX, readmeWasCut, readmeWholeLines } from '../../lib/core/text.ts'
import { OPTS, ROOT, fixtureData, text } from '../emit/helpers.ts'

describe('module page README', () => {
  test('the README is rendered HTML with no scroll of its own', () => {
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'm', '[...path].astro'), 'utf8')
    expect(page).toContain('<div class="readme__text md" set:html={readmeBody} />')
    expect(page).toContain('readmeFold(readmeBlocks(readme))')
    const css = readFileSync(join(ROOT, 'site', 'src', 'pages', 'm', '_module.css'), 'utf8')
    expect(/\.readme__text \{[^}]*overflow: auto/.test(css)).toBe(false)
    expect(/\.readme__text \{[^}]*max-height: \d/.test(css)).toBe(false)
  })
})

// finding of 25 Oct (WEB-009): Rentgen keeps 4000 characters, and the Shopify and create-mercato-module READMEs ended
// mid-table and mid-sentence with nothing saying so
describe('a README excerpt Rentgen cut', () => {
  const KSEF = 'npm:@fastwhitecat/integration-ksef-direct'
  const long = `${'| a | b |\n'.repeat(500)}| half a ro`.slice(0, README_EXCERPT_MAX)

  test('ends at its last whole line and says so in the catalog words', () => {
    expect(readmeWasCut(long)).toBe(true)
    expect(readmeWasCut('short')).toBe(false)
    expect(readmeWholeLines(long, true).endsWith('| a | b |')).toBe(true)
    expect(readmeWholeLines('one\ntwo', false)).toBe('one\ntwo')
    expect(README_CUT_TEXT).toBe('First 4,000 characters. Full README on npm or in the repository.')
  })

  test('the .md card carries the line after the fence, only for a cut excerpt', () => {
    const data = fixtureData()
    const facts = data.facts.get(KSEF)!.get('0.1.8')!
    data.facts.get(KSEF)!.set('0.1.8', { ...facts, readmeExcerpt: long })
    const card = text(buildEmit(data, OPTS), 'm/@fastwhitecat/integration-ksef-direct.md')
    expect(card).toContain(`\n${README_CUT_TEXT}\n`)
    expect(card).not.toContain('| half a ro')
    const plain = text(buildEmit(fixtureData(), OPTS), 'm/@fastwhitecat/integration-ksef-direct.md')
    expect(plain).not.toContain(README_CUT_TEXT)
  })

  test('the module page shows the line under the README box', () => {
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'm', '[...path].astro'), 'utf8')
    expect(page).toContain('{readmeCut && <p class="readme__cut">{README_CUT_TEXT}</p>}')
    expect(page).toContain('readmeWholeLines(')
  })
})
