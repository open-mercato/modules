// Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 4.1: the steps of `pages` that decide the main site's content
// (`yarn om www-content plan|read|apply`, lib/www-cms/snapshot.ts). `plan` reads only WWW_CONTENT_SOURCE and the two
// inputs, so with the variable unset no secret and no Strapi is read; `read` against a fake Strapi (node:http on
// 127.0.0.1, test/www-cms/fake-strapi.ts) takes every branch of lib/www-cms/source.ts the workflow takes: shadow
// compares and changes nothing, strapi replaces, a failed pull falls back to the snapshot or fails a publish; `apply`
// lays a snapshot over www/ with the checkout's generated redirects.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runPush } from '../../lib/commands/www-push.ts'
import { runWwwContent } from '../../lib/commands/www-content.ts'
import { splitRedirects } from '../../lib/www-cms/files.ts'
import { applyTree, manualRedirects, snapshotTree } from '../../lib/www-cms/snapshot.ts'
import { planContent } from '../../lib/www-cms/source.ts'
import { walk } from '../../lib/www-cms/tree.ts'
import { startFakeStrapi, type FakeStrapi } from './fake-strapi.ts'
import { MANUAL_RULE, miniTree, ROOT } from './mini-tree.ts'

const DRAFT_POST = 'blog/ceo-real-playbook-for-ai.md'
const tmp = (name: string) => mkdtempSync(join(tmpdir(), `www-content-${name}-`))

/** Every file of a tree by path, as base64. */
function bytesOf(dir: string): Map<string, string> {
  return new Map(
    walk(dir).map((a) => [relative(dir, a).split('\\').join('/'), readFileSync(a).toString('base64')] as const),
  )
}

