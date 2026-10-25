#!/usr/bin/env bash
# steps.sh <step> [<workdir>]: one rung of the nightly install ladder (spec 5.3, D8, D11, D47).
#
# Called by the trusted runner: the `runner` user with passwordless sudo on ubuntu-latest (.github/workflows/nightly.yml),
# or root inside the preview container (harness/local/run-cell.sh). Every command that runs app or module code goes
# through run_cell: user om-cell, `env -i`, no sudo, no Actions tokens. The runner itself only copies files, compares
# checksums, locks node_modules and sends HTTP requests (smoke).
#
# Inputs (environment of the runner, set by the workflow from out/matrix.json):
#   OUT            directory for logs and small JSON files; om-cell has no write access to it
#   CELL_PATH      PATH for om-cell (node + corepack shims first)
#   OM_VERSION     exact create-mercato-app version of the line
#   PRESET         starter preset of the scaffold: classic (what create-mercato-app makes without --preset, the main
#                  verdict) or empty (the module in isolation); default empty
#   BASELINE       1 for the app as scaffolded, 0 for a module cell
#   MODULE_SPEC    <npm>@<version>, or <npm>@https://codeload.github.com/... for a GitHub-only tag
#   MODULE_NPM     package name; MODULE_IDS space-separated module IDs; MODULE_FLAG --module value or empty
#   THIRD_PARTY    1 when the package is outside @open-mercato/* (adds --allow-third-party)
#   REQUIRES_SPECS space-separated, deepest first: core:<id> or <npm>@<version>
#   REPLACES       space-separated core module IDs removed from src/modules.ts before add (slot swap)
#   PATCHES        space-separated harness patch IDs (harness/lines.yml) that apply to OM_VERSION
#   MODE           realistic | early (early: the package is preapproved for this run only)
#   SMOKE_API      GET route of the module that requires auth (from facts), or empty
#   BACKEND_PAGE   first backend page of the module (from facts), or empty
#   SMOKE_PATHS    space-separated extra GET paths from the descriptor
#   SMOKE_PRESET   a baseline of the classic preset: space-separated <npm>=<route>, the GET route of each catalog package
#                  its new app registers (smoke.sh names the package of a red check), or empty
#   HARNESS_CELL_HOME  home of om-cell (default /home/om-cell; test/receipts/harness.test.ts points it at a temp dir)
#   HARNESS_STEP_SECS  time limit of this step in seconds (default: step_secs below; tests set a small one)
set -euo pipefail

STEP=${1:?usage: steps.sh <step> [<workdir>]}
HARNESS=/opt/harness
CELL_USER=om-cell
CELL_HOME=${HARNESS_CELL_HOME:-/home/om-cell}
APP=$CELL_HOME/app
LOGS=$CELL_HOME/logs
WORKDIR=${2:-$APP}
OUT=${OUT:?OUT is required}
# node first: setup-node's tool cache on ubuntu-latest, /usr/local/bin in the preview image.
if [[ -z "${CELL_PATH:-}" ]]; then CELL_PATH="$(dirname "$(command -v node)"):/usr/local/bin:/usr/bin:/bin"; fi
BASELINE=${BASELINE:-0}
MODE=${MODE:-realistic}
PRESET=${PRESET:-empty}
PORT=3901
LOG="$OUT/$STEP.log"
YARN_SAFE='YARN_ENABLE_SCRIPTS=0 YARN_ENABLE_IMMUTABLE_INSTALLS=0 YARN_ENABLE_HARDENED_MODE=0'

