// Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 3.1: `yarn om www-push` against a local fake Strapi (node:http
// on 127.0.0.1, a random port; test/www-cms/fake-strapi.ts) with a small copy of the content tree. The push is
// idempotent (a second run prints `0 changed` and writes nothing), creates relations in the spec's order (a related
// document always exists before the document that points at it, landings in two passes) and uploads each media file
// once, into the Media Library folder of its directory and with that folder in its caption. A dry run writes nothing; the push refuses to run in CI, needs
// the folders and its token, and never prints the token.
import { rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runPush } from '../../lib/commands/www-push.ts'
import { PUSH_ORDER } from '../../lib/www-cms/push.ts'
import { fromDocument, TYPES, typeOf } from '../../lib/www-cms/model.ts'
import { createClient } from '../../lib/www-cms/rest.ts'
import { readType, readUploads, strapiMediaIndex } from '../../lib/www-cms/strapi.ts'
import { entriesOfSource, readContent } from '../../lib/www-cms/tree.ts'
import { startFakeStrapi, type FakeStrapi, type LogLine } from './fake-strapi.ts'
import { miniTree, ROOT } from './mini-tree.ts'

const FULL = 'test-full'

/** Runs the command as `yarn om www-push` would, with its own environment, and returns its exit code and output. */
async function pushOnce(url: string, dir: string, env: Record<string, string | undefined>, ...extra: string[]) {
  const lines: string[] = []
  const code = await runPush(
    {
      args: ['--strapi', url, '--content', join(dir, 'content'), '--public', join(dir, 'public'), ...extra],
      root: ROOT,
      flags: { json: false },
    },
    env,
    { log: (s) => lines.push(s), error: (s) => lines.push(s) },
  )
  return { code, out: lines.join('\n'), last: lines.at(-1) ?? '' }
}

const folderPaths = (media: readonly string[]) => [...new Set(media.map((p) => p.slice(0, p.lastIndexOf('/'))))]
const writes = (log: readonly LogLine[]) => log.filter((l) => l.method === 'POST' || l.method === 'PUT')

