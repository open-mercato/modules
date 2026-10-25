#!/usr/bin/env bash
# preview-night.sh: one preview night on a Docker host (Cezar) in parallel streams, collected into a data copy.
#
#   bash scripts/preview-night.sh --data <dir> --out <dir> --host <ssh target>|local (or OM_PREVIEW_HOST) [--streams 2] [--stagger 300]
#        [--memory 10g] [--preset classic|empty|both] [--lines 0.9,next] [--min-free-gb 8] [--min-free-mem-gb <n>]
#        [--plan-only] [--force]
#
# 1. plan-matrix --runner preview-docker --event workflow_dispatch --budget 100000: every cell of the lines, no budget cut
#    (the host runs the streams one cell at a time each).
# 2. The host must be idle: no cell container (omcell-*) and at least --min-free-mem-gb of available memory (default the
#    sum of the limits, streams x --memory), else the night does not start (--force skips it). --memory is 10g: at 8g
#    the build of a classic baseline lost its type check to the memory limit (Cezar, 24 Oct), so three streams need
#    30 GB and the default is two (Cezar has about 28 GB free). A step the limit cuts short is marked by run-cell.sh
#    and collected as infra, never as broken.
# 3. cells-local --shard i/n per stream, started --stagger seconds apart, so the builds of the streams drift apart.
# 4. Stream 1 holds every baseline: collect --no-apply, retry its red and infra cells (attempt 2), collect with apply.
# 5. Streams 2..n: collect --no-apply (their retry keys read the baselines stream 1 wrote), the retries in parallel
#    (each claims its own run id, cells-local), then collect with apply, one stream after another (collect writes the
#    data).
# A retry that prints no run directory is reported, and its stream is collected without it.
# Runs in bash (3.2 on macOS too), never zsh: the run directories are an array, never a word-split string (review of
# 24 Oct).
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
data='' out='' host="${OM_PREVIEW_HOST:-}" streams=2 stagger=300 memory=10g preset=classic lines='' min_free_gb=8
min_mem='' plan_only=0 force=0
while [[ $# -gt 0 ]]; do
  case "$1" in
  --data) data=$2; shift 2 ;;
  --out) out=$2; shift 2 ;;
  --host) host=$2; shift 2 ;;
  --streams) streams=$2; shift 2 ;;
  --stagger) stagger=$2; shift 2 ;;
  --memory) memory=$2; shift 2 ;;
  --preset) preset=$2; shift 2 ;;
  --lines) lines=$2; shift 2 ;;
  --min-free-gb) min_free_gb=$2; shift 2 ;;
  --min-free-mem-gb) min_mem=$2; shift 2 ;;
  --plan-only) plan_only=1; shift ;;
  --force) force=1; shift ;;
  *) echo "preview-night: unknown argument $1" >&2; exit 64 ;;
  esac