# Step time limits: 20 s under `timeout-minutes` of the step in nightly.yml (and under the backstop of run-cell.sh), so
# the harness, not the runner, ends a step that runs too long and the marker below lands in the step log on both
# runners (review round 2). The marker is written only when the limit really passed: an exit code 124 or 137 that module
# code returns early is an ordinary failure.
step_secs() {
  case "$1" in
  prepare | initialize) echo 220 ;;
  scaffold | generate | smoke) echo 160 ;;
  patch | env) echo 40 ;;
  install) echo 460 ;;
  add) echo 340 ;;
  # an app from the classic preset registers about 60 modules: typecheck 233 s and build 420 s on Cezar (4 CPU, trial
  # of 24 Oct) against 70 s and 135 s for the empty preset
  typecheck) echo 520 ;;
  start) echo 280 ;;
  build) echo 940 ;;
  pack) echo 100 ;;
  *) echo 0 ;;
  esac
}
if [[ -z "${HARNESS_IN_STEP:-}" ]] && command -v timeout >/dev/null 2>&1; then
  secs=${HARNESS_STEP_SECS:-$(step_secs "$STEP")}
  if [[ "$secs" =~ ^[1-9][0-9]*$ ]]; then
    t0=$SECONDS
    set +e
    HARNESS_IN_STEP=1 timeout -k 10 "$secs" bash "${BASH_SOURCE[0]}" "$@"
    rc=$?
    set -e
    if [[ ("$rc" == 124 || "$rc" == 137) && $((SECONDS - t0)) -ge "$secs" ]]; then
      mkdir -p "$OUT"
      printf '[harness] step timed out after %s s\n' "$secs" | tee -a "$LOG" >&2
    fi
    exit "$rc"
  fi
fi

say() { printf '[harness] %s\n' "$*" | tee -a "$LOG" >&2; }
fail() {
  say "$*"
  exit 1
}
as_root() { if [[ $(id -u) == 0 ]]; then "$@"; else sudo -n "$@"; fi; }
node_root() { (cd / && env -i PATH="$CELL_PATH" node "$@"); }

# The only way app and module code runs. The command string is built from validated values only.
run_cell() {
  local dir=$1 cmd=$2
  local -a envs=(
    "PATH=$CELL_PATH" "HOME=$CELL_HOME" "COREPACK_HOME=$CELL_HOME/.cache/corepack" COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    CI=1 NEXT_TELEMETRY_DISABLED=1 YARN_ENABLE_TELEMETRY=0 "npm_config_cache=$CELL_HOME/.npm"
  )
  if [[ $(id -u) == 0 ]]; then
    runuser -u "$CELL_USER" -- env -i "${envs[@]}" bash -c "cd $(printf '%q' "$dir") && $cmd"
  else
    sudo -n -u "$CELL_USER" -H env -i "${envs[@]}" bash -c "cd $(printf '%q' "$dir") && $cmd"
  fi
}
cell() { run_cell "$1" "$2" 2>&1 | tee -a "$LOG"; }

