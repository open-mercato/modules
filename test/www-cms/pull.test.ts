// Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 3.2: `yarn om www-pull`. From the REST fixture of
// test/fixtures/strapi/ it writes valid files; against a local fake Strapi (node:http on 127.0.0.1, a random port;
// test/www-cms/fake-strapi.ts) it gives back the files it was pushed from byte for byte, reads a type of more than 100
// documents over several pages, ends with exit 2 on a page size other than 100 and on an anonymous GET that answers
// 200, fails on a removed slug without a redirect, leaves the tree untouched on a corrupt or invalid answer, names a
// media file whose bytes differ from the snapshot manifest, reuses the others, and reads only STRAPI_DRAFTS_TOKEN for
// drafts (and only STRAPI_READ_TOKEN otherwise).
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runPull } from '../../lib/commands/www-pull.ts'
import { runPush } from '../../lib/commands/www-push.ts'
import { TYPES, typeOf } from '../../lib/www-cms/model.ts'
import { createClient } from '../../lib/www-cms/rest.ts'
import { readType, readUploads, type Upload } from '../../lib/www-cms/strapi.ts'
import { readMedia, walk } from '../../lib/www-cms/tree.ts'
import { mediaReferenceProblems } from '../../lib/www-cms/pull.ts'
import { startFakeStrapi, type FakeOptions, type FakeStrapi } from './fake-strapi.ts'
import { miniTree, RAW_MEDIA, ROOT } from './mini-tree.ts'

const FIXTURE = join(ROOT, 'test', 'fixtures', 'strapi')
const ENV = { STRAPI_READ_TOKEN: 'test-read', STRAPI_DRAFTS_TOKEN: 'test-drafts' }

async function pullOnce(url: string, out: string, env: Record<string, string | undefined>, ...extra: string[]) {
  const lines: string[] = []
  const code = await runPull({ args: ['--strapi', url, ...extra], root: ROOT, flags: { out, json: false } }, env, {
    log: (s) => lines.push(s),
    error: (s) => lines.push(s),
  })
  return { code, out: lines.join('\n'), last: lines.at(-1) ?? '' }
}

async function pushTree(url: string, dir: string) {
  const lines: string[] = []
  const code = await runPush(
    {
      args: ['--strapi', url, '--content', join(dir, 'content'), '--public', join(dir, 'public')],
      root: ROOT,
      flags: { json: false },
    },
    { STRAPI_ADMIN_TOKEN: 'test-full' },
    { log: (s) => lines.push(s), error: (s) => lines.push(s) },
  )
  expect(code, lines.join('\n')).toBe(0)
}

/** Every file of a tree by path, as bytes: content/ and public/ (manifest.json left out). */
function snapshotOf(dir: string): Map<string, string> {
  return new Map(
    walk(dir)
      .map((a) => relative(dir, a).split('\\').join('/'))
      .filter((p) => p !== 'manifest.json')
      .map((p) => [p, readFileSync(join(dir, p)).toString('base64')]),
  )
}

const folderPaths = (media: readonly string[]) => [...new Set(media.map((p) => p.slice(0, p.lastIndexOf('/'))))]

/** A fake Strapi holding the mini tree, pushed through www-push. */
async function heldFake(tree: { dir: string; media: string[] }, extra: FakeOptions = {}): Promise<FakeStrapi> {
  const fake = await startFakeStrapi({ folders: folderPaths(tree.media), ...extra })
  await pushTree(fake.url, tree.dir)
  return fake
}

const tmp = (name: string) => mkdtempSync(join(tmpdir(), `www-pull-${name}-`))

