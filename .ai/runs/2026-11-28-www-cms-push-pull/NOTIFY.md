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
