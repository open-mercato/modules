// Network steps of validate (spec 5.2 steps 2-4, 7-9) against a fake registry and GitHub API: readable errors for
// a missing, unstable, deprecated or archived source, the SRI check, the kind gate, the repository match, the
// collision with a core module, and the summary rows of a passing entry (at most 10 lines).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog, type Catalog } from '../../lib/validate/catalog.ts'
import { builtForText, checkRemote, linesBehind, type RemoteDeps } from '../../lib/validate/remote.ts'
import { renderEntry } from '../../lib/validate/summary.ts'
import type { EntryResult } from '../../lib/validate/types.ts'
import { Descriptor, type Descriptor as DescriptorT } from '../../lib/schema/index.ts'
import { fakeHttp, moduleTarball, ROOT, type FakeWorld } from './helpers.ts'

let catalog: Catalog
beforeAll(async () => {
  catalog = await loadCatalog(ROOT, null)
})

const NOW = new Date('2026-10-23T12:00:00Z')
const desc = (o: Partial<DescriptorT> & { npm?: string; github?: string }): DescriptorT =>
  Descriptor.parse({
    category: 'marketing-loyalty',
    summary: 'Loyalty points for customers, earned on paid orders.',
    whenToUse: 'Use when the shop rewards repeat customers with points they can spend.',
    ...o,
  })
const deps = (world: FakeWorld, author: string | null = 'acme-labs'): RemoteDeps => ({
  http: fakeHttp(world),
  store: null,
  now: NOW,
  author,
})
const loyalty = (o: { dist?: boolean; id?: string; pkg?: Record<string, unknown> } = {}) =>
  moduleTarball({
    name: '@acme-labs/om-loyalty',
    version: '1.2.0',
    id: o.id ?? 'loyalty',
    dist: o.dist ?? true,
    pkg: {
      repository: { type: 'git', url: 'git+https://github.com/acme-labs/om-loyalty.git' },
      peerDependencies: { '@open-mercato/core': '^0.9.0' },
      ...o.pkg,
    },
  })
const world = (tarball: Uint8Array, extra: Partial<FakeWorld> = {}, v: Record<string, unknown> = {}): FakeWorld => ({
  packages: [
    {
      name: '@acme-labs/om-loyalty',
      versions: {
        '1.2.0': {
          tarball,
          repository: 'git+https://github.com/acme-labs/om-loyalty.git',
          time: '2026-10-21T08:00:00.000Z',
          ...v,
        },
      },
    },
  ],
  repos: [{ nameWithOwner: 'acme-labs/om-loyalty' }],
  ...extra,
})
const LOC = 'npm:@acme-labs/om-loyalty'
const codes = (r: { findings: { code: string; severity: string }[] }, sev = 'error') =>
  r.findings.filter((f) => f.severity === sev).map((f) => f.code)

