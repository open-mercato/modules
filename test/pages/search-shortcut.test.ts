// The `/` shortcut of Base.astro focuses the search field of the home and category pages (audit R10, 28 Oct: the
// redesigned SearchBox lost `data-search-input`, so `/` did nothing). The listener of the layout runs here against
// the inputs the page renders: every component it imports, read from the source, with no build and no browser.
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ROOT } from '../emit/helpers.ts'

const SITE = join(ROOT, 'site', 'src')
const PAGES = ['pages/index.astro', 'pages/c/[category].astro']
const read = (f: string) => readFileSync(f, 'utf8')

/** The page and every .astro or .tsx component it imports, transitively (type imports aside). */
function componentTree(page: string): string[] {
  const seen = new Set<string>()
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const m of read(file).matchAll(/^import\s+(?!type\b)[^'"]*?from\s+'([^']+\.(?:astro|tsx))'/gm))
      walk(resolve(dirname(file), m[1]!))
  }
  walk(join(SITE, page))
  return [...seen].map((f) => relative(SITE, f))
}

/** Attribute names of the `<input>` tags of an .astro file that carry `data-search-input`. */
function searchInputs(file: string): { id: string | null; attrs: Set<string> }[] {
  return [...read(join(SITE, file)).matchAll(/<input\b([^>]*)\/?>/g)]
    .map((m) => m[1]!)
    .filter((a) => /\sdata-search-input(?=[\s/=]|$)/.test(a))
    .map((a) => ({
      id: /\sid="([^"]+)"/.exec(a)?.[1] ?? null,
      attrs: new Set([...a.matchAll(/\s([a-z][a-z-]*)(?==|\s|$)/g)].map((x) => x[1]!)),
    }))
}

/** The keydown listener of Base.astro, as the browser runs it (types stripped). */
function shortcutListener(): string {
  const base = read(join(SITE, 'layouts', 'Base.astro'))
  const start = base.indexOf("document.addEventListener('keydown'")
  expect(start).toBeGreaterThan(-1)
  let depth = 0
  let end = start
  for (let i = start; i < base.length; i++) {
    if (base[i] === '(') depth++
    else if (base[i] === ')' && --depth === 0) {
      end = i + 1
      break
    }
  }
  return stripTypeScriptTypes(base.slice(start, end))
}

/** Presses `/` on the page body with these inputs rendered; returns the id of the focused element. */
function pressSlash(inputs: { id: string | null; attrs: Set<string> }[]): {
  focused: string | null
  prevented: boolean
} {
  let focused: string | null = null
  let listener: ((ev: unknown) => void) | null = null
  const els = inputs.map((x) => ({ ...x, focus: () => (focused = x.id) }))
  const document = {
    addEventListener: (type: string, fn: (ev: unknown) => void) => {
      if (type === 'keydown') listener = fn
    },
    querySelector: (sel: string) => {
      const attr = /^\[([a-z-]+)\]$/.exec(sel)?.[1]
      const id = /^#([\w-]+)$/.exec(sel)?.[1]
      if (!attr && !id) throw new Error(`selector not modelled: ${sel}`)
      return els.find((e) => (attr ? e.attrs.has(attr) : e.id === id)) ?? null
    },
  }
  new Function('document', shortcutListener())(document)
  let prevented = false
  listener!({
    key: '/',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: { tagName: 'BODY', isContentEditable: false },
    preventDefault: () => (prevented = true),
  })
  return { focused, prevented }
}

describe('the / shortcut (audit R10)', () => {
  for (const page of PAGES)
    test(`${page}: the only field the shortcut can reach is #mods-q, and / focuses it`, () => {
      const tree = componentTree(page)
      expect(tree).toContain('layouts/Base.astro')
      expect(tree).toContain('components/catalog/SearchBox.astro')
      const inputs = tree.filter((f) => f.endsWith('.astro')).flatMap(searchInputs)
      expect(inputs.map((i) => i.id)).toEqual(['mods-q'])
      // no island of the page carries the attribute either (AskBar and Registry do, on other pages)
      for (const f of tree.filter((x) => x.endsWith('.tsx')))
        expect(read(join(SITE, f)), f).not.toMatch(/\sdata-search-input\b/)
      expect(pressSlash(inputs)).toEqual({ focused: 'mods-q', prevented: true })
    })

  test('without a search field the shortcut leaves the key alone', () => {
    expect(pressSlash([])).toEqual({ focused: null, prevented: false })
  })
})
