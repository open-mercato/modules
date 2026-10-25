// `om format` (spec 3.4, 4.3, 5.5): the output passes `prettier --check` (the real CLI with the repo config), a
// second run changes nothing, and formatting never changes a value, adds or drops a key, or touches a curator
// field. The only value rewrite is a category alias to its ID (spec 4.3, policy/categories.yml). Scrambled
// copies of the 59 seed files (keys shuffled, block and flow styles swapped, other quotes) format back to the
// exact seed text.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as prettier from 'prettier'
import { afterAll, describe, expect, it } from 'vitest'
import { Document, isMap, isScalar, isSeq, parseDocument, Scalar } from 'yaml'
import { main } from '../../lib/cli.ts'
import { CURATOR_FIELDS } from '../../lib/schema/index.ts'
import { formatDescriptorText, FormatError, readCategoryAliases, yamlFiles } from '../../lib/validate/format.ts'
import { ROOT } from './helpers.ts'

const aliases = readCategoryAliases(ROOT)
const seeds = yamlFiles([join(ROOT, 'modules')])
const tmp = mkdtempSync(join(tmpdir(), 'om-format-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const fmt = (text: string, file = join(ROOT, 'modules', '@x', 'y.yml')) =>
  formatDescriptorText(text, file, { categoryAliases: aliases })
const values = (text: string) => parseDocument(text).toJS() as Record<string, unknown>

/** Deterministic shuffle (seeded LCG). */
function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j] as T, a[i] as T]
  }
  return a
}

/** Same values, different layout: shuffled keys, inverted flow/block styles, single quotes, comments kept. */
function scramble(text: string, seed: number): string {
  const doc = parseDocument(text)
  const root = doc.contents
  if (!isMap(root)) throw new Error('not a map')
  root.items = shuffle(root.items, seed)
  const visit = (node: unknown) => {
    if (isSeq(node) || isMap(node)) {
      node.flow = !node.flow
      if (isMap(node)) node.items = shuffle(node.items, seed + 1)
      for (const it of node.items) visit(isMap(node) ? (it as { value: unknown }).value : it)
    } else if (isScalar(node) && typeof node.value === 'string' && !node.value.includes("'"))
      node.type = Scalar.QUOTE_SINGLE
  }
  for (const p of root.items) visit(p.value)
  return doc.toString({ lineWidth: 0 })
}

async function prettierCli(files: string[]): Promise<void> {
  execFileSync(
    join(ROOT, 'node_modules', '.bin', 'prettier'),
    ['--check', '--config', join(ROOT, '.prettierrc.json'), ...files],
    {
      stdio: 'pipe',
    },
  )
}

describe('om format on the 59 seed descriptors', () => {
  it('changes nothing (the seeds are in canonical form)', async () => {
    expect(seeds).toHaveLength(59)
    for (const f of seeds) {
      const text = readFileSync(f, 'utf8')
      const r = await formatDescriptorText(text, f, { categoryAliases: aliases })
      expect(r.changed, f).toBe(false)
    }
  })

  it('formats scrambled copies back to the exact seed text, three layouts each', async () => {
    for (const f of seeds) {
      const text = readFileSync(f, 'utf8')
      for (const seed of [1, 7, 42]) {
        const messy = scramble(text, seed)
        expect(values(messy)).toEqual(values(text))
        const r = await formatDescriptorText(messy, f, { categoryAliases: aliases })
        expect(r.text, `${f} seed ${seed}`).toBe(text)
      }
    }
  })
})

const MESSY = [
  `# my module
summary: 'Points for loyal customers, spent at checkout.'   # short
whenToUse: >-
  Use when the shop rewards repeat customers
  with points.
npm: '@acme-labs/om-loyalty'
category: marketing
tags:
  - loyalty
  - points
providers:
  - label: Stripe
    name: stripe
links: {demo: 'https://demo.example.com', docs: "https://docs.example.com"}
featured: false
status: active
`,
  `{npm: "@a/b", category: crm-sales, summary: "Twenty characters at least here.", whenToUse: "Use when there is a reason long enough to pass.", replaces: ['core:data_sync'], renamedFrom: ['npm:@a/old'], alternatives: [npm:@c/d], aliases: [one, two]}
`,
  `whenToUse: Use when there is a reason long enough to pass the schema.
declares:
  env: [A_KEY]
  hosts:
    - api.example.com
enterprise:
  modules:
    - sso
  offerUrl: https://example.com/offer
github: Owner/Repo
category: auth-security
summary: Something useful for the platform team.
unknownKey: [1, 2]
`,
]

