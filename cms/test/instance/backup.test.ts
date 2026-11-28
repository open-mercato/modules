// Step 2.5 of the spec on a started instance: backup.sh in the backup job writes one archive, encrypted with age, to
// a local target; restore.sh puts it into a second Compose project, which then holds the same pg_dump listing, the
// same rows per table and the same SHA-256 of every upload, and whose Strapi starts on it. The weekly archive carries
// the `strapi export` archive too. The age key pair is made for the run and removed with it.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { adminToken, call, compose } from './lib.ts'

const CMS = join(import.meta.dirname, '..', '..')
const FIXTURES = join(CMS, 'test', 'fixtures')
const project = /-p\s+(\S+)/.exec(process.env.CMS_COMPOSE ?? '')?.[1] ?? 'cms-test'
const RESTORED = `${project}-restore`

/** The second project: the host Compose file alone, no published port. */
function restored(...args: string[]): string {
  return execFileSync('docker', ['compose', '--progress', 'quiet', '-p', RESTORED, '-f', 'compose.yaml', ...args], {
    cwd: CMS,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}
type Run = (...args: string[]) => string

const target = mkdtempSync(join(tmpdir(), 'cms-backup-target-'))
const keys = mkdtempSync(join(tmpdir(), 'cms-backup-key-'))
// the jobs run as uid 1000 (the user node of the Strapi image)
chmodSync(target, 0o777)
chmodSync(keys, 0o755)

after(() => {
  try {
    restored('down', '--volumes')
  } finally {
    rmSync(target, { recursive: true, force: true })
    rmSync(keys, { recursive: true, force: true })
  }
})

/** The table of contents of a fresh pg_dump, without the header and the ids and oids that differ between databases. */
function listing(run: Run): string[] {
  const out = run(
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB" | pg_restore --list',
  )
  return out
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.startsWith(';'))
    .map((l) => l.replace(/^\d+;\s+\d+\s+\d+\s+/, ''))
}

/** The number of rows of every table. */
function rows(run: Run): string {
  const sql = `select string_agg(table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text, E'\\n' order by table_name) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`
  return run('exec', '-T', 'postgres', 'sh', '-c', `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "${sql}"`).trim()
}

/** The SHA-256 of every file of the uploads volume, by path. */
function uploads(run: Run): string {
  return run(
    '--profile',
    'backup',
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'sh',
    'backup',
    '-c',
    'cd /uploads && find . -type f -print0 | sort -z | xargs -0 -r sha256sum',
  ).trim()
}

test('a backup to a local target restores into a second project with the same database and uploads', async () => {
  const token = await adminToken()
  // content of its own, so the test holds when it runs alone: two uploads and a published post
  for (const f of ['exif.jpg', 'metadata.svg']) {
    const form = new FormData()
    form.append('files', new Blob([readFileSync(join(FIXTURES, f))]), `backup-${f}`)
    assert.equal((await call('/upload', { method: 'POST', token, body: form })).status, 201)
  }
  const base = '/content-manager/collection-types/api::blog-post.blog-post'
  const post = await call(base, {
    method: 'POST',
    token,
    body: JSON.stringify({
      slug: `cms-backup-post-${Date.now()}`,
      title: 'A post of the backup test',
      description: 'A post of the backup test.',
      date: '2026-11-27T10:00:00.000Z',
      body: 'Text.',
    }),
  })
  const { documentId } = (post.body as { data: { documentId: string } }).data
  await call(`${base}/${documentId}/actions/publish`, { method: 'POST', token, body: '{}' })

  // the weekly `strapi export` archive, encrypted by Strapi with a key of the run
  compose(
    'exec',
    '-T',
    'strapi',
    'node',
    'node_modules/@strapi/strapi/bin/strapi.js',
    'export',
    '--key',
    `export-key-${Date.now()}`,
    '--file',
    'exports/strapi-export-test',
  )

  // an age key pair of the run: the public key for the backup, the private one only for the restore
  const pair = compose('--profile', 'backup', 'run', '--rm', '--no-deps', '--entrypoint', 'age-keygen', 'backup')
  const recipient = /# public key: (age1[0-9a-z]+)/.exec(pair)?.[1]
  assert.ok(recipient, 'age-keygen gave a public key')
  const secret = /^AGE-SECRET-KEY-1[0-9A-Z]+$/m.exec(pair)?.[0]
  assert.ok(secret, 'age-keygen gave a private key')
  const identity = join(keys, 'identity.txt')
  writeFileSync(identity, `${secret}\n`, { mode: 0o644 })

  const out = compose(
    '--profile',
    'backup',
    'run',
    '--rm',
    '-e',
    'BACKUP_TARGET=/target',
    '-e',
    `BACKUP_AGE_RECIPIENT=${recipient}`,
    '-e',
    'BACKUP_KIND=weekly',
    '-v',
    `${target}:/target`,
    'backup',
  )
  console.log(out.trim())
  const archives = readdirSync(target)
  assert.equal(archives.length, 1, archives.join(', '))
  const [archive] = archives as [string]
  assert.match(archive, /^strapi-\d{8}T\d{6}Z-weekly\.tar\.age$/)
  // the archive is private to the backup user (mode 600, uid 1000): read its header through the job's image
  const header = compose(
    '--profile',
    'backup',
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'head',
    '-v',
    `${target}:/target:ro`,
    'backup',
    '-c',
    '21',
    `/target/${archive}`,
  )
  assert.equal(header, 'age-encryption.org/v1', 'the archive is encrypted with age')

  restored('up', '--detach', '--wait', 'postgres')
  const restoreOut = restored(
    '--profile',
    'restore',
    'run',
    '--rm',
    '-v',
    `${target}:/target:ro`,
    '-v',
    `${identity}:/run/backup/age_identity:ro`,
    'restore',
    `/target/${archive}`,
  )
  console.log(restoreOut.trim())
  assert.match(restoreOut, /the archive also holds strapi-export-test/)

  const want = listing(compose)
  assert.ok(want.length > 100, `${want.length} entries in the listing`)
  assert.deepEqual(listing(restored), want, 'the same pg_dump listing')
  assert.equal(rows(restored), rows(compose), 'the same rows per table')
  const files = uploads(compose)
  assert.ok(files.split('\n').length >= 4, files)
  assert.equal(uploads(restored), files, 'the same SHA-256 of every upload')
  console.log(`pg_dump listing: ${want.length} entries equal; uploads: ${files.split('\n').length} files equal`)

  // the restored project starts Strapi on the restored data
  restored('up', '--detach', '--wait', 'strapi')
})
