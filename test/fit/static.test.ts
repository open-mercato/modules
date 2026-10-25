import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { FitCell } from '../../lib/schema/index.ts'
import {
  builtForKind,
  builtForRange,
  checkImports,
  createWorld,
  declaredFor,
  fitCell,
  fitStatus,
  hostDuplicateMessage,
  hostDuplicates,
  mergeImports,
  peersAccept,
  peersRejectFitting,
  resolveSubpath,
  specParts,
} from '../../lib/fit/static.ts'
import type { FitWorld, ImportMap } from '../../lib/fit/static.ts'
import { driftBetween, symbolKey } from '../../lib/fit/drift.ts'
import { fakeShared, tempDir, writeTree } from './helpers.ts'

let worldA: FitWorld
let worldB: FitWorld

beforeAll(() => {
  const root = tempDir()
  writeTree(join(root, 'A'), fakeShared('A'))
  writeTree(join(root, 'B'), fakeShared('B'))
  worldA = createWorld({
    version: '1.0.0',
    dirs: new Map([
      ['@open-mercato/shared', join(root, 'A')],
      ['@open-mercato/ui', null],
    ]),
  })
  worldB = createWorld({ version: '1.1.0', dirs: new Map([['@open-mercato/shared', join(root, 'B')]]) })
})

const MODULE: ImportMap = {
  '@open-mercato/shared': {
    'lib/di/container': ['AppContainer', 'createRequestContainer'],
    'lib/all': ['known', 'Other'],
    'lib/gone': ['x'],
    'lib/css': ['(side-effect)'],
    'lib/complete': ['*', 'createRequestContainer'],
  },
}

describe('resolveSubpath', () => {
  it('follows exports patterns and conditions', () => {
    const r = resolveSubpath(worldA, '@open-mercato/shared', 'lib/di/container')
    expect(r.status).toBe('ok')
    expect(r.status === 'ok' && r.typesFile?.endsWith('src/lib/di/container.ts')).toBe(true)
    expect(resolveSubpath(worldA, '@open-mercato/shared', 'lib/css').status).toBe('ok')
  })
  it('reports a missing file, a missing package', () => {
    expect(resolveSubpath(worldB, '@open-mercato/shared', 'lib/gone').status).toBe('noFile')
    expect(resolveSubpath(worldA, '@open-mercato/ui', '.').status).toBe('noPkg')
    expect(resolveSubpath(worldA, '@open-mercato/queue', '.').status).toBe('noPkg')
  })
  it('splits specifiers', () => {
    expect(specParts('@open-mercato/shared/lib/di/container')).toEqual(['@open-mercato/shared', 'lib/di/container'])
    expect(specParts('@open-mercato/ui')).toEqual(['@open-mercato/ui', '.'])
    expect(specParts('react')).toBeNull()
  })
})

describe('checkImports', () => {
  it('counts looked-up symbols, skips star, side effects and symbols of missing subpaths', () => {
    const a = checkImports(worldA, MODULE)
    expect(a.checked).toBe(6)
    expect(a.missing).toEqual([])
    expect(a.unknown).toEqual([{ pkg: '@open-mercato/shared', subpath: 'lib/all', symbol: 'Other', kind: 'symbol' }])
  })
  it('finds a removed symbol and a removed subpath on the next version', () => {
    const b = checkImports(worldB, MODULE)
    expect(b.checked).toBe(5)
    expect(b.missing).toEqual([
      { pkg: '@open-mercato/shared', subpath: 'lib/di/container', symbol: 'AppContainer', kind: 'symbol' },
      { pkg: '@open-mercato/shared', subpath: 'lib/gone', symbol: null, kind: 'subpath' },
    ])
  })
  it('treats a missing package as a missing subpath', () => {
    const r = checkImports(worldA, { '@open-mercato/ui': { 'primitives/button': ['Button'] } })
    expect(r).toMatchObject({ checked: 0, missing: [{ pkg: '@open-mercato/ui', kind: 'subpath' }] })
  })
  it('sees signature drift between versions', () => {
    const a = checkImports(worldA, MODULE)
    const b = checkImports(worldB, MODULE)
    const key = symbolKey('@open-mercato/shared', 'lib/di/container', 'createRequestContainer')
    expect(driftBetween(a.sigs, b.sigs).changed).toContain(key)
    expect(driftBetween(a.sigs, a.sigs).changed).toEqual([])
    expect(symbolKey('@open-mercato/ui', '.', 'Button')).toBe('@open-mercato/ui#Button')
  })
})

