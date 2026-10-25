#!/usr/bin/env bash
# smoke: HTTP checks against the started app (spec 5.3). Runs as the runner (curl only, no app code, no file of om-cell).
#   smoke.sh            login as the demo superadmin created by `initialize`, then GET /backend, the module's first
#                       authenticated GET route (SMOKE_API, from the module facts), its first backend page
#                       (BACKEND_PAGE), the descriptor's smoke.paths (SMOKE_PATHS) and, in a baseline of the classic
#                       preset, the route of each catalog package its new app registers (SMOKE_PRESET, <npm>=<route>;
#                       a red one prints `smoke: FAIL preset <npm> api ...`, so collect can name the package).
#                       SMOKE_API_LISTED says whether om-cell found the route in
#                       .mercato/generated/api-routes.generated.ts (1 yes, 0 no, empty unknown); steps.sh checks that
#                       as om-cell.
#   smoke.sh --log F    the copy of the server log that om-cell made (steps.sh server_log) has no `Unhandled` or
#                       `Error:` line. A symlink is refused.
set -euo pipefail

if [[ "${1:-}" == --log ]]; then
  f=${2:?usage: smoke.sh --log <file>}
  if [[ -L "$f" ]]; then
    echo "smoke: FAIL server log copy is a symlink"
    exit 1
  fi
  [[ -f "$f" ]] || {
    echo "smoke: no server log"
    exit 0
  }
  bad=$(grep -nE 'Unhandled|Error:' "$f" | head -n 5 || true)
  if [[ -n "$bad" ]]; then
    echo "smoke: FAIL server log has errors:"
    echo "$bad"
    exit 1
  fi
  echo 'smoke: server log ok'
  exit 0
fi

PORT=${PORT:-3901}
BASE="http://127.0.0.1:${PORT}"
jar=$(mktemp)
body=$(mktemp)
trap 'rm -f "$jar" "$body"' EXIT
failures=0

check() { # label expected-pattern path [page|api]
  local code url
  if [[ "${4:-}" == page ]]; then
    # A backend page may redirect to its first tab (/backend/checkout -> /backend/checkout/links): follow redirects on
    # this host, and a page that ends on the login screen fails.
    read -r code url < <(curl -s -L --max-redirs 5 --proto =http -o "$body" -w '%{http_code} %{url_effective}\n' \
      -b "$jar" -c "$jar" --max-time 30 "${BASE}$3" || echo '000 -')
    if [[ "$code" == 200 && ( "$url" == */login* || "$url" != "${BASE}"/* ) ]]; then code="200->${url#"$BASE"}"; fi
  else
    code=$(curl -s -o "$body" -w '%{http_code}' -b "$jar" -c "$jar" --max-time 30 "${BASE}$3" || echo 000)
  fi
  if [[ "$code" =~ ^($2)$ ]]; then
    echo "smoke: $1 GET $3 -> $code${url:+ (${url#"$BASE"})}"
  elif [[ "${4:-}" == api && "$code" =~ ^(400|422)$ ]] && head -c 1 "$body" | grep -q '{'; then
    # The first GET route of the facts may need a query parameter: a JSON validation error means the route is
    # registered and its handler ran (module code loaded), which is what this check is for.
    echo "smoke: $1 GET $3 -> $code (handler ran, input rejected: $(head -c 160 "$body" | tr -d '\000-\037'))"
  else
    echo "smoke: FAIL $1 GET $3 -> $code (expected $2)"
    head -c 600 "$body" | tr -d '\000-\010\013\014\016-\037'
    echo
    failures=$((failures + 1))
  fi
}

code=$(curl -s -o "$body" -w '%{http_code}' -c "$jar" --max-time 30 \
  -X POST "${BASE}/api/auth/login" \
  --data-urlencode 'email=superadmin@acme.com' --data-urlencode 'password=secret' || echo 000)
if [[ ! "$code" =~ ^2 ]]; then
  echo "smoke: FAIL POST /api/auth/login -> $code"
  head -c 600 "$body"
  echo
  exit 1
fi
echo "smoke: POST /api/auth/login -> $code"

check backend '200' /backend

if [[ -n "${SMOKE_API:-}" ]]; then
  if [[ "${SMOKE_API_LISTED:-}" == 0 ]]; then
    echo "smoke: FAIL module route ${SMOKE_API} is not in api-routes.generated.ts"
    failures=$((failures + 1))
  else
    check 'module api' '2[0-9][0-9]' "$SMOKE_API" api
  fi
fi
[[ -z "${BACKEND_PAGE:-}" ]] || check 'module page' '200' "$BACKEND_PAGE" page
for p in ${SMOKE_PATHS:-}; do check 'descriptor path' '2[0-9][0-9]' "$p"; done
for e in ${SMOKE_PRESET:-}; do check "preset ${e%%=*} api" '2[0-9][0-9]' "${e#*=}" api; done

[[ "$failures" == 0 ]] || {
  echo "smoke: ${failures} check(s) failed"
  exit 1
}
echo 'smoke: ok'
