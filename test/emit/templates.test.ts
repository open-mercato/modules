// Template files of the emitter (docs/specs/2026-10-29-templates.md, Phase 1a step 6) on the module data fixture plus
// the template catalog fixture and what sync wrote for it (test/templates/golden/data/). Golden files of the new
// outputs, and every module output byte-identical to the emit without templates.
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildEmit } from '../../lib/emit/index.ts'
import { mdText } from '../../lib/emit/templates.ts'
import type { SiteMeta } from '../../lib/emit/site-data.ts'
import { TemplateDetail, TemplatesIndex } from '../../lib/schema/published/templates.ts'
import { CATALOG, SHA, TEMPLATE_DATA } from '../templates/world.ts'
import { DATA, fixtureData, json, OPTS, skillsDir, text, tmp } from './helpers.ts'

const pretty = (s: string): string => `${JSON.stringify(JSON.parse(s), null, 2)}\n`
const isTemplateFile = (p: string): boolean =>
  p === 'templates.json' || p.startsWith('t/') || p.startsWith('shots/templates/')

function templateData() {
  const data = tmp('om-tdata-')
  cpSync(DATA, data, { recursive: true })
  cpSync(TEMPLATE_DATA, data, { recursive: true })
  return fixtureData({ data, templates: CATALOG, skills: skills })
}

const skills = skillsDir()
const without = buildEmit(fixtureData({ skills }), OPTS)
const withT = buildEmit(templateData(), OPTS)

describe('templates.json and /t/ pages', () => {
  const index = TemplatesIndex.parse(json(withT, 'templates.json'))

  test('lists active, hold and unmaintained entries of public repositories, in path order', () => {
    expect(index.templates.map((t) => [t.github, t.status, t.slug, t.reason])).toEqual([
      ['acme/b2b-portal', 'active', 'b2b-portal', null],
      ['Acme/Field-CRM', 'active', null, null],
      ['acme/kiosk', 'unmaintained', null, 'The author no longer updates it.'],
      ['open-mercato/ready-app-oss-prm', 'hold', null, 'No license yet, and it pins Open Mercato 0.4.'],
    ])
    expect(index.templates.find((t) => t.github === 'acme/kiosk')?.archived).toBe(true)
  })

  test('each entry names one sha and the facts of that sha', () => {
    const crm = index.templates.find((t) => t.github === 'Acme/Field-CRM')
    expect(crm?.source.sha).toBe(SHA.crm)
    expect(crm?.ref).toBe('main')
    expect(crm?.source.facts?.requiresEnterprise).toBe(true)
    expect(crm?.source.facts?.linesBehind).toBe(2)
    expect(index.templates.find((t) => t.slug === 'b2b-portal')?.source.facts?.requiresEnterprise).toBe(false)
    expect(index.templates.find((t) => t.status === 'hold')?.source.facts?.linesBehind).toBe(5)
    expect(index.templates.every((t) => t.verified === null)).toBe(true)
  })

  test('env keys: the entry declares them, else the manifest of that sha', () => {
    const env = (g: string) => index.templates.find((t) => t.github === g)?.source.facts?.env.map((e) => e.name)
    expect(env('acme/b2b-portal')).toEqual(['OPENAI_API_KEY'])
    expect(env('acme/kiosk')).toEqual(['KIOSK_SCREEN_TOKEN'])
    expect(env('Acme/Field-CRM')).toEqual([])
  })

  test('env descriptions from a manifest are inert in the .md twin', () => {
    expect(mdText('Public URL, e.g. http://localhost:3000')).toBe('Public URL, e.g. http:\\/\\/localhost:3000')
    expect(mdText('Set to `true` for <b>[x](y)</b> *now*\nor www.acme.com')).toBe(
      'Set to \\`true\\` for \\<b\\>\\[x\\](y)\\</b\\> \\*now\\* or www\\.acme.com',
    )
  })

  test('warns about what it leaves out', () => {
    expect(withT.warnings.filter((w) => w.startsWith('templates/'))).toEqual([
      'templates/acme/gone.yml: the repository is deleted or private; left out of templates.json',
    ])
  })

  test('module links of a page: built-in pages for core modules, /m/ for listed catalog entries', () => {
    const b2b = TemplateDetail.parse(json(withT, 't/acme/b2b-portal.json'))
    const page = (id: string) => b2b.source.facts?.modules?.entries.find((m) => m.id === id)?.page
    expect(page('currencies')).toBe('/built-in/currencies')
    expect(page('auth')).toBeNull()
    expect(page('gateway_stripe')).toBe('/m/@open-mercato/gateway-stripe')
    expect(page('ratelimit_probe')).toBeNull()
    expect(b2b.entry.screenshots?.[0]?.src).toBe('/modules/shots/templates/acme/b2b-portal-quotes.png')
    expect(withT.public.has('shots/templates/acme/b2b-portal-quotes.png')).toBe(true)
  })

  test('counts for the site come from templates.json', () => {
    const meta = JSON.parse(withT.site.get('site.json') as string) as SiteMeta
    expect(meta.templates).toEqual({ listed: 4, active: 2, hold: 1, unmaintained: 1 })
    expect(withT.meta.templates).toEqual(meta.templates)
    expect(without.meta.templates).toEqual({ listed: 0, active: 0, hold: 0, unmaintained: 0 })
    expect(JSON.parse(text(without, 'templates.json'))).toEqual({
      schema: 1,
      generatedAt: OPTS.now,
      templates: [],
    })
  })

  test('a slug two entries share is published on neither', () => {
    const data = templateData()
    const kiosk = data.templates?.find((t) => t.path === 'acme/kiosk')
    if (kiosk?.descriptor) kiosk.descriptor = { ...kiosk.descriptor, slug: 'b2b-portal' }
    const r = buildEmit(data, OPTS)
    const slugs = TemplatesIndex.parse(json(r, 'templates.json')).templates.map((t) => t.slug)
    expect(slugs).toEqual([null, null, null, null])
    expect(r.warnings).toContain('slug b2b-portal is used by acme/b2b-portal and acme/kiosk; published without a slug')
  })
})

