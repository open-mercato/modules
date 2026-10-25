// Golden tests of Rentgen on real published tarballs (spec 12.2 WP05). The tarballs are fetched once
// from registry.npmjs.org with pinned integrity and cached; nothing in them is executed.
// Update the golden files only with `vitest run -u` in a separate commit (spec 3.5).
import { describe, expect, it } from 'vitest'
import { anatomyCounts, anatomyDiff, anatomyStatus } from '../../lib/rentgen/diff.ts'
import { scanTarballBuffer, type ScanContext } from '../../lib/rentgen/extract.ts'
import { Facts } from '../../lib/schema/data/facts.ts'
import { normalize, REAL, realTarball, type RealKey } from './helpers.ts'

const NET = { timeout: 120_000 }

async function facts(key: RealKey, extra: Partial<ScanContext> = {}): Promise<Facts> {
  const r = REAL[key]
  const { facts } = await scanTarballBuffer(await realTarball(key), {
    locator: r.locator,
    source: 'npm-tarball',
    integrity: r.integrity,
    gitRef: null,
    latestOm: '0.9.0',
    ...extra,
  })
  return Facts.parse(facts)
}

const codes = (f: Facts): string[] => [...new Set(f.modules.flatMap((m) => m.lint.map((l) => l.code)))].sort()