/** Runs the command with an environment that records every key it reads, and files for the outputs and summary. */
async function run(args: string[], vars: Record<string, string | undefined>) {
  const dir = tmp('gh')
  const files = { GITHUB_OUTPUT: join(dir, 'output'), GITHUB_STEP_SUMMARY: join(dir, 'summary') }
  writeFileSync(files.GITHUB_OUTPUT, '')
  writeFileSync(files.GITHUB_STEP_SUMMARY, '')
  const read = new Set<string>()
  const all: Record<string, string | undefined> = { ...vars, ...files }
  const env = new Proxy(all, {
    get(t, k) {
      if (typeof k === 'string') read.add(k)
      return t[k as string]
    },
  })
  const lines: string[] = []
  const code = await runWwwContent({ args, root: ROOT }, env, {
    log: (s) => lines.push(s),
    error: (s) => lines.push(s),
  })
  const output = Object.fromEntries(
    readFileSync(files.GITHUB_OUTPUT, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
  const summary = readFileSync(files.GITHUB_STEP_SUMMARY, 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return { code, output, summary, out: lines.join('\n'), read }
}

describe('www-content plan: the variable and the inputs alone', () => {
  it('with WWW_CONTENT_SOURCE unset: the files, and no secret, no Strapi address, no summary', async () => {
    const r = await run(['plan'], {
      STRAPI_URL: 'https://cms.example',
      STRAPI_READ_TOKEN: 'secret',
      STRAPI_DRAFTS_TOKEN: 'secret',
    })
    expect(r.code, r.out).toBe(0)
    expect(r.output).toEqual({ pull: 'none', use: 'files', commit: '' })
    expect(r.summary).toBe('')
    expect([...r.read].filter((k) => k.startsWith('STRAPI'))).toEqual([])
    expect([...r.read].filter((k) => !k.startsWith('GITHUB_')).sort()).toEqual([
      'WWW_CONTENT_INPUT',
      'WWW_CONTENT_SOURCE',
      'WWW_SNAPSHOT_INPUT',
    ])
  })

  it('reads Strapi for shadow (compare) and strapi (replace), and not for files or a snapshot build', async () => {
    expect((await run(['plan'], { WWW_CONTENT_SOURCE: 'shadow' })).output).toEqual({ pull: 'compare' })
    expect((await run(['plan'], { WWW_CONTENT_SOURCE: 'strapi', WWW_CONTENT_INPUT: 'publish' })).output).toEqual({
      pull: 'replace',
    })
    expect((await run(['plan'], { WWW_CONTENT_SOURCE: 'files', WWW_CONTENT_INPUT: 'auto' })).output.pull).toBe('none')
    const snap = await run(['plan'], {
      WWW_CONTENT_SOURCE: 'strapi',
      WWW_CONTENT_INPUT: 'snapshot',
      WWW_SNAPSHOT_INPUT: '0123456789abcdef',
    })
    expect(snap.code).toBe(0)
    expect(snap.output).toEqual({ pull: 'none', use: 'snapshot', commit: '0123456789abcdef' })
    expect(snap.summary).toContain('Main site content from snapshot 0123456789abcdef, by hand')
  })

  it('a publish while the source is files reads the files and says so', async () => {
    const r = await run(['plan'], { WWW_CONTENT_INPUT: 'publish' })
    expect(r.output.use).toBe('files')
    expect(r.summary).toContain('A publish build while WWW_CONTENT_SOURCE is files')
  })

  it('stops the build before any read on a value outside its enum or a snapshot input without www_content snapshot', async () => {
    for (const vars of [
      { WWW_CONTENT_SOURCE: 'cms' },
      { WWW_CONTENT_SOURCE: 'strapi', WWW_CONTENT_INPUT: 'deploy' },
      { WWW_CONTENT_SOURCE: 'strapi', WWW_SNAPSHOT_INPUT: 'abcdef0' },
      { WWW_CONTENT_SOURCE: 'shadow', WWW_SNAPSHOT_INPUT: 'abcdef0' },
      { WWW_CONTENT_INPUT: 'snapshot', WWW_SNAPSHOT_INPUT: 'not a sha' },
    ]) {
      const r = await run(['plan'], vars)
      expect(r.code, JSON.stringify(vars)).toBe(1)
      expect(r.output.use).toBe('fail')
      expect(r.out).toMatch(/^::error title=www content::/)
    }
  })

  it('planContent: compare and replace defer the decision, everything else is decided without the token', () => {
    expect(planContent({ variable: undefined, input: undefined })).toMatchObject({
      pull: 'none',
      decision: { use: 'files' },
    })
    expect(planContent({ variable: 'shadow', input: 'publish' })).toEqual({ pull: 'compare' })
    expect(planContent({ variable: 'strapi', input: undefined })).toEqual({ pull: 'replace' })
    expect(planContent({ variable: 'strapi', input: 'snapshot', snapshotCommit: 'abcdef0' })).toMatchObject({
      pull: 'none',
      decision: { use: 'snapshot', commit: 'abcdef0' },
    })
  })
})

describe('www-content read against a fake Strapi', () => {
  let tree: { dir: string; media: string[] }
  let fake: FakeStrapi
  let snapshot: string
  const ENV = { STRAPI_READ_TOKEN: 'test-read' }

  beforeAll(async () => {
    tree = miniTree()
    const folders = [...new Set(tree.media.map((p) => p.slice(0, p.lastIndexOf('/'))))]
    fake = await startFakeStrapi({ folders })
    const lines: string[] = []
    const code = await runPush(
      {
        args: ['--strapi', fake.url, '--content', join(tree.dir, 'content'), '--public', join(tree.dir, 'public')],
        root: ROOT,
        flags: { json: false },
      },
      { STRAPI_ADMIN_TOKEN: 'test-full' },
      { log: (s) => lines.push(s), error: (s) => lines.push(s) },
    )
    expect(code, lines.join('\n')).toBe(0)
    // the published content without the draft post, as the site tree of a build
    rmSync(join(tree.dir, 'content', DRAFT_POST))
    // a last good snapshot: the same tree, as the snapshot job writes it
    snapshot = tmp('snapshot')
    const work = tmp('first')
    const r = await run(['read', '--www', tree.dir, '--work', work], {
      ...ENV,
      WWW_CONTENT_SOURCE: 'shadow',
      STRAPI_URL: fake.url,
    })
    expect(r.code, r.out).toBe(0)
    cpSync(join(work, 'snapshot'), snapshot, { recursive: true })
    rmSync(work, { recursive: true, force: true })
  }, 120_000)
  afterAll(async () => {
    await fake.close()
    for (const d of [tree.dir, snapshot]) rmSync(d, { recursive: true, force: true })
  })

  /** A copy of the site tree for one test, with a work directory. */
  function site() {
    const www = tmp('www')
    cpSync(tree.dir, www, { recursive: true })
    const work = tmp('work')
    return {
      www,
      work,
      done: () => [www, work].forEach((d) => rmSync(d, { recursive: true, force: true })),
    }
  }
  const snapArgs = () => ['--snapshot-dir', snapshot, '--snapshot-sha', '1a2b3c4d5e6f', '--snapshot-date', '2026-11-28']

  it('shadow, good pull: 0 files differ, www/ untouched, and a snapshot for the snapshot job', async () => {
    const s = site()
    try {
      const before = bytesOf(s.www)
      const r = await run(['read', '--www', s.www, '--work', s.work], {
        ...ENV,
        WWW_CONTENT_SOURCE: 'shadow',
        STRAPI_URL: fake.url,
      })
      expect(r.code, r.out).toBe(0)
      expect(r.output).toMatchObject({ use: 'files', snapshot: 'true', issue: 'none', commit: '' })
      expect(r.output.newest).toMatch(/^\d{4}-\d\d-\d\dT/)
      expect(r.summary).toContain('Strapi shadow: 0 files differ.')
      expect(bytesOf(s.www)).toEqual(before)
      // the snapshot: the pulled tree, redirects.yaml with its manual rules only
      const snap = join(s.work, 'snapshot')
      expect(readFileSync(join(snap, 'content', 'redirects.yaml'), 'utf8')).toBe(MANUAL_RULE)
      expect(existsSync(join(snap, 'manifest.json'))).toBe(true)
      expect(existsSync(join(snap, 'content', 'embeds'))).toBe(false)
      for (const m of tree.media) expect(existsSync(join(snap, 'public', m)), m).toBe(true)
    } finally {
      s.done()
    }
  }, 60_000)

  it('shadow: names the files that differ and still changes nothing', async () => {
    const s = site()
    try {
      const file = join(s.www, 'content', 'pages', 'pricing.yaml')
      writeFileSync(file, `${readFileSync(file, 'utf8')}# edited\n`)
      const before = bytesOf(s.www)
      const r = await run(['read', '--www', s.www, '--work', s.work], {
        ...ENV,
        WWW_CONTENT_SOURCE: 'shadow',
        STRAPI_URL: fake.url,
      })
      expect(r.code, r.out).toBe(0)
      expect(r.output.use).toBe('files')
      expect(r.summary).toContain('Strapi shadow: 1 files differ.')
      expect(r.summary).toContain('- `content/pages/pricing.yaml`')
      expect(bytesOf(s.www)).toEqual(before)
    } finally {
      s.done()
    }
  }, 60_000)

  it('shadow, Strapi down: the files, no snapshot, no issue', async () => {
    const s = site()
    try {
      const r = await run(['read', '--www', s.www, '--work', s.work], { ...ENV, WWW_CONTENT_SOURCE: 'shadow' })
      expect(r.code, r.out).toBe(0)
      expect(r.output).toMatchObject({ use: 'files', snapshot: 'false', issue: 'none' })
      expect(r.summary).toContain('Strapi shadow: Strapi unreachable: the variable STRAPI_URL is not set.')
    } finally {
      s.done()
    }
  })

  it('strapi, good pull: the pull replaces www/ content and media, the issue is closed', async () => {
    const s = site()
    try {
      const want = bytesOf(s.www)
      const file = join(s.www, 'content', 'pages', 'pricing.yaml')
      writeFileSync(file, 'stale: true\n')
      writeFileSync(join(s.www, 'public', 'media', 'stale.png'), 'x')
      const r = await run(['read', '--www', s.www, '--work', s.work, ...snapArgs()], {
        ...ENV,
        WWW_CONTENT_SOURCE: 'strapi',
        WWW_CONTENT_INPUT: 'publish',
        STRAPI_URL: fake.url,
      })
      expect(r.code, r.out).toBe(0)
      expect(r.output).toMatchObject({ use: 'pull', snapshot: 'true', issue: 'close' })
      expect(r.summary).toContain('Main site content from Strapi, newest change ')
      expect(bytesOf(s.www)).toEqual(want)
    } finally {
      s.done()
    }
  }, 60_000)

  it('strapi, Strapi down, not a publish: the snapshot, with the reason, and the issue updated', async () => {
    const s = site()
    try {
      const before = bytesOf(s.www)
      const r = await run(['read', '--www', s.www, '--work', s.work, ...snapArgs()], {
        ...ENV,
        WWW_CONTENT_SOURCE: 'strapi',
        STRAPI_URL: 'http://127.0.0.1:9',
      })
      expect(r.code, r.out).toBe(0)
      expect(r.output).toMatchObject({ use: 'snapshot', commit: '1a2b3c4d5e6f', snapshot: 'false', issue: 'update' })
      expect(r.summary).toMatch(/^Main site content from snapshot 1a2b3c4d5e6f of 2026-11-28: Strapi unreachable: /)
      expect(bytesOf(s.www)).toEqual(before)
    } finally {
      s.done()
    }
  }, 60_000)

  it('strapi, Strapi down, a publish: the build stops, nothing deploys, the issue is updated', async () => {
    const s = site()
    try {
      const before = bytesOf(s.www)
      const r = await run(['read', '--www', s.www, '--work', s.work, ...snapArgs()], {
        ...ENV,
        WWW_CONTENT_SOURCE: 'strapi',
        WWW_CONTENT_INPUT: 'publish',
      })
      expect(r.code, r.out).toBe(1)
      expect(r.output).toMatchObject({ use: 'fail', issue: 'update' })
      expect(r.out).toContain('::error title=www content::Strapi unreachable: the variable STRAPI_URL is not set.')
      expect(bytesOf(s.www)).toEqual(before)
    } finally {
      s.done()
    }
  })

  it('strapi, Strapi down, no snapshot yet: the build stops', async () => {
    const s = site()
    try {
      const r = await run(['read', '--www', s.www, '--work', s.work], { WWW_CONTENT_SOURCE: 'strapi', ...ENV })
      expect(r.code, r.out).toBe(1)
      expect(r.out).toContain('and there is no snapshot to fall back to')
    } finally {
      s.done()
    }
  })

  it('strapi, invalid content: a publish stops with every problem, another build falls back', async () => {
    const job = fake.docs.get('job')![0]!
    const saved = structuredClone(job)
    job.published = { ...job.published!, title: null }
    const s = site()
    try {
      const before = bytesOf(s.www)
      const vars = { ...ENV, WWW_CONTENT_SOURCE: 'strapi', STRAPI_URL: fake.url }
      const publish = await run(['read', '--www', s.www, '--work', s.work, ...snapArgs()], {
        ...vars,
        WWW_CONTENT_INPUT: 'publish',
      })
      expect(publish.code, publish.out).toBe(1)
      expect(publish.out).toContain('::error title=www content::Strapi content invalid.')
      expect(publish.summary).toMatch(/- jobs\/senior-ai-engineering\.md: title: /)
      const other = await run(['read', '--www', s.www, '--work', s.work, ...snapArgs()], vars)
      expect(other.code, other.out).toBe(0)
      expect(other.output).toMatchObject({ use: 'snapshot', issue: 'update' })
      expect(other.summary).toContain(
        'Main site content from snapshot 1a2b3c4d5e6f of 2026-11-28: Strapi content invalid.',
      )
      expect(bytesOf(s.www)).toEqual(before)
    } finally {
      Object.assign(job, saved)
      s.done()
    }
  }, 60_000)

  it('refuses to read when the plan pulls nothing', async () => {
    const r = await run(['read', '--work', tmp('none')], { STRAPI_READ_TOKEN: 'x' })
    expect(r.code).toBe(2)
  })

  it('apply: a snapshot over www/ keeps the embeds and the generated redirects of the checkout', async () => {
    const s = site()
    try {
      const want = bytesOf(s.www)
      // a site tree whose content and media moved on since the snapshot
      writeFileSync(join(s.www, 'content', 'pages', 'pricing.yaml'), 'newer: true\n')
      writeFileSync(join(s.www, 'content', DRAFT_POST), 'not in the snapshot\n')
      mkdirSync(join(s.www, 'content', 'embeds'), { recursive: true })
      writeFileSync(join(s.www, 'content', 'embeds', 'tool.html'), '<p>tool</p>\n')
      const redirects = join(s.www, 'content', 'redirects.yaml')
      const kept = `${splitRedirects(readFileSync(redirects, 'utf8')).kept}- from: /generated\n  to: /x\n  status: 301\n  source: docs-map\n`
      writeFileSync(redirects, `${kept}- from: /a-newer-manual\n  to: /pricing\n  status: 301\n  source: manual\n`)
      rmSync(join(s.www, 'public', 'files'), { recursive: true })

      const r = await run(['apply', '--www', s.www, '--from', snapshot], {})
      expect(r.code, r.out).toBe(0)
      const got = bytesOf(s.www)
      expect(got.get('content/embeds/tool.html')).toBe(Buffer.from('<p>tool</p>\n').toString('base64'))
      expect(readFileSync(redirects, 'utf8')).toBe(`${kept}${MANUAL_RULE}`)
      got.delete('content/embeds/tool.html')
      got.delete('content/redirects.yaml')
      const expected = new Map(want)
      expected.delete('content/redirects.yaml')
      expect(got).toEqual(expected)
    } finally {
      s.done()
    }
  })

  it('apply: a tree that is not a snapshot changes nothing and stops the build', async () => {
    const s = site()
    const bad = tmp('bad')
    try {
      const before = bytesOf(s.www)
      expect((await run(['apply', '--www', s.www, '--from', bad], {})).code).toBe(1)
      cpSync(snapshot, bad, { recursive: true })
      writeFileSync(join(bad, 'content', 'embeds.html'), 'x')
      const r = await run(['apply', '--www', s.www, '--from', bad], {})
      expect(r.code).toBe(1)
      expect(r.out).toContain('content/embeds.html: not a file a Strapi type holds')
      rmSync(join(bad, 'content', 'embeds.html'))
      symlinkSync('/etc/hostname', join(bad, 'public', 'media', 'link.png'))
      const l = await run(['apply', '--www', s.www, '--from', bad], {})
      expect(l.code).toBe(1)
      expect(l.out).toContain('public/media/link.png: not a regular file')
      expect(bytesOf(s.www)).toEqual(before)
    } finally {
      s.done()
      rmSync(bad, { recursive: true, force: true })
    }
  })
})

describe('lib/www-cms/snapshot.ts', () => {
  it('manualRedirects: the manual rules as text, the whole file when it holds only them, empty without any', () => {
    const generated = '# generated\n- from: /a\n  to: /b\n  status: 301\n  source: docs-map\n'
    expect(manualRedirects(`${generated}${MANUAL_RULE}`)).toBe(MANUAL_RULE)
    expect(manualRedirects(MANUAL_RULE)).toBe(MANUAL_RULE)
    expect(manualRedirects(generated)).toBe('')
  })

  it('snapshotTree and applyTree refuse a tree without content/ or manifest.json', () => {
    const d = tmp('empty')
    try {
      expect(() => snapshotTree(d, join(d, 'out'))).toThrow(/not a content tree of www-pull/)
      expect(() => applyTree(d, join(d, 'www'))).toThrow(/not a content tree of www-pull/)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })
})
