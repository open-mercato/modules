// AGENTS.md rule 4 on the preview path (audit of 29 Oct, C11): third-party module code runs only on GitHub Actions
// ubuntu-latest, never on a preview host (Cezar holds secrets). Golden cases: `foreignCode` names what a cell would run
// from outside @open-mercato; `cells-local` refuses those cells with a message and keeps them out of the run's matrix;
// `plan-matrix --runner preview-docker` never plans them; `run-cell.sh` refuses such an env file before Docker.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cellEnv, foreignCode } from '../../lib/commands/cells-local.ts'
import type { Matrix, MatrixCell } from '../../lib/receipts/matrix.ts'
import { loadFixture, LOC, NIGHT, plan, ROOT, tmp } from './helpers.ts'

const fx = loadFixture()
const m = plan(fx, { onlyPresets: ['classic'], runner: 'preview-docker' })
const of = (loc: string | null, line: string): MatrixCell =>
  m.cells.find((c) => c.locator === loc && c.line === line && c.mode === 'realistic')!
const KSEF = '@fastwhitecat/integration-ksef-direct'

function cli(args: string[]) {
  return spawnSync(process.execPath, ['lib/cli.ts', ...args], { cwd: ROOT, encoding: 'utf8' })
}

describe('foreignCode: what a cell would run from outside @open-mercato', () => {
  it('a baseline and an official module run nothing foreign, a third-party module does', () => {
    expect(foreignCode(of(null, '0.9'))).toEqual([])
    expect(foreignCode(of(LOC.stripe, '0.9'))).toEqual([])
    expect(foreignCode(of(LOC.ksef, '0.9'))).toEqual([KSEF])
    // the module and the catalog module it requires
    expect(foreignCode(of(LOC.datasync, '0.9'))).toEqual([
      '@fullstackhouse/open-mercato-data-sync-durable',
      '@fullstackhouse/open-mercato-durable-work',
    ])
  })

  it('an official module is refused for a foreign library, a foreign tarball or a foreign package of its app', () => {
    const stripe = of(LOC.stripe, '0.9')
    expect(
      foreignCode({ ...stripe, requiresSpecs: ['core:integrations', 'lib:@open-mercato/ai-assistant@0.9.0'] }),
    ).toEqual([])
    expect(foreignCode({ ...stripe, requiresSpecs: ['lib:@acme/payments@1.0.0'] })).toEqual(['@acme/payments'])
    expect(foreignCode({ ...stripe, requiresSpecs: ['left-pad@1.3.0'] })).toEqual(['left-pad'])
    const tarball = '@open-mercato/gateway-stripe@https://codeload.github.com/acme/gateway-stripe/tar.gz/v1'
    expect(foreignCode({ ...stripe, moduleSpec: tarball })).toEqual([tarball])
    expect(
      foreignCode({
        ...stripe,
        moduleSpec: '@open-mercato/gateway-stripe@https://codeload.github.com/open-mercato/core/tar.gz/v0.9.0',
      }),
    ).toEqual([])
    expect(foreignCode({ ...of(null, '0.9'), presetPackages: ['@open-mercato/core', '@acme/x'] })).toEqual(['@acme/x'])
    expect(foreignCode({ ...stripe, thirdParty: true })).toEqual(['@open-mercato/gateway-stripe'])
  })
})

