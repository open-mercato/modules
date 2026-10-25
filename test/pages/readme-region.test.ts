// The README box of a module page scrolls on its own (max-height 640 px), so a keyboard must reach it (review r4: axe
// scrollable-region-focusable, serious, once the Readme tab was open, in both themes and both data states).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ROOT } from '../emit/helpers.ts'

describe('module page README', () => {
  test('the scrolling README is a focusable, named region', () => {
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'm', '[...path].astro'), 'utf8')
    const box = /<div class="readme__text"[^>]*>/.exec(page)?.[0] ?? ''
    expect(box).toContain('tabindex="0"')
    expect(box).toContain('role="region"')
    expect(box).toContain(`aria-label="Author's README"`)
    const css = readFileSync(join(ROOT, 'site', 'src', 'pages', 'm', '_module.css'), 'utf8')
    expect(/\.readme__text \{[^}]*overflow: auto/.test(css)).toBe(true)
  })
})
