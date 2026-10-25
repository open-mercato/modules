import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../../lib/cli.ts'
import { MODULES, POLICY, ROOT, tempDir } from './helpers.ts'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((c) => c())
  vi.restoreAllMocks()
  delete process.env.OM_NOW
})
beforeEach(() => {
  process.env.OM_NOW = '2026-10-23T04:17:00Z'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('yarn om sync | discover | watch --offline (lib/commands)', () => {
  it('run end to end on the recordings with exit code 0', async () => {
    const t = tempDir('cmd')
    cleanups.push(t.cleanup)
    const common = ['--offline', '--modules', MODULES, '--data', join(t.dir, 'data'), '--out', join(t.dir, 'out')]
    expect(await main(['sync', ...common, '--policy', POLICY])).toBe(0)
    expect(await main(['watch', ...common])).toBe(0)
    expect(await main(['discover', ...common, '--policy', POLICY])).toBe(0)
    for (const f of [
      'data/claims.json',
      'data/stats.json',
      'data/official-coverage.json',
      'data/lines.json',
      'out/queue.json',
      'out/discover.md',
      'out/sync-report.json',
    ])
      expect(existsSync(join(t.dir, f))).toBe(true)
    expect(readFileSync(join(t.dir, 'out/discover.md'), 'utf8')).toContain('@freighttech/terminal-tracking')
  })

  it('a single locator syncs only that entry; unknown flags are environment errors', async () => {
    const t = tempDir('cmd1')
    cleanups.push(t.cleanup)
    const common = [
      '--offline',
      '--modules',
      MODULES,
      '--policy',
      POLICY,
      '--data',
      join(t.dir, 'data'),
      '--out',
      join(t.dir, 'out'),
    ]
    expect(await main(['sync', ...common, 'npm:@open-mercato/gateway-stripe'])).toBe(0)
    expect(existsSync(join(t.dir, 'data/sync/@open-mercato/gateway-stripe.json'))).toBe(true)
    expect(existsSync(join(t.dir, 'data/sync/@open-mercato/gateway-tpay.json'))).toBe(false)
    expect(await main(['sync', ...common, '--bogus'])).toBe(2)
  })

  it('data-branch.ts CLI commits what the command writes', () => {
    const t = tempDir('cli')
    cleanups.push(t.cleanup)
    const origin = join(t.dir, 'o.git')
    execFileSync('git', ['init', '--quiet', '--bare', origin])
    const dir = join(t.dir, 'data')
    execFileSync('git', ['clone', '--quiet', origin, dir], { stdio: 'ignore' })
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'Bot'])
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'bot@example.org'])
    const script = `require('fs').writeFileSync(${JSON.stringify(join(dir, 'lines.json'))}, '{}\\n')`
    execFileSync(
      process.execPath,
      [
        join(ROOT, 'lib/sources/data-branch.ts'),
        '--dir',
        dir,
        '-m',
        'chore(data): test',
        '--',
        process.execPath,
        '-e',
        script,
      ],
      { stdio: 'ignore' },
    )
    expect(execFileSync('git', ['--git-dir', origin, 'log', 'data', '--format=%s'], { encoding: 'utf8' }).trim()).toBe(
      'chore(data): test',
    )
  })
})