describe('www-push against a fake Strapi', () => {
  let tree: { dir: string; media: string[] }
  let fake: FakeStrapi
  let first: Awaited<ReturnType<typeof pushOnce>>
  let firstLog: LogLine[]

  beforeAll(async () => {
    tree = miniTree()
    fake = await startFakeStrapi({ folders: folderPaths(tree.media) })
    first = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL })
    firstLog = [...fake.log]
  }, 60_000)
  afterAll(async () => {
    await fake.close()
    rmSync(tree.dir, { recursive: true, force: true })
  })

  it('creates every document and uploads every media file on the first run', () => {
    expect(first.code, first.out).toBe(0)
    const { bySource } = readContent(join(tree.dir, 'content'))
    for (const t of TYPES) {
      const files = bySource.get(t.source) ?? []
      const n = entriesOfSource(t.source, files).length
      expect(fake.docs.get(t.apiId)!.length, t.apiId).toBe(n)
      if (n > 0) expect(first.out).toContain(`${t.apiId}: ${n} created, 0 updated, 0 unchanged`)
    }
    expect(first.out).toContain(`media: ${tree.media.length} uploaded, 0 replaced, 0 unchanged`)
    expect(first.last).toMatch(/^[1-9]\d* changed$/)
  })

  it('is idempotent: a second run writes nothing and prints 0 changed', async () => {
    const before = fake.log.length
    const second = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL })
    expect(second.code, second.out).toBe(0)
    expect(second.last).toBe('0 changed')
    expect(writes(fake.log.slice(before))).toEqual([])
    expect(second.out).toContain(`media: 0 uploaded, 0 replaced, ${tree.media.length} unchanged`)
  }, 60_000)

  it('uploads each media file once, into the folder of its directory, with its file name', () => {
    expect([...fake.uploadCount.keys()].sort()).toEqual(tree.media)
    for (const [path, n] of fake.uploadCount) expect(n, path).toBe(1)
    for (const p of tree.media) {
      const bytes = readFileSync(join(tree.dir, 'public', p))
      const u = fake.uploads.find((x) => `${fake.folders.find((f) => f.id === x.folder)!.namePath}/${x.name}` === p)
      expect(u, p).toBeDefined()
      expect(Buffer.from(u!.bytes).equals(bytes), p).toBe(true)
      // the content API does not show a file's folder to a token: the site folder rides in the caption as well
      expect(u!.caption, p).toBe(p.slice(0, p.lastIndexOf('/')))
    }
  })

  it('creates relations in the spec order: media, then each type after the types it points at, landings in two passes', () => {
    const w = writes(firstLog)
    const firstDoc = w.findIndex((l) => l.path !== '/api/upload')
    expect(firstDoc).toBeGreaterThan(0)
    expect(
      w.slice(firstDoc).some((l) => l.path === '/api/upload'),
      'an upload after a document',
    ).toBe(false)
    const routeOrder = PUSH_ORDER.map((id) => TYPES.find((t) => t.apiId === id)!.route)
    const typeAt = (l: LogLine) => routeOrder.findIndex((r) => l.path === r || l.path.startsWith(`${r}/`))
    const docs = w.slice(firstDoc).map(typeAt)
    expect(docs.every((x) => x >= 0)).toBe(true)
    expect(docs).toEqual([...docs].sort((a, b) => a - b))
    // landings: every create carries no landing relation; the second pass sets only alternateOf and related
    const landing = w.filter((l) => l.path.startsWith('/api/landings'))
    const creates = landing.filter((l) => l.method === 'POST')
    const relations = landing.filter((l) => l.method === 'PUT')
    expect(creates.length).toBe(fake.docs.get('landing')!.length)
    for (const c of creates) {
      expect(c.data).not.toHaveProperty('alternateOf')
      expect(c.data).not.toHaveProperty('related')
    }
    expect(relations.length).toBeGreaterThan(0)
    for (const r of relations) expect(Object.keys(r.data!).sort()).toEqual(['alternateOf', 'related'])
    expect(landing.indexOf(relations[0]!)).toBeGreaterThan(landing.indexOf(creates.at(-1)!))
  })

  it('sets every relation to the documentId Strapi gave the related document', async () => {
    const client = createClient({ url: fake.url, token: FULL })
    const media = strapiMediaIndex(await readUploads(client))
    const { bySource } = readContent(join(tree.dir, 'content'))
    for (const t of TYPES) {
      const want = entriesOfSource(t.source, bySource.get(t.source) ?? [])
      const held = [...(await readType(client, t, 'published'))].map((d) => fromDocument(t, d, media))
      const drafts =
        t.kind === 'single'
          ? []
          : (await readType(client, t, 'draft')).filter((d) => !held.some((h) => h.id === d.slug))
      held.push(...drafts.map((d) => fromDocument(t, d, media)))
      const byId = new Map(held.map((e) => [e.id, e]))
      for (const e of want) {
        const h = byId.get(e.id)
        const { draft: _a, ...a } = e.data
        const { draft: _b, ...b } = h!.data
        expect(b, `${t.source}/${e.id}`).toEqual(a)
      }
    }
    // the stored relation is the id, never the slug or the mapping's offline id
    const post = fake.docs.get('blog-post')!.find((d) => d.published)!
    const author = fake.docs.get('author')!.find((d) => d.documentId === post.draft.author)
    expect(author, 'the author of a post by documentId').toBeDefined()
  })

  it('keeps a draft a draft and publishes the rest', () => {
    const posts = fake.docs.get('blog-post')!
    expect(posts.find((d) => d.draft.slug === 'ceo-real-playbook-for-ai')!.published).toBeNull()
    expect(posts.find((d) => d.draft.slug !== 'ceo-real-playbook-for-ai')!.published).not.toBeNull()
    for (const apiId of ['author', 'navigation', 'redirect'])
      for (const d of fake.docs.get(apiId)!) expect(d.published, apiId).not.toBeNull()
  })

  it('writes only what changed: one edited entry is one update', async () => {
    const file = join(tree.dir, 'content', 'partners', 'the-good-code.md')
    const text = readFileSync(file, 'utf8')
    writeFileSync(file, text.replace(/^name: .*$/m, 'name: The Good Code Edited'))
    try {
      const before = fake.log.length
      const r = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL })
      expect(r.code, r.out).toBe(0)
      expect(r.out).toContain('partner: 0 created, 1 updated, 0 unchanged')
      expect(r.last).toBe('1 changed')
      expect(
        writes(fake.log.slice(before)).map((l) => `${l.method} ${l.path.split('/').slice(0, 3).join('/')}`),
      ).toEqual(['PUT /api/partners'])
    } finally {
      writeFileSync(file, text)
    }
    expect((await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL })).last).toBe('1 changed')
    expect((await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL })).last).toBe('0 changed')
  }, 60_000)

  it('replaces a media file whose bytes changed, in place, and uploads nothing else', async () => {
    const p = tree.media.find((x) => x.endsWith('.svg'))!
    const file = join(tree.dir, 'public', p)
    const bytes = readFileSync(file)
    writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n<!-- edited -->\n')]))
    try {
      const r = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL })
      expect(r.code, r.out).toBe(0)
      expect(r.out).toContain('media: 0 uploaded, 1 replaced')
      expect(fake.uploads.length).toBe(tree.media.length)
    } finally {
      writeFileSync(file, bytes)
    }
    await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL })
  }, 60_000)
})