describe('golden: template files', () => {
  test('templates.json', async () => {
    await expect(pretty(text(withT, 'templates.json'))).toMatchFileSnapshot('golden/public/templates.json')
  })
  for (const p of ['acme/b2b-portal', 'acme/field-crm', 'acme/kiosk', 'open-mercato/ready-app-oss-prm']) {
    test(`t/${p}.json`, async () => {
      await expect(pretty(text(withT, `t/${p}.json`))).toMatchFileSnapshot(`golden/public/t/${p}.json`)
    })
    // `.txt`: check-text scans every `*.md` of the repo (as golden.test.ts)
    test(`t/${p}.md`, async () => {
      await expect(text(withT, `t/${p}.md`)).toMatchFileSnapshot(`golden/public/t/${p}.md.txt`)
    })
  }
})

describe('module outputs do not change with templates', () => {
  test('every published file other than the template files is byte-identical', () => {
    const others = [...withT.public.keys()].filter((p) => !isTemplateFile(p)).sort()
    expect(others).toEqual([...without.public.keys()].filter((p) => !isTemplateFile(p)).sort())
    for (const p of others) expect(withT.public.get(p), p).toEqual(without.public.get(p))
  })

  test('site data other than the template counts and the file list is identical', () => {
    for (const p of ['hive.json', 'plans.json', 'receipts.json']) expect(withT.site.get(p), p).toBe(without.site.get(p))
    const meta = (r: typeof withT) => {
      const { templates: _t, ...rest } = JSON.parse(r.site.get('site.json') as string) as SiteMeta
      return rest
    }
    expect(meta(withT)).toEqual(meta(without))
    const files = (r: typeof withT) =>
      (JSON.parse(r.site.get('files.json') as string) as { path: string }[]).filter((f) => !isTemplateFile(f.path))
    expect(files(withT)).toEqual(files(without))
  })

  test('no warning about template data on the data branch', () => {
    expect(withT.warnings.filter((w) => /^(sync|facts)\/templates\//.test(w))).toEqual([])
    expect(withT.warnings.filter((w) => !w.startsWith('templates/'))).toEqual(without.warnings)
  })
})
