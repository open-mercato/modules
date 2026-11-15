// The proxy Worker of docs/proxy/ (handed over, not deployed from here) against the contract in docs/RUNBOOK.md: the
// request mapping with a fake fetch, never the network.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import worker, {
  forwardHeaders,
  handle,
  isRunPath,
  shortRedirect,
  upstreamOrigin,
  upstreamUrl,
  type ProxyEnv,
} from '../../docs/proxy/worker.ts'
import { ROOT } from '../emit/helpers.ts'

const PREVIEW = 'https://run-preview.open-mercato-modules.pages.dev'
const PRODUCTION = 'https://open-mercato-modules.pages.dev'
const WWW = 'https://www.openmercato.com'

/** A fake fetch that records each request and answers with `reply`. */
function fake(reply: () => Response = () => new Response('ok')) {
  const seen: Request[] = []
  const f = async (r: Request): Promise<Response> => {
    seen.push(r)
    return reply()
  }
  return { f, seen }
}

describe('the proxy Worker for www.openmercato.com/run', () => {
  it('takes /run and /run/* only, not /running or the rest of the main site', () => {
    for (const p of ['/run', '/run/', '/run/modules', '/run/m/@open-mercato/gateway-tpay', '/run/modules.json'])
      expect(isRunPath(p), p).toBe(true)
    for (const p of ['/', '/running', '/run-x', '/runs/x', '/modules', '/blog/run']) expect(isRunPath(p), p).toBe(false)
  })

  it('accepts an https origin as UPSTREAM and nothing else', () => {
    expect(upstreamOrigin(PREVIEW)).toBe(PREVIEW)
    expect(upstreamOrigin(`${PRODUCTION}/`)).toBe(PRODUCTION)
    expect(upstreamOrigin(` ${PRODUCTION} `)).toBe(PRODUCTION)
    for (const bad of [
      undefined,
      '',
      'open-mercato-modules.pages.dev',
      'http://open-mercato-modules.pages.dev',
      `${PRODUCTION}/run`,
      `${PRODUCTION}/?a=1`,
      'https://user:pw@open-mercato-modules.pages.dev',
    ])
      expect(upstreamOrigin(bad), String(bad)).toBeNull()
  })

  it('keeps the path, /run included, and the query exactly', () => {
    expect(upstreamUrl(`${WWW}/run`, PREVIEW)).toBe(`${PREVIEW}/run`)
    expect(upstreamUrl(`${WWW}/run/`, PREVIEW)).toBe(`${PREVIEW}/run/`)
    expect(upstreamUrl(`${WWW}/run/submit?npm=@open-mercato/gateway-tpay&x=1`, PRODUCTION)).toBe(
      `${PRODUCTION}/run/submit?npm=@open-mercato/gateway-tpay&x=1`,
    )
    expect(upstreamUrl(`${WWW}/run/m/%40open-mercato/gateway-tpay`, PRODUCTION)).toBe(
      `${PRODUCTION}/run/m/%40open-mercato/gateway-tpay`,
    )
  })

  it('sends a GET upstream with its headers, without the hop headers and cookies, redirects not followed', async () => {
    const { f, seen } = fake()
    const req = new Request(`${WWW}/run/modules.json?x=1`, {
      headers: {
        Accept: 'application/json',
        'If-None-Match': '"abc"',
        'Accept-Encoding': 'gzip, br',
        'User-Agent': 'curl/8',
        Origin: 'https://example.com',
        Cookie: 'webflow=1',
        Connection: 'keep-alive',
      },
    })
    await handle(req, { UPSTREAM: PREVIEW }, f)
    expect(seen).toHaveLength(1)
    const up = seen[0] as Request
    expect(up.url).toBe(`${PREVIEW}/run/modules.json?x=1`)
    expect(up.method).toBe('GET')
    expect(up.redirect).toBe('manual')
    expect(up.headers.get('accept')).toBe('application/json')
    expect(up.headers.get('if-none-match')).toBe('"abc"')
    expect(up.headers.get('accept-encoding')).toBe('gzip, br')
    expect(up.headers.get('user-agent')).toBe('curl/8')
    expect(up.headers.get('origin')).toBe('https://example.com')
    expect(up.headers.get('cookie')).toBeNull()
    expect(up.headers.get('connection')).toBeNull()
    expect(up.headers.get('x-forwarded-host')).toBe('www.openmercato.com')
    expect(up.headers.get('x-forwarded-proto')).toBe('https')
  })

  it('passes the method and the body through', async () => {
    const { f, seen } = fake()
    const body = JSON.stringify({ npm: '@open-mercato/gateway-tpay' })
    await handle(
      new Request(`${WWW}/run/submit`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }),
      { UPSTREAM: PRODUCTION },
      f,
    )
    const up = seen[0] as Request
    expect(up.method).toBe('POST')
    expect(up.headers.get('content-type')).toBe('application/json')
    expect(await up.text()).toBe(body)
    for (const method of ['HEAD', 'OPTIONS']) {
      const one = fake()
      await handle(new Request(`${WWW}/run/modules`, { method }), { UPSTREAM: PRODUCTION }, one.f)
      expect(one.seen[0]?.method, method).toBe(method)
    }
  })

  it('gives the answer back as it is: a 302 with its Location, a 404, the headers of a file', async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/run/modules' } })
    const r1 = await handle(new Request(`${WWW}/run?a=1`), { UPSTREAM: PREVIEW }, async () => redirect)
    expect(r1).toBe(redirect)
    expect(r1.status).toBe(302)
    expect(r1.headers.get('location')).toBe('/run/modules')
    const file = new Response('{}', {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        ETag: '"e1"',
        'Access-Control-Allow-Origin': '*',
      },
    })
    expect(await handle(new Request(`${WWW}/run/modules.json`), { UPSTREAM: PREVIEW }, async () => file)).toBe(file)
    const missing = new Response('not found', { status: 404 })
    expect(await handle(new Request(`${WWW}/run/nope`), { UPSTREAM: PREVIEW }, async () => missing)).toBe(missing)
  })

  it('answers a 502 and asks nobody when UPSTREAM is missing or not an origin', async () => {
    for (const env of [{}, { UPSTREAM: 'open-mercato-modules.pages.dev' }, { UPSTREAM: `${PRODUCTION}/run` }]) {
      const { f, seen } = fake()
      const r = await handle(new Request(`${WWW}/run/modules`), env, f)
      expect(r.status, JSON.stringify(env)).toBe(502)
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(seen).toHaveLength(0)
    }
  })

  it('leaves the rest of the main site alone: a path the route caught goes on unchanged', async () => {
    const up = fake()
    const pass = fake()
    const req = new Request(`${WWW}/running?x=1`, { headers: { Cookie: 'webflow=1' } })
    await handle(req, { UPSTREAM: PREVIEW }, up.f, pass.f)
    expect(up.seen).toHaveLength(0)
    expect(pass.seen).toEqual([req])
  })

  it('short addresses redirect into /run only with SHORT_REDIRECTS on', async () => {
    const env: ProxyEnv = { UPSTREAM: PREVIEW, SHORT_REDIRECTS: 'on' }
    expect(shortRedirect(`${WWW}/modules`, env)).toBe(`${WWW}/run/modules`)
    expect(shortRedirect(`${WWW}/modules/?q=crm`, env)).toBe(`${WWW}/run/modules?q=crm`)
    expect(shortRedirect(`${WWW}/templates`, env)).toBe(`${WWW}/run/templates`)
    expect(shortRedirect(`${WWW}/pricing`, env)).toBeNull()
    for (const v of [undefined, '', 'off', '0', 'false'])
      expect(shortRedirect(`${WWW}/modules`, { ...env, SHORT_REDIRECTS: v }), String(v)).toBeNull()
    const pass = fake()
    const r = await handle(new Request(`${WWW}/templates?a=1`), env, fake().f, pass.f)
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe(`${WWW}/run/templates?a=1`)
    expect(pass.seen).toHaveLength(0)
    // a POST to the short address is the main site's business
    await handle(new Request(`${WWW}/modules`, { method: 'POST', body: 'x' }), env, fake().f, pass.f)
    expect(pass.seen).toHaveLength(1)
    // off: the main site answers its own /modules
    const off = fake()
    await handle(new Request(`${WWW}/modules`), { UPSTREAM: PREVIEW }, fake().f, off.f)
    expect(off.seen).toHaveLength(1)
  })

  it('forwardHeaders keeps repeated values and names the original host', () => {
    const h = new Headers([
      ['Accept-Language', 'pl'],
      ['X-Custom', 'a'],
      ['Host', 'www.openmercato.com'],
    ])
    const out = forwardHeaders(h, 'http://127.0.0.1:8787/run/x')
    expect(out.get('accept-language')).toBe('pl')
    expect(out.get('x-custom')).toBe('a')
    expect(out.get('host')).toBeNull()
    expect(out.get('x-forwarded-host')).toBe('127.0.0.1:8787')
    expect(out.get('x-forwarded-proto')).toBe('http')
  })

  it('is one file the README can hand over: a default export with fetch, no imports', () => {
    expect(typeof worker.fetch).toBe('function')
    const src = readFileSync(join(ROOT, 'docs', 'proxy', 'worker.ts'), 'utf8')
    expect(src).not.toMatch(/^\s*import\s/m)
    // the example config deploys this file on the route of the contract, against the preview first
    const toml = readFileSync(join(ROOT, 'docs', 'proxy', 'wrangler.toml'), 'utf8')
    expect(toml).toMatch(/^main = "worker\.ts"$/m)
    expect(toml).toContain('pattern = "www.openmercato.com/run*"')
    expect(toml).toMatch(/^UPSTREAM = "https:\/\/run-preview\.open-mercato-modules\.pages\.dev"$/m)
    expect(toml).toMatch(/^SHORT_REDIRECTS = "off"$/m)
  })
})
