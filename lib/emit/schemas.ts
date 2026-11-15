// /schema/{descriptor,modules,compat,facts,receipt,tools}-1.json: JSON Schema generated from the Zod schemas of
// lib/schema (WP01 `publishedJsonSchemas`; inputs with io 'input', published files with io 'output'). Their `$id` is
// the fixed address on SCHEMA_ORIGIN (lib/core/home.ts) whatever the site's address.
import { PUBLISHED_SCHEMAS, publishedJsonSchemas } from '../schema/json-schema.ts'
import type { FileMap } from './types.ts'
import { toPrettyJson } from './util.ts'

export function schemaFiles(): FileMap {
  const schemas = publishedJsonSchemas()
  const out: FileMap = new Map()
  for (const name of PUBLISHED_SCHEMAS) out.set(`schema/${name}-1.json`, toPrettyJson(schemas[name]))
  return out
}
