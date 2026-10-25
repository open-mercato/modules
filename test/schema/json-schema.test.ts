import { Validator } from '@cfworker/json-schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as schema from '../../lib/schema/index.ts'
import { PUBLISHED_SCHEMAS, publishedJsonSchemas, toolsJsonSchema } from '../../lib/schema/json-schema.ts'
import { SearchModulesInput } from '../../lib/schema/tools.ts'
import { VALID_DESCRIPTORS, readYaml, walk } from './helpers.ts'

type Json = Record<string, unknown>

function validator(s: Json, ref?: string): Validator {
  if (!ref) return new Validator(s as never, '2020-12', false)
  return new Validator({ ...s, $ref: ref } as never, '2020-12', false)
}

describe('JSON Schema from Zod (spec 4, 4.6)', () => {
  it('generates every exported Zod schema without errors', () => {
    const failures: string[] = []
    let count = 0
    for (const [name, value] of Object.entries(schema)) {
      if (!(value instanceof z.ZodType)) continue
      count++
      for (const io of ['input', 'output'] as const) {
        try {
          z.toJSONSchema(value, { io })
        } catch (err) {
          failures.push(`${name} (${io}): ${(err as Error).message}`)
        }
      }
    }
    expect(count).toBeGreaterThan(40)
    expect(failures).toEqual([])
  })

  it('publishes the six schema files with $id', () => {
    const out = publishedJsonSchemas('https://wojciechszyjka.github.io/modules/')
    expect(Object.keys(out).sort()).toEqual([...PUBLISHED_SCHEMAS].sort())
    for (const name of PUBLISHED_SCHEMAS) {
      expect(out[name].$id).toBe(`https://wojciechszyjka.github.io/modules/schema/${name}-1.json`)
      expect(out[name].$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    }
  })

  it('validates the YAML examples of spec 4.3 with descriptor-1.json (@cfworker/json-schema)', () => {
    const v = validator(publishedJsonSchemas().descriptor)
    const files = walk(VALID_DESCRIPTORS).filter((p) => p.endsWith('.yml'))
    expect(files.length).toBe(8)
    for (const p of files) {
      const r = v.validate(readYaml(p))
      expect(r.errors, p).toEqual([])
      expect(r.valid).toBe(true)
    }
    expect(v.validate({ npm: '@acme/x', category: 'devtools', summary: 'x', whenToUse: 'y', extra: 1 }).valid).toBe(
      false,
    )
    expect(v.validate({ npm: '@acme/x', category: 'crm', summary: 'x', whenToUse: 'y' }).valid).toBe(false)
  })

  it('accepts search_modules({ query }) with tools-1.json because inputs use io input', () => {
    const tools = toolsJsonSchema()
    const v = validator(tools, '#/$defs/SearchModulesInput')
    expect(v.validate({ query: 'send invoices to KSeF' }).valid).toBe(true)
    expect(v.validate({ query: 'send invoices to KSeF', omVersion: '0.9.0' }).valid).toBe(true)
    expect(v.validate({ query: 'deal won', emits: 'customers.deal.won' }).valid).toBe(true)
    expect(v.validate({}).valid).toBe(false)
    expect(v.validate({ query: 'x', limit: 50 }).valid).toBe(false)
    // the default io 'output' would make every .default() field required and reject the call
    const outputMode = new Validator(z.toJSONSchema(SearchModulesInput) as never, '2020-12', false)
    expect(outputMode.validate({ query: 'send invoices to KSeF' }).valid).toBe(false)
  })

  it('maps every tool to an input and output definition', () => {
    const tools = toolsJsonSchema() as { $defs: Json; 'x-tools': Record<string, { input: string; output: string }> }
    expect(Object.keys(tools['x-tools']).sort()).toEqual([
      'check_compat',
      'get_changes',
      'get_module',
      'plan_install',
      'search_modules',
    ])
    for (const t of Object.values(tools['x-tools'])) {
      expect(tools.$defs[t.input.replace('#/$defs/', '')]).toBeTruthy()
      expect(tools.$defs[t.output.replace('#/$defs/', '')]).toBeTruthy()
    }
    expect(validator(tools, '#/$defs/PlanInstallInput').validate({ refs: ['npm:@x/y'] }).valid).toBe(true)
    expect(validator(tools, '#/$defs/GetChangesInput').validate({ since: '2026-10-01T00:00:00Z' }).valid).toBe(true)
  })
})
