// Template sync (docs/specs/2026-10-29-templates.md, Phase 1a step 5) on the catalog fixture against a fake GitHub: the
// files it writes on the data branch are golden files (test/templates/golden/data/, updated with -u), which the
// emitter tests read back. No network.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, test } from 'vitest'
import { readAllFacts } from '../../lib/fit/data.ts'
import { dataFileRule } from '../../lib/schema/data/index.ts'
import { isTemplateDataPath, TemplateFacts } from '../../lib/schema/data/templates.ts'
import { enterpriseModules, linesBehind } from '../../lib/templates/facts.ts'
import { runTemplateSync, templateFactsFile } from '../../lib/templates/sync.ts'
import { fakeHttp } from '../validate/helpers.ts'
import { NOW, SHA, syncRoot, TEMPLATE_DATA, templateWorld } from './world.ts'

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
}

async function sync(seen: string[] = [], dirs = syncRoot()) {
  const result = await runTemplateSync({
    http: fakeHttp(templateWorld(), seen),
    root: dirs.root,
    templatesDir: dirs.templates,
    dataDir: dirs.data,
    outDir: dirs.out,
    now: NOW,
    only: null,
  })
  return { ...dirs, result }
}

describe('template sync on the fixture', async () => {
  const seen: string[] = []
  const r = await sync(seen)
  const written = walk(r.data)
    .map((f) => relative(r.data, f).split(sep).join('/'))
    .filter((p) => p.startsWith('sync/templates/') || p.startsWith('facts/templates/'))

  test('writes one record per entry and facts per synced sha, each a valid data file', () => {
    expect(written).toEqual([
      `facts/templates/acme/b2b-portal/${SHA.b2b}.json`,
      `facts/templates/acme/field-crm/${SHA.crm}.json`,
      `facts/templates/acme/kiosk/${SHA.kiosk}.json`,
      `facts/templates/open-mercato/ready-app-oss-prm/${SHA.prm}.json`,
      'sync/templates/acme/b2b-portal.json',
      'sync/templates/acme/field-crm.json',
      'sync/templates/acme/gone.json',
      'sync/templates/acme/kiosk.json',
      'sync/templates/acme/old-portal.json',
      'sync/templates/open-mercato/ready-app-oss-prm.json',
    ])
    for (const p of written) {
      expect(isTemplateDataPath(p), p).toBe(true)
      const rule = dataFileRule(p)
      expect(rule?.writer, p).toBe('sync')
      expect(rule?.schema.safeParse(JSON.parse(readFileSync(join(r.data, p), 'utf8'))).error?.issues ?? []).toEqual([])
    }
  })

  for (const p of written)
    test(`golden ${p}`, async () => {
      await expect(readFileSync(join(r.data, p), 'utf8')).toMatchFileSnapshot(join(TEMPLATE_DATA, p))
    })

  test('reads each archive by its sha, never the delisted or deleted repositories', () => {
    const archives = seen.filter((s) => s.includes('codeload.github.com')).sort()
    expect(archives).toEqual(
      [
        `GET https://codeload.github.com/Acme/Field-CRM/tar.gz/${SHA.crm}`,
        `GET https://codeload.github.com/acme/b2b-portal/tar.gz/${SHA.b2b}`,
        `GET https://codeload.github.com/acme/kiosk/tar.gz/${SHA.kiosk}`,
        `GET https://codeload.github.com/open-mercato/ready-app-oss-prm/tar.gz/${SHA.prm}`,
      ].sort(),
    )
    expect(seen.some((s) => s.includes('/repos/acme/old-portal/branches'))).toBe(false)
  })

  test('module readers of the data branch skip the template files', () => {
    const warnings: string[] = []
    const facts = readAllFacts(r.data, (m) => warnings.push(m))
    expect(warnings).toEqual([])
    expect(facts.length).toBeGreaterThan(0)
    expect(facts.some((f) => relative(r.data, f.file).split(sep).includes('templates'))).toBe(false)
  })

  test('says what needs a curator', () => {
    expect(r.result.attention.map((a) => `${a.kind} ${a.github}`)).toEqual([
      'renamed Acme/Field-CRM',
      'gone acme/gone',
      'archived acme/kiosk',
    ])
    expect(r.result.errors).toEqual([])
  })

  test('a second run reads no archive and rewrites nothing but derived values', async () => {
    const again: string[] = []
    const before = new Map(written.map((p) => [p, readFileSync(join(r.data, p), 'utf8')]))
    const second = await sync(again, r)
    expect(again.some((s) => s.includes('codeload.github.com'))).toBe(false)
    expect(second.result.facts).toEqual([])
    for (const p of written) expect(readFileSync(join(r.data, p), 'utf8'), p).toBe(before.get(p))
  })

  test('a new latest stable line refreshes linesBehind from the stored facts, without a download', async () => {
    const dirs = syncRoot()
    await sync([], dirs)
    const lines = JSON.parse(readFileSync(join(dirs.data, 'lines.json'), 'utf8')) as Record<string, unknown>
    writeFileSync(join(dirs.data, 'lines.json'), JSON.stringify({ ...lines, coreLatest: '0.10.0' }))
    const again: string[] = []
    const second = await sync(again, dirs)
    expect(again.some((s) => s.includes('codeload.github.com'))).toBe(false)
    const crm = TemplateFacts.parse(
      JSON.parse(readFileSync(templateFactsFile(dirs.data, 'acme/field-crm', SHA.crm), 'utf8')),
    )
    expect([crm.linesBehind, crm.latestStable]).toEqual([3, '0.10.0'])
    expect(second.result.facts.map((f) => f.sha).sort()).toEqual([SHA.b2b, SHA.crm, SHA.kiosk, SHA.prm].sort())
  })
})

describe('derived template facts', () => {
  test('linesBehind counts minor lines of one major, 0 on or ahead of the latest', () => {
    expect(linesBehind('0.7.2', '0.9.0')).toBe(2)
    expect(linesBehind('0.9.3', '0.9.0')).toBe(0)
    expect(linesBehind('0.10.1-develop.1', '0.9.0')).toBe(0)
    expect(linesBehind('0.9.0', '1.0.0')).toBeNull()
    expect(linesBehind(null, '0.9.0')).toBeNull()
    expect(linesBehind('0.9.0', null)).toBeNull()
  })

  test('the Enterprise mark keys on unconditional modules of an enterprise package (D5, revision 7)', () => {
    const kinds = new Map([['@acme/paid', 'enterprise' as const]])
    const kindOf = (name: string) => kinds.get(name) ?? null
    const modules = [
      { id: 'auth', from: '@open-mercato/core' },
      { id: 'sso', from: '@open-mercato/enterprise', when: 'OM_ENABLE_ENTERPRISE_MODULES' },
      { id: 'paid', from: '@acme/paid' },
      { id: 'own', from: '@app' },
    ]
    expect(enterpriseModules(modules, {}, kindOf)).toEqual(['paid'])
    // no catalog facts for the package: only @open-mercato/enterprise counts, by the catalog's license rule
    expect(enterpriseModules([{ id: 'sso', from: '@open-mercato/enterprise' }], {}, () => null)).toEqual(['sso'])
    expect(enterpriseModules([{ id: 'x', from: '@acme/other' }], {}, () => null)).toEqual([])
    // the catalog says the package is not enterprise
    expect(enterpriseModules([{ id: 'sso', from: '@open-mercato/enterprise' }], {}, () => 'osi')).toEqual([])
  })
})