# Values that end up in command strings are checked against the same patterns as the catalog schemas.
NPM_RE='^(@[a-z0-9~-][a-z0-9._~-]*/)?[a-z0-9~-][a-z0-9._~-]*$'
VER_RE='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
ID_RE='^[a-z][a-z0-9_]*$'
URL_RE='^https://codeload\.github\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+/tar\.gz/[A-Za-z0-9._/-]+$'
check() { [[ "$2" =~ $3 ]] || fail "invalid $1: $2"; }
check_inputs() {
  check OM_VERSION "${OM_VERSION:-}" "$VER_RE"
  [[ "$MODE" == realistic || "$MODE" == early ]] || fail "invalid MODE: $MODE"
  [[ "$PRESET" == empty || "$PRESET" == classic ]] || fail "invalid PRESET: $PRESET"
  [[ "$BASELINE" == 0 || "$BASELINE" == 1 ]] || fail "invalid BASELINE: $BASELINE"
  if [[ "$BASELINE" == 0 ]]; then
    check MODULE_NPM "${MODULE_NPM:-}" "$NPM_RE"
    local v=${MODULE_SPEC#"$MODULE_NPM"@}
    [[ "$v" =~ $VER_RE || "$v" =~ $URL_RE ]] || fail "invalid MODULE_SPEC: ${MODULE_SPEC:-}"
    local id
    for id in ${MODULE_IDS:-}; do check MODULE_IDS "$id" "$ID_RE"; done
    [[ -z "${MODULE_FLAG:-}" ]] || check MODULE_FLAG "$MODULE_FLAG" "$ID_RE"
    for id in ${REPLACES:-}; do check REPLACES "$id" "$ID_RE"; done
    local s
    for s in ${REQUIRES_SPECS:-}; do
      if [[ "$s" == core:* ]]; then check REQUIRES_SPECS "${s#core:}" "$ID_RE"; else
        [[ "${s%@*}" =~ $NPM_RE && "${s##*@}" =~ $VER_RE ]] || fail "invalid REQUIRES_SPECS item: $s"
      fi
    done
  fi
  local p
  for p in ${PATCHES:-}; do
    [[ "$p" =~ ^[a-z0-9-]+$ && -f "$HARNESS/patches/$p.sh" ]] || fail "unknown patch: $p"
  done
  for p in ${SMOKE_API:-} ${BACKEND_PAGE:-} ${SMOKE_PATHS:-}; do
    [[ "$p" =~ ^/[A-Za-z0-9/_.-]+$ ]] || fail "invalid smoke path: $p"
  done
  for p in ${SMOKE_PRESET:-}; do
    [[ "${p%%=*}" =~ $NPM_RE && "${p#*=}" =~ ^/[A-Za-z0-9/_.-]+$ ]] || fail "invalid preset smoke entry: $p"
  done
}

# Checksums of the files a module must not change after `add` (D47): package.json scripts, tsconfig.json, .yarnrc.yml.
sums() {
  node_root -e '
    const fs = require("fs"), crypto = require("crypto"), path = require("path")
    const app = process.argv[1]
    const h = (s) => crypto.createHash("sha256").update(s).digest("hex")
    const read = (f) => { try { return fs.readFileSync(path.join(app, f)) } catch { return null } }
    let scripts = "missing"
    const pkg = read("package.json")
    if (pkg) { try { scripts = h(JSON.stringify(JSON.parse(pkg).scripts ?? {})) } catch { scripts = "unparsable" } }
    const file = (f) => { const b = read(f); return b === null ? "missing" : h(b) }
    process.stdout.write(`scripts ${scripts}\ntsconfig.json ${file("tsconfig.json")}\n.yarnrc.yml ${file(".yarnrc.yml")}\n`)
  ' "$APP"
}

tamper_check() {
  [[ -f "$OUT/sums.add" ]] || fail "no checksums from add"
  local now
  now=$(sums)
  if [[ "$now" != "$(cat "$OUT/sums.add")" ]]; then
    say "tampered-files: $(diff <(cat "$OUT/sums.add") <(printf '%s\n' "$now") | grep '^>' | awk '{print $2}' | tr '\n' ' ')"
    exit 1
  fi
}

# After add (or before generate in the baseline): node_modules read-only for om-cell, checksums refreshed.
finalize_install() {
  [[ -f "$OUT/sums.add" ]] && return 0
  if [[ "${HARNESS_RO_NODE_MODULES:-1}" == 1 ]]; then
    # Packages become read-only for om-cell (a module cannot replace typescript, next or itself). Tools of the app
    # write caches under node_modules/.cache (`yarn generate` fails with EACCES without it, preview run 23 Oct), so
    # only that directory stays writable.
    as_root chown -R root:root "$APP/node_modules"
    as_root chmod -R a-w "$APP/node_modules"
    as_root rm -rf "$APP/node_modules/.cache"
    as_root chmod u+w "$APP/node_modules"
    as_root install -d -o "$CELL_USER" -m 0755 "$APP/node_modules/.cache"
    as_root chmod u-w "$APP/node_modules"
    say "node_modules is read-only for om-cell except node_modules/.cache"
  fi
  # add may change only dependencies (spec 5.3), and module code already runs in add (the generators of `module add`
  # import its sources): a change of scripts, tsconfig.json or .yarnrc.yml since install fails add (review round 2).
  local now
  now=$(sums)
  if [[ -f "$OUT/sums.install" && "$now" != "$(cat "$OUT/sums.install")" ]]; then
    cp "$OUT/sums.install" "$OUT/sums.add"
    say "tampered-files: $(diff "$OUT/sums.install" <(printf '%s\n' "$now") | grep '^>' | awk '{print $2}' | tr '\n' ' ')"
    exit 1
  fi
  printf '%s\n' "$now" >"$OUT/sums.add"
}

# `id from` lines of the enabledModules array literal in src/modules.ts, up to its first `]`. Entries pushed later in
# `if` blocks (enterprise modules behind OM_ENABLE_ENTERPRISE_MODULES*) are not registered in a new app. Same parser
# as presetFromModulesTs in lib/receipts/state.ts (test/receipts/state.test.ts runs both on the 0.9.0 scaffold).
PRESET_JS='
const fs = require("fs")
const text = fs.readFileSync(process.argv[1], "utf8")
const src = text.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n")
const decl = /\bconst\s+enabledModules\b[^=]*=\s*\[([^\]]*)\]/.exec(src)
const seen = new Set()
const re = /\{\s*id:\s*[\x27"]([a-z][a-z0-9_]*)[\x27"]\s*,\s*from:\s*[\x27"]([^\x27"]+)[\x27"]\s*\}/g
for (const m of (decl ? decl[1] : "").matchAll(re)) {
  if (!seen.has(m[1])) { seen.add(m[1]); process.stdout.write(m[1] + " " + m[2] + "\n") }
}
'
preset_entries() { node_root -e "$PRESET_JS" "$APP/src/modules.ts"; }
registered() { [[ $'\n'"$REGISTERED"$'\n' == *$'\n'"$1 $2"$'\n'* ]]; }

# A file om-cell owns, copied into $OUT: om-cell reads it (never the runner, so a symlink cannot reach a file only the
# runner can read) and a symlink or anything but a regular file is refused. The runner only writes the copy.
copy_from_cell() { # dir relative-name destination [max-bytes]
  local q
  q=$(printf '%q' "$2")
  if ! run_cell "$1" "[ -f $q ] && [ ! -L $q ] && head -c ${4:-20000000} -- $q" >"$3" 2>/dev/null; then
    rm -f "$3"
    return 1
  fi
}
server_log() { copy_from_cell "$LOGS" start.log "$OUT/server.log"; }

# Stop the app server (exit 143 of the server is not a failure) and anything else om-cell left running. The PGID file
# is written by om-cell, so a group is killed only when every process in it belongs to om-cell.
kill_server() {
  local pgid owners
  pgid=$(run_cell "$LOGS" '[ -f start.pgid ] && [ ! -L start.pgid ] && head -c 32 start.pgid' 2>/dev/null || true)
  if [[ -n "$pgid" ]]; then
    if [[ "$pgid" =~ ^[0-9]+$ ]]; then
      owners=$(ps -o user= -g "$pgid" 2>/dev/null | sort -u | tr -d ' ' || true)
      [[ "$owners" == "$CELL_USER" ]] && as_root kill -- "-$pgid" 2>/dev/null || true
    fi
  fi
  as_root pkill -KILL -u "$CELL_USER" 2>/dev/null || true
}

write_json_list() { # file items...
  node_root -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)) + "\n")' "${@:2}" >"$1"
}

