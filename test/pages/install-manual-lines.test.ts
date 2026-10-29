// Round 1 leftover of the audit of 29 Oct (R3, corrected fix point 6): the command of every version follows its plan,
// but the edit by hand of a plan (data-sync-durable: remove data_sync from src/modules.ts) stood only on the main
// card. The install box shows it on every line, and `Other Open Mercato versions` on every other version, as a step of
// its own before the command, never joined into it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { h } from 'preact'
import { render } from 'preact-render-to-string'
import { describe, expect, test } from 'vitest'
import InstallBox, { type InstallLine } from '../../site/src/islands/InstallBox.tsx'
import { ROOT } from '../core/helpers.ts'

const STEP = "In src/modules.ts, remove { id: 'data_sync', from: '@open-mercato/core' }."
const CMD = 'yarn mercato module add @fullstackhouse/open-mercato-data-sync-durable@0.6.0 --allow-third-party'
const line = (key: string, o: Partial<InstallLine> = {}): InstallLine => ({
  key,
  label: key,
  status: 'verified',
  command: CMD,
  anyway: null,
  note: null,
  policy: { decision: 'ask', reasons: [] },
  quarantine: null,
  prompt: null,
  cmm: null,
  cloud: null,
  manual: [STEP],
  ...o,
})
const plain = (s: string): string =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#64;/g, '@')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

describe('the edit by hand of a plan, on every version (R3 point 6)', () => {
  test('the install box shows it before the command of the chosen line', () => {
    const out = plain(
      render(
        h(InstallBox, {
          lines: [line('0.9'), line('0.8')],
          initial: '0.8',
          warning: null,
          cloudUrl: 'https://example.com',
          blocked: null,
        }),
      ),
    )
    expect(out).toContain(STEP)
    expect(out.indexOf(STEP)).toBeLessThan(out.indexOf(CMD))
  })

  test('a refused line keeps it with the command behind the disclosure', () => {
    const out = plain(
      render(
        h(InstallBox, {
          lines: [line('0.9', { command: null, anyway: CMD, policy: { decision: 'refuse', reasons: [] } })],
          initial: '0.9',
          warning: null,
          cloudUrl: 'https://example.com',
          blocked: null,
        }),
      ),
    )
    expect(out.indexOf(STEP)).toBeGreaterThan(-1)
    expect(out.indexOf(STEP)).toBeLessThan(out.lastIndexOf(CMD))
  })

  test('a line without one shows none', () => {
    const out = plain(
      render(
        h(InstallBox, {
          lines: [line('0.9', { manual: [] })],
          initial: '0.9',
          warning: null,
          cloudUrl: 'https://example.com',
          blocked: null,
        }),
      ),
    )
    expect(out).not.toContain('remove {')
  })

  test('the page passes the steps of each line to the box and to Other Open Mercato versions', () => {
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'm', '[...path].astro'), 'utf8')
    expect(page).toContain('manual: steps ? steps.manual.map(manualStepText) : []')
    expect(page).toContain('const manual = il?.manual ?? []')
    const card = readFileSync(join(ROOT, 'site', 'src', 'components', 'module', 'InstallCard.astro'), 'utf8')
    expect(card).toMatch(/o\.manual\.map\(/)
  })
})
