import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkIntegrity,
  createStore,
  ensureOmPackages,
  ensurePackage,
  getPackument,
  isPreapproved,
  parseAgeGate,
  parseTemplate,
  resolveAppVersion,
  safeEntryPath,
  StoreError,
  templateDeps,
  templateDepsForLine,
  unpack,
} from '../../lib/fit/om-tarballs.ts'
import type { Packument } from '../../lib/fit/om-tarballs.ts'
import type { Lines } from '../../lib/schema/index.ts'
import { hostDuplicates } from '../../lib/fit/static.ts'
import { FIT_FIXTURES, makeTgz, tempDir } from './helpers.ts'

const readFixture = (rel: string): string => readFileSync(join(FIT_FIXTURES, rel), 'utf8')
const packument = (name: string): Packument =>
  JSON.parse(readFixture(`packuments/${name.replace('/', '__')}.json`)) as Packument
const TEMPLATE_090 = parseTemplate(
  '0.9.0',
  readFixture('create-mercato-app-0.9.0/package.json.template'),
  readFixture('create-mercato-app-0.9.0/.yarnrc.yml.template'),
)
const SPIKE_DAY = new Date('2026-10-22T12:00:00Z')

describe('create-mercato-app template', () => {
  it('reads dependencies, resolutions, age gate and preapproved scopes of 0.9.0', () => {
    expect(TEMPLATE_090.createApp).toBe('create-mercato-app@0.9.0')
    expect(TEMPLATE_090.dependencies['@tanstack/react-table']).toBe('^9.2.3')
    expect(TEMPLATE_090.dependencies['@open-mercato/core']).toBe('0.9.0')
    expect(TEMPLATE_090.resolutions.zod).toBe('4.4.3')
    expect(TEMPLATE_090.packageManager?.startsWith('yarn@4.17.1')).toBe(true)
    expect(TEMPLATE_090.ageGateMinutes).toBe(5 * 1440)
    expect(TEMPLATE_090.preapproved).toEqual(['@open-mercato/*'])
  })
  it('parses Yarn durations', () => {
    expect(parseAgeGate('5d')).toBe(7200)
    expect(parseAgeGate('3h')).toBe(180)
    expect(parseAgeGate(90)).toBe(90)
    expect(parseAgeGate('1w')).toBe(10080)
    expect(parseAgeGate('soon')).toBe(0)
    expect(isPreapproved('@open-mercato/core', ['@open-mercato/*'])).toBe(true)
    expect(isPreapproved('@open-mercato-x/core', ['@open-mercato/*'])).toBe(false)
  })
})

describe('resolveAppVersion', () => {
  it('resolves what a fresh 0.9.0 app installs on the spike day', () => {
    const table = resolveAppVersion(
      TEMPLATE_090,
      '@tanstack/react-table',
      packument('@tanstack/react-table'),
      SPIKE_DAY,
    )
    expect(table).toBe('9.3.1')
    expect(resolveAppVersion(TEMPLATE_090, 'zod', packument('zod'), SPIKE_DAY)).toBe('4.4.3')
    expect(resolveAppVersion(TEMPLATE_090, 'react', null, SPIKE_DAY)).toBe('19.2.8')
    expect(resolveAppVersion(TEMPLATE_090, 'left-pad', null, SPIKE_DAY)).toBeNull()
  })
  it('respects the 5-day age gate of the template', () => {
    const early = new Date('2026-10-14T00:00:00Z')
    expect(resolveAppVersion(TEMPLATE_090, '@tanstack/react-table', packument('@tanstack/react-table'), early)).toBe(
      '9.2.8',
    )
  })
  it('finds @tanstack/react-table 9.2.6 vs 9.3.1 in marketing-consents on 0.9.0', () => {
    const consents = JSON.parse(
      readFileSync(
        join(
          FIT_FIXTURES,
          '..',
          '..',
          'fixtures',
          'data',
          'facts',
          '@piotrkarwatka',
          'marketing-consents',
          '0.1.0.json',
        ),
        'utf8',
      ),
    ) as { dependencies: Record<string, string> }
    const packs: Record<string, Packument> = {
      '@tanstack/react-table': packument('@tanstack/react-table'),
      '@tanstack/react-query': packument('@tanstack/react-query'),
      zod: packument('zod'),
    }
    const dups = hostDuplicates(consents.dependencies, (n) =>
      resolveAppVersion(TEMPLATE_090, n, packs[n] ?? null, SPIKE_DAY),
    )
    expect(dups).toContainEqual({ name: '@tanstack/react-table', moduleRange: '9.2.6', appVersion: '9.3.1' })
    expect(dups.map((d) => d.name)).not.toContain('zod')
  })
})