describe('fitCell', () => {
  it('builds valid cells with drift only against latest', () => {
    const a = checkImports(worldA, MODULE)
    const b = checkImports(worldB, MODULE)
    const onLatest = fitCell({
      result: a,
      latest: null,
      omPeers: { '@open-mercato/core': '1.0.0' },
      omVersion: '1.0.0',
      hostDuplicates: [],
    })
    expect(FitCell.parse(onLatest)).toEqual(onLatest)
    expect(onLatest.status).toBe('unknown')
    expect(onLatest.declared).toEqual({ range: '1.0.0', kind: 'exact-pin', satisfied: true })
    const onNext = fitCell({
      result: b,
      latest: a,
      omPeers: { '@open-mercato/core': '1.0.0' },
      omVersion: '1.1.0',
      hostDuplicates: [],
    })
    expect(onNext.status).toBe('no-fit')
    expect(onNext.declared.satisfied).toBe(false)
    expect(onNext.drift).toContain('@open-mercato/shared/lib/di/container#createRequestContainer')
  })
  it('orders statuses no-fit > unknown > drift > ok', () => {
    expect(fitStatus([1], [1], [1])).toBe('no-fit')
    expect(fitStatus([], [1], [1])).toBe('unknown')
    expect(fitStatus([], [], [1])).toBe('drift')
    expect(fitStatus([], [], [])).toBe('ok')
  })
})

describe('declared peers', () => {
  it.each([
    [null, 'missing'],
    ['*', 'star'],
    ['0.9.0', 'exact-pin'],
    ['=0.9.0', 'exact-pin'],
    ['^0.6.7', 'caret-0x'],
    ['>=0.7.0 <0.8.0', 'bounded'],
    ['~0.6.0', 'bounded'],
    ['^1.2.3', 'bounded'],
    ['0.9.x', 'bounded'],
    ['>=0.7.0', 'open'],
    ['^0.8.0 || >=1.0.0', 'open'],
  ] as const)('kind of %s is %s', (range, kind) => {
    expect(builtForKind(range)).toBe(kind)
  })
  it('accepts prerelease snapshots like the next line', () => {
    const next = '0.10.1-develop.7583.1.0c886d0a14'
    expect(peersAccept({ '@open-mercato/core': '>=0.7.0' }, next)).toBe(true)
    expect(peersAccept({ '@open-mercato/core': '^0.9.0' }, next)).toBe(false)
    expect(peersAccept({}, '0.9.0')).toBe(true)
    expect(peersAccept({ '@open-mercato/core': '*', '@open-mercato/ui': '0.8.0' }, '0.9.0')).toBe(false)
  })
  it('shows the core peer as Built for', () => {
    expect(builtForRange({ '@open-mercato/ui': '^0.6.7', '@open-mercato/core': '0.9.0' })).toBe('0.9.0')
    expect(builtForRange({ '@open-mercato/ui': '^0.6.7', '@open-mercato/shared': '^0.6.8' })).toBe('^0.6.8')
    expect(declaredFor({}, '0.9.0')).toEqual({ range: null, kind: 'missing', satisfied: true })
  })
  it('counts peers that reject statically fitting cells', () => {
    const cell = (status: FitCell['status'], satisfied: boolean): Pick<FitCell, 'status' | 'declared'> => ({
      status,
      declared: { range: 'x', kind: 'exact-pin', satisfied },
    })
    expect(
      peersRejectFitting([
        cell('ok', false),
        cell('drift', false),
        cell('ok', true),
        cell('no-fit', false),
        cell('unknown', false),
      ]),
    ).toEqual({ rejected: 2, fitting: 3 })
  })
})

describe('hostDuplicates', () => {
  it('flags host packages the module bundles in another version than the app', () => {
    const app: Record<string, string> = { '@tanstack/react-table': '9.3.1', zod: '4.4.3', react: '19.2.8' }
    const deps = { '@tanstack/react-table': '9.2.6', zod: '4.4.3', lodash: '4.0.0', react: '^19.0.0', next: '16.0.0' }
    const out = hostDuplicates(deps, (n) => app[n] ?? null)
    expect(out).toEqual([{ name: '@tanstack/react-table', moduleRange: '9.2.6', appVersion: '9.3.1' }])
    expect(hostDuplicateMessage(out[0] as FitCell['hostDuplicates'][number], '0.9.0')).toBe(
      'Bundles @tanstack/react-table 9.2.6 while Open Mercato 0.9.0 ships 9.3.1. Two copies break types. Move it to peerDependencies.',
    )
  })
})

describe('mergeImports', () => {
  it('unions omImports of all modules of a package', () => {
    expect(
      mergeImports([
        { '@open-mercato/shared': { 'lib/a': ['b', 'a'] } },
        { '@open-mercato/shared': { 'lib/a': ['a', 'c'], 'lib/z': ['z'] }, '@open-mercato/ui': { '.': ['Button'] } },
      ]),
    ).toEqual({
      '@open-mercato/shared': { 'lib/a': ['a', 'b', 'c'], 'lib/z': ['z'] },
      '@open-mercato/ui': { '.': ['Button'] },
    })
  })
})
