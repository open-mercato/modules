import { describe, expect, it, vi } from 'vitest'
import { COMMANDS, commandFile, main, parseCommon, usage } from '../../lib/cli.ts'

describe('lib/cli.ts (spec 5.4)', () => {
  it('lists every command of the spec and marks the ones not built yet', () => {
    expect(COMMANDS.map((c) => c.name)).toEqual([
      'seed',
      'validate',
      'format',
      'describe-local',
      'triage',
      'sync',
      'discover',
      'watch',
      'scan',
      'fit',
      'radar',
      'health',
      'hive',
      'plan-matrix',
      'collect',
      'cells-local',
      'emit',
      'plugin-sync',
      'check-text',
    ])
    const text = usage()
    for (const c of COMMANDS) expect(text).toContain(c.name)
    expect(commandFile('check-text')).not.toBeNull()
    expect(commandFile('cells-local')).not.toBeNull()
    expect(text).not.toContain(
      'cells-local  preview: run matrix cells in Docker (local or ssh host) for collect --local (not built',
    )
  })

  it('refuses names that could escape lib/commands', () => {
    for (const n of ['../cli', 'a/b', 'Check-Text', '', '.hidden']) expect(commandFile(n)).toBeNull()
  })

  it('parses the common flags', () => {
    expect(parseCommon(['--data', 'd', '--out=o', '--offline', '--json', 'x', '--changed=origin/main'])).toEqual({
      flags: { data: 'd', out: 'o', offline: true, json: true },
      rest: ['x', '--changed=origin/main'],
    })
    expect(parseCommon([]).flags).toEqual({ data: '.data', out: 'out', offline: false, json: false })
    expect(() => parseCommon(['--data'])).toThrow()
  })

  it('prints the list with exit 0, and exit 2 for missing or unknown commands', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await main([])).toBe(0)
    expect(log.mock.calls.flat().join('\n')).toContain('Commands:')
    expect(await main(['nope'])).toBe(2)
    expect(err.mock.calls.flat().join('\n')).toContain('unknown command "nope"')
    log.mockRestore()
    err.mockRestore()
  })

  it('loads lib/commands/<cmd>.ts dynamically', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await main(['check-text', '--json', 'README.md'])).toBe(0)
    expect(JSON.parse(log.mock.calls.flat().join(''))).toEqual({ files: 1, hits: [] })
    log.mockRestore()
    err.mockRestore()
  })
})
