// Default addresses (orchestrator, round 13): the catalog repository is open-mercato/modules, so no default URL of the
// site, the emitter, the MCP Worker, the CLI or the skill may point at a personal account. Test inputs (fixtures,
// goldens) set their own site and are out of scope; CODEOWNERS names people, not addresses.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CATALOG_MAINTAINERS,
  CATALOG_REPO,
  CATALOG_REPO_URL,
  DEFAULT_BASE_PATH,
  DEFAULT_SITE_ORIGIN,
  DEFAULT_SITE_URL,
} from '../../lib/core/home.ts'
import { siteUrl } from '../../lib/commands/emit.ts'
import { ROOT } from './helpers.ts'

const PERSONAL = /wojciechszyjka\.github\.io|github\.com\/wojciechszyjka\/modules|\bwojciechszyjka\/modules\b/

describe('default addresses', () => {
  // Cloudflare Pages at the custom domain, not GitHub Pages (Piotr and owner decision A(a), 28 Oct)
  it('one configuration: open-mercato/modules at modules.openmercato.com', () => {
    expect(CATALOG_REPO).toBe('open-mercato/modules')
    expect(CATALOG_REPO_URL).toBe('https://github.com/open-mercato/modules')
    expect(DEFAULT_SITE_URL).toBe('https://modules.openmercato.com')
    expect(DEFAULT_BASE_PATH).toBe('/')
    expect(siteUrl(DEFAULT_SITE_ORIGIN, DEFAULT_BASE_PATH).site).toBe(DEFAULT_SITE_URL)
  })

  it('the MCP Worker reads the index from the default site', () => {
    const toml = readFileSync(join(ROOT, 'mcp', 'wrangler.toml'), 'utf8')
    for (const m of toml.matchAll(/^[A-Z_]+_URL = "([^"]+)"/gm))
      expect(m[1]).toMatch(new RegExp(`^${DEFAULT_SITE_URL}/`))
  })

  it('no tracked file outside the tests points at a personal account', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !/^(test\/|\.wp\/|yarn\.lock$|\.github\/CODEOWNERS$)/.test(f))
      .filter((f) => /\.(ts|tsx|astro|mjs|json|ya?ml|toml|md|txt|css|sh)$/.test(f))
    const hits: string[] = []
    for (const f of files) {
      let text: string
      try {
        text = readFileSync(join(ROOT, f), 'utf8')
      } catch {
        continue
      }
      text.split('\n').forEach((l, i) => {
        if (PERSONAL.test(l)) hits.push(`${f}:${i + 1}`)
      })
    }
    expect(hits).toEqual([])
  })

  // round 14: /about printed `Maintained by @wojciechszyjka` from CODEOWNERS, the one personal handle left in dist
  it('/about names the maintainers from one constant, never a handle read from CODEOWNERS', () => {
    expect(CATALOG_MAINTAINERS).toBe('the Open Mercato core team')
    const about = readFileSync(join(ROOT, 'site', 'src', 'pages', 'about.astro'), 'utf8')
    expect(about).not.toMatch(/CODEOWNERS'/)
    expect(about).toContain('Maintained by {CATALOG_MAINTAINERS}')
  })

  it('no tracked file outside the tests and CODEOWNERS names the personal account at all', () => {
    // `git grep` exits 1 when nothing matches
    let out = ''
    try {
      out = execFileSync(
        'git',
        ['grep', '-l', 'wojciechszyjka', '--', '.', ':!test', ':!.wp', ':!.github/CODEOWNERS'],
        {
          cwd: ROOT,
          encoding: 'utf8',
        },
      ).trim()
    } catch (err) {
      if ((err as { status?: number }).status !== 1) throw err
    }
    expect(out).toBe('')
  })
})