describe('www-pull from the REST fixture of test/fixtures/strapi', () => {
  let fake: FakeStrapi
  let out: string
  beforeAll(async () => {
    const recorded = JSON.parse(readFileSync(join(FIXTURE, 'api', 'upload', 'files.json'), 'utf8')) as Upload[]
    fake = await startFakeStrapi({
      override: (method, url, token) => {
        if (method !== 'GET' || token === undefined) return undefined
        const t = TYPES.find((x) => x.route === url.pathname)
        return t ? { status: 200, body: JSON.parse(readFileSync(join(FIXTURE, `${t.route}.json`), 'utf8')) } : undefined
      },
    })
    // the files the fixture's bodies link to by raw path, beside the recorded ones the fields use
    const linked = new Set<string>()
    for (const t of TYPES)
      for (const m of readFileSync(join(FIXTURE, `${t.route}.json`), 'utf8').matchAll(RAW_MEDIA))
        linked.add(m[0].replace(/[.,]+$/, ''))
    for (const u of recorded) linked.delete(`${u.caption}/${u.name}`)
    for (const p of linked) {
      if (!existsSync(join(ROOT, 'www', 'public', p)) || !statSync(join(ROOT, 'www', 'public', p)).isFile()) continue
      const dir = p.slice(0, p.lastIndexOf('/'))
      fake.addUpload(dir, p.slice(dir.length + 1), readFileSync(join(ROOT, 'www', 'public', p)))
    }
    for (const u of recorded) {
      const { id: _id, ...fields } = u
      fake.addUpload(u.caption!, u.name, readFileSync(join(ROOT, 'www', 'public', u.caption!, u.name)), fields)
    }
    out = tmp('fixture')
  })
  afterAll(async () => {
    await fake.close()
    rmSync(out, { recursive: true, force: true })
  })

  it('writes valid files: every type, the media under their site paths, and the manifest', async () => {
    const r = await pullOnce(fake.url, out, ENV)
    expect(r.code, r.out).toBe(0)
    expect(r.last).toBe('replaced')
    for (const t of TYPES) expect(r.out).toContain(`  ${t.apiId}: `)
    // the entry files the fixture was written from come back as they are in www/content
    for (const p of walk(join(out, 'content'))) {
      const path = relative(join(out, 'content'), p)
      if (/^(landings|pages|blog|case-studies|partners|jobs)\//.test(path) || path === 'navigation.json')
        expect(readFileSync(p, 'utf8') === readFileSync(join(ROOT, 'www', 'content', path), 'utf8'), path).toBe(true)
    }
    for (const p of (JSON.parse(readFileSync(join(FIXTURE, 'api', 'upload', 'files.json'), 'utf8')) as Upload[]).map(
      (u) => `${u.caption}/${u.name}`,
    ))
      expect(readFileSync(join(out, 'public', p)).equals(readFileSync(join(ROOT, 'www', 'public', p))), p).toBe(true)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    expect(manifest.version).toBe(1)
    expect(manifest.media.length).toBe(fake.uploads.length)
  })
})

describe('www-pull against a fake Strapi holding a copy of the content tree', () => {
  let tree: { dir: string; media: string[] }
  let fake: FakeStrapi
  beforeAll(async () => {
    tree = miniTree()
    fake = await heldFake(tree)
  }, 60_000)
  afterAll(async () => {
    await fake.close()
    rmSync(tree.dir, { recursive: true, force: true })
  })

  it('gives back the pushed files byte for byte with --drafts, and --check then finds no difference', async () => {
    const out = tmp('round')
    try {
      const r = await pullOnce(fake.url, out, ENV, '--drafts')
      expect(r.code, r.out).toBe(0)
      const want = snapshotOf(tree.dir)
      const got = snapshotOf(out)
      expect([...got.keys()].sort()).toEqual([...want.keys()].sort())
      for (const [p, b] of want) expect(got.get(p) === b, p).toBe(true)
      const c = await pullOnce(fake.url, out, ENV, '--drafts', '--check')
      expect(c.code, c.out).toBe(0)
      expect(c.last).toBe('0 files differ')
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('leaves out a document never published unless --drafts, and needs no redirect for a draft', async () => {
    const out = tmp('published')
    try {
      cpSync(tree.dir, out, { recursive: true })
      const r = await pullOnce(fake.url, out, ENV)
      expect(r.code, r.out).toBe(0)
      expect(walk(join(out, 'content', 'blog')).map((p) => relative(out, p))).toEqual([
        'content/blog/10-it-department-fears-about-open-mercato-answered-honestly.md',
      ])
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('--check writes nothing, lists the files that differ and exits 1', async () => {
    const out = tmp('check')
    try {
      cpSync(tree.dir, out, { recursive: true })
      const file = join(out, 'content', 'pages', 'pricing.yaml')
      writeFileSync(file, `${readFileSync(file, 'utf8')}# edited\n`)
      const before = snapshotOf(out)
      const r = await pullOnce(fake.url, out, ENV, '--drafts', '--check')
      expect(r.code, r.out).toBe(1)
      expect(r.out).toContain('differs: content/pages/pricing.yaml')
      expect(r.last).toBe('1 files differ')
      expect(snapshotOf(out)).toEqual(before)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('--status draft reads only STRAPI_DRAFTS_TOKEN and writes the draft version of a published document', async () => {
    const partner = fake.docs.get('partner')!.find((d) => d.draft.slug === 'the-good-code')!
    const saved = structuredClone(partner.draft)
    partner.draft = { ...partner.draft, name: 'The Good Code, not published yet' }
    const read: string[] = []
    const env = new Proxy(
      { ...ENV },
      {
        get(t, k) {
          read.push(String(k))
          return (t as Record<string, string>)[k as string]
        },
      },
    )
    const out = tmp('draft')
    const before = fake.log.length
    try {
      const r = await pullOnce(fake.url, out, env, '--status', 'draft')
      expect(r.code, r.out).toBe(0)
      expect(read).toContain('STRAPI_DRAFTS_TOKEN')
      expect(read).not.toContain('STRAPI_READ_TOKEN')
      expect(new Set(fake.log.slice(before).map((l) => l.token))).toEqual(new Set(['test-drafts', undefined]))
      expect(readFileSync(join(out, 'content', 'partners', 'the-good-code.md'), 'utf8')).toContain(
        'name: The Good Code, not published yet',
      )
      // no never-published document without --drafts
      expect(walk(join(out, 'content', 'blog')).length).toBe(1)

      // and the published pull reads only STRAPI_READ_TOKEN, and the published version
      read.length = 0
      const since = fake.log.length
      const p = await pullOnce(fake.url, out, env, '--check')
      expect(read).toContain('STRAPI_READ_TOKEN')
      expect(read).not.toContain('STRAPI_DRAFTS_TOKEN')
      expect(new Set(fake.log.slice(since).map((l) => l.token))).toEqual(new Set(['test-read', undefined]))
      expect(p.out).toContain('differs: content/partners/the-good-code.md')
    } finally {
      partner.draft = saved
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('names a media file whose bytes differ from the snapshot manifest and reuses every other file', async () => {
    const out = tmp('media')
    try {
      expect((await pullOnce(fake.url, out, ENV, '--drafts')).code).toBe(0)
      const p = tree.media.find((x) => x.endsWith('.svg'))!
      const u = fake.uploads.find((x) => x.name === p.slice(p.lastIndexOf('/') + 1))!
      const saved = { bytes: u.bytes, updatedAt: u.updatedAt }
      u.bytes = new Uint8Array(Buffer.concat([Buffer.from(u.bytes), Buffer.from('<!-- changed in Strapi -->')]))
      u.updatedAt = '2026-11-29T00:00:00.000Z'
      try {
        const r = await pullOnce(fake.url, out, ENV, '--drafts')
        expect(r.code, r.out).toBe(0)
        expect(r.out).toMatch(
          new RegExp(
            `media changed since the snapshot: ${p.replace(/[.]/g, '\\.')}: SHA-256 [0-9a-f]{12} in the snapshot manifest, [0-9a-f]{12} now`,
          ),
        )
        expect(r.out).toContain(`media: 1 downloaded, ${tree.media.length - 1} reused`)
        expect(readFileSync(join(out, 'public', p)).equals(Buffer.from(u.bytes))).toBe(true)
      } finally {
        Object.assign(u, saved)
      }
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('fails on a removed slug without a redirect, naming the old path, and leaves the tree untouched', async () => {
    const out = tmp('removed')
    const landings = fake.docs.get('landing')!
    const gone = landings.find((d) => d.draft.slug === 'hubspot-alternative')!
    try {
      cpSync(tree.dir, out, { recursive: true })
      const before = snapshotOf(out)
      landings.splice(landings.indexOf(gone), 1)
      for (const d of landings)
        for (const v of [d.draft, d.published])
          if (v) v.related = ((v.related as string[] | undefined) ?? []).filter((id) => id !== gone.documentId)
      const r = await pullOnce(fake.url, out, ENV, '--drafts')
      expect(r.code, r.out).toBe(1)
      expect(r.out).toContain(
        'invalid: /hubspot-alternative: the URL was in the snapshot and is gone (renamed, deleted or unpublished); add a redirect from /hubspot-alternative in Strapi',
      )
      expect(r.out).toContain('nothing replaced')
      expect(snapshotOf(out)).toEqual(before)

      // with a redirect from the old path in Strapi the pull goes through
      const id = fake.seed(
        'redirect',
        { slug: '/hubspot-alternative', from: '/hubspot-alternative', to: '/', statusCode: 301 },
        true,
      )
      const ok = await pullOnce(fake.url, out, ENV, '--drafts')
      expect(ok.code, ok.out).toBe(0)
      expect(readFileSync(join(out, 'content', 'redirects.yaml'), 'utf8')).toContain(
        '- from: /hubspot-alternative\n  to: /\n',
      )
      const redirects = fake.docs.get('redirect')!
      redirects.splice(
        redirects.findIndex((d) => d.documentId === id),
        1,
      )
    } finally {
      landings.push(gone)
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('leaves the tree untouched on a corrupt answer (exit 2) and on an invalid document (exit 1)', async () => {
    const out = tmp('corrupt')
    try {
      cpSync(tree.dir, out, { recursive: true })
      const before = snapshotOf(out)
      const corrupt = await startFakeStrapi({
        folders: folderPaths(tree.media),
        override: (method, url, token) =>
          token && url.pathname === '/api/blog-posts'
            ? { status: 200, raw: '{"data": [{"documentId": "x"' }
            : undefined,
      })
      try {
        await pushTree(corrupt.url, tree.dir).catch(() => {})
        const r = await pullOnce(corrupt.url, out, ENV, '--drafts')
        expect(r.code, r.out).toBe(2)
        expect(r.out).toMatch(/GET \/api\/blog-posts answered 200 without JSON/)
      } finally {
        await corrupt.close()
      }
      expect(snapshotOf(out)).toEqual(before)

      const job = fake.docs.get('job')![0]!
      const saved = structuredClone(job)
      job.published = { ...job.published!, title: null }
      job.draft = { ...job.draft, title: null }
      try {
        const r = await pullOnce(fake.url, out, ENV, '--drafts')
        expect(r.code, r.out).toBe(1)
        expect(r.out).toMatch(/invalid: jobs\/senior-ai-engineering\.md: title: /)
      } finally {
        Object.assign(job, saved)
      }
      expect(snapshotOf(out)).toEqual(before)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('www-pull reads every page and trusts no other paging', () => {
  let tree: { dir: string; media: string[] }
  beforeAll(() => {
    tree = miniTree()
  })
  afterAll(() => rmSync(tree.dir, { recursive: true, force: true }))

  it('reads a type of more than 100 documents over several pages', async () => {
    const fake = await heldFake(tree)
    const out = tmp('pages')
    try {
      const held = fake.docs.get('author')!.length
      for (let i = 0; i < 150; i++)
        fake.seed('author', { slug: `author-${String(i).padStart(3, '0')}`, name: `Author ${i}` }, true)
      const client = createClient({ url: fake.url, token: 'test-read' })
      expect((await readType(client, typeOf('authors'), 'published')).length).toBe(held + 150)
      const r = await pullOnce(fake.url, out, ENV, '--drafts')
      expect(r.code, r.out).toBe(0)
      expect(r.out).toContain(`author: ${held + 150}`)
      const pages = fake.log.filter((l) => l.path === '/api/authors' && l.token === 'test-drafts')
      expect(pages.map((l) => l.query.get('pagination[pageSize]'))).toContain('100')
      expect(new Set(pages.map((l) => l.query.get('pagination[page]')))).toEqual(new Set(['1', '2']))
      const authors = readFileSync(join(out, 'content', 'authors.yaml'), 'utf8')
      expect(authors).toContain('author-149:')
    } finally {
      await fake.close()
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('reads more than 100 uploads over several pages of start and limit, and fails on a page longer than 100', async () => {
    const fake = await startFakeStrapi()
    try {
      for (let i = 0; i < 205; i++) fake.addUpload('/media/blog', `f-${i}.png`, new Uint8Array([i % 256]))
      const client = createClient({ url: fake.url, token: 'test-read' })
      expect((await readUploads(client)).length).toBe(205)
      const starts = fake.log
        .filter((l) => l.path === '/api/upload/files')
        .map((l) => [l.query.get('start'), l.query.get('limit')])
      expect(starts).toEqual([
        ['0', '100'],
        ['100', '100'],
        ['200', '100'],
        // the short page is the last only when nothing follows it
        ['205', '1'],
      ])
    } finally {
      await fake.close()
    }
    const long = await startFakeStrapi({
      override: (method, url) =>
        url.pathname === '/api/upload/files'
          ? { status: 200, body: Array.from({ length: 101 }, (_, i) => ({ id: i })) }
          : undefined,
    })
    try {
      await expect(readUploads(createClient({ url: long.url, token: 'test-read' }))).rejects.toThrow(
        /101 files, more than the page size 100/,
      )
    } finally {
      await long.close()
    }
  })

  it('ends with exit 2 when an answer pages at a size other than 100, and leaves the tree untouched', async () => {
    let size25 = false
    const fake = await heldFake(tree, {
      override: (method, url, token) =>
        size25 && token && url.pathname === '/api/landings'
          ? {
              status: 200,
              body: { data: [], meta: { pagination: { page: 1, pageSize: 25, pageCount: 2, total: 32 } } },
            }
          : undefined,
    })
    const out = tmp('size')
    try {
      cpSync(tree.dir, out, { recursive: true })
      const before = snapshotOf(out)
      size25 = true
      const r = await pullOnce(fake.url, out, ENV)
      expect(r.code, r.out).toBe(2)
      expect(r.out).toMatch(/GET \/api\/landings page 1: page size 25, not 100/)
      expect(snapshotOf(out)).toEqual(before)
    } finally {
      await fake.close()
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('fails with exit 2 when an anonymous GET /api/<type> answers 200, before it reads any content', async () => {
    const fake = await heldFake(tree, { publicOpen: true })
    const out = tmp('open')
    try {
      const before = fake.log.length
      const r = await pullOnce(fake.url, out, ENV)
      expect(r.code, r.out).toBe(2)
      expect(r.out).toMatch(/anonymous GET of \/api\/landings.* with 200: the Public role can read the content API/)
      expect(fake.log.slice(before).every((l) => l.token === undefined)).toBe(true)
      expect(walk(out)).toEqual([])
    } finally {
      await fake.close()
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('needs its token and never reads the other one', async () => {
    const read: string[] = []
    const env = new Proxy({} as Record<string, string>, {
      get(t, k) {
        read.push(String(k))
        return t[k as string]
      },
    })
    const out = tmp('token')
    const r = await pullOnce('http://127.0.0.1:9', out, env, '--drafts')
    rmSync(out, { recursive: true, force: true })
    expect(r.code).toBe(2)
    expect(r.out).toMatch(/set STRAPI_DRAFTS_TOKEN/)
    expect(read).toEqual(['STRAPI_DRAFTS_TOKEN'])
  })
})

describe('www-pull after the review: the token stays on the instance, media paths hold, a failed replace undoes itself', () => {
  let tree: { dir: string; media: string[] }
  let fake: FakeStrapi
  beforeAll(async () => {
    tree = miniTree()
    fake = await heldFake(tree)
  }, 60_000)
  afterAll(async () => {
    await fake.close()
    rmSync(tree.dir, { recursive: true, force: true })
  })

  it('never sends the token to another origin, whatever url Strapi gives a file', async () => {
    const client = createClient({ url: fake.url, token: 'test-read' })
    for (const url of ['//evil.example/x', 'https://evil.example/x', `@evil.example/x`, 'uploads/x'])
      await expect(client.bytes(url), url).rejects.toThrow(
        /refused: only http:\/\/127\.0\.0\.1:\d+ is read|not a path of the instance/,
      )
    const ok = fake.uploads[0]!
    expect((await client.bytes(ok.url)).length).toBe(ok.bytes.length)
  })

  it('refuses a token a header cannot carry without printing it', async () => {
    const secret = 'abc\ndef-not-printed'
    const r = await pullOnce(fake.url, tmp('header'), { STRAPI_READ_TOKEN: secret })
    expect(r.code).toBe(2)
    expect(r.out).toMatch(/STRAPI_READ_TOKEN holds characters an HTTP header cannot carry/)
    expect(r.out).not.toContain('def-not-printed')
  })

  it('fails when an upload moved (its caption changed) and when a raw link has no file', async () => {
    const out = tmp('moved')
    try {
      expect((await pullOnce(fake.url, out, ENV, '--drafts')).code).toBe(0)
      const before = snapshotOf(out)
      // a file only the body links to by raw path (a field's file follows a move through the media index)
      const text = readFileSync(join(out, 'content', 'case-studies', 'arvo-configurator.md'), 'utf8')
      const raw = [...text.slice(text.indexOf('\n---\n', 4)).matchAll(RAW_MEDIA)][0]![0]
      const u = fake.uploads.find((x) => `${x.caption}/${x.name}` === raw)!
      const caption = u.caption
      u.caption = 'Team photo'
      try {
        const r = await pullOnce(fake.url, out, ENV, '--drafts')
        expect(r.code, r.out).toBe(1)
        expect(r.out).toContain(`invalid: ${raw}: the upload moved to /media/uploads/`)
        expect(r.out).toContain(`invalid: case-studies/arvo-configurator.md: ${raw} has no file in Strapi`)
        expect(snapshotOf(out)).toEqual(before)
      } finally {
        u.caption = caption
      }
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('refuses an upload name that is not one plain path segment', async () => {
    const odd = fake.addUpload('/media/blog', 'x.png', new Uint8Array([1]), { name: '..', caption: null })
    const out = tmp('name')
    try {
      const r = await pullOnce(fake.url, out, ENV, '--drafts')
      expect(r.code, r.out).toBe(1)
      expect(r.out).toContain('invalid: /media/uploads/..: not a media path the pull writes')
      expect(walk(out)).toEqual([])
    } finally {
      fake.uploads.splice(fake.uploads.indexOf(odd), 1)
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('puts the previous tree back when the replace fails half way, and exits 2', async () => {
    const out = tmp('undo')
    try {
      cpSync(tree.dir, out, { recursive: true })
      writeFileSync(join(out, 'content', 'pages', 'pricing.yaml'), 'an older pricing page\n')
      const before = snapshotOf(out)
      // public/ read-only: the content moves, the media cannot, and everything goes back
      chmodSync(join(out, 'public'), 0o555)
      let r: Awaited<ReturnType<typeof pullOnce>>
      try {
        r = await pullOnce(fake.url, out, ENV, '--drafts')
      } finally {
        chmodSync(join(out, 'public'), 0o755)
      }
      expect(r.code, r.out).toBe(2)
      expect(r.out).toMatch(/the tree could not be replaced, the previous one is back in place/)
      expect(snapshotOf(out)).toEqual(before)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)

  it('says so when the snapshot holds nothing to compare', async () => {
    const out = tmp('empty')
    try {
      const r = await pullOnce(fake.url, out, ENV, '--drafts')
      expect(r.code, r.out).toBe(0)
      expect(r.out).toMatch(/note: the snapshot .* holds no routed entry: the removed-URL rule had nothing to compare/)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)
})

describe("the raw media links of today's content", () => {
  it('each have their file in www/public, so the reference check passes on the site as it is', () => {
    const content = join(ROOT, 'www', 'content')
    const files = walk(content).map((a) => ({ path: relative(content, a), text: readFileSync(a, 'utf8') }))
    const media = new Set(readMedia(join(ROOT, 'www', 'public')).map((m) => m.path))
    expect(mediaReferenceProblems(files, media)).toEqual([])
    expect(files.some((f) => /\/media\/blog\//.test(f.text))).toBe(true)
  })
})
