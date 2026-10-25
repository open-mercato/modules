#!/usr/bin/env bash
# api-keys: register the api_keys core module right after auth in src/modules.ts (OM #7473, 0.9.x only).
# Runs as om-cell in the app directory. Idempotent: an app that already registers api_keys is left as is.
set -euo pipefail
file=src/modules.ts
grep -q "id: 'auth', from" "$file" || { echo "api-keys: no auth registration in $file" >&2; exit 1; }
grep -q "id: 'api_keys'" "$file" || sed -i "/id: 'auth', from/a\\  { id: 'api_keys', from: '@open-mercato/core' }," "$file"
grep -q "id: 'api_keys'" "$file"