done
[[ -n "$data" && -n "$out" ]] || { sed -n '2,22p' "$0" >&2; exit 64; }
[[ -n "$host" ]] || { echo "preview-night: --host <ssh target>, local, or OM_PREVIEW_HOST" >&2; exit 64; }
[[ "$streams" =~ ^[1-9]$ ]] || { echo "preview-night: --streams 1 to 9" >&2; exit 64; }
[[ "$stagger" =~ ^[0-9]+$ ]] || { echo "preview-night: --stagger in seconds" >&2; exit 64; }
[[ "$preset" =~ ^(classic|empty|both)$ ]] || { echo "preview-night: --preset classic, empty or both" >&2; exit 64; }
[[ "$memory" =~ ^[1-9][0-9]?g$ ]] || { echo "preview-night: --memory in gigabytes, e.g. 8g" >&2; exit 64; }
# the limits of the streams together must fit in the memory the host has free (review of 24 Oct: 3 x 10g on 30 GB)
if [[ -z "$min_mem" ]]; then min_mem=$((streams * ${memory%g})); fi
data=$(cd "$data" && pwd)
mkdir -p "$out"
out=$(cd "$out" && pwd)
cd "$root"
# OM_CLI: another command in place of `node lib/cli.ts` (test/receipts/preview-night.test.ts runs a stub)
om() { if [[ -n "${OM_CLI:-}" ]]; then "$OM_CLI" "$@"; else node lib/cli.ts "$@"; fi; }
say() { printf '%s preview-night: %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# 1. plan
plan=(plan-matrix --runner preview-docker --event workflow_dispatch --budget 100000 --data "$data" --out "$out")
[[ "$preset" == both ]] || plan+=(--preset "$preset")
[[ -z "$lines" ]] || plan+=(--lines "$lines")
om "${plan[@]}"
if [[ "$plan_only" == 1 ]]; then say "plan only: $out/matrix.json"; exit 0; fi

# 2. an idle host
on_host() { if [[ "$host" == local ]]; then bash -c "$1"; else ssh "$host" "$1"; fi; }
if [[ "$force" == 0 ]]; then
  busy=$(on_host 'docker ps -q --filter name=omcell- | wc -l' 2>/dev/null | tr -d ' ' || true)
  avail=$(on_host "awk '/MemAvailable/ {print int(\$2 / 1048576)}' /proc/meminfo" 2>/dev/null || true)
  if [[ ! "$avail" =~ ^[0-9]+$ || ! "$busy" =~ ^[0-9]+$ ]]; then
    # no /proc/meminfo (macOS) or no Docker: nothing measured is no idle host (review of 24 Oct: it said `not idle`)
    say "host $host: cannot measure its cell containers (${busy:-no docker}) or its available memory (${avail:-no /proc/meminfo}; the cells need a Linux Docker host): pass --force to start anyway"
    exit 75
  fi
  say "host $host: $busy cell containers running, ${avail} GB of memory available, $streams streams of $memory need $min_mem GB"
  if [[ "$busy" != 0 || "$avail" -lt "$min_mem" ]]; then
    say "the host is not idle: wait for its queue and other cells, run fewer streams (--streams 2) or pass --force"
    exit 75
  fi
fi

# 3. streams, started apart
cells=(cells-local --host "$host" --min-free-gb "$min_free_gb" --memory "$memory" --data "$data" --out "$out")
pids=()
for ((i = 1; i <= streams; i++)); do
  om "${cells[@]}" --shard "$i/$streams" >"$out/night-s$i.log" 2>&1 &
  pids+=($!)
  say "stream $i/$streams started (log $out/night-s$i.log)"
  if ((i < streams)); then sleep "$stagger"; fi
done
# a stream that stopped early (fence, ssh, disk) still prints its run directory with the cells that ran; one that
# printed none is reported below and has nothing to collect
for p in "${pids[@]}"; do wait "$p" || say "a stream ended with an error (see its log): the cells it ran are collected when it printed its run directory"; done

runs=()
for ((i = 1; i <= streams; i++)); do
  d=$(sed -n 's/^preview run: //p' "$out/night-s$i.log" | tail -n 1)
  if [[ -z "$d" ]]; then say "stream $i printed no run directory: nothing to collect from it"; continue; fi
  runs+=("$d")
done
[[ ${#runs[@]} -gt 0 ]] || { say 'no stream ran'; exit 1; }

keys_of() { node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log((r.keys ?? []).join(","))' "$1"; }
retry_of() { # <run dir>: runs the retry of a stream, prints its run directory or nothing
  local d=$1 r k
  r=$(basename "$d")
  k=$(keys_of "$out/c-$r/retry.json")
  [[ -n "$k" ]] || return 0
  om "${cells[@]}" --attempt 2 --parent "$r" --cells "$k" >"$out/retry-$r.log" 2>&1 || true
  sed -n 's/^preview run: //p' "$out/retry-$r.log" | tail -n 1
}
apply_of() { # <run dir> <retry run dir or empty>
  local d=$1 d2=$2 r
  r=$(basename "$d")
  if [[ -n "$d2" ]]; then om collect --local "$d" --local "$d2" --data "$data" --out "$out/c-$r"
  else om collect --local "$d" --data "$data" --out "$out/c-$r"; fi
}
note_retry() { # <run dir> <retry run dir or empty>
  local r k
  r=$(basename "$1")
  k=$(keys_of "$out/c-$r/retry.json")
  [[ -z "$k" || -n "$2" ]] || say "the retry of $r printed no run directory (log $out/retry-$r.log): collected without it"
}

# 4. stream 1 (the baselines) first
first=${runs[0]}
om collect --local "$first" --no-apply --data "$data" --out "$out/c-$(basename "$first")"
r2=$(retry_of "$first")
note_retry "$first" "$r2"
apply_of "$first" "$r2"
say "stream 1 collected: $(basename "$first")"

# 5. the other streams: retry keys against today's baselines, retries in parallel, collect one by one
rest=()
for ((i = 1; i < ${#runs[@]}; i++)); do rest+=("${runs[$i]}"); done
if [[ ${#rest[@]} -eq 0 ]]; then
  say "done. Next: node lib/cli.ts health --changed --data $data, then node lib/cli.ts emit --data $data && npx astro build"
  exit 0
fi
for d in "${rest[@]}"; do om collect --local "$d" --no-apply --data "$data" --out "$out/c-$(basename "$d")"; done
rpids=()
for d in "${rest[@]}"; do
  (retry_of "$d" >"$out/c-$(basename "$d")/retry-run.txt") &
  rpids+=($!)
done
for p in "${rpids[@]}"; do wait "$p" || true; done
for d in "${rest[@]}"; do
  r2=$(cat "$out/c-$(basename "$d")/retry-run.txt" 2>/dev/null || true)
  note_retry "$d" "$r2"
  apply_of "$d" "$r2"
  say "collected: $(basename "$d")"
done
say "done. Next: node lib/cli.ts health --changed --data $data, then node lib/cli.ts emit --data $data && npx astro build"
