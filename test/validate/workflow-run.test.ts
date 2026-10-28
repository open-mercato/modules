// Runs the shell steps of watch.yml and sync.yml as GitHub would (`bash --noprofile --norc -eo pipefail`), with
// `yarn` and `gh` replaced by recorders, against a local bare repository as `origin`. Proves the step logic
// itself: the order of commands, the queue conditions, the single commit on `data` through data-branch.ts,
// no commit when nothing changed, the discovery issue edited in place (created only once), and for pages.yml the
// data checkout (empty on the first day), the artifact checks, the deploy switch (the account ID variable), the token
// check of the deploy job and the summaries.
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const hasJq = spawnSync('jq', ['--version']).status === 0

interface Step {
  name: string
  run?: string
}
const stepRun = (file: string, name: string): string => {
  const w = parse(readFileSync(join(ROOT, '.github', 'workflows', file), 'utf8')) as {
    jobs: Record<string, { steps: Step[] }>
  }
  const s = Object.values(w.jobs)
    .flatMap((j) => j.steps)
    .find((x) => x.name === name)
  if (!s?.run) throw new Error(`${file}: no run step ${name}`)
  return s.run
}

const FAKE_YARN = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$CALLS"
if [ "$1" = build ]; then
  rm -rf dist; mkdir -p dist; ls -A .data > dist/data-files.txt; echo '{}' > dist/modules.json
  mkdir -p dist/.well-known/agent-skills; echo '{}' > dist/.well-known/agent-skills/index.json
  if [ "\${FAKE_404:-1}" = 1 ]; then echo '<h1>Not found</h1>' > dist/404.html; fi
  if [ "\${FAKE_CARD:-1}" = 1 ]; then mkdir -p dist/.well-known/mcp; echo '{}' > dist/.well-known/mcp/server-card.json; fi
  if [ "\${FAKE_SKILLS:-1}" = 0 ]; then rm -rf dist/.well-known/agent-skills; fi
  exit 0
fi
[ "$1" = om ] || exit 0
cmd="$2"; shift 2
case "$cmd" in
  validate) echo "om validate labels=\${PR_LABELS:-}" >> "$CALLS" ;;
  watch) mkdir -p out; cp "$QUEUE" out/queue.json; echo '{"lines":1}' > .data/lines.json ;;
  scan) mkdir -p .data/builtin .data/facts; if [ "$1" = --builtin ]; then echo '{}' > ".data/builtin/$2.json"; else echo "$*" > .data/facts/queue.txt; fi ;;
  sync) mkdir -p .data/sync; echo '{"synced":true}' > .data/sync/x.json ;;
  discover) mkdir -p out; echo '## Missing official packages' > out/discover.md ;;
  *) echo "$*" > ".data/$cmd.txt" ;;
esac
`
const FAKE_GH = `#!/usr/bin/env bash
set -euo pipefail
echo "gh $*" >> "$CALLS"
if [ "$1 $2" = "issue list" ]; then printf '%s' "\${FAKE_ISSUE:-}"; fi
if [ "$1 $2" = "label list" ]; then printf '%s' "\${FAKE_LABELS:-}"; fi
if [ "$1" = api ] && [[ "$2" == */labels ]]; then
  if [ -n "\${FAKE_API_FAIL:-}" ]; then echo "HTTP 403" >&2; exit 1; fi
  printf '%s\\n' "\${FAKE_PR_LABELS:-}"