case "$STEP" in
prepare)
  mkdir -p "$OUT"
  chmod 0700 "$OUT"
  : >"$LOG"
  id "$CELL_USER" >/dev/null 2>&1 || as_root useradd -m "$CELL_USER"
  as_root chmod 0755 "$CELL_HOME"
  as_root install -d -o "$CELL_USER" -m 0755 "$LOGS"
  src=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  if [[ "$src" != "$HARNESS" ]]; then
    as_root rm -rf "$HARNESS"
    as_root cp -r "$src" "$HARNESS"
  fi
  as_root chown -R root:root "$HARNESS"
  as_root chmod -R u=rwX,go=rX "$HARNESS"
  as_root find "$HARNESS" -name '*.sh' -exec chmod 0755 {} +
  command -v yarn >/dev/null 2>&1 || corepack enable
  if [[ -n "${GITHUB_ENV:-}" ]]; then
    as_root rm -rf /usr/share/dotnet /opt/ghc /usr/local/lib/android
  fi
  check_inputs
  say "node $(node --version), om-cell $(id -u "$CELL_USER"), harness $(cd "$HARNESS" && ls | tr '\n' ' ')"
  ;;

scaffold)
  check_inputs
  cell "$CELL_HOME" "npx --yes create-mercato-app@$OM_VERSION app --preset $PRESET --agents none --no-init-git --registry https://registry.npmjs.org"
  [[ -f "$APP/package.json" ]] || fail "scaffold did not create $APP/package.json"
  sums >"$OUT/sums.scaffold"
  node_root -e '
    const fs = require("fs"), crypto = require("crypto")
    const [app, out] = process.argv.slice(1)
    const pkg = JSON.parse(fs.readFileSync(app + "/package.json", "utf8"))
    const modulesTs = fs.readFileSync(app + "/src/modules.ts", "utf8")
    const meta = { packageManager: pkg.packageManager ?? null, modulesTs: modulesTs.slice(0, 20000),
      modulesTsSha256: crypto.createHash("sha256").update(modulesTs).digest("hex"), yarn: null }
    fs.writeFileSync(out + "/app-meta.json", JSON.stringify(meta, null, 2) + "\n")
  ' "$APP" "$OUT"
  ;;

