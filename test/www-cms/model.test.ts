// Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 1.2: the mapping between the content files and the Strapi types,
// proven without a Strapi server. For every file of www/content, fromDocument(toDocument(file)) serialized is the file
// byte for byte (the documents pass through JSON on the way, as a REST answer would); and the hand-written REST
// fixture of test/fixtures/strapi/ maps to valid files. Only the files the spec keeps out of Strapi are skipped, each
// by name.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  entriesOf,
  filesOf,
  NOT_IN_STRAPI,
  sourceOf,
  splitRedirects,
  type ContentFile,
} from '../../lib/www-cms/files.ts'
import {
  COMPONENTS,
  documentIdOf,
  fromDocument,
  mediaIndex,
  PARTNER_BUDGET_VALUES,
  toDocument,
  typeOf,
  TYPES,
  type FileEntry,
  type StrapiDocument,
  type StrapiType,
} from '../../lib/www-cms/model.ts'
import {
  footerSchema,
  landingTemplateEntries,
  navigationSchema,
  PARTNER_BUDGETS,
  WWW_SOURCES,
  wwwSchemas,
  type WwwCollection,
} from '../../lib/schema/www-content.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const CONTENT = join(ROOT, 'www', 'content')
const FIXTURE = join(ROOT, 'test', 'fixtures', 'strapi')

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )

/** Every file of the site's media, by its site path. */
const SITE_MEDIA = ['media', 'files'].flatMap((d) =>
  walk(join(ROOT, 'www', 'public', d)).map(
    (p) =>
      `/${relative(join(ROOT, 'www', 'public'), p)
        .split('\\')
        .join('/')}`,
  ),
)
const media = mediaIndex(SITE_MEDIA)
const redirects = readFileSync(join(CONTENT, 'redirects.yaml'), 'utf8')

/** The files of www/content by source, and the ones no Strapi type holds. */
function contentFiles(): { bySource: Map<string, ContentFile[]>; skipped: string[] } {
  const bySource = new Map<string, ContentFile[]>()
  const skipped: string[] = []
  for (const p of walk(CONTENT)) {
    const path = relative(CONTENT, p).split('\\').join('/')
    const source = sourceOf(path)
    if (source === undefined) {
      skipped.push(path)
      continue
    }
    bySource.set(source, [...(bySource.get(source) ?? []), { path, text: readFileSync(p, 'utf8') }])
  }
  return { bySource, skipped }
}

/** Entries through a document and back, the document as JSON in between. */
const roundTrip = (type: StrapiType, e: FileEntry): FileEntry =>
  fromDocument(type, JSON.parse(JSON.stringify(toDocument(type, e, { media }))) as StrapiDocument, media)

describe('the round trip of www/content through Strapi documents (Step 1.2)', () => {
  const { bySource, skipped } = contentFiles()

  it('skips only the files the spec keeps out of Strapi: the embeds and the import manifest', () => {
    for (const path of skipped)
      expect(
        NOT_IN_STRAPI.some((n) => n.match.test(path)),
        path,
      ).toBe(true)
    expect(skipped.filter((p) => p.startsWith('embeds/')).length).toBe(readdirSync(join(CONTENT, 'embeds')).length)
    expect(skipped.filter((p) => !p.startsWith('embeds/'))).toEqual(['.webflow-import.json'])
  })

  it('has a Strapi type for every collection and content file, and each type once', () => {
    const sources = TYPES.map((t) => t.source)
    expect(new Set(sources).size).toBe(sources.length)
    expect([...sources].sort()).toEqual([...Object.keys(WWW_SOURCES), 'footer.json', 'navigation.json'].sort())
    expect([...bySource.keys()].sort()).toEqual([...sources].sort())
  })

  for (const type of TYPES) {
    it(`${type.source} (${type.apiId}): every file comes back byte for byte`, async () => {
      const files = bySource.get(type.source) ?? []
      expect(files.length, type.source).toBeGreaterThan(0)
      const entries = files.flatMap((f) => entriesOf(type.source, f))
      const back = entries.map((e) => roundTrip(type, e))
      expect(back).toEqual(entries)
      const out = await filesOf(type, back, ROOT, { redirects })
      expect(out.map((f) => f.path).sort()).toEqual(files.map((f) => f.path).sort())
      const written = new Map(out.map((f) => [f.path, f.text]))
      for (const f of files) expect(written.get(f.path) === f.text, f.path).toBe(true)
    })
  }

  it('counts every file of every collection, not a sample', () => {
    const counts = Object.fromEntries([...bySource].map(([s, f]) => [s, f.length]))
    const dirs = Object.values(WWW_SOURCES).flatMap((s) => (s.kind === 'entries' ? [s] : []))
    for (const s of dirs)
      expect(counts[Object.keys(WWW_SOURCES).find((k) => WWW_SOURCES[k as WwwCollection] === s)!], s.dir).toBe(
        readdirSync(join(CONTENT, s.dir)).filter((n) => n.endsWith(`.${s.ext}`)).length,
      )
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total + skipped.length).toBe(walk(CONTENT).length)
  })
})

