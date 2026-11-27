// The mapping between the content files of the main site (www/content, the Zod schemas of lib/schema/www-content.ts)
// and the Strapi 5 types that will hold them (Strapi CMS spec 2026-11-27-www-strapi-cms.md, Data Model, Step 1.2): the
// table TYPES of every type, its fields and components, and the two pure functions toDocument (an entry of a file as
// the document the Strapi REST API answers, flattened, with its `documentId`) and fromDocument (a document back to
// the entry, keys in the order of the files). fromDocument(toDocument(entry)) is the entry; the round-trip test turns
// it back into the file and compares bytes. Isomorphic: no Node APIs.
//
// Conventions of the documents, as Strapi 5 answers a fully populated read: an unset scalar, single component, media
// or relation is null; a repeatable component, a many relation or a dynamic zone is a list (empty when unset); every
// component in a document carries its numeric `id`, and every item of a dynamic zone its `__component`. A relation is
// the related document with its `documentId` and `slug`; a media file is the upload's file object, mapped to the site
// path by a MediaIndex. Draft and Publish: `publishedAt` is null for a document never published (the file's
// `draft: true`).
//
// What the files hold that Strapi cannot hold as it is gets a field rule here, never a change of the files:
// - a field that Strapi reserves or that reads better in the admin under another name has its own Strapi name (`name`);
// - a list of strings is a repeatable `shared.line`; a pair (`columns`) is two fields; the optional `tracking` object of
//   a call to action is two flat fields;
// - an empty list is written to the file only where today's files write it (`keep`), else left out;
// - `draft: false` is written only by the collections whose files write it.

/** The attribute types of Strapi this mapping uses. */
export type StrapiScalar = 'string' | 'text' | 'richtext' | 'boolean' | 'integer' | 'date' | 'datetime' | 'enumeration'

/** A field of a type or a component: `key` in the file, `name` in Strapi when it differs. */
export type Field =
  /** `values`: an enumeration whose file keys Strapi cannot hold as they are, file key to Strapi value. */
  | { kind: 'scalar'; key: string; type: StrapiScalar; name?: string; values?: Readonly<Record<string, string>> }
  | { kind: 'component'; key: string; component: string; repeatable?: boolean; keep?: boolean; name?: string }
  | { kind: 'media'; key: string; name?: string }
  | { kind: 'relation'; key: string; target: string; many?: boolean; keep?: boolean }
  /** A list of strings, as a repeatable `shared.line`. */
  | { kind: 'lines'; key: string; keep?: boolean }
  /** A list of exactly two in the file, two fields in Strapi (a component each, or a string each). */
  | { kind: 'pair'; key: string; names: readonly [string, string]; component?: string }
  /** An optional object of the file whose fields are flat fields of the component in Strapi. */
  | { kind: 'flat'; key: string; fields: readonly (readonly [key: string, name: string])[] }
  /** A list of the file discriminated by `type`, as a dynamic zone of the components `block.<type>`. */
  | { kind: 'zone'; key: string; components: Readonly<Record<string, string>> }

/** A Strapi type: its API id, kind and the file collection it holds. */
export interface StrapiType {
  apiId: string
  kind: 'collection' | 'single'
  /** The REST route of the type: `/api/<plural>` for a collection, `/api/<apiId>` for a single type. */
  route: string
  /** Where the entries come from: a collection of lib/schema/www-content.ts, or a JSON file of www/content. */
  source: string
  fields: readonly Field[]
  /** A Markdown file: the body after the frontmatter is the field `body` (Markdown rich text). */
  body?: boolean
  /** How the file writes `draft`: always (`draft: false` too), only when true, or never (no Draft and Publish key). */
  draft: 'always' | 'when-true' | 'none'
}

// ---------------------------------------------------------------------------------------------------------------
// Field builders

const str = (key: string, name?: string): Field => ({ kind: 'scalar', key, type: 'string', ...(name ? { name } : {}) })
const text = (key: string): Field => ({ kind: 'scalar', key, type: 'text' })
const md = (key: string): Field => ({ kind: 'scalar', key, type: 'richtext' })
const bool = (key: string): Field => ({ kind: 'scalar', key, type: 'boolean' })
const int = (key: string, name?: string): Field => ({ kind: 'scalar', key, type: 'integer', ...(name ? { name } : {}) })
const date = (key: string): Field => ({ kind: 'scalar', key, type: 'date' })
const datetime = (key: string): Field => ({ kind: 'scalar', key, type: 'datetime' })
const enumeration = (key: string, name?: string, values?: Readonly<Record<string, string>>): Field => ({
  kind: 'scalar',
  key,
  type: 'enumeration',
  ...(name ? { name } : {}),
  ...(values ? { values } : {}),
})

