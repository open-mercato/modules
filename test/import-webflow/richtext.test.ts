import { describe, expect, it } from 'vitest'
import {
  ConvertError,
  documentTextNodes,
  htmlToMarkdown,
  htmlToText,
  inlineHtmlToMarkdown,
  youTubeId,
} from '../../lib/import-webflow/richtext.ts'

const EM = '—'

/** Golden cases per element of the contract (spec API Contracts, "Rich text to Markdown"): HTML in, Markdown out. */
const GOLDEN: [string, string, string][] = [
  ['paragraphs', '<p>One.</p><p>Two.</p>', 'One.\n\nTwo.'],
  ['headings h2 to h4', '<h2>Two</h2><h3>Three</h3><h4>Four</h4>', '## Two\n\n### Three\n\n#### Four'],
  ['strong and em (b and i too)', '<p><strong>a</strong> <em>b</em> <b>c</b> <i>d</i></p>', '**a** _b_ **c** _d_'],
  ['a link', '<p>See <a href="https://example.com/x">the docs</a>.</p>', 'See [the docs](https://example.com/x).'],
  ['an unordered list', '<ul role="list"><li>one</li><li>two</li></ul>', '- one\n- two'],
  ['an ordered list', '<ol><li>one</li><li>two</li></ol>', '1. one\n2. two'],
  ['nested lists', '<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>', '- a\n  - a1\n  - a2\n- b'],
  ['a list item with paragraphs', '<ol><li><p>first</p></li><li><p>second</p></li></ol>', '1. first\n2. second'],
  ['a blockquote', '<blockquote>Quoted <em>text</em>.</blockquote>', '> Quoted _text_.'],
  ['inline code', '<p>Run <code>yarn om</code> now.</p>', 'Run `yarn om` now.'],
  ['a code block', '<pre><code>a &lt; b\n  c</code></pre>', '```\na < b\n  c\n```'],
  [
    'a code block with a language',
    '<pre><code class="language-ts">const a = 1</code></pre>',
    '```ts\nconst a = 1\n```',
  ],
  ['an empty code block', '<pre></pre>', '```\n```'],
  ['a rule', '<p>a</p><hr><p>b</p>', 'a\n\n---\n\nb'],
  ['a line break', '<p>one<br>two</p>', 'one\\\ntwo'],
  [
    'a bare figure as a Markdown image',
    '<figure class="w-richtext-figure-type-image"><div><img src="/x.png" alt="A chart" loading="lazy"></div></figure>',
    '![A chart](/x.png)',
  ],
  [
    'a figure with a caption and a size as HTML',
    '<figure style="max-width:3200px"><div><img src="/x.png" alt="A chart" width="1672" height="940"></div><figcaption>The <em>v1</em> matrix.</figcaption></figure>',
    '<figure><img src="/x.png" alt="A chart" width="1672" height="940" /><figcaption>The <em>v1</em> matrix.</figcaption></figure>',
  ],
  [
    'an inherited alt as an empty alt',
    '<figure><div><img src="/x.png" alt="__wf_reserved_inherit"></div></figure>',
    '![](/x.png)',
  ],
  [
    'a table of inline cells as GFM',
    '<table style="width:100%"><thead><tr><th style="border:1px">Code</th><th>Task</th></tr></thead><tbody><tr><td>F-1</td><td><em>Parked.</em> A queue</td></tr></tbody></table>',
    '| Code | Task              |\n| ---- | ----------------- |\n| F-1  | _Parked._ A queue |',
  ],
  [
    'a table with block cells as sanitized HTML',
    '<div style="overflow-x:auto"><table style="width:100%"><tbody><tr><td style="padding:8px"><p>a</p><ul><li>b</li></ul></td></tr></tbody></table></div>',
    '<table><tbody><tr><td><p>a</p><ul><li>b</li></ul></td></tr></tbody></table>',
  ],
  [
    'a YouTube iframe as lite-video',
    '<figure class="w-richtext-figure-type-video"><div><iframe src="https://www.youtube.com/embed/mBAtuxs4oto" title="WMS walkthrough" frameborder="0"></iframe></div></figure>',
    '<lite-video id="mBAtuxs4oto" title="WMS walkthrough"></lite-video>',
  ],
  ['white space collapsed', '<p>  a \n  b  <strong> c </strong>  </p>', 'a b **c**'],
  ['an empty paragraph dropped', '<p>‍</p><p></p><p>x</p>', '‍\n\nx'],
]

