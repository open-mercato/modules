#!/usr/bin/env bash
# slot-swap <core id>...: remove the core registration of each module ID the entry replaces (descriptor `replaces`),
# because `mercato module add` refuses an ID that is already registered from another package (spec 5.3, 11.4).
# Runs as om-cell in the app directory.
set -euo pipefail
file=src/modules.ts
for id in "$@"; do
  [[ "$id" =~ ^[a-z][a-z0-9_]*$ ]] || { echo "slot-swap: bad module id: $id" >&2; exit 1; }
  sed -i "/{ id: '$id', from: '@open-mercato\/core' },\{0,1\}/d" "$file"
  if grep -q "id: '$id', from: '@open-mercato/core'" "$file"; then
    echo "slot-swap: $id is still registered in $file" >&2
    exit 1
  fi
done