/**
 * The budget of a partner in Strapi. Strapi 5.64.0 refuses an enumeration value without a letter before its first
 * digit (@strapi/core domain/content-type validation, "Values should have at least one alphabetical character
 * preceding the first occurence of a number"), and four keys of PARTNER_BUDGETS start with one, so Strapi holds
 * these values and the files keep their keys.
 */
export const PARTNER_BUDGET_VALUES: Readonly<Record<string, string>> = {
  'under-10k': 'under-10k',
  '10k-20k': 'from-10k-to-20k',
  '20k-50k': 'from-20k-to-50k',
  '50k-100k': 'from-50k-to-100k',
  '100k-plus': 'from-100k',
}
const one = (key: string, component: string): Field => ({ kind: 'component', key, component })
const many = (key: string, component: string, keep = false): Field => ({
  kind: 'component',
  key,
  component,
  repeatable: true,
  ...(keep ? { keep } : {}),
})
const media = (key: string, name?: string): Field => ({ kind: 'media', key, ...(name ? { name } : {}) })
const ref = (key: string, target: string): Field => ({ kind: 'relation', key, target })
const refs = (key: string, target: string, keep = false): Field => ({
  kind: 'relation',
  key,
  target,
  many: true,
  ...(keep ? { keep } : {}),
})
const lines = (key: string, keep = false): Field => ({ kind: 'lines', key, ...(keep ? { keep } : {}) })
const image = (key: string): Field => one(key, 'shared.image')
const cta = (key: string): Field => one(key, 'shared.cta')

/** `id` names a component's own key in Strapi, so the anchor of a block is `anchor` there. */
const anchor = str('id', 'anchor')

// ---------------------------------------------------------------------------------------------------------------
// Components, in the key order of the files

