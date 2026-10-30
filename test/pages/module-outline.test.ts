// The heading outline of a module page (live review of 30 Oct, item 12): `Install` was an h2 twice (the card's
// sr-only heading and the install box inside `Install per version and agent rules`), and the receipt drawer gave the
// module title a second h2 inside `Compatibility per Open Mercato version`. Both boxes live inside a section with its
// own h2, so their headings are h3. The README headings stay nested under the one `Readme` h2 (h1 of the README is h3).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from '../emit/helpers.ts'

const read = (...p: string[]): string => readFileSync(join(ROOT, 'site', 'src', ...p), 'utf8')
const page = read('pages', 'm', '[...path].astro')

describe('module page outline', () => {
  it('the install box heading is an h3 under its section h2', () => {
    const box = read('islands', 'InstallBox.tsx')
    expect(box).toMatch(/<h3 class="ib__h" id="ib-h">\s*Install\s*<\/h3>/)
    expect(box).not.toMatch(/<h2\b/)
    const at = page.indexOf('<InstallBox')
    expect(page.lastIndexOf('<h2 class="tech__h" id="tech-install-h">', at)).toBeGreaterThan(-1)
  })

  it('the receipt drawer names the module in an h3, never a second h2 with the page title', () => {
    const drawer = read('islands', 'ReceiptDrawer.tsx')
    expect(drawer).toMatch(/<h3 class="t-h3" id="rdrawer-h">/)
    expect(drawer).not.toMatch(/<h2\b/)
  })

  it('one h2 says Install: the Install card', () => {
    const sources = [page, read('components', 'module', 'InstallCard.astro'), read('islands', 'InstallBox.tsx')]
    const h2 = sources.flatMap((s) => [...s.matchAll(/<h2\b[^>]*>\s*Install\s*<\/h2>/g)].map((m) => m[0]))
    expect(h2).toEqual([`<h2 class={button ? 'sr-only' : 'inst__h'} id="install-h">Install</h2>`])
  })
})
