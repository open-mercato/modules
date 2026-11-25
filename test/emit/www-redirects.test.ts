// The main site's redirects end to end (www site migration spec, Merged root files, Phase 8): redirects.yaml as the
// www build reads it, its rules in dist-www/_redirects, merged into the root _redirects by `pages-site --merge`, and
// the check of loops, chains longer than one hop, targets and the yaml against the upload.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SiteConfig } from '../../lib/core/site-host.ts'
import { finishNestedLayout } from '../../lib/emit/pages-layout.ts'
import {
  checkMergedLayout,
  mergedRedirects,
  mergePagesSite,
  redirectProblems,
  sitemapIndexXml,
} from '../../lib/emit/pages-merge.ts'
import {
  parseWwwRedirects,
  redirectChainProblems,
  WWW_REDIRECTS_HEAD,
  wwwRedirectsText,
  wwwRedirectsTextProblems,
  type WwwRedirect,
} from '../../lib/emit/www-redirects.ts'

const WWW: SiteConfig = { origin: 'https://www.openmercato.com', base: '/run', home: '/modules', merged: true }
const ORIGIN = WWW.origin
const repo = join(import.meta.dirname, '..', '..')

function put(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/** The problems of the check about _redirects (the catalog fixture here is only as complete as the merge needs). */
const redirectsOnly = (r: { problems: string[] }): string[] => r.problems.filter((p) => p.includes('_redirects'))

const rule = (from: string, to: string, source: WwwRedirect['source'] = 'manual'): WwwRedirect => ({
  from,
  to,
  status: 301,
  source,
})

const DOCS = [
  rule('/docs', 'https://docs.openmercato.com/', 'docs-map'),
  rule('/docs/cli-overview', 'https://docs.openmercato.com/cli/overview', 'docs-map'),
  rule('/docs/*', 'https://docs.openmercato.com/', 'docs-map'),
]

describe('redirects.yaml as the www build reads it', () => {
  it('validates every rule as the content collection does', () => {
    const yaml = '# comment\n- from: /a\n  to: /b\n  status: 301\n  source: webflow-panel\n'
    expect(parseWwwRedirects(yaml)).toEqual([rule('/a', '/b', 'webflow-panel')])
    expect(parseWwwRedirects('')).toEqual([])
    expect(() => parseWwwRedirects('- from: /a\n  to: /b\n  status: 302\n  source: manual\n')).toThrow(/rule 1/)
    expect(() => parseWwwRedirects('- from: a\n  to: /b\n  status: 301\n  source: manual\n')).toThrow(/rule 1/)
    expect(() =>
      parseWwwRedirects(
        '- {from: /a, to: /b, status: 301, source: manual}\n- {from: /a, to: /c, status: 301, source: manual}\n',
      ),
    ).toThrow(/\/a is given twice/)
    expect(() => parseWwwRedirects('a: 1\n')).toThrow(/a list of rules/)
  })

  it('writes dist-www/_redirects in file order and reads it back', () => {
    const text = wwwRedirectsText([rule('/old', '/blog', 'webflow-panel'), ...DOCS])
    expect(text).toBe(
      `${WWW_REDIRECTS_HEAD}\n/old /blog 301\n/docs https://docs.openmercato.com/ 301\n` +
        '/docs/cli-overview https://docs.openmercato.com/cli/overview 301\n/docs/* https://docs.openmercato.com/ 301\n',
    )
    expect(wwwRedirectsTextProblems(text)).toEqual([])
    expect(wwwRedirectsTextProblems('')).toEqual([])
    expect(wwwRedirectsText([])).toBe('')
    expect(wwwRedirectsTextProblems('/a /b 301\n')).toEqual([`does not begin with "${WWW_REDIRECTS_HEAD}"`])
    expect(wwwRedirectsTextProblems(`${WWW_REDIRECTS_HEAD}\n/a /b 302\n/a b 301\n`)).toEqual([
      'line 2 is not a rule "from to 301": /a /b 302',
      'line 3 is not a rule "from to 301": /a b 301',
    ])
  })

  it('the committed redirects.yaml: the docs map with its catch-all last, no webflow-panel rule yet, merged clean', () => {
    const rules = parseWwwRedirects(readFileSync(join(repo, 'www/content/redirects.yaml'), 'utf8'))
    expect(rules.length).toBeGreaterThan(3)
    expect(rules.slice(0, 2).map((r) => r.from)).toEqual(['/docs', '/documentation'])
    expect(rules[rules.length - 1]).toEqual(rule('/docs/*', 'https://docs.openmercato.com/', 'docs-map'))
    expect(rules.every((r) => r.source === 'docs-map' && r.to.startsWith('https://docs.openmercato.com/'))).toBe(true)
    const merged = mergedRedirects(WWW, wwwRedirectsText(rules))
    expect(redirectProblems(merged)).toEqual([])
    expect(redirectChainProblems(merged, ORIGIN)).toEqual([])
  })
})

describe('loops and chains', () => {
  it('passes one hop, rules that leave the site and the catalog rules', () => {
    const text = `${mergedRedirects(WWW)}/a /b 301\n/c ${ORIGIN}/d 301\n/docs/* https://docs.openmercato.com/ 301\n`
    expect(redirectChainProblems(text, ORIGIN)).toEqual([])
  })

  it('fails a chain longer than one hop, also through an absolute address on the origin or a splat', () => {
    expect(redirectChainProblems('/a /b 301\n/b /c 301\n', ORIGIN)).toEqual([
      'the redirect from /a is a chain of 2 hops: /a -> /b; point it at the last target',
    ])
    expect(redirectChainProblems(`/a ${ORIGIN}/b 301\n/b /c 301\n/c /d 301\n`, ORIGIN)[0]).toBe(
      'the redirect from /a is a chain of 3 hops: /a -> /b -> /c; point it at the last target',
    )
    expect(redirectChainProblems('/old/* /new/:splat 301\n/new/* /newer 301\n', ORIGIN)[0]).toMatch(
      /the redirect from \/old\/\* is a chain of 2 hops: \/old\/\* -> \/new\/x/,
    )
  })

  it('fails a splat whose target prefix holds a fixed source', () => {
    expect(redirectChainProblems('/a/* /b/:splat 301\n/b/c /d 301\n', ORIGIN)).toEqual([
      'the redirect from /a/* is a chain of 2 hops for paths under /b/: /a/* -> /b/c; point it at the last target',
    ])
    expect(redirectChainProblems('/a/* /b/:splat 301\n/c/d /e 301\n', ORIGIN)).toEqual([])
  })

  it('fails a loop, itself included', () => {
    expect(redirectChainProblems('/a /a 301\n', ORIGIN)).toEqual(['the redirect from /a loops: /a -> /a'])
    expect(redirectChainProblems('/a /b 301\n/b /a 301\n', ORIGIN)).toEqual([
      'the redirect from /a loops: /a -> /b -> /a',
      'the redirect from /b loops: /b -> /a -> /b',
    ])
  })
})

describe('merge and check', () => {
  let tmp: string
  let dirs: { www: string; run: string; out: string }
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'om-www-redirects-'))
    dirs = { www: join(tmp, 'dist-www'), run: join(tmp, 'dist-run'), out: join(tmp, 'dist') }
    const s = join(dirs.run, 'run')
    put(join(s, 'modules.html'), `<link rel="canonical" href="${ORIGIN}/run/modules">`)
    put(join(s, '404.html'), '<a href="/run/modules">home</a>')
    put(join(s, 'sitemap-index.xml'), sitemapIndexXml([`${ORIGIN}/run/sitemap-0.xml`]))
    put(join(s, 'sitemap-0.xml'), `<urlset><url><loc>${ORIGIN}/run/modules</loc></url></urlset>`)
    finishNestedLayout(dirs.run, WWW, false)
    put(join(dirs.www, 'index.html'), `<link rel="canonical" href="${ORIGIN}/">`)
    put(join(dirs.www, '404.html'), '<a href="/">home</a>')
    put(join(dirs.www, 'blog.html'), '<a href="/">home</a>')
    put(join(dirs.www, 'sitemap-index.xml'), sitemapIndexXml([`${ORIGIN}/sitemap-0.xml`]))
    put(join(dirs.www, 'sitemap-0.xml'), `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`)
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('appends the www rules to the root _redirects, after the fixed ones, and the check wants the yaml', () => {
    const text = wwwRedirectsText([rule('/old-blog', '/blog', 'webflow-panel'), ...DOCS])
    put(join(dirs.www, '_redirects'), text)
    const r = mergePagesSite(dirs, WWW)
    expect(r.redirects).toBe(4)
    const root = readFileSync(join(dirs.out, '_redirects'), 'utf8')
    expect(root).toBe(mergedRedirects(WWW) + text)
    expect(redirectsOnly(checkMergedLayout(dirs.out, WWW, 50, false, text))).toEqual([])
    // the upload was built from another yaml
    expect(redirectsOnly(checkMergedLayout(dirs.out, WWW, 50, false, wwwRedirectsText(DOCS)))).toEqual([
      expect.stringMatching(/the main site's rules differ from www\/content\/redirects\.yaml/),
    ])
  })

  it('refuses to merge a chain, a loop, a source given twice or a file the www build does not write', () => {
    put(join(dirs.www, '_redirects'), wwwRedirectsText([rule('/a', '/b'), rule('/b', '/blog')]))
    expect(() => mergePagesSite(dirs, WWW)).toThrow(/the redirect from \/a is a chain of 2 hops/)
    put(join(dirs.www, '_redirects'), wwwRedirectsText([rule('/a', '/a')]))
    expect(() => mergePagesSite(dirs, WWW)).toThrow(/the redirect from \/a loops/)
    put(join(dirs.www, '_redirects'), wwwRedirectsText([rule('/sitemap.xml', '/blog')]))
    expect(() => mergePagesSite(dirs, WWW)).toThrow(/the redirect from \/sitemap\.xml is given twice/)
    put(join(dirs.www, '_redirects'), '/a /blog 301\n')
    expect(() => mergePagesSite(dirs, WWW)).toThrow(/dist-www\/_redirects does not begin with/)
  })

  it('checks the upload: chains, targets that are not in the build, sources that hide a page', () => {
    put(join(dirs.www, '_redirects'), wwwRedirectsText(DOCS))
    mergePagesSite(dirs, WWW)
    const tail = [rule('/x', '/y'), rule('/y', '/'), rule('/old', '/gone'), rule('/blog', 'https://example.com/')]
    writeFileSync(join(dirs.out, '_redirects'), mergedRedirects(WWW) + wwwRedirectsText(tail))
    const problems = redirectsOnly(checkMergedLayout(dirs.out, WWW)).join('\n')
    expect(problems).toMatch(/the redirect from \/x is a chain of 2 hops: \/x -> \/y/)
    expect(problems).toMatch(/the redirect from \/old sends to \/gone, which is not a page or a file of this build/)
    expect(problems).toMatch(/the redirect from \/blog hides the file of the upload it would serve/)
    expect(problems).not.toMatch(/from \/y /)
  })

  it('accepts a folder rule whose target takes the splat (RUNBOOK C4)', () => {
    put(join(dirs.www, 'blog-posts', 'a.html'), '<a href="/">home</a>')
    const text = wwwRedirectsText([rule('/old-blog/*', '/blog-posts/:splat', 'webflow-panel'), ...DOCS])
    put(join(dirs.www, '_redirects'), text)
    mergePagesSite(dirs, WWW)
    expect(redirectsOnly(checkMergedLayout(dirs.out, WWW, 50, false, text))).toEqual([])
  })
})
