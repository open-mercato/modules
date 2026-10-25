// Discovery files (spec 4.6, 8.3, 5.6 item 8): `/.well-known/mcp/server-card.json`, `/.well-known/agent-skills/`
// (index plus a copy of each SKILL.md, digest over its bytes), `/robots.txt` (D36) and the WebMCP origin trial
// token for the site's origin. Pure apart from the digest (node:crypto over the exact SKILL.md bytes).
import { createHash } from 'node:crypto'
import type { AgentSkillsIndex, McpServerCard } from './types.ts'
import type { SkillSource } from './types.ts'

/** One constant for the server card path (spec 4.6). */
export const SERVER_CARD_PATH = '.well-known/mcp/server-card.json'
export const AGENT_SKILLS_DIR = '.well-known/agent-skills'
export const AGENT_SKILLS_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

/** Short tool descriptions for the server card (the Worker carries the long WHEN TO USE texts, spec 8.2). */
export const TOOL_SUMMARIES: Record<string, string> = {
  search_modules:
    'Search Open Mercato modules: official, community and third-party packages, plus the modules built into Open Mercato core.',
  get_module:
    'One module: anatomy, compatibility per line, trust, install command and the author README marked untrusted.',
  check_compat: "Is a module verified on this app's Open Mercato version: receipts, static fit and agent policy.",
  plan_install:
    'Install plan for one or more modules: requires closure, commands with exact versions, permissions, settings, conflicts and the consent text.',
  get_changes: 'Catalog changes since a date: new entries, new versions, receipt transitions and level changes.',
}

export function serverCard(mcpUrl: string): McpServerCard {
  return {
    serverInfo: { name: 'om-modules', title: 'Open Mercato Modules', version: '1.0.0' },
    transport: { type: 'streamable-http', url: mcpUrl },
    authentication: { required: false },
    tools: Object.entries(TOOL_SUMMARIES).map(([name, description]) => ({ name, description })),
    resources: [{ uri: 'om-modules://index' }],
  }
}

/** `name` and `description` from the YAML front matter of a SKILL.md (single-line values). */
export function skillFrontMatter(text: string): { name: string | null; description: string | null } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const fm = m?.[1] ?? ''
  const get = (key: string): string | null => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim() ?? null
    if (line === null) return null
    return line.replace(/^(["'])([\s\S]*)\1$/, '$2')
  }
  return { name: get('name'), description: get('description') }
}

/** Agent skills discovery index and the published copies of the skills. */
export function agentSkills(
  skills: readonly SkillSource[],
  site: string,
  warn: (m: string) => void,
): { index: AgentSkillsIndex; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  const list: AgentSkillsIndex['skills'] = []
  for (const s of skills) {
    const text = new TextDecoder().decode(s.content)
    const fm = skillFrontMatter(text)
    if (!fm.name || !fm.description) {
      warn(`skills/${s.dir}/SKILL.md: front matter needs name and description, skipped`)
      continue
    }
    if (fm.name !== s.dir) warn(`skills/${s.dir}/SKILL.md: name ${fm.name} differs from the folder name`)
    const path = `${AGENT_SKILLS_DIR}/${s.dir}/SKILL.md`
    files.set(path, s.content)
    list.push({
      name: fm.name,
      type: 'skill-md',
      description: fm.description.slice(0, 1024),
      url: `${site}/${path}`,
      digest: `sha256:${createHash('sha256').update(s.content).digest('hex')}`,
    })
  }
  return { index: { $schema: AGENT_SKILLS_SCHEMA, skills: list }, files }
}

/** D36: `noindex` phase on `*.github.io` (Disallow all), the domain is indexed and names the sitemap. */
export function robotsTxt(site: string): string {
  const host = new URL(site).hostname
  if (host.endsWith('.github.io')) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap-index.xml\n`
}

export interface OriginTrial {
  origin: string
  token: string
  expires: string
}

/**
 * Token of the WebMCP origin trial for the site's origin (repo variable WEBMCP_OT_TOKENS, spec 5.6 item 8), or
 * null when there is none, it expired before today, or the variable is not valid JSON.
 */
export function originTrialFor(
  tokensJson: string | null,
  site: string,
  today: string,
  warn: (m: string) => void = () => {},
): OriginTrial | null {
  if (!tokensJson || tokensJson.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(tokensJson)
  } catch {
    warn('WEBMCP_OT_TOKENS is not valid JSON; no origin trial meta')
    return null
  }
  const origin = new URL(site).origin
  const entry = (parsed as Record<string, unknown> | null)?.[origin] as
    { token?: unknown; expires?: unknown } | undefined
  if (!entry || typeof entry.token !== 'string' || !/^[A-Za-z0-9+/=]{20,4096}$/.test(entry.token)) return null
  const expires = typeof entry.expires === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.expires) ? entry.expires : null
  if (!expires) {
    warn(`WEBMCP_OT_TOKENS[${origin}] has no expires date (YYYY-MM-DD); token not used`)
    return null
  }
  if (expires < today.slice(0, 10)) {
    warn(`WEBMCP_OT_TOKENS[${origin}] expired on ${expires}; token not used`)
    return null
  }
  return { origin, token: entry.token, expires }
}

/** `<meta http-equiv="origin-trial">` for the pages that load WebMCP (`/`, `/m/*`, `/for-agents`). */
export function originTrialMeta(t: OriginTrial | null): string | null {
  return t ? `<meta http-equiv="origin-trial" content="${t.token}">` : null
}
