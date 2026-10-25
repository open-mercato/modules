// `yarn om describe-local` (spec 5.4): without network, a local package directory or .tgz gives the gate result
// and a proposed descriptor at the right path, Prettier formatted, with TODOs that keep it from passing validate
// until the author fills them; a guessed category comes from package keywords.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as prettier from 'prettier'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { main } from '../../lib/cli.ts'
import { loadCatalog, type Catalog } from '../../lib/validate/catalog.ts'
import { describeLocal, guessCategory } from '../../lib/validate/describe.ts'
import { moduleTarball, ROOT } from './helpers.ts'

const tmp = mkdtempSync(join(tmpdir(), 'om-describe-'))
let catalog: Catalog
beforeAll(async () => {
  catalog = await loadCatalog(ROOT, null)
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function packageDir(name: string, o: { dist?: boolean; pkg?: Record<string, unknown> } = {}): string {
  const dir = join(tmp, name)
  mkdirSync(join(dir, 'src', 'modules', 'loyalty'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: '@acme-labs/om-loyalty',
      version: '0.3.0',
      license: 'MIT',
      description: 'Loyalty points for customers, earned on paid orders and spent at checkout.',
      keywords: ['open-mercato-module', 'marketing', 'loyalty', 'Points!'],
      repository: { type: 'git', url: 'git+https://github.com/acme-labs/om-loyalty.git' },
      peerDependencies: { '@open-mercato/core': '^0.9.0' },
      ...o.pkg,
    }),
  )
  writeFileSync(join(dir, 'src', 'modules', 'loyalty', 'index.ts'), `export const metadata = { title: 'Loyalty' }\n`)
  if (o.dist !== false) {
    mkdirSync(join(dir, 'dist', 'modules', 'loyalty'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'modules', 'loyalty', 'index.js'), 'export {}\n')
  }
  return dir
}

describe('describe-local', () => {
  it('proposes a descriptor for a module directory; the gate passes', async () => {
    const r = await describeLocal(packageDir('ok'), catalog)
    expect(r.locator).toBe('npm:@acme-labs/om-loyalty')
    expect(r.file).toBe('modules/@acme-labs/om-loyalty.yml')
    expect(r.gate).toEqual({ pass: true, text: 'passes: src/modules and dist/modules pair found' })
    expect(r.report.map((x) => `${x.check}: ${x.result}`)).toEqual([
      'Kind: module (loyalty), installable',
      'License: MIT (package.json)',
      expect.stringMatching(/^Anatomy: 0 tables · 0 routes \(0 public\)/),
      'Built for: ^0.9.0 (caret-0x, covers 0.9.0)',
    ])
    const d = parse(r.yaml) as Record<string, unknown>
    expect(d).toEqual({
      npm: '@acme-labs/om-loyalty',
      github: 'acme-labs/om-loyalty',
      category: 'marketing-loyalty',
      tags: ['marketing', 'loyalty'],
      summary: 'Loyalty points for customers, earned on paid orders and spent at checkout.',
      whenToUse: 'Use when TODO',
    })
    expect(r.yaml).toContain('# TODO 40-240 characters')
    expect(r.problems).toEqual(['whenToUse: start with "Use when ", min 40 characters'])
    const options = (await prettier.resolveConfig(join(ROOT, r.file))) ?? {}
    expect(await prettier.check(r.yaml, { ...options, parser: 'yaml' })).toBe(true)
  })

  it('reads a .tgz the same way; a module without dist fails the gate', async () => {
    const tgz = join(tmp, 'p.tgz')
    writeFileSync(tgz, moduleTarball({ name: '@acme-labs/om-bins', version: '1.0.0', id: 'bins', dist: false }))
    const r = await describeLocal(tgz, catalog)
    expect(r.locator).toBe('npm:@acme-labs/om-bins')
    expect(r.gate).toEqual({ pass: false, text: 'fails: No dist/modules/bins/ in the tarball (not built).' })
    expect(parse(r.yaml)).toMatchObject({ category: 'TODO', summary: 'TODO' })
    expect(r.problems).toEqual([
      expect.stringMatching(/^category: must be one of crm-sales, /),
      'summary: min 20 characters',
      'whenToUse: start with "Use when ", min 40 characters',
    ])
  })

  it('guesses a category from IDs and aliases only', () => {
    expect(guessCategory(['foo', 'payments'], catalog.categoryAliases)).toBe('payments-finance')
    expect(guessCategory(['devtools'], catalog.categoryAliases)).toBe('devtools')
    expect(guessCategory(['foo'], catalog.categoryAliases)).toBeNull()
  })

  it('the command exits 0 on a passing gate, 1 on a failing one, 2 on bad input', async () => {
    const log = console.log
    const err = console.error
    const out: string[] = []
    console.log = (s: string) => out.push(String(s))
    console.error = () => {}
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string) => (out.push(s), true)) as typeof process.stdout.write
    try {
      expect(await main(['describe-local', packageDir('cmd')])).toBe(0)
      expect(out.join('\n')).toContain('Proposed modules/@acme-labs/om-loyalty.yml:')
      expect(await main(['describe-local', packageDir('nodist', { dist: false })])).toBe(1)
      expect(await main(['describe-local', join(tmp, 'missing')])).toBe(2)
      expect(await main(['describe-local'])).toBe(2)
    } finally {
      console.log = log
      console.error = err
      process.stdout.write = write
    }
  })
})
