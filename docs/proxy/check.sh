#!/usr/bin/env bash
# Checks a host that serves the Run section under /run: the preview (https://run-preview.open-mercato-modules.pages.dev),
# the proxy of the main site (https://www.openmercato.com) or a local `wrangler pages dev dist` of the nested build.
# What it checks is the contract in docs/RUNBOOK.md (Move under www.openmercato.com/run). One line per check, pass or
# fail; the exit code is the number of failed checks (0 when all pass).
#
#   docs/proxy/check.sh <base URL> [package]
#   docs/proxy/check.sh https://www.openmercato.com
#   docs/proxy/check.sh http://127.0.0.1:8788 @open-mercato/gateway-tpay
#
# The package is one that has a page in the catalog (default @open-mercato/gateway-tpay).
set -uo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "usage: $0 <base URL> [package]" >&2
  exit 64
fi
base="${1%/}"
pkg="${2:-@open-mercato/gateway-tpay}"
case "$base" in
  http://* | https://*) ;;
  *)
    echo "$0: the base URL starts with http:// or https://: $1" >&2
    exit 64
    ;;
esac
command -v curl >/dev/null || {
  echo "$0: curl is missing" >&2
  exit 64
}

failed=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# fetch <path> [method]: status in $status, headers in $tmp/h, body in $tmp/b; never follows a redirect
fetch() {
  local method="${2:-GET}"
  : >"$tmp/h"
  : >"$tmp/b"
  if [ "$method" = HEAD ]; then
    status="$(curl -sS -I --max-time 20 -o /dev/null -D "$tmp/h" -w '%{http_code}' "$base$1" 2>"$tmp/e")" || status=000
  else
    status="$(curl -sS --max-time 20 -o "$tmp/b" -D "$tmp/h" -w '%{http_code}' "$base$1" 2>"$tmp/e")" || status=000
  fi
}

# header <name>: the value of the last such header of the answer, without the line end
header() {
  grep -i "^$1:" "$tmp/h" | tail -n 1 | sed -E 's/^[^:]+:[[:space:]]*//; s/[[:space:]]*$//'
}

result() {
  if [ "$1" = pass ]; then
    printf 'pass  %s\n' "$2"
  else
    printf 'fail  %s (%s)\n' "$2" "$3"
    failed=$((failed + 1))
  fi
}

# redirect <path> <location>: a 302 whose Location is the path on the same host, or the same address in full
redirect() {
  fetch "$1"
  local loc
  loc="$(header location)"
  if [ "$status" = 302 ] && { [ "$loc" = "$2" ] || [ "$loc" = "$base$2" ]; }; then
    result pass "$1 answers 302 to $2"
  else
    result fail "$1 answers 302 to $2" "got $status${loc:+, location $loc}"
  fi
}

# page <path> <type>: a 200 whose Content-Type starts with the type, no redirect
page() {
  fetch "$1"
  local type
  type="$(header content-type)"
  if [ "$status" = 200 ] && [[ "$type" == "$2"* ]]; then
    result pass "$1 answers 200 $2"
  else
    result fail "$1 answers 200 $2" "got $status${type:+, $type}"
  fi
}

redirect /run /run/modules
redirect /run/ /run/modules
# the query is kept, on the redirect and on a page
redirect '/run?utm_source=check' '/run/modules?utm_source=check'
page /run/modules text/html
page /run/modules.json application/json
page "/run/m/$pkg" text/html
page "/run/submit?npm=$pkg" text/html

fetch /run/modules.json
cors="$(header access-control-allow-origin)"
if [ "$cors" = '*' ]; then
  result pass "/run/modules.json carries Access-Control-Allow-Origin: *"
else
  result fail "/run/modules.json carries Access-Control-Allow-Origin: *" "got ${cors:-none}"
fi

if [ "$status" = 200 ] && grep -q '"entries"' "$tmp/b"; then
  result pass "/run/modules.json is the catalog index"
else
  result fail "/run/modules.json is the catalog index" "no entries in the body"
fi

fetch /run/modules
canonical="$(grep -o '<link rel="canonical" href="[^"]*"' "$tmp/b" | head -n 1 | sed -E 's/.*href="([^"]*)"/\1/')"
if [ "$canonical" = https://www.openmercato.com/run/modules ]; then
  result pass "/run/modules names https://www.openmercato.com/run/modules as canonical"
else
  result fail "/run/modules names https://www.openmercato.com/run/modules as canonical" "got ${canonical:-none}"
fi

missing="/run/no-such-page-$$"
fetch "$missing"
if [ "$status" = 404 ]; then
  result pass "a missing page under /run answers 404"
else
  result fail "a missing page under /run answers 404" "got $status for $missing"
fi

# what the host says about indexing: the preview carries noindex, production does not. Shown, not judged.
fetch /run/modules HEAD
robots="$(header x-robots-tag)"
printf 'info  X-Robots-Tag of /run/modules: %s\n' "${robots:-none}"

echo "$failed failed"
exit "$failed"
