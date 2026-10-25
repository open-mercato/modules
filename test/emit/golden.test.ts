// Golden files of the emitter on the data fixture (spec 3.5: test/emit/golden/**, updated only with -u in a
// separate commit). JSON is re-indented so a diff reads line by line.
import { describe, expect, test } from 'vitest'
import { fixtureEmit, text } from './helpers.ts'

const pretty = (s: string): string => `${JSON.stringify(JSON.parse(s), null, 2)}\n`

const JSON_FILES = [
  'modules.json',
  'built-in.json',
  'picker.json',
  'compat.json',
  'changes.json',
  'allowlist.json',
  'surface.json',
  '.well-known/mcp/server-card.json',
  '.well-known/agent-skills/index.json',
  'm/@fastwhitecat/integration-ksef-direct.json',
  'm/@fastwhitecat/integration-ksef-direct/receipts.json',
  'badge/@fastwhitecat/integration-ksef-direct.json',
]

const TEXT_FILES = [
  'llms.txt',
  'raw/modules.md',
  'radar/next.md',
  'feed.xml',
  'robots.txt',
  'm/@fastwhitecat/integration-ksef-direct.md',
  'm/@piotrkarwatka/marketing-consents.md',
  'm/@fullstackhouse/open-mercato-data-sync-durable.md',
  'm/@open-mercato/enterprise.md',
  'm/@open-mercato/gateway-tpay.md',
  'm/github/chmarusso/open-mercato-enrichment-treg.md',
  'm/@fast-white-cat/integration-ksef-direct.html',
  'badge/@fastwhitecat/integration-ksef-direct.svg',
  'badge/@piotrkarwatka/marketing-consents.svg',
  'badge/@open-mercato/gateway-tpay.svg',
]

// `.well-known` -> `_well-known` (no hidden folder in the repo); `.md` goldens get `.txt` because they quote the
// author's README verbatim and `check-text` scans every `*.md` file of the repo
const file = (p: string): string => `golden/public/${p.replace(/^\./, '_')}${p.endsWith('.md') ? '.txt' : ''}`

describe('golden: published files', () => {
  const r = fixtureEmit()
  for (const p of JSON_FILES)
    test(p, async () => {
      await expect(pretty(text(r, p))).toMatchFileSnapshot(file(p))
    })
  for (const p of TEXT_FILES)
    test(p, async () => {
      await expect(text(r, p)).toMatchFileSnapshot(file(p))
    })
})

describe('golden: site data', () => {
  const r = fixtureEmit()
  for (const p of ['site.json', 'hive.json'])
    test(p, async () => {
      await expect(r.site.get(p) as string).toMatchFileSnapshot(`golden/data/${p}`)
    })
  test('plans.json (KSeF)', async () => {
    const plans = JSON.parse(r.site.get('plans.json') as string) as Record<string, unknown>
    await expect(
      `${JSON.stringify(plans['npm:@fastwhitecat/integration-ksef-direct'], null, 2)}\n`,
    ).toMatchFileSnapshot('golden/data/plans-ksef.json')
  })
})