fi
`

let tmp: string
let work: string
let origin: string
let calls: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function runStep(script: string, env: Record<string, string> = {}): { code: number; out: string } {
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
    cwd: work,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(tmp, 'bin')}:${process.env.PATH}`,
      CALLS: calls,
      GITHUB_TOKEN: 'test-token',
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      ...env,
    },
  })
  return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` }
}

const queue = (o: {
  coreChanged: boolean
  changed: string[]
  items: { locator: string; version: string }[]
  needsSync?: string[]
}) => {
  const file = join(tmp, `queue-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(
    file,
    JSON.stringify({
      items: o.items,
      needsSync: o.needsSync ?? [],
      lines: { changed: o.changed, coreLatest: '0.9.0', coreChanged: o.coreChanged },
    }),
  )
  return file
}
const callLog = () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [])
const dataLog = () => {
  try {
    return git(origin, 'log', 'data', '--format=%s').split('\n')
  } catch {
    return []
  }
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'om-wf-'))
  origin = join(tmp, 'origin.git')
  work = join(tmp, 'work')
  calls = join(tmp, 'calls.log')
  mkdirSync(join(tmp, 'bin'))
  for (const [n, body] of [
    ['yarn', FAKE_YARN],
    ['gh', FAKE_GH],
  ] as const) {
    writeFileSync(join(tmp, 'bin', n), body)
    chmodSync(join(tmp, 'bin', n), 0o755)
  }
  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', origin])
  execFileSync('git', ['init', '--quiet', '-b', 'main', work])
  writeFileSync(join(work, 'README.md'), 'catalog\n')
  writeFileSync(join(work, '.gitignore'), '.data/\nout/\nlib\n')
  symlinkSync(join(ROOT, 'lib'), join(work, 'lib'))
  git(work, 'add', '-A')
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '-m', 'init')
  git(work, 'remote', 'add', 'origin', origin)
  git(work, 'push', '--quiet', 'origin', 'main')
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe.skipIf(!hasJq)('watch.yml steps', () => {
  it('runs the chain in order and commits once on data; a second run with the same inputs commits nothing', () => {
    expect(runStep(stepRun('watch.yml', 'Prepare data checkout')).code).toBe(0)
    const q = queue({
      coreChanged: true,
      changed: [],
      items: [
        { locator: 'npm:@a/b', version: '1.2.3' },
        { locator: 'github:o/r', version: 'v1' },
      ],
    })
    const r = runStep(stepRun('watch.yml', 'Watch and commit to data'), { QUEUE: q })
    expect(r.code, r.out).toBe(0)
    expect(callLog()).toEqual([
      'om watch --keepalive',
      'om scan --builtin 0.9.0',
      'om scan --queue out/queue.json',
      'om fit --modules npm:@a/b@1.2.3,github:o/r@v1',
      'om radar',
      'om health --changed',
      'om hive',
    ])
    const log = dataLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatch(/^chore\(data\): watch \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    const files = git(origin, 'ls-tree', '-r', '--name-only', 'data').split('\n')
    expect(files).toEqual(
      expect.arrayContaining([
        'lines.json',
        'builtin/0.9.0.json',
        'facts/queue.txt',
        'fit.txt',
        'radar.txt',
        'health.txt',
        'hive.txt',
      ]),
    )
    // main is untouched by the data write
    expect(git(origin, 'log', 'main', '--format=%s')).toBe('init')

    // second run: the data branch now holds builtin/0.9.0.json and nothing new is queued
    writeFileSync(calls, '')
    const q2 = queue({
      coreChanged: false,
      changed: [],
      items: [
        { locator: 'npm:@a/b', version: '1.2.3' },
        { locator: 'github:o/r', version: 'v1' },
      ],
    })
    const r2 = runStep(stepRun('watch.yml', 'Watch and commit to data'), { QUEUE: q2 })
    expect(r2.code, r2.out).toBe(0)
    expect(callLog()).not.toContain('om scan --builtin 0.9.0')
    expect(r2.out).toContain('data-branch: no changes')
    expect(dataLog()).toHaveLength(1)
  })

  it('syncs the entries watch found without a record or with a moved dist-tag before scan and health', () => {
    runStep(stepRun('watch.yml', 'Prepare data checkout'))
    const r = runStep(stepRun('watch.yml', 'Watch and commit to data'), {
      QUEUE: queue({
        coreChanged: false,
        changed: [],
        items: [{ locator: 'npm:@a/b', version: '1.2.3' }],
        needsSync: ['github:o/r', 'npm:@a/b'],
      }),
    })
    expect(r.code, r.out).toBe(0)
    const c = callLog()
    expect(c.slice(0, 2)).toEqual(['om watch --keepalive', 'om sync github:o/r npm:@a/b'])
    expect(c.indexOf('om scan --queue out/queue.json')).toBeGreaterThan(1)
    expect(c.indexOf('om health --changed')).toBeGreaterThan(c.indexOf('om sync github:o/r npm:@a/b'))
    expect(git(origin, 'ls-tree', '-r', '--name-only', 'data').split('\n')).toContain('sync/x.json')

    writeFileSync(calls, '')
    runStep(stepRun('watch.yml', 'Watch and commit to data'), {
      QUEUE: queue({ coreChanged: false, changed: [], items: [] }),
    })
    expect(callLog().some((l) => l.startsWith('om sync'))).toBe(false)
  })

  it('a new line version refits everything; an empty queue skips scan and fit', () => {
    runStep(stepRun('watch.yml', 'Prepare data checkout'))
    const r = runStep(stepRun('watch.yml', 'Watch and commit to data'), {
      QUEUE: queue({ coreChanged: false, changed: ['next'], items: [] }),
    })
    expect(r.code, r.out).toBe(0)
    const c = callLog()
    expect(c).toContain('om fit')
    expect(c.some((l) => l.startsWith('om scan --queue'))).toBe(false)
    expect(c.some((l) => l.startsWith('om fit --modules'))).toBe(false)

    writeFileSync(calls, '')
    const r2 = runStep(stepRun('watch.yml', 'Watch and commit to data'), {
      QUEUE: queue({ coreChanged: false, changed: [], items: [] }),
    })
    expect(r2.code, r2.out).toBe(0)
    expect(callLog().some((l) => l.startsWith('om fit') || l.startsWith('om scan --queue'))).toBe(false)
  })

  it('a failing command aborts without a commit', () => {
    runStep(stepRun('watch.yml', 'Prepare data checkout'))
    writeFileSync(
      join(tmp, 'bin', 'yarn'),
      FAKE_YARN.replace('case "$cmd" in', '[ "$cmd" = radar ] && exit 3\ncase "$cmd" in'),
    )
    const r = runStep(stepRun('watch.yml', 'Watch and commit to data'), {
      QUEUE: queue({ coreChanged: false, changed: [], items: [] }),
    })
    expect(r.code).not.toBe(0)
    expect(dataLog()).toHaveLength(0)
  })
})

describe('validate.yml checks scope', () => {
  // the Scope step against a branch of `work`: only modules/ changed -> descriptors_only=true (finding of 25 Oct)
  const scope = (files: Record<string, string>) => {
    git(work, 'fetch', '--quiet', 'origin', 'main')
    git(work, 'checkout', '--quiet', '-B', 'pr', 'origin/main')
    for (const [f, body] of Object.entries(files)) {
      mkdirSync(dirname(join(work, f)), { recursive: true })
      writeFileSync(join(work, f), body)
    }
    git(work, 'add', '-A')
    git(work, '-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '-m', 'pr')
    const out = join(tmp, `out-${Math.random().toString(36).slice(2)}`)
    writeFileSync(out, '')
    const r = runStep(stepRun('validate.yml', 'Scope'), { BASE_REF: 'main', GITHUB_OUTPUT: out })
    expect(r.code, r.out).toBe(0)
    return readFileSync(out, 'utf8').trim()
  }

  it('only descriptors: the test suite is skipped; anything else runs it', () => {
    expect(scope({ 'modules/@acme/x.yml': 'npm: "@acme/x"\n' })).toBe('descriptors_only=true')
    expect(scope({ 'modules/@acme/y.yml': 'npm: "@acme/y"\n', 'policy/ignore.yml': '[]\n' })).toBe(
      'descriptors_only=false',
    )
    expect(scope({ 'site/x.txt': 'x\n' })).toBe('descriptors_only=false')
  })
})

describe.skipIf(!hasJq)('sync.yml steps', () => {
  it('commits the sync on data, then creates the discovery issue once and edits it afterwards', () => {
    runStep(stepRun('sync.yml', 'Prepare data checkout'))
    const r = runStep(stepRun('sync.yml', 'Sync and commit to data'))
    expect(r.code, r.out).toBe(0)
    expect(callLog()).toEqual(['om sync --all', 'om health --all'])
    expect(dataLog()[0]).toMatch(/^chore\(data\): sync /)

    expect(runStep(stepRun('sync.yml', 'Discover packages')).code).toBe(0)
    writeFileSync(calls, '')
    // the label `discovery` does not exist yet (an owner click, spec 5.6 item 7): the issue is created without it
    const bare = runStep(stepRun('sync.yml', 'Update the discovery issue'))
    expect(bare.code, bare.out).toBe(0)
    expect(callLog().at(-1)).toBe('gh issue create --title Discovered packages --body-file out/discover.md')

    writeFileSync(calls, '')
    const created = runStep(stepRun('sync.yml', 'Update the discovery issue'), { FAKE_LABELS: 'bug\ndiscovery\n' })
    expect(created.code, created.out).toBe(0)
    expect(callLog().at(-1)).toBe(
      'gh issue create --title Discovered packages --label discovery --body-file out/discover.md',
    )

    writeFileSync(calls, '')
    const edited = runStep(stepRun('sync.yml', 'Update the discovery issue'), { FAKE_ISSUE: '7' })
    expect(edited.code, edited.out).toBe(0)
    expect(callLog().at(-1)).toBe('gh issue edit 7 --body-file out/discover.md')
    expect(callLog().some((l) => l.includes('comment'))).toBe(false)
  })
})

describe('pages.yml steps', () => {
  const env = () => ({ GITHUB_STEP_SUMMARY: join(tmp, 'summary.md'), RUNNER_TEMP: join(tmp, 'runner') })

  it('builds on empty data when the data branch does not exist yet', () => {
    const r = runStep(stepRun('pages.yml', 'Read data branch'), env())
    expect(r.code, r.out).toBe(0)
    expect(readFileSync(join(tmp, 'summary.md'), 'utf8')).toBe('No data branch yet: building on empty data.\n')
    expect(runStep(stepRun('pages.yml', 'Build'), env()).code).toBe(0)
    expect(readFileSync(join(work, 'dist', 'data-files.txt'), 'utf8')).toBe('')
    expect(runStep(stepRun('pages.yml', 'Check artifact contents'), env()).code).toBe(0)
  })

  it('builds on the data branch and checks the Pages limits with wrangler', () => {
    // a data branch on origin
    const seed = join(tmp, 'seed')
    execFileSync('git', ['clone', '--quiet', origin, seed])
    git(seed, 'checkout', '--quiet', '--orphan', 'data')
    git(seed, 'rm', '-rfq', '.')
    writeFileSync(join(seed, 'lines.json'), '{}\n')
    git(seed, 'add', '-A')
    git(seed, '-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '-m', 'data')
    git(seed, 'push', '--quiet', 'origin', 'data')

    expect(runStep(stepRun('pages.yml', 'Read data branch'), env()).code).toBe(0)
    expect(readFileSync(join(work, '.data', 'lines.json'), 'utf8')).toBe('{}\n')
    expect(runStep(stepRun('pages.yml', 'Build'), env()).code).toBe(0)
    expect(readFileSync(join(work, 'dist', 'data-files.txt'), 'utf8')).toContain('lines.json')
    expect(runStep(stepRun('pages.yml', 'Check artifact contents'), env()).code).toBe(0)

    writeFileSync(calls, '')
    const limits = runStep(stepRun('pages.yml', 'Check Pages limits'), env())
    expect(limits.code, limits.out).toBe(0)
    expect(readFileSync(calls, 'utf8')).toBe('wrangler pages project validate dist\n')
    expect(limits.out).toContain('dist: 5 files')
  })

  it('a build without 404.html stops: Cloudflare Pages would answer every missing path with the home page', () => {
    runStep(stepRun('pages.yml', 'Read data branch'), env())
    runStep(stepRun('pages.yml', 'Build'), { ...env(), FAKE_404: '0' })
    const r = runStep(stepRun('pages.yml', 'Check artifact contents'), env())
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('dist/404.html is missing')
  })

  it('without the account ID variable the run ends green with a warning and a summary that say it was not deployed', () => {
    const vars = {
      ...env(),
      SITE_URL: 'https://modules.openmercato.com',
      BASE_PATH: '/',
      CF_PAGES_PROJECT: 'open-mercato-modules',
    }
    const out = join(tmp, 'output.txt')
    writeFileSync(out, '')
    const settings = runStep(stepRun('pages.yml', 'Check deploy settings'), {
      ...vars,
      HAS_ACCOUNT_ID: 'false',
      GITHUB_OUTPUT: out,
    })
    expect(settings.code, settings.out).toBe(0)
    expect(readFileSync(out, 'utf8')).toBe('deploy=false\n')
    const r = runStep(stepRun('pages.yml', 'Not deployed'), vars)
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('::warning title=pages not deployed::No repository variable CLOUDFLARE_ACCOUNT_ID')
    const summary = readFileSync(join(tmp, 'summary.md'), 'utf8')
    expect(summary).toContain('**Not deployed.**')
    expect(summary).toContain('CLOUDFLARE_API_TOKEN')
    expect(summary).toContain('Settings > Environments > cloudflare')
    expect(summary).toContain('`open-mercato-modules`')
    expect(summary).toContain('modules.openmercato.com')

    writeFileSync(out, '')
    runStep(stepRun('pages.yml', 'Check deploy settings'), { ...vars, HAS_ACCOUNT_ID: 'true', GITHUB_OUTPUT: out })
    expect(readFileSync(out, 'utf8')).toBe('deploy=true\n')
  })

  it('the deploy job fails red when the variable is set but the token is missing, and sums up a deploy', () => {
    const vars = {
      ...env(),
      SITE_URL: 'https://modules.openmercato.com',
      BASE_PATH: '/',
      CF_PAGES_PROJECT: 'open-mercato-modules',
    }
    const half = runStep(stepRun('pages.yml', 'Check token'), { ...vars, HAS_TOKEN: 'false' })
    expect(half.code).not.toBe(0)
    expect(half.out).toContain('::error title=pages not deployed::CLOUDFLARE_ACCOUNT_ID is set')
    expect(runStep(stepRun('pages.yml', 'Check token'), { ...vars, HAS_TOKEN: 'true' }).code).toBe(0)

    rmSync(join(tmp, 'summary.md'), { force: true })
    const ok = runStep(stepRun('pages.yml', 'Summary'), {
      ...vars,
      DEPLOYMENT_URL: 'https://abc123.open-mercato-modules.pages.dev',
    })
    expect(ok.code, ok.out).toBe(0)
    expect(ok.out).not.toContain('::warning')
    expect(readFileSync(join(tmp, 'summary.md'), 'utf8')).toBe(
      'Site deployed to Cloudflare Pages project `open-mercato-modules`: https://modules.openmercato.com/\n\n' +
        'This deployment: https://abc123.open-mercato-modules.pages.dev\n',
    )
  })

  it('the deploy job finds .well-known in the downloaded site and stops without it', () => {
    runStep(stepRun('pages.yml', 'Read data branch'), env())
    runStep(stepRun('pages.yml', 'Build'), env())
    expect(runStep(stepRun('pages.yml', 'Check downloaded site'), env()).code).toBe(0)
    rmSync(join(work, 'dist', '.well-known'), { recursive: true, force: true })
    const r = runStep(stepRun('pages.yml', 'Check downloaded site'), env())
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('dist/.well-known/agent-skills/index.json is missing')
  })

  it('stops instead of building on empty data when the data branch cannot be read', () => {
    git(work, 'remote', 'set-url', 'origin', join(tmp, 'gone.git'))
    const r = runStep(stepRun('pages.yml', 'Read data branch'), env())
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('Cannot read the data branch; not deploying.')
    expect(existsSync(join(work, '.data'))).toBe(false)
  })

  it('a build without .well-known stops before upload; the server card is required only with MCP_URL', () => {
    runStep(stepRun('pages.yml', 'Read data branch'), env())
    runStep(stepRun('pages.yml', 'Build'), { ...env(), FAKE_SKILLS: '0' })
    const bare = runStep(stepRun('pages.yml', 'Check artifact contents'), env())
    expect(bare.code).not.toBe(0)
    expect(bare.out).toContain('dist/.well-known/agent-skills/index.json is missing')

    runStep(stepRun('pages.yml', 'Build'), { ...env(), FAKE_CARD: '0' })
    expect(runStep(stepRun('pages.yml', 'Check artifact contents'), env()).code).toBe(0)
    const r = runStep(stepRun('pages.yml', 'Check artifact contents'), {
      ...env(),
      MCP_URL: 'https://x.workers.dev/mcp',
    })
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('dist/.well-known/mcp/server-card.json is missing')
  })
})

describe('validate.yml steps', () => {
  const pr = { GITHUB_REPOSITORY: 'open-mercato/modules', PR_NUMBER: '7', GITHUB_STEP_SUMMARY: '/dev/null' }

  it('passes the labels the PR has now, so a re-run after name-reviewed sees it', () => {
    const r = runStep(stepRun('validate.yml', 'Validate descriptors'), {
      ...pr,
      EVENT_LABELS: '',
      FAKE_PR_LABELS: 'new-entry,name-reviewed',
    })
    expect(r.code, r.out).toBe(0)
    expect(callLog()).toEqual([
      'gh api repos/open-mercato/modules/issues/7/labels --jq [.[].name] | join(",")',
      'om validate --changed=origin/main --summary /dev/null',
      'om validate labels=new-entry,name-reviewed',
    ])
  })

  it('falls back to the labels of the event when the API does not answer', () => {
    const r = runStep(stepRun('validate.yml', 'Validate descriptors'), {
      ...pr,
      EVENT_LABELS: 'new-entry',
      FAKE_API_FAIL: '1',
    })
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('The labels API did not answer')
    expect(callLog().at(-1)).toBe('om validate labels=new-entry')
  })

  // the checkout (fetch-depth: 0) has every branch already; the step reads it without a second, unauthenticated
  // fetch, which failed in the private repository and skipped Fit with "No data branch yet" (finding of 25 Oct)
  const checkout = () => {
    const dir = join(tmp, 'pr')
    execFileSync('git', ['clone', '--quiet', '--no-single-branch', origin, dir])
    return dir
  }

  it('reads origin/data from the checkout, with no network', () => {
    const seed = join(tmp, 'seed')
    execFileSync('git', ['clone', '--quiet', origin, seed])
    git(seed, 'checkout', '--quiet', '--orphan', 'data')
    git(seed, 'rm', '-rfq', '.')
    writeFileSync(join(seed, 'lines.json'), '{}\n')
    git(seed, 'add', '-A')
    git(seed, '-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '-m', 'data')
    git(seed, 'push', '--quiet', 'origin', 'data')
    work = checkout()
    // no remote to talk to: what the checkout fetched is all there is, as for a token-less fetch in a private repo
    git(work, 'remote', 'set-url', 'origin', join(tmp, 'gone.git'))
    const r = runStep(stepRun('validate.yml', 'Read data branch'))
    expect(r.code, r.out).toBe(0)
    expect(r.out).toMatch(/^Data branch at [0-9a-f]+\.$/m)
    expect(readFileSync(join(work, '.data', 'lines.json'), 'utf8')).toBe('{}\n')
  })

  it('says so and goes on with empty data when the repository has no data branch', () => {
    work = checkout()
    const r = runStep(stepRun('validate.yml', 'Read data branch'))
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('No data branch in the checkout (refs/remotes/origin/data)')
    expect(existsSync(join(work, '.data'))).toBe(true)
  })
})

// collect.yml reads receipts history from .data: the old step fetched without credentials and, in the private
// repository, fell back to the tree of main with no receipts (finding of 25 Oct)
describe('collect.yml steps', () => {
  const seedData = () => {
    const seed = join(tmp, 'seed')
    execFileSync('git', ['clone', '--quiet', origin, seed])
    git(seed, 'checkout', '--quiet', '--orphan', 'data')
    git(seed, 'rm', '-rfq', '.')
    mkdirSync(join(seed, 'receipts'), { recursive: true })
    writeFileSync(join(seed, 'receipts', 'x.jsonl'), '{}\n')
    git(seed, 'add', '-A')
    git(seed, '-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '-m', 'data')
    git(seed, 'push', '--quiet', 'origin', 'data')
  }
  const checkout = () => {
    const dir = join(tmp, 'collect')
    execFileSync('git', ['clone', '--quiet', '--no-single-branch', origin, dir])
    // nothing to fetch from: what the checkout (fetch-depth: 0) brought is all there is
    git(dir, 'remote', 'set-url', 'origin', join(tmp, 'gone.git'))
    return dir
  }

  it('reads origin/data from the checkout with no network, receipts included', () => {
    seedData()
    work = checkout()
    const r = runStep(stepRun('collect.yml', 'Data checkout'))
    expect(r.code, r.out).toBe(0)
    expect(r.out).toMatch(/^Data branch at [0-9a-f]+\.$/m)
    expect(readFileSync(join(work, '.data', 'receipts', 'x.jsonl'), 'utf8')).toBe('{}\n')
  })

  it('stops when the checkout has no data branch, instead of collecting on the tree of main', () => {
    work = checkout()
    const r = runStep(stepRun('collect.yml', 'Data checkout'))
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('No data branch in the checkout (refs/remotes/origin/data)')
    expect(existsSync(join(work, '.data'))).toBe(false)
  })
})
