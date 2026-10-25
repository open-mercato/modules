# Open Mercato Modules

Extend everything. Start with 80% done. Every module here is read from its published code and installed in a fresh Open Mercato app, night after night.

This repository holds the module descriptors, the code that measures them and the site at https://open-mercato.github.io/modules (later https://modules.openmercato.com). Descriptions come from authors. Everything else is measured.

## Submit a module in 3 steps

1. Publish your module to npm with a stable version (`1.2.3`, not a prerelease). It needs `src/modules/<id>/index.ts` and `dist/modules/<id>/` in the tarball. A GitHub-only module needs a tag that contains `dist/modules/<id>/`.
2. Add one file to `modules/`: `modules/@scope/name.yml` for a scoped package, `modules/name.yml` for an unscoped one, `modules/github/owner/repo.yml` (lower case) for GitHub only. Minimum content:

   ```yaml
   npm: '@your-scope/your-module'
   github: your-org/your-repo
   category: integrations-sync
   summary: One sentence in English, 20 to 140 characters, plain text.
   whenToUse: Use when the app must do the thing this module does, in one sentence.
   ```

3. Open a pull request. CI checks the descriptor, reads the tarball (without running it) and writes a short summary on the PR. A maintainer merges it; the first nightly install runs the night after.

Fields, categories and text rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## What the catalog measures

- Anatomy: tables, routes, permissions, events, queues, AI tools, secrets and hosts, read statically from `src/` of the published tarball, each fact with file and line.
- Fits statically: every import resolves against the published Open Mercato packages of a line. Not installed.
- Receipts: a new Open Mercato app per release line (`0.8`, `0.9`, `next`), from the classic preset that `npx create-mercato-app` makes, installs the module and runs scaffold, install, add, generate, typecheck, initialize, build, start and smoke. The row "Open Mercato itself" is that app with nothing added. The same cell in an app from the empty preset is a second signal, `in isolation`, never the verdict.
- Levels: Listed and Verified are given by machines. OM Quality is given by people only.

Verified is a compatibility signal, not a security review. A module's own code runs during the test.

## For agents

Every page has a `.md` and a `.json` twin, `/llms.txt` lists them, and the read-only MCP server exposes `search_modules`, `get_module`, `check_compat`, `plan_install` and `get_changes`.

## Development

Node 24.21.0 (`.nvmrc`) and Yarn 4.18.1 through Corepack.

```sh
corepack enable
yarn install --immutable
yarn check   # tsc, astro check, prettier, check-text
yarn test    # vitest
yarn om      # list repo commands
```

Rules for coding agents working on this repository are in [AGENTS.md](AGENTS.md). Security reports: [SECURITY.md](SECURITY.md).

## License

MIT. Module descriptions belong to their authors.