patch)
  check_inputs
  applied=()
  # A patch counts as applied when it changed one of the files patches may touch; one that changes nothing is not
  # recorded in the receipt.
  patched() { (cd "$APP" && cat src/modules.ts tsconfig.json package.json 2>/dev/null | sha256sum); }
  for p in ${PATCHES:-}; do
    before=$(patched)
    cell "$APP" "bash $HARNESS/patches/$p.sh"
    [[ "$(patched)" == "$before" ]] || applied+=("$p")
  done
  if [[ "$BASELINE" == 0 && -n "${REPLACES:-}" ]]; then
    before=$(patched)
    cell "$APP" "bash $HARNESS/patches/slot-swap.sh $REPLACES"
    [[ "$(patched)" == "$before" ]] || applied+=(slot-swap)
  fi
  write_json_list "$OUT/patches.json" ${applied[@]+"${applied[@]}"}
  say "patches applied: ${applied[*]:-none}"
  ;;

env)
  cell "$APP" "bash $HARNESS/env.sh"
  ;;

install)
  check_inputs
  if [[ "$MODE" == early && "$BASELINE" == 0 ]]; then
    cell "$APP" "sed -i '/^npmPreapprovedPackages:/a\\  - \"$MODULE_NPM\"' .yarnrc.yml && grep -q '\"$MODULE_NPM\"' .yarnrc.yml"
  fi
  cell "$APP" "$YARN_SAFE yarn install"
  yv=$(run_cell "$APP" "yarn --version" 2>/dev/null | tail -n 1)
  [[ "$yv" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || fail "yarn --version printed: $yv"
  node_root -e '
    const fs = require("fs"); const [f, v] = process.argv.slice(1)
    const m = JSON.parse(fs.readFileSync(f, "utf8")); m.yarn = v; fs.writeFileSync(f, JSON.stringify(m, null, 2) + "\n")
  ' "$OUT/app-meta.json" "$yv"
  sums >"$OUT/sums.install"
  say "yarn $yv"
  ;;

add)
  check_inputs
  [[ "$BASELINE" == 0 ]] || fail "add is not a baseline step"
  third=''
  [[ "${THIRD_PARTY:-0}" == 1 ]] && third=' --allow-third-party'
  notes=()
  REGISTERED=$(preset_entries)
  # The plan skips requirements of the cell's preset from data/presets.json, which only exists after the first collected
  # night: a requirement src/modules.ts already registers is skipped here too (`module add` refuses an enabled ID). In
  # an app from the classic preset most official packages are registered already: add is then `yarn add` of the tested
  # version only, with the note in-preset.
  for s in ${REQUIRES_SPECS:-}; do
    if [[ "$s" == core:* ]] && registered "${s#core:}" @open-mercato/core; then
      say "requires ${s#core:}: already registered from @open-mercato/core"
      continue
    fi
    if [[ "$s" != core:* && $'\n'"$REGISTERED"$'\n' == *" ${s%@*}"$'\n'* ]]; then
      say "requires ${s%@*}: already registered in src/modules.ts"
      continue
    fi
    if [[ "$s" == core:* ]]; then
      cell "$APP" "$YARN_SAFE yarn mercato module enable @open-mercato/core --module ${s#core:}"
    else
      extra=''
      [[ "$s" == @open-mercato/* ]] || extra=' --allow-third-party'
      cell "$APP" "$YARN_SAFE yarn mercato module add $s$extra"
    fi
  done
  REGISTERED=$(preset_entries)
  in_preset=1
  for id in ${MODULE_IDS:-}; do registered "$id" "$MODULE_NPM" || in_preset=0; done
  [[ -n "${MODULE_IDS:-}" ]] || in_preset=0
  flag=''
  [[ -n "${MODULE_FLAG:-}" ]] && flag=" --module $MODULE_FLAG"
  if [[ "$in_preset" == 1 ]]; then
    say "in-preset: src/modules.ts already registers ${MODULE_IDS} from $MODULE_NPM; add is yarn add only"
    cell "$APP" "$YARN_SAFE yarn add $MODULE_SPEC"
    notes+=(in-preset)
  elif [[ "${MODULE_SPEC#"$MODULE_NPM"@}" == https://* ]]; then
    cell "$APP" "$YARN_SAFE yarn add $(printf '%q' "$MODULE_SPEC") && $YARN_SAFE yarn mercato module enable $MODULE_NPM$third$flag"
  else
    cell "$APP" "$YARN_SAFE yarn mercato module add $MODULE_SPEC$third$flag"
  fi
  write_json_list "$OUT/notes.json" ${notes[@]+"${notes[@]}"}
  finalize_install
  ;;

generate)
  finalize_install
  cell "$APP" "yarn generate"
  ;;

typecheck)
  tamper_check
  cell "$APP" "yarn typecheck"
  ;;

initialize)
  cell "$APP" "yarn initialize --no-examples"
  ;;

build)
  tamper_check
  t0=$SECONDS
  set +e
  cell "$APP" "timeout 900 yarn build"
  rc=$?
  set -e
  [[ "$rc" == 124 && $((SECONDS - t0)) -ge 900 ]] && say "step timed out: yarn build ran 900 s"
  exit "$rc"
  ;;

start)
  tamper_check
  # Braces: only the server goes to the background, with every stream away from the step log pipe.
  run_cell "$APP" "{ PORT=$PORT setsid yarn start >$LOGS/start.log 2>&1 </dev/null & echo \$! >$LOGS/start.pgid; }" 2>&1 |
    tee -a "$LOG"
  for _ in $(seq 1 90); do
    code=$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' "http://127.0.0.1:$PORT/login" || true)
    if [[ "$code" == 200 ]]; then
      say "GET /login 200"
      exit 0
    fi
    sleep 2
  done
  say "GET /login did not answer 200 in 180 s (last: ${code:-none})"
  server_log && tail -n 60 "$OUT/server.log" | tee -a "$LOG" || true
  kill_server
  exit 1
  ;;

smoke)
  check_inputs
  set +e
  # Is the module route in the generated manifest? om-cell greps it (0 listed, 1 not listed, else unknown).
  listed=''
  if [[ -n "${SMOKE_API:-}" ]]; then
    routes=.mercato/generated/api-routes.generated.ts
    run_cell "$APP" "[ -r $routes ] || exit 2; grep -qF -- $(printf '%q' "\"${SMOKE_API#/api}\"") $routes" 2>/dev/null
    case $? in 0) listed=1 ;; 1) listed=0 ;; esac
  fi
  PORT="$PORT" SMOKE_API_LISTED="$listed" bash "$HARNESS/smoke.sh" 2>&1 | tee -a "$LOG"
  rc=${PIPESTATUS[0]}
  # The server log after the checks, copied by om-cell; smoke.sh --log reads only that copy.
  server_log
  bash "$HARNESS/smoke.sh" --log "$OUT/server.log" 2>&1 | tee -a "$LOG"
  rc2=${PIPESTATUS[0]}
  set -e
  kill_server
  [[ "$rc" == 0 ]] || exit "$rc"
  exit "$rc2"
  ;;

pack)
  kill_server
  # The server log is server.log in the artifact (start.log there is the log of the start step). Files under the home
  # of om-cell are read by om-cell only (copy_from_cell): module code could have replaced them with symlinks.
  server_log || say "no server log"
  copy_from_cell "$LOGS" start.pgid "$OUT/server.pgid" 32 || true
  if [[ "${HARNESS_KEEP_GENERATED:-0}" == 1 ]]; then
    copy_from_cell "$APP" .mercato/generated/api-routes.generated.ts "$OUT/api-routes.generated.ts" || true
  fi
  owner=${PACK_OWNER:-$(id -un)}
  as_root chown -R "$owner" "$OUT"
  ls -la "$OUT" >&2
  ;;

*)
  echo "steps.sh: unknown step $STEP" >&2
  exit 2
  ;;
esac
