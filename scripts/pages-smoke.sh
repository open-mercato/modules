#!/usr/bin/env bash
# Smoke test of a merged upload in the Pages emulator of the locked wrangler (audit of 27 Nov 2026): the unit tests run
# the Functions against a stand-in asset server, this runs the real one, with dist/_redirects, dist/_headers,
# dist/_routes.json and functions/ as `yarn om pages-site` left them. pages.yml runs it in the build job of a merged
# production build; on a workstation, after the build commands of docs/RUNBOOK.md (Preview of the main site):
#
#   scripts/pages-smoke.sh [dist] [port]
#
# With `serve` in functions/site.ts (PAGES_SERVE_ORIGIN) it also checks the old catalog addresses on the serving hosts,
# by sending their Host header. One line per check, pass or fail; the exit code is the number of failed checks.
set -uo pipefail

dist="${1:-dist}"
port="${2:-8790}"
base="http://127.0.0.1:$port"
[ -f "$dist/_redirects" ] && [ -f "$dist/_headers" ] && [ -f "$dist/_routes.json" ] || {
  echo "$0: $dist is not a merged upload (_redirects, _headers and _routes.json at its root); build and merge first" >&2
  exit 64
}
serving=0
grep -q "serve: 'https://modules.openmercato.com'" functions/site.ts && serving=1

if curl -s -o /dev/null "$base/"; then
  echo "$0: something already answers on $base; stop it or pass another port" >&2
  exit 64
fi
log="$(mktemp)"
# its own process group (setsid), so the stop below ends wrangler and the workerd it starts, and nothing else
WRANGLER_SEND_METRICS=false setsid node_modules/.bin/wrangler pages dev "$dist" --port "$port" >"$log" 2>&1 &
pid=$!
stop() {
  kill -- "-$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
  rm -f "$log"
}
trap stop EXIT
for _ in $(seq 1 90); do
  curl -s -o /dev/null "$base/" && break
  sleep 1
done
if ! curl -s -o /dev/null "$base/"; then
  echo "$0: wrangler pages dev did not answer on $base" >&2
  cat "$log" >&2
  exit 64
fi
if grep -q 'invalid redirect rule' "$log"; then
  echo "fail  wrangler read every rule of $dist/_redirects"
  grep -A2 'invalid redirect rule' "$log"
  failed=1
else
  echo "pass  wrangler read every rule of $dist/_redirects"
  failed=0
fi

# check <name> <expected status> <expected location or -> <path> [curl options...]
check() {
  local name="$1" want="$2" where="$3" path="$4"
  shift 4
  local got
  got="$(curl -s -o /dev/null --path-as-is -w '%{http_code} %{redirect_url}' "$@" "$base$path")"
  local status="${got%% *}" location="${got#* }"
  # the emulator writes a Location on the requested host with the request's scheme; compare host and path
  location="${location#http://}"
  location="${location#https://}"
  local ok=1
  [ "$status" = "$want" ] || ok=0
  [ "$where" = "-" ] || [ "$location" = "$where" ] || ok=0
  if [ "$ok" = 1 ]; then echo "pass  $name"; else
    echo "fail  $name: $status $location"
    failed=$((failed + 1))
  fi
}
# header <name> <header line pattern (grep -iE)> <path> [curl options...]
header() {
  local name="$1" pattern="$2" path="$3"
  shift 3
  # captured first: `grep -q` at the end of a pipe exits on the first match, and under pipefail the SIGPIPE of the
  # writer before it turned a match into a failure
  local headers
  if headers="$(curl -s -o /dev/null -D - --path-as-is "$@" "$base$path" | tr -d '\r')" && grep -qiE "$pattern" <<<"$headers"; then
    echo "pass  $name"
  else
    echo "fail  $name"
    failed=$((failed + 1))
  fi
}

