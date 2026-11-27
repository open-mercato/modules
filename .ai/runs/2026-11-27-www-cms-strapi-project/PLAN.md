# Execution plan: www-cms-strapi-project

Source spec: docs/specs/2026-11-27-www-strapi-cms.md (Phase 2: the Strapi project in `cms/`, Steps 2.1 to 2.5)
Branch: feat/www-cms-strapi-project
Base: main (2d2fadb)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA. The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed; per-Step commits touch only `Status` and `Commit`.

| Phase | Step | Title                                                        | Exec   | Status | Commit |
| ----- | ---- | ------------------------------------------------------------ | ------ | ------ | ------ |
| 2     | 2.1  | The cms folder, its boundary, cms.yml and the byte test      | inline | done   | 2.1    |
| 2     | 2.2  | Content types and components as schema.json, drift test      | inline | done   | 2.2    |
| 2     | 2.3  | Roles seed, help texts, edit views, no model change in prod  | inline | todo   | —      |
| 2     | 2.4  | Publish hook and preview handler (off)                       | inline | todo   | —      |
| 2     | 2.5  | Backup and restore scripts, README                           | inline | todo   | —      |

## Goal

Phase 2 of the spec up to the owner's Step 2.6: a Strapi 5.64.0 project in `cms/` with its own lockfile, outside the
root toolchain, with the content model of the Data Model, the roles seed, the publish hook and backup and restore, each
proven by tests that run against a started instance in the new `cms.yml` on `ubuntu-latest` with an empty database.
The built site does not change.

## Scope

- 2.1: `cms/package.json`, `cms/yarn.lock`, `cms/.yarnrc.yml`, `cms/compose.yaml` (Strapi, PostgreSQL 17, backup job,
  tunnel), `cms/Dockerfile` (Node 24, non-root), `cms/.env.example` (no API token encryption key), `cms/config/**`
  (`api.ts` maxLimit 100, upload 25 MiB local), the bootstrap that writes the three Media Library settings at every
  start; root `.gitignore`, `.prettierignore`, check-text directories, `paths-ignore` of the `pages` push trigger,
  `.github/workflows/cms.yml`, the `/cms/` CODEOWNERS line; a root workflow test. Running-instance tests: settings
  restored after a restart, the byte test of four images, the anonymous GET under `/uploads/`; the answers go into the
  spec's Risks.
- 2.2: every type and component of `lib/www-cms/model.ts` as `schema.json` under `cms/src/`, with the field rules
  Strapi holds; `test/www-cms/model-drift.test.ts` in the root `yarn test`.
- 2.3: the roles seed from `cms/.env` (four Super Admins by invitation, refused duplicates and role addresses), help
  texts and edit view layout, the Content-Type Builder only in development, the Public role emptied at every start.
- 2.4: the mechanism confirmed in the 5.64.0 source, recorded in `cms/README.md`; the publish hook with debounce and
  retries; the preview handler, off; `node --test` with a fake GitHub endpoint and a running-instance test.
- 2.5: `cms/scripts/backup.sh`, `cms/scripts/restore.sh`, `cms/README.md`; backup to a local target and restore into a
  second Compose project in `cms.yml`.

## Non-goals

- Step 2.6 and everything later: no tag, ruleset, DNS record, tunnel, Access app, token, account, environment,
  repository variable or secret; nothing deployed, nothing run on Cezar beyond a throwaway local Compose project.
- No `www-push` or `www-pull`, no change of `lib/www-cms/source.ts` behaviour, no change of `pages.yml` beyond the
  `paths-ignore` of its push trigger, no change of the built site.
- No new dependency in the root `package.json`; the root `yarn.lock` does not change.
- No edit of `AGENTS.md` (a note for its owner in the PR body).

## Risks

- Strapi 5.64.0 is younger than the 14-day age gate of the root rules: `cms/.yarnrc.yml` keeps the gate and pre-approves
  `@strapi/*` only, with a comment (the root pre-approves `@open-mercato/*` the same way).
- The byte test may fail for a type: then the plan stops at 2.1 as the spec says.
- Strapi may reserve a name of the mapping (for example `status`): the model and its tests change in the 2.2 commit.

## Implementation Plan

### Phase 2: the Strapi project in `cms/`

#### 2.1 The cms folder, its boundary, cms.yml and the byte test

- As Scope 2.1. Test: root `yarn install --immutable` leaves `yarn.lock` unchanged; `cms.yml` passes
  `docker compose config` and a start with an empty database; a root test asserts the `paths-ignore` of `pages.yml`
  and the `paths` of `cms.yml`; on the instance the three settings are off again after a change and a restart, four
  images with metadata keep their SHA-256, and the anonymous GET under `/uploads/` is recorded.

#### 2.2 Content types and components as schema.json, drift test

- As Scope 2.2. Test: `test/www-cms/model-drift.test.ts` fails when either side changes (checked by hand both ways).

#### 2.3 Roles seed, help texts, edit views, no model change in prod

- As Scope 2.3. Test: on a production-mode instance a Super Admin publishes a post, the Content-Type Builder is not
  offered and a model change is refused, the Public role has no permission after a start; the seed refuses a repeated
  or role address (`node --test`).

#### 2.4 Publish hook and preview handler (off)

- As Scope 2.4. Test: `node --test` with a fake GitHub endpoint (burst gives one dispatch with the fixed body, a 403 is
  not retried); on the instance one publish, one unpublish and one delete each give exactly one hook call.

#### 2.5 Backup and restore scripts, README

- As Scope 2.5. Test: in `cms.yml`, backup to a local target and restore into a second Compose project give the same
  `pg_dump` listing and the same SHA-256 of every upload.
