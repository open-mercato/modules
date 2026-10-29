// /templates (decisions of 29 Oct): the section is public at once in a coming soon state, with no entries until the
// save tool ships; the header and the footer link it; templates.openmercato.com/ leads to it through one Pages
// Function on `/` only, and modules.openmercato.com is never redirected.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEMPLATES_HOST, TEMPLATES_LINKS, TEMPLATES_PATH, templatesRedirect } from '../../lib/core/templates-host.ts'
import { findBannedChars } from '../../lib/core/text.ts'
import { onRequest } from '../../functions/_middleware.ts'
import { ROOT } from '../emit/helpers.ts'

const read = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8')
const page = read('site', 'src', 'pages', 'templates.astro')
/** The markup of the page without its frontmatter, styles and comments. */
const markup = page
  .replace(/^---[\s\S]*?\n---\n/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
/** The words a reader sees: markup without tags and expressions. */
const words = markup
  .replace(/<[^>]+>/g, ' ')
  .replace(/\{[^}]*\}/g, ' ')
  .replace(/\s+/g, ' ')

describe('/templates page', () => {
  it('shows the coming soon state', () => {
    expect(markup).toContain('data-templates-state="coming-soon"')
    expect(words).toContain('Coming soon')
    expect(words).toContain('No templates are listed yet.')
    expect(markup).toContain('title="No templates yet"')
  })

  it('lists no entries: no data is read for templates and nothing is mapped into a list', () => {
    const front = (/^---([\s\S]*?)\n---\n/.exec(page)?.[1] ?? '').replace(/^\s*\/\/.*$/gm, '')
    expect(front).not.toMatch(/templates\.json|templates\/|entries/)
    expect(markup).not.toContain('.map(')
  })

  it('explains what a template is and how it will work, with the tools of decision A', () => {
    expect(words).toContain('An app template is a complete Open Mercato app in a GitHub repository')
    expect(markup).toContain('<code>create-mercato-template</code>')
    expect(markup).toContain('<code>create-mercato-module</code>')
    expect(words).toContain('npx create-mercato-app my-app --template owner/repo')
    expect(words).toContain('Neither command exists yet.')
  })

  it('links the spec and both tracking issues', () => {
    expect(TEMPLATES_LINKS).toEqual({
      spec: 'https://github.com/open-mercato/modules/pull/5',
      tool: 'https://github.com/open-mercato/modules/issues/6',
      section: 'https://github.com/open-mercato/modules/issues/7',
    })
    for (const key of ['spec', 'tool', 'section']) expect(markup).toContain(`TEMPLATES_LINKS.${key}`)
  })

  it('follows the text rules: no typed numbers, no long dashes, no exclamation marks', () => {
    expect(words).not.toMatch(/\d/)
    expect(words).not.toContain('!')
    expect(findBannedChars(page)).toEqual([])
  })
})

describe('navigation', () => {
  it('the header lists Templates once, rendered in the desktop and the mobile menu', () => {
    const header = read('site', 'src', 'components', 'Header.astro')
    expect(header).toContain("{ label: 'Templates', path: '/templates' }")
    expect(header.match(/nav\.map\(/g)).toHaveLength(2)
    // every item but Modules is current on its own path and below it
    expect(header).toContain(': current.startsWith(p)')
  })

  it('the footer links the page', () => {
    expect(read('site', 'src', 'components', 'Footer.astro')).toContain(
      "{ label: 'Templates', url: href('/templates') }",
    )
  })
})

describe('templates.openmercato.com', () => {
  it('redirects the root of the templates host to the section on the same host', () => {
    expect(TEMPLATES_HOST).toBe('templates.openmercato.com')
    expect(TEMPLATES_PATH).toBe('/templates')
    expect(templatesRedirect('https://templates.openmercato.com/')).toBe('https://templates.openmercato.com/templates')
    expect(templatesRedirect('https://templates.openmercato.com')).toBe('https://templates.openmercato.com/templates')
    expect(templatesRedirect('https://TEMPLATES.openmercato.com/?utm_source=x')).toBe(
      'https://templates.openmercato.com/templates?utm_source=x',
    )
  })

  it('leaves every other path of the templates host alone', () => {
    for (const p of ['/templates', '/m/@open-mercato/gateway-tpay', '/about', '/modules.json', '/llms.txt'])
      expect(templatesRedirect(`https://templates.openmercato.com${p}`)).toBeNull()
  })

  it('never redirects modules.openmercato.com or another host', () => {
    for (const u of [
      'https://modules.openmercato.com/',
      'https://modules.openmercato.com/templates',
      'https://open-mercato-modules.pages.dev/',
      'https://abc123.open-mercato-modules.pages.dev/',
      'https://templates.openmercato.com.evil.example/',
      'https://openmercato.com/',
    ])
      expect(templatesRedirect(u)).toBeNull()
  })

  it('the middleware answers 302 on the templates root and hands every other request on', async () => {
    let passed = 0
    const next = async (): Promise<Response> => {
      passed++
      return new Response('static')
    }
    const moved = await onRequest({ request: new Request('https://templates.openmercato.com/'), next })
    expect(moved.status).toBe(302)
    expect(moved.headers.get('location')).toBe('https://templates.openmercato.com/templates')
    expect(passed).toBe(0)
    const served = await onRequest({ request: new Request('https://modules.openmercato.com/'), next })
    expect(await served.text()).toBe('static')
    expect(passed).toBe(1)
  })

  it('runs Functions on `/` only, so every other request is served as a static file', () => {
    expect(JSON.parse(read('site', 'public', '_routes.json'))).toEqual({ version: 1, include: ['/'], exclude: [] })
  })
})
