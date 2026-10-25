// Built-in modules from module-facts.v2.json of the pinned @open-mercato/cli 0.9.0 (offline: the
// installed copy is used when the version matches).
import { describe, expect, it } from 'vitest'
import { builtinCategories, builtinFromModuleFacts, loadModuleFactsJson } from '../../lib/rentgen/builtin.ts'
import { anatomyCounts } from '../../lib/rentgen/diff.ts'
import { BuiltinData } from '../../lib/schema/data/facts.ts'

// policy/builtin-categories.yml as spec 4.4 lists it (46 core modules of 0.9.0 + ecommerce)
const MAP: Record<string, string> = {
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

const json = await loadModuleFactsJson('0.9.0', { offline: true })
const data = builtinFromModuleFacts(json, '0.9.0', '0.9.0', '2026-10-23T00:00:00.000Z')

describe('scan --builtin 0.9.0 (spec 4.6, 11.2)', () => {
  it('has 46 core modules (count from the data), no widgets, routes not measured', () => {
    expect(BuiltinData.safeParse(data).success).toBe(true)
    expect(data.modules).toHaveLength(46)
    expect(data.modules.map((m) => m.id)).not.toContain('widgets')
    expect(data.routesMeasured).toBe(false)
    expect(anatomyCounts(data.modules, data.routesMeasured).routes).toBeNull()
  })

  it('currencies matches the golden file', async () => {
    const m = data.modules.find((x) => x.id === 'currencies')
    expect(m?.data.entities.map((e) => e.table)).toEqual(['currencies', 'exchange_rates', 'currency_fetch_configs'])
    expect(m?.background.cli).toEqual(['seed', 'fetch-rates', 'list-providers'])
    expect(m?.glyph).toBe('2022200')
    await expect(JSON.stringify(m, null, 2)).toMatchFileSnapshot('golden/builtin-currencies-0.9.0.json')
  })

  it('maps categories; ecommerce (0.10) warns, an unmapped module goes to operations with a warning', () => {
    const full = builtinCategories(data, MAP)
    expect(Object.keys(full.categories)).toHaveLength(46)
    expect(full.categories.currencies).toBe('payments-finance')
    expect(full.warnings).toEqual([
      'policy/builtin-categories.yml lists ecommerce, which is not a core module of 0.9.0.',
    ])
    // round 13: an ID of policy/builtin-upcoming.yml (the develop line only) is not reported, until core ships it
    expect(builtinCategories(data, MAP, ['ecommerce']).warnings).toEqual([])
    expect(builtinCategories(data, MAP, ['ecommerce', 'currencies']).warnings).toEqual([
      'policy/builtin-upcoming.yml lists currencies, which core 0.9.0 ships: remove it there.',
    ])
    const { wms: _wms, ...partial } = MAP
    const missing = builtinCategories(data, partial)
    expect(missing.categories.wms).toBe('operations')
    expect(missing.warnings).toContain(
      'Core module wms (0.9.0) is not in policy/builtin-categories.yml: placed in operations.',
    )
  })
})
