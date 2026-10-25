// `yarn om plugin-sync [--mcp-url <url>] [--check]` (spec 5.4, 8.6, 8.8): copies skills/om-find-module/SKILL.md into
// the Claude Code plugin and writes plugins/om-modules/.mcp.json from MCP_URL. Without an MCP URL the existing
// .mcp.json is kept (the workers.dev address is known only after the first deploy). `--check` changes nothing and
// fails when the copy differs from the source or .mcp.json does not point at the given MCP URL.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'

export const description = 'copy the skill and .mcp.json into the Claude Code plugin'

export const SKILL_SOURCE = 'skills/om-find-module/SKILL.md'
export const PLUGIN_DIR = 'plugins/om-modules'
export const SKILL_COPY = `${PLUGIN_DIR}/skills/om-find-module/SKILL.md`
export const MCP_JSON = `${PLUGIN_DIR}/.mcp.json`

/** `.mcp.json` of the plugin for one MCP URL (spec 8.8). */
export function mcpJson(url: string): string {
  return `${JSON.stringify({ mcpServers: { 'om-modules': { type: 'http', url } } }, null, 2)}\n`
}

/** An https URL (http only for localhost) without credentials, query or fragment. */
export function validMcpUrl(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null
  if (u.username || u.password || u.search || u.hash) return null
  return u.toString()
}

function parseArgs(args: string[]): { mcpUrl: string | null; check: boolean; error: string | null } {
  let mcpUrl: string | null = null
  let check = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--check') check = true
    else if (a === '--mcp-url' || a.startsWith('--mcp-url=')) {
      const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[++i]
      if (!v) return { mcpUrl, check, error: '--mcp-url needs a URL' }
      mcpUrl = v
    } else return { mcpUrl, check, error: `unknown argument ${a}` }
  }
  return { mcpUrl, check, error: null }
}

export default function pluginSync(ctx: CommandContext): number {
  const args = parseArgs(ctx.args)
  if (args.error) {
    console.error(`om plugin-sync: ${args.error}`)
    return EXIT_ENV
  }
  const rawUrl = args.mcpUrl ?? process.env['MCP_URL'] ?? ''
  const url = rawUrl.trim() === '' ? null : validMcpUrl(rawUrl.trim())
  if (rawUrl.trim() !== '' && url === null) {
    console.error(`om plugin-sync: MCP URL must be https (http only for localhost): ${rawUrl.slice(0, 120)}`)
    return EXIT_ENV
  }
  const src = join(ctx.root, SKILL_SOURCE)
  if (!existsSync(src)) {
    console.error(`om plugin-sync: ${SKILL_SOURCE} is missing`)
    return EXIT_ENV
  }
  const skill = readFileSync(src)
  const copyPath = join(ctx.root, SKILL_COPY)
  const mcpPath = join(ctx.root, MCP_JSON)
  const copy = existsSync(copyPath) ? readFileSync(copyPath) : null
  const currentMcp = existsSync(mcpPath) ? readFileSync(mcpPath, 'utf8') : null

  if (args.check) {
    const problems: string[] = []
    if (!copy || !copy.equals(skill)) problems.push(`${SKILL_COPY} differs from ${SKILL_SOURCE}`)
    if (url && currentMcp !== mcpJson(url)) problems.push(`${MCP_JSON} does not point at ${url}`)
    for (const p of problems) console.error(`om plugin-sync: ${p}`)
    if (problems.length === 0) console.log('om plugin-sync: plugin is in sync')
    return problems.length === 0 ? EXIT_OK : EXIT_VALIDATION
  }

  if (!copy || !copy.equals(skill)) {
    mkdirSync(dirname(copyPath), { recursive: true })
    writeFileSync(copyPath, skill)
    console.log(`om plugin-sync: wrote ${SKILL_COPY}`)
  }
  if (url) {
    if (currentMcp !== mcpJson(url)) {
      mkdirSync(dirname(mcpPath), { recursive: true })
      writeFileSync(mcpPath, mcpJson(url))
      console.log(`om plugin-sync: wrote ${MCP_JSON} (${url})`)
    }
  } else if (currentMcp === null) {
    console.log(`om plugin-sync: no MCP_URL; ${MCP_JSON} not written (set MCP_URL after the first Worker deploy)`)
  } else console.log(`om plugin-sync: no MCP_URL; ${MCP_JSON} kept`)
  return EXIT_OK
}
