// Templates (docs/specs/2026-10-29-templates.md, Phase 1a step 1): the entry and manifest schemas, their key order,
// the path helpers and the hand-written JSON Schemas, which the save tool create-mercato-template vendors (revision 7).
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Validator } from '@cfworker/json-schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DEFAULT_SITE_URL } from '../../lib/core/home.ts'
import { schemaFiles } from '../../lib/emit/schemas.ts'
import { EnvName, ModuleId } from '../../lib/schema/common.ts'
import { publishedJsonSchemas } from '../../lib/schema/json-schema.ts'
import {
  TEMPLATE_CURATOR_FIELDS,
  TEMPLATE_KEY_ORDER,
  TEMPLATE_MANIFEST_KEY_ORDER,
  TemplateDescriptor,
  TemplateManifest,
  WHEN_PATTERN,
  templateFile,
  templatePagePath,
} from '../../lib/schema/template.ts'
import { FIXTURES, readJson, readYaml, rel, walk } from './helpers.ts'

type Json = Record<string, unknown>

const ENTRIES = join(FIXTURES, 'templates', 'entries')
const MANIFESTS = join(FIXTURES, 'templates', 'manifests')
const validEntries = walk(join(ENTRIES, 'valid')).filter((p) => p.endsWith('.yml'))
const invalidEntries = walk(join(ENTRIES, 'invalid')).filter((p) => p.endsWith('.yml'))

const schemas = publishedJsonSchemas(DEFAULT_SITE_URL)
const entrySchema = new Validator(schemas.template as never, '2020-12', false)
const manifestSchema = new Validator(schemas['mercato-template'] as never, '2020-12', false)

/** Issue paths of a failed parse, joined with dots, plus the keys of unrecognized_keys issues. */
function issuePaths(r: { error?: z.ZodError }): string[] {
  return (r.error?.issues ?? []).flatMap((i) => [
    i.path.join('.'),
    ...(i.code === 'unrecognized_keys' ? (i as { keys: string[] }).keys : []),
  ])
}

describe('TemplateDescriptor', () => {
  it('has the fixture entries', () => {
    expect(validEntries.map((p) => rel(join(ENTRIES, 'valid'), p)).sort()).toEqual([
      'templates/acme/b2b-portal.yml',
      'templates/acme/field-crm.yml',
      'templates/acme/kiosk.yml',
      'templates/open-mercato/ready-app-oss-prm.yml',
    ])
  })

  it.each(validEntries.map((p) => [rel(join(ENTRIES, 'valid'), p), p]))('accepts %s at its path', (relPath, p) => {
    const raw = readYaml(p)
    const r = TemplateDescriptor.safeParse(raw)
    expect(r.error?.issues ?? []).toEqual([])
    expect(templateFile(r.data!.github)).toBe(relPath)
    expect(entrySchema.validate(raw).errors).toEqual([])
  })

  it('applies defaults', () => {
    const d = TemplateDescriptor.parse(readYaml(join(ENTRIES, 'valid', 'templates', 'acme', 'field-crm.yml')))
    expect(d).toMatchObject({ pricing: 'free', status: 'active', featured: false })
  })

  // rules JSON Schema cannot say: plain text and the own repository of a raw.githubusercontent.com image
  const RUNTIME_ONLY = new Set(['summary-url.yml', 'screenshot-other-repo.yml'])

  it.each(invalidEntries.map((p) => [basename(p), p]))('rejects %s', (name, p) => {
    const header = readFileSync(p, 'utf8').split('\n')[0] ?? ''
    const m = /^# expect-(path|message): (.+)$/.exec(header)
    expect(m, `missing expectation header in ${p}`).not.toBeNull()
    const raw = readYaml(p)
    const r = TemplateDescriptor.safeParse(raw)
    expect(r.success).toBe(false)
    if (m![1] === 'path') {
      const field = m![2]!.trim()
      expect(
        issuePaths(r).some((path) => path === field || path.startsWith(`${field}.`)),
        JSON.stringify(r.error?.issues),
      ).toBe(true)
    } else expect(r.error!.issues.map((i) => i.message).join('\n')).toContain(m![2]!.trim())
    expect(entrySchema.validate(raw).valid, 'template-1.json').toBe(RUNTIME_ONLY.has(name))
  })
})

