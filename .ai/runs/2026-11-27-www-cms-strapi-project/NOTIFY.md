# Notify: 2026-11-27-www-cms-strapi-project

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-11-27T23:16:00Z: run started

- Brief: Phase 2 of docs/specs/2026-11-27-www-strapi-cms.md, Steps 2.1 to 2.5, one PR, one commit per Step. Step 2.6 is the owner's.
- External skill URLs: none
- Decision: the gate is AGENTS.md's `yarn check` and `yarn test` plus the new `cms.yml` (the operator config's npm commands do not exist here).
- Decision: the run folder is committed with `git add -f` (`.ai/` is excluded locally, as in earlier runs).
- Decision: labels of the taxonomy that do not exist in the repository are logged skips; none is created. The claim is the assignee plus the claim comment, without a mention.
- Decision: Strapi 5.64.0 (published 25 Nov 2026) is younger than the 14-day age gate; `cms/.yarnrc.yml` keeps the gate and pre-approves `@strapi/*` only, with a comment.
