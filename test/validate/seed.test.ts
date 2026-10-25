// The 59 starting descriptors (WP03), policy/ignore.yml and policy/builtin-categories.yml against copies of the
// spec tables 11.1, 11.3 and 4.4, plus the offline steps of `yarn om validate` (WP10 took this file over from
// WP03): schema, path = locator, Prettier, texts, typosquat (same scope skipped), reserved names.
// The seed tests read the files `yarn om seed` writes, in a throwaway tree (helpers.ts seedTree), not the live
// modules/**: the catalog grows by pull requests, and a new or edited entry must not fail them (finding of 25 Oct).
// The live modules/** gets the rules every merged pull request keeps (last describe).
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { distance } from 'fastest-levenshtein'
import * as prettier from 'prettier'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { checkFiles, checkSeedTable, SEED } from '../../lib/commands/seed.ts'
import { loadCatalog } from '../../lib/validate/catalog.ts'
import { checkLocal, typosquatHits } from '../../lib/validate/local.ts'
import { errorsOf } from '../../lib/validate/types.ts'
import { findBannedChars, injectionFlags } from '../../lib/core/text.ts'
import type { Descriptor as DescriptorType } from '../../lib/schema/index.ts'
import {
  BuiltinCategoriesFile,
  Descriptor,
  IgnoreFile,
  ReservedFile,
  assertPathMatches,
  descriptorLocator,
} from '../../lib/schema/index.ts'
import { seedTree } from './helpers.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SEED_ROOT = await seedTree()
afterAll(() => rmSync(SEED_ROOT, { recursive: true, force: true }))

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

const filesIn = (root: string) =>
  walk(join(root, 'modules'))
    .map((p) => relative(root, p).split(sep).join('/'))
    .sort()
const files = filesIn(SEED_ROOT)
const descriptors = new Map<string, { rel: string; text: string; d: DescriptorType }>()
for (const rel of files) {
  const text = readFileSync(join(SEED_ROOT, rel), 'utf8')
  const d = Descriptor.parse(parse(text))
  descriptors.set(descriptorLocator(d), { rel, text, d })
}

