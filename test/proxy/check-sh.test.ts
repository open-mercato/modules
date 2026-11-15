// docs/proxy/check.sh against a local server that answers as the contract says (docs/RUNBOOK.md), and against one that
// cuts the prefix the way a wrong proxy would. No network beyond 127.0.0.1.
import { spawn, spawnSync } from 'node:child_process'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROOT } from '../emit/helpers.ts'

const SCRIPT = join(ROOT, 'docs', 'proxy', 'check.sh')
const hasCurl = spawnSync('curl', ['--version']).status === 0

/** What the Pages project answers for the nested layout, reduced to the paths check.sh asks for. */
function good(req: IncomingMessage, res: ServerResponse): void {
  const u = new URL(req.url ?? '/', 'http://x')
  const html = (body: string) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body)
  if (u.pathname === '/run' || u.pathname === '/run/') {
    res.writeHead(302, { Location: `/run/modules${u.search}` }).end()
  } else if (u.pathname === '/run/modules') {
    html('<link rel="canonical" href="https://www.openmercato.com/run/modules">')
  } else if (u.pathname === '/run/modules.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }).end('{"entries":[]}')
  } else if (u.pathname === '/run/m/@open-mercato/gateway-tpay' || u.pathname === '/run/submit') {
    html('<h1>page</h1>')
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html' }).end('not found')
  }
}

/** A proxy that cut /run and follows nothing: every page of the site is a 404 and /run is not a redirect. */
function cut(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(req.url === '/run' ? 200 : 404, { 'Content-Type': 'text/plain' }).end('no')
}

function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<[Server, string]> {
  const server = createServer(handler)
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve([server, `http://127.0.0.1:${(server.address() as AddressInfo).port}`]),
    ),
  )
}

/** Runs check.sh without blocking the event loop that serves its requests. */
function run(...args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn('bash', [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => resolve({ code: code ?? 1, out }))
  })
}

describe.skipIf(!hasCurl)('docs/proxy/check.sh', () => {
  let servers: Server[] = []
  let okBase = ''
  let cutBase = ''
  beforeAll(async () => {
    const [a, aUrl] = await serve(good)
    const [b, bUrl] = await serve(cut)
    servers = [a, b]
    okBase = aUrl
    cutBase = bUrl
  })
  afterAll(() => {
    for (const s of servers) s.close()
  })

  it('passes every line for a host that keeps the contract, and exits 0', async () => {
    const r = await run(`${okBase}/`)
    expect(r.code, r.out).toBe(0)
    const lines = r.out.trim().split('\n')
    expect(lines.filter((l) => l.startsWith('fail'))).toEqual([])
    expect(lines).toContain('pass  /run answers 302 to /run/modules')
    expect(lines).toContain('pass  /run/ answers 302 to /run/modules')
    expect(lines).toContain('pass  /run?utm_source=check answers 302 to /run/modules?utm_source=check')
    expect(lines).toContain('pass  /run/modules.json answers 200 application/json')
    expect(lines).toContain('pass  a missing page under /run answers 404')
    expect(lines).toContain('info  X-Robots-Tag of /run/modules: none')
    expect(lines.at(-1)).toBe('0 failed')
  })

  it('names each broken line for a proxy that cuts /run, and exits with their number', async () => {
    const r = await run(cutBase, '@open-mercato/gateway-tpay')
    const fails = r.out.split('\n').filter((l) => l.startsWith('fail'))
    expect(fails.length).toBeGreaterThan(5)
    expect(fails).toContain('fail  /run answers 302 to /run/modules (got 200)')
    expect(r.code).toBe(fails.length)
    expect(r.out.trim().split('\n').at(-1)).toBe(`${fails.length} failed`)
  })

  it('refuses a base that is not an http(s) URL', async () => {
    expect((await run('www.openmercato.com')).code).toBe(64)
    expect((await run()).code).toBe(64)
  })
})
