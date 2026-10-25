import { describe, expect, it } from 'vitest'
import {
  encodeName,
  fetchPackument,
  installScriptsOf,
  npmRecord,
  type Packument,
  pickVersions,
  slimPackument,
} from '../../lib/sources/npm.ts'
import { SyncRecord } from '../../lib/schema/index.ts'
import { offlineHttp } from './helpers.ts'

const URL = 'https://registry.npmjs.org/x'

function pk(
  versions: Record<string, object>,
  tags: Record<string, string>,
  time: Record<string, string> = {},
): Packument {
  return { name: 'x', 'dist-tags': tags, versions, time }
}

describe('npm versions (spec 4.5, 11.4)', () => {
  it('latestStable skips deprecated versions (gateway-stripe has a deprecated 1.0.1)', () => {
    const p = pk(
      { '0.8.0': {}, '0.9.0': {}, '1.0.1': { deprecated: 'published by mistake, use 0.4.x' }, '0.10.1-develop.1': {} },
      { latest: '0.9.0', legacy: '1.0.1' },
    )
    expect(pickVersions(p)).toEqual({
      latestStable: '0.9.0',
      previousStable: '0.8.0',
      preview: null,
      skippedDeprecated: ['1.0.1'],
      aboveLatestTag: [],
    })
    const { notes } = npmRecord(p)
    expect(notes[0]).toContain('1.0.1 is deprecated')
  })
  it('E2: latestStable follows a stable, not deprecated latest tag (sync-akeneo has a stray 1.0.1 above latest 0.9.0)', () => {
    const p = pk({ '0.8.0': {}, '0.9.0': {}, '1.0.1': {}, '0.10.1-develop.1': {} }, { latest: '0.9.0' })
    expect(pickVersions(p)).toEqual({
      latestStable: '0.9.0',
      previousStable: '0.8.0',
      preview: null,
      skippedDeprecated: [],
      aboveLatestTag: ['1.0.1'],
    })
    const { record, notes } = npmRecord(p)
    expect(record.latestStable).toBe('0.9.0')
    expect(notes).toEqual(['npm: stable 1.0.1 is above dist-tags.latest 0.9.0; latestStable follows the latest tag'])
  })
  it('E2: a deprecated, prerelease or missing latest tag falls back to the highest stable, not deprecated version', () => {
    const versions = { '0.8.0': {}, '0.9.0': { deprecated: 'broken' }, '1.0.0': {}, '1.1.0-rc.1': {} }
    expect(pickVersions(pk(versions, { latest: '0.9.0' }))).toMatchObject({
      latestStable: '1.0.0',
      previousStable: '0.8.0',
      aboveLatestTag: [],
    })
    expect(pickVersions(pk(versions, { latest: '1.1.0-rc.1' }))).toMatchObject({ latestStable: '1.0.0' })
    expect(pickVersions(pk(versions, {}))).toMatchObject({ latestStable: '1.0.0', previousStable: '0.8.0' })
    expect(pickVersions(pk(versions, { latest: '2.0.0' }))).toMatchObject({ latestStable: '1.0.0' })
  })
  it('preview is the latest tag when there is no stable version (gateway-tpay)', () => {
    const p = pk(
      { '0.8.1-develop.1': {}, '0.8.1-develop.2': {} },
      { latest: '0.8.1-develop.1', develop: '0.8.1-develop.2' },
    )
    expect(pickVersions(p)).toMatchObject({ latestStable: null, previousStable: null, preview: '0.8.1-develop.1' })
  })
  it('without a usable latest tag, preview is the newest prerelease by publish time', () => {
    const p = pk(
      { '1.0.0-b.1': {}, '1.0.0-a.9': {} },
      {},
      { '1.0.0-b.1': '2026-01-01T00:00:00Z', '1.0.0-a.9': '2026-02-01T00:00:00Z' },
    )
    expect(pickVersions(p).preview).toBe('1.0.0-a.9')
  })
  it('install scripts: explicit keys, or install for binding.gyp (hasInstallScript)', () => {
    expect(installScriptsOf({ scripts: { postinstall: 'node x', build: 'tsc' } })).toEqual(['postinstall'])
    expect(installScriptsOf({ hasInstallScript: true })).toEqual(['install'])
    expect(installScriptsOf({})).toEqual([])
  })
  it('encodes scoped names for the registry', () => {
    expect(encodeName('@open-mercato/gateway-stripe')).toBe('@open-mercato%2Fgateway-stripe')
    expect(encodeName('create-mercato-module')).toBe('create-mercato-module')
  })
  it('the recording slimmer does not change what npm.ts computes', () => {
    const versions: Record<string, object> = {}
    const time: Record<string, string> = { created: '2025-01-01T00:00:00Z' }
    for (let i = 0; i < 40; i++) {
      versions[`0.${i}.0`] = {
        license: 'MIT',
        readme: 'x'.repeat(1000),
        dist: { integrity: `sha512-${i}`, tarball: `https://r/x-${i}.tgz`, fileCount: 3 },
      }
      versions[`0.${i}.1-develop.${i}`] = { dist: { integrity: 'sha512-d' } }
      time[`0.${i}.0`] = `2025-02-${String((i % 27) + 1).padStart(2, '0')}T00:00:00Z`
    }
    versions['0.39.0'] = { ...versions['0.39.0'], deprecated: 'oops' }
    const p = pk(versions, { latest: '0.38.0', develop: '0.39.1-develop.39' }, time)
    const slim = slimPackument(URL, p) as Packument
    expect(Object.keys(slim.versions ?? {}).length).toBeLessThan(Object.keys(versions).length)
    expect(npmRecord(slim)).toEqual(npmRecord(p))
    const pre = pk(
      { '1.0.0-a.1': {}, '1.0.0-a.2': { deprecated: 'x' } },
      { latest: '1.0.0-a.2' },
      { '1.0.0-a.1': '2026-01-01T00:00:00Z' },
    )
    expect(npmRecord(slimPackument(URL, pre) as Packument)).toEqual(npmRecord(pre))
  })
  it('builds SyncRecord.npm from the recorded gateway-stripe packument', async () => {
    const p = await fetchPackument(offlineHttp(), '@open-mercato/gateway-stripe')
    expect(p).not.toBeNull()
    const { record } = npmRecord(p as Packument)
    expect(record.latestStable).toBe('0.9.0')
    expect(record.previousStable).toBe('0.8.0')
    expect(record.distTags.legacy).toBe('1.0.1')
    expect(record.publishedAt['0.9.0']).toBe('2026-10-09T19:25:40Z')
    expect(record.repositoryUrl).toBe('git+https://github.com/open-mercato/open-mercato.git')
    expect(record.integrity).toMatch(/^sha512-/)
    expect(SyncRecord.shape.npm.parse(record)).toEqual(record)
  })
})
