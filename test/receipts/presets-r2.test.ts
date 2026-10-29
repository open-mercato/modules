// The final review of the two presets (24 Oct), the receipts side. Golden cases: streams and retries started in the
// same second get their own run ids; a step the preview runner's memory limit cut short is infra; a red classic baseline
// that names only packages its new app ships is held against them, not against the line; the memo says what it rests on.
// When a cell runs (one predicate for the plan and the site): test/receipts/cadence-r2.test.ts.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cellEnv, claimRunId } from '../../lib/commands/cells-local.ts'
import { verifiedRules } from '../../lib/core/tier.ts'
import { classifyStep, failurePackages } from '../../lib/receipts/classify.ts'
import type { BundleAttempt, CellOutcome, NightBundle } from '../../lib/receipts/from-actions.ts'
import type { Matrix, MatrixCell } from '../../lib/receipts/matrix.ts'
import { applyNight, retryKeys } from '../../lib/receipts/state.ts'
import { Receipt, type Facts } from '../../lib/schema/data/index.ts'
import {
  CONSENTS_TS,
  fixturePlanEntries,
  harness,
  loadFixture,
  LOC,
  NIGHT,
  outcome,
  plan,
  ROOT,
  tmp,
} from './helpers.ts'

const fx = loadFixture()
const STRIPE = '@open-mercato/gateway-stripe'
const of = (m: Matrix, loc: string | null, line: string, preset: 'classic' | 'empty'): MatrixCell | undefined =>
  m.cells.find((c) => c.locator === loc && c.line === line && c.preset === preset && c.mode === 'realistic')

