// Contracts of nightly.yml and collect.yml (spec 5.1, 5.3, 12.2 WP07).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { Step } from '../../lib/schema/common.ts'
import { retryDispatchInputs } from '../../lib/receipts/gather.ts'
import { cellJobName, parseCellJobName } from '../../lib/receipts/matrix.ts'
import { parseRunTitle, runTitle } from '../../lib/receipts/from-actions.ts'
import { ROOT } from './helpers.ts'

type Wf = {
  name: string
  'run-name'?: string
  on: Record<string, { inputs?: Record<string, { type?: string; default?: unknown }> } | null>
  permissions: Record<string, string>
  defaults: { run: { shell: string } }
  concurrency?: { group: string; 'cancel-in-progress': boolean }
  jobs: Record<
    string,
    {
      name?: string
      steps: {
        id?: string
        name?: string
        run?: string
        uses?: string
        if?: string
        with?: Record<string, unknown>
        'timeout-minutes'?: number
      }[]
      strategy?: { 'max-parallel': number; 'fail-fast': boolean }
      'timeout-minutes': number
      services?: Record<string, { image: string }>
      env?: Record<string, string>
    }
  >
}
const read = (f: string) => readFileSync(join(ROOT, '.github', 'workflows', f), 'utf8')
const nightly = parse(read('nightly.yml')) as Wf
const collect = parse(read('collect.yml')) as Wf

describe('nightly.yml', () => {
  const cell = nightly.jobs.cell!
  const ladder = Step.options as readonly string[]

  it('has one GitHub step per ladder step with id and name equal to the Step enum, in order', () => {
    const named = cell.steps.filter((s) => s.name && ladder.includes(s.name))
    expect(named.map((s) => s.name)).toEqual([...ladder])
    for (const s of named) expect(s.id).toBe(s.name)
    // No other step may carry a ladder name.
    expect(cell.steps.filter((s) => s.name && ladder.includes(s.name)).length).toBe(ladder.length)
  })

  it('every ladder step calls /opt/harness/steps.sh with its own name and a cancel-aware condition', () => {
    for (const name of ladder) {
      const s = cell.steps.find((x) => x.name === name)!
      expect(s.run?.trim()).toMatch(new RegExp(`^/opt/harness/steps\\.sh ${name} /home/om-cell(/app)?$`))
      expect(s.if).toContain('!cancelled()')
      expect(s).not.toHaveProperty('continue-on-error')
    }
    expect(cell.steps.find((s) => s.name === 'initialize')!.if).toContain("steps.generate.outcome == 'success'")
    expect(cell.steps.find((s) => s.name === 'add')!.if).toContain('!matrix.cell.baseline')
  })

  it('steps.sh ends every step before GitHub does, and the preview backstop equals timeout-minutes (review round 2)', () => {
    const steps = readFileSync(join(ROOT, 'harness', 'steps.sh'), 'utf8')
    const table = /step_secs\(\) \{\n  case "\$1" in\n([\s\S]*?)\n  esac/.exec(steps)![1]!
    const secs = new Map<string, number>()
    for (const m of table.matchAll(/^\s*([a-z| ]+)\) echo (\d+) ;;$/gm))
      for (const n of m[1]!.split('|')) secs.set(n.trim(), Number(m[2]))
    const runCell = readFileSync(join(ROOT, 'harness', 'local', 'run-cell.sh'), 'utf8')
    for (const name of [
      'prepare',
      'scaffold',
      'patch',
      'env',
      'install',
      'add',
      'generate',
      'typecheck',
      'initialize',
      'build',
      'start',
      'smoke',
      'pack',
    ]) {
      const gh = cell.steps.find((x) => x.name === name)!['timeout-minutes']! * 60
      expect(secs.get(name), name).toBe(gh - 20)
      const backstop = new RegExp(`run_step ${name} (\\d+) `).exec(runCell)
      expect(Number(backstop?.[1]), name).toBe(gh)
    }
    expect(secs.get('build')!).toBeGreaterThan(900) // the inner `timeout 900 yarn build` ends first
  })

  it('runs with read-only contents, no secrets, no cache, bash with pipefail, 6 cells at a time, 40 minutes', () => {
    const text = read('nightly.yml')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n')
    expect(nightly.permissions).toEqual({ contents: 'read' })
    expect(nightly.defaults.run.shell).toBe('bash')
    expect(text).not.toMatch(/secrets\./)
    expect(text).not.toMatch(/actions\/cache/)
    expect(cell.strategy).toMatchObject({ 'max-parallel': 6, 'fail-fast': false })
    expect(cell['timeout-minutes']).toBe(40)
    expect(cell.services!.postgres!.image).toBe(
      'pgvector/pgvector@sha256:724a4041afdb1750446e3f6b5cfa8f3b0ac5a2cf538ddfa6bfee4f94c2fa85c6',
    )
  })

  it('the job name is the one collect parses back', () => {
    expect(cell.name).toBe('cell ${{ matrix.cell.key12 }} ${{ matrix.cell.line }}')
    const n = cellJobName({ key12: 'abcdef012345', line: 'next' })
    expect(parseCellJobName(n)).toEqual({ key12: 'abcdef012345', line: 'next' })
  })

  it('the run name encodes attempt and parent for collect', () => {
    expect(nightly['run-name']).toContain('nightly a${{ inputs.attempt || 1 }}')
    expect(parseRunTitle(runTitle(2, 123))).toEqual({ attempt: 2, parent: 123 })
    expect(parseRunTitle('nightly a1')).toEqual({ attempt: 1, parent: null })
  })

  it('collect dispatch fields are a subset of on.workflow_dispatch.inputs; attempt is a number input with default 1', () => {
    const inputs = nightly.on.workflow_dispatch!.inputs!
    for (const k of Object.keys(retryDispatchInputs(['a'.repeat(64)], 1))) expect(Object.keys(inputs)).toContain(k)
    expect(inputs.attempt).toMatchObject({ type: 'number', default: 1 })
    expect(Object.keys(inputs)).toEqual(expect.arrayContaining(['cells', 'mode', 'attempt', 'parent']))
  })

  it('cron at minute 17', () => {
    expect(read('nightly.yml')).toContain('cron: "17 2 * * *"')
  })

  // A second `git fetch origin data` had no credentials, so in the private repository the plan ran on an empty .data
  // and stopped on the missing lines.json (finding of 25 Oct). The checkout action has the token and fails by name.
  it('the plan reads the data branch through the checkout action, with no fetch and no empty fallback', () => {
    const plan = nightly.jobs.plan!
    const data = plan.steps.find((s) => s.name === 'Data checkout (read only)')
    expect(data?.uses).toMatch(/^actions\/checkout@[0-9a-f]{40}$/)
    expect(data?.with).toEqual({ ref: 'data', path: '.data', 'persist-credentials': false })
    expect(plan.steps.indexOf(data!)).toBeLessThan(plan.steps.findIndex((s) => s.id === 'plan'))
    const runs = plan.steps.map((s) => s.run ?? '').join('\n')
    expect(runs).not.toMatch(/git fetch/)
    expect(runs).not.toMatch(/mkdir -p \.data/)
  })
})