export const COMPONENTS: Readonly<Record<string, readonly Field[]>> = {
  'shared.seo': [str('title'), text('description'), media('ogImage'), bool('noindex')],
  'shared.seo-override': [str('title'), text('description'), media('ogImage'), bool('noindex')],
  'shared.image': [media('src', 'file'), str('alt'), bool('decorative'), int('width'), int('height')],
  'shared.cta': [
    str('label'),
    str('href'),
    {
      kind: 'flat',
      key: 'tracking',
      fields: [
        ['placement', 'trackingPlacement'],
        ['action', 'trackingAction'],
      ],
    },
  ],
  'shared.line': [text('text')],
  'shared.faq-item': [str('question'), md('answer')],
  'shared.source-link': [str('label'), str('url')],
  'shared.title-body': [str('title'), md('body')],
  'shared.art-item': [str('title'), md('body'), image('art')],
  'shared.block-item': [
    str('eyebrow'),
    str('title'),
    image('icon'),
    md('body'),
    lines('points'),
    md('note'),
    str('video'),
    image('image'),
    cta('cta'),
  ],

  // landings
  'landing.hero': [str('eyebrow'), str('title'), md('lead'), cta('primary'), cta('secondary'), lines('proof', true)],
  'landing.nav-item': [str('label'), str('anchor')],
  'landing.pains': [str('eyebrow'), str('title'), many('items', 'shared.art-item')],
  'landing.features': [str('eyebrow'), str('title'), md('lead'), many('items', 'shared.art-item')],
  'landing.column': [str('name'), str('note')],
  'landing.capability-row': [
    str('label'),
    enumeration('ours'),
    str('oursNote'),
    enumeration('theirs'),
    str('theirsNote'),
  ],
  'landing.capability-group': [str('title'), many('rows', 'landing.capability-row')],
  'landing.legend': [str('yes'), str('no'), str('build')],
  'landing.capabilities': [
    str('eyebrow'),
    str('title'),
    md('lead'),
    str('label'),
    str('tagline'),
    { kind: 'pair', key: 'columns', names: ['oursColumn', 'theirsColumn'], component: 'landing.column' },
    many('groups', 'landing.capability-group'),
    one('legend', 'landing.legend'),
    md('note'),
    date('reviewed'),
    many('sources', 'shared.source-link', true),
  ],
  'landing.comparison-row': [str('topic'), str('theirs'), str('ours')],
  'landing.comparison': [
    str('title'),
    str('label'),
    { kind: 'pair', key: 'columns', names: ['theirsColumn', 'oursColumn'] },
    many('rows', 'landing.comparison-row'),
  ],
  'landing.demo': [
    str('eyebrow'),
    str('title'),
    md('body'),
    cta('cta'),
    image('image'),
    str('caption'),
    str('animation'),
  ],
  'landing.steps': [str('eyebrow'), str('title'), many('items', 'shared.title-body')],
  'landing.faq': [str('title'), many('items', 'shared.faq-item')],
  'landing.cta': [str('title'), md('body'), cta('primary'), str('note')],
  'landing.sources': [str('title'), date('reviewed'), many('items', 'shared.source-link')],

  // pages: the JSON-LD and one component per block type (the shared head repeated in each, `id` as `anchor`)
  'page.json-ld': [enumeration('type'), many('faq', 'shared.faq-item')],
  'block.copy': [md('markdown'), str('webflowNode')],
  'block.hero': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
    many('items', 'shared.block-item'),
    str('video'),
    image('image'),
  ],
  'block.logo': [str('name'), image('logo'), str('href')],
  'block.logos': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
    many('items', 'block.logo'),
  ],
  'block.features': [
    str('layout'),
    anchor,
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    md('body'),
    image('image'),
    cta('primary'),
    cta('secondary'),
    many('items', 'shared.block-item'),
    md('note'),
  ],
  'block.carousel': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    many('items', 'shared.block-item'),
    md('note'),
  ],
  'block.video': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
    str('youtube'),
    image('poster'),
    str('caption'),
  ],
  'block.stat': [str('value'), str('label'), md('body')],
  'block.stats': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
    many('items', 'block.stat'),
  ],
  'block.member': [str('name'), str('role'), str('url'), image('photo'), md('bio'), many('links', 'shared.cta')],
  'block.team': [
    str('layout'),
    anchor,
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
    many('members', 'block.member'),
  ],
  'block.quote': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
    md('quote'),
    str('author'),
    str('role'),
    image('image'),
  ],
  'block.steps': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    many('items', 'shared.block-item'),
    md('note'),
  ],
  'block.faq': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
    many('items', 'shared.faq-item'),
  ],
  'block.cta': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('body'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
    many('items', 'shared.block-item'),
  ],
  'block.prose': [
    anchor,
    str('layout'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
    md('markdown'),
  ],
  'block.list': [
    anchor,
    str('layout'),
    enumeration('collection'),
    bool('featured'),
    int('limit'),
    str('label'),
    str('eyebrow'),
    str('title'),
    md('lead'),
    cta('primary'),
    cta('secondary'),
    md('note'),
  ],
  'block.legacy': [anchor, enumeration('component'), str('note')],

  // the other collections
  'case-study.overview': [str('client'), str('industry'), str('timeline'), str('type'), md('stack')],
  'case-study.stat': [str('title'), str('description')],

  // single types
  'nav.link': [str('label'), str('url'), enumeration('variant')],
  'nav.item': [str('label'), str('url'), str('run'), text('description'), enumeration('icon')],
  'nav.menu': [str('label'), many('items', 'nav.item')],
  'footer.group': [str('label'), many('links', 'nav.link')],
  'landing.template-marks': [str('yes'), str('no'), str('build')],
  'landing.template-words': [
    str('reviewedPrefix'),
    str('sourcesLabel'),
    str('reviewedInline'),
    str('navLabel'),
    str('detailsSummary'),
    str('relatedTitle'),
    one('marks', 'landing.template-marks'),
  ],
}

/** The block types of `pages`, each a component of the dynamic zone `blocks`. */
const BLOCKS = Object.fromEntries(
  [
    'copy',
    'hero',
    'logos',
    'features',
    'carousel',
    'video',
    'stats',
    'team',
    'quote',
    'steps',
    'faq',
    'cta',
    'prose',
    'list',
    'legacy',
  ].map((t) => [t, `block.${t}`]),
)

