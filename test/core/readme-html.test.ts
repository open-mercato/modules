// The module page renders the author's README (review of 26 Oct: raw `##`, `**` and fences in a scrolling box). A
// small safe subset of Markdown: everything is escaped first, links need https, images and HTML never pass.
import { describe, expect, test } from 'vitest'
import { readmeBlocks, readmeFold, readmeHtml } from '../../lib/core/text.ts'

describe('readmeHtml', () => {
  test('headings start at h3 and never skip a level', () => {
    const html = readmeHtml('# Title\n\n### Deep\n\n## Mid')
    expect(html).toContain('<h3>Title</h3>')
    expect(html).toContain('<h4>Deep</h4>')
    expect(html).toContain('<h4>Mid</h4>')
    expect(html).not.toMatch(/<h[56]>/)
  })

  test('a # comment in a code block is not a heading level', () => {
    const html = readmeHtml(
      '## Quick start\n\n```bash\n# install deps\nyarn\n```\n\n### 1. Create an app\n\n### 2. Build a module\n\n## Usage',
    )
    expect(html).toContain('<h3>Quick start</h3>')
    expect(html).toContain('<h4>1. Create an app</h4>')
    expect(html).toContain('<h4>2. Build a module</h4>')
    expect(html).toContain('<h3>Usage</h3>')
    expect(html).toContain('# install deps')
  })

  test('lists, quotes, rules and paragraphs', () => {
    const html = readmeHtml('Intro line\ncontinues.\n\n- one\n- two\n\n1. first\n2. second\n\n> a note\n> more\n\n---')
    expect(html).toContain('<p>Intro line continues.</p>')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>')
    expect(html).toContain('<blockquote><p>a note more</p></blockquote>')
    expect(html).toContain('<hr>')
  })

  test('fenced code is escaped, and an unclosed fence at the end of a cut excerpt is closed', () => {
    const html = readmeHtml('```bash\nyarn add <pkg> && echo "**x**"\n')
    expect(html).toBe('<pre><code>yarn add &lt;pkg&gt; &amp;&amp; echo &#34;**x**&#34;</code></pre>')
  })

  test('inline code, bold, italic and https links; other links keep their text', () => {
    const html = readmeHtml(
      'Use `a_b` with **care** and *calm*. See [KSeF](https://ksef.mf.gov.pl) or [docs](./docs.md).',
    )
    expect(html).toContain('<code>a_b</code>')
    expect(html).toContain('<strong>care</strong>')
    expect(html).toContain('<em>calm</em>')
    expect(html).toContain('<a href="https://ksef.mf.gov.pl" rel="nofollow noopener noreferrer">KSeF</a>')
    expect(html).toContain('or docs.')
    expect(html).not.toContain('./docs.md')
  })

  test('no HTML, script or javascript link of the author passes', () => {
    const html = readmeHtml('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](http://plain.example)')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('href="javascript')
    expect(html).not.toContain('href="http://')
  })

  test('badges and images are dropped', () => {
    expect(
      readmeHtml('[![npm](https://img.shields.io/x.svg)](https://npmjs.com/x) ![logo](https://x/y.png) Text'),
    ).toBe('<p>Text</p>')
  })

  test('a table with a header row', () => {
    const html = readmeHtml('| Name | Value |\n| --- | --- |\n| a | `b` |')
    expect(html).toContain('<thead><tr><th>Name</th><th>Value</th></tr></thead>')
    expect(html).toContain('<tr><td>a</td><td><code>b</code></td></tr>')
  })

  test('readmeFold keeps the title and two blocks of text open and folds the rest', () => {
    const blocks = readmeBlocks(
      '# KSeF\n\nSends invoices.\n\nReceives them too.\n\nThird.\n\n## Installation\n\nnpm install x',
    )
    const { intro, rest } = readmeFold(blocks)
    expect(intro).toEqual(['<h3>KSeF</h3>', '<p>Sends invoices.</p>', '<p>Receives them too.</p>'])
    expect(rest[0]).toBe('<p>Third.</p>')
    expect(rest).toContain('<h4>Installation</h4>')
  })

  test('readmeFold stops at the first heading after the opening and never folds a single block', () => {
    expect(readmeFold(readmeBlocks('Intro.\n\n## Install\n\nsteps')).intro).toEqual(['<p>Intro.</p>'])
    expect(readmeFold(readmeBlocks('One.\n\nTwo.\n\nThree.')).rest).toEqual([])
  })
})