describe('www-push refuses before it writes', () => {
  let tree: { dir: string; media: string[] }
  beforeAll(() => {
    tree = miniTree()
  })
  afterAll(() => rmSync(tree.dir, { recursive: true, force: true }))

  it('a dry run reads, counts and writes nothing', async () => {
    const fake = await startFakeStrapi({ folders: folderPaths(tree.media) })
    try {
      const r = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL }, '--dry-run')
      expect(r.code, r.out).toBe(0)
      expect(r.out).toContain('dry run: nothing written')
      expect(r.out).toContain(`media: ${tree.media.length} uploaded`)
      expect(r.last).toMatch(/^[1-9]\d* changed$/)
      expect(writes(fake.log)).toEqual([])
    } finally {
      await fake.close()
    }
  }, 60_000)

  it('refuses to run in CI, without a request', async () => {
    const fake = await startFakeStrapi()
    try {
      const r = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL, CI: 'true' })
      expect(r.code).toBe(2)
      expect(r.out).toMatch(/refused in CI/)
      expect(fake.log).toEqual([])
    } finally {
      await fake.close()
    }
  })

  it('needs STRAPI_ADMIN_TOKEN and reads no other token', async () => {
    const read: string[] = []
    const env = new Proxy(
      { STRAPI_READ_TOKEN: 'test-read', STRAPI_DRAFTS_TOKEN: 'test-drafts' } as Record<string, string>,
      {
        get(t, k) {
          read.push(String(k))
          return t[k as string]
        },
      },
    )
    const r = await pushOnce('http://127.0.0.1:9', tree.dir, env)
    expect(r.code).toBe(2)
    expect(r.out).toMatch(/set STRAPI_ADMIN_TOKEN/)
    expect(read).not.toContain('STRAPI_READ_TOKEN')
    expect(read).not.toContain('STRAPI_DRAFTS_TOKEN')
  })

  it('names the missing Media Library folders and writes nothing', async () => {
    const fake = await startFakeStrapi({ folders: ['/media/blog'] })
    try {
      const r = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL })
      expect(r.code).toBe(2)
      expect(r.out).toMatch(/missing Media Library folders .*\/media\/landings/)
      expect(r.out).not.toMatch(/missing Media Library folders .*\/media\/blog[,\n]/)
      expect(writes(fake.log)).toEqual([])
    } finally {
      await fake.close()
    }
  })

  it('never prints the token, also when Strapi refuses it', async () => {
    const fake = await startFakeStrapi({ folders: folderPaths(tree.media) })
    const secret = 'not-a-token-of-this-instance-5f2c9a'
    try {
      const r = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: secret })
      expect(r.code).toBe(2)
      expect(r.out).toMatch(/answered 401: the token was refused/)
      expect(r.out).not.toContain(secret)
    } finally {
      await fake.close()
    }
  })

  it('refuses a token a header cannot carry before any request, without printing it', async () => {
    const fake = await startFakeStrapi({ folders: folderPaths(tree.media) })
    try {
      const r = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: 'abc\nsecret-part-xyz' })
      expect(r.code).toBe(2)
      expect(r.out).toMatch(/STRAPI_ADMIN_TOKEN holds characters an HTTP header cannot carry/)
      expect(r.out).not.toContain('secret-part-xyz')
      expect(fake.log).toEqual([])
    } finally {
      await fake.close()
    }
  })

  it('lists a value the mapping or Strapi refuses with its file and field, and exits 1', async () => {
    const fake = await startFakeStrapi({
      folders: folderPaths(tree.media),
      override: (method, url) =>
        method === 'POST' && url.pathname === '/api/jobs'
          ? {
              status: 400,
              body: {
                data: null,
                error: {
                  status: 400,
                  name: 'ValidationError',
                  message: '1 error occurred',
                  details: { errors: [{ path: ['salary'], message: 'salary must be at most 255 characters' }] },
                },
              },
            }
          : undefined,
    })
    const file = join(tree.dir, 'content', 'pages', 'pricing.yaml')
    const text = readFileSync(file, 'utf8')
    writeFileSync(file, `${text}colour: green\n`)
    try {
      const r = await pushOnce(fake.url, tree.dir, { STRAPI_ADMIN_TOKEN: FULL })
      expect(r.code, r.out).toBe(1)
      expect(r.out).toMatch(/refused: pages\/pricing: pages\/pricing: the field colour is not in the mapping/)
      expect(r.out).toMatch(/refused: jobs\/senior-ai-engineering: salary: salary must be at most 255 characters/)
    } finally {
      writeFileSync(file, text)
      await fake.close()
    }
  }, 60_000)
})