describe('checkRemote', () => {
  it('a valid new module: rows of the spec 5.2 example and a summary of at most 10 lines', async () => {
    const d = desc({ npm: '@acme-labs/om-loyalty', github: 'acme-labs/om-loyalty' })
    const r = await checkRemote(d, LOC, catalog, deps(world(loyalty())))
    expect(codes(r)).toEqual([])
    expect(r.version).toBe('1.2.0')
    const rows = Object.fromEntries(r.rows.map((x) => [x.check, x.result]))
    expect(rows).toMatchObject({
      Kind: 'module (loyalty), installable',
      License: 'MIT (package.json)',
      Ownership: 'Claimed (repo-owner)',
      'Fits statically': 'skipped (no data/lines.json yet)',
      'Built for': '^0.9.0 (caret-0x, covers 0.9.0) · installable from 2026-10-26 (Yarn age gate)',
    })
    expect(rows.Anatomy).toMatch(/^0 tables · 0 routes \(0 public\) · /)
    const entry: EntryResult = {
      file: 'modules/@acme-labs/om-loyalty.yml',
      locator: LOC,
      version: r.version,
      status: 'pass',
      findings: r.findings,
      skipped: r.skipped,
      rows: r.rows,
      durationMs: 1,
    }
    const md = renderEntry(entry)
    expect(md.length).toBeLessThanOrEqual(10)
    expect(md[0]).toBe('### `npm:@acme-labs/om-loyalty@1.2.0`: passed')
  })

  it('ownership: another author is Unclaimed, an org member is Claimed, a repository.url elsewhere never claims', async () => {
    const d = desc({ npm: '@acme-labs/om-loyalty', github: 'acme-labs/om-loyalty' })
    const other = await checkRemote(d, LOC, catalog, deps(world(loyalty()), 'stranger'))
    expect(other.rows.find((x) => x.check === 'Ownership')?.result).toBe(
      'Unclaimed (PR author is not repo owner or org member)',
    )
    const org = world(loyalty(), {
      repos: [{ nameWithOwner: 'acme-labs/om-loyalty', ownerType: 'Organization' }],
      members: ['acme-labs/dev1'],
    })
    const member = await checkRemote(d, LOC, catalog, deps(org, 'dev1'))
    expect(member.rows.find((x) => x.check === 'Ownership')?.result).toBe('Claimed (org-member)')
    const curator = await checkRemote(d, LOC, catalog, deps(world(loyalty()), 'wojciechszyjka'))
    expect(curator.rows.find((x) => x.check === 'Ownership')?.result).toBe('Unclaimed (curator PR)')
  })

  it('step 2: missing package, no stable version, deprecated, missing or archived repository', async () => {
    const d = desc({ npm: '@acme-labs/om-loyalty' })
    expect(codes(await checkRemote(d, LOC, catalog, deps({ packages: [] })))).toEqual(['not-found'])
    const pre = world(loyalty())
    pre.packages = [{ name: '@acme-labs/om-loyalty', versions: { '1.3.0-beta.1': { tarball: loyalty() } } }]
    const r = await checkRemote(d, LOC, catalog, deps(pre))
    expect(codes(r)).toEqual(['no-stable'])
    expect(r.findings[0]?.message).toBe(
      '@acme-labs/om-loyalty: no stable version (x.y.z) on npm; latest is 1.3.0-beta.1',
    )
    const dep = await checkRemote(d, LOC, catalog, deps(world(loyalty(), {}, { deprecated: 'use something else' })))
    expect(codes(dep)).toEqual(['deprecated'])
    const dg = desc({ npm: '@acme-labs/om-loyalty', github: 'acme-labs/om-loyalty' })
    expect(codes(await checkRemote(dg, LOC, catalog, deps(world(loyalty(), { repos: [] }))))).toEqual(['not-found'])
    const arch = world(loyalty(), { repos: [{ nameWithOwner: 'acme-labs/om-loyalty', archived: true }] })
    expect(codes(await checkRemote(dg, LOC, catalog, deps(arch)))).toEqual(['archived'])
  })

  it('step 3: SRI mismatch rejects the tarball; no dist is not installable; kind and module are confirmed', async () => {
    const d = desc({ npm: '@acme-labs/om-loyalty' })
    const bad = await checkRemote(d, LOC, catalog, deps(world(loyalty(), {}, { integrity: 'sha512-AAAA' })))
    expect(codes(bad)).toEqual(['tarball'])
    expect(bad.findings[0]?.message).toMatch(/^tarball rejected: integrity mismatch/)

    const nodist = await checkRemote(d, LOC, catalog, deps(world(loyalty({ dist: false }))))
    expect(codes(nodist)).toEqual(['not-installable'])
    expect(nodist.findings[0]?.message).toBe(
      'Not an installable Open Mercato module: No dist/modules/loyalty/ in the tarball (not built).',
    )

    const prov = desc({ npm: '@acme-labs/om-loyalty', kind: 'provider' })
    const kind = await checkRemote(prov, LOC, catalog, deps(world(loyalty())))
    expect(codes(kind)).toEqual(['kind'])
    expect(kind.findings[0]?.message).toBe('kind: the descriptor says provider, the tarball is a module')

    const mod = desc({ npm: '@acme-labs/om-loyalty', module: 'points' })
    expect(codes(await checkRemote(mod, LOC, catalog, deps(world(loyalty()))))).toEqual(['module'])
  })

  it('step 3: github must equal repository.url of the package', async () => {
    const d = desc({ npm: '@acme-labs/om-loyalty', github: 'acme-labs/om-loyalty' })
    const w = world(
      loyalty({ pkg: { repository: 'github:someone/else' } }),
      {},
      { repository: 'git+https://github.com/someone/else.git' },
    )
    const r = await checkRemote(d, LOC, catalog, deps(w))
    expect(codes(r)).toEqual(['repo-mismatch'])
    expect(r.findings[0]?.message).toBe(
      'github acme-labs/om-loyalty differs from repository.url someone/else in package.json',
    )
  })

  it('step 8: a module ID of core collides unless replaces names it', async () => {
    const tb = loyalty({ id: 'customers' })
    const d = desc({ npm: '@acme-labs/om-loyalty' })
    const r = await checkRemote(d, LOC, catalog, deps(world(tb)))
    expect(codes(r)).toContain('collision-core')
    const ok = await checkRemote(
      desc({ npm: '@acme-labs/om-loyalty', replaces: ['core:customers'] }),
      LOC,
      catalog,
      deps(world(tb)),
    )
    expect(codes(ok)).not.toContain('collision-core')
  })

  it('install scripts without scriptsRequired are a Supply chain warning', async () => {
    const d = desc({ npm: '@acme-labs/om-loyalty' })
    const r = await checkRemote(d, LOC, catalog, deps(world(loyalty(), {}, { scripts: { postinstall: 'node x.js' } })))
    expect(codes(r, 'warning')).toContain('install-scripts')
  })

  it('E3: a prepare script alone is not an install script of an npm package', async () => {
    const d = desc({ npm: '@acme-labs/om-loyalty' })
    const r = await checkRemote(d, LOC, catalog, deps(world(loyalty(), {}, { scripts: { prepare: 'tsc' } })))
    expect(codes(r, 'warning')).not.toContain('install-scripts')
  })

  it('a GitHub-only entry reads the newest tag; without dist it is a warning, not an error', async () => {
    const d = desc({ github: 'acme-labs/om-loyalty' })
    const w: FakeWorld = {
      repos: [{ nameWithOwner: 'acme-labs/om-loyalty', tags: ['v1.0.0'] }],
      archives: { 'acme-labs/om-loyalty@v1.0.0': loyalty({ dist: false }) },
    }
    const r = await checkRemote(d, 'github:acme-labs/om-loyalty', catalog, deps(w))
    expect(r.version).toBe('v1.0.0')
    expect(codes(r)).toEqual([])
    expect(codes(r, 'warning')).toEqual(['not-installable'])
  })
})

describe('Built for', () => {
  it('counts lines behind the latest minor', () => {
    expect(linesBehind('>=0.7.0 <0.8.0', '0.9.0')).toBe(2)
    expect(linesBehind('^0.8.0', '0.9.0')).toBe(1)
    expect(linesBehind('^0.9.0', '0.9.0')).toBe(0)
    expect(builtForText({ '@open-mercato/core': '>=0.7.0 <0.8.0' }, '0.9.0')).toBe(
      '>=0.7.0 <0.8.0 (bounded, 2 lines behind)',
    )
    expect(builtForText({ '@open-mercato/core': '0.9.0' }, '0.9.0')).toBe('0.9.0 (exact-pin, covers 0.9.0)')
    expect(builtForText({}, '0.9.0')).toBe('missing (no @open-mercato peer)')
  })
})
