// The roles seed of Q9 (spec Step 2.3) without a server: the account list of cms/.env.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAccounts } from '../../src/bootstrap/admins.ts'

const FOUR =
  'Ada Owner <ada@example.com>, Ben Infra <ben@example.com>, Cleo Editor <cleo@example.com>, Dan Editor <dan@example.com>'

test('reads four personal accounts, addresses in lower case', () => {
  const a = parseAccounts(FOUR.replace('ada@', 'Ada@'))
  assert.equal(a.length, 4)
  assert.deepEqual(a[0], { firstname: 'Ada', lastname: 'Owner', email: 'ada@example.com' })
})

test('refuses a repeated address, in any case', () => {
  assert.throws(() => parseAccounts(`${FOUR}, Ada Again <ADA@example.com>`), /ada@example\.com is listed twice/)
})

test('refuses a role address such as admin@ or marketing@', () => {
  for (const local of ['admin', 'marketing', 'info', 'noreply'])
    assert.throws(() => parseAccounts(`Team Box <${local}@example.com>`), /is a role address/, local)
})

test('refuses an entry without a name and an address', () => {
  assert.throws(() => parseAccounts('ada@example.com'), /is not "First Last <address>"/)
  assert.throws(() => parseAccounts('Ada <not-an-address>'), /is not "First Last <address>"/)
})

test('an empty list seeds nothing', () => {
  assert.deepEqual(parseAccounts(undefined), [])
  assert.deepEqual(parseAccounts('  '), [])
})
