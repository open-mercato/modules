// JSON Schema files published under /schema/*-1.json, generated from Zod (spec 4, 4.6).
// Input schemas (Descriptor, tool inputs) use io 'input' so fields with .default() stay optional;
// published files (modules, facts, receipt, compat) use the default io 'output'.
import { z } from 'zod'
import { Facts } from './data/facts.ts'
import { Receipt } from './data/receipt.ts'
import { Descriptor } from './descriptor.ts'
import { EnvName, GithubRepo, Host, ModuleId } from './common.ts'
import { ScreenshotSrc } from './descriptor.ts'
import { CompatIndex } from './published/compat.ts'
import { ModulesIndex } from './published/modules.ts'
import {
  ModulePackage,
  ReadyPath,
  SmokePath,
  STATUSES_WITH_REASON,
  TemplateName,
  TemplateRef,
  TemplateSlug,
  TemplateStatus,
  TemplateUseCase,
  WHEN_PATTERN,
} from './template.ts'
import { TOOLS } from './tools.ts'

export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema'
export const PUBLISHED_SCHEMAS = [
  'descriptor',
  'modules',
  'compat',
  'facts',
  'receipt',
  'tools',
  'template',
  'mercato-template',
] as const
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
 * text (no URL, markdown, HTML), `enterprise` reserved for @open-mercato/enterprise, policy/ignore.yml, and of
 * `screenshots` the own repository of a raw.githubusercontent.com link and the hosted file (exists, at most 600 KB).
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

/** The `pattern` zod writes for a string schema with one regex (the source of the regex). */
function patternOf(schema: z.ZodType): string {
  const pattern = (z.toJSONSchema(schema) as { pattern?: unknown }).pattern
  if (typeof pattern !== 'string') throw new Error('patternOf: the schema has no single pattern')
  return pattern
}

const HTTPS = { type: 'string', maxLength: 300, pattern: '^https://' }

/**
 * template-1.json, the schema of a catalog entry `templates/<owner>/<repo>.yml`. Written by hand, not with
 * z.toJSONSchema (which drops superRefine), in the keywords the save tool's validator reads (revision 7): the field
 * shapes of TemplateDescriptor, plus the cross-field rules JSON Schema can say (a reason for a status other than
 * active; `smoke.login: false` needs `ready` and one path). Runtime-only, said in CI: plain text, the own repository of
 * a raw.githubusercontent.com screenshot, and every check against GitHub. A test keeps it in step with the zod schema.
 */
export function templateJsonSchema(): JsonObject {
  const github = { type: 'string', pattern: patternOf(GithubRepo) }
  return {
    type: 'object',
    properties: {
      github,
      ref: { type: 'string', minLength: 1, maxLength: 250, pattern: patternOf(TemplateRef) },
      useCase: { enum: [...TemplateUseCase.options] },
      summary: { type: 'string', minLength: 20, maxLength: 140 },
      whenToUse: { type: 'string', minLength: 1, maxLength: 240, pattern: '^Use when [\\s\\S]{31,}$' },
      whenNotToUse: { type: 'string', minLength: 1, maxLength: 160 },
      links: {
        type: 'object',
        properties: {
          docs: HTTPS,
          support: { type: 'string', maxLength: 300, pattern: '^(?:https://|mailto:[^\\s]+$)' },
          demo: HTTPS,
        },
        additionalProperties: false,
      },
      screenshots: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            src: { type: 'string', maxLength: 300, pattern: patternOf(ScreenshotSrc) },
            alt: { type: 'string', minLength: 10, maxLength: 120 },
          },
          required: ['src', 'alt'],
          additionalProperties: false,
        },
      },
      pricing: { enum: ['free'] },
      declares: {
        type: 'object',
        properties: {
          env: {
            type: 'array',
            maxItems: 30,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', pattern: patternOf(EnvName) },
                description: { type: 'string', minLength: 1, maxLength: 240 },
                link: HTTPS,
              },
              required: ['name', 'description'],
              additionalProperties: false,
            },
          },
          hosts: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 253, pattern: patternOf(Host) } },
        },
        additionalProperties: false,
      },
      smoke: {
        type: 'object',
        properties: {
          paths: { type: 'array', maxItems: 5, items: { type: 'string', pattern: patternOf(SmokePath) } },
          login: { type: 'boolean' },
          ready: { type: 'string', maxLength: 200, pattern: patternOf(ReadyPath) },
        },
        additionalProperties: false,
      },
      slug: { type: 'string', maxLength: 64, pattern: patternOf(TemplateSlug) },
      status: { enum: [...TemplateStatus.options] },
      reason: { type: 'string', minLength: 1, maxLength: 200 },
      alternatives: { type: 'array', maxItems: 5, items: github },
      supersededBy: github,
      featured: { type: 'boolean' },
    },
    required: ['github', 'useCase', 'summary', 'whenToUse'],
    additionalProperties: false,
    allOf: [
      {
        if: { properties: { status: { enum: [...STATUSES_WITH_REASON] } }, required: ['status'] },
        then: { required: ['reason'] },
      },
      {
        if: {
          properties: { smoke: { properties: { login: { const: false } }, required: ['login'] } },
          required: ['smoke'],
        },
        then: { properties: { smoke: { properties: { paths: { minItems: 1 } }, required: ['ready', 'paths'] } } },
      },
    ],
  }
}

/**
 * mercato-template-1.json, the schema of the in-repo manifest `mercato-template.json` that the save tool writes and
 * `create-mercato-app` reads. Written by hand like template-1.json; plain text of `description` is runtime-only.
 */
export function templateManifestJsonSchema(): JsonObject {
  return {
    type: 'object',
    properties: {
      schema: { const: 1 },
      name: { type: 'string', maxLength: 214, pattern: patternOf(TemplateName) },
      description: { type: 'string', minLength: 1, maxLength: 350 },
      openMercato: { type: 'string', pattern: '^\\d+\\.\\d+\\.x$' },
      env: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', pattern: patternOf(EnvName) },
            description: { type: 'string', minLength: 1, maxLength: 240 },
            link: HTTPS,
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
      modules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 64, pattern: patternOf(ModuleId) },
            from: { type: 'string', minLength: 1, maxLength: 214 },
            package: { type: 'string', pattern: patternOf(ModulePackage) },
            when: { type: 'string', pattern: WHEN_PATTERN.source },
          },
          required: ['id', 'from'],
          additionalProperties: false,
        },
      },
      createdWith: {
        type: 'object',
        properties: {
          tool: { const: 'create-mercato-template' },
          version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$' },
        },
        required: ['tool', 'version'],
        additionalProperties: false,
      },
    },
    required: ['schema', 'name', 'modules', 'createdWith'],
    additionalProperties: false,
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
    template: templateJsonSchema(),
    'mercato-template': templateManifestJsonSchema(),
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
