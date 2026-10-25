// Shared setup for test/sources: offline HTTP on test/fixtures/http, the descriptor subset and temp directories.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slimDepsDev } from '../../lib/sources/depsdev.ts'
import { slimSearch, slimTree } from '../../lib/sources/github.ts'
import { createHttp, type Http } from '../../lib/sources/http.ts'
import { slimListing } from '../../lib/sources/jsdelivr.ts'
import { slimPackument } from '../../lib/sources/npm.ts'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const HTTP_FIXTURES = join(ROOT, 'test', 'fixtures', 'http')
/** 16 real entries (recorded on 2026-10-23); terminal-tracking and cpq-billing-connector are left out on purpose. */
export const MODULES = join(ROOT, 'test', 'sources', 'modules')
export const POLICY = join(ROOT, 'test', 'sources', 'policy')
export const NOW = new Date('2026-10-23T04:17:00Z')

export function offlineHttp(): Http {
  return createHttp({
    offline: true,
    fixturesDir: HTTP_FIXTURES,
    slimmers: [slimPackument, slimListing, slimDepsDev, slimTree, slimSearch],
  })
}

export function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), `om-wp04-${prefix}-`))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Types of the subset: spec 11.1 with D-OPEN-6 = no, except open-mercato-generator. */
export const EXPECTED_TYPES: Record<string, 'official' | 'community' | '3rd-party'> = {
  'npm:@open-mercato/gateway-stripe': 'official',
  'npm:@open-mercato/gateway-tpay': 'official',
  'npm:@open-mercato/web-research-exa': 'official',
  'npm:@fastwhitecat/integration-ksef-direct': '3rd-party',
  'npm:@piotrkarwatka/marketing-consents': 'community',
  'npm:@piotrkarwatka/visits': 'community',
  'npm:@fullstackhouse/open-mercato-durable-work': '3rd-party',
  'npm:@fullstackhouse/open-mercato-data-sync-durable': '3rd-party',
  'npm:@freighttech/shipment-tracking': '3rd-party',
  'npm:@dainamite/cpq': '3rd-party',
  'npm:@dainamite/billing': '3rd-party',
  'npm:@northbound-run/sync-shopify': '3rd-party',
  'github:Chmarusso/open-mercato-enrichment-treg': '3rd-party',
  'npm:create-mercato-module': 'official',
  'npm:mercato-readiness-scanner': 'official',
  // 11.1 says 3rd-party; the repository owner mkadziolka is a FilaNovum contributor in certified-partners.yml (D25)
  'npm:open-mercato-generator': 'community',
}
