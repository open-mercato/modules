// Step 2.2 of the spec on a started instance: Strapi 5.64.0 loads every content type of cms/src/api and every
// component of cms/src/components, with Draft and Publish on each type, and serves each type on its REST route.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { adminToken, call } from './lib.ts'

const SRC = join(import.meta.dirname, '..', '..', 'src')
const apis = readdirSync(join(SRC, 'api')).sort()
const components = readdirSync(join(SRC, 'components'))
  .flatMap((cat) => readdirSync(join(SRC, 'components', cat)).map((f) => `${cat}.${f.replace(/\.json$/, '')}`))
  .sort()

interface Loaded {
  uid: string
  isDisplayed?: boolean
  options?: { draftAndPublish?: boolean }
  info?: { pluralName?: string; singularName?: string }
  kind?: string
}

test('every content type and component of cms/src is loaded', async () => {
  const token = await adminToken()
  const types = (await call('/content-manager/content-types', { token })).body as { data: Loaded[] }
  const ours = types.data.filter((t) => t.uid.startsWith('api::'))
  assert.deepEqual(ours.map((t) => t.uid).sort(), apis.map((a) => `api::${a}.${a}`).sort())
  for (const t of ours) assert.equal(t.options?.draftAndPublish, true, t.uid)
  const comps = (await call('/content-manager/components', { token })).body as { data: Loaded[] }
  assert.deepEqual(comps.data.map((c) => c.uid).sort(), components)
})

test('every content type answers on its REST route, and not to an anonymous request', async () => {
  const token = await adminToken()
  const types = ((await call('/content-manager/content-types', { token })).body as { data: Loaded[] }).data
  for (const t of types.filter((x) => x.uid.startsWith('api::'))) {
    const route = t.kind === 'collectionType' ? `/api/${t.info?.pluralName}` : `/api/${t.info?.singularName}`
    const r = await call(route)
    assert.ok([401, 403].includes(r.status), `${route}: anonymous ${r.status}`)
  }
})