const webflowId = str('webflowId')
const dictionary = (apiId: string, plural: string, source: string, extra: readonly Field[] = []): StrapiType => ({
  apiId,
  kind: 'collection',
  route: `/api/${plural}`,
  source,
  fields: [webflowId, str('name'), ...extra],
  draft: 'none',
})

/** Every Strapi type of the main site, by API id (spec, Data Model). */
export const TYPES: readonly StrapiType[] = [
  {
    apiId: 'landing',
    kind: 'collection',
    route: '/api/landings',
    source: 'landings',
    draft: 'when-true',
    fields: [
      webflowId,
      // Strapi 5 keeps `locale` for its own i18n (A5: no i18n plugin), so the landing's language is `language` there
      enumeration('locale', 'language'),
      enumeration('kind'),
      str('competitor'),
      ref('alternateOf', 'landing'),
      one('seo', 'shared.seo'),
      one('hero', 'landing.hero'),
      many('sectionNav', 'landing.nav-item', true),
      one('pains', 'landing.pains'),
      one('features', 'landing.features'),
      one('capabilities', 'landing.capabilities'),
      one('comparison', 'landing.comparison'),
      one('demo', 'landing.demo'),
      one('steps', 'landing.steps'),
      one('faq', 'landing.faq'),
      one('cta', 'landing.cta'),
      one('sources', 'landing.sources'),
      refs('related', 'landing'),
    ],
  },
  {
    apiId: 'page',
    kind: 'collection',
    route: '/api/pages',
    source: 'pages',
    draft: 'when-true',
    fields: [
      webflowId,
      one('seo', 'shared.seo'),
      one('jsonLd', 'page.json-ld'),
      bool('siteCta'),
      { kind: 'zone', key: 'blocks', components: BLOCKS },
    ],
  },
  {
    apiId: 'blog-post',
    kind: 'collection',
    route: '/api/blog-posts',
    source: 'blog',
    body: true,
    draft: 'always',
    fields: [
      webflowId,
      str('title'),
      text('description'),
      datetime('date'),
      datetime('updated'),
      ref('author', 'author'),
      ref('category', 'blog-category'),
      bool('featured'),
      image('thumbnail'),
      one('seo', 'shared.seo-override'),
    ],
  },
  dictionary('author', 'authors', 'authors', [str('role'), image('avatar'), str('url')]),
  dictionary('blog-category', 'blog-categories', 'blogCategories', [int('order'), str('labelColor'), str('textColor')]),
  {
    apiId: 'case-study',
    kind: 'collection',
    route: '/api/case-studies',
    source: 'caseStudies',
    body: true,
    draft: 'always',
    fields: [
      webflowId,
      str('title'),
      str('heading'),
      text('description'),
      image('thumbnail'),
      str('heroVideo'),
      ref('deliveredBy', 'partner'),
      str('deliveredByUrl'),
      one('overview', 'case-study.overview'),
      many('stats', 'case-study.stat'),
      many('screenshots', 'shared.image', true),
      refs('categories', 'case-study-category', true),
      bool('featuredOnAgencies'),
      int('order'),
    ],
  },
  dictionary('case-study-category', 'case-study-categories', 'caseStudyCategories'),
  {
    apiId: 'partner',
    kind: 'collection',
    route: '/api/partners',
    source: 'partners',
    body: true,
    draft: 'always',
    fields: [
      webflowId,
      str('name'),
      image('logo'),
      ref('tier', 'partner-tier'),
      refs('industries', 'partner-industry', true),
      ref('location', 'partner-location'),
      refs('languages', 'partner-language', true),
      refs('services', 'partner-service', true),
      enumeration('budget', undefined, PARTNER_BUDGET_VALUES),
      enumeration('availability'),
      bool('projectsInPortfolio'),
      str('website'),
      text('description'),
    ],
  },
  dictionary('partner-tier', 'partner-tiers', 'partnerTiers', [int('order'), str('backgroundColor'), str('textColor')]),
  dictionary('partner-industry', 'partner-industries', 'partnerIndustries', [int('order')]),
  dictionary('partner-service', 'partner-services', 'partnerServices', [int('order')]),
  dictionary('partner-language', 'partner-languages', 'partnerLanguages'),
  dictionary('partner-location', 'partner-locations', 'partnerLocations'),
  {
    apiId: 'job',
    kind: 'collection',
    route: '/api/jobs',
    source: 'jobs',
    body: true,
    draft: 'always',
    fields: [
      webflowId,
      str('title'),
      text('description'),
      str('location'),
      enumeration('employmentType'),
      str('department'),
      str('salary'),
      str('techStack'),
      str('applyUrl'),
      bool('open'),
      int('order'),
      datetime('datePosted'),
      datetime('validThrough'),
    ],
  },
  {
    apiId: 'redirect',
    kind: 'collection',
    route: '/api/redirects',
    source: 'redirects',
    draft: 'none',
    // the rules of source `manual` only; the pull keeps the other rules of redirects.yaml from the checkout. Strapi
    // 5.64.0 reserves `status` on a type with Draft and Publish (the REST and Document Service status parameter,
    // @strapi/utils content-types RESERVED_ATTRIBUTE_NAMES_DRAFT_PUBLISH), so the rule's status is `statusCode` there
    fields: [str('from'), str('to'), int('status', 'statusCode')],
  },
  {
    apiId: 'navigation',
    kind: 'single',
    route: '/api/navigation',
    source: 'navigation.json',
    draft: 'none',
    fields: [many('menus', 'nav.menu'), many('links', 'nav.link'), one('sandbox', 'nav.link')],
  },
  {
    apiId: 'footer',
    kind: 'single',
    route: '/api/footer',
    source: 'footer.json',
    draft: 'none',
    fields: [many('links', 'nav.link'), many('other', 'footer.group'), str('note')],
  },
  {
    apiId: 'landing-template',
    kind: 'single',
    route: '/api/landing-template',
    source: 'landingTemplate',
    draft: 'none',
    fields: [one('en', 'landing.template-words'), one('pl', 'landing.template-words')],
  },
]

