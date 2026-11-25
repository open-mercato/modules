import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBannedChars } from '../../lib/core/text.ts'
import { MANIFEST_PATH } from '../../lib/import-webflow/output.ts'
import { renderReport } from '../../lib/import-webflow/report.ts'
import type { ImportResult } from '../../lib/import-webflow/run.ts'
import {
  fileEntries,
  routeNamespaceProblems,
  WWW_SOURCES,
  wwwSchemas,
  type WwwCollection,
} from '../../lib/schema/www-content.ts'
import { FIXTURE, fakeCdn, importFixture, tempDir, tree } from './helpers.ts'

const dirs: string[] = []
const tmp = (name: string) => {
  const d = tempDir(name)
  dirs.push(d)
  return d
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** Splits a Markdown file into its frontmatter and body. */
function frontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/.exec(text)
  if (!m) throw new Error('no frontmatter')
  return { data: parseYaml(m[1]!) as Record<string, unknown>, body: m[2]! }
}

describe('yarn om import-webflow on the fixture (spec API Contracts)', () => {
  let target: string
  let cache: string
  let result: ImportResult
  let files: Map<string, Buffer>

  beforeAll(async () => {
    target = tmp('site')
    cache = tmp('cache')
    result = await importFixture({ target, mediaCache: cache })
    files = tree(target)
  })

  it('imports every collection of the fixture with nothing stopped', () => {
    expect(result.report.stopped).toEqual([])
    expect(result.exitCode).toBe(0)
    expect(Object.fromEntries([...result.report.counts].map(([c, n]) => [c, n.entries]))).toEqual({
      authors: 5,
      blog: 3,
      blogCategories: 5,
      caseStudies: 1,
      caseStudyCategories: 8,
      jobs: 1,
      landings: 2,
      pages: 1,
      partnerIndustries: 10,
      partnerLanguages: 29,
      partnerLocations: 41,
      partnerServices: 5,
      partnerTiers: 4,
      partners: 2,
      redirects: 6,
    })
  })

  it('writes files every schema accepts, ids that are slugs, and a free route namespace', () => {
    const schemas = wwwSchemas()
    const ids: Partial<Record<WwwCollection, string[]>> = {}
    for (const [collection, source] of Object.entries(WWW_SOURCES) as [
      WwwCollection,
      (typeof WWW_SOURCES)[WwwCollection],
    ][]) {
      if (source.kind === 'entries') {
        const prefix = `www/content/${source.dir}/`
        for (const [path, bytes] of files) {
          if (!path.startsWith(prefix)) continue
          const text = bytes.toString('utf8')
          const data = source.ext === 'md' ? frontmatter(text).data : (parseYaml(text) as Record<string, unknown>)
          const r = schemas[collection].safeParse(data)
          expect(r.success, `${path}: ${JSON.stringify(r.error?.issues)}`).toBe(true)
          ;(ids[collection] ??= []).push(path.slice(prefix.length, -source.ext.length - 1))
        }
      } else {
        const bytes = files.get(`www/content/${source.file}`)
        expect(bytes, source.file).toBeDefined()
        for (const [id, entry] of Object.entries(fileEntries(collection, parseYaml(bytes!.toString('utf8'))))) {
          const r = schemas[collection].safeParse(entry)
          expect(r.success, `${source.file} ${id}: ${JSON.stringify(r.error?.issues)}`).toBe(true)
        }
      }
    }
    expect(routeNamespaceProblems(ids.pages ?? [], ids.landings ?? [])).toEqual([])
    expect(ids.landings?.sort()).toEqual(['baselinker-alternative', 'baselinker-alternatywa'])
  })

  it('leaves no long dash or control character in the written text (A5, check-text)', () => {
    for (const [path, bytes] of files) {
      if (!path.startsWith('www/content/')) continue
      expect(findBannedChars(bytes.toString('utf8')), path).toEqual([])
    }
    expect(result.report.dashes).toBeGreaterThan(0)
  })

  it('writes dates as quoted ISO strings and keeps key order', () => {
    const post = files.get('www/content/blog/wms-module-open-source.md')!.toString('utf8')
    expect(post).toMatch(/^date: '2026-08-10T09:00:00\.000Z'$/m)
    expect(post).toMatch(/^updated: '2026-09-10T07:54:28\.239Z'$/m)
    const keys = Object.keys(frontmatter(post).data)
    expect(keys).toEqual([
      'webflowId',
      'title',
      'description',
      'date',
      'updated',
      'author',
      'category',
      'featured',
      'thumbnail',
      'draft',
    ])
  })

  it('falls back to createdOn when a post has no publication date, and reports it', () => {
    const post = frontmatter(
      files.get('www/content/blog/open-source-erp-odoo-erpnext-open-mercato-comparison.md')!.toString('utf8'),
    )
    expect(typeof post.data.date).toBe('string')
    expect(result.report.notes).toContainEqual({
      item: 'blog/open-source-erp-odoo-erpnext-open-mercato-comparison',
      note: 'no publication date in Webflow, createdOn is used',
    })
  })

  it('converts rich text: the table, the code block and the YouTube video', () => {
    const bench = frontmatter(
      files.get('www/content/blog/coding-agents-benchmark-open-mercato.md')!.toString('utf8'),
    ).body
    expect(bench).toContain('| Code     | Task      |')
    expect(bench).toContain('```\npassed = all functional tests pass')
    const wms = frontmatter(files.get('www/content/blog/wms-module-open-source.md')!.toString('utf8')).body
    expect(wms).toContain('<lite-video id="mBAtuxs4oto" title="WMS OpenMercato walkthrough"></lite-video>')
    expect(wms).not.toContain('__wf_reserved_inherit')
    expect(wms).toMatch(/!\[\]\(\/media\/blog\/[0-9a-f]{24}-[a-z0-9.-]+\.png\)/)
  })

  it('resolves references and options to slugs and stable keys', () => {
    const p = frontmatter(files.get('www/content/partners/10clouds.md')!.toString('utf8')).data
    expect(p).toMatchObject({
      tier: 'agency',
      location: 'poland',
      availability: 'accepting',
      projectsInPortfolio: false,
    })
    expect(p.industries).toEqual(['finance', 'retail'])
    const cs = frontmatter(files.get('www/content/case-studies/arvo-configurator.md')!.toString('utf8')).data
    expect(cs.deliveredBy).toBe('the-good-code')
    expect(cs.heroVideo).toMatch(/^[A-Za-z0-9_-]{11}$/)
    const job = frontmatter(files.get('www/content/jobs/senior-ai-engineering.md')!.toString('utf8')).data
    expect(job).toMatchObject({ employmentType: 'contract', applyUrl: 'mailto:careers@openmercato.com', open: true })
    // dictionaries by order, then name
    const tiers = Object.keys(parseYaml(files.get('www/content/partner-tiers.yaml')!.toString('utf8')))
    expect(tiers).toEqual(['ai-native-core-agency', 'ai-native-expert-agency', 'ai-native-agency', 'agency'])
  })

  it('parses the landings, tokens their counts (A6) and links the Polish one to the English one', () => {
    const pl = parseYaml(files.get('www/content/landings/baselinker-alternatywa.yaml')!.toString('utf8'))
    expect(pl).toMatchObject({
      locale: 'pl',
      kind: 'alternative',
      competitor: 'Base / BaseLinker',
      alternateOf: 'baselinker-alternative',
    })
    expect(pl.hero.proof).toEqual(['MIT open source', '{githubStars} stars on GitHub', '{moduleCount} plugins'])
    expect(pl.capabilities.reviewed).toBe('2026-11-12')
    expect(pl.faq.items.length).toBeGreaterThanOrEqual(3)
    const en = parseYaml(files.get('www/content/landings/baselinker-alternative.yaml')!.toString('utf8'))
    expect(en.locale).toBe('en')
    expect(en.alternateOf).toBeUndefined()
    expect(en.capabilities.groups[0].rows[0]).toMatchObject({ ours: 'yes', theirs: 'no' })
    expect(en.demo.image.src).toMatch(/^\/media\/landings\//)
    expect(result.report.crossChecked.sort()).toEqual(['baselinker-alternative', 'baselinker-alternatywa'])
  })

  it('writes a unique page as copy blocks and skips list routes', () => {
    const contact = parseYaml(files.get('www/content/pages/contact.yaml')!.toString('utf8'))
    expect(contact.blocks.length).toBeGreaterThan(0)
    expect(contact.blocks.every((b: { type: string }) => b.type === 'copy')).toBe(true)
    expect(files.has('www/content/pages/careers.yaml')).toBe(false)
    expect(result.report.notes.some((n) => n.item === 'pages/careers' && n.note.includes('reserved route'))).toBe(true)
  })

  it('writes the docs map with the catch-all last', () => {
    const rules = parseYaml(files.get('www/content/redirects.yaml')!.toString('utf8')) as { from: string; to: string }[]
    const froms = rules.map((r) => r.from)
    expect(froms.slice(0, 2)).toEqual(['/docs', '/documentation'])
    expect(froms.slice(2, -1).sort()).toEqual([
      '/docs/agent-orchestrator-overview',
      '/docs/cli-overview',
      '/docs/user-guide-workflows-user-tasks',
    ])
    expect(froms[froms.length - 1]).toBe('/docs/*')
    expect(rules.find((r) => r.from === '/docs/agent-orchestrator-overview')!.to).toBe('https://docs.openmercato.com/')
    expect(rules.find((r) => r.from === '/docs/cli-overview')!.to).toBe('https://docs.openmercato.com/cli/overview')
  })

  it('writes each media file once under /media/<collection>/<fileId>-<name> and records it in the manifest', () => {
    const media = [...files.keys()].filter((p) => p.startsWith('www/public/media/'))
    expect(media.length).toBe(result.media.files)
    for (const p of media) expect(p).toMatch(/^www\/public\/media\/[a-z-]+\/[0-9a-f]{24}-[a-z0-9.-]+$/)
    const manifest = JSON.parse(files.get(MANIFEST_PATH)!.toString('utf8')) as {
      files: { path: string; sha256: string }[]
    }
    const paths = manifest.files.map((f) => f.path)
    expect(paths).toEqual([...paths].sort())
    expect(paths.length).toBe(files.size - 1)
  })

  it('is deterministic: a second run, and an offline run from the cache, write byte-identical files', async () => {
    const again = tmp('again')
    await importFixture({ target: again, mediaCache: tmp('cache2') })
    const offline = tmp('offline')
    const r = await importFixture({ target: offline, mediaCache: cache, offline: true, fetch: fakeCdn(() => true) })
    expect(r.exitCode).toBe(0)
    for (const other of [tree(again), tree(offline)]) {
      expect([...other.keys()].sort()).toEqual([...files.keys()].sort())
      for (const [p, b] of files) expect(other.get(p)!.equals(b), p).toBe(true)
    }
    // and so is the report (no time, no machine in it)
    const r2 = await importFixture({ target: tmp('offline2'), mediaCache: cache, offline: true })
    expect(renderReport(r2, { check: false, offline: true })).toBe(renderReport(r, { check: false, offline: true }))
  })

  it('--check exits 0 on an up-to-date tree and 1 when the output would change, writing nothing', async () => {
    const ok = await importFixture({ target, mediaCache: cache, offline: true, check: true })
    expect(ok.differs).toBe(false)
    expect(ok.exitCode).toBe(0)
    const fresh = tmp('fresh')
    const bad = await importFixture({ target: fresh, mediaCache: cache, offline: true, check: true })
    expect(bad.exitCode).toBe(1)
    expect(tree(fresh).size).toBe(0)
  })
})

describe('the ownership manifest', () => {
  it('keeps an edited file as a conflict, overwrites it with --force, and never touches foreign files', async () => {
    const target = tempDir('owner')
    const cache = tempDir('owner-cache')
    try {
      await importFixture({ target, mediaCache: cache })
      const post = join(target, 'www/content/blog/wms-module-open-source.md')
      const edited = readFileSync(post, 'utf8').replace('A full WMS module', 'An edited WMS module')
      writeFileSync(post, edited)
      const foreign = join(target, 'www/content/blog/written-by-hand.md')
      writeFileSync(foreign, '---\ntitle: x\n---\n')

      const r = await importFixture({ target, mediaCache: cache, offline: true })
      expect(r.exitCode).toBe(1)
      expect(r.plan!.actions.filter((a) => a.kind === 'conflict').map((a) => a.file.path)).toEqual([
        'www/content/blog/wms-module-open-source.md',
      ])
      expect(readFileSync(post, 'utf8')).toBe(edited)
      expect(readFileSync(foreign, 'utf8')).toBe('---\ntitle: x\n---\n')
      // still a conflict on the next run: the manifest keeps the hash the importer wrote
      const again = await importFixture({ target, mediaCache: cache, offline: true, check: true })
      expect(again.plan!.actions.some((a) => a.kind === 'conflict')).toBe(true)

      const forced = await importFixture({
        target,
        mediaCache: cache,
        offline: true,
        force: new Set(['www/content/blog/wms-module-open-source.md']),
      })
      expect(forced.plan!.actions.filter((a) => a.kind === 'forced').length).toBe(1)
      expect(readFileSync(post, 'utf8')).not.toBe(edited)
      expect(forced.exitCode).toBe(0)
    } finally {
      rmSync(target, { recursive: true, force: true })
      rmSync(cache, { recursive: true, force: true })
    }
  })

  it('reports an item gone from the export and does not delete its file', async () => {
    const target = tempDir('gone')
    const cache = tempDir('gone-cache')
    const exp = tempDir('gone-export')
    try {
      await importFixture({ target, mediaCache: cache })
      cpSync(FIXTURE, exp, { recursive: true })
      const itemsFile = join(exp, 'webflow-raw/items_careers-jobs.json')
      writeFileSync(itemsFile, '[]\n')
      const r = await importFixture({ target, mediaCache: cache, offline: true, exportDir: exp })
      expect(r.plan!.gone.map((g) => g.path)).toEqual(['www/content/jobs/senior-ai-engineering.md'])
      expect(tree(target).has('www/content/jobs/senior-ai-engineering.md')).toBe(true)
    } finally {
      for (const d of [target, cache, exp]) rmSync(d, { recursive: true, force: true })
    }
  })

  it('--only writes the named collections and carries the others in the manifest', async () => {
    const target = tempDir('only')
    const cache = tempDir('only-cache')
    try {
      const full = await importFixture({ target, mediaCache: cache })
      const before = full.plan!.manifest.files.length
      const r = await importFixture({ target, mediaCache: cache, offline: true, only: new Set(['jobs']) })
      expect(r.plan!.actions.every((a) => a.file.path.startsWith('www/content/jobs/'))).toBe(true)
      expect(r.plan!.manifest.files.length).toBe(before)
      expect(r.plan!.gone).toEqual([])
    } finally {
      rmSync(target, { recursive: true, force: true })
      rmSync(cache, { recursive: true, force: true })
    }
  })
})

describe('media failures', () => {
  it('stops the items whose media fail (a 403, an HTML page, a missing cache file offline) and writes the rest', async () => {
    const target = tempDir('fail')
    const cache = tempDir('fail-cache')
    try {
      const r = await importFixture({ target, mediaCache: cache, fetch: fakeCdn((u) => u.includes('10clouds-logo')) })
      expect(r.exitCode).toBe(1)
      expect(r.report.stopped).toEqual([{ item: 'partners/10clouds', why: expect.stringMatching(/HTTP 403$/) }])
      const files = tree(target)
      expect(files.has('www/content/partners/10clouds.md')).toBe(false)
      expect(files.has('www/content/partners/the-good-code.md')).toBe(true)

      const offline = await importFixture({ target: tmp('fail-offline'), mediaCache: tmp('empty'), offline: true })
      expect(offline.report.stopped.length).toBeGreaterThan(0)
      expect(offline.media.errors.length).toBeGreaterThan(0)
      expect(offline.media.errors.every((e) => e.endsWith('not in the media cache (--offline)'))).toBe(true)
      expect(offline.exitCode).toBe(1)
    } finally {
      rmSync(target, { recursive: true, force: true })
      rmSync(cache, { recursive: true, force: true })
    }
  })

  it('refuses bytes that do not match the extension', async () => {
    const cache = tempDir('html-cache')
    try {
      const html = (async () =>
        new Response('<!doctype html><p>oops</p>', { headers: { 'content-type': 'image/png' } })) as typeof fetch
      const r = await importFixture({ target: tmp('html'), mediaCache: cache, fetch: html })
      expect(r.media.errors.length).toBeGreaterThan(0)
      expect(r.media.errors.some((e) => /the bytes are not a \.png file|content type/.test(e))).toBe(true)
    } finally {
      rmSync(cache, { recursive: true, force: true })
    }
  })
})

describe('the landing text cross-check', () => {
  it('stops a landing whose visible text holds words the parsed landing does not', async () => {
    const exp = tempDir('xcheck')
    try {
      cpSync(FIXTURE, exp, { recursive: true })
      const txt = join(exp, 'strony/baselinker-alternative.txt')
      const lines = readFileSync(txt, 'utf8').split('\n')
      // a line the DOM does not hold, inside the FAQ (between a question and its answer)
      const at = lines.findIndex((l) => l.startsWith('Is Open Mercato a drop-in BaseLinker replacement?'))
      lines.splice(at + 1, 0, 'An extra sentence nobody parsed.')
      writeFileSync(txt, lines.join('\n'))
      const r = await importFixture({ target: tmp('xcheck-site'), mediaCache: tmp('xcheck-cache'), exportDir: exp })
      const stop = r.report.stopped.find((s) => s.item === 'landings/baselinker-alternative')
      expect(stop?.why).toMatch(/expected 1 line\(s\) outside the DOM|cross-check failed/)
      expect(r.report.crossChecked).toEqual(['baselinker-alternatywa'])
    } finally {
      rmSync(exp, { recursive: true, force: true })
    }
  })
})
