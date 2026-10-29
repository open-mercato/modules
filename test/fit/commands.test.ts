import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fit, { splitModuleArg } from '../../lib/commands/fit.ts'
import radar from '../../lib/commands/radar.ts'
import { pendingFitLines } from '../../lib/sources/watch.ts'
import { readLines } from '../../lib/fit/data.ts'
import { COMMANDS, commandFile } from '../../lib/cli.ts'
import type { CommandContext } from '../../lib/cli.ts'
import { FitResult, Radar, Surface } from '../../lib/schema/index.ts'
import { DATA_FIXTURE, FIT_FIXTURES, ROOT, fakeShared, tempDir, writeTree } from './helpers.ts'

const ctx = (args: string[], data: string, out: string, offline = true): CommandContext => ({
  args,
  flags: { data, out, offline, json: false },
  root: ROOT,
})
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'))

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

/** Data dir with one module (facts of consents, imports rewritten to the fake shared package) and two lines. */
function fakeSetup(): { data: string; out: string; cache: string } {
  const root = tempDir()
  const data = join(root, 'data')
  const out = join(root, 'out')
  const cache = join(root, 'cache')
  writeTree(data, {
    'lines.json': JSON.stringify({
      resolvedAt: '2026-10-23T00:00:00Z',
      coreLatest: '1.0.0',
      keepaliveAt: null,
      lines: [
        {
          key: '1.0',
          version: '1.0.0',
          source: 'latest',
          createApp: 'create-mercato-app@1.0.0',
          cadence: 'nightly',
          preapproved: ['@open-mercato/*'],
        },
        {
          key: 'next',
          version: '1.1.0',
          source: 'develop',
          createApp: 'create-mercato-app@1.1.0',
          cadence: 'nightly',
          preapproved: ['@open-mercato/*'],
        },
      ],
    }),
  })
  const facts = readJson(join(DATA_FIXTURE, 'facts', '@piotrkarwatka', 'marketing-consents', '0.1.0.json')) as {
    omPeers: Record<string, string>
    dependencies: Record<string, string>
    modules: { omImports: unknown }[]
  }
  facts.omPeers = { '@open-mercato/core': '1.0.0' }
  facts.dependencies = { '@tanstack/react-table': '9.2.6' }
  for (const m of facts.modules)
    m.omImports = {
      '@open-mercato/shared': { 'lib/di/container': ['AppContainer', 'createRequestContainer'], 'lib/gone': ['x'] },
    }
  writeTree(data, { 'facts/@piotrkarwatka/marketing-consents/0.1.0.json': JSON.stringify(facts) })
  writeTree(join(cache, 'pkgs', '@open-mercato__shared@1.0.0', 'package'), fakeShared('A'))
  writeTree(join(cache, 'pkgs', '@open-mercato__shared@1.1.0', 'package'), fakeShared('B'))
  for (const v of ['1.0.0', '1.1.0']) {
    writeFileSync(join(cache, 'pkgs', `@open-mercato__shared@${v}`, '.complete'), '')
    const t = join(cache, 'templates', `create-mercato-app@${v}`)
    cpSync(join(FIT_FIXTURES, 'create-mercato-app-0.9.0'), join(t, 'package', 'template'), { recursive: true })
    writeFileSync(join(t, '.complete'), '')
  }
  mkdirSync(join(cache, 'packuments'), { recursive: true })
  cpSync(
    join(FIT_FIXTURES, 'packuments', '@tanstack__react-table.json'),
    join(cache, 'packuments', '@tanstack__react-table.json'),
  )
  return { data, out, cache }
}

