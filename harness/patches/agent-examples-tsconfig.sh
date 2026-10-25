#!/usr/bin/env bash
# agent-examples-tsconfig: exclude the sandboxed agent scripts and tools of the template from tsconfig.json
# (OM #6695, in create-mercato-app 0.9.0, not in 0.8.0). The 0.8.0 empty preset ships src/modules/agent_examples with
# plain-script files (`function run(args)` without imports or exports) that `yarn typecheck` and the type check of
# `yarn build` reject: TS2393 and TS7006 in agents/**/scripts/score.ts and agents/**/tools/lookup_ticket_history.ts.
# Runs as om-cell in the app directory, before install. Idempotent: an app that already excludes both globs is left
# as is.
set -euo pipefail
node -e '
const fs = require("fs")
const file = "tsconfig.json"
const want = ["src/modules/**/agents/**/scripts/**", "src/modules/**/agents/**/tools/**"]
const config = JSON.parse(fs.readFileSync(file, "utf8"))
const exclude = Array.isArray(config.exclude) ? config.exclude : ["node_modules"]
const missing = want.filter((g) => !exclude.includes(g))
if (missing.length > 0) {
  config.exclude = [...exclude, ...missing]
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n")
}
const after = JSON.parse(fs.readFileSync(file, "utf8")).exclude
if (!want.every((g) => after.includes(g))) { console.error("agent-examples-tsconfig: exclude not set"); process.exit(1) }
'
