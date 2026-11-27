// Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 2.2: the content model of the Strapi project in cms/ and the
// mapping of lib/www-cms/model.ts are the same model. The test reads cms/src/api/*/content-types/*/schema.json and
// cms/src/components/*/*.json as plain JSON (no Strapi import) and compares every type and component with the mapping
// of the same commit: the set of types and components, each attribute's name, order, Strapi type, component,
// repetition, relation and media kind, and the values of an enumeration the mapping holds. A pull request that changes
// one side without the other is red here. The field rules (required, regex, enums from the Zod schemas, max) live in
// the JSON only.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPONENTS, TYPES, type Field, type StrapiType } from '../../lib/www-cms/model.ts'

const CMS = join(import.meta.dirname, '..', '..', 'cms', 'src')

type Attribute = Record<string, unknown> & { type: string }
interface Schema {
  kind?: string
  collectionName: string
  info: Record<string, string>
  options: Record<string, unknown>
  attributes: Record<string, Attribute>
}

const read = (p: string): Schema => JSON.parse(readFileSync(p, 'utf8')) as Schema
const dirs = (p: string): string[] =>
  existsSync(p)
    ? readdirSync(p, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : []

/** The types of cms/src/api by API id, and the components of cms/src/components by uid. */
const strapiTypes = new Map<string, Schema>(
  dirs(join(CMS, 'api')).flatMap((api) =>
    dirs(join(CMS, 'api', api, 'content-types')).map(
      (ct) => [ct, read(join(CMS, 'api', api, 'content-types', ct, 'schema.json'))] as const,
    ),
  ),
)
const strapiComponents = new Map<string, Schema>(
  dirs(join(CMS, 'components')).flatMap((cat) =>
    readdirSync(join(CMS, 'components', cat))
      .filter((f) => f.endsWith('.json'))
      .map((f) => [`${cat}.${f.slice(0, -'.json'.length)}`, read(join(CMS, 'components', cat, f))] as const),
  ),
)

/** What the mapping says an attribute is: the structural keys only, never a field rule. */
type Shape = Record<string, unknown>

function shapes(fields: readonly Field[]): [string, Shape][] {
  return fields.flatMap((f): [string, Shape][] => {
    switch (f.kind) {
      case 'scalar':
        return [
          [f.name ?? f.key, { type: f.type, ...(f.values ? { enum: Object.values(f.values) } : {}) } satisfies Shape],
        ]
      case 'media':
        return [[f.name ?? f.key, { type: 'media', multiple: false }]]
      case 'relation':
        return [
          [
            f.key,
            { type: 'relation', relation: f.many ? 'manyToMany' : 'manyToOne', target: `api::${f.target}.${f.target}` },
          ],
        ]
      case 'lines':
        return [[f.key, { type: 'component', component: 'shared.line', repeatable: true }]]
      case 'component':
        return [[f.name ?? f.key, { type: 'component', component: f.component, repeatable: f.repeatable === true }]]
      case 'pair':
        return f.names.map((n): [string, Shape] => [
          n,
          f.component ? { type: 'component', component: f.component, repeatable: false } : { type: 'string' },
        ])
      case 'flat':
        return f.fields.map(([, n]): [string, Shape] => [n, { type: 'string' }])
      case 'zone':
        return [[f.key, { type: 'dynamiczone', components: Object.values(f.components) }]]
    }
  })
}

/** The attributes of a type as the mapping reads and writes them: `slug` first, then the fields, then `body`. */
function typeShapes(t: StrapiType): [string, Shape][] {
  return [
    ...(t.kind === 'collection' ? ([['slug', { type: 'uid' }]] as [string, Shape][]) : []),
    ...shapes(t.fields),
    ...(t.body ? ([['body', { type: 'richtext' }]] as [string, Shape][]) : []),
  ]
}

/** The same structural keys of the JSON, in its order. */
function jsonShapes(s: Schema, expected: [string, Shape][]): [string, Shape][] {
  const want = new Map(expected)
  return Object.entries(s.attributes).map(([name, a]) => {
    const keys = Object.keys(want.get(name) ?? { type: 0 })
    return [name, Object.fromEntries(keys.filter((k) => k in a).map((k) => [k, a[k]]))]
  })
}

// Strapi 5.64.0 refuses these attribute names (snake case), @strapi/utils dist/content-types.js
// RESERVED_ATTRIBUTE_NAMES and, with Draft and Publish, RESERVED_ATTRIBUTE_NAMES_DRAFT_PUBLISH
const RESERVED = ['id', 'document_id', 'created_at', 'updated_at', 'published_at', 'created_by_id', 'updated_by_id']
  .concat(['created_by', 'updated_by', 'entry_id', 'localizations', 'meta', 'locale', '__component', '__content_type'])
  .concat(['status'])
const RESERVED_PREFIXES = ['strapi', '_strapi', '__strapi']
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

describe('cms/src and lib/www-cms/model.ts are the same model (Step 2.2)', () => {
  it('has a schema.json for every type of the mapping and no other', () => {
    expect([...strapiTypes.keys()].sort()).toEqual(TYPES.map((t) => t.apiId).sort())
  })

  it('has a component file for every component of the mapping and no other', () => {
    expect([...strapiComponents.keys()].sort()).toEqual(Object.keys(COMPONENTS).sort())
  })

  for (const t of TYPES) {
    it(`type ${t.apiId}: kind, route, Draft and Publish and every attribute`, () => {
      const s = strapiTypes.get(t.apiId)
      expect(s, t.apiId).toBeDefined()
      if (!s) return
      expect(s.kind).toBe(t.kind === 'collection' ? 'collectionType' : 'singleType')
      expect(s.info.singularName).toBe(t.apiId)
      // the REST route of the mapping: /api/<pluralName> for a collection, /api/<singularName> for a single type
      expect(t.route).toBe(`/api/${t.kind === 'collection' ? s.info.pluralName : s.info.singularName}`)
      expect(s.options.draftAndPublish).toBe(true)
      const want = typeShapes(t)
      expect(jsonShapes(s, want)).toEqual(want)
    })
  }

  for (const [uid, fields] of Object.entries(COMPONENTS)) {
    it(`component ${uid}: every attribute`, () => {
      const s = strapiComponents.get(uid)
      expect(s, uid).toBeDefined()
      if (!s) return
      const want = shapes(fields)
      expect(jsonShapes(s, want)).toEqual(want)
    })
  }

  it('uses no attribute name Strapi 5.64.0 reserves', () => {
    for (const [owner, s] of [...strapiTypes, ...strapiComponents])
      for (const name of Object.keys(s.attributes)) {
        const n = snake(name)
        expect(RESERVED.includes(n) || RESERVED_PREFIXES.some((p) => n.startsWith(p)), `${owner}.${name}`).toBe(false)
      }
  })

  it('gives every enumeration values Strapi accepts: a letter before the first digit', () => {
    for (const [owner, s] of [...strapiTypes, ...strapiComponents])
      for (const [name, a] of Object.entries(s.attributes))
        if (a.type === 'enumeration')
          for (const v of a.enum as string[]) expect(/^[^A-Za-z]*\d/.test(v), `${owner}.${name}: ${v}`).toBe(false)
  })
})
