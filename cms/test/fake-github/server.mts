// A fake of GitHub's workflow dispatch endpoint (spec Step 2.4): it records every request and answers with the
// status a test sets. Used in-process by test/unit/dispatch.test.ts and as a Compose service of compose.test.yaml.
import { createServer, type Server } from 'node:http'

export interface Call {
  method: string
  path: string
  headers: Record<string, string | string[] | undefined>
  body: unknown
  at: number
}

export interface Fake {
  server: Server
  url: string
  calls: Call[]
  /** The statuses of the next answers, in order; 204 when empty. */
  answers: number[]
  close(): Promise<void>
}

export function startFake(port = 0, host = '127.0.0.1'): Promise<Fake> {
  const calls: Call[] = []
  const answers: number[] = []
  const server = createServer((req, res) => {
    let text = ''
    req.on('data', (c) => (text += c))
    req.on('end', () => {
      if (req.url === '/calls' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(calls))
        return
      }
      if (req.url === '/calls' && req.method === 'DELETE') {
        calls.length = 0
        res.writeHead(204).end()
        return
      }
      let body: unknown = text
      try {
        body = JSON.parse(text)
      } catch {
        // not JSON
      }
      calls.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body, at: Date.now() })
      res.writeHead(answers.shift() ?? 204).end()
    })
  })
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const a = server.address()
      const p = typeof a === 'object' && a ? a.port : port
      resolve({
        server,
        url: `http://${host}:${p}`,
        calls,
        answers,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}
