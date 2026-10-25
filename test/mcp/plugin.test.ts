// Skill, Claude Code plugin and marketplace (spec 8.6, 8.8, 12.2 WP14): the plugin copy equals the source,
// .mcp.json points at MCP_URL, SKILL.md follows the Agent Skills format, and `yarn om plugin-sync` works.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import type { CommandContext } from '../../lib/cli.ts'
import pluginSync, { MCP_JSON, mcpJson, SKILL_COPY, SKILL_SOURCE, validMcpUrl } from '../../lib/commands/plugin-sync.ts'
import { findBannedChars } from '../../lib/core/text.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const DESCRIPTION =
  'Find Open Mercato modules before you build: registry search, nightly install receipts and install plans over MCP, plus the om-find-module skill.'

function ctx(root: string, args: string[] = []): CommandContext {
  return { args, root, flags: { data: '.data', out: 'out', offline: false, json: false } }
}

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'om-plugin-'))
  mkdirSync(join(root, dirname(SKILL_SOURCE)), { recursive: true })
  cpSync(join(ROOT, SKILL_SOURCE), join(root, SKILL_SOURCE))
  return root
}

function quiet<T>(fn: () => T): T {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    return fn()
  } finally {
    log.mockRestore()
    err.mockRestore()
  }
}

describe('skills/om-find-module/SKILL.md (Agent Skills format)', () => {
  const text = read(SKILL_SOURCE)
  const fm = parse(/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '') as { name: string; description: string }

  it('has front matter with name = folder name and a description up to 1024 characters', () => {
    expect(fm.name).toBe('om-find-module')
    expect(fm.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(fm.name.length).toBeLessThanOrEqual(64)
    expect(fm.description.length).toBeGreaterThan(0)
    expect(fm.description.length).toBeLessThanOrEqual(1024)
    expect(fm.description).toMatch(/^Before building a feature in an Open Mercato app, search the module registry/)
  })

  it('keeps the v1 steps of spec 8.6, the Pages fallback and the consent rules', () => {
    for (const h of [
      '## 1. App context',
      '## 2. Search (first available source wins)',
      '## 3. Built-in first',
      '## 4. Shortlist',
      '## 5. Install plan',
      '## 6. Consent',
      '## 7. Install (after consent)',
      '## 8. Finish',
    ])
      expect(text).toContain(h)
    expect(text).toContain('https://open-mercato.github.io/modules/raw/modules.md')
    // the module card has the same fallback as the index (review of 25 Oct)
    expect(text).toContain('`https://open-mercato.github.io/modules/m/<package>.md`')
    expect(text).toContain('yarn mercato module enable @open-mercato/core --module <id>')
    expect(text).toContain('Approved modules: <package>@<version>')
    expect(text).toContain("the user types the plan's `consentText`")
    expect(findBannedChars(text)).toEqual([])
  })

  it('matches the create-mercato-app copy: ask before building, llms.txt, module info, an unreachable catalog reported', () => {
    expect(text).toContain('Ask before you build.')
    expect(text).toContain('`yarn mercato module info <package> --json` for one module')
    expect(text).toContain('`curl -s https://modules.openmercato.com/llms.txt` for the index')
    expect(text).toContain('When no source answers')
    expect(text).toContain('When nothing fits, say so and continue with the task router')
    expect(text).toContain('`https://modules.openmercato.com/m/<package>.md`')
  })
})

describe('plugin and marketplace', () => {
  it('the plugin copy of the skill is identical to the source', () => {
    expect(readFileSync(join(ROOT, SKILL_COPY))).toEqual(readFileSync(join(ROOT, SKILL_SOURCE)))
  })

  it('marketplace.json lists om-modules from ./plugins/om-modules (spec 8.8)', () => {
    const m = JSON.parse(read('.claude-plugin/marketplace.json')) as {
      name: string
      owner: { name: string }
      plugins: Record<string, unknown>[]
    }
    expect(m.name).toBe('open-mercato')
    expect(m.owner).toEqual({ name: 'Open Mercato Modules' })
    // additive to spec 8.8 (finding of 25 Oct): `claude plugin validate` warns without a marketplace description
    expect((m as { description?: string }).description).toMatch(/^The Open Mercato Modules registry for Claude Code/)
    expect(m.plugins).toEqual([
      {
        name: 'om-modules',
        source: './plugins/om-modules',
        description: DESCRIPTION,
        version: '0.1.0',
        category: 'development',
        tags: ['open-mercato', 'modules', 'mcp'],
      },
    ])
    expect(existsSync(join(ROOT, 'plugins/om-modules/.claude-plugin/plugin.json'))).toBe(true)
  })

  it('plugin.json matches the marketplace entry', () => {
    expect(JSON.parse(read('plugins/om-modules/.claude-plugin/plugin.json'))).toEqual({
      name: 'om-modules',
      version: '0.1.0',
      description: DESCRIPTION,
      // additive to spec 8.8: the author `claude plugin validate` asks for, the marketplace owner
      author: { name: 'Open Mercato Modules' },
      license: 'MIT',
    })
  })

  it('.mcp.json, when present, is an http server named om-modules at MCP_URL (when the env names one)', () => {
    const p = join(ROOT, MCP_JSON)
    if (!existsSync(p)) return // written by plugin-sync after the first Worker deploy
    const j = JSON.parse(readFileSync(p, 'utf8')) as { mcpServers: Record<string, { type: string; url: string }> }
    expect(Object.keys(j.mcpServers)).toEqual(['om-modules'])
    expect(j.mcpServers['om-modules']?.type).toBe('http')
    expect(validMcpUrl(j.mcpServers['om-modules']!.url)).not.toBeNull()
    const env = process.env['MCP_URL']
    if (env) expect(j.mcpServers['om-modules']?.url).toBe(env)
  })
})

describe('yarn om plugin-sync', () => {
  it('copies the skill and writes .mcp.json from MCP_URL; --check then passes', () => {
    const root = sandbox()
    const url = 'https://om-modules.example.workers.dev/mcp'
    expect(quiet(() => pluginSync(ctx(root, ['--mcp-url', url])))).toBe(0)
    expect(readFileSync(join(root, SKILL_COPY))).toEqual(readFileSync(join(root, SKILL_SOURCE)))
    expect(readFileSync(join(root, MCP_JSON), 'utf8')).toBe(mcpJson(url))
    expect(JSON.parse(readFileSync(join(root, MCP_JSON), 'utf8'))).toEqual({
      mcpServers: { 'om-modules': { type: 'http', url } },
    })
    expect(quiet(() => pluginSync(ctx(root, ['--check', '--mcp-url', url])))).toBe(0)
  })

  it('reads MCP_URL from the environment and keeps .mcp.json without it', () => {
    const root = sandbox()
    const url = 'https://om-modules.env.workers.dev/mcp'
    vi.stubEnv('MCP_URL', url)
    try {
      expect(quiet(() => pluginSync(ctx(root)))).toBe(0)
    } finally {
      vi.unstubAllEnvs()
    }
    expect(readFileSync(join(root, MCP_JSON), 'utf8')).toBe(mcpJson(url))
    vi.stubEnv('MCP_URL', '')
    try {
      expect(quiet(() => pluginSync(ctx(root)))).toBe(0)
    } finally {
      vi.unstubAllEnvs()
    }
    expect(readFileSync(join(root, MCP_JSON), 'utf8')).toBe(mcpJson(url))
  })

  it('--check fails on a drifted copy or another URL', () => {
    const root = sandbox()
    quiet(() => pluginSync(ctx(root, ['--mcp-url', 'https://a.example.workers.dev/mcp'])))
    expect(quiet(() => pluginSync(ctx(root, ['--check', '--mcp-url', 'https://b.example.workers.dev/mcp'])))).toBe(1)
    writeFileSync(join(root, SKILL_COPY), 'changed')
    expect(quiet(() => pluginSync(ctx(root, ['--check'])))).toBe(1)
  })

  it('refuses a non-https URL (http only on localhost) and URLs with credentials', () => {
    const root = sandbox()
    expect(quiet(() => pluginSync(ctx(root, ['--mcp-url', 'http://evil.test/mcp'])))).toBe(2)
    expect(validMcpUrl('http://127.0.0.1:8787/mcp')).toBe('http://127.0.0.1:8787/mcp')
    expect(validMcpUrl('https://u:p@x.test/mcp')).toBeNull()
    expect(validMcpUrl('https://x.test/mcp?token=1')).toBeNull()
    expect(quiet(() => pluginSync(ctx(root, ['--nope'])))).toBe(2)
  })
})
