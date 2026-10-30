// The agent prompt of the Install card (live review of 30 Oct, item 3). Three faults on the live site: the prompt of a
// version no line verified said `verified this version on: no line yet. If this app is on another line, stop`, so an
// agent that ran it word for word always stopped; events and checkout, which every new app already registers, got an
// install prompt; storage-s3, verified with an allow policy, got none, because the page offered the prompt only with a
// command and its command depends on the app's preset (the prompt sends the agent to the plan instead).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { promptOffered, promptParts, renderPrompt, type PromptParts } from '../../lib/core/prompt.ts'
import type { IndexEntry } from '../../lib/schema/published/modules.ts'
import { corpusEntries, ROOT, SITE } from './helpers.ts'

const parts = (over: Partial<PromptParts> = {}): PromptParts => ({
  name: '@acme/visits',
  version: '1.0.0',
  verifiedOn: [],
  presetOn: [],
  card: null,
  command: 'yarn mercato module add @acme/visits@1.0.0 --allow-third-party',
  acl: [],
  settings: [],
  hosts: [],
  moduleId: 'visits',
  ...over,
})
const S3 = 'npm:@open-mercato/storage-s3'
const s3 = (): IndexEntry => {
  const e = corpusEntries().find((x) => x.locator === S3)!
  return { ...e, listed: true, compat: { ...e.compat, inPresets: [], verifiedOn: ['0.9'] } }
}

describe('the line check of the prompt', () => {
  it('a version no line verified: says so and never tells the agent to stop on every line', () => {
    const p = renderPrompt(parts())
    expect(p).toContain(
      '1. Check @open-mercato/core in package.json and tell me which line this app is on. The catalog has not verified this version on any line yet.',
    )
    expect(p).not.toContain('no line yet')
    expect(p).not.toMatch(/another line, stop/)
  })

  it('a verified version keeps the stop on the other lines', () => {
    const p = renderPrompt(parts({ verifiedOn: ['0.9', 'next'] }))
    expect(p).toContain(
      'Check @open-mercato/core in package.json. The catalog verified this version on: 0.9, next. If this app is on another line, stop and tell me.',
    )
  })

  it('without a command the agent runs the commands of the plan after the yes', () => {
    const p = renderPrompt(parts({ command: null }))
    expect(p).toContain('After my yes run the commands of the install plan.')
    expect(p).not.toContain('After my yes run:')
  })
})

describe('where the Install card offers the prompt', () => {
  const e = (over: Partial<IndexEntry> = {}) =>
    ({ kind: 'module', npm: '@acme/visits', moduleIds: ['visits'], compat: { inPresets: [] }, ...over }) as Pick<
      IndexEntry,
      'kind' | 'npm' | 'moduleIds' | 'compat'
    >

  it('a module with a command', () => {
    expect(promptOffered(e(), parts(), '0.9', false)).toBe(true)
  })

  it('never on a line whose new app already registers it (events, checkout: nothing to install)', () => {
    const inApps = e({ compat: { inPresets: ['0.8', '0.9', 'next'] } as IndexEntry['compat'] })
    for (const line of ['0.8', '0.9', 'next']) expect(promptOffered(inApps, parts(), line, false)).toBe(false)
    // a line whose new app does not have it keeps the prompt (telemetry on 0.8)
    const later = e({ compat: { inPresets: ['0.9', 'next'] } as IndexEntry['compat'] })
    expect(promptOffered(later, parts(), '0.8', false)).toBe(true)
  })

  it('never where the policy refuses or only a preview build exists, and never for a tool', () => {
    expect(promptOffered(e(), parts(), '0.9', true)).toBe(false)
    expect(promptOffered(e({ kind: 'tool' }), parts(), '0.9', false)).toBe(false)
  })

  it('never without a command, unless the plan gives it', () => {
    expect(promptOffered(e(), parts({ command: null }), '0.9', false)).toBe(false)
  })

  it('storage-s3: the prompt sends the agent to the plan, so the card offers it', () => {
    const entry = s3()
    const p = promptParts(entry, { site: SITE, line: '0.9' })
    expect(p.command).toBeNull()
    expect(promptOffered(entry, p, '0.9', false)).toBe(true)
    const text = renderPrompt(p)
    expect(text).toContain('After my yes run the commands of the install plan.')
    expect(text).not.toContain('module add')
  })

  it('the module page asks promptOffered, with the refused and preview-only lines hidden', () => {
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'm', '[...path].astro'), 'utf8')
    expect(page).toContain('prompt: promptOffered(entry, parts, l.key, refused || previewOnly) ? parts : null,')
  })
})
