// The footer build stamp (finding of 25 Oct): a preview link served a build about 40 commits behind main and nothing
// on the page said which build it was. `emit` records the catalog commit in site.json; the footer prints it.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildStamp } from '../../lib/commands/emit.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import { fixtureData, OPTS, tmp } from './helpers.ts'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function repo(): string {
  const dir = tmp('om-stamp-')
  git(dir, 'init', '--quiet', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'a\n')
  git(dir, 'add', '-A')
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '-m', 'init')
  return dir
}

describe('buildStamp', () => {
  it('takes GITHUB_SHA on Actions, shortened', () => {
    expect(buildStamp(tmp(), { GITHUB_SHA: '553917cafd3de9e05d9e7d7d6aadd9a5585592f6' })).toEqual({
      commit: '553917c',
      dirty: false,
    })
  })

  it('reads HEAD of the repository otherwise, and says when tracked files differ from it', () => {
    const dir = repo()
    const head = git(dir, 'rev-parse', '--short=7', 'HEAD')
    expect(buildStamp(dir, {})).toEqual({ commit: head, dirty: false })
    // an untracked file (dist/, .generated/) is not a change of the build's source
    writeFileSync(join(dir, 'b.txt'), 'b\n')
    expect(buildStamp(dir, {}).dirty).toBe(false)
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    expect(buildStamp(dir, {})).toEqual({ commit: head, dirty: true })
  })

  it('has no commit outside git and ignores a GITHUB_SHA that is not one', () => {
    expect(buildStamp(tmp(), { GITHUB_SHA: 'main; rm -rf /' })).toEqual({ commit: null, dirty: false })
  })
})

describe('site.json', () => {
  it('carries the stamp it was given, and none without one', () => {
    const data = fixtureData()
    const stamped = buildEmit(data, { ...OPTS, build: { commit: 'abc1234', dirty: false } })
    expect(JSON.parse(stamped.site.get('site.json') as string).build).toEqual({ commit: 'abc1234', dirty: false })
    expect(stamped.meta.build).toEqual({ commit: 'abc1234', dirty: false })
    const plain = buildEmit(data, OPTS)
    expect(JSON.parse(plain.site.get('site.json') as string)).not.toHaveProperty('build')
  })
})
