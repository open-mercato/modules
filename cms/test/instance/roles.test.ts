// Step 2.3 of the spec on a started production-mode instance: the roles seed made the four accounts of
// CMS_ADMIN_ACCOUNTS Super Admins by invitation, a Super Admin publishes a post, the Content-Type Builder changes no
// model, the Public role has no permission after a start, and the edit views hide webflowId and carry the help texts.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adminToken, call, restartStrapi, TEST_OWNER } from './lib.ts'

const ACCOUNTS = ['test-owner', 'test-infra', 'test-editor-one', 'test-editor-two'].map((l) => `${l}@example.com`)
const POST = 'api::blog-post.blog-post'

interface User {
  email: string
  isActive: boolean
  roles: { code: string }[]
}

test('the seed made the four accounts Super Admins, each by invitation', async () => {
  const token = await adminToken()
  const r = await call('/admin/users?pageSize=100', { token })
  const users = (r.body as { data: { results: User[] } }).data.results
  assert.deepEqual(users.map((u) => u.email).sort(), [...ACCOUNTS].sort())
  for (const u of users) {
    assert.deepEqual(
      u.roles.map((x) => x.code),
      ['strapi-super-admin'],
      u.email,
    )
    // only the account whose invitation this test run took has a password and is active
    assert.equal(u.isActive, u.email === TEST_OWNER, u.email)
  }
  const again = await call('/admin/register-admin', {
    method: 'POST',
    body: JSON.stringify({ email: 'someone@example.com', password: 'Aa1aaaaaaaa', firstname: 'S' }),
  })
  assert.notEqual(again.status, 200, 'a first admin can no longer be registered')
})

test('a Super Admin publishes a post', async () => {
  const token = await adminToken()
  const created = await call(`/content-manager/collection-types/${POST}`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      slug: `cms-test-post-${Date.now()}`,
      title: 'A test post',
      description: 'A post of the instance tests.',
      date: '2026-11-27T10:00:00.000Z',
      body: 'Text of the post.',
    }),
  })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const { documentId } = (created.body as { data: { documentId: string } }).data
  const published = await call(`/content-manager/collection-types/${POST}/${documentId}/actions/publish`, {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  })
  assert.equal(published.status, 200, JSON.stringify(published.body))
  assert.match(String((published.body as { data: { publishedAt: string } }).data.publishedAt), /^2\d{3}-/)
})

test('the Content-Type Builder is not offered for changes and refuses a model change', async () => {
  const token = await adminToken()
  const info = (await call('/admin/information', { token })).body as { data: Record<string, unknown> }
  assert.equal(info.data.currentEnvironment, 'production')
  // the admin hides the builder's editing when autoReload is off (strapi start)
  assert.equal(info.data.autoReload, false)
  const attempts: [string, string, unknown][] = [
    [
      'POST',
      '/content-type-builder/content-types',
      {
        contentType: { displayName: 'X', singularName: 'x', pluralName: 'xs', kind: 'collectionType', attributes: {} },
      },
    ],
    ['PUT', `/content-type-builder/content-types/${POST}`, { contentType: { attributes: {} } }],
    ['DELETE', `/content-type-builder/content-types/${POST}`, undefined],
    [
      'POST',
      '/content-type-builder/components',
      { component: { category: 'shared', displayName: 'X', attributes: {} } },
    ],
    ['POST', '/content-type-builder/update-schema', { data: { contentTypes: [], components: [] } }],
  ]
  for (const [method, path, body] of attempts) {
    const r = await call(path, { method, token, ...(body ? { body: JSON.stringify(body) } : {}) })
    assert.equal(r.status, 403, `${method} ${path}: ${r.status} ${JSON.stringify(r.body)}`)
    assert.match(JSON.stringify(r.body), /disabled in production mode/, `${method} ${path}`)
  }
  const still = await call(`/content-type-builder/content-types/${POST}`, { token })
  assert.equal(still.status, 200)
})

test('the Public role has no permission after a start, even when a Super Admin granted one', async () => {
  const token = await adminToken()
  const roles = (await call('/users-permissions/roles', { token })).body as { roles: { id: number; type: string }[] }
  const pub = roles.roles.find((r) => r.type === 'public')
  assert.ok(pub)
  const grant = await call(`/users-permissions/roles/${pub.id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify({
      name: 'Public',
      description: 'Default role given to unauthenticated user.',
      permissions: { 'api::blog-post': { controllers: { 'blog-post': { find: { enabled: true } } } } },
    }),
  })
  assert.equal(grant.status, 200, JSON.stringify(grant.body))
  assert.equal((await call('/api/blog-posts')).status, 200, 'the grant opened the content API')

  await restartStrapi()
  assert.ok([401, 403].includes((await call('/api/blog-posts')).status), 'refused again after the restart')
  const role = (await call(`/users-permissions/roles/${pub.id}`, { token: await adminToken() })).body as {
    role: { permissions: Record<string, { controllers: Record<string, Record<string, { enabled: boolean }>> }> }
  }
  const enabled = Object.entries(role.role.permissions).flatMap(([plugin, p]) =>
    Object.entries(p.controllers).flatMap(([c, actions]) =>
      Object.entries(actions)
        .filter(([, a]) => a.enabled)
        .map(([a]) => `${plugin}.${c}.${a}`),
    ),
  )
  assert.deepEqual(enabled, [])
  const register = await call('/api/auth/local/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'x', email: 'x@example.com', password: 'Aa1aaaaaaaa' }),
  })
  assert.notEqual(register.status, 200, 'no end-user registration')
})

test('the edit views hide webflowId and carry the help texts', async () => {
  const token = await adminToken()
  const r = await call(`/content-manager/content-types/${POST}/configuration`, { token })
  const conf = (r.body as { data: { contentType: { metadatas: Record<string, { edit: Record<string, unknown> }> } } })
    .data.contentType
  assert.equal(conf.metadatas.webflowId?.edit.visible, false)
  assert.match(String(conf.metadatas.slug?.edit.description), /needs a redirect from the old path/)
  assert.match(String(conf.metadatas.slug?.edit.description), /Published changes are on the site/)
})
