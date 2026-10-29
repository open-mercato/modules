# Templates: app templates in the catalog, save as template, create from template

Status: Decided. Author: catalog maintainers. Decision owners: Wojtek Szyjka, Piotr Karwatka. Date: 2026-10-29. Revision 5 (after Piotr's messages on Discord on 2026-10-29: D2 decided as A, `templates.openmercato.com` as a second domain of the site, a new Phase 0 that ships the Templates section now as "coming soon", D7 rewritten). Revision 4 followed two reviews, an independent review, a verification of its claims and a final consistency pass.

## TLDR

- **Who needs it.** Agencies and developers who want to start an Open Mercato app from a working example (a CRM, a partner portal, a B2B shop) instead of an empty scaffold. Also people who built something in an OM Cloud sandbox and want to save it to a repo and share it as a starting point.
- **Today.** `create-mercato-app` can already import a whole app from GitHub (`--app`, `--app-url`, since 0.5.0). Discovery was an awesome list (`open-mercato/ready-apps`), archived on 2026-10-09, with one row. Its only app pins Open Mercato 0.4.x and has no license. `--app` fails for every existing repo. Nothing saves an app as a template.
- **Proposed (future behavior).**
  - A tool that turns any standalone OM app, a sandbox included, into a clean template. `prepare` builds an immutable, reviewed snapshot with no network. `publish` pushes exactly that snapshot as a one-commit GitHub template repo. The export is code only: configuration held in the database, uploads and runtime edits are not saved.
  - The tool is a separate package, `create-mercato-template`, that works like `create-mercato-module` (D2, decided as A on 2026-10-29). The A and B comparison below stays as the record of why.
  - A **Templates** section in this catalog, also reachable at `templates.openmercato.com`: YAML entries by PR, static validation, a gallery, and `templates.json` for the CLI.
  - `create-mercato-app --template <slug | owner/repo>`, which resolves a slug through the catalog to one commit sha and reuses the existing `--app-url` fetch, with archive limits added.
  - v1 ends when one flow works: save a sandbox app to a repo, then create an app from that repo.
  - After v1: a nightly smoke of every template, so "works with OM x.y" is measured, not claimed. Later: a sandbox "Save as template" button.
- **Now (Phase 0, 2026-10-29).** The Templates section ships at once as "coming soon": a `/templates` page that says what templates will be, a header item, and `templates.openmercato.com` leading to it. No entries, sample or placeholder cards. The save tool (Phase 2) and the section data (Phase 1a) follow next week, then `--template` (Phase 4).
- **Why.** Vercel and Next.js show the pattern: a gallery card plus one command or one click. Neither re-tests templates. OM already runs a nightly install harness, so it can.

## Decisions

All questions are decided. Wojtek accepted the defaults of D1, D3 to D6 and D8 to D10 and of A1 to A13 on 2026-10-29. The same day Piotr Karwatka wrote on Discord (08:40-08:56, translated) that templates should be added and `create-mercato-app` should create apps from them, that the save tool "should work very much like create-mercato-module", and asked for the Templates section on the site right away, with the mechanism next week. Wojtek then decided D2 as A and rewrote D7.

| #   | Question                                                                                                                                                                                                                                                                                                                                                                                                                    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Public name. Should "Templates" become the one public term? Two clashes exist: the OM Cloud wizard says "Choose a template" for its starting points, and inside `create-mercato-app` "template" already means the bare scaffold (`TEMPLATE_DIR`, `scaffoldTemplateApp`, `.template` files).                                                                                                                                 | Yes. Catalog and docs say "Templates" (app templates). OM Cloud starting points become "sandbox starters", which needs a yes from the OM Cloud team (owner: Piotr). Inside `create-mercato-app` the code terms stay; user-facing help says "app template" and "scaffold". `--preset` stays "preset".                                                                                                                                                                                                                 |
| D2  | Which tool saves an app as a template: A (separate package `create-mercato-template`, modeled on `create-mercato-module`) or B (a `--save-template` mode of `create-mercato-app`)? C (`yarn mercato template`) and A' (a command in `create-mercato-module`) are listed for completeness. See [Save tool options](#save-tool-options).                                                                                      | **Decided: A** (Wojtek, 2026-10-29), a separate package `create-mercato-template`. Piotr: the tool "should work very much like create-mercato-module: you push your whole app as a template to GitHub and that repo can then be used as a template" (Discord, 2026-10-29, translated). Creating (`--template`) goes into `create-mercato-app`. The [A and B comparison](#save-tool-options) stays as the record of why.                                                                                              |
| D3  | Ready Apps contract. `--template` conflicts with three rules of the Ready Apps spec and `packages/create-app/AGENTS.md`: "no additional lookup tables in v1" (written for `--app` names), "MUST NOT rewrite ... package names", and "raw source snapshots" (which rules out a provenance field and removing `mercato-template.json`). It also needs a design note on the catalog index (see [Review notes](#review-notes)). | Amend both documents explicitly in the Phase 4 spec, for `--template` only: slug lookup through the catalog, `name` rewrite with `--keep-name` to opt out, provenance field, `mercato-template.json` removed. The new archive limits apply to the shared fetch, so `--app-url` gets them too; that narrowing is listed in the same amendment. Otherwise `--app` and `--app-url` keep their contract.                                                                                                                 |
| D4  | License rule. Modules treat a license only as a mismatch warning today. A template is meant to be copied, so a repo without a license cannot legally be reused. PRM has no license (2026-10-29).                                                                                                                                                                                                                            | An OSI license is required for `status: active` (blocking check). A `hold` entry may lack one and follows the [hold policy](#hold-policy). PRM is listed as `hold` until its owner adds a license and refreshes it.                                                                                                                                                                                                                                                                                                  |
| D5  | Paid dependencies. `@open-mercato/enterprise` is on npm as proprietary modules. An app saved from a commercial sandbox can easily depend on it.                                                                                                                                                                                                                                                                             | Allowed, but marked. `prepare` reports it, the catalog computes a "requires an Enterprise license" mark from the lockfile (never typed by hand), the page says so above the create command, and the nightly smoke skips such templates (as it skips the enterprise module today). Piotr owns the license boundary and may say "forbidden in v1".                                                                                                                                                                     |
| D6  | "Open in sandbox" (the Vercel one-click part): in v1 or later?                                                                                                                                                                                                                                                                                                                                                              | Later, with the sandbox button (Phase 3), not a blocker for v1. The catalog side is one link (`template=owner/repo`, `ref=<sha>`). The sandbox must ask for explicit confirmation, because it runs third-party code in the user's workspace. OM Cloud team decides the timing.                                                                                                                                                                                                                                       |
| D7  | First templates and when the section goes public. The gallery would start with one `hold` entry.                                                                                                                                                                                                                                                                                                                            | **Decided** (Wojtek, 2026-10-29, after Piotr asked to mark the section at once). The section is public now as "coming soon" (Phase 0), with no entries, sample or placeholder cards. Real entries appear after the save tool ships. Candidate 1: an app saved from a sandbox, produced by the v1 acceptance flow. Candidate 2: a CRM template built from `--preset crm` plus one demo module, made by Wojtek with the save tool. Candidate 3: PRM refreshed to the current stable line with a license, by its owner. |
| D8  | Private templates. Agencies are the main users, and many keep their starting point private.                                                                                                                                                                                                                                                                                                                                 | `--template owner/repo` works on a private repo with `GITHUB_TOKEN`, through the existing `--app-url` fetch. Private repos are never listed. `publish` requires an explicit `--public` or `--private`.                                                                                                                                                                                                                                                                                                               |
| D9  | `open-mercato/ready-apps` is already archived (2026-10-09). Unarchive it to add a pointer to the catalog, or leave it?                                                                                                                                                                                                                                                                                                      | Leave it archived. The `--app` miss message and the README of `create-mercato-app` point to the catalog instead. An org admin may add a pointer later; nothing in this spec depends on it.                                                                                                                                                                                                                                                                                                                           |
| D10 | v1 scope. Saving is the part with no existing support. The nightly smoke (Phase 1b) is the only part no one else has, and also the largest and riskiest part.                                                                                                                                                                                                                                                               | v1 is Phases 2, 1a and 4, in that priority. Phase 0 ships before v1 and is not part of it. Its exit criterion is the [acceptance flow](#v1-acceptance-flow): save a sandbox app to a repo, then create an app from it. Phase 1b follows as the first increment. Until then every page and the CLI say "not verified" instead of a green mark.                                                                                                                                                                        |

### Defaults adopted unless someone objects

| #   | Topic                       | Default                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Package or mode names       | `create-mercato-template`, by analogy with `create-mercato-module` (D2 = A). The option B mode names (`--save-template`, `--publish-template`, `--describe-template`) are not used.                                                                                                                                                      |
| A2  | In-repo manifest            | A root file `mercato-template.json`, written by the tool, optional for hand-made templates. Not in `.mercato/`, because the app `.gitignore` ignores `.mercato/*`. Its JSON Schema has one owner (see [Data Model](#in-repo-manifest-mercato-templatejson)).                                                                             |
| A3  | Categories                  | A closed `useCase` list: `crm`, `commerce`, `b2b-portal`, `partner-portal`, `operations`, `field-service`, `internal-tools`, `starter`. Modules used come from `src/modules.ts`, never typed by hand.                                                                                                                                    |
| A4  | Refs                        | One `ref` per entry in v1. A `refs` map keyed by OM line comes once an official template maintains two lines at once.                                                                                                                                                                                                                    |
| A5  | Version mismatch in the CLI | Compare the pinned `@open-mercato/core` line of the selected sha with the latest stable line, the same rule as the badge (the CLI version changes nothing for an import). Warn and continue, showing both lines. No `--strict` in v1.                                                                                                    |
| A6  | Slugs                       | Bare slugs (`--template crm`) are curator-assigned, never first come. Without a curator slug an entry is reachable only as `owner/repo`. No aliases in v1. Emit guarantees slug uniqueness, and validation fails on a clash.                                                                                                             |
| A7  | Catalog PR from the tool    | No in v1. `describe` prints the YAML and the CONTRIBUTING link. The prefilled `/submit?template=owner/repo` link starts in Phase 1b.                                                                                                                                                                                                     |
| A8  | `--app <name>`              | Unchanged: `open-mercato/ready-app-<name>` at `v<cli version>`. On a miss it prints a hint to `--template` and the catalog URL. The broken `--app prm` help example is fixed separately.                                                                                                                                                 |
| A9  | Subdirectory templates      | Deferred. The app lives at the repo root, which is what `--app-url` supports today.                                                                                                                                                                                                                                                      |
| A10 | Uncommitted work            | `prepare` exports the committed tree of one pinned HEAD by default and always lists uncommitted files. `--include-uncommitted` adds tracked changes and untracked files that git does not ignore (`git ls-files --others --exclude-standard`), read once into the snapshot, after the same checks. Ignored files, such as `.env`, never. |
| A11 | Nightly smoke (Phase 1b)    | Runs `initialize` as the template ships it (no `--no-examples`), and fetches the tarball through a local mirror, not GitHub.                                                                                                                                                                                                             |
| A12 | Spec split                  | This umbrella spec holds the decisions. Phases 0 and 1 stay here, Phase 2 gets a spec in the `create-mercato-template` repo (D2 = A), Phase 4 gets a spec in `open-mercato/open-mercato` `.ai/specs` that amends the Ready Apps spec (D3), Phase 3 is specified by the OM Cloud team.                                                    |
| A13 | Deferred from v1            | Manifest seed declarations, slug aliases, gallery filters other than use case, author `tags`, `publish --update`, `--submit-pr`, MCP tools, llms and search sections.                                                                                                                                                                    |

## Problem Statement

Evidence from `open-mercato/open-mercato` `main` (e1a6f9de5, 2026-10-28), npm and GitHub (checked 2026-10-29 as account `wojciechszyjka`, which has org write access):

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Effect                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--app <name>` resolves `open-mercato/ready-app-<name>` at tag `v<cli version>` (`packages/create-app/src/lib/ready-apps.ts:117-133`). The only org repos matching "ready" are `ready-apps` and `ready-app-oss-prm`. `ready-app-prm` returns 404. `ready-app-oss-prm` has no tags and no releases.                                                                                                                                                                                     | Every `--app` call fails, including the `--app prm` example in `--help` (`index.ts:81`) and in the README.      |
| `ready-app-oss-prm` pins 16 `@open-mercato/*` packages at `^0.4.10`, locked at 0.4.10. Last push 2026-05-10. License `null`, no `.github`, `is_template: false`.                                                                                                                                                                                                                                                                                                                       | `--app-url` gives an OM 0.4 app to a user of the stable 0.9.0 CLI with no warning.                              |
| `open-mercato/ready-apps` is a README, archived on 2026-10-09 (last push 2026-07-31), with one row (PRM) and an empty queue.                                                                                                                                                                                                                                                                                                                                                           | Nobody can find templates. Nothing is tested.                                                                   |
| `--app-url` checks only that no `.template` files exist (`ready-apps.ts:392-427`). It does not check `package.json`, the lockfile or OM versions. It buffers the whole tarball with no size or file cap (`:350`) and extracts with `tar.x` defaults (`:440-444`). It leaves a half-filled directory on failure (`index.ts:446-447`). It records no source repo or sha. `--registry` and `--verdaccio` are validated but not applied to imported apps (`index.ts:340-347`, `:613-637`). | Failures are confusing, large or odd archives are not bounded, and a created app cannot say where it came from. |
| No tool saves an app as a template. Pushing an app repo as is carries its whole history and sets neither the GitHub template flag nor a topic.                                                                                                                                                                                                                                                                                                                                         | An app cannot become a shareable template without manual cleanup. History may carry work in progress.           |
| The empty-app presets spec says a preset that needs its own module, seeds or README "should become a ready app/example" (`.ai/specs/2026-04-02-empty-app-starter-presets.md:231-232`).                                                                                                                                                                                                                                                                                                 | Presets already point to templates as the next step, but nothing is there to point to.                          |

## Terms

| Term                        | Meaning                                                                                                              | Where                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Template** (app template) | A GitHub repo holding a complete standalone `create-mercato-app` app at its root. Listed in the catalog when public. | Catalog `templates/`, `create-mercato-app --template` |
| Ready app                   | The old name of the same thing. Kept in `--app`, `--app-url` and the `ready-app-*` repo names.                       | `create-mercato-app`                                  |
| Scaffold                    | The bare app `create-mercato-app` writes from its own files (called "template" in its code).                         | `create-mercato-app`                                  |
| Preset                      | A built-in variant of the scaffold (`--preset classic/empty/crm/wms`). Not a template.                               | `create-mercato-app`                                  |
| Sandbox starter             | A starting point offered by the OM Cloud wizard. Not a template (D1).                                                | OM Cloud                                              |
| Snapshot                    | The output of `prepare`: a staging tree plus a report with a hash per file. `publish` pushes only a snapshot.        | Save tool                                             |
| Recipe                      | A guide with example code (Medusa sense). Not installable. Out of scope here.                                        | Docs                                                  |

## Market references

| Ecosystem             | Entry lives in                   | Submission                                 | Freshness                                                                | Secrets and demo data                                     | Create command                                                    |
| --------------------- | -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Vercel Templates      | Vercel database                  | Form, manual review, slow replies reported | Builds once, at acceptance                                               | `env`, `envDescription`, `envLink`; values never in a URL | Deploy button, `create-next-app --example <url>`                  |
| Next.js examples      | Folder in the framework monorepo | PR to the framework                        | Lives with the framework                                                 | README per example                                        | `--example`, `--example-path`                                     |
| GitHub template repos | `is_template` flag               | None                                       | None                                                                     | None                                                      | "Use this template", `POST .../generate` (one commit, no history) |
| Nuxt                  | YAML gallery + JSON CLI registry | PR                                         | Schema validation in CI, Renovate; `deprecated` hides but still installs | No rule                                                   | `npm create nuxt -- -t <name>` or `gh:org/repo` (giget)           |
| Astro Themes          | Portal                           | Form + 14-point reviewer checklist         | Major Astro version field; edit triggers review                          | No real people, emails or links in demo                   | `--template user/repo#branch`                                     |
| Medusa                | Org repos                        | None                                       | `--version` pins the core                                                | `.env.template`, seed through migrations                  | `create-medusa-app --repo-url`                                    |
| Strapi                | Repo or monorepo folder          | None                                       | None                                                                     | `strapi export` excludes admins and tokens                | `--template`, `--template-path`, `--template-branch`              |

What we take:

- From Vercel, a gallery card that leads to one command or one click (D6), and declared env keys with a description and a link, never values.
- From Nuxt, two layers fed by one source: a curated gallery entry and a machine index for the CLI.
- From Astro, a fixed review checklist instead of taste, and a version field that is checked.
- From GitHub, `is_template` plus a single fresh commit.
- From create-next-app, `owner/repo#ref` shorthand.

What we skip: subdirectory templates (A9), GitLab and Bitbucket, paid templates, and Vercel-style form submissions.

What no one does and OM can (Phase 1b): re-test every template on the version it pins, and link each template to the catalog entries of the modules it uses.

## Proposed Solution

```mermaid
flowchart LR
  S[OM Cloud sandbox] --> T
  L[Any local OM app] --> T[create-mercato-template, D2<br/>new: prepare, publish]
  T --> X[(Snapshot<br/>tree + report with hashes)]
  X --> R[(GitHub template repo<br/>one commit, is_template, topic)]
  T -. prints YAML + link .-> P[PR to open-mercato/modules<br/>new: templates/owner/repo.yml]
  P --> V[validate.yml<br/>extended]
  V --> C[Catalog emit<br/>new: templates.json, /templates, /t/ pages<br/>also at templates.openmercato.com]
  R -. after v1 .-> N[nightly.yml<br/>new: template cell]
  N -.-> C
  C --> A[create-mercato-app --template<br/>new flag on existing --app-url fetch]
  C -. Open in sandbox link, D6 .-> S
```

Takeaway: the catalog is the single index. The GitHub repo is the single source of code. The snapshot is the single thing a person reviews and the single thing `publish` pushes. The save tool and `create-mercato-app` sit on the two sides of the repo.

Alternatives considered:

| Alternative                                                                   | Why it lost                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new `kind: template` on module entries                                      | `kind` is read across lib, site and mcp. Module fields (`moduleIds`, `requires`, per-line `compat`, `install`, `anatomy`) do not apply. The nightly planner skips non-module kinds. A separate collection reuses the same parts with less risk. |
| Keep the awesome list                                                         | It is archived. No schema, no validation, no tests, no index for the CLI.                                                                                                                                                                       |
| Templates as folders in the OM monorepo (Next.js `examples/`)                 | Couples every template to the core release train and review. Third parties cannot own their templates. The Ready Apps spec rejects this for the same reason (`2026-03-02-ready-apps-framework.md:72`).                                          |
| A GitHub topic as the only discovery                                          | No curation and no metadata. The topic `open-mercato-template` is kept as a candidate source for `discover`.                                                                                                                                    |
| A web form (Vercel, Astro)                                                    | The catalog already runs PR submissions with automated checks. Forms add a backlog nobody answers.                                                                                                                                              |
| Extend the existing partner showcase (demo videos with an optional repo link) | It shows projects, not installable code: no schema for a create command, no checks, no versions. A showcase item can link to a template page once both exist.                                                                                   |

## Data Model

### Catalog entry: `templates/<owner>/<repo>.yml`

The path is the lower-case GitHub path, the same rule as module GitHub paths (`lib/schema/common.ts:15-19`). The key is `owner/repo` and never collides with a module `github:` locator. Fields reuse existing primitives (`PlainText`, `HttpsUrl`, `Screenshot`, `EnvName`, `Host`, status rules). A = author field, K = curator field.

| Field                                                          | A/K | Type                                             | Notes                                                                                                                                                                                                      |
| -------------------------------------------------------------- | --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github`                                                       | A   | `owner/repo`                                     | Required. Must match the file path.                                                                                                                                                                        |
| `ref`                                                          | A   | branch, tag or sha                               | Optional, defaults to the default branch. A sha must be reachable from a branch or tag of this repo (a fork commit served through the parent is refused).                                                  |
| `useCase`                                                      | A   | enum (A3)                                        | Required.                                                                                                                                                                                                  |
| `summary`                                                      | A   | `PlainText(140)`                                 | No install instructions (Astro rule).                                                                                                                                                                      |
| `whenToUse`, `whenNotToUse`                                    | A   | as modules                                       |                                                                                                                                                                                                            |
| `links`                                                        | A   | `{docs, support, demo}`                          | `demo` must be a deployment of this repo, not someone's production site.                                                                                                                                   |
| `screenshots`                                                  | A   | as modules, max 6                                | Stored under `templates/<owner>/screenshots/`.                                                                                                                                                             |
| `pricing`                                                      | A   | `free` only in v1                                | Paid templates are out of scope. Paid dependencies are a computed mark (D5).                                                                                                                               |
| `declares`                                                     | A   | `{env: [{name, description, link?}], hosts: []}` | Env keys a user must fill that the stock `.env.example` does not have. Never values.                                                                                                                       |
| `smoke`                                                        | A   | `{paths?: [...], login?: boolean, ready?: path}` | Phase 1b. `paths` uses the module regex. `login: false` when the template replaces the default demo account; then `ready` (a path that answers 200 without a redirect) and one `paths` entry are required. |
| `slug`                                                         | K   | slug string                                      | Curator-assigned (A6). Unique across the catalog.                                                                                                                                                          |
| `status`, `reason`, `alternatives`, `supersededBy`, `featured` | K   | as modules                                       | The module status enum and its `reason` rule, reused as is.                                                                                                                                                |

Never typed by hand (rule 8). These come from sync and facts on the `data` branch, and every fact is stored per commit sha:

- repo metadata: stars, last push, license, archived, `is_template`, tags, current `full_name` (to detect renames);
- `source.sha`: the sha the entry's `ref` pointed to at the last sync;
- per sha: the pinned `@open-mercato/core` version from `yarn.lock` (Yarn 4 lockfiles are YAML, so the existing `yaml` dependency parses them) and `linesBehind` against the latest stable line; `engines.node` and `packageManager` from `package.json`; `requiresEnterprise` (D5: true when the lockfile resolves a package whose catalog entry has the enterprise license kind); the declared env; the module inventory;
- Phase 1b: the last smoke receipt, and `verified.sha`, the newest sha with a green smoke, with its own facts.

**Module inventory (new work).** The existing `presetFromModulesTs` (`lib/receipts/state.ts:258-275`) describes default registration on purpose and cannot be reused: it stops at the first `]`, rejects `from: '@app'` through `NpmName`, ignores additions after the initial array, and truncates at 80 entries. On the scaffold `src/modules.ts` at e1a6f9de5 it returns 61 entries and drops `ratelimit_probe` (`@app`), the official modules, `example_customers_sync`, `storage_s3` and the enterprise modules. A new parser, `modulesFromModulesTs`, built on `ts-morph` (already a catalog dependency, used in `lib/rentgen/ast.ts`):

- reads object entries `{id, from}` with any `from`, `@app` included;
- follows `push`, `unshift` and spreads on the same binding after the initial array, and records an addition inside a condition as `conditional: true` with the env names it reads (for example `OM_ENABLE_STORAGE_S3`);
- reads `official-modules.json` when `src/modules.ts` loads it;
- has no entry cap (the existing `MAX_PARSE_BYTES` file limit applies);
- reports any construct it cannot read as `unparsed` with a line number instead of dropping it.

Modules from `@open-mercato/*` and other npm names link to `/m/` entries; `@app` modules are listed as the template's own.

### Data branch (additive)

- `sync/templates/<owner>/<repo>.json`, `facts/templates/<owner>/<repo>/<sha>.json`.
- Phase 1b: `receipts/templates/<owner>/<repo>.jsonl`, never `_baseline.jsonl`.
- Phase 1b: the receipt and matrix subject becomes a discriminated union, `{type: 'module', locator}`, `{type: 'template', github, sha}` or `{type: 'baseline'}`. Today `Receipt.module === null` and `MatrixCell.locator === null` both mean baseline (`lib/receipts/data.ts:52`, `lib/core/lines.ts:392`, `lib/receipts/cell-key.ts:74`), so a template receipt with `module: null` would be read as a baseline and turn "Open Mercato itself" red. Existing receipts parse as before: a missing `type` keeps today's meaning. History keys and receipt paths follow the subject.
- Phase 1b: for a template cell, `line` is the OM line the template pins (the tested line), for example `0.4`. It feeds `Receipt.om.line`, `MatrixCell.line` and the job name `cell <key12> <line>`.

### In-repo manifest: `mercato-template.json`

Optional. Written by the save tool. Read by catalog validation (to prefill and cross-check) and by `create-mercato-app` (env keys, next steps), which then removes it from the new app (D3).

```json
{
  "schema": 1,
  "name": "b2b-portal",
  "description": "B2B self-service portal with quotes and customer accounts.",
  "openMercato": "0.9.x",
  "env": [
    {
      "name": "OPENAI_API_KEY",
      "description": "Used by the AI assistant.",
      "link": "https://platform.openai.com/api-keys"
    }
  ],
  "createdWith": { "tool": "create-mercato-template", "version": "<version>" }
}
```

- **One owner of the schema.** The zod schema lives in this repo (`lib/schema/`), and the catalog publishes `mercato-template-1.json` next to `descriptor-1.json`. The save tool validates its output against it in tests. `create-mercato-app` reads only `schema`, `env` and `openMercato`, and ignores unknown fields. A breaking change means `schema: 2` and a new file. Seed declarations are deferred (A13).
- The catalog YAML stays the source of truth for the gallery. The manifest is a hint and a cross-check, not a second registry. A mismatch (for example in env keys) is a validation warning, not an error.

### Provenance in created apps (D3)

`create-mercato-app --template` writes `"openMercatoTemplate": {"repo", "ref", "sha"}` into the new app's `package.json`. It is committed with the app, unlike `.mercato/`, which is ignored.

## API Contracts

### Catalog published files (additive)

| File                           | Phase | Content                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templates.json`               | 1a    | `{schema: 1, generatedAt, templates: [{slug, github, status, reason, useCase, summary, ref, source: {sha, syncedAt, facts}, verified: {sha, at, omVersion, importer, facts} or null}]}`. `facts` = `{omLine, omVersion, linesBehind, requiresEnterprise, engines, modules, env}` for that sha. |
| `t/<owner>/<repo>.json`, `.md` | 1a    | Full entry and facts. Markdown twin for agents.                                                                                                                                                                                                                                                |
| JSON Schemas                   | 1a    | `template-1.json` (catalog entry) and `mercato-template-1.json` (in-repo manifest), generated from zod like `descriptor-1.json`.                                                                                                                                                               |
| `llms.txt`, `llms-full.txt`    | later | A Templates section.                                                                                                                                                                                                                                                                           |
| `search-index.json`            | later | Template documents with `type: 'template'`. Module result shapes do not change.                                                                                                                                                                                                                |

`templates.json` lists `active`, `hold` and `unmaintained` entries; `reason` is set for every entry that is not `active`. `delisted` entries and deleted or private repos are left out. Entries without a curator slug have `slug: null`.

Later: MCP (tools@1 is additive-only) gets `search_templates`, `get_template` and a resource `om-modules://template/{+path}`. Existing tools keep their names and fields.

### Save tool contract

The tool is `create-mercato-template` (D2 = A). The option B column stays as the record of the comparison and is not built. The operations, flags and JSON did not depend on the option; only the entry point did.

| Operation  | Command (A, decided)                                                                       | Option B (not built)                                                                      | Network             |
| ---------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------- |
| `prepare`  | `npx create-mercato-template prepare [<app>] --out <dir>`                                  | `npx create-mercato-app --save-template [<app>] --out <dir>`                              | none                |
| `publish`  | `npx create-mercato-template publish --from <dir> --repo <owner/name> --public\|--private` | `npx create-mercato-app --publish-template <dir> --repo <owner/name> --public\|--private` | GitHub through `gh` |
| `describe` | `npx create-mercato-template describe --from <dir>`                                        | `npx create-mercato-app --describe-template <dir>`                                        | none                |

- Shared flags: `--json` (one object on stdout, no prompts), `--include-uncommitted` (A10), `--allow-file <path>` and `--keep-env <KEY>` (both repeatable, recorded in the report), `--expect <snapshotId>`, `--resume`.
- Exit codes: 0 ok, 1 a check failed, the snapshot does not verify or publication is refused (JSON lists each failure with a rule and a path when applicable; remote reads may occur, but this invocation makes no remote changes), 2 usage, 3 GitHub auth missing, 4 a GitHub step failed (JSON says which steps finished). This is the whole contract a sandbox or an agent depends on.
- No app scripts, package manager, Yarn plugins or module imports run. Every read is static.

#### Snapshot

1. `prepare` pins `HEAD` once (`git rev-parse HEAD`). The file list is the tree of that sha (`git ls-tree -r`), not the index, honoring `export-ignore` as that tree declares it. File contents are the blobs of that tree, never working tree files.
2. With `--include-uncommitted`, tracked changes and allowed untracked files are read once from the working tree into the snapshot, marked `origin: "worktree"` in the report.
3. The tool writes `<out>/tree/` (the files, plus the generated `mercato-template.json` and `.env.example`) and `<out>/report.json`: `{schema: 1, tool: {name, version}, source: {head, dirty, includeUncommitted}, stock: {version, known}, engines, packageManager, files: [{path, mode, size, sha256, origin, generated?}], snapshotId, findings: [{rule, level, path, line?}], notices}`. `snapshotId` is the sha256 of the sorted `path`, `mode` and `sha256` lines. The source app is never changed.
4. `notices` always includes `code-only`: configuration held in the database (anything set through the UI), uploaded files, and runtime edits not written to tracked files are not part of the snapshot.
5. `publish` never runs `prepare`. It reads `<out>`, recomputes every hash, and refuses (exit 1, rule `snapshot-modified`) if a file changed, was added or is missing, if `snapshotId` differs from `--expect` (required with `--json`), or if the report has an error finding. The commit is built from exactly those files.

#### File policy (blocking unless noted)

1. **Standalone app at the root.** `package.json` depends on `@open-mercato/core`. `src/modules.ts` parses. `yarn.lock` exists. `packageManager` is Yarn 4. Every `@open-mercato/*` dependency resolves in `yarn.lock`, all on one OM line. Not the framework monorepo. No `.template` files. `engines.node` and `packageManager` go into the report.
2. **Entry types.** Regular files only. Symlinks, submodules (gitlinks) and, from the working tree, any special file (FIFO, socket, device) are errors, listed by path.
3. **Deny list.** Excluded and counted in the report. Entries are anchored at the root unless they start with `**/`, so module folders such as `src/modules/*/data/` are never touched:
   - `**/.env*` except `.env.example` (which is regenerated, see check 6);
   - `/.mercato/*`, `**/node_modules/`, `/.yarn/cache/`, `/.yarn/install-state.gz`;
   - `/public/uploads/`, `/storage/`, `/data/` (the anchored entries of the scaffold `.gitignore` on main);
   - `**/*.pem`, `**/.npmrc`, `**/.mcp.json`;
   - agent and editor state, derived from the scaffold `.gitignore` (which leaves `.claude/` and `.codex/` unanchored, so they are `**/` here too): `**/.claude/`, `**/.codex/`, `/.cursor/mcp.json`, `/.playwright-mcp`, `/.agents/skills/`, `/skills-lock.json`, `/.ai/framework-context/`, `/.ai/harness/results/`, `/.ai/sessions*.json`, `/.ai/session-exports/`, `/.ai/qa/test-env*`, `/.ai/qa/artifacts_*/`, `/.ai/qa/ephemeral*`, `/.ai/scripts/test-env-*`, `/.ai/.gate-state.json`.
4. **Opaque files.** Archives (`.zip`, `.tar`, `.tgz`, `.gz`, `.bz2`, `.xz`, `.7z`, `.rar`, `.jar`), database files and dumps (`.sql`, `.dump`, `.bak`, `.sqlite`, `.sqlite3`, `.db`), and any other non-text file that is not an image, font or icon are errors unless the author names the path with `--allow-file`. Migrations written as code are text and are not affected.
5. **Secret scan of contents.** In every exported text file, regardless of version knowledge:
   - token patterns from gitleaks' default ruleset, pinned and bundled with the tool for offline scans, including GitHub, npm, AWS, private keys, OpenAI API keys, Stripe secret and restricted keys, and Slack tokens and webhook URLs;
   - credential-bearing URLs (`scheme://user:password@host`, for example in `DATABASE_URL` or `*_REDIS_URL`), unless the exact string appears in the stock scaffold files of a known version (the stock `DATABASE_URL=postgres://postgres:postgres@localhost:5432/open-mercato` does);
   - `npmAuthToken` or `npmAuthIdent` in `.yarnrc.yml`.

   Findings print the path and line, never the value.

6. **Generated `.env.example`.** The tool writes the file from the source key list and comments. A value is kept only when it equals the stock value of the matching `create-mercato-app` release (they release in lockstep with `@open-mercato/core`), or of any known release when the version is unknown, or when the author keeps it with `--keep-env` and it passes check 5. Every other value is empty, and the report lists the key (never the value). A key whose name looks secret (`*_SECRET`, `*_KEY`, `*_TOKEN`, `*_PASSWORD`) cannot be kept with a non-stock value. The stock table ships with the tool, so `prepare` stays offline. An unknown version (newer than the tool) changes no rule: stock values it cannot match are emptied, and the report says the version is unknown.
7. **Declared env.** Keys the stock `.env.example` lacks become the manifest `env`. Each needs a comment above it; a missing comment is a warning.
8. **Paid dependencies (D5).** A dependency on `@open-mercato/enterprise` is reported and recorded in the manifest. Blocking only if D5 is decided as "forbidden".
9. **Warnings, not blocking.**
   - Every image, in `public/` or anywhere else, is listed with path and size: content scans cannot see personal data in images.
   - Executable configuration is listed: `.yarnrc.yml` `yarnPath` and `plugins`, `.github/workflows/*`, lifecycle scripts in `package.json`.
   - Other `.ai/` content (specs, QA notes) is listed with a file count, so the author sees what agents will inherit.
   - Emails in seed files outside example domains (`example.com`, `acme.com`).
   - The default `create-mercato-app` README (an error in catalog validation).

#### Publication

`publish` runs these steps in order and reports each one as `done`, `failed` or `skipped`:

1. `verify`: the snapshot checks above. Nothing remote happens before it passes.
2. `create`: a new repo at `--repo` with the chosen visibility. An existing name is refused (exit 1, rule `repo-name-exists`) unless `--resume` applies. The existence check reads GitHub before any remote change.
3. `push`: one fresh commit built from the snapshot. The message names the tool and the `snapshotId`, not the source sha. Never the source history, never a force-push.
4. `template-flag`: `is_template: true`.
5. `topics`: `open-mercato-template` and `open-mercato`.

The JSON result always carries `repo` (URL and full name) and `commit` (sha and tree sha) as soon as they exist, the step list, and on failure a `retry` command. `--resume` continues only on a repo that is empty, or whose default branch holds exactly one commit whose tree sha equals the snapshot's tree sha (computed locally). Steps 4 and 5 are idempotent. Any other state is refused (exit 1, rule `repo-not-from-snapshot`). Updating an existing template repo (`--update`) is deferred (A13): a tool-written manifest in a repo does not prove who the repo belongs to.

`describe` prints the catalog YAML from the report and the repo. In v1 it prints the [CONTRIBUTING link](https://github.com/open-mercato/modules/blob/main/CONTRIBUTING.md#templates). Phase 1b switches it to `/submit?template=owner/repo` when that mode ships.

### `create-mercato-app --template` (Phase 4)

```
npx create-mercato-app my-app --template <slug | owner/repo>[#ref] [--keep-name]
```

- **Index.** The CLI fetches `https://modules.openmercato.com/templates.json`, for a slug and for `owner/repo` alike. The same file is served at `templates.openmercato.com`, but the CLI uses one host. Override: `OM_TEMPLATES_URL`, which must be `https://` or a loopback address (stricter than `OM_MODULES_PICKER_URL` in open PR #8118, which has no such rule). An unreachable index fails a slug with a clear message; `owner/repo` proceeds and prints "catalog status unknown, not verified". If a reachable index has no matching entry, it prints "not listed, not verified". Both cases use the unlisted repo resolution below.
- **One sha, its own facts.** The CLI selects one sha, then shows only facts recorded for that sha:
  - listed repo, no `#ref`: `verified.sha` when present, else `source.sha`;
  - unlisted repo (including a private repo), or an unreachable index: with no `#ref`, read the default branch through the GitHub API and resolve it to a sha; with `#ref`, resolve that ref through the API. Take compatibility from the downloaded lockfile. No catalog verification or facts apply;
  - listed repo with `#ref`: resolved to a sha through the GitHub API. If it equals `verified.sha` or `source.sha`, those facts apply. Otherwise the CLI prints "not verified, no catalog facts for <sha>" and computes the compatibility warning from the downloaded lockfile. A `#ref` never inherits another sha's verification.
  - If the selected `verified.sha` cannot be downloaded, the CLI stops and suggests `#<ref>`. It never switches to different code on its own.
- Before downloading, the CLI prints `owner/repo@sha` and whether that sha is verified. It prints the catalog page URL only for a listed repo.
- The fetch reuses the `--app-url` path (tarball, `GITHUB_TOKEN`, API base override), which also covers private repos (D8).
- New behavior, `--template` only (D3):
  - compatibility warning against the latest stable line (A5);
  - "requires an Enterprise license" notice (D5);
  - `name` rewrite, unless `--keep-name`;
  - provenance in `package.json`; `mercato-template.json` removed;
  - the target directory is removed when the CLI created it and import fails;
  - next steps include `cp .env.example .env` and the declared env keys.
- Mutually exclusive with `--app`, `--app-url`, any non-classic `--preset` (today's import rule), `--agents`, and the #8118 flags `--modules` and `--module-picker`. `--registry` and `--verdaccio` print a warning that they do not apply to imported apps.
- `--app` and `--app-url` keep their current behavior, except the archive limits below.

#### Hold policy

This is the one statement of it. A `hold` entry keeps any existing curator slug, reserved and emitted in the index, but gets no create command on its page. Validation rejects removing or changing that slug when moving an entry to `hold`, and requires a non-empty `reason`. New `hold` entries may have no slug. `--template <slug>` and `--template owner/repo` refuse every entry the index lists as `hold`, printing its `reason`; no flag overrides that, `--yes` included. `--app-url` stays the uncurated path with its current contract. An `unmaintained` entry works and prints its `reason`.

#### Untrusted archives (`--template` and `--app-url`)

The archive is third-party data. The shared fetch gets these rules, with defaults equal to the catalog's own tarball limits (`lib/sources/tarball.ts:11`: 50 MB, 5,000 files); the Phase 4 spec sets the final numbers from measured templates:

- the download is streamed with a byte cap, not buffered whole;
- caps on entry count and on total extracted size;
- only files and directories are extracted; any symlink, hard link or special entry fails the import with its path; absolute paths and `..` segments fail too;
- validation uses `lstat`, never `stat`, so it cannot follow a link (today `statSync` at `ready-apps.ts:402` follows links; a test on 2026-10-29 with tar 7.5.22 saw no escape, but ELOOP and ENOENT aborts that left the directory behind).

## UI/UX

Catalog:

- **Header.** A "Templates" item after "Modules", shipped in Phase 0; `isCurrent` covers `/templates`, and `/t/` from Phase 1a.
- **`/templates` coming soon (Phase 0).** A short page:
  1. what a template is: a whole Open Mercato app in a GitHub repo that a new app can start from, where a module is one part of an app;
  2. how it will work, as three planned steps: save an app as a template repo with `create-mercato-template` (as `create-mercato-module` does for modules), list it here by PR, create an app from it with `create-mercato-app --template`;
  3. a clear "coming soon" state, and links to this spec and to the modules list.

  No entries, sample or placeholder cards, and no copy chip for a command that does not work yet: planned commands are shown as plain text marked planned. No counts or dates typed by hand (rule 8). Texts follow rule 7. The page stays in this state while `templates.json` has no `active` entry; from Phase 1a that is computed from data, not a flag.

- **`/templates` gallery.** Cards with screenshot, summary, use case, OM line badge ("Built on 0.9.x" or "2 lines behind"), "not verified" or smoke state, the Enterprise mark (D5), and stars. One filter in v1: use case. Sorted by featured, then a green smoke, then the last push.
- **`/t/<owner>/<repo>` page.** In this order:
  1. the create command (copy chip), or the `hold` reason instead of it;
  2. an "Open in sandbox" link, when the sandbox supports it (D6);
  3. built on, lines behind, verification state, each for a named sha;
  4. modules used, linked to `/m/`, and the template's own modules; conditional modules marked;
  5. required env keys with descriptions;
  6. license, last push, archived flag;
  7. links and screenshots.
- **States** (the module enum).
  - `hold`: shown with its reason, no gallery boost, no create command.
  - `unmaintained`: hidden from the gallery; page and CLI still work (Nuxt `deprecated`).
  - `delisted`: removed from `templates.json`.
- **`/submit`.** A template mode prefilled from `?template=owner/repo` (Phase 1b). Until then, the tool and save flow link to CONTRIBUTING for writing the YAML by hand.

Showing compatibility: the badge is computed from the pinned `@open-mercato/core` in the lockfile of the sha it names, compared with the latest stable line. The smoke receipt (Phase 1b) proves that this sha installs, builds, starts and answers. A template is never shown as compatible with a line it was not built on.

Save flow (any front end, the sandbox included): show the `prepare` report as a checklist (errors, warnings, the `code-only` notice, uncommitted files, emptied env keys, opaque files to allow, images to review), then ask for owner, repo name and visibility, publish with `--expect <snapshotId>`, and show the repo URL, the commit sha and the CONTRIBUTING link in v1 (`/submit?template=owner/repo` from Phase 1b). On a partial failure, show the finished steps and the retry action.

### Domain: `templates.openmercato.com` (Phase 0)

- **One site, two hosts.** `templates.openmercato.com` is a second custom domain of the same Cloudflare Pages project (`open-mercato-modules`, the repo variable `CF_PAGES_PROJECT` that `pages.yml` deploys to). One build and one deployment serve both hosts. `modules.openmercato.com` stays the configured site (`SITE_URL`), so canonical and Open Graph tags point there on both hosts.
- **Copy commands on the templates host.** `site/src/lib/here.ts` treats every origin other than `SITE_URL` as a preview: it rewrites copy commands and links to that origin and shows the `[data-preview-note]` paragraphs ("This is a preview address", on `/for-agents`). On the templates host that note would be wrong, so Phase 0 passes `https://templates.openmercato.com` to `hereScript` in a list of other production origins, where the script does nothing: copy commands and links keep `modules.openmercato.com`, the one host the CLI and the docs use. Previews on `*.pages.dev` keep today's behavior.
- **Root redirect, by host.** Pages `_redirects` matches paths only, not hosts, so the redirect is a Pages Function: `functions/_middleware.ts`, with `_routes.json` sending only `/` to Functions, so every other path stays static. When the request host is `templates.openmercato.com` it answers `302` to `https://modules.openmercato.com/templates`, the canonical URL of the section, keeping the query string; on any other host (`modules.openmercato.com`, `*.pages.dev` previews) it calls `context.next()` and the static home page is served. The target is the modules host, not `/templates` on the templates host: the wordmark, the Modules item and "Browse modules" link to `/`, which on the templates host would lead straight back to the section and leave the module home out of reach. `302`, not `301`, so browsers do not cache it if the root later gets its own page. Every other path on the templates host serves the same page as on the modules host. Each request to `/` on either host runs the Function and counts against the account's Workers request limit; the Redirect Rule below has no such cost.
- **Alternative.** When the `openmercato.com` zone is on the same Cloudflare account, a zone Redirect Rule (`http.host eq "templates.openmercato.com" and http.request.uri.path eq "/"` to `https://modules.openmercato.com/templates`) does the same with no code. The Function is the default because it works wherever the zone is (RUNBOOK step 5.3 covers both cases).
- **What Dominik adds** (devops, Cloudflare account), as RUNBOOK step 5.3 does for `modules`:
  1. In the Pages project: Custom domains > Set up a custom domain > `templates.openmercato.com`.
  2. DNS: Cloudflare adds the record by itself only when the zone is on the same account. Otherwise a CNAME `templates` to the project's `*.pages.dev` name (`open-mercato-modules.pages.dev` when that name was free) at the DNS provider of the zone, which replaces the `*.openmercato.com` wildcard for this name. Wait for the domain to show Active.

  No new secret, token or repo variable. `SITE_URL` stays unset (it defaults to `modules.openmercato.com`).

- **Not blocking.** Until the domain is Active, `/templates` works at `modules.openmercato.com/templates`, and nothing else depends on the second host.

## Nightly template smoke (Phase 1b)

A template cell is the existing baseline cell ("Open Mercato itself") with a different scaffold. Steps in harness order:

| Step                | Template cell                                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prepare             | The cell job starts the local mirror (A11) as a background process. The trusted `runner` user downloads the tarball for the pinned sha, checks its hash and size cap, and never extracts it.                                                                                                         |
| scaffold            | `npx create-mercato-app@<importer> app --app-url https://github.com/<o>/<r>/tree/<sha> --no-init-git`, with `OM_CREATE_APP_GITHUB_API_BASE_URL` set to the mirror. `<importer>` is an exact version chosen at plan time. No `--preset`, no `--agents`. New `TEMPLATE_URL` input check in `steps.sh`. |
| patch               | Off. Harness patches are keyed by `create-mercato-app` range, which does not describe the OM version a template pins.                                                                                                                                                                                |
| tamper check        | Skipped. `sums` compares the template with its own files, so it proves nothing here.                                                                                                                                                                                                                 |
| env                 | `harness/env.sh` from `.env.example`. Dummy values for `declares.env`.                                                                                                                                                                                                                               |
| install             | As the template ships it, with `YARN_ENABLE_IMMUTABLE_INSTALLS=1` (the module path uses 0). An inconsistent lockfile or an unavailable dependency fails here. The resolved `@open-mercato/core` version is read as `om-cell` (see Security).                                                         |
| add                 | Skipped, like the baseline.                                                                                                                                                                                                                                                                          |
| generate, typecheck | As the baseline, using the template's own scripts.                                                                                                                                                                                                                                                   |
| initialize          | Without `--no-examples` (A11).                                                                                                                                                                                                                                                                       |
| build               | As the baseline.                                                                                                                                                                                                                                                                                     |
| start               | As the baseline (`GET /login` must answer 200 within 180 s, no redirect followed, `steps.sh:411-427`), or `GET <smoke.ready>` when `smoke.login: false`.                                                                                                                                             |
| smoke               | Log in and `GET /backend` unless `smoke.login: false`. Then `smoke.paths`, and backend pages of `@app` modules found by static anatomy of `src/modules/*`. At most 5 paths in total (`matrix.ts:66`).                                                                                                |
| pack                | Stops the mirror.                                                                                                                                                                                                                                                                                    |

- **Security.** The template controls `.yarnrc.yml` (`yarnPath`, `plugins`, `npmRegistryServer`) and every script that generate, typecheck, initialize, build and start run. No step-level switch makes that safe. The control is isolation: an ephemeral `ubuntu-latest` runner in `nightly.yml`, the `om-cell` user, `env -i`, and no secrets. `env -i` strips the environment, not filesystem access, so reads by the trusted `runner` user need their own rule:
  - the runner reads template files only before install, from the extracted tarball, which holds no links (archive rules), with size caps. `node_root` at `steps.sh:283` is such a read (`package.json` and `src/modules.ts`, capped at 20,000 characters);
  - `node_modules` stays writable by `om-cell` until `finalize_install` (`steps.sh:180`), and `sums()` (`:150-160`) only hashes what it reads. So the resolved core version is read as `om-cell`, size-capped, schema-validated and recorded as cell-reported data;
  - Phase 1b step 2 audits every runner-side read against these two rules.

  `OM_CREATE_APP_GITHUB_API_BASE_URL` is added to the `env -i` list in `run_cell` (`steps.sh:97-100`) and to `check_inputs`.

- **Never on Cezar.** The preview path (`scripts/preview-night.sh`) plans with `plan-matrix --runner preview-docker` and runs cells on a Docker host. `plan-matrix --runner preview-docker` leaves out template cells, and `cells-local` and `harness/local/run-cell.sh` refuse them. Both have a test.
- **Cell key.** `subject = template:<owner>/<repo>@<sha>`, `integrity = null`, plus a `template` part.
- **Classification without a baseline.** A template on an old line has no baseline cell. A failure before `install` (mirror, download, scaffold fetch) is harness-red. A failure from `install` on is template-fail. Receipts go to the template's own path and never to `_baseline.jsonl`.
- **Version drift beyond the OM minor.** The harness pins Node 24.21.0 (`nightly.yml:164`). A template whose `engines.node` excludes it gets no cell, and its page says "engine not covered by the smoke" (not red). The receipt records Node, the Yarn version from `packageManager`, and the importer version.
- **Cadence.** A new sha on the entry's ref, and weekly. A change of the pinned importer schedules one re-run per template within the weekly budget, because a new importer can change extraction (Phase 4 does). At most one cell per template per night.
- **Budget.** Template cells share the nightly 70-minute and weekly 150-minute budgets, at about 15-20 minutes per cell. They are planned after module cells, with a reserve of one cell per night (like `EMPTY_RESERVE_MIN`), so they cannot be starved forever.
- **Skipped templates.** Templates with `requiresEnterprise` get no cell (D5).

## Save tool options

Decided: A (D2, 2026-10-29). This section stays as the record of why.

### Shared by A and B (not a reason to pick either)

- The whole [save tool contract](#save-tool-contract): offline `prepare`, the snapshot, the file and secret policy, the publication steps, JSON and exit codes.
- Reuse of `create-mercato-module` parts by copying: `gh repo create`, `--add-topic`, `assertNoCredentials`, the local `gh` shim harness (`test/release-e2e/gh-shim.mjs`).
- Older apps: both run through `npx` and read the app statically, so neither needs the app's own CLI line.
- A platform can push the snapshot through its own GitHub integration in both.
- Both installs carry a TypeScript compiler: A would import `typescript` for AST work as `create-mercato-module` does (`src/package.ts:3-4`), and B already depends on `ts-morph`.
- npm maintainers: `create-mercato-app` and `create-mercato-module` both list only `piotrkarwatka` (npm, 2026-10-29).
- `create-mercato-app` owns `--template` in both.

### A and B side by side

| Criterion           | A: separate package (`create-mercato-template`)                                                                                                                                    | B: `--save-template` mode of `create-mercato-app`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release timing      | Independent. A fix can reach `latest` the day it is ready.                                                                                                                         | Stable users get the feature with the next minor (0.7.0 on 2026-08-26, 0.8.0 on 2026-09-18, 0.9.0 on 2026-10-09, about every three weeks). Release lines and a backport label exist since 2026-10-21 (#7752), but CONTRIBUTING says a line "takes fixes only through backports", so the first stable release and new features wait for a minor unless maintainers make an exception; fixes can ship as patches through backports. No patch exists on any line yet (2026-10-29). `@develop` (main snapshots, for example `0.10.1-develop.7687.1.e1a6f9de51`) and per-PR pkg.pr.new previews have it at once. |
| Ownership of format | Saving in A, importing in `create-mercato-app`: two repos own the two halves. A contract test (publish to the shim, then import) keeps them aligned.                               | One package owns saving and importing, with one review. Snapshot, manifest and archive primitives can be shared in code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Stock env table     | Needs a tool release after each OM release to know the newest stock files (automatable). Until then the newest line is unknown, which empties more env values but changes no rule. | Ships the scaffold of its own version, so the current line is always known when the user runs `latest`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Review and gate     | Tool repo review. Wojtek builds, Piotr publishes.                                                                                                                                  | Core review and the full monorepo gate. The 22 PRs touching `packages/create-app/src` merged 2026-09-01 to 2026-10-28 took 0-46 days, median 8. Four were still open on 2026-10-29, the oldest since 2026-10-04. Overlaps with open #8118 (created 2026-10-28) in `index.ts` and `lib/catalog/*`.                                                                                                                                                                                                                                                                                                           |
| Effort to MVP       | 3-6 working days plus 0.5-1 day repo setup (estimate).                                                                                                                             | 2-4 days of code (estimate), plus mode dispatch before the existing parser and the monorepo gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `npx` install cost  | Not built yet. Estimate from `create-mercato-module@0.5.1`: package 368,595 B, 53 files, plus `typescript` 6.0.3; measured install 24.6 MB, 194 files (2026-10-29).                | `create-mercato-app@0.9.0`: package 39,861,565 B; measured install with `tar` and `ts-morph` 63 MB, 2,384 files (2026-10-29). Nothing extra where it is already cached.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Naming              | A new name to learn. Mitigation: an agent guide in new apps (as `agentic/guides/module-tool.md` does for modules), docs, the sandbox flow.                                         | One familiar command, though "create-app" reads oddly for saving.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Main risk           | One more package, and drift between saving and importing if the contract test lapses.                                                                                              | The first stable release and new features wait for a minor unless maintainers make an exception. The scaffolder grows, mitigated by a separate `src/template-export/`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**What would make A the right choice:** owners want the first stable release and new features without waiting for a minor or an exception; or core review capacity is the constraint; or the tool should be owned and iterated outside the core team.

**What would make B the right choice:** one owner for the format of saving and importing matters more than release timing; the minor cadence, with `@develop` or pkg.pr.new builds for early tests, is acceptable; and the core team accepts the review.

Up to revision 4 the spec made no recommendation: the evidence did not favor one side, and the choice turned on whether independent release timing matters. Revision 2 recommended A; the independent review preferred B. On 2026-10-29 Piotr asked for a tool that works "very much like create-mercato-module" (Discord, translated), and Wojtek decided A. A also gives the first reason listed for it: the first stable release and new features do not wait for an OM minor.

### A design (decided)

- Explicit commands: `prepare [<app>] --out <dir>`, `publish --from <dir> --repo owner/name --public|--private`, `describe --from <dir>`. Unknown or incompatible flags are errors.
- Code in a separate tool repo, with an independent release gate. Manifest schema validation and a save then import contract test keep it aligned with `create-mercato-app`.
- Static only: no app scripts, package manager, plugins or module imports.
- The snapshot, file, secret and publication contracts above, unchanged.
- Cloud publishes the snapshot through its own GitHub integration; local publishing uses `gh` and stores no credential in the snapshot.
- Suggested gallery YAML is printed, never submitted automatically.
- Tests: snapshot safety, partial publication with `--resume`, and save then import round trips in the tool's release-checks job.

### Strongest B design (from the independent review, not built)

- Explicit modes: `--save-template [<app>] --out <dir>`, `--publish-template <dir> --repo owner/name --public|--private`, `--describe-template <dir>`. They are dispatched before the existing scaffold argument parser, so every positional app name, `save` included, keeps working. Unknown or incompatible flags in these modes are errors.
- Code in `src/template-export/`, separate from scaffolding, sharing small primitives with the import path: the manifest schema, the file policy and the archive limits.
- Static only: no app scripts, package manager, plugins or module imports.
- The snapshot, file, secret and publication contracts above, unchanged.
- Cloud publishes the snapshot through its own GitHub integration; local publishing uses `gh` and stores no credential in the snapshot.
- Suggested gallery YAML is printed, never submitted automatically.
- Tests: snapshot safety, partial publication with `--resume`, and save then import round trips in `scripts/test-create-app-integration.ts`.

### C and A'

- **C** (`yarn mercato template` in `@open-mercato/cli`): found where developers already work, and the version matches the app. It serves only apps on a line that shipped the command, so no app on 0.9 or older can save, and the sandbox waits for a new image line. Its cost is rollout friction; it can be added later as a thin wrapper over A or B.
- **A'** (a `template` command in `create-mercato-module`): the cheapest by reuse, but the package name says modules, and its compatibility contract covers module packages.

## Sandbox integration (abstract)

The sandbox is a closed product. This spec defines only what the tool offers and what the action needs:

- **Code only.** A snapshot holds files. Configuration made through the UI and stored in the database, uploaded files, and runtime edits that never reached tracked files are not saved. The sandbox shows the `code-only` notice before anything is pushed. Moving such configuration into code (seeds, setup scripts) is the author's job.
- **Two ways to call the tool.** Either `prepare --json --out <dir>`, after which the platform pushes the snapshot with its own GitHub integration and sets the template flag and topics; or `prepare --json` then `publish --json --from <dir> --expect <snapshotId>` in a shell where the user is signed in to GitHub with `gh`. No platform credential is passed to the tool or written to the repo.
- **Needs from the tool.** Node and `npx`, the stable JSON and exit-code contract, no prompts with `--json`, a single-commit result, and a snapshot that `publish` verifies instead of rebuilding.
- **Needs from the sandbox.**
  - A pinned tool version, so the action behaves the same for every user of a given environment.
  - An owner choice (personal account or an organization the user belongs to) and a visibility choice.
  - The report shown before anything is pushed, including every image path and size, and the exact `snapshotId` passed to `publish`. Images remain warnings only because the user reviews this report before approving publication. The scan does not block personal data in images, including those under `public/`; the user must inspect them before approving.
- **Catalog submission stays a user action.** The sandbox shows the YAML and the CONTRIBUTING link in v1, then `/submit?template=owner/repo` once Phase 1b ships. It never opens PRs on its own.
- **Open in sandbox (D6).** A catalog link with only `template=owner/repo` and `ref=<sha>`, never env values. The sandbox decides compatibility and asks the user to confirm before running third-party code.

### v1 acceptance flow

v1 is done when this passes once, end to end, and is written down with the repo URL and both shas:

1. In an OM Cloud sandbox, with whichever of the two call paths the sandbox supports (no "Save as template" button needed), run `prepare` on the sandbox app. The report shows the `code-only` notice, the image list and no error. Review the report and inspect the images before approving publication.
2. Publish that snapshot to a new private repo with `--expect <snapshotId>`. The result returns the repo URL and commit sha, and the repo has one commit, `is_template: true` and both topics.
3. On a clean machine, with `GITHUB_TOKEN`, run `npx create-mercato-app my-app --template owner/repo`. The CLI resolves the default branch through the GitHub API and prints "not listed, not verified" and `owner/repo@<sha>` matching step 2. Compatibility comes from the downloaded lockfile.
4. `cp .env.example .env`, install, initialize, build, start, and log in. The app's `src/modules.ts` inventory matches the sandbox app's.

Owner: Wojtek, with the OM Cloud team for step 1.

## Edge Cases & Failure Scenarios

| Case                                             | Behavior                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret or credential URL found by `prepare`      | Exit 1. JSON lists the path and line, never the value. Nothing leaves the machine.                                                                      |
| Secret in the source history                     | Not exported: the snapshot is one tree, and the template gets one fresh commit.                                                                         |
| Uncommitted work                                 | Listed in the report. Excluded unless `--include-uncommitted` (A10).                                                                                    |
| Snapshot edited after review                     | `publish` exits 1 with `snapshot-modified`. Nothing remote happens.                                                                                     |
| Tracked `backup.sql`, archive or sqlite file     | Exit 1, unless the author allows the path with `--allow-file`.                                                                                          |
| Symlink, submodule or special file               | Exit 1 with the path.                                                                                                                                   |
| App on a version newer than the tool             | Every blocking check still runs. Unmatched stock values are emptied, and the report says the version is unknown.                                        |
| Repo name already exists                         | `publish` refuses with exit 1 and `repo-name-exists`. `--resume` continues only on an empty repo or one whose single commit matches the snapshot tree.  |
| Push or flag step fails                          | Exit 4. JSON shows the finished steps, the repo URL and commit sha when known, and a `retry` command with `--resume`.                                   |
| `gh` not signed in                               | Exit 3 with the `gh auth login` hint.                                                                                                                   |
| Template pins an old OM line                     | Catalog badge "N lines behind". CLI warning (A5). Smoke runs on the pinned version.                                                                     |
| Catalog `ref` is a sha from a fork               | Validation fails: the sha must be reachable from a branch or tag of the listed repo (compare API).                                                      |
| `#ref` names a sha the catalog has not seen      | The CLI prints "not verified, no catalog facts" and computes the version warning from the downloaded lockfile.                                          |
| Verified sha disappears (force-push, GC)         | Sync sees the tarball 404 and clears `verified`. If the CLI meets it before the next sync, it stops and suggests `#<ref>`. The page shows the change.   |
| Archive with a link, too many files or too large | Import fails with the path or the limit. The target directory is removed when the CLI created it (`--template`).                                        |
| Repo renamed or transferred                      | Sync sees a new `full_name`. The page shows a notice and the CLI follows GitHub's redirect. A curator PR moves the file to the new path.                |
| Smoke red for 3 runs in a row                    | The entry shows a red receipt. A curator decides on `hold`, keeping any existing slug and adding a reason. The status never changes automatically.      |
| `engines.node` excludes the harness Node         | No cell. The page says "engine not covered by the smoke".                                                                                               |
| `smoke.login: false` without `ready`             | Validation fails: the start step needs a route that answers 200.                                                                                        |
| Template repo deleted, made private or archived  | Sync detects it. `templates.json` drops deleted or private repos and marks archived ones.                                                               |
| `--template` on a `hold` entry                   | Refused with its reason for both the retained slug and `owner/repo` ([hold policy](#hold-policy)).                                                      |
| Slug missing or index unreachable                | A slug fails with a clear message and suggests `--template owner/repo`. No silent fallback to `--app`.                                                  |
| Unauthenticated GitHub rate limit in the CLI     | The existing `ready-apps.ts` messages apply. `GITHUB_TOKEN` is honored.                                                                                 |
| PR touches only `templates/`                     | Today `changedFiles` (`lib/validate/run.ts:47-61`) ignores it, so validation would pass silently. Phase 1a step 2 fixes this first.                     |
| Demo seed with real-looking people               | `prepare` warns. Curator review rejects it (Astro rule).                                                                                                |
| Template depends on `@open-mercato/enterprise`   | Marked on the page and in the CLI, no smoke cell (D5).                                                                                                  |
| Sandbox app relies on UI-made configuration      | Not saved (`code-only`). The created app starts without it.                                                                                             |
| `templates.openmercato.com` not Active yet       | `/templates` works on `modules.openmercato.com`. Nothing depends on the second host.                                                                    |
| Any other path on `templates.openmercato.com`    | Served as on `modules.openmercato.com`; canonical tags and copy commands name `modules.openmercato.com`, and no preview note shows. Only `/` redirects. |

## Risks & Impact Review

| Risk                                        | Impact                                                                                          | Mitigation                                                                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ready Apps contract change (D3)             | `create-mercato-app` public behavior for `--template`, plus archive limits on the shared fetch. | The Phase 4 spec amends `2026-03-02-ready-apps-framework.md` and `packages/create-app/AGENTS.md` explicitly. `--keep-name`.                                                                              |
| The catalog becomes a trust root            | A bad entry or a squatted slug sends users to someone else's code.                              | Reachable-sha check, curator-only bare slugs, the CLI prints `owner/repo@sha` before download, `OM_TEMPLATES_URL` limited to https or loopback, facts bound to the sha.                                  |
| Secret or personal data leak from a sandbox | High and hard to reverse once public.                                                           | One pinned tree, a verified snapshot, regular files only, opaque files blocked, content scan that never weakens, generated `.env.example`, image list, curator checklist.                                |
| Reviewed and published content differ       | The user approves one thing and publishes another.                                              | `publish` consumes the snapshot, verifies every hash and `--expect <snapshotId>`, and never prepares again.                                                                                              |
| Partial publication                         | A half-made repo, or a retry that writes into the wrong repo.                                   | Per-step report, repo URL and sha returned, `--resume` only on an empty repo or a matching tree, `--update` deferred.                                                                                    |
| Stale templates                             | Users start on old OM.                                                                          | Computed "lines behind", "not verified" until Phase 1b, then weekly smoke, curator `hold`.                                                                                                               |
| Third-party code in CI                      | Supply chain.                                                                                   | Isolation: ephemeral runner in `nightly.yml`, `om-cell`, `env -i`, no secrets, runner reads only before install. Template cells refused on the preview path (never on Cezar).                            |
| Nightly budget                              | Fewer module cells per night.                                                                   | One reserved cell per night, one cell per template per night, weekly cadence, budget numbers unchanged.                                                                                                  |
| License boundary (D5)                       | A free template that needs a paid package misleads users.                                       | Computed Enterprise mark on the page and in the CLI. Piotr decides whether to allow it.                                                                                                                  |
| Section public before any entry             | The section looks dead, or promises more than it has.                                           | A plain "coming soon" state with no fake entries (D7); entries only after the save tool ships; the state is computed from `templates.json` from Phase 1a.                                                |
| Second host                                 | Duplicate pages, or links that send users to the wrong host.                                    | Canonical and Open Graph tags stay on `modules.openmercato.com`; `here.ts` leaves both production hosts alone, so commands name `modules.openmercato.com` and no preview note shows; only `/` redirects. |
| Users expect a full sandbox copy            | Configuration made in the UI is missing in the created app.                                     | The `code-only` notice in every report and in the sandbox flow; docs on moving configuration into seeds.                                                                                                 |
| Name clash ("template")                     | User confusion.                                                                                 | D1 terms.                                                                                                                                                                                                |
| Single npm maintainer                       | Release bottleneck.                                                                             | Add a second maintainer or npm Trusted Publishing before 1.0.                                                                                                                                            |
| Catalog rule 9                              | The words `catalog` and `directory` must not appear in identifiers, CLI flags or JSON keys.     | Field, flag and tool names above avoid them.                                                                                                                                                             |

Rollback:

- **Phase 0.** Remove the page, the header item, the production origin passed to `here.ts`, `functions/_middleware.ts` with `_routes.json`, and the custom domain in Cloudflare.
- **Catalog section.** Remove `templates/` and the emit step. Published files are additive, so no module consumer breaks.
- **Tool.** Deprecate `create-mercato-template` on npm.
- **`--template`.** Additive flag. Removing it before a stable release costs nothing; after one, it needs a deprecation notice.

## Phasing

| Phase | Ships                                                                                                    | Repo                                              | Owner                                                  | Depends on                              |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| 0     | Now (2026-10-29). Templates section, coming soon: `/templates`, header item, `templates.openmercato.com` | `open-mercato/modules`, Cloudflare                | Wojtek; Dominik adds the custom domain and DNS         | D7                                      |
| 2     | v1, next week. Save tool `create-mercato-template` (`prepare`, `publish`, `describe`)                    | New tool repo (D2 = A)                            | Wojtek builds, Piotr publishes to npm.                 | A1, A2. Step 5 test needs 1a schemas.   |
| 1a    | v1, next week. Templates section data: schemas, validation, gallery, `templates.json`                    | `open-mercato/modules`                            | Wojtek (catalog maintainers), Piotr review             | D1, D4, D5, A2, A3, A6                  |
| 4     | v1. `create-mercato-app --template`, archive limits                                                      | `open-mercato/open-mercato` `packages/create-app` | Core team (Dominik wrote `--app-url`), Wojtek proposes | 1a live, D3, A5, A8; aligned with #8118 |
| exit  | v1 acceptance flow                                                                                       | (none)                                            | Wojtek with the OM Cloud team                          | 2, 1a, 4                                |
| 1b    | After v1. Nightly template smoke, `/submit` template mode                                                | `open-mercato/modules`                            | Wojtek                                                 | 1a, A11                                 |
| 3     | Sandbox "Save as template" (and "Open in sandbox", D6)                                                   | OM Cloud (private)                                | OM Cloud team                                          | Phase 2 released                        |
| later | MCP tools, llms sections, search documents, A13 items                                                    | `open-mercato/modules`                            | Wojtek                                                 | 1a                                      |

Phase 0 ships now and blocks nothing. Phase 2 and 1a start next week (from 2026-11-02), in parallel. Phase 4 starts when 1a publishes `templates.json`. Until Phase 4 ships, the acceptance flow can be rehearsed with `--app-url`. Entries appear on `/templates` after the save tool ships (D7). A small independent fix can ship at any time: correct the `--app prm` help and README example.

## Implementation Plan

### Phase 0: Templates section, coming soon (`open-mercato/modules`, now)

1. Page `site/src/pages/templates.astro` as described in [UI/UX](#uiux): what a template is, the three planned steps, the coming-soon state, links to this spec and to the modules list. No entries, sample cards or copy chips; no numbers or dates typed by hand. Test: `yarn check` (astro check, check-text) and Playwright on Cezar (rule 5): the page renders at phone and desktop width and has no copy chip.
2. Header: a `Templates` item after `Modules` in `site/src/components/Header.astro`, current on `/templates`. Test: Playwright, `aria-current` on `/templates` only.
3. Second production origin: `hereScript` in `site/src/lib/here.ts` (called from `site/src/layouts/Base.astro`) takes a list of other production origins, `https://templates.openmercato.com`, where it neither rewrites nor shows `[data-preview-note]`, as described in [Domain](#domain-templatesopenmercatocom-phase-0). Test: unit test (templates host: no rewrite, notes hidden; a `pages.dev` host: rewrite and notes shown as today).
4. Host redirect: `functions/_middleware.ts` and `_routes.json` as in [Domain](#domain-templatesopenmercatocom-phase-0), erasable TypeScript with hand-written types (no new dependency, rule 1). `pages.yml` deploys from the repo root, so `wrangler pages deploy dist` bundles `functions/`; the build job also runs `wrangler pages functions build` offline, so a broken Function fails before deploy. Test: unit test (templates host root to `302 https://modules.openmercato.com/templates` with the query kept; modules host and a `pages.dev` host pass through).
5. RUNBOOK: the custom domain and DNS steps for `templates.openmercato.com`. Dominik adds the domain. Test: after deploy, `curl -sI https://templates.openmercato.com/` answers `302` with `location: https://modules.openmercato.com/templates`, and `/templates` answers `200` on both hosts.

### Phase 2: Save tool (`create-mercato-template`, D2 = A)

1. Setup: repo copied from `create-mercato-module` (CI, release checks, e2e harness with the `gh` shim). Test: CI green on an empty command.
2. Stock table: a release-time script reads `.env.example` and the other stock scaffold files from each `create-mercato-app` tarball on npm and writes keys, values and allowed credential URLs per version. Test: the table for 0.9.0 matches the tarball.
3. `prepare`: pinned HEAD, tree export from blobs, A10, root checks, entry types, deny list, opaque files with `--allow-file`, secret scan with credential URLs, generated `.env.example` with `--keep-env`, declared env, paid dependencies, warnings, the `code-only` notice, the manifest, `<out>/tree` and `report.json` with hashes and `snapshotId`, `--json` and exit codes. Test: fixtures for every check, including `src/modules/x/data/entities.ts` kept, a dirty working tree whose changes are not exported by default, `.yarnrc.yml` with `npmAuthToken`, a changed `DATABASE_URL` password, a tracked `backup.sql`, a symlink, a submodule, an unknown version, a stock app with no findings, a changed `JWT_SECRET`, and OpenAI, Stripe and Slack keys hard-coded in source.
4. `publish`: snapshot verification and `--expect`, `gh repo create` with explicit visibility, one fresh commit from the snapshot, `is_template` via `gh api PATCH`, topics, the step report, `--resume`. Test: e2e with the `gh` shim, including exit 1 with `repo-name-exists` on a name clash, a file edited after `prepare`, a push failure followed by a successful `--resume`, and exit 1 with `repo-not-from-snapshot` on an unrelated repo. Both refusals allow reads but make no remote changes.
5. `describe`: catalog YAML and the CONTRIBUTING link in v1. Test: output validates against `template-1.json`, the manifest against `mercato-template-1.json`, and no `/submit` link is printed before Phase 1b.
6. Contract test: `publish` to the shim, then `create-mercato-app --app-url` (later `--template`) on the result, through install, build, start and login. Test: release-checks job.
7. First release, published to npm by Piotr. The agent guide for new apps ships in the Phase 4 PR, like `module-tool.md`.

### Phase 1a: Templates section (`open-mercato/modules`)

1. Add the `TemplateDescriptor` and `TemplateManifest` zod schemas, key order, `templateFile` and `templatePagePath` helpers, and the JSON Schema exports (hand-written `templateJsonSchema()`, because `z.toJSONSchema` drops `superRefine`, `lib/schema/json-schema.ts:41-48`). Test: fixtures valid and invalid.
2. Extend `changedFiles` and the step list in `lib/validate` for `templates/`. Extend `SCREENSHOT_FILE` (`lib/schema/descriptor.ts:110`, today `^modules/` only) and the orphan and size checks to `templates/`. Add a `/templates/` line to `.github/CODEOWNERS`, and `templates/` and `docs/` to `check-text` `TEXT_DIRS` and autofix. Steps: schema, repo (exists, public, not archived, ref resolves and is reachable from a branch or tag), license (D4: OSI license required for `active`), texts, name (reserved, typosquat), slug uniqueness across statuses, retain the existing slug when moving an entry to `hold` (compare with the base entry), non-empty `reason` for `hold`, `smoke.login: false` requires `ready`, claim. Test: a templates-only PR fails on a bad entry; a fork sha fails; a `hold` entry without a license passes; moving a slugged entry to `hold` passes with the same slug and a reason, but fails if the slug is removed or changed or the reason is missing.
3. Add a static `archive` step: tarball within the existing limits (`lib/sources/tarball.ts:11`); refuse `.template` files and links; require `package.json` with `@open-mercato/core`, `yarn.lock`, Yarn 4, one OM line in the lockfile and a parseable `src/modules.ts`; read `engines.node`; read `mercato-template.json` when present. Test: against fixtures, no network.
4. New module inventory parser `modulesFromModulesTs` (see [Data Model](#catalog-entry-templatesownerrepoyml)). Test: the scaffold `src/modules.ts` at e1a6f9de5 yields `ratelimit_probe` from `@app`, `example_customers_sync` and `storage_s3` as conditional, the enterprise pushes as conditional, and no truncation on a fixture with 120 entries; an unreadable construct is listed as `unparsed`.
5. Sync and facts for templates, keyed by sha: repo metadata including `full_name`, `source.sha`, pinned core version from `yarn.lock` (parsed with the existing `yaml` dependency), `engines`, `requiresEnterprise`, the module inventory, `linesBehind`. Data paths as in Data Model. Test: fixture snapshot.
6. Emit `templates.json` (with `reason` and per-sha facts), `t/<path>.json|.md` and the two JSON Schemas. Add `SiteMeta` counts computed from data. Test: emit snapshot. Module outputs unchanged.
7. Site: `/templates` gallery with the use case filter, replacing the Phase 0 page once `templates.json` has an `active` entry; `/t/[...path]` page; the header item from Phase 0 also current on `/t/`; badges, "not verified" state. Test: Playwright on Cezar (rule 5).
8. CONTRIBUTING: a Templates section in the existing format (file structure, fields table, review checklist). Add the PRM entry with `status: hold`, no slug, and a reason (D4). Test: `yarn check`, `yarn test`.

### Phase 4: `create-mercato-app --template` (`open-mercato/open-mercato`)

1. Spec in `.ai/specs` that amends the Ready Apps spec (the three rules in D3, the index design note, manifest removal, cleanup, archive limits for the shared fetch) and `packages/create-app/AGENTS.md` (rule 7 and the "never rewrite" line). Align with #8118.
2. Index fetch (`OM_TEMPLATES_URL` with the https or loopback rule), slug and `owner/repo#ref` parsing, sha selection and per-sha facts, the hold policy, mutual exclusions, the resolved `owner/repo@sha` line. Test: unit tests with a mocked index, including a `#ref` to an unknown sha, a missing `verified.sha`, unlisted public and private repos resolved through the default-branch API, an unreachable index with `owner/repo`, and refusal by retained slug with the hold reason.
3. Archive limits in the shared fetch: streamed byte cap, entry and size caps, files and directories only, `lstat` validation. Test: fixtures with a symlink, a hard link, a self-link, an oversized archive and too many entries; each fails with a clear message.
4. Compatibility warning against the latest stable line, "not verified" and Enterprise notices. Test: unit tests with mocked tarballs at different OM lines, including compatibility from an unlisted repo lockfile and its "not listed, not verified" notice.
5. `name` rewrite, provenance, manifest removal, cleanup on failure, next steps with env keys, and the `--registry` warning. Test: unit tests. Integration test in `scripts/test-create-app-integration.ts` against a fixture template served locally.
6. Docs and help: a `--template` example; fix the broken `--app prm` example; the agent guide for the save tool; the `--app` miss hint (A8). Test: help snapshot.

### Phase 1b: Smoke (`open-mercato/modules`, after v1)

1. Discriminated subject (`module | template | baseline`) for `Receipt` and `MatrixCell`, cell key `template` part, template receipt paths and history keys, `line` as the pinned line. Test: unit tests; existing receipts and keys unchanged; a template receipt never lands in `_baseline.jsonl`.
2. `steps.sh`: scaffold branch with the `TEMPLATE_URL` check and a pinned importer; the mirror as a background process in `prepare`, stopped in `pack`, with the `runner` user only hashing and size-capping; `OM_CREATE_APP_GITHUB_API_BASE_URL` in `run_cell` `env -i` and `check_inputs`; immutable installs; the resolved core version read as `om-cell`; an audit of every runner-side read; `start` with `smoke.ready`; no tamper check. `smoke.sh` support for `login: false`. Receipt fields for Node, Yarn and importer. Test: one template cell green through `nightly.yml` `workflow_dispatch` with `cells=<key>` on a fixture template repo; a fixture with `login: false` and `ready` passes start.
3. Preview path: `plan-matrix --runner preview-docker` leaves out template cells; `cells-local` and `harness/local/run-cell.sh` refuse them. Test: a plan with a template entry has no template cell for `preview-docker`; `run-cell.sh` exits non-zero on a template cell.
4. Planner: template cells after module cells, one reserved cell per night, one cell per template per night, cadence rules including importer changes, `requiresEnterprise` and excluded engines skipped. Collect: `parseCellJobName`, classification by failing step. Test: plan snapshot; a starved-night case still plans one template cell.
5. Site: receipt drawer on template pages. `verified` in `templates.json`. Test: emit snapshot.
6. `/submit` template mode (`?template=owner/repo`). Switch `describe` and the save flow from CONTRIBUTING to the prefilled link only once the mode is live. Test: Playwright and the updated `describe` link output.

### Phase 3: Sandbox (OM Cloud, private)

Specified by the OM Cloud team against the contract in [Sandbox integration](#sandbox-integration-abstract): the "Save as template" dialog, owner and visibility choice, the report checklist with the `code-only` notice, publishing with `--expect`, and optionally "Open in sandbox" with a confirmation step. The catalog adds the link once the entry point exists.

## Review notes

Points from the reviews that were not applied as proposed:

- "Remove the nightly smoke, MCP and the three states from v1": applied for the smoke and MCP (D10, "later" row), not for the states. `status` reuses the existing module enum and `reason` rule at no extra cost.
- "Metadata in three places is too much for v1": kept, because each has one job (YAML for the gallery, the manifest for prefill and env keys, provenance for the created app). The manifest lost its seed block in revision 3 (A13), and provenance is part of D3, so Piotr can drop it.
- "The scaffold `.gitignore` has no `/data/` or `/storage/`" (both earlier reviews, opposite claims): on `main` e1a6f9de5 it has `public/uploads/*`, `/storage/` and `/data/`, all anchored. `.claude/` and `.codex/` are unanchored there, and revision 3 follows that.
- "Drop `--keep-name`": kept as a cheap opt-out tied to the `name` rewrite in D3. `--strict` was dropped (A5).
- "Add `spike.yml` to the plan": not added. The test uses `nightly.yml` `workflow_dispatch` with `cells=<key>`, which exists. AGENTS rule 4 still names `spike.yml`; that wording is out of scope here.
- Independent review, "archive date, repo state, npm sizes, maintainers and #8118 are not verified": all checked on 2026-10-29 with `gh` and npm and confirmed; kept, now with dates.
- Independent review, "`every --app call fails` needs an inventory of repos and tags": done on 2026-10-29 (only `ready-apps` and `ready-app-oss-prm` match, `ready-app-prm` is 404, `oss-prm` has no tags); kept.
- Independent review, "a missing verified commit silently selects different code": revision 2 printed the fallback, so it was not silent. Revision 3 still stops and asks for `#<ref>`, as a policy choice.
- Independent review, "the central index breaks the Ready Apps spec": that spec rejects a central repo holding the apps and itself suggests a documentation index (`:72`, `:305`). D3 now names three rules plus a design note, not four rules.
- Independent review, "pick B": not adopted as a recommendation; up to revision 4 D2 stayed open with both options on equal terms. Revision 5: D2 decided as A on 2026-10-29, after Piotr's message that the tool should work like `create-mercato-module`. The comparison stays in [Save tool options](#save-tool-options) as the record.
- "Piotr asked for saving first": not confirmed against a written source. His messages of 2026-10-29 ask for the save tool and `create-mercato-app` support together, without an order. The acceptance flow stands on its own, because saving is the part with no existing support.
- Revision 5, D7: revision 4 held the public launch until two `active` templates existed. On 2026-10-29 Piotr asked to mark the section on the site at once, so Phase 0 ships a coming-soon page with no entries. The empty-section risk is handled by saying plainly that it is coming, not by sample entries.
- Revision 5, domain: Piotr suggested `templates.openmercato.com` instead of `modules.openmercato.com`, with the repo unchanged. Decided as a second domain of the same site whose root leads to `/templates` on `modules.openmercato.com` (a same-host redirect would trap the links to `/`); `modules.openmercato.com` stays, because the module catalog, `templates.json` and the CLI index URL live there.
