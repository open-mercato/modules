// Unit tests of the Rentgen readers on synthetic packages: routes (three layouts and the runtime auth
// rule), license sources, env, hosts, lint rules, glyph and diff.
import { describe, expect, it } from 'vitest'
import { anatomyDiff, changesPermissions, glyphOf } from '../../lib/rentgen/diff.ts'
import { scanTarballBuffer, type ScanContext } from '../../lib/rentgen/extract.ts'
import { hostDeclared, hostOf } from '../../lib/rentgen/hosts.ts'
import { licenseKind, normalizeLicense, resolveLicense } from '../../lib/rentgen/license.ts'
import { lintPackage } from '../../lib/rentgen/lint.ts'
import { defaultVersion } from '../../lib/rentgen/unpack.ts'
import { splitEnv } from '../../lib/core/entry.ts'
import type { Facts } from '../../lib/schema/data/facts.ts'
import { makeTarball, modulePackage } from './helpers.ts'

const ctx = (locator: string, extra: Partial<ScanContext> = {}): ScanContext => ({
  locator,
  source: 'npm-tarball',
  integrity: null,
  gitRef: null,
  ...extra,
})

async function scanFiles(
  id: string,
  files: Record<string, string>,
  extra: Partial<ScanContext> = {},
  pkg: Record<string, unknown> = {},
): Promise<Facts> {
  const { facts } = await scanTarballBuffer(
    makeTarball(modulePackage({ name: '@x/t', id, files, pkg })),
    ctx('npm:@x/t', extra),
  )
  return facts
}

describe('routes: layouts and auth (generator module-registry.ts:2380-2520, runtime [...slug]/route.ts)', async () => {
  const f = await scanFiles('shop_items', {
    // 1. route file with method-keyed metadata
    'src/modules/shop_items/api/items/route.ts': [
      `export const metadata = { GET: { requireAuth: true, requireFeatures: ['shop_items.view'] }, POST: { requireAuth: false } }`,
      `export const openApi = {}`,
      `export async function GET() {}`,
      `export async function POST() {}`,
      '',
    ].join('\n'),
    // route file without metadata: auth required by default
    'src/modules/shop_items/api/items/[id]/route.ts': `export async function GET() {}\nexport async function DELETE() {}\n`,
    // route file re-exporting metadata from a sibling (followed statically)
    'src/modules/shop_items/api/alias/route.ts': `export { metadata, GET } from '../items/route'\n`,
    // metadata from a CRUD factory: crud.metadata.GET
    'src/modules/shop_items/api/crud/route.ts': [
      `const crud = makeCrudRoute({ metadata: { GET: { requireAuth: true, requireFeatures: ['shop_items.view'] } } })`,
      `export const metadata = { GET: crud.metadata.GET }`,
      `export const GET = crud.GET`,
      '',
    ].join('\n'),
    // metadata that needs execution
    'src/modules/shop_items/api/dynamic/route.ts': `export const metadata = buildMeta()\nexport function GET() {}\n`,
    // 2. plain file outside method folders, path from metadata.path
    'src/modules/shop_items/api/stats.ts': `export const metadata = { path: '/shop/stats', requireAuth: false }\nexport function GET() {}\n`,
    // 3. legacy method folder, whole-file metadata
    'src/modules/shop_items/api/post/import.ts': `export const metadata = { requireFeatures: ['shop_items.import'] }\nexport default async function handler() {}\n`,
    // not a route: helper without HTTP exports, a test file
    'src/modules/shop_items/api/helpers.ts': `export function util() {}\n`,
    'src/modules/shop_items/api/__tests__/x.test.ts': `export function GET() {}\n`,
    'src/modules/shop_items/acl.ts': `export const features = ['shop_items.view', 'shop_items.import']\n`,
  })
  const m = f.modules[0] as Facts['modules'][number]
  const byKey = Object.fromEntries(m.http.routes.map((r) => [`${r.method} ${r.path}`, r]))

  it('finds every route the generator registers, with public paths', () => {
    expect(Object.keys(byKey).sort()).toEqual([
      'DELETE /api/shop_items/items/[id]',
      'GET /api/shop/stats',
      'GET /api/shop_items/alias',
      'GET /api/shop_items/crud',
      'GET /api/shop_items/dynamic',
      'GET /api/shop_items/items',
      'GET /api/shop_items/items/[id]',
      'POST /api/shop_items/import',
      'POST /api/shop_items/items',
    ])
    expect(m.http.legacyRouteFiles).toBe(1)
  })

  it('applies the runtime auth rule', () => {
    expect(byKey['GET /api/shop_items/items']).toMatchObject({
      requireAuth: true,
      requireFeatures: ['shop_items.view'],
      hasOpenApi: true,
    })
    expect(byKey['POST /api/shop_items/items']?.requireAuth).toBe(false)
    expect(byKey['GET /api/shop_items/items/[id]']).toMatchObject({
      requireAuth: true,
      requireFeatures: [],
      hasOpenApi: false,
    })
    expect(byKey['GET /api/shop_items/alias']).toMatchObject({
      requireAuth: true,
      requireFeatures: ['shop_items.view'],
    })
    expect(byKey['GET /api/shop_items/crud']).toMatchObject({ requireAuth: true, requireFeatures: ['shop_items.view'] })
    expect(byKey['GET /api/shop_items/dynamic']?.requireAuth).toBeNull()
    expect(byKey['GET /api/shop/stats']?.requireAuth).toBe(false)
    expect(byKey['POST /api/shop_items/import']).toMatchObject({
      requireAuth: true,
      requireFeatures: ['shop_items.import'],
    })
    expect(m.publicRoutes).toBe(2)
    expect(m.http.authResolved).toBe(0.8889)
    expect(f.coverage.routesAuthResolved).toBe(0.8889)
  })

  it('points each route at its file and line', () => {
    expect(byKey['POST /api/shop_items/items']?.src).toEqual({
      file: 'src/modules/shop_items/api/items/route.ts',
      line: 4,
    })
    expect(byKey['POST /api/shop_items/import']?.src).toEqual({
      file: 'src/modules/shop_items/api/post/import.ts',
      line: 2,
    })
  })

  it('lints public routes, missing openApi and setup without defaultRoleFeatures', () => {
    const codes = m.lint.map((l) => l.code)
    expect(codes).toContain('public-routes')
    expect(m.lint.find((l) => l.code === 'route-openapi')?.message).toBe('7 of 9 routes have no openApi.')
    expect(m.lint.find((l) => l.code === 'public-routes')?.message).toBe('2 of 9 routes do not require authentication.')
  })
})