/** The type that holds a source (a collection name or a JSON file of www/content). */
export function typeOf(source: string): StrapiType {
  const t = TYPES.find((x) => x.source === source)
  if (!t) throw new Error(`no Strapi type holds ${source}`)
  return t
}

/** The fields of a component. */
function componentFields(uid: string): readonly Field[] {
  const f = COMPONENTS[uid]
  if (!f) throw new Error(`no component ${uid}`)
  return f
}

// ---------------------------------------------------------------------------------------------------------------
// Documents

/** A media file as the upload plugin answers it (the fields the pull reads; the REST answer holds more). */
export interface StrapiMedia {
  id: number
  documentId: string
  name: string
  url: string
  ext: string
  mime: string
  hash: string
  [key: string]: unknown
}

/** Turns a site path of a media file (`/media/blog/x.png`) into its upload, and an upload back into its path. */
export interface MediaIndex {
  toMedia(path: string): StrapiMedia
  toPath(file: StrapiMedia): string
}

/** A document of the REST API: its fields by Strapi name, plus `documentId`, `slug` and the status fields. */
export type StrapiDocument = Record<string, unknown> & { documentId: string; publishedAt: string | null }

/** An entry of a content file: its id (the slug, the locale of the template; none for a single file), its data, its body. */
export interface FileEntry {
  id: string
  data: Record<string, unknown>
  body?: string
}

/** Fields every document or component carries besides its content: never part of an entry. */
const META = new Set(['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale', 'localizations'])

const nameOf = (f: Field): string =>
  f.kind === 'scalar' || f.kind === 'component' || f.kind === 'media' ? (f.name ?? f.key) : f.key

/** A stable 24-character document id for an entry, in the alphabet Strapi uses (`[a-z0-9]`). */
export function documentIdOf(apiId: string, slug: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  let out = ''
  const s = `${apiId}:${slug}`
  while (out.length < 24) {
    for (let i = 0; i < s.length; i++) {
      h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0
      h2 = Math.imul(h2 ^ (s.charCodeAt(i) + out.length), 0x5bd1e995) >>> 0
    }
    out += ((h1 ^ h2) >>> 0).toString(36).padStart(7, '0').slice(0, 7)
  }
  return out.slice(0, 24)
}

/** What toDocument needs beside the entry: the media index and the numbering of components. */
export interface ToContext {
  media: MediaIndex
  /** The next numeric id of a component (Strapi numbers each component row). */
  nextId?: () => number
}