describe('yarn om fit', () => {
  it('writes .data/fit/<om>.json per line with drift against latest and host duplicates', async () => {
    const { data, out, cache } = fakeSetup()
    writeTree(data, {
      'fit/1.0.0.json': JSON.stringify({
        om: '1.0.0',
        computedAt: '2026-10-01T00:00:00Z',
        cells: {
          'npm:@other/kept@1.0.0': {
            status: 'ok',
            checked: 1,
            missing: [],
            drift: [],
            declared: { range: null, kind: 'missing', satisfied: true },
            hostDuplicates: [],
          },
        },
      }),
    })
    const code = await fit(ctx(['--cache', cache, '--as-of', '2026-10-22T12:00:00Z'], data, out))
    expect(code).toBe(0)
    const key = 'npm:@piotrkarwatka/marketing-consents@0.1.0'
    const latest = FitResult.parse(readJson(join(data, 'fit', '1.0.0.json')))
    expect(Object.keys(latest.cells)).toEqual(['npm:@other/kept@1.0.0', key])
    expect(latest.cells[key]).toMatchObject({
      status: 'ok',
      checked: 3,
      drift: [],
      declared: { range: '1.0.0', kind: 'exact-pin', satisfied: true },
      hostDuplicates: [{ name: '@tanstack/react-table', moduleRange: '9.2.6', appVersion: '9.3.1' }],
    })
    const next = FitResult.parse(readJson(join(data, 'fit', '1.1.0.json')))
    expect(next.cells[key]).toMatchObject({
      status: 'no-fit',
      checked: 2,
      drift: ['@open-mercato/shared/lib/di/container#createRequestContainer'],
      declared: { satisfied: false },
    })
    expect(next.cells[key]?.missing.map((m) => `${m.subpath}#${m.symbol}`)).toEqual([
      'lib/di/container#AppContainer',
      'lib/gone#null',
    ])

    expect(radar(ctx([], data, out))).toBe(0)
    const r = Radar.parse(readJson(join(data, 'radar', 'next.json')))
    expect(r).toMatchObject({ next: '1.1.0', base: '1.0.0' })
    expect(r.staticBreaks).toEqual([
      {
        locator: 'npm:@piotrkarwatka/marketing-consents',
        missing: ['@open-mercato/shared/lib/di/container#AppContainer', '@open-mercato/shared/lib/gone'],
      },
    ])
    expect(r.changedApis.map((c) => `${c.change} ${c.symbol}`)).toEqual([
      'removed @open-mercato/shared/lib/di/container#AppContainer',
      'signature @open-mercato/shared/lib/di/container#createRequestContainer',
      'removed @open-mercato/shared/lib/gone',
    ])
    expect(r.summary).toBe(
      '1 of 1 modules outside the @open-mercato scope use APIs that changed since 1.0.0. 1 break statically. Receipts on next: 0 verified, 0 broken.',
    )
    const s = Surface.parse(readJson(join(out, 'surface.json')))
    expect(s.externalPackages).toBe(1)
  })

  it('a line whose tarballs cannot be read is skipped, the other lines are still written (audit C12)', async () => {
    const { data, out, cache } = fakeSetup()
    rmSync(join(cache, 'pkgs', '@open-mercato__shared@1.1.0'), { recursive: true })
    expect(await fit(ctx(['--cache', cache, '--as-of', '2026-10-22T12:00:00Z'], data, out))).toBe(0)
    expect(existsSync(join(data, 'fit', '1.0.0.json'))).toBe(true)
    expect(existsSync(join(data, 'fit', '1.1.0.json'))).toBe(false)
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toMatch(/fit 1\.1\.0: skipped/)
  })

  it('a skipped line stays pending for the next watch run, which computes it once the tarballs are served', async () => {
    const { data, out, cache } = fakeSetup()
    const shared = join(cache, 'pkgs', '@open-mercato__shared@1.1.0')
    const kept = join(out, 'kept-shared')
    cpSync(shared, kept, { recursive: true })
    rmSync(shared, { recursive: true })
    const lines = () => readLines(data)?.lines ?? []
    expect(pendingFitLines(data, lines())).toEqual(['1.0', 'next'])
    expect(await fit(ctx(['--cache', cache, '--as-of', '2026-10-22T12:00:00Z'], data, out))).toBe(0)
    // nothing else changed: the next watch still queues the skipped line
    expect(pendingFitLines(data, lines())).toEqual(['next'])
    cpSync(kept, shared, { recursive: true })
    expect(await fit(ctx(['--cache', cache, '--as-of', '2026-10-22T12:00:00Z'], data, out))).toBe(0)
    const next = FitResult.parse(readJson(join(data, 'fit', '1.1.0.json')))
    expect(Object.keys(next.cells)).toEqual(['npm:@piotrkarwatka/marketing-consents@0.1.0'])
    expect(pendingFitLines(data, lines())).toEqual([])
  })

  it('filters with --modules and --om', async () => {
    const { data, out, cache } = fakeSetup()
    expect(await fit(ctx(['--cache', cache, '--om', '1.1.0', '--modules', 'npm:@x/none'], data, out))).toBe(1)
    expect(
      await fit(
        ctx(['--cache', cache, '--om', '1.1.0', '--modules', 'npm:@piotrkarwatka/marketing-consents@0.1.0'], data, out),
      ),
    ).toBe(0)
    expect(existsSync(join(data, 'fit', '1.1.0.json'))).toBe(true)
    expect(existsSync(join(data, 'fit', '1.0.0.json'))).toBe(false)
    expect(splitModuleArg('npm:@x/y@1.2.3-rc.1')).toEqual(['npm:@x/y', '1.2.3-rc.1'])
    expect(splitModuleArg('github:a/b')).toEqual(['github:a/b', null])
  })

  it('exits 2 without versions, with bad arguments or without cached tarballs offline', async () => {
    const empty = tempDir()
    expect(await fit(ctx([], empty, empty))).toBe(2)
    expect(await fit(ctx(['--bogus'], empty, empty))).toBe(2)
    expect(await fit(ctx(['--om', 'latest'], empty, empty))).toBe(2)
    const { data, out } = fakeSetup()
    expect(await fit(ctx(['--cache', join(out, 'none')], data, out))).toBe(2)
  })
})

