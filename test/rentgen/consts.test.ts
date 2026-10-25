// Rentgen reads tables, credentials, widgets and env names a module declares through consts of its own package
// (finding of 25 Oct: sync-shopify's table and client secret, gateway-stripe's widget and env, channel-discord's second
// widget were missing while the anatomy said full).
import { describe, expect, it } from 'vitest'
import { anatomyStatus } from '../../lib/rentgen/diff.ts'
import { scanTarballBuffer } from '../../lib/rentgen/extract.ts'
import { anatomySignal } from '../../lib/core/signals.ts'
import { Facts } from '../../lib/schema/data/facts.ts'
import { makeTarball, modulePackage } from './helpers.ts'

const ID = 'sync_shop'
const files: Record<string, string> = {
  [`src/modules/${ID}/lib/constants.ts`]: [
    "export const IDS = { products: 'sync_shop_products' }",
    'export const BUNDLE_ID = IDS.products',
    "export const SNAPSHOTS = 'sync_shop_snapshots'",
    "export { SPOT } from './spots'",
  ].join('\n'),
  [`src/modules/${ID}/lib/spots.ts`]: "export const SPOT = 'integrations.detail:sync_shop'\n",
  [`src/modules/${ID}/data/entities.ts`]: [
    "import { Entity, PrimaryKey } from '@mikro-orm/decorators/legacy'",
    "import { SNAPSHOTS } from '../lib/constants'",
    '@Entity({ tableName: SNAPSHOTS })',
    'export class ShopSnapshot {',
    '  @PrimaryKey() id!: string',
    '}',
  ].join('\n'),
  [`src/modules/${ID}/migrations/Migration20260720120000_sync_shop.ts`]: [
    "import { Migration } from '@mikro-orm/migrations'",
    'export class Migration20260720120000_sync_shop extends Migration {',
    '  override async up(): Promise<void> {',
    `    this.addSql('create table "sync_shop_snapshots" ("id" uuid not null);')`,
    `    this.addSql('create table if not exists "sync_shop_cursors" ("id" uuid not null);')`,
    '  }',
    '}',
  ].join('\n'),
  [`src/modules/${ID}/integration.ts`]: [
    "import { BUNDLE_ID } from './lib/constants'",
    'export const bundle = {',
    "  id: BUNDLE_ID, title: 'Shop',",
    '  credentials: { fields: [',
    "    { key: 'shopDomain', type: 'text', required: true },",
    "    { key: 'clientSecret', type: 'secret', required: true, options: VERSIONS.map((v) => v) },",
    '  ] },',
    '}',
    'function def(id: string, title: string) {',
    "  return { id, title, category: 'data_sync', hub: 'data_sync', providerKey: id }",
    '}',
    "export const integrations = [def(BUNDLE_ID, 'Shop products')]",
  ].join('\n'),
  [`src/modules/${ID}/widgets/injection-table.ts`]: [
    "import { SPOT } from '../lib/constants'",
    'const computed = makeSpot()',
    'export const injectionTable = {',
    "  'profile:connect': [{ widgetId: 'sync_shop.injection.connect', priority: 1 }],",
    "  [computed]: [{ widgetId: 'sync_shop.injection.config', kind: 'tab' }],",
    "  [SPOT]: [{ widgetId: 'sync_shop.injection.status' }],",
    '}',
  ].join('\n'),
  [`src/modules/${ID}/lib/preset.ts`]: [
    'function readEnvValue(env: NodeJS.ProcessEnv, keys: string[]) { return keys.map((k) => env[k]).find(Boolean) }',
    'export function readPreset(env: NodeJS.ProcessEnv = process.env) {',
    "  const keys = { secret: ['OM_SYNC_SHOP_SECRET', 'SYNC_SHOP_SECRET'] }",
    "  const states = ['ACTIVE', 'PAUSED']",
    '  return readEnvValue(env, [...keys.secret])',
    '}',
    "export const LABELS = ['NOT_AN_ENV_NAME_OUTSIDE']",
  ].join('\n'),
}

describe('consts of the package', () => {
  it('reads the table, the bundle credentials, every injection widget and the env key lists', async () => {
    const tgz = makeTarball(modulePackage({ name: '@x/sync-shop', id: ID, files }))
    const { facts } = await scanTarballBuffer(tgz, {
      locator: 'npm:@x/sync-shop',
      source: 'npm-tarball',
      integrity: null,
      gitRef: null,
    })
    const f = Facts.parse(facts)
    const m = f.modules[0]!
    expect(m.data.entities.map((e) => [e.id, e.table])).toEqual([
      ['sync_shop:shop_snapshot', 'sync_shop_snapshots'],
      ['sync_shop:sync_shop_cursors', 'sync_shop_cursors'],
    ])
    expect(m.data.entities[0]!.src).toEqual({ file: `src/modules/${ID}/data/entities.ts`, line: 3 })
    expect(m.config.credentials).toEqual([
      { key: 'shopDomain', type: 'text', required: true },
      { key: 'clientSecret', type: 'secret', required: true },
    ])
    expect(f.coverage.integrationTs).toBe('expanded')
    expect(m.ui.widgets).toBe(3)
    expect(m.config.env.map((e) => e.name)).toEqual(['OM_SYNC_SHOP_SECRET', 'SYNC_SHOP_SECRET'])
  })

  it('an integration.ts Rentgen cannot read keeps the anatomy partial', async () => {
    const tgz = makeTarball(modulePackage({ name: '@x/sync-shop', id: ID, files }))
    const { facts } = await scanTarballBuffer(tgz, {
      locator: 'npm:@x/sync-shop',
      source: 'npm-tarball',
      integrity: null,
      gitRef: null,
    })
    const f = Facts.parse(facts)
    const unread = { ...f, coverage: { ...f.coverage, integrationTs: 'unparsed' as const } }
    expect(anatomyStatus(f)).toBe('full')
    expect(anatomyStatus(unread)).toBe('partial')
    expect(anatomySignal(f, false)).toBe('full')
    expect(anatomySignal(unread, false)).toBe('partial')
  })
})
