// Live-site review of 30 Oct, item 2: `search_modules` with `invoices` listed a broken, refused entry first and no
// built-in, while core `sales` has the tables sales_invoices and sales_invoice_lines and the permission
// sales.invoices.manage. The site, the MCP Worker and the CLI share this ranking (lib/core/search.ts).
import { describe, expect, it } from 'vitest'
import { buildSearchIndex, loadSearchIndex, searchModules, type SearchIndexData } from '../../lib/core/search.ts'
import { SearchModulesOutput } from '../../lib/schema/tools.ts'
import { corpusBuiltIn, corpusEntries, loadFixture, NOW, SITE } from './helpers.ts'

const fx = loadFixture()
const meta = { lines: fx.lines.lines, dataVersion: '1.0.0-202610300940.habcdef', generatedAt: NOW, site: SITE }
const corpus = (): SearchIndexData =>
  JSON.parse(
    JSON.stringify(buildSearchIndex({ entries: corpusEntries(), builtIn: corpusBuiltIn(), ...meta })),
  ) as SearchIndexData
const corpusIdx = loadSearchIndex(corpus())

const BILLING = 'npm:@dainamite/billing'
const KSEF = 'npm:@fastwhitecat/integration-ksef-direct'
const AT = '2026-10-30T09:17:00Z'

/** The corpus with the statuses of the live data on 30 Oct: billing broken and refused on 0.9, KSeF verified. */
function liveLike(): ReturnType<typeof loadSearchIndex> {
  const data = corpus()
  const billing = data.modules[BILLING]!
  billing.lines['0.9'] = { status: 'broken', at: AT }
  billing.policy['0.9'] = { decision: 'refuse', reasons: [{ code: 'BROKEN', text: 'Broken on 0.9.' }] }
  data.modules[KSEF]!.lines['0.9'] = { status: 'verified', at: AT }
  return loadSearchIndex(data)
}

describe('built-in modules are found by their tables, events and permissions', () => {
  it.each(['invoices', 'invoice'])('%s lists core sales in the built-in group', (query) => {
    const r = searchModules(corpusIdx, { query })
    expect(SearchModulesOutput.safeParse(r).success).toBe(true)
    const sales = r.builtIn.find((b) => b.id === 'sales')
    expect(sales).toBeDefined()
    expect(sales!.matchedOn.some((m) => /^(entity|permission|event) .*invoice/.test(m))).toBe(true)
  })

  it('with the live statuses: sales is in the built-in group and the refused entry is not the first result', () => {
    const r = searchModules(liveLike(), { query: 'invoices' })
    expect(r.builtIn.map((b) => b.id)).toContain('sales')
    expect(r.results.map((c) => c.locator)).toEqual([KSEF, BILLING])
    expect(r.results[1]).toMatchObject({ status: 'broken', agentPolicy: { decision: 'refuse' } })
  })

  it('the built-in group comes first in the answer, as the server instructions say', () => {
    const keys = Object.keys(searchModules(corpusIdx, { query: 'invoices' }))
    expect(keys.indexOf('builtIn')).toBeLessThan(keys.indexOf('results'))
  })

  it('a word a module owns by name does not pull in a built-in that only has it in an identifier', () => {
    // shipping_carriers has carrier webhooks; the answer to `webhooks` is the webhooks package
    const r = searchModules(corpusIdx, { query: 'webhooks' })
    expect(r.results[0]?.locator).toBe('npm:@open-mercato/webhooks')
    expect(r.builtIn.map((b) => b.id)).not.toContain('shipping_carriers')
  })
})