describe('cells-local refuses third-party cells', () => {
  function matrixFile(): string {
    const out = tmp('scope')
    writeFileSync(join(out, 'matrix.json'), `${JSON.stringify(m)}\n`)
    return out
  }

  it('golden: a third-party cell alone is refused with a message and no run', () => {
    const out = matrixFile()
    const r = cli(['cells-local', '--out', out, '--cells', of(LOC.ksef, '0.9').key12, '--dry-run'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain(`refused ${of(LOC.ksef, '0.9').label}: it runs ${KSEF}`)
    expect(r.stderr).toContain('GitHub Actions')
    expect(r.stdout).not.toContain('dry run:')
  })

  it('golden: with an official cell beside it, only the official one runs and the matrix of the run holds it alone', () => {
    const out = matrixFile()
    const ksef = of(LOC.ksef, '0.9')
    const stripe = of(LOC.stripe, '0.9')
    const r = cli(['cells-local', '--out', out, '--cells', `${ksef.key12},${stripe.key12}`, '--dry-run'])
    expect(r.status).toBe(0)
    expect(r.stderr).toContain(`refused ${ksef.label}`)
    const dir = /^dry run: (.+)$/m.exec(r.stdout)?.[1]
    expect(dir).toBeTruthy()
    const run = JSON.parse(readFileSync(join(dir!, 'artifacts', 'matrix-a1', 'matrix.json'), 'utf8')) as Matrix
    expect(run.cells.map((c) => c.key)).toEqual([stripe.key])
  })
})

describe('plan-matrix --runner preview-docker', () => {
  it('golden: plans no third-party cell and says how many it left out', () => {
    const out = tmp('scope-plan')
    const base = ['--event', 'workflow_dispatch', '--budget', '100000', '--now', NIGHT]
    const common = ['--data', join(ROOT, 'test', 'fixtures', 'data')]
    const modules = ['--modules', join(ROOT, 'test', 'fixtures', 'descriptors', 'valid', 'modules')]
    const r = cli(['plan-matrix', '--runner', 'preview-docker', ...base, ...modules, ...common, '--out', out])
    expect(r.status, r.stderr).toBe(0)
    const planned = JSON.parse(readFileSync(join(out, 'matrix.json'), 'utf8')) as Matrix
    expect(planned.cells.length).toBeGreaterThan(0)
    expect(planned.cells.some((c) => c.baseline)).toBe(true)
    expect(planned.cells.filter((c) => foreignCode(c).length > 0)).toEqual([])
    expect(r.stdout).toMatch(/preview: \d+ third-party cell\(s\) left out/)
    // the CI plan keeps them
    const ci = tmp('scope-plan-ci')
    expect(cli(['plan-matrix', ...base, ...modules, ...common, '--out', ci]).status).toBe(0)
    const all = JSON.parse(readFileSync(join(ci, 'matrix.json'), 'utf8')) as Matrix
    expect(all.cells.some((c) => c.thirdParty)).toBe(true)
  })
})

// run-cell.sh needs bash 4 (associative arrays): it runs on the Linux preview host and in CI, not on macOS bash 3.2.
const bash4 = /version [4-9]/.test(spawnSync('bash', ['--version'], { encoding: 'utf8' }).stdout ?? '')

describe('run-cell.sh refuses a third-party env file before Docker', () => {
  it.skipIf(!bash4)('exit 77, and docker is never called', () => {
    const dir = tmp('scope-runcell')
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    const called = join(dir, 'docker-called')
    writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash\ntouch '${called}'\nexit 99\n`)
    chmodSync(join(bin, 'docker'), 0o755)
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` }
    const run = (cell: MatrixCell, name: string) => {
      const f = join(dir, `${name}.env`)
      writeFileSync(f, cellEnv(cell))
      return spawnSync('bash', [join(ROOT, 'harness', 'local', 'run-cell.sh'), '--env', f, '--out', join(dir, name)], {
        env,
        encoding: 'utf8',
      })
    }
    const ksef = run(of(LOC.ksef, '0.9'), 'ksef')
    expect(ksef.status).toBe(77)
    expect(ksef.stderr).toContain(KSEF)
    const lib = run({ ...of(LOC.stripe, '0.9'), requiresSpecs: ['lib:@acme/payments@1.0.0'] }, 'lib')
    expect(lib.status).toBe(77)
    expect(lib.stderr).toContain('@acme/payments')
    expect(existsSync(called)).toBe(false)
  })

  it('the guard stands before the first docker call of the script', () => {
    const s = readFileSync(join(ROOT, 'harness', 'local', 'run-cell.sh'), 'utf8')
    const guard = s.indexOf('exit 77')
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(s.indexOf('docker image inspect'))
  })
})
