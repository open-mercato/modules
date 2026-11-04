// The Yarn 4 lockfile reader of template validation, ported from create-mercato-template src/lockfile.ts: the same
// refusals (Yarn 1, aliases, entries without a version) and the same lookups (package.json ranges, resolutions).
import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  isPlainRange,
  LockfileError,
  parseLockfile,
  rangeLookup,
  resolveDependency,
  resolveModulePackage,
  versionLine,
} from '../../lib/templates/lockfile.ts'
import { lockEntry, lockfile, YARN_LOCK } from './helpers.ts'

describe('parseLockfile', () => {
  it('reads entries with their descriptors, version and dependencies, every scalar as a string', () => {
    const l = parseLockfile(YARN_LOCK)
    expect(l.metadataVersion).toBe('10')
    const core = l.entries.find((e) => e.name === '@open-mercato/core')
    expect(core).toEqual({
      descriptors: ['@open-mercato/core@npm:0.9.0'],
      name: '@open-mercato/core',
      version: '0.9.0',
      resolution: '@open-mercato/core@npm:0.9.0',
      dependencies: ['@open-mercato/shared'],
    })
  })

  it('refuses a Yarn 1 lockfile, YAML aliases, broken YAML and entries without a version', () => {
    const fails = (text: string) => {
      try {
        parseLockfile(text)
        return null
      } catch (err) {
        expect(err).toBeInstanceOf(LockfileError)
        return (err as Error).message
      }
    }
    expect(fails('"a@1":\n  version: 1.0.0\n  resolution: "a@npm:1.0.0"\n')).toBe(
      'it has no __metadata (a Yarn 1 lockfile is not supported)',
    )
    expect(
      fails('__metadata:\n  version: 10\n"a@npm:1": &x\n  version: 1\n  resolution: a@npm:1\n"b@npm:1": *x\n'),
    ).toBe('it uses YAML aliases, which Yarn never writes')
    expect(fails('__metadata: [\n')).toBe('it is not valid YAML')
    expect(fails('__metadata:\n  version: 10\n"a@npm:1":\n  resolution: a@npm:1\n')).toBe(
      'an entry has no version or resolution',
    )
  })
})

describe('lookups', () => {
  const l = parseLockfile(
    lockfile([
      lockEntry('@open-mercato/core', '0.9.0'),
      lockEntry('@open-mercato/core', '0.8.4'),
      lockEntry('left-pad', '1.3.0'),
    ]),
  )

  it('resolves a package.json range through its descriptor, and by name when resolutions override it', () => {
    expect(resolveDependency(l, '@open-mercato/core', '0.9.0')?.version).toBe('0.9.0')
    expect(resolveDependency(l, '@open-mercato/core', '^0.9.0')).toBeNull()
    expect(resolveDependency(l, '@open-mercato/core', null)?.version).toBe('0.9.0')
    const pkg = { dependencies: { '@open-mercato/core': '^0.9.0' }, resolutions: { '@open-mercato/core': '0.8.4' } }
    expect(rangeLookup(pkg)('@open-mercato/core', '^0.9.0')).toBeNull()
    expect(resolveModulePackage(pkg, l, '@open-mercato/core')?.version).toBe('0.9.0')
    expect(resolveModulePackage({ dependencies: { 'left-pad': '1.3.0' } }, l, 'left-pad')?.version).toBe('1.3.0')
  })

  it('ranges, lines and version order', () => {
    expect(isPlainRange('^1.0.0')).toBe(true)
    expect(isPlainRange('workspace:*')).toBe(true)
    expect(isPlainRange('github:acme/x')).toBe(false)
    expect(isPlainRange('acme/x')).toBe(false)
    expect(versionLine('0.9.0-canary.1')).toBe('0.9')
    expect(versionLine('next')).toBeNull()
    expect(['0.9.0', '0.10.0', '0.9.0-rc.1', '0.9.1'].sort(compareVersions)).toEqual([
      '0.9.0-rc.1',
      '0.9.0',
      '0.9.1',
      '0.10.0',
    ])
  })
})
