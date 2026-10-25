// Repo test of .github/workflows (spec 12.2 WP10, 5.1, 5.5): every `uses:` pinned to a SHA (the 3.3 table for
// known actions), every workflow with `defaults.run.shell: bash`, no `pull_request_target` or comment triggers,
// checkout without persisted credentials, named steps, and the triggers, permissions, limits and concurrency
// groups of the 5.1 table for the six WP10 workflows. GitHub cannot run them here; this is the static half of
// the proof, workflow-run.test.ts runs their shell steps.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(ROOT, '.github', 'workflows')

// Spec 3.3: action -> [sha, tag]
const PINS: Record<string, [string, string]> = {
  'actions/checkout': ['3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7.0.1'],
  'actions/setup-node': ['949feb2413d6458794dcd2491c4babbbce0c15c1', 'v7.1.0'],
  'actions/upload-artifact': ['cf430e030ddbb5b0abf93d22962f4752f3646cd9', 'v7.0.2'],
  'actions/download-artifact': ['9000827ccba6bdab643e8b6fd33ac0654aef8333', 'v8.0.2'],
  'actions/upload-pages-artifact': ['fc324d3547104276b827a68afc52ff2a11cc49c9', 'v5.0.0'],
  'actions/deploy-pages': ['368f82528645a54fb793d4d04e342629a3f51346', 'v5.0.1'],
  'danielroe/provenance-action': ['fcc45fd5a5b818c477432b32c838dcd0c79cd2dd', 'v0.2.0'],
  'autofix-ci/action': ['c5b2d67aa2274e7b5a18224e8171550871fc7e4a', 'v1.3.4'],
  'cloudflare/wrangler-action': ['953926a2e2182532811c01a25e53647d93bf07c0', 'v4.1.3'],
}

interface Step {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
  env?: Record<string, unknown>
  if?: string
  id?: string
}
interface Job {
  name?: string
  'runs-on'?: string
  'timeout-minutes'?: number
  steps: Step[]
  environment?: unknown
  if?: string
  permissions?: unknown
}
interface Workflow {
  name: string
  on: Record<string, unknown>
  permissions: Record<string, string>
  concurrency?: { group: string; 'cancel-in-progress': boolean }
  defaults?: { run?: { shell?: string } }
  jobs: Record<string, Job>
}

const files = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((f) => /\.ya?ml$/.test(f))
      .sort()
  : []
const text = (f: string) => readFileSync(join(DIR, f), 'utf8')
const wf = (f: string) => parse(text(f)) as Workflow
const steps = (w: Workflow) => Object.values(w.jobs).flatMap((j) => j.steps)
const runText = (w: Workflow) =>
  steps(w)
    .map((s) => s.run ?? '')
    .join('\n')

const WP10 = ['validate.yml', 'autofix.yml', 'provenance.yml', 'watch.yml', 'sync.yml', 'pages.yml']