describe('Rentgen golden: real tarballs', () => {
  it('visits 0.1.0: minimal module, one backend page, likely example', NET, async () => {
    const f = await facts('visits')
    expect(f.kind).toBe('module')
    expect(f.gate).toMatchObject({ installable: true, needsModuleFlag: false })
    expect(f.license).toMatchObject({ value: 'UNLICENSED', kind: 'proprietary', mismatch: false })
    const m = f.modules[0]
    expect(m?.id).toBe('visits')
    expect(m?.ui.backendPages.map((p) => p.path)).toEqual(['/backend/visits'])
    expect(m?.http.routes).toEqual([])
    expect(codes(f)).toEqual(['likely-example', 'no-agents-md', 'peer-exact-pin', 'peer-range-behind'])
    expect(anatomyStatus(f)).toBe('partial')
    await expect(JSON.stringify(normalize(f), null, 2)).toMatchFileSnapshot('golden/visits-0.1.0.json')
  })

  it('KSeF 0.1.8: full anatomy, integration.ts expanded, migrations, event-prefix', NET, async () => {
    const f = await facts('ksef')
    expect(f.coverage).toEqual({ routesAuthResolved: 1, integrationTs: 'expanded' })
    expect(f.license).toMatchObject({ value: 'MIT', kind: 'osi', mismatch: false })
    const m = f.modules[0] as Facts['modules'][number]
    expect(m.id).toBe('integration_ksef_direct')
    expect(m.data.entities.map((e) => e.table)).toEqual([
      'ksef_direct_documents',
      'ksef_direct_received_documents',
      'ksef_direct_connections',
    ])
    expect(m.data.entities[0]?.src).toEqual({ file: 'src/modules/integration_ksef_direct/data/entities.ts', line: 19 })
    expect(m.data.migrations).toEqual({ count: 6, first: '2026-05-19', last: '2026-05-21' })
    // 8 route.ts files + 3 legacy files in api/get and api/post (health, seller-info, invoice-numbers)
    expect(m.http.routes).toHaveLength(11)
    expect(m.http.legacyRouteFiles).toBe(11)
    expect(m.publicRoutes).toBe(0)
    expect(
      m.http.routes.find((r) => r.path === '/api/integration-ksef-direct/documents' && r.method === 'GET'),
    ).toMatchObject({
      requireAuth: true,
      requireFeatures: ['integration_ksef_direct.documents.view'],
      hasOpenApi: true,
    })
    expect(m.security.aclFeatures).toHaveLength(7)
    expect(m.events.emits).toHaveLength(9)
    expect(m.events.subscribes).toEqual([
      {
        event: 'ksef_direct.document.created',
        src: { file: 'src/modules/integration_ksef_direct/subscribers/auto-enqueue-ksef-document.ts', line: 4 },
      },
    ])
    expect(m.background.workers.map((w) => w.queue)).toEqual([
      'ksef_direct_check',
      'ksef_direct_receive',
      'ksef_direct_send',
    ])
    expect(m.config.credentials.map((c) => [c.key, c.type, c.required])).toEqual([
      ['ksef_token', 'secret', true],
      ['nip', 'text', true],
      ['environment', 'select', true],
    ])
    expect(m.network.hosts.map((h) => h.host)).toEqual(['api-test.ksef.mf.gov.pl', 'api.ksef.mf.gov.pl'])
    expect(m.omImports['@open-mercato/shared']?.['lib/di/container']).toContain('createRequestContainer')
    expect(codes(f)).toEqual(['event-prefix', 'no-agents-md', 'peer-range-behind', 'ships-tests'])
    expect(m.lint.find((l) => l.code === 'event-prefix')).toMatchObject({ severity: 'warn', anchor: 'AGENTS.md:206' })
    expect(m.glyph).toBe('2323201')
    expect(anatomyStatus(f)).toBe('full')
    await expect(JSON.stringify(normalize(f), null, 2)).toMatchFileSnapshot('golden/ksef-0.1.8.json')
  })

  it(
    'KSeF 0.1.7: license-mismatch and version-drift (package.json silent, integration.ts PROPRIETARY 0.1.0)',
    NET,
    async () => {
      const f = await facts('ksef017', { integrity: REAL.ksef017.integrity })
      expect(f.license).toEqual({
        value: 'PROPRIETARY',
        kind: 'proprietary',
        mismatch: true,
        sources: { packageJson: null, licenseFile: null, moduleInfo: null, integrationTs: 'PROPRIETARY' },
      })
      expect(codes(f)).toEqual([
        'event-prefix',
        'license-mismatch',
        'no-agents-md',
        'peer-range-behind',
        'ships-tests',
        'version-drift',
      ])
      expect(f.modules[0]?.lint.find((l) => l.code === 'version-drift')?.message).toBe(
        'integration.ts says 0.1.0, package.json says 0.1.7.',
      )
      await expect(JSON.stringify(normalize(f), null, 2)).toMatchFileSnapshot('golden/ksef-0.1.7.json')
    },
  )

  it('KSeF 0.1.7 -> 0.1.8 diff: same anatomy, nothing added or removed', NET, async () => {
    const d = anatomyDiff(await facts('ksef017'), await facts('ksef'))
    expect(d).toEqual({
      from: '0.1.7',
      added: { tables: 0, routes: 0, publicRoutes: 0, aclFeatures: 0, env: [], hosts: [] },
      removed: { tables: 0, routes: 0, aclFeatures: 0 },
    })
  })

  it(
    'gateway-stripe 0.9.0: official provider registrations, exact peer pin, version drift in integration.ts',
    NET,
    async () => {
      const f = await facts('stripe')
      const m = f.modules[0] as Facts['modules'][number]
      expect(m.id).toBe('gateway_stripe')
      expect(m.extends).toEqual([
        { kind: 'specialized-registry', target: 'integration:gateway_stripe' },
        { kind: 'specialized-registry', target: 'payment:stripe' },
      ])
      expect(m.background.workers.map((w) => w.queue)).toEqual(['stripe-webhook'])
      expect(m.background.cli).toEqual(['configure-from-env', 'help'])
      expect(m.config.credentials.map((c) => c.key)).toContain('secretKey')
      expect(codes(f)).toEqual(['no-agents-md', 'peer-exact-pin', 'ships-tests', 'version-drift'])
      expect(anatomyCounts(f.modules).aclFeatures).toBe(2)
      await expect(JSON.stringify(normalize(f), null, 2)).toMatchFileSnapshot('golden/gateway-stripe-0.9.0.json')
    },
  )

  it('web-research-exa 0.9.0: src without modules is a provider, anatomy none', NET, async () => {
    const f = await facts('exa')
    expect(f.kind).toBe('provider')
    expect(f.modules).toEqual([])
    expect(f.gate).toMatchObject({ installable: false, reason: 'Package has no src/modules and dist/modules pair.' })
    expect(anatomyStatus(f)).toBe('none')
    // rentgen 3: the src/ of a package without a module is read for hosts and env (finding of 25 Oct)
    expect(f.packageCode?.hosts).toContainEqual(expect.objectContaining({ host: 'api.exa.ai', confidence: 'high' }))
  })
})
