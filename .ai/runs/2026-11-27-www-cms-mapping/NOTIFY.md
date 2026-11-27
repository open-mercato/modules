# Notify: 2026-11-27-www-cms-mapping

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-11-27T22:13:46Z: run started

- Brief: Phase 1 of docs/specs/2026-11-27-www-strapi-cms.md (Steps 1.1, 1.1a, 1.1b, 1.2, 1.3), one PR, one commit per Step.
- External skill URLs: none
- Decision: the gate is AGENTS.md's `yarn check` and `yarn test` (the operator config's npm commands do not exist here).
- Decision: the run folder is committed with `git add -f` (`.ai/` is excluded locally; earlier runs on main committed `.ai/runs/` files the same way).
- Decision: of the label taxonomy only `documentation` and `bug` exist in the repository; every other label is a logged skip, none is created.
- Decision: no integration suite applies (the site must not change); the byte diff of both layouts and the Pages smoke test stand for it.
