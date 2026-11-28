# Notify: 2026-11-28-www-cms-push-pull

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-11-28T00:53:00Z: run started

- Brief: Steps 3.1 (`yarn om www-push`) and 3.2 (`yarn om www-pull`) of the Strapi CMS spec, with a rehearsal on a
  throwaway local instance as evidence for the owner's Step 3.3.
- External skill URLs: none

## 2026-11-28T00:53:00Z: decisions

- Validation gate: the repository's `yarn check` and `yarn test` (AGENTS.md, Checks), not the `npm` commands of the
  copied operator config, which this Yarn repository does not have.
- Labels: of the configured taxonomy only `documentation` exists in the repository; every other label is a logged skip.
- Claim comments name no person (the operator asked for no mentions).
- Media folders: only the admin API of Strapi 5.64.0 creates Media Library folders; the push needs them to exist and
  names the missing ones (PLAN.md, Design decisions).

## 2026-11-28T01:10:53Z: Step 3.1 left one test red

- c7b14ba added `www-push` to the command list of `lib/cli.ts` without the list pinned in `test/schema/cli.test.ts`
  (only `test/www-cms` ran before that commit). The Step 3.2 commit adds both commands to the test; history is not
  rewritten.

## 2026-11-28T02:06:03Z: rehearsal and review

- Rehearsal on a throwaway local instance (rehearsal.md): three behaviours of 5.64.0 fixed in 3.2-recording (folder
  invisible to API tokens, so the site folder rides in the caption; read-only tokens reach /api/upload/files only;
  that list pages by start and limit). Read-only token reads drafts: recorded in the spec's Risks.
- Review subagent (om-code-review checklist): request changes, 3 major and 5 minor; fixed in 3.2-review-fix.
