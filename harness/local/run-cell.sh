#!/usr/bin/env bash
# run-cell.sh: run one nightly cell in Docker the way the `cell` job of nightly.yml runs it (preview mode).
#
#   run-cell.sh --env <cell.env> --out <dir> [--image <tag>] [--attempt <n>] [--yarn-cache <volume>|none]
#               [--memory <n>g] [--until <step>] [--keep] [--build]
#   run-cell.sh --unfence <chain> <subnet>     remove the firewall rules of a cell kept with --keep
#
# Same ladder (harness/steps.sh), same step conditions and timeouts as the workflow. Isolation:
# - one container per cell from harness/local/Dockerfile, --memory 10g (--memory) --cpus 4, no-new-privileges, a private bridge
#   network; root in the container plays the runner, module and app code run as om-cell (no sudo); a step the memory
#   limit cut short gets the marker `[harness] cell out of memory` in its log (infra, never the module's failure);
# - the network reaches the internet only (review round 2): harness/local/cell-firewall.sh rejects traffic from the
#   cell subnet to the host (every address and port), to the metadata service, to private ranges and to the host's
#   public address; IPv6 is off in the cell. Before any step a probe from the cell must find the gateway, the host
#   addresses and 169.254.169.254 closed, otherwise the cell does not start (exit 3). Needs a Linux Docker host.
# - Postgres (the pgvector pin of spec 3.3) in its own container that joins the cell's network namespace, so the app
#   sees it on 127.0.0.1:5432 exactly as the job service;
# - the only host directory mounted is --out (written by the runner role only); no environment variables except the
#   harness inputs from <cell.env> (no secrets, no tokens);
# - optional shared Yarn cache volume (preview only; the CI job has no cache, D12);
# - a cell that would run code from outside @open-mercato is refused before Docker (exit 77, AGENTS.md rule 4).
# Step results come from exit codes and are written to <out>/job.json in the shape of an Actions API job.
# Containers, the network and anonymous volumes of the cell are removed on exit (unless --keep).
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
harness=$(cd "$here/.." && pwd)
PG_IMAGE='pgvector/pgvector@sha256:724a4041afdb1750446e3f6b5cfa8f3b0ac5a2cf538ddfa6bfee4f94c2fa85c6'
image=om-modules-cell:node24.21.0
fw_image=om-modules-cell-fw:1
attempt=1
yarn_cache=om-preview-yarn-cache
memory=10g
until=''
keep=0
build=0
envfile=''
out=''
unfence=()
fw() { docker run --rm -i --net host --cap-add NET_ADMIN --cap-add NET_RAW "$fw_image" bash -s -- "$@" <"$here/cell-firewall.sh"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
  --env) envfile=$2; shift 2 ;;
  --out) out=$2; shift 2 ;;
  --image) image=$2; shift 2 ;;
  --attempt) attempt=$2; shift 2 ;;
  --yarn-cache) yarn_cache=$2; shift 2 ;;
  --memory) memory=$2; shift 2 ;;
  --until) until=$2; shift 2 ;;
  --keep) keep=1; shift ;;
  --build) build=1; shift ;;
  --unfence) unfence=("$2" "$3"); shift 3 ;;
  *) echo "run-cell: unknown argument $1" >&2; exit 64 ;;
  esac
