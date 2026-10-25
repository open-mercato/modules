// KSeF scenario against a running MCP server (spec 12.2 WP14): tools/list, then search_modules -> check_compat ->
// plan_install as an agent would chain them for "is there a module for KSeF e-invoicing".
// Usage: node test/mcp/scenario.ts <mcp url> [omVersion]   e.g. node test/mcp/scenario.ts http://127.0.0.1:8787/mcp
// Prints a transcript (JSON lines shortened) and exits 1 when a step fails. Not a vitest file.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = process.argv[2] ?? 'http://127.0.0.1:8787/mcp'
const omVersion = process.argv[3] ?? '0.9.0'

const show = (label: string, v: unknown, max = 1600) => {
  const t = JSON.stringify(v, null, 2)
  console.log(`\n## ${label}\n${t.length > max ? `${t.slice(0, max)}\n... (${t.length} characters)` : t}`)
}

async function main(): Promise<number> {
  const client = new Client({ name: 'om-modules-scenario', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  const info = client.getServerVersion()
  show('server', { ...info, instructions: client.getInstructions() })
  const { tools } = await client.listTools()
  show(
    'tools/list',
    tools.map((t) => ({
      name: t.name,
      required: (t.inputSchema as { required?: string[] }).required ?? [],
      properties: Object.keys((t.inputSchema as { properties?: object }).properties ?? {}),
      output: t.outputSchema ? 'yes' : 'no',
      annotations: t.annotations,
    })),
    4000,
  )
  if (tools.length !== 5) return 1

  const q = { query: 'KSeF e-invoicing', omVersion, includeBuiltIn: true }
  const s = await client.callTool({ name: 'search_modules', arguments: q })
  const sc = s.structuredContent as { results: { locator: string; title: string; matchedOn: string[] }[] }
  show(`search_modules ${JSON.stringify(q)}`, {
    isError: s.isError ?? false,
    line: (s.structuredContent as { line: unknown }).line,
    top: sc.results.slice(0, 3).map((r) => ({ locator: r.locator, title: r.title, matchedOn: r.matchedOn })),
    builtIn: (s.structuredContent as { builtIn: { id: string }[] }).builtIn.map((b) => b.id),
  })
  const top = sc.results[0]?.locator
  if (!top) return 1

  const c = await client.callTool({ name: 'check_compat', arguments: { refs: [top], omVersion } })
  show(`check_compat ${top} on ${omVersion}`, c.structuredContent ?? c.content)
  if (c.isError) return 1

  const p = await client.callTool({
    name: 'plan_install',
    arguments: { refs: [top], app: { omVersion, enabledModules: [{ id: 'auth', from: '@open-mercato/core' }] } },
  })
  show(`plan_install ${top}`, p.structuredContent ?? p.content, 4000)
  if (p.isError) return 1

  const u = await client.callTool({ name: 'get_module', arguments: { ref: 'no-such-module-xyz' } })
  show('get_module unknown ref (expected isError)', u)
  await client.close()
  return u.isError ? 0 : 1
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (err: unknown) => {
    console.error(err)
    process.exitCode = 2
  },
)
