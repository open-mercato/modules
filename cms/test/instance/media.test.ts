// Step 2.1 of the spec on a started instance with an empty database: the Media Library settings of A7 are off again
// after a Super Admin turns them on and Strapi restarts; a JPEG, a PNG, a WebP and an SVG with metadata keep their
// SHA-256 through an upload (the stored file on the volume and the file Strapi serves); and the answer to an anonymous
// GET of an uploaded file under /uploads/ is printed for the Risks of the spec.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { adminToken, call, CMS_URL, compose, restartStrapi } from './lib.ts'

const FIXTURES = join(import.meta.dirname, '..', 'fixtures')
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

interface Upload {
  name: string
  url: string
  hash: string
  ext: string
  mime: string
  formats: Record<string, unknown> | null
}

const IMAGES = [
  ['exif.jpg', 'image/jpeg'],
  ['text.png', 'image/png'],
  ['exif.webp', 'image/webp'],
  ['metadata.svg', 'image/svg+xml'],
] as const

test('the three Media Library settings are off after a change and a restart', async () => {
  const token = await adminToken()
  const on = { sizeOptimization: true, responsiveDimensions: true, autoOrientation: true }
  const put = await call('/upload/settings', { method: 'PUT', token, body: JSON.stringify(on) })
  assert.equal(put.status, 200, JSON.stringify(put.body))
  const changed = await call('/upload/settings', { token })
  assert.deepEqual(pick((changed.body as { data: Record<string, unknown> }).data), on)

  await restartStrapi()
  const after = await call('/upload/settings', { token: await freshToken() })
  assert.deepEqual(pick((after.body as { data: Record<string, unknown> }).data), {
    sizeOptimization: false,
    responsiveDimensions: false,
    autoOrientation: false,
  })
  const row = compose(
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select value from strapi_core_store_settings where key = 'plugin_upload_settings'"`,
  )
  console.log(`stored in strapi_core_store_settings, key plugin_upload_settings: ${row.trim()}`)
  assert.deepEqual(pick(JSON.parse(row)), {
    sizeOptimization: false,
    responsiveDimensions: false,
    autoOrientation: false,
  })
})

test('a JPEG, a PNG, a WebP and an SVG with metadata keep their SHA-256', async () => {
  const token = await freshToken()
  for (const [file, mime] of IMAGES) {
    const bytes = readFileSync(join(FIXTURES, file))
    const form = new FormData()
    form.append('files', new Blob([bytes], { type: mime }), file)
    const r = await call('/upload', { method: 'POST', token, body: form })
    assert.equal(r.status, 201, `${file}: ${JSON.stringify(r.body)}`)
    const [up] = r.body as Upload[]
    assert.ok(up, file)
    assert.equal(up.mime, mime, file)
    const served = new Uint8Array(
      await (await fetch(`${CMS_URL()}${up.url}`, { headers: await bearer() })).arrayBuffer(),
    )
    const stored = compose('exec', '-T', 'strapi', 'sha256sum', `public${up.url}`).split(' ')[0]
    console.log(`${file}: original ${sha256(bytes)}, stored ${stored}, served ${sha256(served)}`)
    assert.equal(stored, sha256(bytes), `${file}: the stored file differs from the original`)
    assert.equal(sha256(served), sha256(bytes), `${file}: the served file differs from the original`)
    // with "Responsive friendly upload" off Strapi makes no large, medium or small variant (a thumbnail it always makes)
    const formats = Object.keys(up.formats ?? {})
    assert.deepEqual(
      formats.filter((f) => f !== 'thumbnail'),
      [],
      `${file}: formats ${formats.join(', ')}`,
    )
  }
})

test('an anonymous GET of an uploaded file under /uploads/ is recorded', async () => {
  const token = await freshToken()
  const list = await call('/upload/files?pageSize=1', { token })
  const [file] = (list.body as { results: Upload[] }).results
  assert.ok(file, 'an uploaded file')
  const r = await fetch(`${CMS_URL()}${file.url}`)
  console.log(`anonymous GET ${file.url}: ${r.status} ${r.headers.get('content-type')}`)
  assert.ok([200, 401, 403, 404].includes(r.status), `answer ${r.status}`)
})

const pick = (s: Record<string, unknown>) => ({
  sizeOptimization: s.sizeOptimization,
  responsiveDimensions: s.responsiveDimensions,
  autoOrientation: s.autoOrientation,
})

let token: string | undefined
/** An admin token that survives a restart (the admin JWT does: its secret is in cms/.env). */
async function freshToken(): Promise<string> {
  token ??= await adminToken()
  return token
}

async function bearer(): Promise<Record<string, string>> {
  return { authorization: `Bearer ${await freshToken()}` }
}