describe('tarball safety', () => {
  it('accepts only relative paths without ..', () => {
    expect(safeEntryPath('package/src/index.ts')).toBe(true)
    expect(safeEntryPath('package/../../etc/passwd')).toBe(false)
    expect(safeEntryPath('/etc/passwd')).toBe(false)
    expect(safeEntryPath('package\\..\\x')).toBe(false)
  })
  it('unpacks files and directories only, never links or escaping paths', async () => {
    const dest = join(tempDir(), 'out')
    const tgz = makeTgz([
      { name: 'package/', type: '5' },
      { name: 'package/package.json', body: '{"name":"x"}' },
      { name: 'package/src/a.ts', body: 'export const a = 1' },
      { name: 'package/link', type: '2', linkname: '/etc/passwd' },
      { name: 'package/../../escape.txt', body: 'no' },
    ])
    const r = await unpack(tgz, dest, () => true, { maxFiles: 10, maxBytes: 1000 })
    expect(r.files).toBe(2)
    expect(readdirSync(dest).sort()).toEqual(['package.json', 'src'])
    expect(existsSync(join(dest, 'link'))).toBe(false)
    expect(existsSync(join(dest, '..', 'escape.txt'))).toBe(false)
    expect(lstatSync(join(dest, 'src', 'a.ts')).isFile()).toBe(true)
  })
  it('stops at the size limits', async () => {
    const tgz = makeTgz([
      { name: 'package/a', body: 'x'.repeat(600) },
      { name: 'package/b', body: 'x'.repeat(600) },
    ])
    await expect(unpack(tgz, join(tempDir(), 'out'), () => true, { maxFiles: 10, maxBytes: 1000 })).rejects.toThrow(
      /over limits/,
    )
  })
  it('checks SRI integrity', () => {
    const buf = new TextEncoder().encode('hello')
    const integrity = `sha512-${createHash('sha512').update(buf).digest('base64')}`
    expect(checkIntegrity(buf, { tarball: '', integrity })).toBe(true)
    expect(checkIntegrity(new TextEncoder().encode('hellO'), { tarball: '', integrity })).toBe(false)
  })
})

