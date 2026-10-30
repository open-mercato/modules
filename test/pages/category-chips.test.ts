// Category pages (live review of 30 Oct, item 11). /c/crm-sales said `1 module for crm & sales`: the title was
// lowercased whole, acronyms too. /c/devtools opens with tools and libraries shown, so its `All` chip counted 45 while
// the home page it led to showed 40: a chip now carries the tools switch to its page (`?tools=1` when the switch is
// on and that page opens with it off), so the number on a chip is the number its page shows.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { categoryInSentence } from '../../site/src/pages/c/_data.ts'
import { toolsDefaultOf, toolsQuery } from '../../site/src/lib/tools-query.ts'
import { ROOT } from '../emit/helpers.ts'

const read = (...p: string[]): string => readFileSync(join(ROOT, 'site', 'src', ...p), 'utf8')

describe('a category title inside a sentence', () => {
  it('lowercases words and keeps acronyms', () => {
    expect(categoryInSentence('CRM & Sales')).toBe('CRM & sales')
    expect(categoryInSentence('AI & Automation')).toBe('AI & automation')
    expect(categoryInSentence('Payments, Billing & Invoicing')).toBe('payments, billing & invoicing')
    expect(categoryInSentence('Developer Tools')).toBe('developer tools')
  })

  it('the category page uses it for the lead and the search field', () => {
    const page = read('pages', 'c', '[category].astro')
    expect(page).toContain('categoryInSentence(cat.title)')
    expect(page).not.toContain('cat.title.toLowerCase()')
  })
})

describe('the tools switch on category chips', () => {
  it('a page opens with tools shown only when its category has tools and no module', () => {
    expect(toolsDefaultOf({ modules: 0, all: 5 })).toBe(true)
    expect(toolsDefaultOf({ modules: 4, all: 5 })).toBe(false)
    expect(toolsDefaultOf({ modules: 0, all: 0 })).toBe(false)
  })

  it('the query turns the switch on where the target page opens with it off, and never off', () => {
    expect(toolsQuery(false, false)).toBe('')
    expect(toolsQuery(true, true)).toBe('')
    expect(toolsQuery(false, true)).toBe('?tools=1')
    // a tools-only category with the switch off: its chip is hidden, and its page without tools would be empty
    expect(toolsQuery(true, false)).toBe('')
  })

  it('the browser renders the chips with it and the script keeps them in step with the switch', () => {
    const b = read('components', 'catalog', 'ModuleBrowser.astro')
    expect(b).toContain("href={href('/') + toolsQuery(false, toolsOn)}")
    expect(b).toContain('href={href(categoryPage(c.id)) + toolsQuery(toolsDefaultOf(c), toolsOn)}')
    expect(b).toMatch(
      /a\.href = \(a\.dataset\.chipBase \?\? ''\) \+ toolsQuery\(a\.dataset\.chipTools === '1', state\.tools\)/,
    )
  })
})
