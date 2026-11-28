// The publish hook of Step 2.4 against a fake GitHub endpoint (node:http on 127.0.0.1), with short waits.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createDispatcher, DISPATCH_BODY, DISPATCH_PATH } from '../../src/hook/dispatch.ts'
import { startFake, type Fake } from '../fake-github/server.mts'

let fake: Fake
const logs: string[] = []
const log = { info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(m) }
const make = (o: Partial<Parameters<typeof createDispatcher>[0]> = {}) =>
  createDispatcher({
    apiUrl: fake.url,
    token: 'fake-token',
    quietMs: 150,
    maxWaitMs: 2000,
    backoffMs: [20, 40],
    log,
    ...o,
  })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

before(async () => {
  fake = await startFake()
})
after(async () => {
  await fake.close()
})
beforeEach(() => {
  fake.calls.length = 0
  fake.answers.length = 0
  logs.length = 0
})

test('a burst of events gives one dispatch with the fixed body, after the quiet period', async () => {
  const d = make()
  const start = Date.now()
  for (let i = 0; i < 5; i++) {
    d.notify('entry.publish', 'api::blog-post.blog-post')
    await wait(40)
  }
  await d.idle()
  assert.equal(fake.calls.length, 1)
  const [call] = fake.calls
  assert.equal(call?.method, 'POST')
  assert.equal(call?.path, DISPATCH_PATH)
  assert.equal(DISPATCH_PATH, '/repos/open-mercato/modules/actions/workflows/pages.yml/dispatches')
  assert.deepEqual(call?.body, { ref: 'main', inputs: { www_content: 'publish' } })
  assert.deepEqual(call?.body, DISPATCH_BODY)
  assert.equal(call?.headers.authorization, 'Bearer fake-token')
  assert.equal(call?.headers.accept, 'application/vnd.github+json')
  // the last event came at about 160 ms, the dispatch 150 ms of quiet after it
  assert.ok((call?.at ?? 0) - start >= 160 + 150 - 20, `dispatched after ${(call?.at ?? 0) - start} ms`)
  d.stop()
})

test('events that never stop are dispatched at the longest wait from the first', async () => {
  const d = make({ quietMs: 100, maxWaitMs: 400 })
  const start = Date.now()
  const until = start + 700
  while (Date.now() < until) {
    d.notify('entry.publish')
    await wait(30)
  }
  await d.idle()
  assert.ok(fake.calls.length >= 1 && fake.calls.length <= 2, `${fake.calls.length} dispatches`)
  const first = (fake.calls[0]?.at ?? 0) - start
  assert.ok(first >= 380 && first < 600, `first dispatch after ${first} ms`)
  d.stop()
})

test('a 403 is logged as refused and not retried', async () => {
  fake.answers.push(403)
  const d = make()
  d.notify('entry.publish')
  await d.idle()
  assert.equal(fake.calls.length, 1)
  assert.ok(logs.includes('dispatch refused: token'), logs.join('\n'))
  d.stop()
})

test('a 401 is logged as refused and not retried', async () => {
  fake.answers.push(401)
  const d = make()
  d.notify('entry.unpublish')
  await d.idle()
  assert.equal(fake.calls.length, 1)
  assert.ok(logs.includes('dispatch refused: token'))
  d.stop()
})

test('a 5xx is tried three times with backoff, then given up', async () => {
  fake.answers.push(502, 503, 500)
  const d = make()
  d.notify('entry.delete')
  await d.idle()
  assert.equal(fake.calls.length, 3)
  assert.ok(
    logs.some((l) => l.startsWith('dispatch failed after 3 tries')),
    logs.join('\n'),
  )
  d.stop()
})

test('a 5xx then a success stops at the success', async () => {
  fake.answers.push(500)
  const d = make()
  d.notify('media.update')
  await d.idle()
  assert.equal(fake.calls.length, 2)
  assert.ok(logs.includes('dispatch sent: pages.yml www_content=publish'))
  d.stop()
})

test('a network error is retried three times', async () => {
  const d = make({ apiUrl: 'http://127.0.0.1:9' })
  d.notify('media.delete')
  await d.idle()
  assert.equal(logs.filter((l) => l.startsWith('dispatch try')).length, 3)
  d.stop()
})

test('without a token nothing is sent', async () => {
  const d = make({ token: undefined })
  d.notify('entry.publish')
  await d.idle()
  assert.equal(fake.calls.length, 0)
  assert.ok(logs.includes('dispatch off: GITHUB_DISPATCH_TOKEN is not set'))
  d.stop()
})