describe('the mapping refuses what it cannot carry (drift fails loudly)', () => {
  const landing = typeOf('landings')
  const file = readFileSync(join(CONTENT, 'landings', 'hubspot-alternative.yaml'), 'utf8')
  const [entry] = entriesOf('landings', { path: 'landings/hubspot-alternative.yaml', text: file })

  it('refuses a field of a file that the mapping does not know', () => {
    const e = { ...entry!, data: { ...entry!.data, colour: 'green' } }
    expect(() => toDocument(landing, e, { media })).toThrow(/colour is not in the mapping/)
    const hero = { ...(entry!.data.hero as object), badge: 'x' }
    expect(() => toDocument(landing, { ...entry!, data: { ...entry!.data, hero } }, { media })).toThrow(
      /hero: the field badge/,
    )
  })

  it('refuses a document with a field the mapping does not know or without one it needs', () => {
    const doc = toDocument(landing, entry!, { media })
    expect(() => fromDocument(landing, { ...doc, subtitle: 'x' }, media)).toThrow(/subtitle is not in the mapping/)
    const { competitor: _c, ...without } = doc
    expect(() => fromDocument(landing, without as StrapiDocument, media)).toThrow(/competitor is missing/)
  })

  it('names the field when a document holds null or an object where a list belongs', () => {
    const doc = toDocument(landing, entry!, { media })
    expect(() => fromDocument(landing, { ...doc, related: null }, media)).toThrow(
      /landings\/hubspot-alternative\.related: a list is expected, not null/,
    )
    expect(() => fromDocument(landing, { ...doc, sectionNav: {} }, media)).toThrow(/sectionNav: a list is expected/)
    const hero = { ...(doc.hero as object), proof: null }
    expect(() => fromDocument(landing, { ...doc, hero }, media)).toThrow(/hero\.proof: a list is expected/)
    const page = typeOf('pages')
    const [home] = entriesOf('pages', {
      path: 'pages/home.yaml',
      text: readFileSync(join(CONTENT, 'pages', 'home.yaml'), 'utf8'),
    })
    expect(() => fromDocument(page, { ...toDocument(page, home!, { media }), blocks: null }, media)).toThrow(
      /pages\/home\.blocks: a list is expected/,
    )
  })

  it('writes a document never published as a draft, where the type has drafts', () => {
    const doc = { ...toDocument(landing, entry!, { media }), publishedAt: null }
    expect(fromDocument(landing, doc, media).data.draft).toBe(true)
    const tiers = typeOf('partnerTiers')
    const [tier] = entriesOf('partnerTiers', {
      path: 'partner-tiers.yaml',
      text: readFileSync(join(CONTENT, 'partner-tiers.yaml'), 'utf8'),
    })
    expect(() => fromDocument(tiers, { ...toDocument(tiers, tier!, { media }), publishedAt: null }, media)).toThrow(
      /a draft of a type/,
    )
  })

  it('gives every entry a stable document id in the alphabet of Strapi, and a new upload a path under /media/uploads', () => {
    expect(documentIdOf('landing', 'x')).toMatch(/^[a-z0-9]{24}$/)
    expect(documentIdOf('landing', 'x')).toBe(documentIdOf('landing', 'x'))
    expect(documentIdOf('landing', 'x')).not.toBe(documentIdOf('page', 'x'))
    const upload = {
      ...media.toMedia(SITE_MEDIA[0]!),
      documentId: 'zzzzzzzzzzzzzzzzzzzzzzzz',
      name: 'Team Photo (1).PNG',
    }
    expect(media.toPath(upload)).toBe('/media/uploads/team-photo--1-.png')
    expect(() => media.toMedia('/media/none.png')).toThrow(/not a file of the site/)
  })

  it('names a component for every component a field uses', () => {
    const uses = [...TYPES.flatMap((t) => t.fields), ...Object.values(COMPONENTS).flat()].flatMap((f) =>
      f.kind === 'component'
        ? [f.component]
        : f.kind === 'pair' && f.component
          ? [f.component]
          : f.kind === 'zone'
            ? Object.values(f.components)
            : [],
    )
    for (const uid of uses) expect(COMPONENTS[uid], uid).toBeDefined()
  })
})

