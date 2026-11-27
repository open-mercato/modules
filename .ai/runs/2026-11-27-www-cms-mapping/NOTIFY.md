# Notify: 2026-11-27-www-cms-mapping

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-11-27T22:13:46Z: run started

- Brief: Phase 1 of docs/specs/2026-11-27-www-strapi-cms.md (Steps 1.1, 1.1a, 1.1b, 1.2, 1.3), one PR, one commit per Step.
- External skill URLs: none
- Decision: the gate is AGENTS.md's `yarn check` and `yarn test` (the operator config's npm commands do not exist here).
- Decision: the run folder is committed with `git add -f` (`.ai/` is excluded locally; earlier runs on main committed `.ai/runs/` files the same way).
- Decision: of the label taxonomy only `documentation` and `bug` exist in the repository; every other label is a logged skip, none is created.
- Decision: no integration suite applies (the site must not change); the byte diff of both layouts and the Pages smoke test stand for it.

## 2026-11-27T22:39:43Z: decision, key order of five files (Step 1.2)

- Five files of www/content held the same keys in two orders within one kind of object (blog-categories.yaml: a numbered `order` after the colours; pages agent-orchestrator, architecture, home, pricing: block and item fields). A Strapi component has one attribute order, so they could not come back byte for byte.
- Done: those files are written in the mapping's order (data deep-equal before and after); the importer places a numbered `order` after `name`; the manifest hash of blog-categories.yaml is what the fixed importer writes. The test is not changed. Flagged in the PR body as a decision for the owner; the built site must stay byte-identical (checked by the layout diff).
- Builds: the diff of two builds of the same commit is empty only with OM_NOW, GITHUB_SHA and one build path pinned (the emit clock, the About stamp, and Astro's scoped CSS ids hash the absolute path). Every layout build of this run uses all three.

## 2026-11-27T23:03:52Z: review and final gate

- Delegated `om-auto-review-pr 43 --autofix` to one subagent: verdict approve, fixes 2039d9f and afa234f, open points listed in the PR body.
- Final gate green on afa234f; diff -r of both layouts against main empty; smoke test 35 pass.

## 2026-11-27T23:03:52Z: run finished

- PR: https://github.com/open-mercato/modules/pull/43, Status complete, marked ready.