describe('routes: computed metadata keys (finding of 25 Oct)', async () => {
  const f = await scanFiles('comp', {
    // the same object as { requireAuth: false } at runtime
    'src/modules/comp/api/literal/route.ts': `export const metadata = { ['requireAuth']: false }\nexport function GET() {}\n`,
    // a key read from a top-level const is still static
    'src/modules/comp/api/const/route.ts': `const KEY = 'requireAuth'\nexport const metadata = { [KEY]: false }\nexport function GET() {}\n`,
    // a key only running the code can tell: never the default `true`
    'src/modules/comp/api/hidden/route.ts': `export const metadata = { [keyOf()]: false }\nexport function GET() {}\n`,
    'src/modules/comp/api/method/route.ts': `export const metadata = { ['GET']: { requireAuth: false } }\nexport function GET() {}\n`,
    'src/modules/comp/api/methodhidden/route.ts': `export const metadata = { [verb()]: { requireAuth: false } }\nexport function GET() {}\n`,
  })
  const m = f.modules[0] as Facts['modules'][number]
  const auth = (p: string) => m.http.routes.find((r) => r.path === `/api/comp/${p}`)?.requireAuth

  it('a literal or const key is read, any other key makes requireAuth unknown', () => {
    expect(auth('literal')).toBe(false)
    expect(auth('const')).toBe(false)
    expect(auth('hidden')).toBeNull()
    expect(auth('method')).toBe(false)
    expect(auth('methodhidden')).toBeNull()
    expect(m.publicRoutes).toBe(3)
  })
})