describe('the push order', () => {
  it('names every type once, each after the types it relates to', () => {
    expect([...PUSH_ORDER].sort()).toEqual(TYPES.map((t) => t.apiId).sort())
    for (const t of TYPES)
      for (const f of t.fields)
        if (f.kind === 'relation' && f.target !== t.apiId)
          expect(PUSH_ORDER.indexOf(f.target as never), `${t.apiId}.${f.key}`).toBeLessThan(
            PUSH_ORDER.indexOf(t.apiId as never),
          )
    expect(typeOf('redirects').apiId).toBe(PUSH_ORDER.at(-1))
  })
})

describe('the site path of an upload', () => {
  const file = (name: string, caption: string | null) =>
    ({ id: 1, documentId: name, name, url: `/uploads/${name}`, ext: '', mime: '', hash: name, caption }) as const

  it('is the site folder of its caption and its name, and /media/uploads for any other upload', () => {
    const index = strapiMediaIndex([
      file('a.png', '/media/blog'),
      file('Team Photo.PNG', null),
      file('b.png', 'a caption an editor wrote'),
      file('c.png', '/media/../secrets'),
    ])
    expect(index.files.map((f) => f.path)).toEqual([
      '/media/blog/a.png',
      '/media/uploads/b.png',
      '/media/uploads/c.png',
      '/media/uploads/team-photo.png',
    ])
  })

  it('refuses two uploads that reach the same path, naming both', () => {
    expect(() =>
      strapiMediaIndex([file('a.png', '/media/blog'), { ...file('a.png', '/media/blog'), documentId: 'other' }]),
    ).toThrow(/\/media\/blog\/a\.png: the uploads a\.png \(a\.png\) and a\.png \(other\)/)
  })
})
