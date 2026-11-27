# Execution plan: run-redirect-loop

## Goal

Every path under `/run/` answers again on the Pages deployment: no 301 to itself.

## Scope

- `lib/emit/pages-merge.ts`: drop the `/run//* /run/:splat 301` rule of `mergedRedirectsTail()`; `redirectProblems()` fails on a rule whose source, with runs of slashes collapsed as Pages does, covers its own target.
- `test/emit/pages-merge.test.ts`: the emitted rules, and the new check.
- `scripts/pages-smoke.sh`: `/run/modules`, `/run/modules/`, `/run/compat`, `/run/templates`, `/run/m/<package>` answer 200 or one redirect to another URL that answers 200.

Non-goals: no other cleanup; the `/run/m/:scope/:name/` rule stays (Pages matches the trailing slash literally and package pages are `name.html`).

## Risks

- `/run//x` no longer has a rule of its own; Pages normalizes the path itself.

## Progress

PR: #40

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Fix and prove

- [x] 1.1 Drop the self-covering rule and check for it - 9b337ee
- [x] 1.2 Smoke assertions in the emulator - 9a47d87
