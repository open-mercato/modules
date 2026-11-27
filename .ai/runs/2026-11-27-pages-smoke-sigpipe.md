# Execution plan: pages-smoke-sigpipe

## Goal

The header checks of `scripts/pages-smoke.sh` stop failing at random when a header is present.

## Scope

- `scripts/pages-smoke.sh`, `header()`: capture the response headers into a variable first, then match the variable with `grep -qiE`. Today `curl | tr -d '\r' | grep -qiE` runs under `set -o pipefail`; `grep -q` exits on the first match, `tr` can get SIGPIPE, and pipefail turns the match into a failure (`pages` run on main 9c3be74: `tr: write error: Broken pipe`, then `fail  /run/robots.txt sends Strict-Transport-Security`).
- That is the only check in the script that pipes into `grep -q`; the other `grep -q` calls read files, and the `ls | head -n 1` pipelines are assignments whose status no check reads.

Non-goals: no change to what any check asserts; no other cleanup.

## Risks

- None beyond the script: it is a CI smoke test, not shipped code.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Fix and prove

- [ ] 1.1 Match captured headers instead of a pipe into grep -q
- [ ] 1.2 Repeated smoke runs against a merged upload
