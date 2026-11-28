// Step 2.4 of the spec on a started instance whose publish hook calls the fake GitHub endpoint of compose.test.yaml
// (quiet period 2 s there): one publish, one unpublish and one delete each give exactly one dispatch with the fixed
// body, and a draft save gives none.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adminToken, call } from './lib.ts'

const FAKE = `http://127.0.0.1:${process.env.CMS_FAKE_GITHUB_PORT ?? '8099'}`
const POST = 'api::blog-post.blog-post'
const QUIET_MS = 2000

interface Call {
  method: string
  path: string
  body: unknown
  headers: Record<string, string>
}

const calls = async (): Promise<Call[]> => (await fetch(`${FAKE}/calls`)).json() as Promise<Call[]>
const reset = async () => {
  await fetch(`${FAKE}/calls`, { method: 'DELETE' })
}
/** Waits out the quiet period and a margin, then returns the dispatches since the last reset. */
async function settle(): Promise<Call[]> {
  await new Promise((r) => setTimeout(r, QUIET_MS + 3000))
  return calls()
}

function assertOneDispatch(got: Call[], action: string) {
  assert.equal(got.length, 1, `${action}: ${got.length} dispatches`)
  assert.equal(got[0]?.method, 'POST')
  assert.equal(got[0]?.path, '/repos/open-mercato/modules/actions/workflows/pages.yml/dispatches')
  assert.deepEqual(got[0]?.body, { ref: 'main', inputs: { www_content: 'publish' } })
  assert.equal(got[0]?.headers.authorization, 'Bearer fake-token-of-the-tests')
}

test('a draft save gives no dispatch; one publish, one unpublish and one delete each give exactly one', async () => {
  const token = await adminToken()
  await settle()
  await reset()
  const base = `/content-manager/collection-types/${POST}`
  const created = await call(base, {
    method: 'POST',
    token,
    body: JSON.stringify({
      slug: `cms-hook-post-${Date.now()}`,
      title: 'A post of the hook test',
      description: 'A post of the hook test.',
      date: '2026-11-27T10:00:00.000Z',
      body: 'Text.',
    }),
  })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const { documentId } = (created.body as { data: { documentId: string } }).data
  assert.deepEqual(await settle(), [], 'a draft save dispatches nothing')

  const steps: [string, string, string][] = [
    ['publish', 'POST', `${base}/${documentId}/actions/publish`],
    ['unpublish', 'POST', `${base}/${documentId}/actions/unpublish`],
    ['delete', 'DELETE', `${base}/${documentId}`],
  ]
  for (const [action, method, path] of steps) {
    await reset()
    const r = await call(path, { method, token, ...(method === 'POST' ? { body: JSON.stringify({}) } : {}) })
    assert.equal(r.status, 200, `${action}: ${JSON.stringify(r.body)}`)
    assertOneDispatch(await settle(), action)
  }
})