describe('TemplateManifest', () => {
  const valid = walk(join(MANIFESTS, 'valid')).filter((p) => p.endsWith('.json'))
  // the field each broken manifest gets wrong
  const INVALID: Record<string, string> = {
    'env-with-value.json': 'env',
    'missing-created-with.json': 'createdWith',
    'missing-modules.json': 'modules',
    'module-id.json': 'modules',
    'module-without-from.json': 'modules',
    'name-not-slug.json': 'name',
    'open-mercato-line.json': 'openMercato',
    'other-tool.json': 'createdWith',
    'package-without-version.json': 'modules',
    'schema-2.json': 'schema',
    'unknown-field.json': 'seeds',
    'when-or.json': 'modules',
    'when-source-text.json': 'modules',
  }

  it.each(valid.map((p) => [basename(p), p]))('accepts %s', (_name, p) => {
    const raw = readJson(p)
    expect(TemplateManifest.safeParse(raw).error?.issues ?? []).toEqual([])
    expect(manifestSchema.validate(raw).errors).toEqual([])
  })

  it('has an expectation for every broken manifest', () => {
    const files = walk(join(MANIFESTS, 'invalid')).map((p) => basename(p))
    expect(files.sort()).toEqual(Object.keys(INVALID).sort())
  })

  it.each(Object.entries(INVALID))('rejects %s', (name, field) => {
    const raw = readJson(join(MANIFESTS, 'invalid', name))
    const r = TemplateManifest.safeParse(raw)
    expect(r.success).toBe(false)
    expect(issuePaths(r).some((path) => path === field || path.startsWith(`${field}.`))).toBe(true)
    expect(manifestSchema.validate(raw).valid, 'mercato-template-1.json').toBe(false)
  })

  it('takes the when grammar and nothing else', () => {
    for (const when of [
      'OM_ENABLE_STORAGE_S3',
      '!OM_ENABLE_STORAGE_S3',
      'module:example',
      '!module:example_customers',
      'OM_ENABLE_ENTERPRISE_MODULES && OM_ENABLE_ENTERPRISE_MODULES_SSO',
      'OM_A && !module:b && OM_C',
      'custom',
    ])
      expect(WHEN_PATTERN.test(when), when).toBe(true)
    for (const when of [
      '',
      'OM_A || OM_B',
      'OM_A&&OM_B',
      'OM_A &&  OM_B',
      '!!OM_A',
      'om_a',
      'module:Example',
      'module:',
      'custom && OM_A',
      '!custom',
      'A',
      ' OM_A',
    ])
      expect(WHEN_PATTERN.test(when), when).toBe(false)
    // the terms are EnvName and ModuleId of common.ts
    const unanchored = (s: z.ZodType) => (z.toJSONSchema(s) as { pattern: string }).pattern.replace(/^\^|\$$/g, '')
    expect(WHEN_PATTERN.source).toContain(`!?(?:${unanchored(EnvName)}|module:${unanchored(ModuleId)})`)
  })
})

describe('key order and paths', () => {
  it('orders every field of the entry and the manifest', () => {
    expect([...TEMPLATE_KEY_ORDER].sort()).toEqual(Object.keys(TemplateDescriptor.shape).sort())
    expect([...TEMPLATE_MANIFEST_KEY_ORDER].sort()).toEqual(Object.keys(TemplateManifest.shape).sort())
    for (const k of TEMPLATE_CURATOR_FIELDS) expect(TEMPLATE_KEY_ORDER).toContain(k)
  })

  it('puts a template at its lower-case GitHub path', () => {
    expect(templateFile('Acme/Field-CRM')).toBe('templates/acme/field-crm.yml')
    expect(templatePagePath('Acme/Field-CRM')).toBe('/t/acme/field-crm')
    expect(templateFile('open-mercato/ready-app-oss-prm')).toBe('templates/open-mercato/ready-app-oss-prm.yml')
    for (const bad of ['acme', 'acme/x/y', '../x', 'github:acme/x', '-acme/x']) {
      expect(() => templateFile(bad), bad).toThrow(/invalid github repo/)
      expect(() => templatePagePath(bad), bad).toThrow(/invalid github repo/)
    }
  })
})

describe('template-1.json and mercato-template-1.json', () => {
  it('say the same fields and required fields as the zod schemas', () => {
    for (const [schema, zod] of [
      [schemas.template, TemplateDescriptor],
      [schemas['mercato-template'], TemplateManifest],
    ] as const) {
      const generated = z.toJSONSchema(zod, { io: 'input' }) as Json
      expect(Object.keys(schema.properties as Json)).toEqual(Object.keys(generated.properties as Json))
      expect([...(schema.required as string[])].sort()).toEqual([...(generated.required as string[])].sort())
      expect(schema.additionalProperties).toBe(false)
    }
  })

  it('use only the keywords the save tool validates, plus allOf, if and then for the status rule', () => {
    const used = new Set<string>()
    const visit = (node: unknown, inProperties = false): void => {
      if (Array.isArray(node)) return node.forEach((n) => visit(n))
      if (node === null || typeof node !== 'object') return
      for (const [k, v] of Object.entries(node)) {
        if (!inProperties) used.add(k)
        visit(v, !inProperties && k === 'properties')
      }
    }
    visit(schemas.template)
    visit(schemas['mercato-template'])
    // create-mercato-template test/helpers/json-schema.cjs knows these, and throws on any other keyword
    const tool = [
      '$schema',
      '$id',
      'type',
      'const',
      'enum',
      'properties',
      'required',
      'additionalProperties',
      'items',
      'minItems',
      'maxItems',
      'pattern',
      'minLength',
      'maxLength',
    ]
    expect([...used].sort()).toEqual([...tool, 'allOf', 'if', 'then'].sort())
  })

  it('compile every pattern with the u flag, as JSON Schema validators do', () => {
    const patterns: string[] = []
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(visit)
      if (node === null || typeof node !== 'object') return
      for (const [k, v] of Object.entries(node)) if (k === 'pattern' && typeof v === 'string') patterns.push(v)
      Object.values(node).forEach(visit)
    }
    visit(schemas.template)
    visit(schemas['mercato-template'])
    expect(patterns.length).toBeGreaterThan(10)
    for (const p of patterns) expect(() => new RegExp(p, 'u'), p).not.toThrow()
  })

  // the files the site publishes at /schema/, from the emitter itself; update with `-u` in a separate commit
  for (const name of ['template-1.json', 'mercato-template-1.json'])
    it(`publishes ${name}`, async () => {
      const text = String(schemaFiles(DEFAULT_SITE_URL).get(`schema/${name}`))
      expect(JSON.parse(text).$id).toBe(`https://modules.openmercato.com/schema/${name}`)
      await expect(text).toMatchFileSnapshot(`golden/${name}`)
    })
})
