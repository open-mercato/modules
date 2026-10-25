#!/usr/bin/env bash
# env: write .env for the cell app (spec 5.3, D8). Runs as om-cell in the app directory.
# dotenv keeps the first value of a key, so every key we set is first removed from the copy of .env.example,
# then appended once. No NODE_ENV: `next build` needs production (spike fix 3).
set -euo pipefail

app=$PWD
port=3901
url="http://localhost:${port}"
secret() { openssl rand -hex 24; }

declare -a keys=(
  DATABASE_URL APP_URL NEXT_PUBLIC_APP_URL PLATFORM_PORTAL_BASE_URL
  AUTH_SECRET JWT_SECRET NEXTAUTH_SECRET OM_SECURITY_MFA_SETUP_SECRET TENANT_DATA_ENCRYPTION_FALLBACK_KEY
  OM_TEST_MODE OM_DISABLE_EMAIL_DELIVERY AUTO_SPAWN_WORKERS AUTO_SPAWN_SCHEDULER
  CACHE_STRATEGY CACHE_SQLITE_PATH PORT
)

if [[ -f .env.example ]]; then cp .env.example .env; else : >.env; fi
pattern=$(printf '%s|' "${keys[@]}")
pattern=${pattern%|}
# Drop existing lines of our keys, with or without `export ` and spaces before `=`.
grep -Ev "^[[:space:]]*(export[[:space:]]+)?(${pattern})[[:space:]]*=" .env >.env.tmp || true
mv .env.tmp .env

{
  echo ''
  echo '# --- om-modules harness (harness/env.sh) ---'
  echo "DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/open-mercato"
  echo "APP_URL=${url}"
  echo "NEXT_PUBLIC_APP_URL=${url}"
  echo "PLATFORM_PORTAL_BASE_URL=${url}"
  echo "AUTH_SECRET=$(secret)"
  echo "JWT_SECRET=$(secret)"
  echo "NEXTAUTH_SECRET=$(secret)"
  echo "OM_SECURITY_MFA_SETUP_SECRET=$(secret)"
  echo "TENANT_DATA_ENCRYPTION_FALLBACK_KEY=$(secret)"
  echo 'OM_TEST_MODE=1'
  echo 'OM_DISABLE_EMAIL_DELIVERY=1'
  echo 'AUTO_SPAWN_WORKERS=false'
  echo 'AUTO_SPAWN_SCHEDULER=false'
  echo 'CACHE_STRATEGY=sqlite'
  echo "CACHE_SQLITE_PATH=${app}/.mercato/cache.db"
  echo "PORT=${port}"
} >>.env

# Each key exactly once.
for k in "${keys[@]}"; do
  n=$(grep -Ec "^[[:space:]]*(export[[:space:]]+)?${k}[[:space:]]*=" .env || true)
  [[ "$n" == 1 ]] || { echo "env: ${k} appears ${n} times in .env" >&2; exit 1; }
done
echo "env: wrote .env with ${#keys[@]} harness keys"