function counter(): () => number {
  let n = 0
  return () => ++n
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function fail(where: string, why: string): never {
  throw new Error(`${where}: ${why}`)
}

/** The value of a file's object as fields of a document or a component. */
function toFields(fields: readonly Field[], value: Record<string, unknown>, ctx: Required<ToContext>, where: string) {
  const known = new Set(fields.map((f) => f.key))
  for (const k of Object.keys(value)) if (!known.has(k)) fail(where, `the field ${k} is not in the mapping`)
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = value[f.key]
    const at = `${where}.${f.key}`
    switch (f.kind) {
      case 'scalar':
        out[nameOf(f)] = v === undefined ? null : f.values ? valueOf(f.values, v, at) : v
        break
      case 'media':
        out[nameOf(f)] = v === undefined ? null : ctx.media.toMedia(String(v))
        break
      case 'relation':
        if (f.many) {
          if (v !== undefined && !Array.isArray(v)) fail(at, 'a list of slugs is expected')
          out[f.key] = ((v as unknown[] | undefined) ?? []).map((s) => relationOf(f.target, s))
        } else out[f.key] = v === undefined ? null : relationOf(f.target, v)
        break
      case 'lines':
        if (v !== undefined && !Array.isArray(v)) fail(at, 'a list of strings is expected')
        out[f.key] = ((v as unknown[] | undefined) ?? []).map((t) => ({ id: ctx.nextId(), text: t }))
        break
      case 'component':
        if (f.repeatable) {
          if (v !== undefined && !Array.isArray(v)) fail(at, 'a list is expected')
          out[nameOf(f)] = ((v as unknown[] | undefined) ?? []).map((x, i) =>
            componentOf(f.component, x, ctx, `${at}.${i}`),
          )
        } else out[nameOf(f)] = v === undefined ? null : componentOf(f.component, v, ctx, at)
        break
      case 'pair': {
        if (v !== undefined && (!Array.isArray(v) || v.length !== 2)) fail(at, 'a list of two is expected')
        const pair = v as unknown[] | undefined
        f.names.forEach((name, i) => {
          const x = pair?.[i]
          out[name] = x === undefined ? null : f.component ? componentOf(f.component, x, ctx, `${at}.${i}`) : x
        })
        break
      }
      case 'flat': {
        if (v !== undefined && !isObject(v)) fail(at, 'an object is expected')
        const inner = new Set(f.fields.map(([k]) => k))
        for (const k of Object.keys((v as object | undefined) ?? {}))
          if (!inner.has(k)) fail(at, `the field ${k} is not in the mapping`)
        for (const [k, name] of f.fields) out[name] = (v as Record<string, unknown> | undefined)?.[k] ?? null
        break
      }
      case 'zone':
        if (v !== undefined && !Array.isArray(v)) fail(at, 'a list of blocks is expected')
        out[f.key] = ((v as unknown[] | undefined) ?? []).map((b, i) => {
          if (!isObject(b) || typeof b.type !== 'string') fail(`${at}.${i}`, 'a block with a type is expected')
          const uid = f.components[b.type] ?? fail(`${at}.${i}`, `the block type ${b.type} is not in the mapping`)
          const { type: _type, ...rest } = b
          return { __component: uid, ...componentOf(uid, rest, ctx, `${at}.${i}`) }
        })
        break
    }
  }
  return out
}

function componentOf(uid: string, v: unknown, ctx: Required<ToContext>, where: string): Record<string, unknown> {
  if (!isObject(v)) fail(where, `an object is expected for ${uid}`)
  return { id: ctx.nextId(), ...toFields(componentFields(uid), v, ctx, where) }
}

function relationOf(target: string, slug: unknown): Record<string, unknown> {
  if (typeof slug !== 'string') fail(target, 'a slug is expected')
  return { documentId: documentIdOf(target, slug), slug }
}

/**
 * An entry of a content file as the Strapi document of its type: `documentId` stable per type and slug, `slug` for a
 * collection type, every field by its Strapi name, `body` for a Markdown file, and `publishedAt` null for a draft.
 * Throws on a field the mapping does not know, so nothing of a file is ever left out silently.
 */
