import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Descriptor } from '../../lib/schema/index.ts'
import { guessCategory, runDiscover } from '../../lib/sources/discover.ts'
import { parse } from 'yaml'
import { MODULES, NOW, offlineHttp, POLICY, ROOT, tempDir } from './helpers.ts'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((c) => c()))

async function discover() {
  const t = tempDir('discover')
  cleanups.push(t.cleanup)
  return runDiscover({
    http: offlineHttp(),
    root: ROOT,
    modulesDir: MODULES,
    policyDir: POLICY,
    dataDir: join(t.dir, 'data'),
    outDir: join(t.dir, 'out'),
    now: NOW,
    modulesRepo: 'wojciechszyjka/modules',
  })
}

describe('yarn om discover --offline', () => {
  it('finds terminal-tracking and cpq-billing-connector through the maintainer pivot', async () => {
    const r = await discover()
    const tt = r.proposals.find((p) => p.locator === 'npm:@freighttech/terminal-tracking')
    const cbc = r.proposals.find((p) => p.locator === 'npm:@dainamite/cpq-billing-connector')
    expect(tt?.via).toContain('maintainer fto-admin')
    expect(tt?.moduleIds).toEqual(['terminal_tracking'])
    expect(cbc?.via).toContain('maintainer dainamite-acc')
    expect(cbc?.moduleIds).toEqual(['cpq_billing_connector'])
    expect(r.errors).toEqual([])
  })

  it('never proposes ignore.yml entries, existing entries, old names or packages without a module pair', async () => {
    const r = await discover()
    const proposed = r.proposals.map((p) => p.locator)
    for (const l of [
      'npm:@sensinum/strapi-plugin-open-mercato',
      'npm:create-mercato-app',
      'npm:mercato-sandbox',
      'npm:cezar-run',
      'npm:@fast-white-cat/integration-ksef-direct',
      'npm:@fastwhitecat/integration-ksef-direct',
      'npm:@freighttech/shipment-tracking',
      'npm:@freighttech/ui',
    ])
      expect(proposed).not.toContain(l)
    expect(r.skipped.find((s) => s.locator === 'npm:@sensinum/strapi-plugin-open-mercato')?.reason).toBe(
      'policy/ignore.yml',
    )
    expect(r.skipped.find((s) => s.locator === 'npm:@freighttech/ui')?.reason).toBe(
      'no src/modules + dist/modules pair',
    )
    expect(proposed.every((l) => !l.startsWith('npm:@open-mercato/'))).toBe(true)
  })

  it('lists missing official packages with a one-click descriptor link and writes the issue body', async () => {
    const r = await discover()
    expect(r.coverage?.listed).toBe(4)
    const events = r.missingOfficial.find((m) => m.name === '@open-mercato/events')
    expect(
      events?.url.startsWith(
        'https://github.com/wojciechszyjka/modules/new/main?filename=modules%2F%40open-mercato%2Fevents.yml&value=',
      ),
    ).toBe(true)
    expect(r.markdown.indexOf('## Missing official packages')).toBeLessThan(
      r.markdown.indexOf('## Discovered packages'),
    )
    expect(r.markdown).toContain('## Needs attention')
    expect(r.markdown).not.toMatch(/[–—]/)
    // the issue lists only skipped packages that point at Open Mercato (finding of 25 Oct): one found only through a
    // maintainer's other npm work stays in out/discover.json
    const details = r.markdown.slice(r.markdown.indexOf('Checked and skipped'))
    for (const sk of r.skipped) {
      const own = sk.reason === 'policy/ignore.yml' || sk.via.some((v) => !v.startsWith('maintainer '))
      expect(details.includes(`\`${sk.locator}\``), sk.locator).toBe(own)
    }
    // proposals parse as descriptors once a person replaces the TODO texts
    for (const p of r.proposals) {
      const d = parse(p.yaml) as Record<string, unknown>
      expect(
        Descriptor.safeParse({
          ...d,
          summary: 'A summary that is long enough.',
          whenToUse: 'Use when the app needs exactly this module here.',
        }).success,
      ).toBe(true)
    }
  })

  it('guesses a category from the name', () => {
    expect(guessCategory('@freighttech/terminal-tracking')).toBe('warehouse-shipping')
    expect(guessCategory('@dainamite/cpq-billing-connector')).toBe('payments-finance')
    expect(guessCategory('something else')).toBe('operations')
  })
})