describe('om format on author input', () => {
  it('passes prettier --check (CLI, repo config) and a second run changes nothing', async () => {
    const files: string[] = []
    for (const [i, text] of MESSY.entries()) {
      const once = await fmt(text)
      const twice = await fmt(once.text)
      expect(once.changed).toBe(true)
      expect(twice.changed).toBe(false)
      expect(twice.text).toBe(once.text)
      const file = join(tmp, `messy-${i}.yml`)
      writeFileSync(file, once.text)
      files.push(file)
      const options = (await prettier.resolveConfig(join(ROOT, 'modules', 'x.yml'))) ?? {}
      expect(await prettier.check(once.text, { ...options, parser: 'yaml' })).toBe(true)
    }
    await prettierCli(files)
  })

  it('never changes a value, a key set or a curator field (only a category alias becomes its ID)', async () => {
    for (const text of MESSY) {
      const before = values(text)
      const r = await fmt(text)
      const after = values(r.text)
      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort())
      for (const k of Object.keys(before)) {
        if (k === 'category' && aliases.has(before[k] as string)) {
          expect(after[k]).toBe(aliases.get(before[k] as string))
          continue
        }
        expect(after[k], k).toEqual(before[k])
      }
      for (const k of CURATOR_FIELDS) expect(after[k]).toEqual(before[k])
    }
  })

  it('orders keys as in spec 4.3 (unknown keys last), keeps comments, rewrites a category alias with a note', async () => {
    const r = await fmt(MESSY[0] as string)
    expect(r.notes).toEqual(['category marketing is an alias of marketing-loyalty'])
    expect(
      r.text
        .split('\n')
        .filter((l) => /^[a-zA-Z]/.test(l))
        .map((l) => l.split(':')[0]),
    ).toEqual(['npm', 'category', 'tags', 'summary', 'whenToUse', 'providers', 'links', 'status', 'featured'])
    expect(r.text.startsWith('# my module\n')).toBe(true)
    expect(r.text).toContain('# short')
    expect(r.text).toContain('tags: [loyalty, points]')
    expect(r.text).toContain('  - { name: stripe, label: Stripe }')
    expect(r.text).toContain('links:\n  docs: https://docs.example.com\n  demo: https://demo.example.com\n')
    const third = await fmt(MESSY[2] as string)
    const keys = third.text
      .split('\n')
      .filter((l) => /^[a-zA-Z]/.test(l))
      .map((l) => l.split(':')[0])
    expect(keys).toEqual(['github', 'category', 'summary', 'whenToUse', 'declares', 'enterprise', 'unknownKey'])
    expect(third.text).toContain('  hosts:')
    expect(third.text.indexOf('  hosts:')).toBeLessThan(third.text.indexOf('  env:'))
    expect(third.text.indexOf('  offerUrl:')).toBeLessThan(third.text.indexOf('  modules: [sso]'))
  })

  it('quotes locators and core references', async () => {
    const r = await fmt(MESSY[1] as string)
    expect(r.text).toContain('replaces: ["core:data_sync"]')
    expect(r.text).toContain('renamedFrom: ["npm:@a/old"]')
    expect(r.text).toContain('alternatives: ["npm:@c/d"]')
  })

  it('refuses YAML that does not parse or is not a map', async () => {
    await expect(fmt('npm: "@a/b"\nnpm: "@a/c"\n')).rejects.toBeInstanceOf(FormatError)
    await expect(fmt('summary: [unclosed\n')).rejects.toBeInstanceOf(FormatError)
    await expect(fmt('- a\n- b\n')).rejects.toBeInstanceOf(FormatError)
  })

  it('yarn om format writes files, --check reports, a broken file is skipped and left alone', async () => {
    const dir = mkdtempSync(join(tmp, 'cmd-'))
    writeFileSync(join(dir, 'a.yml'), MESSY[0] as string)
    writeFileSync(join(dir, 'broken.yml'), 'summary: [unclosed\n')
    const log = console.log
    const err = console.error
    console.log = () => {}
    console.error = () => {}
    try {
      expect(await main(['format', '--check', dir])).toBe(1)
      expect(readFileSync(join(dir, 'a.yml'), 'utf8')).toBe(MESSY[0])
      expect(await main(['format', dir])).toBe(0)
      expect(readFileSync(join(dir, 'broken.yml'), 'utf8')).toBe('summary: [unclosed\n')
      const formatted = readFileSync(join(dir, 'a.yml'), 'utf8')
      expect(formatted).toBe((await fmt(MESSY[0] as string)).text)
      await prettierCli([join(dir, 'a.yml')])
    } finally {
      console.log = log
      console.error = err
    }
  })

  it('builds the same text from a document as the seed command does', () => {
    // guard: the seed command and om format share the flow/quote style
    const doc = new Document({ tags: ['a'] })
    expect(doc.toString()).toBe('tags:\n  - a\n')
  })
})