describe('redirects.yaml: manual rules are documents, the rest is kept from the checkout', () => {
  const type = typeOf('redirects')
  const manual = '- from: /old-pricing\n  to: /pricing\n  status: 301\n  source: manual\n'

  it('appends the manual rules after the kept part and gives the file back byte for byte', async () => {
    const text = `${redirects}${manual}`
    const { kept, manual: rules } = splitRedirects(text)
    expect(kept).toBe(redirects)
    expect(rules).toEqual([{ from: '/old-pricing', to: '/pricing', status: 301, source: 'manual' }])
    const entries = entriesOf('redirects', { path: 'redirects.yaml', text })
    // Strapi reserves `status` on a Draft and Publish type: the document holds it as statusCode
    const doc = toDocument(type, entries[0]!, { media })
    expect(doc.statusCode).toBe(301)
    expect(doc).not.toHaveProperty('status')
    const back = entries.map((e) => roundTrip(type, e))
    const [out] = await filesOf(type, back, ROOT, { redirects: text })
    expect(out!.text === text).toBe(true)
  })

  it('refuses a manual rule before a rule of another source', () => {
    const [head, ...rest] = redirects.split('\n- from: /documentation\n')
    expect(rest.length).toBe(1)
    const text = `${head}\n${manual}- from: /documentation\n${rest[0]}`
    expect(() => splitRedirects(text)).toThrow(/manual rules go last/)
  })
})

/** A REST answer of the fixture: a list of documents for a collection type, one for a single type. */
function answer(type: StrapiType): { data: unknown; meta: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(FIXTURE, `${type.route}.json`), 'utf8'))
}

