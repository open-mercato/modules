// WebMCP (spec 8.4, D20): the four read-only tools of tools@1 for an agent in the browser, behind feature detection.
// Without `document.modelContext` nothing else loads. Schemas come from /schema/tools-1.json, data from
// /modules.json on the first call; the logic is the same as the MCP Worker (mcp/handlers.ts over lib/core).
// Loaded by the layout through import.meta.glob on /, /m/* and /for-agents. No log bar.
import { href } from '../lib/url.ts'

interface ToolResponse {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}
interface WebTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean }
  execute(args: Record<string, unknown>): Promise<ToolResponse>
}
interface ModelContext {
  registerTool(tool: WebTool, options?: { signal?: AbortSignal }): unknown
}
interface ToolsSchema {
  $defs: Record<string, Record<string, unknown>>
  'x-tools': Record<string, { input: string }>
}

/** `x-tools.<name>.input` (`#/$defs/SearchModulesInput`) -> that definition (inputs are self-contained). */
export function inputSchemaOf(schema: ToolsSchema, name: string): Record<string, unknown> | null {
  const ref = schema['x-tools'][name]?.input
  return (ref && schema.$defs[ref.replace('#/$defs/', '')]) || null
}

export async function registerWebMcp(doc: Document = document): Promise<string[]> {
  if (!('modelContext' in doc)) return []
  const mc = (doc as unknown as { modelContext: ModelContext }).modelContext
  if (!mc || typeof mc.registerTool !== 'function') return []
  const [{ runTool, describeTool, WEB_TOOL_NAMES }, { createCatalogSource }] = await Promise.all([
    import('../../../mcp/handlers.ts'),
    import('../../../mcp/index-cache.ts'),
  ])
  const res = await fetch(href('/schema/tools-1.json'))
  if (!res.ok) return []
  const schema = (await res.json()) as ToolsSchema
  let source: ReturnType<typeof createCatalogSource> | null = null
  const data = () => (source ??= createCatalogSource({ indexUrl: new URL(href('/modules.json'), location.href).href }))
  const controller = new AbortController()
  addEventListener('pagehide', () => controller.abort(), { once: true })
  const done: string[] = []
  for (const name of WEB_TOOL_NAMES) {
    const inputSchema = inputSchemaOf(schema, name)
    if (!inputSchema) continue
    mc.registerTool(
      {
        name,
        description: describeTool(name),
        inputSchema,
        annotations: { readOnlyHint: true },
        async execute(args) {
          const r = await runTool(name, args, data())
          const body = r.ok ? r.value : { error: r.error, candidates: r.candidates }
          return { content: [{ type: 'text', text: JSON.stringify(body) }], ...(r.ok ? {} : { isError: true }) }
        },
      },
      { signal: controller.signal },
    )
    done.push(name)
  }
  return done
}

if (typeof document !== 'undefined') void registerWebMcp().catch(() => undefined)
