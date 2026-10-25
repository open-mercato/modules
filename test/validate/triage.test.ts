// `yarn om triage` on recorded gh answers (spec 12.2 WP10, D29): one line per open new-entry PR with a verdict,
// the checks of validate.yml (validate, checks, build) and flags; only ready PRs are merged, each pinned to the triaged head commit, and nothing is
// merged without confirmation.
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { main } from '../../lib/cli.ts'
import { loadCatalog, type Catalog } from '../../lib/validate/catalog.ts'
import { replayGh, type GhRecording } from '../../lib/validate/gh.ts'
import { ciState, mergeReady, renderLines, triage } from '../../lib/validate/triage.ts'
import { ROOT } from './helpers.ts'

const SESSION = join(ROOT, 'test', 'validate', 'fixtures', 'gh', 'session.json')
const REPO = 'open-mercato/modules'
let catalog: Catalog
beforeAll(async () => {
  catalog = await loadCatalog(ROOT, null)
})

describe('triage', () => {
  it('gives one verdict per PR from the validate.yml checks and the offline steps', async () => {
    const lines = await triage(replayGh(SESSION), REPO, catalog)
    expect(lines.map((l) => [l.number, l.verdict, l.ci, l.locators.join(','), l.flags.join(',')])).toEqual([
      [101, 'ready', 'pass', 'npm:@acme-labs/om-loyalty', 'fork,new'],
      [102, 'blocked', 'fail', 'modules/@acme-labs/om-crm-notes.yml', 'fork,new'],
      [103, 'blocked', 'pending', 'npm:@fastwhite-cat/integration-ksef-direct', 'fork,new'],
      [104, 'hold', 'pass', 'npm:@fastwhitecat/integration-ksef-direct', 'fork,update,curator-fields'],
      [105, 'hold', 'pass', 'npm:@acme-labs/om-bins', 'fork,other-files,new'],
      [106, 'hold', 'none', 'npm:@acme-labs/om-bins', 'fork,draft,conflict,new'],
      // validate green, checks red: not ready (finding of 25 Oct)
      [108, 'blocked', 'fail', 'npm:@acme-labs/om-returns', 'fork,new'],
    ])
    expect(lines.find((l) => l.number === 108)?.reasons).toEqual(['failed check: checks'])
    expect(lines.find((l) => l.number === 108)?.checks).toEqual({ validate: 'pass', checks: 'fail', build: 'pass' })
    expect(lines.find((l) => l.number === 102)?.reasons.at(-1)).toBe('failed checks: validate, checks')
    expect(lines.find((l) => l.number === 106)?.reasons.at(-1)).toBe(
      'checks not run: validate, checks, build (approve the workflow run of a first-time contributor)',
    )
    const r103 = lines.find((l) => l.number === 103)
    expect(r103?.reasons[0]).toBe(
      'npm:@fastwhite-cat/integration-ksef-direct: same name as npm:@fastwhitecat/integration-ksef-direct under the look-alike scope @fastwhite-cat, another owner. A curator can add the name-reviewed label',
    )
    const text = renderLines(lines)
    expect(text.split('\n')[0]).toBe('#101  ready    ci:pass     npm:@acme-labs/om-loyalty  [fork, new]')
    expect(text.split('\n').at(-1)).toBe('7 open, 1 ready to merge.')
  })

  it('uses the newest run of the validate check', () => {
    const at = (t: string, conclusion: string) => ({ name: 'validate', status: 'COMPLETED', conclusion, startedAt: t })
    expect(
      ciState({ statusCheckRollup: [at('2026-10-23T09:00:00Z', 'FAILURE'), at('2026-10-23T10:00:00Z', 'SUCCESS')] }),
    ).toBe('pass')
    expect(
      ciState({ statusCheckRollup: [at('2026-10-23T11:00:00Z', 'FAILURE'), at('2026-10-23T10:00:00Z', 'SUCCESS')] }),
    ).toBe('fail')
    expect(ciState({ statusCheckRollup: [{ name: 'validate', status: 'IN_PROGRESS', conclusion: '' }] })).toBe(
      'pending',
    )
    expect(ciState({ statusCheckRollup: [{ name: 'other', status: 'COMPLETED', conclusion: 'SUCCESS' }] })).toBe('none')
  })

  it('merges only ready PRs, squash, pinned to the head commit', async () => {
    const calls: string[][] = []
    const gh = replayGh(SESSION, calls)
    const lines = await triage(gh, REPO, catalog)
    const res = await mergeReady(gh, REPO, lines)
    expect(res).toEqual([{ number: 101, ok: true, message: '' }])
    const merges = calls.filter((c) => c[0] === 'pr' && c[1] === 'merge')
    expect(merges).toEqual([
      ['pr', 'merge', '101', '--repo', REPO, '--squash', '--match-head-commit', '0101'.repeat(10)],
    ])
  })

  it('the command lists, and merges only with --merge and a confirmation (none without a terminal)', async () => {
    const out: string[] = []
    const log = console.log
    console.log = (s: string) => out.push(String(s))
    try {
      expect(await main(['triage', '--replay', SESSION])).toBe(0)
      expect(out.join('\n')).toContain('7 open, 1 ready to merge.')
      out.length = 0
      expect(await main(['triage', '--replay', SESSION, '--merge'])).toBe(0)
      expect(out.at(-1)).toBe('Nothing merged.')
      out.length = 0
      expect(await main(['triage', '--replay', SESSION, '--merge', '--yes'])).toBe(0)
      expect(out.at(-1)).toBe('#101 merged')
      out.length = 0
      expect(await main(['triage', '--replay', SESSION, '--json'])).toBe(0)
      expect((JSON.parse(out.join('\n')) as unknown[]).length).toBe(7)
    } finally {
      console.log = log
    }
  })

  it('the recording matches the gh field shapes it claims (spot check of the session file)', async () => {
    const { readFileSync } = await import('node:fs')
    const session = JSON.parse(readFileSync(SESSION, 'utf8')) as GhRecording[]
    const list = JSON.parse(session[0]?.stdout ?? '[]') as Record<string, unknown>[]
    for (const pr of list)
      expect(Object.keys(pr).sort()).toEqual(
        [
          'author',
          'files',
          'headRefOid',
          'headRepository',
          'headRepositoryOwner',
          'isCrossRepository',
          'isDraft',
          'labels',
          'mergeable',
          'number',
          'statusCheckRollup',
          'title',
          'url',
        ].sort(),
      )
  })
})
