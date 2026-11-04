// modulesFromModulesTs (docs/specs/2026-10-29-templates.md, Phase 1a step 4, revision 7): the contract fixtures the save
// tool create-mercato-template runs too, the scaffold cases the spec lists, and the rules behind them.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_PARSE_BYTES } from '../../lib/rentgen/ast.ts'
import { TemplateManifest, WHEN_PATTERN } from '../../lib/schema/template.ts'
import { modulesFromModulesTs, resolveImport, type ModulesTsInventory } from '../../lib/templates/modules-ts.ts'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'templates', 'modules-from-modules-ts')
const read = (name: string): string => readFileSync(join(DIR, name), 'utf8')

/** `<name>.ts` as src/modules.ts, with the files of `<name>/` as src/<file>. */
function fixture(stem: string): ModulesTsInventory {
  const files = new Map<string, string>()
  if (existsSync(join(DIR, stem)))
    for (const f of readdirSync(join(DIR, stem))) files.set(`src/${f}`, read(join(stem, f)))
  return modulesFromModulesTs(read(`${stem}.ts`), files)
}

const modulesTs = (body: string, initial = "  { id: 'auth', from: '@open-mercato/core' },\n"): string =>
  `export type ModuleEntry = { id: string; from?: string }\n\nexport const enabledModules: ModuleEntry[] = [\n${initial}]\n${body}`

const stems = readdirSync(DIR)
  .filter((n) => n.endsWith('.ts'))
  .map((n) => n.replace(/\.ts$/, ''))
  .sort()