describe('every workflow in .github/workflows', () => {
  it('has the six WP10 workflows', () => {
    for (const f of WP10) expect(files, f).toContain(f)
  })

  it('pins every uses: to a 40-hex SHA with a tag comment; known actions match spec 3.3', () => {
    let count = 0
    for (const f of files) {
      for (const line of text(f).split('\n')) {
        const m = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/.exec(line)
        if (!m) continue
        count++
        const ref = m[1] as string
        expect(ref, `${f}: ${line.trim()}`).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/)
        const [action, sha] = ref.split('@') as [string, string]
        const tag = /#\s*(v\d+\.\d+\.\d+)/.exec(m[2] ?? '')?.[1]
        expect(tag, `${f}: ${action} needs a # vX.Y.Z comment`).toBeDefined()
        const pin = PINS[action]
        if (pin) expect([sha, tag], `${f}: ${action}`).toEqual(pin)
      }
      // parsed form agrees with the text scan (no uses: hidden in flow syntax)
      for (const s of steps(wf(f))) if (s.uses) expect(s.uses).toMatch(/@[0-9a-f]{40}$/)
    }
    expect(count).toBeGreaterThan(10)
  })

  it('sets defaults.run.shell: bash', () => {
    for (const f of files) expect(wf(f).defaults?.run?.shell, f).toBe('bash')
  })

  it('has no pull_request_target and no comment or review triggers', () => {
    for (const f of files) {
      expect(text(f), f).not.toMatch(/pull_request_target/)
      const on = Object.keys(wf(f).on)
      for (const t of ['pull_request_target', 'issue_comment', 'pull_request_review_comment', 'pull_request_review'])
        expect(on, f).not.toContain(t)
    }
  })

  it('checks out without persisted credentials', () => {
    for (const f of files)
      for (const s of steps(wf(f)))
        if (s.uses?.startsWith('actions/checkout@')) expect(s.with?.['persist-credentials'], f).toBe(false)
  })

  it('names every step and every job runs on ubuntu-latest with a timeout', () => {
    for (const f of files) {
      const w = wf(f)
      for (const [id, job] of Object.entries(w.jobs)) {
        expect(job['runs-on'], `${f}:${id}`).toBe('ubuntu-latest')
        expect(job['timeout-minutes'], `${f}:${id}`).toBeGreaterThan(0)
        // names are what the Actions API returns per step (collect maps nightly steps by name, spec 5.1)
        for (const s of job.steps) expect(s.name, `${f}:${id}: ${s.uses ?? s.run}`).toMatch(/^[A-Za-z][\w ,.()/-]*$/)
      }
    }
  })

  it('never puts event data into a run script (script injection); it goes through env', () => {
    for (const f of files)
      for (const s of steps(wf(f)))
        expect(s.run ?? '', `${f}: ${s.name}`).not.toMatch(/\$\{\{\s*(github\.event|github\.head_ref|inputs\.)/)
  })

  it('runs crons at minute :17 (pages at 05:47, spec 5.1)', () => {
    for (const f of files) {
      const sched = (wf(f).on.schedule as { cron: string }[] | undefined) ?? []
      for (const { cron } of sched) {
        if (f === 'pages.yml') expect(cron).toBe('47 5 * * *')
        else expect(cron.split(' ')[0], `${f}: ${cron}`).toBe('17')
      }
    }
  })
})

describe('the WP10 workflows (spec 5.1 table, 5.2 steps)', () => {
  it('validate: pull_request on all paths, read only, 15 min, summary of validate --changed', () => {
    const w = wf('validate.yml')
    expect(w.on).toEqual({ pull_request: null })
    expect(w.permissions).toEqual({ contents: 'read' })
    const job = w.jobs.validate as Job
    expect(job.name).toBe('validate') // the required check of branch protection (5.6)
    // read only still: the job reads the PR's current labels (name-reviewed after a re-run), nothing is written
    expect((job as { permissions?: unknown }).permissions).toEqual({
      contents: 'read',
      issues: 'read',
      'pull-requests': 'read',
    })
    expect(job['timeout-minutes']).toBe(15)
    expect(steps(w).find((s) => s.uses?.startsWith('actions/checkout@'))?.with?.['fetch-depth']).toBe(0)
    const run = runText(w)
    expect(run).toContain('yarn om validate --changed=origin/main --summary "$GITHUB_STEP_SUMMARY"')
    expect(run).toContain('yarn check')
    expect(run).toContain('yarn test')
    expect(run).toContain('yarn install --immutable')
    expect(run).toContain('yarn om emit --data test/fixtures/data')
    // day 0: the fixture without receipts is built in every run (review r2)
    const day0 = steps(w).find((s) => s.name === 'Build site on day-0 data')
    expect(day0?.if).toBe('${{ !cancelled() }}')
    expect(day0?.run).toContain('rm -rf "$day0/receipts"')
    expect(day0?.run).toContain('yarn om emit --data "$day0"')
    expect(day0?.run).toContain('yarn astro build')
    expect(text('validate.yml')).not.toMatch(/secrets\./)
    // the summary has a job of its own (finding of 25 Oct: GitHub shows a step summary when its job ends, so check,
    // test and the builds in the same job delayed it by minutes); check, test and the builds run beside it
    const names = (k: string) => (w.jobs[k] as Job).steps.map((s) => s.name)
    expect(Object.keys(w.jobs)).toEqual(['validate', 'checks', 'build'])
    expect(names('validate').at(-1)).toBe('Validate descriptors')
    expect(names('validate')).not.toContain('Check')
    expect(names('checks')).toEqual(expect.arrayContaining(['Check', 'Test']))
    expect(names('build')).toContain('Build site on day-0 data')
    for (const k of Object.keys(w.jobs)) expect((w.jobs[k] as Job)['timeout-minutes'], k).toBe(15)
  })

  it('autofix: named autofix.ci, modules/** only, read only, 5 min, format then the autofix action', () => {
    const w = wf('autofix.yml')
    expect(w.name).toBe('autofix.ci')
    expect(w.on).toEqual({ pull_request: { paths: ['modules/**'] } })
    expect(w.permissions).toEqual({ contents: 'read' })
    expect(Object.values(w.jobs)[0]?.['timeout-minutes']).toBe(5)
    // skipped while the repository is private: the action cannot fetch without credentials (finding of 25 Oct)
    expect((Object.values(w.jobs)[0] as { if?: string }).if).toBe('${{ !github.event.repository.private }}')
    const s = steps(w)
    const runs = s.filter((x) => x.run).map((x) => x.run?.trim())
    expect(runs).toEqual(['corepack enable', 'yarn install --immutable', 'yarn om format modules'])
    expect(s.at(-1)?.uses).toMatch(/^autofix-ci\/action@/)
    expect(text('autofix.yml')).not.toMatch(/secrets\./)
  })

  it('provenance: yarn.lock on PRs and pushes to main, fails on provenance change', () => {
    const w = wf('provenance.yml')
    expect(w.on).toEqual({
      pull_request: { paths: ['yarn.lock'] },
      push: { branches: ['main'], paths: ['yarn.lock'] },
    })
    expect(w.permissions).toEqual({ contents: 'read' })
    expect(Object.values(w.jobs)[0]?.['timeout-minutes']).toBe(5)
    const p = steps(w).find((s) => s.uses?.startsWith('danielroe/provenance-action@'))
    expect(p?.with?.['fail-on-provenance-change']).toBe(true)
  })

  it('watch: cron, push of modules/policy, dispatch; own group; data-branch.ts; hive; keepalive', () => {
    const w = wf('watch.yml')
    expect(w.on).toEqual({
      schedule: [{ cron: '17 */6 * * *' }],
      push: { branches: ['main'], paths: ['modules/**', 'policy/**'] },
      workflow_dispatch: null,
    })
    expect(w.permissions).toEqual({ contents: 'write', actions: 'write' })
    expect(w.concurrency).toEqual({ group: 'watch', 'cancel-in-progress': false })
    expect(Object.values(w.jobs)[0]?.['timeout-minutes']).toBe(20)
    const run = runText(w)
    expect(run).toMatch(/node lib\/sources\/data-branch\.ts --dir \.data --message "chore\(data\): watch /)
    for (const c of [
      'yarn om watch --keepalive',
      'yarn om scan --queue',
      'yarn om scan --builtin',
      'yarn om fit',
      'yarn om radar',
      'yarn om health --changed',
      'yarn om hive',
    ])
      expect(run).toContain(c)
    expect(steps(w).find((s) => s.uses?.startsWith('actions/checkout@'))?.with).toMatchObject({
      ref: 'main',
      'fetch-depth': 0,
    })
  })

  it('sync: Monday cron and dispatch; own group; data-branch.ts; discovery issue edited in place', () => {
    const w = wf('sync.yml')
    expect(w.on).toEqual({ schedule: [{ cron: '17 4 * * 1' }], workflow_dispatch: null })
    expect(w.permissions).toEqual({ contents: 'write', issues: 'write' })
    expect(w.concurrency).toEqual({ group: 'sync', 'cancel-in-progress': false })
    expect(Object.values(w.jobs)[0]?.['timeout-minutes']).toBe(20)
    const run = runText(w)
    expect(run).toMatch(/node lib\/sources\/data-branch\.ts --dir \.data --message "chore\(data\): sync /)
    for (const c of [
      'yarn om sync --all',
      'yarn om health --all',
      'yarn om discover',
      'gh issue edit',
      '--body-file out/discover.md',
    ])
      expect(run).toContain(c)
    expect(run).not.toMatch(/gh issue comment|gh pr/)
  })

  it('while the repository is private no schedule runs watch, sync or the night (Actions minutes)', () => {
    const guard = "${{ github.event_name != 'schedule' || !github.event.repository.private }}"
    for (const f of ['watch.yml', 'sync.yml', 'nightly.yml']) {
      const jobs = Object.values(wf(f).jobs) as (Job & { if?: string })[]
      expect(jobs[0]?.if, f).toBe(guard)
    }
    // collect never starts for a night the guard skipped
    expect(text('collect.yml')).toContain("github.event.workflow_run.conclusion != 'skipped'")
  })

  it('sync: the discovery issue does not need the discovery label to exist', () => {
    const run = runText(wf('sync.yml'))
    expect(run).not.toMatch(/gh issue list[^\n]*--label discovery/)
    expect(run).not.toMatch(/gh issue create [^\n]*--label discovery/)
    expect(run).toContain('gh label list')
  })

  it('the data writers have distinct groups and never cancel a pending run', () => {
    const groups = ['watch.yml', 'sync.yml'].map((f) => wf(f).concurrency)
    expect(new Set(groups.map((g) => g?.group)).size).toBe(2)
    for (const g of groups) expect(g?.['cancel-in-progress']).toBe(false)
    for (const g of groups) expect(['watch', 'sync']).toContain(g?.group) // collect (WP07) owns `collect`
  })

  it('pages: triggers, permissions, environment, include-hidden-files and the .well-known check', () => {
    const w = wf('pages.yml')
    expect(w.on).toEqual({
      push: { branches: ['main'] },
      workflow_run: { workflows: ['watch', 'sync', 'collect'], types: ['completed'], branches: ['main'] },
      schedule: [{ cron: '47 5 * * *' }],
      workflow_dispatch: null,
    })
    expect(w.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' })
    expect(w.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': false })
    const job = Object.values(w.jobs)[0] as Job
    expect(job['timeout-minutes']).toBe(15)
    expect(job.environment).toMatchObject({ name: 'github-pages' })
    expect(job.if).toContain("github.event.workflow_run.conclusion == 'success'")
    const up = steps(w).find((s) => s.uses?.startsWith('actions/upload-pages-artifact@'))
    expect(up?.with).toEqual({ path: 'dist', 'include-hidden-files': true })
    const run = runText(w)
    expect(run).toContain('git worktree add --detach .data origin/data')
    expect(run).toContain('yarn build')
    expect(run).toContain('dist/.well-known/agent-skills/index.json')
    expect(run).toContain("grep -qx './.well-known/agent-skills/index.json'")
    // the MCP server card is required only with MCP_URL (finding of 25 Oct)
    expect(run).toContain('if [ -n "${MCP_URL:-}" ]; then')
    expect(run).toContain('mkdir -p .data') // empty data on the first day
  })

  it('workflow names match the workflow_run chain of pages.yml', () => {
    expect(wf('watch.yml').name).toBe('watch')
    expect(wf('sync.yml').name).toBe('sync')
  })
})
