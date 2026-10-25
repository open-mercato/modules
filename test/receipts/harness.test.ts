// The harness scripts (spec 5.3, D11, D47): who runs what, the hash boundary, and the scripts themselves on Linux.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { harnessFiles, harnessHash, receiptId } from '../../lib/receipts/cell-key.ts'
import { MODULES_TS_09, ROOT, tmp } from './helpers.ts'

const steps = readFileSync(join(ROOT, 'harness', 'steps.sh'), 'utf8')
const caseOf = (step: string): string => {
  const start = steps.indexOf(`\n${step})\n`)
  expect(start, `case ${step}`).toBeGreaterThan(0)
  const end = steps.indexOf('\n  ;;\n', start)
  return steps.slice(start, end)
}

describe('steps.sh: module and app code runs only as om-cell', () => {
  const APP_STEPS = ['scaffold', 'install', 'add', 'generate', 'typecheck', 'initialize', 'build', 'start'] as const

  it('every command with yarn, npx or node_modules code goes through cell/run_cell', () => {
    for (const s of APP_STEPS) {
      const body = caseOf(s)
      const lines = body
        .split('\n')
        .filter((l) => /(?<![.\w])(yarn|npx) (--?)?[a-z]/.test(l) && !/^\s*#/.test(l) && !/\b(fail|say) "/.test(l))
      expect(lines.length, s).toBeGreaterThan(0)
      for (const l of lines) expect(l, `${s}: ${l}`).toMatch(/\b(cell|run_cell) "\$(APP|CELL_HOME)"/)
    }
  })

  it('run_cell switches to om-cell with env -i (sudo -u om-cell, or runuser as root in the preview container)', () => {
    expect(steps).toMatch(/runuser -u "\$CELL_USER" -- env -i/)
    expect(steps).toMatch(/sudo -n -u "\$CELL_USER" -H env -i/)
    expect(steps).toContain('set -euo pipefail')
    expect(steps).toContain('YARN_ENABLE_SCRIPTS=0')
  })

  it('checks checksums before typecheck, build and start, and locks node_modules after add', () => {
    for (const s of ['typecheck', 'build', 'start']) expect(caseOf(s)).toContain('tamper_check')
    expect(caseOf('add')).toContain('finalize_install')
    expect(caseOf('generate')).toContain('finalize_install')
    expect(steps).toContain('chmod -R a-w "$APP/node_modules"')
  })

  it('env.sh drops existing keys before appending and never sets NODE_ENV', () => {
    const env = readFileSync(join(ROOT, 'harness', 'env.sh'), 'utf8')
    expect(env).toContain('grep -Ev')
    expect(env).not.toMatch(/^\s*echo ['"]?NODE_ENV/m)
    for (const k of [
      'DATABASE_URL',
      'OM_TEST_MODE',
      'CACHE_SQLITE_PATH',
      'PORT',
      'TENANT_DATA_ENCRYPTION_FALLBACK_KEY',
    ])
      expect(env).toContain(k)
  })
})

describe('steps.sh: the runner never reads a file of om-cell into $OUT (review round 1)', () => {
  it('no cp, cat, tail or grep of $LOGS or $APP files by the runner; copies go through copy_from_cell', () => {
    const code = steps
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n')
    expect(code).not.toMatch(/\b(cp|cat|tail|grep|head)\b[^\n]*"\$LOGS\//)
    expect(code).not.toMatch(/as_root cp "\$APP\//)
    expect(caseOf('pack')).toContain('server_log')
    expect(caseOf('pack')).toContain('copy_from_cell "$APP" .mercato/generated/api-routes.generated.ts')
    expect(steps).toMatch(/copy_from_cell\(\) \{[\s\S]*?run_cell "\$1" "\[ -f \$q \] && \[ ! -L \$q \]/)
    const smoke = readFileSync(join(ROOT, 'harness', 'smoke.sh'), 'utf8')
    expect(smoke).not.toContain('$LOGS')
    expect(smoke).not.toContain('$APP')
  })

  // pack with a stand-in for sudo/runuser (the test runs as one user): the copy refuses symlinks, so a start.log
  // that points at a file of the runner never reaches the artifact. On the runner the copy also runs as om-cell.
  const packWith = (link: boolean) => {
    const t = tmp('pack')
    const home = join(t, 'home')
    const out = join(t, 'out')
    const shim = join(t, 'shim')
    const secret = join(t, 'runner-secret.txt')
    for (const d of [join(home, 'logs'), join(home, 'app', '.mercato', 'generated'), out, shim])
      mkdirSync(d, { recursive: true })
    writeFileSync(secret, 'TOPSECRET runner token\n')
    const place = (file: string, content: string) => (link ? symlinkSync(secret, file) : writeFileSync(file, content))
    place(join(home, 'logs', 'start.log'), 'server says ready\n')
    place(join(home, 'logs', 'start.pgid'), '999999\n')
    place(join(home, 'app', '.mercato', 'generated', 'api-routes.generated.ts'), 'export const routes = []\n')
    writeFileSync(
      join(shim, 'sudo'),
      '#!/usr/bin/env bash\nwhile [[ "$1" == -* ]]; do case "$1" in -u) shift 2 ;; *) shift ;; esac; done\nexec "$@"\n',
    )
    writeFileSync(join(shim, 'pkill'), '#!/bin/sh\nexit 0\n')
    writeFileSync(join(shim, 'runuser'), '#!/usr/bin/env bash\nshift 3\nexec "$@"\n')
    for (const f of ['sudo', 'pkill', 'runuser']) chmodSync(join(shim, f), 0o755)
    const r = spawnSync('bash', [join(ROOT, 'harness', 'steps.sh'), 'pack'], {
      encoding: 'utf8',
      env: {
        PATH: `${shim}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
        HOME: t,
        HARNESS_CELL_HOME: home,
        OUT: out,
        HARNESS_KEEP_GENERATED: '1',
        CELL_PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      },
    })
    const files = readdirSync(out)
    const all = files.map((f) => readFileSync(join(out, f), 'utf8')).join('\n')
    return { r, out, files, all }
  }

  it('start.log, start.pgid and the generated routes as symlinks to a runner file do not land in $OUT', () => {
    const { r, out, files, all } = packWith(true)
    expect(r.status, r.stderr).toBe(0)
    expect(all).not.toContain('TOPSECRET')
    expect(existsSync(join(out, 'server.log'))).toBe(false)
    expect(existsSync(join(out, 'server.pgid'))).toBe(false)
    expect(files).not.toContain('api-routes.generated.ts')
  })

  it('regular files of om-cell are copied', () => {
    const { r, out } = packWith(false)
    expect(r.status, r.stderr).toBe(0)
    expect(readFileSync(join(out, 'server.log'), 'utf8')).toBe('server says ready\n')
    expect(readFileSync(join(out, 'server.pgid'), 'utf8')).toBe('999999\n')
    expect(readFileSync(join(out, 'api-routes.generated.ts'), 'utf8')).toContain('routes')
  })

  it('smoke.sh --log refuses a symlink and fails on Unhandled/Error: lines', () => {
    const t = tmp('smokelog')
    const run = (f: string) =>
      spawnSync('bash', [join(ROOT, 'harness', 'smoke.sh'), '--log', f], {
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin' },
      })
    writeFileSync(join(t, 'secret'), 'Error: TOPSECRET\n')
    symlinkSync(join(t, 'secret'), join(t, 'link.log'))
    const linked = run(join(t, 'link.log'))
    expect(linked.status).toBe(1)
    expect(linked.stdout).not.toContain('TOPSECRET')
    writeFileSync(join(t, 'ok.log'), 'ready on 3901\n')
    expect(run(join(t, 'ok.log')).status).toBe(0)
    writeFileSync(join(t, 'bad.log'), 'ready\nUnhandled rejection: x\n')
    expect(run(join(t, 'bad.log')).status).toBe(1)
    expect(run(join(t, 'missing.log')).status).toBe(0)
  })
})

// steps.sh with stand-ins for sudo/runuser and a fake `yarn` on CELL_PATH (the test runs as one user).
function fakeCell(yarn: string) {
  const t = tmp('cell')
  const home = join(t, 'home')
  const app = join(home, 'app')
  const out = join(t, 'out')
  const shim = join(t, 'shim')
  const bin = join(t, 'bin')
  for (const d of [join(home, 'logs'), join(app, 'src'), out, shim, bin]) mkdirSync(d, { recursive: true })
  writeFileSync(join(app, 'src', 'modules.ts'), MODULES_TS_09)
  writeFileSync(join(app, 'package.json'), `${JSON.stringify({ name: 'app', scripts: { build: 'next build' } })}\n`)
  writeFileSync(join(app, 'tsconfig.json'), '{}\n')
  writeFileSync(
    join(shim, 'sudo'),
    '#!/usr/bin/env bash\nwhile [[ "$1" == -* ]]; do case "$1" in -u) shift 2 ;; *) shift ;; esac; done\nexec "$@"\n',
  )
  writeFileSync(join(shim, 'runuser'), '#!/usr/bin/env bash\nshift 3\nexec "$@"\n')
  writeFileSync(join(bin, 'yarn'), `#!/usr/bin/env bash\n${yarn}\n`)
  for (const f of [join(shim, 'sudo'), join(shim, 'runuser'), join(bin, 'yarn')]) chmodSync(f, 0o755)
  const cellPath = `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`
  const step = (name: string, env: Record<string, string> = {}) =>
    spawnSync('bash', [join(ROOT, 'harness', 'steps.sh'), name], {
      encoding: 'utf8',
      env: {
        PATH: `${shim}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
        HOME: t,
        HARNESS_CELL_HOME: home,
        OUT: out,
        CELL_PATH: cellPath,
        HARNESS_RO_NODE_MODULES: '0',
        OM_VERSION: '0.9.0',
        BASELINE: '0',
        MODULE_NPM: '@acme/mod',
        MODULE_SPEC: '@acme/mod@1.0.0',
        MODULE_IDS: 'mod',
        THIRD_PARTY: '1',
        ...env,
      },
    })
  return { app, out, step }
}

describe('steps.sh add: module code may change only dependencies (review round 2)', () => {
  // sums.install as the install step writes them (same hashes as `sums` in steps.sh), from the untouched app.
  const withInstallSums = (yarn: string) => {
    const c = fakeCell(yarn)
    const pkg = readFileSync(join(c.app, 'package.json'), 'utf8')
    const scripts = createHash('sha256')
      .update(JSON.stringify(JSON.parse(pkg).scripts ?? {}))
      .digest('hex')
    const file = (f: string) =>
      createHash('sha256')
        .update(readFileSync(join(c.app, f)))
        .digest('hex')
    writeFileSync(
      join(c.out, 'sums.install'),
      `scripts ${scripts}\ntsconfig.json ${file('tsconfig.json')}\n.yarnrc.yml missing\n`,
    )
    return c
  }

  it('add fails with tampered-files when the module changed package.json scripts during add', () => {
    const c = withInstallSums(
      `node -e 'const f="package.json";const p=JSON.parse(require("fs").readFileSync(f));p.scripts.build="echo ok";require("fs").writeFileSync(f,JSON.stringify(p))'`,
    )
    const r = c.step('add')
    expect(r.status, r.stderr).toBe(1)
    const log = readFileSync(join(c.out, 'add.log'), 'utf8')
    expect(log).toMatch(/^\[harness\] tampered-files: scripts $/m)
    // The tampered state never becomes the base for the checks before typecheck, build and start.
    expect(readFileSync(join(c.out, 'sums.add'), 'utf8')).toBe(readFileSync(join(c.out, 'sums.install'), 'utf8'))
  })

  it('add that changes only dependencies passes and records the sums for later checks', () => {
    const c = withInstallSums(
      `node -e 'const f="package.json";const p=JSON.parse(require("fs").readFileSync(f));p.dependencies={"@acme/mod":"1.0.0"};require("fs").writeFileSync(f,JSON.stringify(p))'`,
    )
    const r = c.step('add')
    expect(r.status, r.stderr).toBe(0)
    expect(readFileSync(join(c.out, 'add.log'), 'utf8')).not.toContain('tampered-files')
    expect(readFileSync(join(c.out, 'sums.add'), 'utf8')).toBe(readFileSync(join(c.out, 'sums.install'), 'utf8'))
  })
})

describe('steps.sh: the starter preset is a parameter of the cell (24 Oct)', () => {
  /** A fake `npx` on CELL_PATH that records its arguments; the app of fakeCell stands in for the scaffold. */
  const withNpx = (c: ReturnType<typeof fakeCell>) => {
    const bin = join(dirname(c.app), '..', 'bin')
    writeFileSync(join(bin, 'npx'), `#!/usr/bin/env bash\necho "$@" > ${JSON.stringify(join(c.out, 'npx.args'))}\n`)
    chmodSync(join(bin, 'npx'), 0o755)
    return c
  }

  it('scaffold passes --preset $PRESET to create-mercato-app, empty when the cell does not say', () => {
    const c = withNpx(fakeCell('true'))
    expect(c.step('scaffold', { PRESET: 'classic' }).status).toBe(0)
    expect(readFileSync(join(c.out, 'npx.args'), 'utf8')).toContain('create-mercato-app@0.9.0 app --preset classic ')
    const d = withNpx(fakeCell('true'))
    expect(d.step('scaffold').status).toBe(0)
    expect(readFileSync(join(d.out, 'npx.args'), 'utf8')).toContain(' --preset empty ')
  })

  it('a preset other than classic or empty is refused before anything runs', () => {
    const c = withNpx(fakeCell('true'))
    const r = c.step('scaffold', { PRESET: 'classic --registry https://evil.example' })
    expect(r.status).toBe(1)
    expect(readFileSync(join(c.out, 'scaffold.log'), 'utf8')).toMatch(/invalid PRESET/)
    expect(existsSync(join(c.out, 'npx.args'))).toBe(false)
  })

  it('add of a package the app already registers (a new app: checkout, webhooks) is yarn add only, note in-preset', () => {
    const c = fakeCell('true')
    writeFileSync(
      join(c.app, 'src', 'modules.ts'),
      "export const enabledModules: ModuleEntry[] = [\n  { id: 'auth', from: '@open-mercato/core' },\n  { id: 'webhooks', from: '@open-mercato/webhooks' },\n]\n",
    )
    const r = c.step('add', {
      PRESET: 'classic',
      MODULE_NPM: '@open-mercato/webhooks',
      MODULE_SPEC: '@open-mercato/webhooks@0.9.0',
      MODULE_IDS: 'webhooks',
      THIRD_PARTY: '0',
    })
    expect(r.status, r.stderr).toBe(0)
    const log = readFileSync(join(c.out, 'add.log'), 'utf8')
    expect(log).toContain('in-preset: src/modules.ts already registers webhooks from @open-mercato/webhooks')
    expect(JSON.parse(readFileSync(join(c.out, 'notes.json'), 'utf8'))).toEqual(['in-preset'])
  })
})

// GNU timeout is on ubuntu-latest and in the preview image, not on macOS.
const hasTimeout = spawnSync('timeout', ['--version']).status === 0
describe.skipIf(!hasTimeout)('steps.sh step time limit (review round 2)', () => {
  it('a step that runs past its limit ends with the marker in its own log', () => {
    const c = fakeCell('sleep 30')
    const r = c.step('initialize', { HARNESS_STEP_SECS: '2' })
    expect(r.status).toBe(124)
    expect(readFileSync(join(c.out, 'initialize.log'), 'utf8')).toMatch(/^\[harness\] step timed out after 2 s$/m)
  })

  it('exit code 124 from module code before the limit is an ordinary failure without the marker', () => {
    const c = fakeCell('exit 124')
    const r = c.step('initialize', { HARNESS_STEP_SECS: '20' })
    expect(r.status).toBe(124)
    expect(readFileSync(join(c.out, 'initialize.log'), 'utf8')).not.toContain('timed out')
  })
})

describe('patches/agent-examples-tsconfig.sh (0.8 line)', () => {
  const TSCONFIG_080 = {
    compilerOptions: { strict: true, noEmit: true },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
    exclude: ['node_modules'],
  }
  it('excludes the agent scripts and tools once, and lines.yml applies it to 0.8 only', () => {
    const dir = tmp('tsconfig')
    writeFileSync(join(dir, 'tsconfig.json'), `${JSON.stringify(TSCONFIG_080, null, 2)}\n`)
    const run = () =>
      execFileSync('bash', [join(ROOT, 'harness', 'patches', 'agent-examples-tsconfig.sh')], {
        cwd: dir,
        encoding: 'utf8',
        env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` },
      })
    run()
    const once = readFileSync(join(dir, 'tsconfig.json'), 'utf8')
    run()
    expect(readFileSync(join(dir, 'tsconfig.json'), 'utf8')).toBe(once)
    expect(JSON.parse(once).exclude).toEqual([
      'node_modules',
      'src/modules/**/agents/**/scripts/**',
      'src/modules/**/agents/**/tools/**',
    ])
    const lines = readFileSync(join(ROOT, 'harness', 'lines.yml'), 'utf8')
    expect(lines).toMatch(/- id: agent-examples-tsconfig\n\s+applies: ">=0\.8\.0 <0\.9\.0"/)
  })
})

describe('harnessHash', () => {
  function copy(): string {
    const dir = tmp('hash')
    for (const p of ['harness', 'docs', 'lib/receipts']) cpSync(join(ROOT, p), join(dir, p), { recursive: true })
    return dir
  }

  it('covers steps.sh, env.sh, smoke.sh, patches/** and lines.yml only', () => {
    expect(harnessFiles(ROOT)).toEqual([
      'harness/env.sh',
      'harness/lines.yml',
      'harness/patches/agent-examples-tsconfig.sh',
      'harness/patches/api-keys.sh',
      'harness/patches/slot-swap.sh',
      'harness/smoke.sh',
      'harness/steps.sh',
    ])
  })

  it('does not change when docs/RUNBOOK.md, lib/receipts/classify.ts or the preview runner change', () => {
    const dir = copy()
    const h = harnessHash(dir)
    writeFileSync(join(dir, 'docs', 'RUNBOOK.md'), 'edited\n')
    writeFileSync(join(dir, 'lib', 'receipts', 'classify.ts'), '// edited\n')
    writeFileSync(join(dir, 'harness', 'local', 'run-cell.sh'), '# edited\n')
    expect(harnessHash(dir)).toBe(h)
  })

  it('changes when a cell file or a patch changes', () => {
    const dir = copy()
    const h = harnessHash(dir)
    writeFileSync(join(dir, 'harness', 'steps.sh'), `${readFileSync(join(dir, 'harness', 'steps.sh'), 'utf8')}\n# x\n`)
    const h2 = harnessHash(dir)
    expect(h2).not.toBe(h)
    writeFileSync(join(dir, 'harness', 'patches', 'new.sh'), '#!/bin/sh\n')
    expect(harnessHash(dir)).not.toBe(h2)
  })

  it('receipt ids are r_<yyyymmdd>_<key12>', () => {
    expect(receiptId('2026-10-23T02:17:00Z', 'ab'.repeat(32))).toBe('r_20261023_abababababab')
  })
})

// The scripts use GNU sed; they run on ubuntu-latest (validate.yml) and in the preview container, not on macOS.
const linux = process.platform === 'linux' && spawnSync('sed', ['--version']).status === 0
describe.skipIf(!linux)('harness scripts on Linux', () => {
  const app = () => {
    const dir = tmp('app')
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'src', 'modules.ts'), MODULES_TS_09)
    return dir
  }
  const run = (dir: string, script: string, args: string[] = []) =>
    execFileSync('bash', [join(ROOT, 'harness', script), ...args], { cwd: dir, encoding: 'utf8' })

  it('api-keys registers api_keys after auth once', () => {
    const dir = app()
    run(dir, 'patches/api-keys.sh')
    run(dir, 'patches/api-keys.sh')
    const t = readFileSync(join(dir, 'src', 'modules.ts'), 'utf8')
    expect(t.match(/id: 'api_keys'/g)?.length).toBe(1)
    expect(t.indexOf("id: 'api_keys'")).toBeGreaterThan(t.indexOf("id: 'auth'"))
    expect(t).toContain("  { id: 'api_keys', from: '@open-mercato/core' },")
  })

  it('slot-swap removes the core registration of a replaced module', () => {
    const dir = app()
    run(dir, 'patches/slot-swap.sh', ['dashboards'])
    expect(readFileSync(join(dir, 'src', 'modules.ts'), 'utf8')).not.toContain("id: 'dashboards'")
  })

  it('env.sh keeps one value per key and no NODE_ENV', () => {
    const dir = app()
    writeFileSync(join(dir, '.env.example'), 'DATABASE_URL=postgres://x\nexport PORT = 3000\nOTHER=1\n')
    run(dir, 'env.sh')
    const env = readFileSync(join(dir, '.env'), 'utf8')
    expect(env.match(/^DATABASE_URL=/gm)?.length).toBe(1)
    expect(env).toContain('DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/open-mercato')
    expect(env).toContain('OTHER=1')
    expect(env).not.toMatch(/PORT = 3000/)
    expect(env).not.toMatch(/^NODE_ENV/m)
  })
})