describe('contract fixtures', () => {
  it('pairs every src/modules.ts with its expected result', () => {
    expect(stems).toEqual([
      'conditions',
      'many-entries',
      'mixed-sources',
      'no-list',
      'order',
      'scaffold-e1a6f9de5',
      'scaffold-v0.9.0',
      'unparsed-constructs',
    ])
    for (const stem of stems) expect(existsSync(join(DIR, `${stem}.json`)), stem).toBe(true)
  })

  it.each(stems)('%s', (stem) => {
    const expected = JSON.parse(read(`${stem}.json`)) as ModulesTsInventory
    expect(Object.keys(expected)).toEqual(['entries', 'unparsed'])
    expect(fixture(stem)).toEqual(expected)
    // a reader given only src/modules.ts (the save tool's contract test today) gets the same entries
    expect(modulesFromModulesTs(read(`${stem}.ts`)).entries).toEqual(expected.entries)
  })

  it('keeps the vendored scaffold files byte for byte', () => {
    const rows = [
      ...read('SOURCE.md').matchAll(/^\| `([^`]+)` +\|[^|]+\| `([0-9a-f]{40})` \|[^|]+\| `([0-9a-f]{64})` \|$/gm),
    ]
    expect(rows.map((r) => r[1])).toEqual([
      'scaffold-v0.9.0.ts',
      'scaffold-v0.9.0/official-modules.generated.ts',
      'scaffold-e1a6f9de5.ts',
      'scaffold-e1a6f9de5/official-modules.generated.ts',
    ])
    for (const [, file, , sha256] of rows)
      expect(
        createHash('sha256')
          .update(readFileSync(join(DIR, file!)))
          .digest('hex'),
        file,
      ).toBe(sha256)
  })
})

describe('the scaffold src/modules.ts', () => {
  it.each(['scaffold-v0.9.0', 'scaffold-e1a6f9de5'])(
    '%s: @app, conditional, enterprise and official entries',
    (stem) => {
      const { entries, unparsed } = fixture(stem)
      expect(unparsed).toEqual([])
      const byId = new Map(entries.map((e) => [e.id, e]))
      expect(byId.get('ratelimit_probe')).toEqual({ id: 'ratelimit_probe', from: '@app' })
      expect(byId.get('example_customers_sync')).toEqual({
        id: 'example_customers_sync',
        from: '@app',
        when: 'module:example',
      })
      expect(byId.get('storage_s3')).toEqual({
        id: 'storage_s3',
        from: '@open-mercato/storage-s3',
        when: 'OM_ENABLE_STORAGE_S3',
      })
      expect(byId.get('agent_examples')).toEqual({
        id: 'agent_examples',
        from: '@app',
        when: 'OM_ENABLE_ENTERPRISE_MODULES && OM_ENABLE_ENTERPRISE_MODULES_AGENTS',
      })
      expect(entries.filter((e) => e.from === '@open-mercato/enterprise')).toEqual([
        { id: 'record_locks', from: '@open-mercato/enterprise', when: 'OM_ENABLE_ENTERPRISE_MODULES' },
        { id: 'system_status_overlays', from: '@open-mercato/enterprise', when: 'OM_ENABLE_ENTERPRISE_MODULES' },
        {
          id: 'sso',
          from: '@open-mercato/enterprise',
          when: 'OM_ENABLE_ENTERPRISE_MODULES && OM_ENABLE_ENTERPRISE_MODULES_SSO',
        },
        {
          id: 'security',
          from: '@open-mercato/enterprise',
          when: 'OM_ENABLE_ENTERPRISE_MODULES && OM_ENABLE_ENTERPRISE_MODULES_SECURITY',
        },
        {
          id: 'agent_orchestrator',
          from: '@open-mercato/enterprise',
          when: 'OM_ENABLE_ENTERPRISE_MODULES && OM_ENABLE_ENTERPRISE_MODULES_AGENTS',
        },
      ])
      // commented-out registrations are not entries
      for (const id of ['customer_groups', 'availability', 'channel_discord', 'forms', 'ecommerce', 'gateway_tpay'])
        expect(byId.has(id), id).toBe(false)
      expect(byId.get('auth')).toEqual({ id: 'auth', from: '@open-mercato/core' })
      expect(byId.get('search')).toEqual({ id: 'search', from: '@open-mercato/search' })
      // no truncation (presetFromModulesTs stops at 80 and at the first `]`), no duplicate
      expect(entries[0]!.id).toBe('dashboards')
      expect(entries.length).toBe(70)
      expect(new Set(entries.map((e) => e.id)).size).toBe(70)
    },
  )

  it('lists the official modules loop as unparsed when the imported file is missing', () => {
    const { entries, unparsed } = modulesFromModulesTs(read('scaffold-v0.9.0.ts'))
    expect(entries).toEqual(fixture('scaffold-v0.9.0').entries)
    expect(unparsed).toEqual([{ line: 198, reason: 'the module the array is imported from is not in the snapshot' }])
  })

  it('makes a manifest modules list the schema accepts', () => {
    const { entries } = fixture('scaffold-v0.9.0')
    const manifest = {
      schema: 1,
      name: 'scaffold',
      modules: entries,
      createdWith: { tool: 'create-mercato-template', version: '0.1.0' },
    }
    expect(TemplateManifest.safeParse(manifest).error?.issues ?? []).toEqual([])
  })
})

describe('official modules (follow the import src/modules.ts makes)', () => {
  const loop = (guard: boolean): string =>
    [
      "import { officialModuleEntries } from './official-modules.generated'",
      'for (const entry of officialModuleEntries) {',
      guard ? '  if (!enabledModules.some((existing) => existing.id === entry.id)) enabledModules.push(entry)' : '',
      guard ? '' : '  enabledModules.push(entry)',
      '}',
      '',
    ].join('\n')
  const official = [
    'export const officialModuleEntries: ModuleEntry[] = [',
    "  { id: 'auth', from: '@open-mercato/core' },",
    "  { id: 'gateway_tpay', from: '@open-mercato/gateway-tpay' },",
    "  { id: 'gateway_tpay', from: '@open-mercato/gateway-tpay' },",
    "  { id: 'loyalty' },",
    ']',
    '',
  ].join('\n')

  it('adds the entries of the generated file, the first one per id with the dedupe guard', () => {
    const r = modulesFromModulesTs(modulesTs(loop(true)), new Map([['src/official-modules.generated.ts', official]]))
    expect(r).toEqual({
      entries: [
        { id: 'auth', from: '@open-mercato/core' },
        { id: 'gateway_tpay', from: '@open-mercato/gateway-tpay' },
        { id: 'loyalty', from: '@open-mercato/core' },
      ],
      unparsed: [],
    })
  })

  it('keeps every entry without the guard', () => {
    const r = modulesFromModulesTs(modulesTs(loop(false)), new Map([['src/official-modules.generated.ts', official]]))
    expect(r.entries.map((e) => e.id)).toEqual(['auth', 'auth', 'gateway_tpay', 'gateway_tpay', 'loyalty'])
  })

  it('never reads official-modules.json, and lists an unreadable generated file as unparsed', () => {
    const json = new Map([['src/official-modules.json', '[{"id":"x","from":"@app"}]']])
    expect(modulesFromModulesTs(modulesTs(loop(true)), json).unparsed).toEqual([
      { line: 7, reason: 'the module the array is imported from is not in the snapshot' },
    ])
    const computed = new Map([['src/official-modules.generated.ts', 'export const officialModuleEntries = load()\n']])
    expect(modulesFromModulesTs(modulesTs(loop(true)), computed).unparsed).toEqual([
      { line: 7, reason: 'src/official-modules.generated.ts: the imported array is not an array literal' },
    ])
  })

  it('resolves relative imports inside the app only', () => {
    const files = new Map([
      ['src/official-modules.generated.ts', ''],
      ['lib/x.ts', ''],
      ['src/dir/index.ts', ''],
    ])
    expect(resolveImport(files, './official-modules.generated')).toBe('src/official-modules.generated.ts')
    expect(resolveImport(files, './official-modules.generated.js')).toBe('src/official-modules.generated.ts')
    expect(resolveImport(files, '../lib/x')).toBe('lib/x.ts')
    expect(resolveImport(files, './dir')).toBe('src/dir/index.ts')
    expect(resolveImport(files, '../../outside')).toBeNull()
    expect(resolveImport(files, '@acme/x')).toBeNull()
  })
})

describe('rules', () => {
  it('writes only when values of the manifest grammar', () => {
    for (const stem of stems)
      for (const e of fixture(stem).entries)
        if (e.when !== undefined) expect(WHEN_PATTERN.test(e.when), e.when).toBe(true)
  })

  it('reads a condition outside the grammar as custom, with its line and no source text', () => {
    const body =
      "if (process.env.OM_A === '1' || process.env.OM_B) {\n  enabledModules.push({ id: 'either', from: '@app' })\n}\n"
    const r = modulesFromModulesTs(modulesTs(body))
    expect(r.entries[1]).toEqual({ id: 'either', from: '@app', when: 'custom' })
    expect(r.unparsed).toEqual([
      { line: 6, reason: 'a condition outside the when grammar (entry kept with when: "custom")' },
    ])
    expect(JSON.stringify(r)).not.toContain("=== '1'")
  })

  it('never copies an unreadable from or id into an entry', () => {
    const r = fixture('unparsed-constructs')
    expect(r.entries).toEqual([{ id: 'auth', from: '@open-mercato/core' }])
    expect(JSON.stringify(r)).not.toMatch(/secret|example\.com|Bad_Id|computed_extra/)
  })

  it('reads a file with a syntax error as nothing, with the line of the error', () => {
    expect(modulesFromModulesTs('export const enabledModules = [\n  { id: "auth" \n')).toEqual({
      entries: [],
      unparsed: [{ line: 3, reason: 'src/modules.ts has a syntax error' }],
    })
  })

  it(`does not read a file above ${MAX_PARSE_BYTES} bytes`, () => {
    const big = `${modulesTs('')}// ${'x'.repeat(MAX_PARSE_BYTES)}\n`
    expect(modulesFromModulesTs(big)).toEqual({
      entries: [],
      unparsed: [{ line: 1, reason: `src/modules.ts is larger than ${MAX_PARSE_BYTES} bytes and is not read` }],
    })
  })

  it('reads a file nested too deeply as nothing', () => {
    const deep = modulesTs(`if (${'!'.repeat(200_000)}process.env.OM_A) enabledModules.push({ id: 'x' })\n`)
    expect(modulesFromModulesTs(deep)).toEqual({
      entries: [],
      unparsed: [{ line: 1, reason: 'src/modules.ts is nested too deeply to read' }],
    })
  })
})
