// JSON Schema files published under /schema/*-1.json, generated from Zod (spec 4, 4.6).
// Input schemas (Descriptor, tool inputs) use io 'input' so fields with .default() stay optional;
// published files (modules, facts, receipt, compat) use the default io 'output'.
import { z } from 'zod'
import { Facts } from './data/facts.ts'
import { Receipt } from './data/receipt.ts'
import { Descriptor } from './descriptor.ts'
import { CompatIndex } from './published/compat.ts'
import { ModulesIndex } from './published/modules.ts'
import { TOOLS } from './tools.ts'

export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema'
export const PUBLISHED_SCHEMAS = ['descriptor', 'modules', 'compat', 'facts', 'receipt', 'tools'] as const
export type PublishedSchemaName = (typeof PUBLISHED_SCHEMAS)[number]

type JsonObject = Record<string, unknown>

function stripDialect(schema: JsonObject): JsonObject {
  const { $schema: _ignored, ...rest } = schema
  return rest
}

function pascal(name: string): string {
  return name.replace(/(^|_)([a-z])/g, (_m, _s, c: string) => c.toUpperCase())
}

/** `/schema/tools-1.json`: one $defs entry per tool input and output, plus an `x-tools` map from tool name to them. */
export function toolsJsonSchema(): JsonObject {
  const defs: JsonObject = {}
  const map: Record<string, { input: string; output: string }> = {}
  for (const [name, t] of Object.entries(TOOLS)) {
    const base = pascal(name)
    defs[`${base}Input`] = stripDialect(z.toJSONSchema(t.input, { io: 'input' }) as JsonObject)
    defs[`${base}Output`] = stripDialect(z.toJSONSchema(t.output) as JsonObject)
    map[name] = { input: `#/$defs/${base}Input`, output: `#/$defs/${base}Output` }
  }
  return { $schema: JSON_SCHEMA_DIALECT, title: 'Open Mercato Modules tools@1', $defs: defs, 'x-tools': map }
}

/**
 * descriptor-1.json with the cross-field rules of Descriptor's superRefine that JSON Schema can say (finding of 25 Oct:
 * z.toJSONSchema drops refinements, so `summary: x` or `status: hold` without a reason validated): npm or github, a
 * reason for a status other than active, `extends` only on a provider. Runtime-only, said in CI and /submit: plain
 * text (no URL, markdown, HTML), `enterprise` reserved for @open-mercato/enterprise, and policy/ignore.yml.
 */
export function descriptorJsonSchema(): JsonObject {
  const base = z.toJSONSchema(Descriptor, { io: 'input' }) as JsonObject
  if (base.anyOf !== undefined || base.allOf !== undefined)
    throw new Error('descriptor schema: anyOf/allOf already set')
  return {
    ...base,
    anyOf: [{ required: ['npm'] }, { required: ['github'] }],
    allOf: [
      {
        if: { properties: { status: { enum: ['hold', 'unmaintained', 'delisted'] } }, required: ['status'] },
        then: { required: ['reason'] },
      },
      {
        if: { required: ['extends'] },
        then: { properties: { kind: { const: 'provider' } }, required: ['kind'] },
      },
    ],
  }
}

/**
 * All published JSON Schemas, keyed by name. `siteUrl` (e.g. https://open-mercato.github.io/modules)
 * sets `$id` to `<siteUrl>/schema/<name>-1.json`.
 */
export function publishedJsonSchemas(siteUrl?: string): Record<PublishedSchemaName, JsonObject> {
  const out: Record<PublishedSchemaName, JsonObject> = {
    descriptor: descriptorJsonSchema(),
    modules: z.toJSONSchema(ModulesIndex) as JsonObject,
    compat: z.toJSONSchema(CompatIndex) as JsonObject,
    facts: z.toJSONSchema(Facts) as JsonObject,
    receipt: z.toJSONSchema(Receipt) as JsonObject,
    tools: toolsJsonSchema(),
  }
  for (const name of PUBLISHED_SCHEMAS) {
    const s = out[name]
    out[name] = {
      $schema: JSON_SCHEMA_DIALECT,
      ...(siteUrl ? { $id: `${siteUrl.replace(/\/$/, '')}/schema/${name}-1.json` } : {}),
      ...stripDialect(s),
    }
  }
  return out
}
