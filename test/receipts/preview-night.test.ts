// scripts/preview-night.sh (review of 24 Oct: the night command looped once in zsh, with every run directory in one
// word, and passed an empty retry run to collect). Run in bash with a stub in place of `node lib/cli.ts`: three
// streams apart, stream 1 (the baselines) collected with apply before the others read their retry keys, retries with
// --parent, and a retry that prints no run directory collected without it.
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT, tmp } from './helpers.ts'

function stub(dir: string): string {
  const p = join(dir, 'om-stub.sh')
  writeFileSync(
    p,
    `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >>"$STUB_LOG"
cmd=$1; shift
out='' shard='' attempt=1 parent='' noapply=0 first=''
while [[ $# -gt 0 ]]; do
  case "$1" in
  --out) out=$2; shift 2 ;;
  --shard) shard=$2; shift 2 ;;
  --attempt) attempt=$2; shift 2 ;;
  --parent) parent=$2; shift 2 ;;
  --local) [[ -n "$first" ]] || first=$2; shift 2 ;;
  --no-apply) noapply=1; shift ;;
  *) shift ;;
  esac
done
case "$cmd" in
cells-local)
  if [[ "$attempt" == 2 ]]; then
    # the retry of the third stream fails before it prints its run directory
    [[ "$parent" == 1003 ]] && exit 1
    d="$out/preview/2\${parent}"; mkdir -p "$d"; echo "preview run: $d"
  else
    i=\${shard%%/*}; d="$out/preview/100$i"; mkdir -p "$d"; echo "preview run: $d"
  fi ;;
collect)
  if [[ "$noapply" == 1 ]]; then mkdir -p "$out"; echo '{"keys":["k'"$(basename "$first")"'"]}' >"$out/retry.json"; fi ;;
esac
`,
  )
  chmodSync(p, 0o755)
  return p
}

describe('scripts/preview-night.sh', () => {
  it('golden: three streams, stream 1 applied first, retries with --parent, a failed retry collected without it', () => {
    const dir = tmp('night')
    const data = join(dir, 'data')
    const out = join(dir, 'out')
    mkdirSync(data)
    const log = join(dir, 'calls.log')
    execFileSync(
      'bash',
      [
        join(ROOT, 'scripts', 'preview-night.sh'),
        '--data',
        data,
        '--out',
        out,
        '--host',
        'local',
        '--streams',
        '3',
        '--stagger',
        '0',
        '--force',
      ],
      { env: { ...process.env, OM_CLI: stub(dir), STUB_LOG: log }, cwd: ROOT, stdio: 'pipe' },
    )
    const calls = readFileSync(log, 'utf8').trim().split('\n')
    const at = (re: RegExp) => calls.findIndex((c) => re.test(c))
    expect(calls[0]).toMatch(
      /^plan-matrix --runner preview-docker --event workflow_dispatch --budget 100000 .* --preset classic$/,
    )
    for (const i of [1, 2, 3]) expect(at(new RegExp(`^cells-local .* --shard ${i}/3$`))).toBeGreaterThan(0)
    // stream 1: no-apply, its retry, then collect with both runs, before any other stream reads its retry keys
    const apply1 = at(new RegExp(`^collect --local ${out}/preview/1001 --local ${out}/preview/21001 `))
    expect(apply1).toBeGreaterThan(at(/^cells-local .* --attempt 2 --parent 1001 /))
    expect(apply1).toBeLessThan(at(new RegExp(`^collect --local ${out}/preview/1002 --no-apply`)))
    expect(apply1).toBeLessThan(at(new RegExp(`^collect --local ${out}/preview/1003 --no-apply`)))
    // stream 2 with its retry; stream 3's retry printed nothing: collected alone, never with an empty --local
    expect(at(new RegExp(`^collect --local ${out}/preview/1002 --local ${out}/preview/21002 `))).toBeGreaterThan(0)
    expect(at(new RegExp(`^collect --local ${out}/preview/1003 --data `))).toBeGreaterThan(0)
    expect(calls.some((c) => /--local {2}|--local $|--local --/.test(c))).toBe(false)
    expect(calls.filter((c) => c.startsWith('collect') && !c.includes('--no-apply'))).toHaveLength(3)
    // 10g per cell, retries too: at 8g a classic build lost its type check to the limit (Cezar, 24 Oct)
    expect(calls.filter((c) => /^cells-local .*--memory 10g /.test(c))).toHaveLength(6)
  })

  it('two streams of 10g; a host it cannot measure is said so, not called busy', () => {
    const dir = tmp('night2')
    const data = join(dir, 'data')
    mkdirSync(data)
    const log = join(dir, 'calls.log')
    const args = [
      join(ROOT, 'scripts', 'preview-night.sh'),
      '--data',
      data,
      '--out',
      join(dir, 'out'),
      '--host',
      'local',
    ]
    const env = { ...process.env, OM_CLI: stub(dir), STUB_LOG: log }
    execFileSync('bash', [...args, '--streams', '2', '--stagger', '0', '--force'], { env, cwd: ROOT, stdio: 'pipe' })
    expect(
      readFileSync(log, 'utf8')
        .split('\n')
        .filter((c) => /^cells-local .*--memory 10g /.test(c)),
    ).toHaveLength(4)
    if (process.platform !== 'darwin') return
    // no /proc/meminfo on macOS: exit 75 with the reason and the way past it
    const r = spawnSync('bash', [...args, '--stagger', '0'], { env, cwd: ROOT, encoding: 'utf8' })
    expect(r.status).toBe(75)
    expect(r.stdout).toMatch(/cannot measure .*no \/proc\/meminfo.*pass --force/)
  })
})
