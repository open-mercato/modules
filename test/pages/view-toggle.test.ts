// Finding of 25 Oct (WEB-008): the Agent view labelled /m/<path>.json `get_module JSON` and said author text inside
// it is marked untrusted. It is the static detail document (no `entry`, `card` or `untrusted` of GetModuleOutput), and
// its README excerpt is raw author text. Only the card claims the marking now.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GetModuleOutput } from '../../lib/schema/tools.ts'
import { AGENT_FORMATS } from '../../site/src/islands/ViewToggle.tsx'
import { fixtureEmit, json } from '../emit/helpers.ts'

const ROOT = join(import.meta.dirname, '..', '..')

describe('Agent view formats', () => {
  it('the JSON tab is named for what it fetches, and does not claim the untrusted marking', () => {
    expect(`${AGENT_FORMATS.json.label} ${AGENT_FORMATS.json.ext}`).toBe('Detail JSON')
    expect(AGENT_FORMATS.json.aria).not.toContain('get_module')
    expect(AGENT_FORMATS.json.note).not.toMatch(/is marked untrusted/)
    expect(AGENT_FORMATS.json.copy).not.toMatch(/agent/i)
    expect(AGENT_FORMATS.md.note).toMatch(/marked untrusted/)
  })

  it('the detail document is not a get_module response, so the tab must not say it is', () => {
    const out = fixtureEmit()
    const doc = json<Record<string, unknown>>(out, 'm/@fastwhitecat/integration-ksef-direct.json')
    expect(GetModuleOutput.safeParse(doc).success).toBe(false)
  })

  it('the island renders the labels from AGENT_FORMATS', () => {
    const src = readFileSync(join(ROOT, 'site', 'src', 'islands', 'ViewToggle.tsx'), 'utf8')
    expect(src).not.toContain('get_module <code>')
    expect(src).toContain('{AGENT_FORMATS[tab].note}')
  })
})
