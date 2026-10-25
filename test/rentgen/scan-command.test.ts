// `yarn om scan` (spec 5.4) and the engine contract (spec 3.4: dynamic import, no static import).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import scan, { factsFile, readQueue } from '../../lib/commands/scan.ts'
import type { CommandContext } from '../../lib/cli.ts'
import { ENGINE_SPEC, loadEngine, parseTarget } from '../../lib/rentgen/extract.ts'
import { removeDir, tempDir } from '../../lib/rentgen/unpack.ts'
import { BuiltinData, Facts } from '../../lib/schema/data/facts.ts'
import { makeTarball, modulePackage, ROOT } from './helpers.ts'

const tmp = tempDir('om-scan-test-')
afterAll(() => removeDir(tmp))

const run = async (args: string[], root = ROOT, flags: Partial<CommandContext['flags']> = {}): Promise<number> => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    return await scan({
      args,
      root,
      flags: { data: join(tmp, 'data'), out: join(tmp, 'out'), offline: false, json: false, ...flags },
    })
  } finally {
    log.mockRestore()
    err.mockRestore()
    warn.mockRestore()
  }
}

describe('engine (spec 3.4)', () => {
  it('loads extractModuleFacts of the pinned CLI dynamically', async () => {
    const e = await loadEngine()
    expect(e.engine).toBe('@open-mercato/cli@0.9.0 extractModuleFacts')
    expect(typeof e.mod.extractModuleFacts).toBe('function')
    expect(ENGINE_SPEC).toBe('@open-mercato/cli/lib/generators/module-facts')
  })

  it('never imports @open-mercato/cli statically in lib/ or test/', () => {
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name !== 'node_modules' && e.name !== 'golden' && e.name !== 'fixtures') walk(p)
        } else if (/\.ts$/.test(e.name)) {
          const text = readFileSync(p, 'utf8')
          if (/(from\s+|import\s*\(\s*)['"]@open-mercato\/cli/.test(text)) offenders.push(p.slice(ROOT.length + 1))
        }
      }
    }
    walk(join(ROOT, 'lib'))
    walk(join(ROOT, 'test'))
    expect(offenders).toEqual([])
  })
})

describe('targets and queue', () => {
  it('parses locator@version', () => {
    expect(parseTarget('npm:@a/b@1.2.3')).toEqual({ locator: 'npm:@a/b', version: '1.2.3' })
    expect(parseTarget('npm:@a/b')).toEqual({ locator: 'npm:@a/b' })
    expect(parseTarget('npm:b@0.1.0-canary.1')).toEqual({ locator: 'npm:b', version: '0.1.0-canary.1' })
    expect(parseTarget('github:Owner/repo@v1.0.0')).toEqual({ locator: 'github:Owner/repo', version: 'v1.0.0' })
  })

  it('reads the queue formats of watch', () => {
    const f = join(tmp, 'q.json')
    writeFileSync(
      f,
      JSON.stringify(['npm:@a/b@1.0.0', { locator: 'npm:c', version: '2.0.0' }, { locator: 'github:o/r' }]),
    )
    expect(readQueue(f)).toEqual([
      { locator: 'npm:@a/b', version: '1.0.0' },
      { locator: 'npm:c', version: '2.0.0' },
      { locator: 'github:o/r', version: undefined },
    ])
    writeFileSync(f, JSON.stringify({ queue: ['npm:d@3.0.0'] }))
    expect(readQueue(f)).toEqual([{ locator: 'npm:d', version: '3.0.0' }])
  })

  it('takes the tag of a GitHub item of the watch queue (gitRef), not the bare version', () => {
    const f = join(tmp, 'queue-gh.json')
    writeFileSync(
      f,
      JSON.stringify({
        items: [
          { locator: 'github:o/r', version: '0.4.0', source: 'github-archive', gitRef: 'v0.4.0' },
          { locator: 'npm:@a/b', version: '1.0.0', source: 'npm-tarball', gitRef: null },
        ],
      }),
    )
    expect(readQueue(f)).toEqual([
      { locator: 'github:o/r', version: 'v0.4.0' },
      { locator: 'npm:@a/b', version: '1.0.0' },
    ])
  })
})

describe('scan command', () => {
  it('scan --dir writes facts/<locpath>/<version>.json', async () => {
    const tgz = join(tmp, 'pkg.tgz')
    writeFileSync(tgz, makeTarball(modulePackage({ name: '@x/local', version: '2.1.0', id: 'local_mod' })))
    expect(await run(['--dir', tgz, '--locator', 'npm:@x/local', '--to', join(tmp, 'd1')])).toBe(0)
    const f = Facts.parse(JSON.parse(readFileSync(factsFile(join(tmp, 'd1'), 'npm:@x/local', '2.1.0'), 'utf8')))
    expect(f.modules.map((m) => m.id)).toEqual(['local_mod'])
  })

  it('keeps an existing facts file for the same version and engine (no network)', async () => {
    const tgz = join(tmp, 'pkg2.tgz')
    writeFileSync(tgz, makeTarball(modulePackage({ name: '@x/cached', version: '1.0.0', id: 'cached_mod' })))
    expect(await run(['--dir', tgz, '--locator', 'npm:@x/cached', '--to', join(tmp, 'd2')])).toBe(0)
    const report = join(tmp, 'report.json')
    expect(await run(['npm:@x/cached@1.0.0', '--to', join(tmp, 'd2'), '--report', report])).toBe(0)
    const r = JSON.parse(readFileSync(report, 'utf8')) as {
      summary: { cached: number; scanned: number }
      rows: { status: string }[]
    }
    expect(r.summary).toMatchObject({ cached: 1, scanned: 0 })
  })

  it('scan --builtin 0.9.0 --offline writes 46 core modules and warns on the category map', async () => {
    const root = join(tmp, 'repo')
    mkdirSync(join(root, 'policy'), { recursive: true })
    writeFileSync(
      join(root, 'policy', 'builtin-categories.yml'),
      'currencies: payments-finance\necommerce: orders-checkout\n',
    )
    expect(await run(['--builtin', '0.9.0', '--to', join(tmp, 'd3')], root, { offline: true })).toBe(0)
    const b = BuiltinData.parse(JSON.parse(readFileSync(join(tmp, 'd3', 'builtin', '0.9.0.json'), 'utf8')))
    expect(b.modules).toHaveLength(46)
    expect(b.diagnostics).toContain(
      'policy/builtin-categories.yml lists ecommerce, which is not a core module of 0.9.0.',
    )
    expect(b.diagnostics).toContain(
      'Core module wms (0.9.0) is not in policy/builtin-categories.yml: placed in operations.',
    )
  })

  it('rejects bad input with exit code 1', async () => {
    expect(await run([])).toBe(1)
    expect(await run(['--bogus'])).toBe(1)
    expect(await run(['--builtin', 'latest'])).toBe(1)
    expect(await run(['npm:@x/a@1.0.0'], ROOT, { offline: true })).toBe(2)
  })
})