// Spec 11.1: locator, kind, expected type, category, status.
const T = (
  locator: string,
  kind: DescriptorType['kind'],
  category: DescriptorType['category'],
  status: DescriptorType['status'] = 'active',
) => ({ locator, kind, category, status })
const ch = (n: string) => T(`npm:@open-mercato/channel-${n}`, 'module', 'communication')
const wr = (n: string) => T(`npm:@open-mercato/web-research-${n}`, 'provider', 'ai-automation')
const TABLE_11_1 = [
  T('npm:@open-mercato/ai-assistant', 'module', 'ai-automation'),
  ...['apns', 'discord', 'expo', 'fcm', 'gmail', 'imap', 'resend', 'ses'].map(ch),
  T('npm:@open-mercato/checkout', 'module', 'orders-checkout'),
  T('npm:@open-mercato/content', 'module', 'content-portal'),
  T('npm:@open-mercato/documents', 'module', 'content-portal'),
  T('npm:@open-mercato/enterprise', 'module', 'auth-security'),
  T('npm:@open-mercato/events', 'module', 'storage-infrastructure'),
  T('npm:@open-mercato/gateway-stripe', 'module', 'payments-finance'),
  T('npm:@open-mercato/gateway-tpay', 'module', 'payments-finance'),
  T('npm:@open-mercato/onboarding', 'module', 'content-portal'),
  T('npm:@open-mercato/scheduler', 'module', 'storage-infrastructure'),
  T('npm:@open-mercato/search', 'module', 'search-analytics'),
  T('npm:@open-mercato/storage-s3', 'module', 'storage-infrastructure'),
  T('npm:@open-mercato/sync-akeneo', 'module', 'integrations-sync'),
  T('npm:@open-mercato/telemetry', 'module', 'storage-infrastructure'),
  T('npm:@open-mercato/tillio', 'module', 'communication'),
  T('npm:@open-mercato/webhooks', 'module', 'integrations-sync'),
  T('npm:@open-mercato/web-research', 'library', 'ai-automation'),
  ...['browser', 'exa', 'firecrawl', 'model', 'searxng', 'serp', 'tavily'].map(wr),
  T('npm:@piotrkarwatka/marketing-consents', 'module', 'marketing-loyalty'),
  T('npm:@piotrkarwatka/visits', 'module', 'crm-sales'),
  T('npm:@fastwhitecat/integration-ksef-direct', 'module', 'localization-compliance'),
  T('npm:@freighttech/shipment-tracking', 'module', 'warehouse-shipping'),
  T('npm:@freighttech/terminal-tracking', 'module', 'warehouse-shipping'),
  T('npm:@fullstackhouse/open-mercato-health', 'module', 'storage-infrastructure'),
  T('npm:@fullstackhouse/open-mercato-durable-work', 'module', 'storage-infrastructure'),
  T('npm:@fullstackhouse/open-mercato-data-sync-durable', 'module', 'integrations-sync'),
  T('npm:@northbound-run/sync-shopify', 'module', 'integrations-sync'),
  T('npm:@northbound-run/sync-google-sheets', 'module', 'integrations-sync'),
  T('npm:@northbound-run/channel-cloudflare-email', 'module', 'communication'),
  T('npm:@northbound-run/search-cloudflare', 'module', 'search-analytics'),
  T('npm:@dainamite/cpq', 'module', 'catalog-pricing'),
  T('npm:@dainamite/billing', 'module', 'payments-finance'),
  T('npm:@dainamite/cpq-billing-connector', 'module', 'payments-finance'),
  T('github:Chmarusso/open-mercato-enrichment-treg', 'module', 'crm-sales'),
  T('github:fullstackhouse/open-mercato-client-auth', 'module', 'auth-security'),
  T('npm:@freighttech/ui', 'library', 'devtools'),
  T('npm:@fullstackhouse/open-mercato-demo-auth', 'tool', 'devtools'),
  T('npm:create-mercato-module', 'tool', 'devtools'),
  T('npm:mercato-readiness-scanner', 'tool', 'devtools'),
  T('npm:open-mercato-generator', 'tool', 'devtools'),
  T('npm:@open-mercato/forms', 'module', 'content-portal', 'hold'),
  T('npm:@open-mercato/carrier-inpost', 'module', 'warehouse-shipping', 'hold'),
  T('npm:@open-mercato/gateway-payu', 'module', 'payments-finance', 'hold'),
  T('npm:@open-mercato/gateway-przelewy24', 'module', 'payments-finance', 'hold'),
  T('npm:@open-mercato/pay-by-links', 'module', 'payments-finance', 'hold'),
]

// Spec 4.4 (builtin-categories.yml).
const SPEC_4_4: Record<string, string> = {
  api_docs: 'devtools',
  api_keys: 'auth-security',
  attachments: 'storage-infrastructure',
  audit_logs: 'auth-security',
  auth: 'auth-security',
  availability: 'operations',
  business_rules: 'ai-automation',
  catalog: 'catalog-pricing',
  communication_channels: 'communication',
  configs: 'storage-infrastructure',
  currencies: 'payments-finance',
  customer_accounts: 'content-portal',
  customer_groups: 'crm-sales',
  customers: 'crm-sales',
  dashboards: 'search-analytics',
  data_sync: 'integrations-sync',
  design_system: 'devtools',
  devices: 'communication',
  dictionaries: 'storage-infrastructure',
  directory: 'auth-security',
  ecommerce: 'orders-checkout',
  entities: 'storage-infrastructure',
  eudr: 'localization-compliance',
  feature_toggles: 'devtools',
  forms: 'content-portal',
  inbox_ops: 'ai-automation',
  integrations: 'integrations-sync',
  messages: 'communication',
  notifications: 'communication',
  payment_gateways: 'payments-finance',
  perspectives: 'search-analytics',
  phone_calls: 'communication',
  planner: 'operations',
  portal: 'content-portal',
  progress: 'storage-infrastructure',
  push_notifications: 'communication',
  query_index: 'search-analytics',
  resources: 'operations',
  sales: 'orders-checkout',
  seeds: 'devtools',
  shipping_carriers: 'warehouse-shipping',
  staff: 'operations',
  sync_excel: 'integrations-sync',
  translations: 'localization-compliance',
  warranty_claims: 'operations',
  wms: 'warehouse-shipping',
  workflows: 'ai-automation',
}

