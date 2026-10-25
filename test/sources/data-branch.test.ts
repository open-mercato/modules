import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseCliArgs, writeDataBranch } from '../../lib/sources/data-branch.ts'
import { tempDir } from './helpers.ts'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((c) => c()))
const author = { name: 'Test Bot', email: 'bot@example.org' }

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim()
}

/** A bare "origin" with a data branch and two independent clones (two jobs on two runners). */
function setup(withBranch = true) {
  const t = tempDir('data')
  cleanups.push(t.cleanup)
  const origin = join(t.dir, 'origin.git')
  execFileSync('git', ['init', '--quiet', '--bare', origin])
  const clone = (name: string) => {
    const d = join(t.dir, name)
    execFileSync('git', ['clone', '--quiet', origin, d], { stdio: 'ignore' })
    return d
  }
  if (withBranch) {
    const seed = clone('seed')
    git(seed, 'checkout', '--quiet', '--orphan', 'data')
    mkdirSync(join(seed, 'health'), { recursive: true })
    writeFileSync(join(seed, 'lines.json'), '{}\n')
    git(seed, 'add', '-A')
    git(seed, '-c', 'user.name=x', '-c', 'user.email=x@example.org', 'commit', '--quiet', '-m', 'seed')
    git(seed, 'push', '--quiet', 'origin', 'data')
  }
  return { origin, a: clone('a'), b: clone('b'), read: clone }
}

function barrier(n: number) {
  let waiting = 0
  let release: () => void = () => {}
  const p = new Promise<void>((r) => (release = r))
  return () => {
    waiting++
    if (waiting >= n) release()
    return p
  }
}

describe('data-branch.ts (spec 5.1)', () => {
  it('two parallel writes to health/** both end on the branch (the loser replays on the new head)', async () => {
    const { a, b, read } = setup()
    const wait = barrier(2)
    const calls = { a: 0, b: 0 }
    const writer = (name: 'a' | 'b') => async (dir: string) => {
      calls[name]++
      // first attempt: both jobs start from the same head, so one push is rejected
      if (calls[name] === 1) await wait()
      mkdirSync(join(dir, 'health'), { recursive: true })
      writeFileSync(join(dir, 'health', `${name}.json`), `{"by":"${name}"}\n`)
      mkdirSync(join(dir, 'changes'), { recursive: true })
      appendFileSync(join(dir, 'changes', '2026-10.jsonl'), `{"by":"${name}"}\n`)
    }
    const [ra, rb] = await Promise.all([
      writeDataBranch({ dir: a, message: 'chore(data): a', author }, writer('a')),
      writeDataBranch({ dir: b, message: 'chore(data): b', author }, writer('b')),
    ])
    expect(ra.committed && rb.committed).toBe(true)
    expect(ra.attempts + rb.attempts).toBe(3)
    const check = read('check')
    git(check, 'checkout', '--quiet', 'data')
    expect(existsSync(join(check, 'health', 'a.json')) && existsSync(join(check, 'health', 'b.json'))).toBe(true)
    // the replayed write starts from the fresh branch: both lines, no conflict, linear history
    expect(git(check, 'show', 'HEAD:changes/2026-10.jsonl').split('\n').sort()).toEqual(['{"by":"a"}', '{"by":"b"}'])
    expect(git(check, 'log', '--format=%s').split('\n')).toHaveLength(3)
    expect(git(check, 'rev-list', '--merges', 'HEAD')).toBe('')
  })

  it('creates the orphan branch on the first write and commits nothing when nothing changed', async () => {
    const { a, read } = setup(false)
    const first = await writeDataBranch({ dir: a, message: 'chore(data): first', author }, (dir) =>
      writeFileSync(join(dir, 'stats.json'), '{}\n'),
    )
    expect(first.committed).toBe(true)
    const again = await writeDataBranch({ dir: a, message: 'chore(data): again', author }, (dir) =>
      writeFileSync(join(dir, 'stats.json'), '{}\n'),
    )
    expect(again).toEqual({ committed: false, attempts: 1, sha: null })
    const check = read('check2')
    git(check, 'checkout', '--quiet', 'data')
    expect(git(check, 'log', '--format=%s')).toBe('chore(data): first')
  })

  it('gives up after the configured attempts', async () => {
    const { a } = setup()
    git(a, 'remote', 'set-url', '--push', 'origin', '/nonexistent/repo.git')
    await expect(
      writeDataBranch({ dir: a, message: 'x', author, attempts: 2 }, (dir) =>
        writeFileSync(join(dir, 'x.json'), '1\n'),
      ),
    ).rejects.toThrow(/after 2 attempts/)
  })

  it('parses the CLI', () => {
    expect(parseCliArgs(['--dir', '.data', '-m', 'chore(data): watch', '--', 'yarn', 'om', 'watch'])).toMatchObject({
      dir: '.data',
      message: 'chore(data): watch',
      attempts: 3,
      command: ['yarn', 'om', 'watch'],
    })
    expect(() => parseCliArgs(['--dir', '.data', '--', 'x'])).toThrow(/message/)
    expect(() => parseCliArgs(['-m', 'x'])).toThrow(/command/)
  })
})
