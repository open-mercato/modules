# Notify: 2026-11-27-www-cms-strapi-project

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-11-27T23:16:00Z: run started

- Brief: Phase 2 of docs/specs/2026-11-27-www-strapi-cms.md, Steps 2.1 to 2.5, one PR, one commit per Step. Step 2.6 is the owner's.
- External skill URLs: none
- Decision: the gate is AGENTS.md's `yarn check` and `yarn test` plus the new `cms.yml` (the operator config's npm commands do not exist here).
- Decision: the run folder is committed with `git add -f` (`.ai/` is excluded locally, as in earlier runs).
- Decision: labels of the taxonomy that do not exist in the repository are logged skips; none is created. The claim is the assignee plus the claim comment, without a mention.
- Decision: Strapi 5.64.0 (published 25 Nov 2026) is younger than the 14-day age gate; `cms/.yarnrc.yml` keeps the gate and pre-approves `@strapi/*` only, with a comment.

## 2026-11-28T00:40:00Z: decisions of Steps 2.1 to 2.5

- Strapi 5.64.0 forced two mapping changes (in 2.2 with tests): redirect `status` is `statusCode` (reserved with Draft and Publish); partner budgets get Strapi enum values (a value may not start with a digit).
- Redirects keep a `slug` uid (the `from` path) because the mapping reads a collection's id from `slug`; editors type it twice. Open point for Phase 3.
- The hook listens on strapi.eventHub (source confirmed); the relay fallback is not used.
- The backup job runs from the host's cron with `compose run`; the weekly `strapi export` is a host cron line in cms/README.md.
- The run never wrote AGENTS.md (a Map note for its owner in the PR body).

## 2026-11-28T00:40:00Z: review and final gate

- Delegated `om-auto-review-pr 44 --autofix` to one subagent: approve after 0238fef, 544963b, 0eae850, 5879b02; 0b8d620 by the main session.
- diff -r of the merged production layout main against the tip: empty.

## 2026-11-28T00:40:00Z: run finished

- PR: https://github.com/open-mercato/modules/pull/44, Status complete.