// Spec 11.3 (and the old name of the readiness scanner, 11.4 "renamed").
const SPEC_11_3 = [
  'npm:@fast-white-cat/integration-ksef-direct',
  'npm:@sensinum/strapi-plugin-open-mercato',
  'npm:n8n-nodes-open-mercato',
  'github:open-mercato/n8n-nodes',
  'npm:@softiq/tokscale-om',
  'npm:opencode-mercato',
  'npm:@cyberhub/trust-open-mercato-core',
  'github:michalper/open-mercato-marketing-automation',
  'github:dainamite-technologies/dainamite-core',
  ...['shared', 'ui', 'cli', 'cache', 'queue', 'starter', 'client', 'test-package'].map(
    (n) => `npm:@open-mercato/${n}`,
  ),
  'npm:create-mercato-app',
  'npm:@open-mercato/cezar*',
  'npm:cezar-cli',
  'npm:cezar-run',
  'npm:@pat-lewczuk/cezar',
  'npm:mercato-sandbox',
  'github:matgren/oss-prm',
  'github:open-mercato/ready-app-oss-prm',
  'github:open-mercato/need-termin',
  'github:evojam/blueprint-2-quote',
  'github:jkojro/itad-poc',
  'github:RadnoK/open-mercato-open-logistico',
  'github:matchojecki/logistiko-celny',
  'github:itrix-Open-Mercato/open_logistiko',
  'github:FreightTech/open-mercato-modules',
]

