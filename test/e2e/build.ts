// Builds the two static sites the e2e suite reads (WP16): `real` from a data checkout (E2E_DATA, default .data),
// and `stale`, a variant of the CI fixture (test/fixtures/data) whose newest receipt (`dataAsOf.nightly`) is 3 days
// and 1 hour old while `generatedAt` and the npm check are fresh, so the STALE DATA banner of spec 7.6 / 7.8 (P5)
// must show. The stale variant is built first, so site/.generated ends up holding the real data.
//   node test/e2e/build.ts                 (wrap it in a build lock on a shared machine: lockf -k /tmp/om-build.lock)
// Env: E2E_DATA (data dir), E2E_OUT (default out/e2e), E2E_STALE_SOURCE (default test/fixtures/data),
// E2E_ONLY=real|stale. SITE_URL and BASE_PATH reach emit and astro as usual.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const out = resolve(root, process.env.E2E_OUT ?? 'out/e2e')
const realData = resolve(root, process.env.E2E_DATA ?? '.data')
const staleSource = resolve(root, process.env.E2E_STALE_SOURCE ?? 'test/fixtures/data')
const only = process.env.E2E_ONLY

/** Age of `dataAsOf.nightly` in the stale variant: 3 days and 1 hour (the banner threshold is 48 h). */
export const STALE_AGE_MS = (3 * 24 + 1) * 3600 * 1000

function run(cmd: string, args: string[], env: Record<string, string> = {}): void {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ...env },
  })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status}`)
}

function files(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, acc)
    else acc.push(p)
  }
  return acc
}

const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

/** Copy of `src` where every receipt ran at now - 3 days 1 hour and the npm check (`resolvedAt`) is an hour old. */
export function staleVariant(src: string, dest: string, now: number): { nightly: string; npm: string } {
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true })
  const nightly = iso(now - STALE_AGE_MS)
  const npm = iso(now - 3600 * 1000)
  const receipts = join(dest, 'receipts')
  for (const f of existsSync(receipts) ? files(receipts) : []) {
    if (!f.endsWith('.jsonl')) continue
    const lines = readFileSync(f, 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => {
        const r = JSON.parse(l) as { run: { at: string }; harness: { runner: string } }
        if (r.harness.runner === 'preview-docker')
          throw new Error(`${f}: a preview receipt never turns stale; the stale variant needs CI receipts`)
        r.run.at = nightly
        return JSON.stringify(r)
      })
    writeFileSync(f, `${lines.join('\n')}\n`)
  }
  const linesFile = join(dest, 'lines.json')
  if (existsSync(linesFile)) {
    const l = JSON.parse(readFileSync(linesFile, 'utf8')) as { resolvedAt: string }
    l.resolvedAt = npm
    writeFileSync(linesFile, `${JSON.stringify(l, null, 2)}\n`)
  }
  return { nightly, npm }
}

function build(data: string, dist: string, now: number): void {
  rmSync(dist, { recursive: true, force: true })
  run('node', ['lib/cli.ts', 'emit', '--data', data, '--now', iso(now)])
  run(join(root, 'node_modules', '.bin', 'astro'), ['build', '--outDir', dist])
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(out, { recursive: true })
  const now = Date.now()
  if (only !== 'real') {
    const v = staleVariant(staleSource, join(out, 'stale-data'), now)
    build(join(out, 'stale-data'), join(out, 'stale'), now)
    writeFileSync(join(out, 'stale', '.e2e-stale.json'), `${JSON.stringify({ ...v, generatedAt: iso(now) })}\n`)
  }
  if (only !== 'stale') {
    if (!existsSync(realData)) console.warn(`e2e build: ${realData} does not exist; the real site shows empty states`)
    build(realData, join(out, 'real'), now)
  }
  console.log(`e2e build: done in ${out}`)
}
