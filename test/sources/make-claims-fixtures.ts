// Writes the synthetic PR history used by claims.test.ts into test/fixtures/http/ (the catalog repository has no
// PRs yet, so these responses cannot be recorded). Run: node test/sources/make-claims-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureFile } from '../../lib/sources/http.ts'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'http')
const API = 'https://api.github.com'
const REPO = 'wojciechszyjka/modules'

export const SHAS = {
  seed: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', // curator seeds the entry (PR 1)
  ownerEdit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2', // repository owner edits it (PR 7)
  memberEdit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3', // public member of the owning org (PR 9)
  strangerEdit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa4', // someone else (PR 11)
  openPr: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5', // commit only in an unmerged PR (PR 12)
} as const

function pr(number: number, login: string, mergedAt: string | null) {
  return { number, user: { login }, merged_at: mergedAt, base: { ref: 'main' } }
}

const RESPONSES: [string, number, unknown][] = [
  [`${API}/repos/${REPO}/commits/${SHAS.seed}/pulls`, 200, [pr(1, 'wojciechszyjka', '2026-10-24T08:00:00Z')]],
  [`${API}/repos/${REPO}/commits/${SHAS.ownerEdit}/pulls`, 200, [pr(7, 'pkarw', '2026-10-30T10:00:00Z')]],
  [`${API}/repos/${REPO}/commits/${SHAS.memberEdit}/pulls`, 200, [pr(9, 'lbajsarowicz', '2026-11-02T09:30:00Z')]],
  [`${API}/repos/${REPO}/commits/${SHAS.strangerEdit}/pulls`, 200, [pr(11, 'someone-else', '2026-11-03T12:00:00Z')]],
  [`${API}/repos/${REPO}/commits/${SHAS.openPr}/pulls`, 200, [pr(12, 'pkarw', null)]],
  [`${API}/orgs/FastWhiteCat/public_members/lbajsarowicz`, 204, null],
  [`${API}/orgs/FastWhiteCat/public_members/someone-else`, 404, null],
]

if (import.meta.main) {
  for (const [url, status, json] of RESPONSES) {
    const file = join(DIR, fixtureFile('GET', url))
    mkdirSync(dirname(file), { recursive: true })
    const response = json === null ? { status, text: '' } : { status, json }
    writeFileSync(file, `${JSON.stringify({ request: { method: 'GET', url, synthetic: true }, response }, null, 2)}\n`)
  }
}
