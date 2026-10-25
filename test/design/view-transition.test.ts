// The list-to-module flight (spec 7.3) needs the new page to opt in at its first style pass (review r4: with the rule
// only in the external stylesheet about a third of the flights from a query were dropped as `opt-in disabled`).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ROOT } from '../emit/helpers.ts'

describe('cross-document view transition opt-in', () => {
  test('the layout prints @view-transition inline in the head, before any stylesheet link', () => {
    const base = readFileSync(join(ROOT, 'site', 'src', 'layouts', 'Base.astro'), 'utf8')
    const head = base.slice(0, base.indexOf('</head>'))
    expect(head).toMatch(/<style is:inline set:html=\{`\$\{fontFaceCss\(\)\}@view-transition\{navigation:auto\}`\}>/)
  })
})