describe('license (spec 6.1)', () => {
  it('normalizes declared values', () => {
    expect(normalizeLicense('UNLICENSED')).toBe('UNLICENSED')
    expect(normalizeLicense('Apache 2')).toBe('Apache-2.0')
    expect(normalizeLicense('see license in LICENSE.md')).toBe('SEE LICENSE IN LICENSE.md')
    expect(normalizeLicense({ type: 'MIT' })).toBe('MIT')
    expect(normalizeLicense('')).toBeNull()
  })

  it('classifies kinds', () => {
    expect(licenseKind('MIT OR Apache-2.0', '@x/a', null)).toBe('osi')
    expect(licenseKind('UNLICENSED', '@x/a', null)).toBe('proprietary')
    expect(licenseKind('SEE LICENSE IN LICENSE.md', '@open-mercato/enterprise', 'custom')).toBe('enterprise')
    expect(licenseKind('SEE LICENSE IN LICENSE.md', '@x/a', 'custom')).toBe('proprietary')
    expect(licenseKind('BUSL-1.1', '@x/a', null)).toBe('proprietary')
    expect(licenseKind(null, '@x/a', null)).toBe('unknown')
  })

  it('reads the expression as a tree: AND takes the worse side, OR the better (finding of 25 Oct)', () => {
    const kind = (v: string) => licenseKind(v, '@x/a', null)
    expect(kind('MIT AND BUSL-1.1')).toBe('proprietary')
    expect(kind('MIT OR BUSL-1.1')).toBe('osi')
    expect(kind('LicenseRef-Private')).toBe('unknown')
    expect(kind('MIT AND LicenseRef-Private')).toBe('unknown')
    expect(kind('CC-BY-NC-3.0')).toBe('unknown')
    expect(kind('PolyForm-Shield-1.0.0')).toBe('unknown')
    expect(kind('Apache-2.0 WITH LLVM-exception')).toBe('osi')
    expect(kind('GPL-3.0-or-later')).toBe('osi')
    expect(kind('GPL-2.0+')).toBe('osi')
    expect(kind('(MIT OR Apache-2.0) AND ISC')).toBe('osi')
    expect(kind('MIT')).toBe('osi')
  })

  it('flags mismatch between sources', () => {
    const base = { packageName: '@x/a', licenseFile: null, moduleInfo: null, integrationTs: null }
    expect(resolveLicense({ ...base, packageJson: 'MIT', integrationTs: 'MIT' }).mismatch).toBe(false)
    expect(resolveLicense({ ...base, packageJson: 'MIT', integrationTs: 'PROPRIETARY' }).mismatch).toBe(true)
    expect(resolveLicense({ ...base, packageJson: 'UNLICENSED', moduleInfo: 'PROPRIETARY' }).mismatch).toBe(false)
    expect(resolveLicense({ ...base, packageJson: null, licenseFile: 'MIT' })).toMatchObject({
      value: 'MIT',
      kind: 'osi',
      mismatch: true,
    })
    expect(resolveLicense({ ...base, packageJson: null })).toMatchObject({
      value: null,
      kind: 'unknown',
      mismatch: false,
    })
  })

  it('reads the LICENSE file of a tarball', async () => {
    const { facts } = await scanTarballBuffer(
      makeTarball([
        ...modulePackage({ name: '@x/lic', id: 'lic_mod', pkg: { license: 'MIT' } }),
        { path: 'package/LICENSE', content: 'Apache License\nVersion 2.0, January 2004\n' },
      ]),
      ctx('npm:@x/lic'),
    )
    expect(facts.license).toMatchObject({
      value: 'MIT',
      mismatch: true,
      sources: { packageJson: 'MIT', licenseFile: 'Apache-2.0' },
    })
    expect(facts.modules[0]?.lint.map((l) => l.code)).toContain('license-mismatch')
  })
})