describe('the seed descriptors (spec 11.1)', () => {
  it('has exactly the 59 entries of table 11.1, one file each', () => {
    expect(files).toHaveLength(59)
    expect(TABLE_11_1).toHaveLength(59)
    expect([...descriptors.keys()].sort()).toEqual(TABLE_11_1.map((r) => r.locator).sort())
  })

  it('matches kind, category and status of table 11.1', () => {
    for (const row of TABLE_11_1) {
      const { d } = descriptors.get(row.locator)!
      expect({ locator: row.locator, kind: d.kind, category: d.category, status: d.status }).toEqual(row)
    }
  })

  it('every file passes the Descriptor schema and sits at its locator path', () => {
    for (const { rel, d } of descriptors.values()) expect(() => assertPathMatches(rel, d), rel).not.toThrow()
  })

  it('every file is Prettier formatted', async () => {
    for (const { rel, text } of descriptors.values()) {
      const options = (await prettier.resolveConfig(join(SEED_ROOT, rel))) ?? {}
      expect(await prettier.check(text, { ...options, filepath: join(SEED_ROOT, rel), parser: 'yaml' }), rel).toBe(true)
    }
  })

  it('texts: English plain text, whenToUse starts with "Use when ", no long dashes, no injection flags', () => {
    for (const { rel, text, d } of descriptors.values()) {
      expect(findBannedChars(text), rel).toEqual([])
      expect(d.whenToUse.startsWith('Use when '), rel).toBe(true)
      for (const s of [d.summary, d.whenToUse, d.whenNotToUse ?? '']) {
        expect(injectionFlags(s), rel).toEqual([])
        expect(s, rel).toMatch(/^[\x20-\x7e]*$/) // ASCII only: no smart quotes or other look-alikes
        if (s !== '') expect(s.endsWith('.'), rel).toBe(true)
      }
    }
  })

  it('spec 11.1 and 11.4 edge cases', () => {
    const get = (l: string) => descriptors.get(l)!.d
    expect(get('npm:@open-mercato/enterprise').enterprise?.modules).toEqual([
      'agent_orchestrator',
      'record_locks',
      'security',
      'sso',
      'system_status_overlays',
    ])
    expect(get('npm:@open-mercato/gateway-stripe').providers.map((p) => p.name)).toContain('stripe')
    expect(get('npm:@open-mercato/sync-akeneo').providers.map((p) => p.name)).toContain('akeneo')
    expect(get('npm:@northbound-run/sync-shopify').providers.map((p) => p.name)).toContain('shopify')
    for (const n of ['browser', 'exa', 'firecrawl', 'model', 'searxng', 'serp', 'tavily'])
      expect(get(`npm:@open-mercato/web-research-${n}`).extends).toBe('npm:@open-mercato/web-research')
    expect(get('npm:@piotrkarwatka/visits').tags).toContain('example')
    expect(get('npm:@piotrkarwatka/visits').github).toBeUndefined()
    expect(get('npm:@fastwhitecat/integration-ksef-direct').renamedFrom).toEqual([
      'npm:@fast-white-cat/integration-ksef-direct',
    ])
    expect(get('npm:mercato-readiness-scanner').renamedFrom).toEqual(['npm:@open-mercato/readiness-scanner'])
    expect(get('npm:@fullstackhouse/open-mercato-data-sync-durable').replaces).toEqual(['core:data_sync'])
    // fullstackhouse/open-mercato-durable returns 404: no github field on either durable package
    expect(get('npm:@fullstackhouse/open-mercato-data-sync-durable').github).toBeUndefined()
    expect(get('npm:@fullstackhouse/open-mercato-durable-work').github).toBeUndefined()
    expect(get('npm:@open-mercato/forms')).toMatchObject({
      supersededBy: 'core:forms',
      reason: 'Moved into Open Mercato core (open-mercato#6770).',
    })
    // #7081 was merged on 24 Oct; npm has canary and develop builds, no stable release (finding of 25 Oct)
    expect(get('npm:@open-mercato/carrier-inpost').reason).toBe(
      'Moved into the Open Mercato monorepo (open-mercato#7081). No stable release on npm yet.',
    )
    for (const n of ['gateway-payu', 'gateway-przelewy24', 'pay-by-links'])
      expect(get(`npm:@open-mercato/${n}`).reason).toBe('Orphaned canary from March 2026. No source in any repository.')
  })

  it('typosquat (validate step 6): no alarm among the entries; same-scope pairs are skipped', async () => {
    const catalog = await loadCatalog(SEED_ROOT, null)
    for (const e of catalog.entries.values()) expect(typosquatHits(e.d, catalog), e.locator).toEqual([])
    // gateway-payu ~ gateway-tpay and the channel-* family are close but share the @open-mercato scope
    expect(distance('gateway-payu', 'gateway-tpay')).toBe(2)
  })

  it('no entry uses a reserved name and every file passes the offline steps of validate', async () => {
    const reserved = ReservedFile.parse(parse(readFileSync(join(ROOT, 'policy/reserved.yml'), 'utf8'))).names
    for (const { d } of descriptors.values()) {
      const name = (d.npm ?? d.github ?? '').split('/').pop()!
      expect(reserved, name).not.toContain(name)
    }
    const catalog = await loadCatalog(SEED_ROOT, null)
    for (const { rel, text } of descriptors.values()) {
      const r = checkLocal({ file: rel, text }, catalog)
      expect(r.findings, rel).toEqual([])
    }
  })
})