export function toDocument(type: StrapiType, entry: FileEntry, context: ToContext): StrapiDocument {
  const ctx: Required<ToContext> = { nextId: counter(), ...context }
  const where = `${type.source}/${entry.id}`
  const { draft, ...data } = entry.data
  if (type.draft === 'none' && draft !== undefined) fail(where, 'the type has no draft')
  if (draft !== undefined && typeof draft !== 'boolean') fail(where, 'draft is not a boolean')
  const fields = toFields(type.fields, data, ctx, where)
  if (type.body && entry.body === undefined) fail(where, 'a Markdown file needs a body')
  return {
    documentId: documentIdOf(type.apiId, entry.id),
    ...(type.kind === 'collection' ? { slug: entry.id } : {}),
    ...fields,
    ...(type.body ? { body: entry.body } : {}),
    // a fixed time for every published entry: the file holds no publication time, and the build reads none
    publishedAt: draft === true ? null : '2026-11-27T00:00:00.000Z',
  }
}

/** The fields of a document or a component as the object of the file, keys in the mapping's order. */
function fromFields(fields: readonly Field[], doc: Record<string, unknown>, media: MediaIndex, where: string) {
  const known = new Set<string>(META)
  for (const f of fields) {
    if (f.kind === 'pair') for (const n of f.names) known.add(n)
    else if (f.kind === 'flat') for (const [, n] of f.fields) known.add(n)
    else known.add(nameOf(f))
  }
  for (const k of Object.keys(doc))
    if (!known.has(k) && k !== '__component') fail(where, `the field ${k} is not in the mapping`)
  const out: Record<string, unknown> = {}
  const need = (name: string): unknown => {
    if (!(name in doc)) fail(where, `the field ${name} is missing`)
    return doc[name]
  }
  /** A list field of the document: Strapi answers a list, empty when unset, never null. */
  const needList = <T>(name: string, at: string): T[] => {
    const v = need(name)
    if (!Array.isArray(v)) fail(at, `a list is expected, not ${v === null ? 'null' : typeof v}`)
    return v as T[]
  }
  for (const f of fields) {
    const at = `${where}.${f.key}`
    switch (f.kind) {
      case 'scalar': {
        const v = need(nameOf(f))
        if (v !== null) out[f.key] = f.values ? keyOf(f.values, v, at) : v
        break
      }
      case 'media': {
        const v = need(nameOf(f))
        if (v !== null) out[f.key] = media.toPath(v as StrapiMedia)
        break
      }
      case 'relation': {
        if (f.many) {
          const list = needList<unknown>(f.key, at).map((r) => slugOf(r, at))
          if (list.length > 0 || f.keep) out[f.key] = list
        } else {
          const v = need(f.key)
          if (v !== null) out[f.key] = slugOf(v, at)
        }
        break
      }
      case 'lines': {
        const list = needList<unknown>(f.key, at).map((l, i) => {
          if (!isObject(l)) fail(`${at}.${i}`, 'a line is expected')
          return l.text
        })
        if (list.length > 0 || f.keep) out[f.key] = list
        break
      }
      case 'component': {
        if (f.repeatable) {
          const list = needList<unknown>(nameOf(f), at).map((x, i) => {
            if (!isObject(x)) fail(`${at}.${i}`, `an object is expected for ${f.component}`)
            return fromFields(componentFields(f.component), x, media, `${at}.${i}`)
          })
          if (list.length > 0 || f.keep) out[f.key] = list
        } else {
          const v = need(nameOf(f))
          if (v !== null) {
            if (!isObject(v)) fail(at, `an object is expected for ${f.component}`)
            out[f.key] = fromFields(componentFields(f.component), v, media, at)
          }
        }
        break
      }
      case 'pair': {
        const parts = f.names.map((n) => need(n))
        if (parts.every((p) => p === null)) break
        if (parts.some((p) => p === null)) fail(at, 'both parts of the pair are needed')
        out[f.key] = parts.map((p, i) =>
          f.component ? fromFields(componentFields(f.component), p as Record<string, unknown>, media, `${at}.${i}`) : p,
        )
        break
      }
      case 'flat': {
        const parts = f.fields.map(([k, n]) => [k, need(n)] as const)
        if (parts.every(([, p]) => p === null)) break
        out[f.key] = Object.fromEntries(parts.filter(([, p]) => p !== null))
        break
      }
      case 'zone':
        out[f.key] = needList<unknown>(f.key, at).map((b, i) => {
          if (!isObject(b)) fail(`${at}.${i}`, 'a block is expected')
          const type = Object.entries(f.components).find(([, uid]) => uid === b.__component)?.[0]
          if (type === undefined) fail(`${at}.${i}`, `the component ${String(b.__component)} is not in the mapping`)
          return { type, ...fromFields(componentFields(b.__component as string), b, media, `${at}.${i}`) }
        })
        break
    }
  }
  return out
}