describe('env and hosts', async () => {
  const f = await scanFiles(
    'net_mod',
    {
      'src/modules/net_mod/lib/client.ts': [
        `const BASE_URL = 'https://api.vendor.com/v2'`,
        `const docsUrl = 'https://docs.vendor.com'`,
        `export const x = { endpoint: 'https://hooks.vendor.com/in', homepage: 'https://vendor.com' }`,
        `export async function call() { return fetch(BASE_URL + '/x', { headers: { a: process.env.VENDOR_KEY ?? '' } }) }`,
        `export const y = new URL(\`https://\${process.env.REGION}.vendor.com\`)`,
        `export const z = 'see https://blog.vendor.com/post for details'`,
        `const { VENDOR_SECRET, NODE_ENV } = process.env`,
        `export const local = fetch('http://localhost:3000')`,
        `export const sample = fetch('https://example.com')`,
        '',
      ].join('\n'),
      'src/modules/net_mod/__tests__/c.test.ts': `fetch('https://test-only.vendor.com'); process.env.TEST_ONLY`,
    },
    { descriptor: { declares: { hosts: ['api.vendor.com'], env: [] } } },
  )
  const m = f.modules[0] as Facts['modules'][number]

  it('reads env names with file and line, skipping tests and NODE_ENV', () => {
    expect(m.config.env).toEqual([
      { name: 'VENDOR_KEY', src: { file: 'src/modules/net_mod/lib/client.ts', line: 4 } },
      { name: 'REGION', src: { file: 'src/modules/net_mod/lib/client.ts', line: 5 } },
      { name: 'VENDOR_SECRET', src: { file: 'src/modules/net_mod/lib/client.ts', line: 7 } },
    ])
  })

  it('reads hosts with confidence and compares them with declares.hosts', () => {
    expect(m.network.hosts.map((h) => [h.host, h.confidence])).toEqual([
      ['api.vendor.com', 'high'],
      ['hooks.vendor.com', 'high'],
    ])
    expect(m.network.undeclared).toEqual(['hooks.vendor.com'])
    expect(m.lint.find((l) => l.code === 'undeclared-hosts')?.message).toBe(
      'Talks to hooks.vendor.com not listed in declares.hosts.',
    )
  })

  it('parses hosts of URL texts', () => {
    expect(hostOf('https://API.Vendor.com:8443/x')).toBe('api.vendor.com')
    expect(hostOf('https://${x}.vendor.com')).toBeNull()
    expect(hostOf('https://127.0.0.1/')).toBeNull()
    expect(hostOf('wss://stream.vendor.io')).toBe('stream.vendor.io')
    expect(hostDeclared('eu.api.vendor.com', ['*.vendor.com'])).toBe(true)
    expect(hostDeclared('vendor.org', ['*.vendor.com'])).toBe(false)
  })
})

describe('env names the code only checks are set (rentgen 4 ifSet)', async () => {
  // the shapes of @fullstackhouse/open-mercato-health 0.3.0 (finding of 25 Oct: its card asked for 18 provider keys)
  const f = await scanFiles('chk_mod', {
    'src/modules/chk_mod/lib/strategies.ts': [
      `export class Ai { isConfigured(): boolean { return Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) } }`,
      `export class Kms { isConfigured(): boolean { const on = process.env.ENCRYPTION_ENABLED === 'true'; return on && Boolean(process.env.VAULT_ADDR && process.env.VAULT_TOKEN) } }`,
      `export const debug = !process.env.QUIET_LOGS`,
      `export const hasRegion = process.env.REGION_X !== undefined`,
      `export function smtp() { if (process.env.SMTP_HOST) return send(process.env.SMTP_HOST); return null }`,
      `export const key = process.env.SERVICE_KEY`,
      `export const url = process.env.PRIMARY_URL || process.env.FALLBACK_URL`,
      `declare function send(h: string): null`,
      '',
    ].join('\n'),
  })
  const env = (f.modules[0] as Facts['modules'][number]).config.env

  it('marks names every read of which only checks they are set', () => {
    expect(env.filter((e) => e.ifSet).map((e) => e.name)).toEqual([
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'ENCRYPTION_ENABLED',
      'VAULT_ADDR',
      'VAULT_TOKEN',
      'QUIET_LOGS',
      'REGION_X',
    ])
  })

  it('keeps a name needed once any read uses its value', () => {
    expect(env.filter((e) => !e.ifSet).map((e) => e.name)).toEqual([
      'SMTP_HOST',
      'SERVICE_KEY',
      'PRIMARY_URL',
      'FALLBACK_URL',
    ])
  })

  it('splits the anatomy lists: env is what the module needs, envIfSet the rest', () => {
    expect(splitEnv(env)).toEqual({
      env: ['SMTP_HOST', 'SERVICE_KEY', 'PRIMARY_URL', 'FALLBACK_URL'],
      envIfSet: [
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'ENCRYPTION_ENABLED',
        'VAULT_ADDR',
        'VAULT_TOKEN',
        'QUIET_LOGS',
        'REGION_X',
      ],
    })
    expect(splitEnv([{ name: 'A_KEY', ifSet: true }, { name: 'A_KEY' }])).toEqual({ env: ['A_KEY'], envIfSet: [] })
  })
})

