# AGENTS.md

Rules for coding agents working on this repository (the catalog itself, not on Open Mercato apps).

1. Stay inside your work package. Each work package (WP) changes only the paths in its `owns_paths`. When you need a change in a path another WP owns, write a note for its owner in your PR description instead of editing the file. `package.json`, `yarn.lock` and `tsconfig.json` belong to WP01; the dependency list is fixed and must not grow without a change to the specification.
2. One PR per WP against `main`. A person merges. Commits carry no `Co-Authored-By` trailer.
3. Nothing outside this repository is published without an explicit yes from the owner: no PRs to other repositories, no npm publish, no Worker deploy, no announcements. WPs for other repositories end with a branch and a ready PR description.
4. Third-party module code runs only on `ubuntu-latest` in `nightly.yml` and `spike.yml`. Never on the Cezar server (it holds secrets) and never on the owner's Mac. Static analysis (AST, no execution) is fine anywhere.
5. The owner's Mac does light work only (YAML, texts, review). Site builds, Anatomy of all packages, Playwright and monorepo tests run on Cezar with limits, at most 4 heavy runs at once.
6. TypeScript runs directly on Node 24 with type stripping: erasable syntax only (`erasableSyntaxOnly: true`), relative imports with the `.ts` extension, `import type` for types, no `enum`, `namespace`, parameter properties or decorators.
7. Texts for people (UI, README, PR descriptions) are in English, short, with a period, without exclamation marks and without long dashes (U+2014 and U+2013 are banned; CI checks them). Evidence over adjectives.
8. No number on the site is typed by hand. Sentences such as "Peer ranges reject N of M combinations" are computed by the emitter from data.
9. The words `catalog` and `directory` do not appear in CLI commands, identifiers or JSON keys (they are Open Mercato core modules). In site prose "catalog" is fine.

## Map

- `lib/schema/`: Zod schemas, the single source of truth (descriptor, policy files, `data` branch, published files, tool contract `tools@1`). JSON Schema is generated from them.
- `lib/core/`: isomorphic code for the site, the MCP Worker and the CLI (no Node APIs).
- `lib/cli.ts`: `yarn om <cmd>` loads `lib/commands/<cmd>.ts`; `yarn om` lists the commands.
- `modules/`, `policy/`, `quality/`, `harness/`: curated inputs. `data` branch: computed outputs.
- `test/fixtures/data/`: a validated snapshot of the `data` branch for 8 entries and 3 built-in modules; use it instead of the network in tests.

## Checks

`yarn check` (tsc for the repo and for `mcp/`, astro check, prettier, check-text) and `yarn test` must be green before a PR.
