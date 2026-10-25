// Nothing the site publishes points into someone's machine (round 5): preview receipts linked their run as
// file:///Users/<owner>/..., an author's README linked /Users/<author>/... The emitter cleans both, and the build
// fails on any file of dist that still has `file://` or `/Users/` (lib/emit/astro-integration.ts).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { distTexts } from '../../lib/emit/astro-integration.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import { LOCAL_PATH_RE, localPathLeaks, publicReceipt, stripLocalPaths } from '../../lib/emit/local-paths.ts'
import type { Receipt } from '../../lib/schema/data/index.ts'
import { PREVIEW_SENTENCE } from '../../lib/core/source.ts'
import { OPTS, SITE, fixtureData, skillsDir, tmp } from './helpers.ts'

const PREVIEW_RUN = 'file:///Users/someone/kod/om-modules-preview/out/preview/1792747619/artifacts/cell-0123-0.9-a1/'
const README_LINK =
  '2. Enable the module in [`apps/mercato/src/modules.ts`](/Users/author/Projects/app/apps/mercato/src/modules.ts):'

/** The fixture data with every receipt turned into a preview receipt and a README that links a local file. */
function leakyData() {
  const data = fixtureData({ skills: skillsDir() })
  const preview = (r: Receipt): Receipt => ({
    ...r,
    harness: { ...r.harness, runner: 'preview-docker' },
    run: { ...r.run, url: PREVIEW_RUN },
  })
  data.baseline = data.baseline.map(preview)
  for (const [k, list] of data.receipts) data.receipts.set(k, list.map(preview))
  const [loc, byVersion] = [...data.facts][0]!
  const [v, f] = [...byVersion][0]!
  byVersion.set(v, {
    ...f,
    readmeExcerpt: `${f.readmeExcerpt ?? ''}\n${README_LINK}\nSee file:///Users/author/notes.md`,
  })
  data.facts.set(loc, byVersion)
  return data
}

describe('no local paths in published files', () => {
  test('a preview run is published as its receipt page; the runner still says preview-docker', () => {
    const data = leakyData()
    const r = data.baseline[0]!
    const pub = publicReceipt(r, SITE)
    expect(pub.run.url).toBe(`${SITE}/r/${r.id}`)
    expect(pub.harness.runner).toBe('preview-docker')
    // a CI run keeps its Actions link
    const ci = { ...r, run: { ...r.run, url: 'https://github.com/wojciechszyjka/modules/actions/runs/1' } }
    expect(publicReceipt(ci, SITE)).toBe(ci)
  })

  test('a local link in author text keeps its text, a bare file URL and a home folder are cut', () => {
    expect(stripLocalPaths(README_LINK)).toBe('2. Enable the module in `apps/mercato/src/modules.ts`:')
    expect(stripLocalPaths('open file:///Users/a/x.md or /Users/a/y.md')).toBe('open (local file) or ~/y.md')
    expect(stripLocalPaths('no paths here, /home/om-cell stays in logs')).toBe(
      'no paths here, /home/om-cell stays in logs',
    )
  })

  test('the whole emit of preview data publishes no `file://` and no `/Users/`', () => {
    const out = buildEmit(leakyData(), OPTS)
    const texts = [...out.public, ...out.site].map(
      ([path, v]) => [path, typeof v === 'string' ? v : Buffer.from(v).toString('utf8')] as [string, string],
    )
    expect(texts.length).toBeGreaterThan(50)
    expect(localPathLeaks(texts)).toEqual([])
    // the README line is published, without its local link
    expect(texts.some(([, t]) => t.includes('Enable the module in `apps/mercato/src/modules.ts`:'))).toBe(true)
    // the preview receipts are still there, and say so
    const receipts = JSON.parse(out.site.get('receipts.json') as string) as Receipt[]
    expect(receipts.length).toBeGreaterThan(0)
    expect(receipts.every((r) => r.harness.runner === 'preview-docker' && r.run.url.startsWith(`${SITE}/r/`))).toBe(
      true,
    )
    expect(out.public.get('llms.txt')).toContain(PREVIEW_SENTENCE)
  })

  test('the dist check finds a leak in any text file the site serves', () => {
    const dist = tmp('om-dist-')
    try {
      mkdirSync(join(dist, 'r'), { recursive: true })
      writeFileSync(join(dist, 'index.html'), '<p>clean</p>')
      writeFileSync(join(dist, 'r', 'x.json'), JSON.stringify({ run: { url: PREVIEW_RUN } }))
      writeFileSync(join(dist, 'app.js'), 'const p = "/Users/you/my-app"')
      writeFileSync(join(dist, 'logo.png'), Buffer.from([0x89, 0x50]))
      const leaks = localPathLeaks(distTexts(dist)).map((l) => l.path)
      expect(leaks.sort()).toEqual(['app.js', 'r/x.json'])
      expect(LOCAL_PATH_RE.test('/home/om-cell/app/src/a.ts')).toBe(false)
    } finally {
      rmSync(dist, { recursive: true, force: true })
    }
  })
})