describe('store', () => {
  function fakeRegistry(): { fetchImpl: typeof fetch; calls: string[] } {
    const tgz = makeTgz([
      {
        name: 'package/package.json',
        body: '{"name":"@open-mercato/shared","version":"1.0.0","dependencies":{"@open-mercato/cache":"1.0.0"}}',
      },
      { name: 'package/src/index.ts', body: 'export const a = 1' },
    ])
    const cacheTgz = makeTgz([
      { name: 'package/package.json', body: '{"name":"@open-mercato/cache","version":"1.0.0"}' },
    ])
    const sri = (b: Uint8Array): string => `sha512-${createHash('sha512').update(b).digest('base64')}`
    const docs: Record<string, unknown> = {
      'https://registry.test/@open-mercato%2Fshared': {
        name: '@open-mercato/shared',
        'dist-tags': { latest: '1.0.0' },
        time: { '1.0.0': '2026-01-01T00:00:00Z' },
        versions: {
          '1.0.0': { version: '1.0.0', dist: { tarball: 'https://registry.test/shared.tgz', integrity: sri(tgz) } },
        },
      },
      'https://registry.test/@open-mercato%2Fcache': {
        name: '@open-mercato/cache',
        'dist-tags': { latest: '1.0.0' },
        time: {},
        versions: {
          '1.0.0': { version: '1.0.0', dist: { tarball: 'https://registry.test/cache.tgz', integrity: sri(cacheTgz) } },
        },
      },
    }
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url === 'https://registry.test/shared.tgz') return new Response(Buffer.from(tgz))
      if (url === 'https://registry.test/cache.tgz') return new Response(Buffer.from(cacheTgz))
      if (url in docs) return Response.json(docs[url])
      return new Response('not found', { status: 404 })
    }) as typeof fetch
    return { fetchImpl, calls }
  }

  it('downloads, verifies, unpacks once and follows @open-mercato dependencies', async () => {
    const root = tempDir()
    const { fetchImpl, calls } = fakeRegistry()
    const store = createStore(root, { registry: 'https://registry.test', fetchImpl })
    const dirs = await ensureOmPackages(store, '1.0.0', ['@open-mercato/shared'])
    expect([...dirs.keys()].sort()).toEqual(['@open-mercato/cache', '@open-mercato/shared'])
    expect(readFileSync(join(dirs.get('@open-mercato/shared') as string, 'src', 'index.ts'), 'utf8')).toContain('a = 1')
    expect(await ensurePackage(store, '@open-mercato/shared', '9.9.9')).toBeNull()
    expect(await ensurePackage(store, '@open-mercato/nope', '1.0.0')).toBeNull()
    const before = calls.length
    const again = createStore(root, { registry: 'https://registry.test', fetchImpl, offline: true })
    expect(await ensurePackage(again, '@open-mercato/shared', '1.0.0')).toBe(dirs.get('@open-mercato/shared'))
    expect(await ensurePackage(again, '@open-mercato/shared', '9.9.9')).toBeNull()
    expect((await getPackument(again, '@open-mercato/shared'))?.versions['1.0.0']?.version).toBe('1.0.0')
    expect(calls.length).toBe(before)
  })
  it('fails offline without a cache and refuses tarballs outside the registry', async () => {
    const offline = createStore(tempDir(), { offline: true })
    await expect(ensurePackage(offline, '@open-mercato/shared', '1.0.0')).rejects.toBeInstanceOf(StoreError)
    const evil = (async (input: string | URL | Request) =>
      String(input).endsWith('%2Fshared')
        ? Response.json({
            name: '@open-mercato/shared',
            'dist-tags': {},
            time: {},
            versions: {
              '1.0.0': { version: '1.0.0', dist: { tarball: 'https://evil.test/x.tgz', integrity: 'sha512-x' } },
            },
          })
        : new Response('', { status: 404 })) as typeof fetch
    const store = createStore(tempDir(), { registry: 'https://registry.test', fetchImpl: evil })
    await expect(ensurePackage(store, '@open-mercato/shared', '1.0.0')).rejects.toThrow(/outside the registry/)
  })
  it('reads a cached template offline', async () => {
    const root = tempDir()
    cpSync(
      join(FIT_FIXTURES, 'create-mercato-app-0.9.0'),
      join(root, 'templates', 'create-mercato-app@0.9.0', 'package', 'template'),
      {
        recursive: true,
      },
    )
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(root, 'templates', 'create-mercato-app@0.9.0', '.complete'), '')
    const store = createStore(root, { offline: true })
    const t = await templateDeps(store, '0.9.0')
    expect(t?.dependencies['@tanstack/react-table']).toBe('^9.2.3')
    const lines = JSON.parse(
      readFileSync(join(FIT_FIXTURES, '..', '..', 'fixtures', 'data', 'lines.json'), 'utf8'),
    ) as Lines
    expect((await templateDepsForLine(store, lines, '0.9'))?.createApp).toBe('create-mercato-app@0.9.0')
    expect(await templateDepsForLine(store, lines, '0.7')).toBeNull()
    await expect(templateDepsForLine(store, lines, '0.8')).rejects.toBeInstanceOf(StoreError)
  })
})