describe('test/fixtures/strapi: one trimmed REST answer per type (Strapi 5, published content only)', () => {
  const fixtureMedia = mediaIndex(JSON.parse(readFileSync(join(FIXTURE, 'media.json'), 'utf8')) as string[])

  it('has the shape of Strapi 5: flattened documents with a documentId, pagination at the pull page size', () => {
    for (const type of TYPES) {
      const a = answer(type)
      const docs = type.kind === 'single' ? [a.data] : (a.data as unknown[])
      if (type.kind === 'collection') {
        expect(Array.isArray(a.data), type.route).toBe(true)
        expect(a.meta.pagination, type.route).toEqual({ page: 1, pageSize: 100, pageCount: 1, total: docs.length })
      } else expect(a.meta, type.route).toEqual({})
      for (const d of docs as Record<string, unknown>[]) {
        expect(d.attributes, `${type.route}: a Strapi 4 shape`).toBeUndefined()
        expect(typeof d.id, type.route).toBe('number')
        expect(d.documentId, type.route).toMatch(/^[a-z0-9]{24}$/)
        expect(d.publishedAt, `${type.route}: a draft in the public fixture`).toMatch(/^\d{4}-\d\d-\d\dT/)
        if (type.kind === 'collection') expect(typeof d.slug, type.route).toBe('string')
      }
    }
  })

  it('maps to files every schema accepts', async () => {
    const schemas = wwwSchemas()
    for (const type of TYPES) {
      const a = answer(type)
      const docs = (type.kind === 'single' ? [a.data] : a.data) as StrapiDocument[]
      const entries = docs.map((d) => fromDocument(type, d, fixtureMedia))
      const files = await filesOf(type, entries, ROOT, { redirects })
      for (const f of files) {
        if (type.source === 'navigation.json') navigationSchema().parse(JSON.parse(f.text))
        else if (type.source === 'footer.json') footerSchema().parse(JSON.parse(f.text))
        else if (type.source === 'landingTemplate') landingTemplateEntries(parse(f.text))
        else if (type.source === 'redirects') {
          // the whole file as the build reads it: the kept rules and the fixture's manual rule after them
          const rules = parse(f.text) as unknown[]
          expect(rules.at(-1)).toEqual({ from: '/old-pricing', to: '/pricing', status: 301, source: 'manual' })
          for (const r of rules) expect(schemas.redirects.safeParse(r).success, JSON.stringify(r)).toBe(true)
        } else
          for (const e of entriesOf(type.source, f)) {
            const r = schemas[type.source as WwwCollection].safeParse(e.data)
            expect(r.success, `${type.route} ${e.id}: ${JSON.stringify(r.error?.issues)}`).toBe(true)
          }
      }
    }
  })

  it('gives back the files of www/content it was written from', async () => {
    for (const type of TYPES.filter((t) => t.source !== 'redirects')) {
      const a = answer(type)
      const docs = (type.kind === 'single' ? [a.data] : a.data) as StrapiDocument[]
      const entries = docs.map((d) => fromDocument(type, d, fixtureMedia))
      for (const f of await filesOf(type, entries, ROOT)) {
        const s = WWW_SOURCES[type.source as WwwCollection]
        if (s?.kind === 'file' && type.kind === 'collection') {
          // a trimmed dictionary: each of its entries is the entry of the file
          const all = parse(readFileSync(join(CONTENT, f.path), 'utf8')) as Record<string, unknown>
          for (const e of entries) expect(e.data, `${f.path} ${e.id}`).toEqual(all[e.id])
        } else expect(f.text === readFileSync(join(CONTENT, f.path), 'utf8'), f.path).toBe(true)
      }
    }
  })
})

describe('values and names Strapi 5.64.0 refuses (Step 2.2)', () => {
  const partner = typeOf('partners')
  const base = { name: 'P', tier: 't', location: 'l', availability: 'accepting', projectsInPortfolio: false }

  it('maps every partner budget to a Strapi value with a letter before its first digit, and back', () => {
    expect(Object.keys(PARTNER_BUDGET_VALUES)).toEqual([...PARTNER_BUDGETS])
    for (const [key, value] of Object.entries(PARTNER_BUDGET_VALUES)) {
      expect(/^[^a-z]*[0-9]/i.test(value), value).toBe(false)
      const entry = { id: 'p', data: { ...base, budget: key, website: 'https://x.test', description: 'd' }, body: 'b' }
      const doc = toDocument(partner, entry, { media })
      expect(doc.budget).toBe(value)
      expect(roundTrip(partner, entry).data.budget).toBe(key)
    }
  })

  it('refuses a budget the mapping does not know, in either direction', () => {
    const entry = { id: 'p', data: { ...base, budget: 'any', website: 'https://x.test', description: 'd' }, body: 'b' }
    expect(() => toDocument(partner, entry, { media })).toThrow(/the value any is not in the mapping/)
    const ok = { ...entry, data: { ...entry.data, budget: 'under-10k' } }
    const doc = { ...toDocument(partner, ok, { media }), budget: '10k-20k' }
    expect(() => fromDocument(partner, doc, media)).toThrow(/the value 10k-20k is not in the mapping/)
  })
})