describe('lint rules (spec 6.6)', () => {
  const pkg = {
    packageName: '@x/a',
    packageVersion: '1.0.0',
    scripts: { postinstall: 'node x.js' },
    bindingGyp: false,
    omPeers: { '@open-mercato/core': '0.8.0' },
    dependencies: { '@tanstack/react-table': '9.2.6', react: '^19.0.0', lodash: '^4' },
    license: { value: 'MIT', mismatch: false, sources: {} },
    shipsTests: false,
    agentsMd: true,
  }

  it('install-scripts unless scriptsRequired, exact pins, range behind, host duplication', () => {
    const codes = lintPackage({
      ...pkg,
      latestOm: '0.9.0',
      templateDeps: { '@tanstack/react-table': '9.3.1', react: '19.2.0' },
    }).map((l) => [l.code, l.severity, l.message])
    expect(codes).toEqual([
      ['install-scripts', 'error', 'Declares install scripts (postinstall) without scriptsRequired in the descriptor.'],
      [
        'peer-exact-pin',
        'warn',
        'Peer dependencies pin Open Mercato exactly (@open-mercato/core 0.8.0), so an app on any other release of Open Mercato gets a Yarn peer warning.',
      ],
      ['peer-range-behind', 'info', 'Built for 0.8.0 does not include Open Mercato 0.9.0.'],
      [
        'host-dependency-duplication',
        'warn',
        'Bundles @tanstack/react-table 9.2.6 while Open Mercato 0.9.0 ships 9.3.1. Two copies break types. Move it to peerDependencies.',
      ],
    ])
    expect(
      lintPackage({ ...pkg, descriptor: { scriptsRequired: { reason: 'Builds a native addon.' } } }).map((l) => l.code),
    ).not.toContain('install-scripts')
  })

  it('E3: prepare counts for a GitHub archive, not for an npm tarball (npm does not run it from the registry)', () => {
    const only = { ...pkg, scripts: { prepare: 'tsc' } }
    expect(lintPackage({ ...only, source: 'npm-tarball' }).map((l) => l.code)).not.toContain('install-scripts')
    expect(lintPackage({ ...only, source: 'github-archive' }).map((l) => [l.code, l.message])).toContainEqual([
      'install-scripts',
      'Declares install scripts (prepare) without scriptsRequired in the descriptor.',
    ])
    const both = lintPackage({ ...pkg, scripts: { prepare: 'tsc', postinstall: 'node x.js' }, source: 'npm-tarball' })
    expect(both.find((l) => l.code === 'install-scripts')?.message).toBe(
      'Declares install scripts (postinstall) without scriptsRequired in the descriptor.',
    )
  })

  it('E4: likely-example is skipped for an official package', async () => {
    const files = { 'src/modules/thin_mod/acl.ts': `export const features = ['thin_mod.view']\n` }
    const scan = async (name: string) =>
      (
        await scanTarballBuffer(makeTarball(modulePackage({ name, id: 'thin_mod', files })), ctx(`npm:${name}`))
      ).facts.modules[0]?.lint.map((l) => l.code) ?? []
    expect(await scan('@x/thin')).toContain('likely-example')
    expect(await scan('@open-mercato/thin')).not.toContain('likely-example')
  })

  it('acl-guards and setup-default-role-features on a module', async () => {
    const f = await scanFiles('guarded', {
      'src/modules/guarded/acl.ts': `export const features = ['guarded.view']\n`,
      'src/modules/guarded/setup.ts': `export const setup = { seed() {} }\n`,
      'src/modules/guarded/api/x/route.ts': `export const metadata = { GET: { requireFeatures: ['guarded.manage'], requireRoles: ['admin'] } }\nexport function GET() {}\n`,
    })
    const lint = f.modules[0]?.lint ?? []
    expect(lint.filter((l) => l.code === 'acl-guards').map((l) => l.message)).toEqual([
      'requireFeatures uses guarded.manage, which acl.ts does not declare.',
      'Uses requireRoles, which the runtime does not enforce. Use requireFeatures.',
    ])
    expect(lint.find((l) => l.code === 'setup-default-role-features')).toMatchObject({
      severity: 'warn',
      src: { file: 'src/modules/guarded/setup.ts', line: 1 },
    })
  })
})

