// Cloudflare Worker entry of the remote MCP server (spec 8.3): only the fetch handler is exported, because workerd
// treats every named export of the entry module as an entrypoint. The handler lives in mcp/http.ts.
import { handle, type Env } from './http.ts'

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env)
  },
}