describe('policy/ignore.yml (spec 11.3)', () => {
  const ignore = IgnoreFile.parse(parse(readFileSync(join(ROOT, 'policy/ignore.yml'), 'utf8')))

  it('lists every 11.3 locator with a reason, plus the old scanner name', () => {
    const locators = ignore.map((e) => e.locator)
    expect([...locators].sort()).toEqual([...SPEC_11_3, 'npm:@open-mercato/readiness-scanner'].sort())
    for (const e of ignore) expect(e.reason).toMatch(/^[A-Z].*\.$/)
  })

  it('ignores no listed entry, and renamed entries ignore their old names', () => {
    const listed = new Set([...descriptors.keys()].map((l) => l.toLowerCase()))
    for (const e of ignore) expect(listed.has(e.locator.toLowerCase()), e.locator).toBe(false)
    for (const { d } of descriptors.values())
      for (const old of d.renamedFrom ?? []) expect(ignore.map((e) => e.locator)).toContain(old)
  })
})

describe('policy/builtin-categories.yml (spec 4.4, 11.2)', () => {
  const map = BuiltinCategoriesFile.parse(parse(readFileSync(join(ROOT, 'policy/builtin-categories.yml'), 'utf8')))

  it('equals the spec 4.4 map: 46 core modules plus ecommerce, no widgets', () => {
    expect(map).toEqual(SPEC_4_4)
    expect(Object.keys(map)).toHaveLength(47)
    expect(map).not.toHaveProperty('widgets')
  })

  it('covers every @open-mercato/core module in module-facts.v2.json of the pinned CLI 0.9.0', () => {
    const facts = join(ROOT, 'node_modules/@open-mercato/cli/dist/agentic/guides/module-facts.v2.json')
    expect(existsSync(facts)).toBe(true)
    const all = JSON.parse(readFileSync(facts, 'utf8')) as Record<
      string,
      { sourcePackage?: string; coreVersion?: string }
    >
    const core = Object.entries(all)
      .filter(([, m]) => m.sourcePackage === '@open-mercato/core')
      .map(([id]) => id)
    expect(core).toHaveLength(46)
    expect(Object.values(all).every((m) => m.coreVersion === '0.9.0')).toBe(true)
    expect(Object.keys(map).sort()).toEqual([...core, 'ecommerce'].sort())
  })
})

describe('lib/commands/seed.ts', () => {
  it('has a sound table (59 rows, valid, unique) and writes files that pass schema, path and Prettier', async () => {
    expect(SEED).toHaveLength(59)
    expect(checkSeedTable()).toEqual([])
    expect(await checkFiles(SEED_ROOT)).toEqual([])
  })

  it('names a file that is not in the table, which is every entry added after the seed', async () => {
    const dir = await seedTree()
    try {
      writeFileSync(join(dir, 'modules', '@open-mercato', 'extra.yml'), readFileSync(join(dir, files[0]!), 'utf8'))
      expect((await checkFiles(dir)).some((p) => p.startsWith('modules/@open-mercato/extra.yml: '))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// The live catalog: rules every merged pull request keeps, whatever it adds or edits. They are the error steps of
// the `validate` check (offline part), so `checks` and `validate` agree on a submission.
describe('modules/** as it is now', () => {
  const live = filesIn(ROOT)

  it('has one file per locator', () => {
    expect(live.length).toBeGreaterThan(0)
    const locators = live.map((rel) =>
      descriptorLocator(Descriptor.parse(parse(readFileSync(join(ROOT, rel), 'utf8')))),
    )
    expect(new Set(locators.map((l) => l.toLowerCase())).size).toBe(locators.length)
  })

  it('every file passes the offline steps of validate (schema, path, texts, names) without an error', async () => {
    const catalog = await loadCatalog(ROOT, null)
    for (const rel of live) {
      const r = checkLocal({ file: rel, text: readFileSync(join(ROOT, rel), 'utf8') }, catalog)
      expect(errorsOf(r.findings), rel).toEqual([])
    }
  })
})