describe('lib/import-webflow/richtext.ts (rich text to Markdown)', () => {
  for (const [name, html, md] of GOLDEN) {
    it(`converts ${name}`, () => {
      expect(htmlToMarkdown(html)).toBe(md)
    })
  }

  it('runs the hooks on text, links and images, and keeps code out of the token rule', () => {
    const seen: [string, boolean][] = []
    const md = htmlToMarkdown(
      `<p>A ${EM} B <a href="https://www.openmercato.com/blog">blog</a> <code>x${EM}y</code></p><figure><img src="https://cdn/x.png" alt="pic"></figure>`,
      {
        text: (v, c) => {
          seen.push([v, c.code])
          return v.replaceAll(EM, '-')
        },
        link: (h) => h.replace('https://www.openmercato.com', ''),
        image: () => '/media/blog/x.png',
      },
    )
    expect(md).toBe('A - B [blog](/blog) `x-y`\n\n![pic](/media/blog/x.png)')
    expect(seen.some(([v, code]) => v === `x${EM}y` && code)).toBe(true)
  })

  it('stops on an element without a rule and names its path', () => {
    const cases: [string, RegExp][] = [
      ['<div class="w-embed"><script>alert(1)</script></div>', /<script> has no rule at body > div\[0\] > script\[0\]/],
      ['<p>a <span>b</span></p>', /<span> has no rule inside text at body > p\[0\] > span\[1\]/],
      ['<h1>Title</h1>', /h1 has no rule in rich text/],
      [
        '<figure><iframe src="https://player.vimeo.com/video/1"></iframe></figure>',
        /an iframe from player\.vimeo\.com has no rule/,
      ],
      ['<iframe src="https://evil.example/x"></iframe>', /an iframe from evil\.example has no rule/],
      ['<form><input></form>', /<form> has no rule/],
    ]
    for (const [html, re] of cases) {
      expect(() => htmlToMarkdown(html)).toThrow(ConvertError)
      expect(() => htmlToMarkdown(html)).toThrow(re)
    }
  })

  it('in lenient mode walks through layout elements and keeps their text', () => {
    expect(
      htmlToMarkdown('<div class="hero"><h1>Hi</h1><div><span>One</span> <span>two</span></div></div>', {}, 'lenient'),
    ).toBe('# Hi\n\nOne two')
    expect(() => htmlToMarkdown('<div><script>x</script></div>', {}, 'lenient')).toThrow(/<script> has no rule/)
  })

  it('converts one node inline, taking the content of a whole paragraph', () => {
    expect(inlineHtmlToMarkdown('<p class="omlp-intro">Keep <strong>records</strong>.</p>')).toBe('Keep **records**.')
    expect(htmlToText('<a href="/x">Discuss<span>↗</span></a>')).toBe('Discuss↗')
  })

  it('reads the visible text of a document body, scripts and the head left out', () => {
    const html =
      '<html><head><title>T</title><style>a{}</style></head><body><nav>Menu</nav><p>One <b>two</b></p><script>x</script></body></html>'
    expect(documentTextNodes(html)).toEqual(['Menu', 'One', 'two'])
  })

  it('reads YouTube ids from embed and watch addresses only', () => {
    expect(youTubeId('https://www.youtube.com/embed/mBAtuxs4oto')).toBe('mBAtuxs4oto')
    expect(youTubeId('https://www.youtube.com/watch?v=2SmawYRr98M')).toBe('2SmawYRr98M')
    expect(youTubeId('//www.youtube-nocookie.com/embed/0jdlGSlZusI')).toBe('0jdlGSlZusI')
    expect(youTubeId('https://youtu.be/0jdlGSlZusI')).toBe('0jdlGSlZusI')
    expect(youTubeId('https://evil.example/embed/0jdlGSlZusI')).toBeUndefined()
    expect(youTubeId('https://www.youtube.com/embed/short')).toBeUndefined()
  })
})