describe('glyph and diff', () => {
  const empty = {
    data: { entities: [], migrations: { count: 0, first: null, last: null }, customEntities: 0 },
    http: { routes: [], legacyRouteFiles: 0, authResolved: 1 },
    ui: { backendPages: [], frontendPages: [], widgets: 0, extensionHosts: 0 },
    events: { emits: [], subscribes: [] },
    background: { workers: [], cli: [] },
    ai: { tools: [], agents: [] },
    extends: [],
  }

  it('levels organs 0, 1, 2-9, 10+ in order D A U E B I X', () => {
    expect(glyphOf(empty)).toBe('0000000')
    const route = {
      method: 'GET' as const,
      path: '/api/x',
      requireAuth: true,
      requireFeatures: [],
      hasOpenApi: true,
      src: { file: 'a', line: 1 },
    }
    expect(
      glyphOf({
        ...empty,
        data: { ...empty.data, migrations: { count: 3, first: null, last: null } },
        http: { ...empty.http, routes: Array.from({ length: 10 }, () => route) },
        extends: [
          { kind: 'widget', target: 'a' },
          { kind: 'widget', target: 'b' },
        ],
      }),
    ).toBe('1300002')
  })

  it('diffs tables, routes, permissions, env and hosts between versions', async () => {
    const v1 = await scanFiles('dif_mod', {
      'src/modules/dif_mod/acl.ts': `export const features = ['dif_mod.view']\n`,
    })
    const v2 = (
      await scanTarballBuffer(
        makeTarball(
          modulePackage({
            name: '@x/t',
            version: '1.1.0',
            id: 'dif_mod',
            files: {
              'src/modules/dif_mod/acl.ts': `export const features = ['dif_mod.view', 'dif_mod.manage']\n`,
              'src/modules/dif_mod/api/open/route.ts': `export const metadata = { GET: { requireAuth: false } }\nexport function GET() { return fetch('https://api.partner.net/x?k=' + process.env.PARTNER_KEY) }\n`,
            },
          }),
        ),
        ctx('npm:@x/t'),
      )
    ).facts
    const d = anatomyDiff(v1, v2)
    expect(d).toEqual({
      from: '1.0.0',
      added: {
        tables: 0,
        routes: 1,
        publicRoutes: 1,
        aclFeatures: 1,
        env: ['PARTNER_KEY'],
        hosts: ['api.partner.net'],
      },
      removed: { tables: 0, routes: 0, aclFeatures: 0 },
    })
    expect(changesPermissions(d)).toBe(true)
    expect(anatomyDiff(null, v2)).toBeNull()
    expect(anatomyDiff(v2, v2)).toBeNull()
  })
})

describe('normalizations seen in real packages', () => {
  it('writes express-style :param paths as [param] (storage-s3 0.9.0)', async () => {
    const f = await scanFiles('param_mod', {
      'src/modules/param_mod/api/put/upload/[token].ts': `export const metadata = { path: '/param/upload/:token' }\nexport async function PUT() {}\n`,
    })
    expect(f.modules[0]?.http.routes.map((r) => `${r.method} ${r.path}`)).toEqual(['PUT /api/param/upload/[token]'])
  })

  it('drops backticks from descriptions instead of rejecting them (channel-apns 0.9.0)', async () => {
    const f = await scanFiles('tick_mod', {
      'src/modules/tick_mod/index.ts':
        'export const metadata = { title: "Ticks", description: "Registers a `push` adapter." }\n',
    })
    expect(f.modules[0]?.description).toBe('Registers a push adapter.')
  })

  it('prefers the latest dist-tag over a stray higher release (sync-akeneo 1.0.1)', () => {
    const versions = { '0.9.0': {}, '1.0.1': {}, '1.0.2': { deprecated: 'mistake' }, '0.10.1-develop.1': {} }
    expect(defaultVersion({ 'dist-tags': { latest: '0.9.0' }, versions })).toBe('0.9.0')
    expect(defaultVersion({ 'dist-tags': { latest: '1.0.2' }, versions })).toBe('1.0.1')
    expect(defaultVersion({ 'dist-tags': { latest: '0.10.1-develop.1' }, versions: { '0.10.1-develop.1': {} } })).toBe(
      '0.10.1-develop.1',
    )
  })
})