/** The Strapi value of a file key of an enumeration with its own values. */
function valueOf(values: Readonly<Record<string, string>>, key: unknown, where: string): string {
  const v = typeof key === 'string' ? values[key] : undefined
  return v ?? fail(where, `the value ${String(key)} is not in the mapping`)
}

/** The file key of a Strapi value of an enumeration with its own values. */
function keyOf(values: Readonly<Record<string, string>>, value: unknown, where: string): string {
  const k = Object.entries(values).find(([, v]) => v === value)?.[0]
  return k ?? fail(where, `the value ${String(value)} is not in the mapping`)
}

function slugOf(r: unknown, where: string): string {
  if (!isObject(r) || typeof r.slug !== 'string') fail(where, 'a related document without its slug')
  return r.slug
}

/**
 * A Strapi document back to the entry of its content file: the fields in the order of the files, nothing for an unset
 * field, an empty list only where the files write one, `draft` as the type's files write it, and the body of a
 * Markdown file. Throws on a field the mapping does not know or a field it needs that the document lacks (the model
 * of Strapi and the mapping drifted apart).
 */
export function fromDocument(type: StrapiType, doc: StrapiDocument, media: MediaIndex): FileEntry {
  const id = type.kind === 'collection' ? doc.slug : type.source
  if (typeof id !== 'string') fail(type.apiId, 'a document without its slug')
  const where = `${type.source}/${id}`
  const { body, slug: _slug, ...rest } = doc
  if (type.body && typeof body !== 'string') fail(where, 'a Markdown document needs its body')
  if (!type.body && body !== undefined) fail(where, 'the field body is not in the mapping')
  const data = fromFields(type.fields, rest, media, where)
  const draft = doc.publishedAt === null
  if (type.draft === 'always' || (type.draft === 'when-true' && draft)) data.draft = draft
  if (type.draft === 'none' && draft) fail(where, 'a draft of a type the files hold no draft of')
  return { id, data, ...(type.body ? { body: body as string } : {}) }
}

// ---------------------------------------------------------------------------------------------------------------
// Media

const MIME: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
}

/** The name an upload outside the site's folders gets under /media/uploads (the importer's rule). */
export function uploadName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.-]/g, '-')
}

/**
 * A media index over the files of the site (`/media/...`, `/files/...`), as the push lays them out: one upload per
 * path, in a folder named after its directory, with its original file name. An upload that is not in the index (an
 * editor's upload outside those folders) maps to `/media/uploads/<name>`. Where the pull reads the folder of an upload
 * from is Step 3.2's (a read of the Strapi instance); this index is the offline stand-in, by `documentId`.
 */
export function mediaIndex(paths: readonly string[]): MediaIndex {
  const byPath = new Map<string, StrapiMedia>()
  const byId = new Map<string, string>()
  ;[...paths].sort().forEach((path, i) => {
    const name = path.slice(path.lastIndexOf('/') + 1)
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 ? name.slice(dot).toLowerCase() : ''
    const documentId = documentIdOf('upload-file', path)
    const hash = `${uploadName(dot > 0 ? name.slice(0, dot) : name).replace(/\./g, '_')}_${documentId.slice(0, 10)}`
    const file: StrapiMedia = {
      id: i + 1,
      documentId,
      name,
      url: `/uploads/${hash}${ext}`,
      ext,
      mime: MIME[ext] ?? 'application/octet-stream',
      hash,
    }
    byPath.set(path, file)
    byId.set(documentId, path)
  })
  return {
    toMedia(path) {
      const f = byPath.get(path)
      if (!f) throw new Error(`${path}: not a file of the site`)
      return f
    },
    toPath(file) {
      return byId.get(file.documentId) ?? `/media/uploads/${uploadName(file.name)}`
    },
  }
}