done
if [[ ${#unfence[@]} -eq 2 ]]; then fw del "${unfence[@]}"; exit; fi
[[ -f "$envfile" && -n "$out" ]] || { sed -n '2,24p' "$0" >&2; exit 64; }
[[ "$attempt" =~ ^[0-9]+$ ]] || { echo "run-cell: bad --attempt" >&2; exit 64; }
[[ "$memory" =~ ^[1-9][0-9]?g$ ]] || { echo "run-cell: bad --memory" >&2; exit 64; }

# The env file is written by `yarn om cells-local` (single-quoted values checked against the matrix schema). Only these
# names are read; anything else in the file is ignored.
VARS=(KEY12 LINE BASELINE OM_VERSION PRESET MODULE_SPEC MODULE_NPM MODULE_IDS MODULE_FLAG THIRD_PARTY REQUIRES_SPECS REPLACES
  PATCHES MODE SMOKE_API BACKEND_PAGE SMOKE_PATHS SMOKE_PRESET)
declare -A cellenv=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^([A-Z0-9_]+)=\'([^\']*)\'$ ]] || continue
  for v in "${VARS[@]}"; do [[ "${BASH_REMATCH[1]}" == "$v" ]] && cellenv[$v]=${BASH_REMATCH[2]}; done
done <"$envfile"
[[ "${cellenv[KEY12]:-}" =~ ^[a-f0-9]{12}$ ]] || { echo "run-cell: KEY12 missing in $envfile" >&2; exit 64; }
line_key=${cellenv[LINE]:-}
[[ "$line_key" =~ ^([0-9]+\.[0-9]+|next)$ ]] || { echo "run-cell: LINE missing in $envfile" >&2; exit 64; }

# AGENTS.md rule 4: a preview host never runs code from outside @open-mercato. `cells-local` refuses such a cell
# first; this is the backstop for an env file written by hand. `core:<id>` requires are modules of the app itself.
own() { [[ "$1" == @open-mercato/* ]]; }
foreign=()
npm=${cellenv[MODULE_NPM]:-}
if [[ -n "$npm" ]] && ! own "$npm"; then foreign+=("$npm")
elif [[ "${cellenv[THIRD_PARTY]:-0}" != 0 ]]; then foreign+=("${npm:-a third-party module}"); fi
spec=${cellenv[MODULE_SPEC]:-}
if [[ -n "$spec" ]]; then
  if ! own "${spec%@*}"; then [[ "${spec%@*}" == "$npm" ]] || foreign+=("${spec%@*}")
  elif [[ "${spec##*@}" == https://* && "${spec##*@}" != https://codeload.github.com/open-mercato/* ]]; then foreign+=("$spec"); fi
fi
for r in ${cellenv[REQUIRES_SPECS]:-}; do
  [[ "$r" == core:* ]] && continue
  r=${r#lib:}
  own "${r%@*}" || foreign+=("${r%@*}")
done
for p in ${cellenv[SMOKE_PRESET]:-}; do own "${p%%=*}" || foreign+=("${p%%=*}"); done
if [[ ${#foreign[@]} -gt 0 ]]; then
  echo "run-cell: refused: the cell runs ${foreign[*]}, code from outside @open-mercato/*. Third-party cells run only on GitHub Actions ubuntu-latest (nightly.yml, AGENTS.md rule 4)." >&2
  exit 77
fi

mkdir -p "$out"
out=$(cd "$out" && pwd)
chmod 0700 "$out"
runner_log="$out/_runner.log"
: >"$runner_log"
log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$runner_log" >&2; }

[[ "$(uname -s)" == Linux ]] || { log "the preview runner needs a Linux Docker host (cell firewall)"; exit 3; }
if [[ "$build" == 1 ]] || ! docker image inspect "$image" >/dev/null 2>&1; then
  log "building $image"
  docker build -q --target cell -t "$image" "$here" >>"$runner_log"
fi
if [[ "$build" == 1 ]] || ! docker image inspect "$fw_image" >/dev/null 2>&1; then
  log "building $fw_image"
  docker build -q --target fw -t "$fw_image" "$here" >>"$runner_log"
fi

suffix=$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')
name="omcell-${cellenv[KEY12]}-${line_key//./-}-a${attempt}-${suffix}"
net="${name}-net"
pg="${name}-pg"
chain="OMC-${suffix}"
subnet=''

cleanup() {
  if [[ "$keep" == 1 ]]; then
    log "kept $name, $pg, $net (firewall chain $chain stays until the network is removed with: run-cell.sh --unfence $chain $subnet)"
    return
  fi
  docker rm -fv "$pg" "$name" >/dev/null 2>&1 || true
  if [[ -n "$subnet" ]]; then fw del "$chain" "$subnet" >>"$runner_log" 2>&1 || log "firewall chain $chain not removed"; fi
  docker network rm "$net" >/dev/null 2>&1 || true
  log "removed $name, $pg, $net, $chain"
}
trap cleanup EXIT

iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
job_started=$(iso)

docker network create --driver bridge --ipv6=false "$net" >/dev/null
read -r subnet gateway < <(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{.Gateway}}{{end}}' "$net")
[[ "$subnet" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ && "$gateway" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] ||
  { log "network $net has no IPv4 subnet"; subnet=''; exit 3; }
mapfile -t host_ips < <(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1)
[[ ${#host_ips[@]} -gt 0 ]] || { log "no IPv4 address of the host found (ip -4 addr); cell not started"; exit 3; }
fw add "$chain" "$subnet" "${host_ips[@]}" >>"$runner_log" 2>&1 || { log "firewall for $subnet not set; cell not started"; exit 3; }
cache_args=()
[[ "$yarn_cache" == none ]] || cache_args=(-v "${yarn_cache}:/home/om-cell/.yarn/berry")
docker run -d --name "$name" --hostname cell --network "$net" --init \
  --memory "$memory" --memory-swap "$memory" --cpus 4 --pids-limit 8192 \
  --security-opt no-new-privileges \
  --cap-drop NET_RAW --cap-drop MKNOD --cap-drop SYS_CHROOT --cap-drop SETFCAP --cap-drop AUDIT_WRITE \
  --sysctl net.ipv6.conf.all.disable_ipv6=1 --sysctl net.ipv6.conf.default.disable_ipv6=1 \
  -v "$out:/out" "${cache_args[@]}" \
  "$image" sleep infinity >/dev/null

# Isolation probe, as om-cell before any step: TCP to the gateway, every host address and the metadata service must
# fail. One open target and the cell does not start.
targets=()
for h in "$gateway" "${host_ips[@]}"; do for p in 22 80 443 3000 5432 6379 7700 8080; do targets+=("$h:$p"); done; done
targets+=(169.254.169.254:80)
open=$(docker exec -u om-cell "$name" bash -c '
  for t in "$@"; do
    ( timeout 3 bash -c "exec 3<>/dev/tcp/${t%:*}/${t##*:}" 2>/dev/null && echo "$t" ) &
  done
  wait' probe "${targets[@]}" || true)
if [[ -n "$open" ]]; then
  log "isolation probe: open from the cell: $(echo "$open" | tr '\n' ' '); cell not started"
  exit 3
fi
log "isolation probe: ${#targets[@]} host and metadata targets closed"
if docker exec -u om-cell "$name" timeout 5 bash -c 'exec 3<>/dev/tcp/registry.npmjs.org/443' 2>/dev/null; then
  log "isolation probe: registry.npmjs.org:443 reachable"
else
  log "isolation probe: registry.npmjs.org:443 not reachable (steps will fail as infra)"
fi
docker run -d --name "$pg" --network "container:$name" --memory 1g \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=open-mercato \
  "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$pg" pg_isready -q -U postgres -h 127.0.0.1 && break
  sleep 1
done
docker exec "$pg" pg_isready -q -U postgres -h 127.0.0.1 || { log "postgres did not start"; exit 2; }
docker exec "$name" mkdir -p /tmp/harness-src
docker cp "$harness/." "$name:/tmp/harness-src/" >/dev/null
log "cell $name ready (postgres on 127.0.0.1:5432 of the cell)"

exec_env=(-e OUT=/out -e "PACK_OWNER=$(id -u):$(id -g)" -e "HARNESS_KEEP_GENERATED=${HARNESS_KEEP_GENERATED:-0}"
  -e "HARNESS_RO_NODE_MODULES=${HARNESS_RO_NODE_MODULES:-1}" -e CELL_PATH=/usr/local/bin:/usr/bin:/bin)
for v in "${VARS[@]}"; do exec_env+=(-e "$v=${cellenv[$v]:-}"); done

declare -A outcome=()
# Each step limits itself (steps.sh step_secs, 20 s under the numbers below, which equal timeout-minutes of nightly.yml)
# and writes `[harness] step timed out` into its log. The `timeout` here is only the backstop, like GitHub ending a step
# at timeout-minutes: the step is then `cancelled` (no marker), which collect classifies as infra. An exit code
# 124 or 137 from inside a step before the backstop time is an ordinary failure.
steps_json=''
number=0
add_step() { # name conclusion started completed [oom_kills]
  number=$((number + 1))
  steps_json+="${steps_json:+,}{\"name\":\"$1\",\"number\":$number,\"status\":\"completed\",\"conclusion\":\"$2\",\"started_at\":\"$3\",\"completed_at\":\"$4\"${5:+,\"oom_kills\":$5}}"
}
stopped=0
# The memory limit of the cell (--memory) is the preview runner's, not CI's (a GitHub runner has 16 GB): a step that
# fails while the kernel killed a process of the cell for it gets `oom_kills` in its job.json entry, and collect
# classifies it as infra on every attempt (classify.ts `cell-oom`), never as the module's failure (review of 24 Oct).
# The count is the runner's, read from outside the step: the step log carries the module's own output, so a marker
# line there is for people only and decides nothing (finding of 25 Oct). oom_kill of the cell's cgroup v2
# memory.events counts those kills; the container sees its own cgroup at /sys/fs/cgroup.
oom_kills() { docker exec "$name" awk '/^oom_kill / {print $2}' /sys/fs/cgroup/memory.events 2>/dev/null || true; }
run_step() { # name timeout-seconds workdir condition(0/1)
  local step=$1 secs=$2 workdir=$3 cond=$4 t0 t1 rc k0 k1 oom='' script=/opt/harness/steps.sh
  if [[ "$stopped" == 1 || "$cond" != 1 ]]; then
    outcome[$step]=skipped
    add_step "$step" skipped "$(iso)" "$(iso)"
    return
  fi
  [[ "$step" == prepare ]] && script=/tmp/harness-src/steps.sh
  t0=$(iso)
  local s0=$SECONDS
  k0=$(oom_kills)
  log "step $step"
  set +e
  docker exec "${exec_env[@]}" "$name" timeout -k 10 "$secs" bash "$script" "$step" "$workdir" >>"$runner_log" 2>&1
  rc=$?
  set -e
  t1=$(iso)
  k1=$(oom_kills)
  if [[ "$rc" != 0 && "${k1:-0}" =~ ^[0-9]+$ && "${k0:-0}" =~ ^[0-9]+$ && "${k1:-0}" -gt "${k0:-0}" ]]; then
    oom=$((k1 - k0))
    # the step log is root's in the container (steps.sh writes it): the marker goes in the same way
    docker exec "$name" bash -c 'printf "[harness] cell out of memory: the %s limit of the preview runner killed %s process(es)\n" "$1" "$2" >>"/out/$3.log"' \
      marker "$memory" "$((k1 - k0))" "$step" || true
    log "step $step: the $memory memory limit killed $((k1 - k0)) process(es) (oom_kill $k0 -> $k1)"
  fi
  if [[ "$rc" == 0 ]]; then
    outcome[$step]=success
  elif [[ ("$rc" == 124 || "$rc" == 137) && $((SECONDS - s0)) -ge "$secs" ]]; then
    outcome[$step]=cancelled
  else
    outcome[$step]=failure
  fi
  log "step $step -> ${outcome[$step]} (exit $rc)"
  add_step "$step" "${outcome[$step]}" "$t0" "$t1" "$oom"
  [[ -n "$until" && "$step" == "$until" ]] && stopped=1
  return 0
}
ok() { [[ "${outcome[$1]:-}" == success ]] && echo 1 || echo 0; }
baseline=${cellenv[BASELINE]:-0}

home=/home/om-cell
app=/home/om-cell/app
run_step prepare 240 "$home" 1
run_step scaffold 180 "$home" "$(ok prepare)"
run_step patch 60 "$app" "$(ok scaffold)"
run_step env 60 "$app" "$(ok patch)"
run_step install 480 "$app" "$(ok env)"
if [[ "$baseline" == 1 ]]; then run_step add 360 "$app" 0; else run_step add 360 "$app" "$(ok install)"; fi
gen=0
[[ "$(ok add)" == 1 || ("$baseline" == 1 && "$(ok install)" == 1) ]] && gen=1
run_step generate 180 "$app" "$gen"
run_step typecheck 540 "$app" "$(ok generate)"
run_step initialize 240 "$app" "$(ok generate)"
run_step build 960 "$app" "$(ok initialize)"
run_step start 300 "$app" "$(ok build)"
run_step smoke 180 "$app" "$(ok start)"
stopped=0
run_step pack 120 "$app" 1

conclusion=success
for s in "${!outcome[@]}"; do [[ "${outcome[$s]}" == failure || "${outcome[$s]}" == cancelled ]] && conclusion=failure; done
job_name="cell ${cellenv[KEY12]} ${line_key}"
# runner_memory: the memory limit of the cell, carried into the receipt (Receipt.harness.memory, review of 24 Oct)
printf '{"name":"%s","status":"completed","conclusion":"%s","started_at":"%s","completed_at":"%s","run_attempt":%s,"runner_memory":"%s","steps":[%s]}\n' \
  "$job_name" "$conclusion" "$job_started" "$(iso)" "$attempt" "$memory" "$steps_json" >"$out/job.json"
log "job $job_name -> $conclusion"
