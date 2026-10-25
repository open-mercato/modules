// `yarn om emit` as a command and the Astro integration (spec 3.4, 5.4): files land in site/.generated, dist/
// gets them without collisions, dev serves them under the base path, the origin trial meta reaches the pages.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, test } from 'vitest'
import emit, { siteUrl } from '../../lib/commands/emit.ts'
import {
  collisions,
  copyGenerated,
  injectMeta,
  omData,
  originTrialPages,
  resolveDevFile,
} from '../../lib/emit/astro-integration.ts'
import { loadSiteData } from '../../lib/emit/site-data.ts'
import { writeEmit } from '../../lib/emit/write.ts'
import type { ModulesIndex } from '../../lib/schema/published/modules.ts'
import { DATA, DESCRIPTORS, fixtureEmit, NOW, ROOT, skillsDir, tmp } from './helpers.ts'

function run(args: string[], data = DATA): { code: number; to: string } {
  const to = join(tmp(), 'generated')
  const log = console.log
  const err = console.error
  console.log = () => {}
  console.error = () => {}
  try {
    const code = emit({
      args: ['--to', to, '--modules', DESCRIPTORS, '--now', NOW, '--skills', skillsDir(), ...args],
      flags: { data, out: 'out', offline: true, json: false },
      root: ROOT,
    }) as number
    return { code, to }
  } finally {
    console.log = log
    console.error = err
  }
}

describe('yarn om emit', () => {
  test('writes public/ and data/ from the fixture', () => {
    const { code, to } = run([])
    expect(code).toBe(0)
    for (const f of [
      'public/modules.json',
      'public/m/@fastwhitecat/integration-ksef-direct.md',
      'data/site.json',
      'data/hive.json',
    ])
      expect(existsSync(join(to, f)), f).toBe(true)
    const m = JSON.parse(readFileSync(join(to, 'public', 'modules.json'), 'utf8')) as ModulesIndex
    expect(m.site).toBe('https://open-mercato.github.io/modules')
    const site = loadSiteData(to)
    expect(site.modules.entries).toHaveLength(8)
    expect(site.detail('@fastwhitecat/integration-ksef-direct')?.facts?.package.version).toBe('0.1.8')
    expect(site.card('@fastwhitecat/integration-ksef-direct')).toMatch(/^---\nlocator: /)
    expect(site.detail('../../package')).toBeNull()
    expect(Object.keys(site.plans)).toHaveLength(8)
    expect(site.hive.length).toBe(11)
  })

  test('--site and --base, also for the domain', () => {
    expect(siteUrl('https://modules.openmercato.com', '/')).toEqual({
      site: 'https://modules.openmercato.com',
      base: '/',
    })
    expect(siteUrl('https://wojciechszyjka.github.io/', 'modules/')).toEqual({
      site: 'https://wojciechszyjka.github.io/modules',
      base: '/modules',
    })
    const { code, to } = run(['--site', 'https://modules.openmercato.com', '--base', '/'])
    expect(code).toBe(0)
    expect(readFileSync(join(to, 'public', 'robots.txt'), 'utf8')).toContain('Sitemap:')
  })

  test('a missing data branch still emits (first day)', () => {
    const { code, to } = run([], join(tmp(), 'no-data'))
    expect(code).toBe(0)
    expect(existsSync(join(to, 'public', 'modules.json'))).toBe(true)
  })

  test('bad arguments are environment errors', () => {
    expect(run(['--site', 'not a url']).code).toBe(2)
    expect(run(['--now', 'yesterday']).code).toBe(2)
    expect(run(['--unknown', 'x']).code).toBe(2)
    expect(run(['--mcp-url', 'http://insecure.test/mcp']).code).toBe(2)
  })

  test('a second run replaces the output: files of removed entries do not linger', () => {
    const { to } = run([])
    const stale = join(to, 'public', 'm', 'gone.md')
    writeFileSync(stale, 'old')
    writeEmit(to, fixtureEmit())
    expect(existsSync(stale)).toBe(false)
  })
})