# answers <path>: 200, or exactly one redirect to another URL that answers 200; never a redirect to itself (incident of
# 27 Nov 2026: Pages read `/run//*` as `/run/*` and sent every page under the base to itself)
answers() {
  local path="$1" got status location next
  got="$(curl -s -o /dev/null --path-as-is -w '%{http_code} %{redirect_url}' "$base$path")"
  status="${got%% *}" location="${got#* }"
  if [ "$status" = 200 ]; then echo "pass  $path answers 200"; return; fi
  case "$status" in
    301 | 302 | 307 | 308)
      if [ "$location" = "$base$path" ]; then
        echo "fail  $path: $status to itself"
        failed=$((failed + 1))
        return
      fi
      next="$(curl -s -o /dev/null -w '%{http_code}' "$location")"
      if [ "$next" = 200 ]; then echo "pass  $path answers $status to $location, which answers 200"; else
        echo "fail  $path: $status to $location, which answers $next"
        failed=$((failed + 1))
      fi
      ;;
    *)
      echo "fail  $path: $status"
      failed=$((failed + 1))
      ;;
  esac
}

check "the main site home" 200 - /
check "HEAD of the home" 200 - / -I
check "the catalog home" 200 - /run/modules
check "the base leads to the catalog home" 302 "127.0.0.1:$port/run/modules" /run
pkg="$(cd "$dist/run/m" 2>/dev/null && ls -d @*/*.html 2>/dev/null | head -n 1)"
pkg="${pkg%.html}"
if [ -n "$pkg" ]; then
  check "a package page with a trailing slash keeps its @" 301 "127.0.0.1:$port/run/m/$pkg" "/run/m/$pkg/"
  answers "/run/m/$pkg"
  answers "/run/m/$pkg/"
else
  echo "fail  $dist/run/m has a scoped package page"
  failed=$((failed + 1))
fi
for p in /run/modules /run/modules/ /run/compat /run/compat/ /run/templates /run/templates/; do answers "$p"; done
check "/sitemap.xml" 301 "127.0.0.1:$port/sitemap-index.xml" /sitemap.xml
check "a docs address (a splat rule of the main site, after the static ones)" 301 "docs.openmercato.com/" /docs/smoke-test
for h in 'Strict-Transport-Security: max-age=31536000$' 'X-Frame-Options: SAMEORIGIN' 'X-Content-Type-Options: nosniff'; do
  header "/ sends ${h%%:*}" "^$h" /
  header "/robots.txt sends ${h%%:*}" "^$h" /robots.txt
  header "/run/robots.txt sends ${h%%:*}" "^$h" /run/robots.txt
done
css="$(cd "$dist" && ls _astro/*.css 2>/dev/null | head -n 1)"
if [ -n "$css" ]; then
  header "/$css is cached for good" '^Cache-Control: public, max-age=31536000, immutable' "/$css"
else
  echo "fail  $dist/_astro has a stylesheet"
  failed=$((failed + 1))
fi

if [ "$serving" = 1 ]; then
  M=(-H 'Host: modules.openmercato.com')
  check "an old catalog address" 301 modules.openmercato.com/run/compat /compat "${M[@]}"
  check "an old address with a trailing slash, in one hop" 301 modules.openmercato.com/run/compat /compat/ "${M[@]}"
  check "an old address with .html, in one hop" 301 modules.openmercato.com/run/compat /compat.html "${M[@]}"
  check "an old address with a run of slashes" 301 modules.openmercato.com/run/compat //run/compat "${M[@]}"
  check "a file at its old address" 200 - /llms.txt "${M[@]}"
  check "the templates root" 302 modules.openmercato.com/run/templates / -H 'Host: templates.openmercato.com'
  header "the 301 is cached an hour" '^Cache-Control: public, max-age=3600' /compat "${M[@]}"
  header "the 301 is noindex" '^X-Robots-Tag: noindex' /compat "${M[@]}"
  header "the 301 sends X-Frame-Options" '^X-Frame-Options: SAMEORIGIN' /compat "${M[@]}"
fi

echo "$failed failed"
exit "$failed"
