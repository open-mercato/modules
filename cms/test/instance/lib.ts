// Helpers of the tests that need a started instance (spec Phase 2: cms.yml starts it from compose.yaml with an empty
// database). CMS_URL is the instance; CMS_COMPOSE is the Compose command that started it (project and files), so a
// test can restart Strapi or read a file of its volume. Both are set by cms.yml and by the local recipe of
// cms/README.md; a test run without them fails, it never skips.
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set: these tests need a started instance (cms/README.md, Tests)`)
  return v
}

export const CMS_URL = (): string => need('CMS_URL').replace(/\/$/, '')

/** Runs the Compose command of the instance with more arguments and returns its output. */
export function compose(...args: string[]): string {
  const [cmd, ...base] = need('CMS_COMPOSE').split(' ').filter(Boolean)
  return execFileSync(cmd as string, [...base, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Waits until Strapi answers its health route. */
export async function waitHealthy(timeoutMs = 180_000): Promise<void> {
  const until = Date.now() + timeoutMs
  for (;;) {
    try {
      const r = await fetch(`${CMS_URL()}/_health`)
      if (r.ok) return
    } catch {
      // not listening yet
    }
    if (Date.now() > until) throw new Error('Strapi did not become healthy')
    await new Promise((r) => setTimeout(r, 2000))
  }
}

/** Restarts Strapi and waits for it. */
export async function restartStrapi(): Promise<void> {
  compose('restart', 'strapi')
  await new Promise((r) => setTimeout(r, 3000))
  await waitHealthy()
}

export interface Answer {
  status: number
  body: unknown
}

/** A request to the instance; the body is JSON when it parses. */
export async function call(path: string, init: RequestInit & { token?: string } = {}): Promise<Answer> {
  const headers = new Headers(init.headers)
  if (init.token) headers.set('authorization', `Bearer ${init.token}`)
  if (init.body && typeof init.body === 'string') headers.set('content-type', 'application/json')
  const r = await fetch(`${CMS_URL()}${path}`, { ...init, headers })
  const text = await r.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // not JSON
  }
  return { status: r.status, body }
}

const data = (a: Answer): Record<string, unknown> =>
  ((a.body as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>

let session: Promise<string> | undefined

/**
 * Where the test run keeps the address and random password of its admin, for the next test file (one process each):
 * a file named after the invitation of this instance, so a fresh database never reads the file of an earlier one.
 */
function statePath(invitation: string | undefined): string {
  const key = invitation ? createHash('sha256').update(invitation).digest('hex').slice(0, 16) : 'first-admin'
  return join(tmpdir(), `cms-instance-test-${key}.json`)
}

/** The test accounts of cms/scripts/dev-env.sh: placeholders of example.com, never a person. */
export const TEST_OWNER = 'test-owner@example.com'

/** The invitation token the roles seed logged for an address (spec Step 2.3: no password in cms/.env). */
export function invitationToken(email: string): string {
  const log = compose('logs', '--no-color', 'strapi')
  const m = new RegExp(`invited ${email.replace(/[.]/g, '\\.')}: \\S*registrationToken=([0-9a-f]+)`).exec(log)
  if (!m) throw new Error(`no invitation of ${email} in the Strapi log`)
  return m[1] as string
}

/**
 * The admin token of a Super Admin of this test run. The first test file takes the invitation the roles seed logged
 * for TEST_OWNER and sets a random password through it, kept only in a temporary file of the run; an instance
 * without seeded accounts gets a first admin through register-admin instead.
 */
export function adminToken(): Promise<string> {
  session ??= (async () => {
    const init = data(await call('/admin/init'))
    const invitation = init.hasAdmin ? invitationToken(TEST_OWNER) : undefined
    const state = statePath(invitation)
    let creds: { email: string; password: string }
    if (existsSync(state)) creds = JSON.parse(readFileSync(state, 'utf8'))
    else {
      creds = { email: TEST_OWNER, password: `T1-${randomBytes(18).toString('base64url')}` }
      const reg = init.hasAdmin
        ? await call('/admin/register', {
            method: 'POST',
            body: JSON.stringify({
              registrationToken: invitation,
              userInfo: { firstname: 'Test', lastname: 'Owner', password: creds.password },
            }),
          })
        : await call('/admin/register-admin', {
            method: 'POST',
            body: JSON.stringify({ ...creds, firstname: 'Test', lastname: 'Owner' }),
          })
      if (reg.status !== 200) throw new Error(`registration answered ${reg.status}: ${JSON.stringify(reg.body)}`)
      writeFileSync(state, JSON.stringify(creds), { mode: 0o600 })
    }
    const login = await call('/admin/login', { method: 'POST', body: JSON.stringify(creds) })
    const token = data(login).token
    if (typeof token !== 'string') throw new Error(`login answered ${login.status}: ${JSON.stringify(login.body)}`)
    return token
  })()
  return session
}