describe('run ids of streams and retries started in the same second (P1)', () => {
  it('claimRunId takes the next id when a run directory exists, and gives a taken remote id back', () => {
    const out = tmp('runid')
    mkdirSync(join(out, 'preview', '1000'), { recursive: true })
    expect(claimRunId(out, 1000)).toBe(1001)
    expect(claimRunId(out, 1000, (id) => id !== 1002)).toBe(1003)
    expect(claimRunId(out, 2000, () => 'ssh failed')).toBe('ssh failed')
  })

  it('golden: three real `cells-local --dry-run` retries started together get three run ids', async () => {
    const out = tmp('runid-cli')
    const m = plan(fx, { onlyPresets: ['classic'], runner: 'preview-docker' })
    writeFileSync(join(out, 'matrix.json'), `${JSON.stringify(m)}\n`)
    // an official cell: cells-local refuses a third-party one (AGENTS.md rule 4, test/receipts/preview-scope.test.ts)
    const key = of(m, LOC.stripe, '0.9', 'classic')!.key12
    const run = () =>
      new Promise<string>((resolve, reject) => {
        const p = spawn(
          process.execPath,
          [
            'lib/cli.ts',
            'cells-local',
            '--out',
            out,
            '--attempt',
            '2',
            '--parent',
            '1792829019',
            '--cells',
            key,
            '--dry-run',
          ],
          { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
        )
        let text = ''
        p.stdout.on('data', (b: Buffer) => (text += b.toString()))
        p.on('error', reject)
        p.on('close', (code) => (code === 0 ? resolve(text) : reject(new Error(`exit ${code}: ${text}`))))
      })
    const outs = await Promise.all([run(), run(), run()])
    const dirs = outs.map((t) => /^dry run: (.+)$/m.exec(t)?.[1])
    expect(dirs.every(Boolean)).toBe(true)
    expect(new Set(dirs).size).toBe(3)
  }, 60_000)
})

describe('the memory limit of a preview cell (P2)', () => {
  it('a step the limit cut short is infra on every attempt, and the receipt names the limit', () => {
    const log =
      'Creating an optimized production build ...\n[harness] cell out of memory: the 8g limit of the preview runner killed 1 process(es)\n'
    for (const attempt of [1, 2]) {
      const f = classifyStep('build', log, { attempt, oom: true })
      expect([f.classification, f.rule]).toEqual(['infra', 'cell-oom'])
    }
    // the tail of the classic baseline of 0.9 at 8g on Cezar (24 Oct): next build's type check lost to the limit; without
    // the marker the `type-check` rule made it a red baseline, every classic cell of the line `harness-red`
    const real =
      '  Creating an optimized production build ...\n✓ Compiled successfully in 108s\n  Running TypeScript ...\n✓ Finished writing to filesystem cache in 20.1s\nFailed to type check.\n\n[harness] cell out of memory: the 8g limit of the preview runner killed 1 process(es)\n'
    expect(classifyStep('build', real, { attempt: 1, oom: true }).rule).toBe('cell-oom')
    expect(classifyStep('build', real.replace(/\n\[harness\].*\n$/, '\n'), { attempt: 1 }).rule).toBe('type-check')
    const m = plan(fx, { onlyPresets: ['classic'], runner: 'preview-docker' })
    const ksef = of(m, LOC.ksef, '0.9', 'classic')!
    const res = applyNight({
      bundle: bundleOf(m, [outcome(of(m, null, '0.9', 'classic')!), outcome(ksef, { memory: '8g' })]),
      history: () => [],
      harness: harness(),
      presets: null,
    })
    expect(res.receipts.find((r) => r.locator === LOC.ksef)!.receipt.harness.memory).toBe('8g')
    const runCell = readFileSync(join(ROOT, 'harness', 'local', 'run-cell.sh'), 'utf8')
    expect(runCell).toContain('/sys/fs/cgroup/memory.events')
    expect(runCell).toContain('[harness] cell out of memory')
    expect(runCell).toContain('"runner_memory":"%s"')
    // the kill count goes into the step entry of job.json, outside what the module can write (finding of 25 Oct)
    expect(runCell).toContain('${5:+,\\"oom_kills\\":$5}')
    expect(runCell).toContain('add_step "$step" "${outcome[$step]}" "$t0" "$t1" "$oom"')
  })

  it('a marker line the module prints decides nothing: only the runner-counted oom_kills makes the step infra', () => {
    // a module can print the marker from add, build or start (its stdout is the step log)
    const forged =
      "src/modules/x/index.ts(3,1): error TS2307: Cannot find module './missing'.\n[harness] cell out of memory: the 8g limit of the preview runner killed 1 process(es)\n"
    for (const attempt of [1, 2]) {
      const f = classifyStep('typecheck', forged, { attempt })
      expect([f.classification, f.rule]).toEqual(['module-fail', 'ts-error'])
    }
    expect(classifyStep('typecheck', forged, { attempt: 1, oom: true })).toMatchObject({
      classification: 'infra',
      rule: 'cell-oom',
    })
    // a forged marker on a step without any other rule is an ordinary unmatched failure of the module
    expect(classifyStep('start', '[harness] cell out of memory: x\n', { attempt: 1 }).classification).toBe(
      'module-fail',
    )
    // tampered files still blame the module, OOM or not
    expect(classifyStep('add', 'tampered-files: src/modules.ts\n', { attempt: 1, oom: true }).rule).toBe(
      'tampered-files',
    )
  })
})

function bundleOf(m: Matrix, outcomes: CellOutcome[], second: CellOutcome[] = []): NightBundle {
  const attempts: BundleAttempt[] = [
    {
      attempt: 1,
      run: { id: 100, url: 'https://github.com/wojciechszyjka/modules/actions/runs/100', at: NIGHT },
      outcomes,
    },
  ]
  if (second.length)
    attempts.push({
      attempt: 2,
      run: { id: 200, url: 'https://github.com/wojciechszyjka/modules/actions/runs/200', at: NIGHT },
      outcomes: second,
    })
  return {
    schema: 1,
    runner: m.runner,
    night: { id: 100, url: 'https://github.com/wojciechszyjka/modules/actions/runs/100', at: NIGHT },
    matrix: m,
    attempts,
    retry: [],
    notes: [],
  }
}

describe('a red classic baseline held against the packages its new app ships (P2)', () => {
  // gateway-stripe with an authenticated GET route, so the classic baseline smoke-tests it
  const route = '/api/gateway_stripe/settings'
  const withRoute = (f: Facts | null): Facts | null =>
    f && {
      ...f,
      modules: f.modules.map((x) => ({
        ...x,
        http: { ...x.http, routes: [{ method: 'GET', path: route, requireAuth: true } as never] },
      })),
    }
  const entries = fixturePlanEntries(fx).map((e) =>
    e.locator === LOC.stripe ? { ...e, facts: (v: string) => withRoute(e.facts(v)) } : e,
  )
  const m = plan(fx, { onlyPresets: ['classic'], entries })
  const base = of(m, null, '0.9', 'classic')!
  const stripe = of(m, LOC.stripe, '0.9', 'classic')!
  const ksef = of(m, LOC.ksef, '0.9', 'classic')!
  const consents = of(m, LOC.consents, '0.9', 'classic')!
  const presetFail = `smoke: POST /api/auth/login -> 200\nsmoke: backend GET /backend -> 200\nsmoke: FAIL preset ${STRIPE} api GET ${route} -> 500 (expected 2[0-9][0-9])\n{"error":"boom"}\nsmoke: 1 check(s) failed\nsmoke: FAIL server log has errors:\n12:Error: boom\n`

  it('golden: the plan smoke-tests the route of every package a new app ships in its classic baseline', () => {
    expect(base.presetPackages).toContain(STRIPE)
    expect(base.presetSmoke).toEqual([`${STRIPE}=${route}`])
    expect(cellEnv(base)).toContain(`SMOKE_PRESET='${STRIPE}=${route}'\n`)
    expect(of(m, LOC.ksef, '0.9', 'classic')!.presetSmoke).toEqual([])
    const nightly = readFileSync(join(ROOT, '.github', 'workflows', 'nightly.yml'), 'utf8')
    expect(nightly).toContain("SMOKE_PRESET: ${{ join(matrix.cell.presetSmoke, ' ') }}")
    expect(readFileSync(join(ROOT, 'harness', 'local', 'run-cell.sh'), 'utf8')).toMatch(/SMOKE_PATHS SMOKE_PRESET\)/)
  })

  it('a failure names packages only when nothing else failed', () => {
    const lines = (t: string) => t.split('\n')
    expect(failurePackages('smoke', lines(presetFail))).toEqual([STRIPE])
    expect(
      failurePackages('smoke', lines(`${presetFail}smoke: FAIL backend GET /backend -> 500 (expected 200)\n`)),
    ).toEqual([])
    const ts = (file: string) => `${file}(3,1): error TS2307: Cannot find module 'x'.`
    expect(
      failurePackages('typecheck', [
        ts(`node_modules/${STRIPE}/dist/modules/a.d.ts`),
        ts(`node_modules/${STRIPE}/b.ts`),
      ]),
    ).toEqual([STRIPE])
    expect(failurePackages('typecheck', [ts(`node_modules/${STRIPE}/b.ts`), ts('src/modules.ts')])).toEqual([])
    expect(classifyStep('smoke', presetFail, { attempt: 1 }).packages).toEqual([STRIPE])
  })

  it('golden: the baseline keeps harness-red with its culprit; the culprit is broken, a pass elsewhere is verified', () => {
    const first = [
      outcome(base, { fail: { smoke: presetFail } }),
      outcome(stripe, { fail: { smoke: `smoke: FAIL module api GET ${route} -> 500 (expected 2[0-9][0-9])\n` } }),
      outcome(ksef),
      outcome(consents, { fail: { typecheck: CONSENTS_TS } }),
    ]
    // the culprit retries, the others do not (their pass stands, their failure is not judged)
    const keys = retryKeys(m.cells, first, () => [])
    expect(keys).toContain(base.key)
    expect(keys).toContain(stripe.key)
    expect(keys).not.toContain(ksef.key)
    expect(keys).not.toContain(consents.key)
    const second = [
      outcome(base, { attempt: 2, fail: { smoke: presetFail } }),
      outcome(stripe, {
        attempt: 2,
        fail: { smoke: `smoke: FAIL module api GET ${route} -> 500 (expected 2[0-9][0-9])\n` },
      }),
    ]
    const res = applyNight({ bundle: bundleOf(m, first, second), history: () => [], harness: harness(), presets: null })
    const r = (loc: string | null) =>
      res.receipts.find((x) => x.locator === loc && x.receipt.om.line === '0.9')!.receipt
    expect(r(null).result).toMatchObject({ status: 'harness-red', culprits: [STRIPE] })
    expect(r(LOC.stripe).result.status).toBe('broken')
    expect(r(LOC.stripe).transition.confirmed).toBe(true)
    expect(r(LOC.ksef).result.status).toBe('verified')
    expect(r(LOC.ksef).baseline).toEqual({ status: 'harness-red', receipt: r(null).id, culprits: [STRIPE] })
    expect(r(LOC.consents).result.status).toBe('harness-red')
    expect(res.report.some((l) => l.includes(`(held against ${STRIPE})`))).toBe(true)
    // a red baseline that names the platform keeps every cell harness-red
    const platform = applyNight({
      bundle: bundleOf(m, [
        outcome(base, { fail: { smoke: 'smoke: FAIL backend GET /backend -> 500 (expected 200)\n' } }),
        outcome(ksef),
      ]),
      history: () => [],
      harness: harness(),
      presets: null,
    })
    const k = platform.receipts.find((x) => x.locator === LOC.ksef)!.receipt
    expect(k.result.status).toBe('harness-red')
    expect(platform.receipts.find((x) => x.locator === null)!.receipt.result.culprits).toBeUndefined()
  })

  it('VER-1 counts a pass beside a baseline held against another package, never beside its own', () => {
    const own = fx.receipts(LOC.ksef)
    const held = (culprits: string[]) =>
      own.map((x) =>
        Receipt.parse(
          x.om.line === '0.9' && x.om.preset === 'classic' && x.result.status === 'verified'
            ? { ...x, baseline: { status: 'harness-red', receipt: 'r_20261023_aaaaaaaaaaaa', culprits } }
            : x,
        ),
      )
    const ver1 = (receipts: Receipt[]) =>
      verifiedRules({
        source: 'npm',
        npm: fx.sync(LOC.ksef)!.npm!.name,
        descriptorGithub: 'FastWhiteCat/openmercato-module-ksef',
        sync: fx.sync(LOC.ksef),
        receipts,
        lines: fx.lines.lines,
        recommended: { '0.9': '0.1.8' },
        githubVersion: null,
        signals: {
          receipt: { '0.9': 'verified' },
          fit: { '0.9': 'ok' },
          supplyChain: { status: 'ok', reasons: [] },
          hygiene: { status: 'ok', failing: [] },
        },
        now: NIGHT,
      }).find((x) => x.id === 'VER-1')!
    expect(ver1(held([STRIPE])).pass).toBe(true)
    expect(ver1(held([LOC.ksef.slice(4)])).detail).toBe('Receipt on 0.9: verified, but the baseline was not green.')
    expect(ver1(held([])).pass).toBe(false)
  })

  it('golden: smoke.sh names the package of a red preset route (a real server)', async () => {
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/auth/login') {
        res.writeHead(200, { 'set-cookie': 'auth=1; Path=/' })
        return res.end('{}')
      }
      if (req.url === '/backend') return res.end('ok')
      if (req.url === route) {
        res.writeHead(500, { 'content-type': 'application/json' })
        return res.end('{"error":"boom"}')
      }
      if (req.url === '/api/webhooks/list') return res.end('{"items":[]}')
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as AddressInfo).port
    try {
      const { code, text } = await new Promise<{ code: number | null; text: string }>((resolve) => {
        const p = spawn('bash', [join(ROOT, 'harness', 'smoke.sh')], {
          env: {
            ...process.env,
            PORT: String(port),
            SMOKE_API: '',
            SMOKE_PRESET: `${STRIPE}=${route} @open-mercato/webhooks=/api/webhooks/list`,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let text = ''
        p.stdout.on('data', (b: Buffer) => (text += b.toString()))
        p.on('close', (c) => resolve({ code: c, text }))
      })
      expect(code).toBe(1)
      expect(text).toContain(`smoke: FAIL preset ${STRIPE} api GET ${route} -> 500 (expected 2[0-9][0-9])`)
      expect(text).toContain('smoke: preset @open-mercato/webhooks api GET /api/webhooks/list -> 200')
      expect(failurePackages('smoke', text.split('\n'))).toEqual([STRIPE])
    } finally {
      server.close()
    }
  }, 30_000)
})

describe('the memo says what it rests on (P3)', () => {
  it('golden: fresh isolation receipts of another harness are counted apart, with the time the first runs again', () => {
    const entries = fixturePlanEntries(fx, { receipts: (loc) => fx.receipts(loc) })
    const p = plan(fx, { onlyPresets: null, entries })
    expect(p.memoIsolation).toBeGreaterThan(0)
    expect(p.memo).toBeGreaterThanOrEqual(p.memoIsolation!)
    const iso = entries
      .flatMap((e) => e.receipts)
      .filter((r) => r.om.preset !== 'classic' && r.module && r.transition.confirmed)
      .map((r) => Date.parse(r.run.at))
    const first = new Date(Math.min(...iso) + 7 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
    expect(p.memoIsolationUntil! >= first).toBe(true)
    expect(Date.parse(p.memoIsolationUntil!)).toBeGreaterThan(Date.parse(NIGHT))
  })
})