describe('yarn om radar on the data fixture', () => {
  it('builds a valid radar from fit, facts and receipts', () => {
    const data = join(tempDir(), 'data')
    cpSync(DATA_FIXTURE, data, { recursive: true })
    const out = join(data, '..', 'out')
    expect(radar(ctx([], data, out))).toBe(0)
    const r = Radar.parse(readJson(join(data, 'radar', 'next.json')))
    expect(r.base).toBe('0.9.0')
    expect(r.next).toBe('0.10.1-develop.7583.1.0c886d0a14')
    expect(r.summary).toBe(
      '2 of 4 modules outside the @open-mercato scope use APIs that changed since 0.9.0. 0 break statically. Receipts on next: 1 verified, 0 broken.',
    )
    expect(r.changedApis.map((c) => c.symbol)).toEqual([
      '@open-mercato/shared/lib/commands#CommandHandler',
      '@open-mercato/shared/lib/commands#CommandRuntimeContext',
      '@open-mercato/shared/modules/registry#ModuleCli',
    ])
    expect(r.loadBearing[0]?.of).toBe(4)
    expect(Surface.parse(readJson(join(out, 'surface.json'))).externalPackages).toBe(4)
  })
  it('exits 2 without fit on next', () => {
    const data = tempDir()
    writeTree(data, { 'lines.json': readFileSync(join(DATA_FIXTURE, 'lines.json'), 'utf8') })
    expect(radar(ctx([], data, data))).toBe(2)
  })
})

describe('cli', () => {
  it('lists fit and radar as built', () => {
    expect(COMMANDS.filter((c) => c.owner === 'WP06').map((c) => c.name)).toEqual(['fit', 'radar'])
    expect(commandFile('fit')).not.toBeNull()
    expect(commandFile('radar')).not.toBeNull()
  })
})
