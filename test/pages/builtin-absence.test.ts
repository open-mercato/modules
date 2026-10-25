// Finding of 25 Oct (WEB-003): every built-in page said `Not present: credentials, hosts`, but module-facts.v2.json
// never carries credentials, env names or hosts (lib/rentgen/builtin.ts maps none). Those are `Not read`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { builtInAbsence } from '../../site/src/lib/builtin-absence.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const sec = (id: string, n = 0) => ({ id, title: id[0]!.toUpperCase() + id.slice(1), items: Array.from({ length: n }) })

describe('builtInAbsence', () => {
  it('an empty Config or Network is not read, never not present; API says why on its own', () => {
    const r = builtInAbsence([
      sec('data', 2),
      sec('api'),
      sec('security'),
      sec('events'),
      sec('ui', 1),
      sec('background'),
      sec('ai'),
      sec('config'),
      sec('network'),
    ])
    expect(r.absent).toBe('permissions, events, background jobs, AI tools')
    expect(r.absent).not.toMatch(/hosts|credentials|routes/)
    expect(r.unread).toBe('credentials and env, hosts')
  })

  it('a section with facts is neither', () => {
    const r = builtInAbsence([sec('data', 1), sec('config', 1), sec('network', 1)])
    expect(r).toEqual({ absent: '', unread: '' })
  })

  it('the built-in page renders both lines from it', () => {
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'built-in', '[id].astro'), 'utf8')
    expect(page).toContain('builtInAbsence(sections)')
    expect(page).toContain('Not read: {unreadText}')
    expect(page).not.toMatch(/config: 'credentials'/)
  })
})