describe('Astro integration omData()', () => {
  test('no collision between the emitter output and site/public (spec 3.4)', () => {
    const { to } = run([])
    expect(collisions(join(to, 'public'), join(ROOT, 'site', 'public'))).toEqual([])
  })

  test('copy into dist/ fails on a path that a page or site/public already wrote', () => {
    const { to } = run([])
    const dist = tmp()
    mkdirSync(join(dist, 'm', '@fastwhitecat'), { recursive: true })
    writeFileSync(join(dist, 'm', '@fastwhitecat', 'integration-ksef-direct.md'), 'from a page')
    const r = copyGenerated(join(to, 'public'), dist)
    expect(r.collisions).toEqual(['m/@fastwhitecat/integration-ksef-direct.md'])
    const clean = tmp()
    const ok = copyGenerated(join(to, 'public'), clean)
    expect(ok.collisions).toEqual([])
    expect(existsSync(join(clean, '.well-known', 'mcp', 'server-card.json'))).toBe(true)
    expect(existsSync(join(clean, 'modules.json'))).toBe(true)
  })

  test('dev middleware path resolution: base path, stripped base, no traversal', () => {
    const { to } = run([])
    const pub = join(to, 'public')
    expect(resolveDevFile(pub, '/modules', '/modules/modules.json')).toBe(join(pub, 'modules.json'))
    expect(resolveDevFile(pub, '/modules', '/modules.json')).toBe(join(pub, 'modules.json'))
    expect(resolveDevFile(pub, '/modules', '/modules/m/@fastwhitecat/integration-ksef-direct.md?x=1')).toBe(
      join(pub, 'm', '@fastwhitecat', 'integration-ksef-direct.md'),
    )
    expect(resolveDevFile(pub, '/', '/.well-known/mcp/server-card.json')).toBe(
      join(pub, '.well-known', 'mcp', 'server-card.json'),
    )
    expect(resolveDevFile(pub, '/modules', '/modules/../../package.json')).toBeNull()
    expect(resolveDevFile(pub, '/modules', '/modules/%2e%2e/%2e%2e/package.json')).toBeNull()
    expect(resolveDevFile(pub, '/modules', '/modules/m')).toBeNull() // a directory
    expect(resolveDevFile(pub, '/modules', '/modules/%E0%A4%A')).toBeNull()
  })

  test('origin trial meta: /, /m/* and /for-agents only, once', () => {
    const dist = tmp()
    mkdirSync(join(dist, 'm', '@x'), { recursive: true })
    for (const f of ['index.html', 'for-agents.html', 'about.html', join('m', '@x', 'y.html')])
      writeFileSync(join(dist, f), '<!doctype html><html><head><title>t</title></head><body></body></html>')
    expect(
      originTrialPages(dist)
        .map((f) => f.slice(dist.length + 1))
        .sort(),
    ).toEqual(['for-agents.html', 'index.html', join('m', '@x', 'y.html')])
    const tag = '<meta http-equiv="origin-trial" content="TOKEN">'
    const once = injectMeta('<html><head lang="en"><title>t</title></head></html>', tag)
    expect(once).toBe(`<html><head lang="en"><title>t</title>${tag}</head></html>`)
    expect(injectMeta(once, tag)).toBe(once)
  })

  test('origin trial meta: never before the charset meta, so a 4 KB token keeps charset in the first 1024 bytes', () => {
    const token = 'A'.repeat(4096)
    const tag = `<meta http-equiv="origin-trial" content="${token}">`
    const page =
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body></body></html>'
    const out = injectMeta(page, tag)
    expect(out).toBe(
      `<!doctype html><html lang="en"><head><meta charset="utf-8">${tag}<title>t</title></head><body></body></html>`,
    )
    expect(out.indexOf('<meta charset="utf-8">')).toBeLessThan(1024)
    expect(out.indexOf(tag)).toBeGreaterThan(out.indexOf('charset'))
  })

  test('origin trial meta: the redirect pages emit wrote under m/ are left alone', () => {
    const dist = tmp()
    mkdirSync(join(dist, 'm', '@x'), { recursive: true })
    mkdirSync(join(dist, 'm', '@old'), { recursive: true })
    for (const f of ['index.html', join('m', '@x', 'y.html'), join('m', '@old', 'y.html')])
      writeFileSync(join(dist, f), '<!doctype html><html><head><title>t</title></head><body></body></html>')
    expect(
      originTrialPages(dist, new Set(['m/@old/y.html']))
        .map((f) => f.slice(dist.length + 1))
        .sort(),
    ).toEqual(['index.html', join('m', '@x', 'y.html')])
  })

  test('origin trial meta: the real redirect page of a renamed entry is an emitted file, so it is skipped', () => {
    const { to } = run([])
    const pub = join(to, 'public')
    const redirects = readdirSync(join(pub, 'm'), { recursive: true, encoding: 'utf8' }).filter((f) =>
      f.endsWith('.html'),
    )
    expect(redirects.length).toBeGreaterThan(0)
    const dist = tmp()
    copyGenerated(pub, dist)
    const emitted = new Set(redirects.map((f) => `m/${f.split(sep).join('/')}`))
    expect(originTrialPages(dist, emitted)).toEqual([])
  })

  test('the integration object has the three hooks', () => {
    const i = omData()
    expect(i.name).toBe('om-data')
    expect(Object.keys(i.hooks).sort()).toEqual(['astro:build:done', 'astro:config:setup', 'astro:server:setup'])
  })
})

describe('home page HTML budget (spec 7.11, review r3)', () => {
  test('measures dist/index.html gzip and speaks from 90 % of 60 KB', async () => {
    const { homeHtmlBudget, homeHtmlBudgetMessage, HOME_HTML_MAX_GZIP } =
      await import('../../lib/emit/astro-integration.ts')
    const dist = tmp('om-dist-')
    expect(homeHtmlBudget(dist)).toBeNull()
    writeFileSync(join(dist, 'index.html'), `<!doctype html><title>x</title>${'<p>row</p>'.repeat(200)}`)
    const small = homeHtmlBudget(dist)!
    expect(small.max).toBe(HOME_HTML_MAX_GZIP)
    expect(small.gzip).toBeGreaterThan(0)
    expect(homeHtmlBudgetMessage(small)).toBeNull()
    expect(homeHtmlBudgetMessage({ gzip: 55 * 1024, max: HOME_HTML_MAX_GZIP, share: 55 / 60 })).toBe(
      'index.html 55.0 KB gzip is 92% of the 60.0 KB budget (spec 7.11)',
    )
    expect(homeHtmlBudgetMessage({ gzip: 61 * 1024, max: HOME_HTML_MAX_GZIP, share: 61 / 60 })).toBe(
      'over budget: index.html 61.0 KB gzip > 60.0 KB (spec 7.11)',
    )
  })
})