describe('collect.yml', () => {
  it('runs after nightly on main only, in its own concurrency group, with write access to contents and actions', () => {
    expect(Object.keys(collect.on)).toEqual(['workflow_run', 'workflow_dispatch'])
    expect(collect.permissions).toEqual({ contents: 'write', actions: 'write' })
    expect(collect.concurrency).toEqual({ group: 'collect', 'cancel-in-progress': false })
    const job = collect.jobs.collect!
    expect(job['timeout-minutes']).toBe(60)
    const text = read('collect.yml')
    expect(text).toContain("github.event.workflow_run.head_branch == 'main'")
    expect(text).toContain('yarn om collect --run "$RUN_ID" --wait-retry --no-apply')
    expect(text).toContain('node lib/sources/data-branch.ts --dir .data')
    expect(text).toContain('yarn om collect --bundle out/night.json')
  })

  it('reads the data branch the checkout has, never a fetch without credentials or the tree of main', () => {
    const job = collect.jobs.collect!
    expect(job.steps.find((s) => s.uses?.startsWith('actions/checkout@'))?.with?.['fetch-depth']).toBe(0)
    const data = job.steps.find((s) => s.name === 'Data checkout')?.run ?? ''
    expect(data).toContain('git rev-parse --verify -q refs/remotes/origin/data')
    expect(data).not.toMatch(/git fetch/)
    expect(data).not.toMatch(/worktree add --detach \.data HEAD/)
  })
})

describe('both workflows', () => {
  it('pin every action to a SHA, use bash, keep checkout credentials off, no pull_request_target', () => {
    for (const f of ['nightly.yml', 'collect.yml']) {
      const text = read(f)
      const wf = parse(text) as Wf
      expect(wf.defaults.run.shell).toBe('bash')
      expect(text).not.toContain('pull_request_target')
      for (const job of Object.values(wf.jobs))
        for (const s of job.steps) {
          if (!s.uses) continue
          expect(s.uses).toMatch(/@[0-9a-f]{40}$/)
          if (s.uses.startsWith('actions/checkout@')) expect(s.with?.['persist-credentials']).toBe(false)
        }
    }
  })
})
