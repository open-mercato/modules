# Execution plan: www-cms-push-pull

Source spec: docs/specs/2026-11-27-www-strapi-cms.md (Phase 3: Steps 3.1 and 3.2; Step 3.3 is the owner's)
Branch: feat/www-cms-push-pull
Base: main (a16f320)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA. The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed; per-Step commits touch only `Status` and `Commit`.

| Phase | Step          | Title                                                              | Exec   | Status | Commit |
| ----- | ------------- | ------------------------------------------------------------------ | ------ | ------ | ------ |
| 3     | 3.1           | yarn om www-push with its fake Strapi tests                        | inline | done   | 0558e6e |
| 3     | 3.2           | yarn om www-pull with --check, --drafts, --status, removed URLs, media cache | inline | todo   | —      |
| 3     | 3.2-recording | REST fixture recorded from a throwaway local instance, rehearsal fixes | inline | todo   | —      |

## Goal

The two commands of the spec's API Contracts: `www-push` (files and media into Strapi, upsert by slug, idempotent) and
`www-pull` (Strapi into the same files, same bytes, validated before anything is replaced), each with every test Step
3.1 and 3.2 name, in the root `yarn test` against a local fake Strapi (`node:http`, 127.0.0.1, random port) and the
recorded fixture. A rehearsal on a throwaway local instance gives the evidence Step 3.3 will need. The built site does
not change.

## Scope

- 3.1: `lib/www-cms/rest.ts` (the REST client: token header, at most 4 requests at a time, 30 s, 3 tries, paged reads
  at exactly 100), `lib/www-cms/push.ts`, `lib/commands/www-push.ts`, the CLI list, `test/www-cms/fake-strapi.ts`,
  `test/www-cms/push.test.ts`.
- 3.2: `lib/www-cms/pull.ts`, `lib/commands/www-pull.ts`, `test/www-cms/pull.test.ts`.
- 3.2-recording: `test/fixtures/strapi/` recorded from the local instance (trimmed, published content only), the tests
  that read it, and any mapping fix the rehearsal finds, each with a test.

## Non-goals

- Step 3.3 against any real host: no import into the owner's instance, no token of a real service, no restore drill on
  real data.
- No change to `pages.yml` or any workflow, to the behaviour of `lib/www-cms/source.ts`, to `cms/`, or to the built
  site; nothing deployed; no repository variable or secret.
- No new dependency in the root `package.json` or `yarn.lock`.

## Design decisions (from the spec and the 5.64.0 source)

- Tokens come from the environment only: `STRAPI_ADMIN_TOKEN` (push), `STRAPI_READ_TOKEN` (published pull),
  `STRAPI_DRAFTS_TOKEN` (`--drafts`, `--status draft`), never the other; the push refuses to run when `CI` is set.
- Media folders: the content API of 5.64.0 uploads into an existing folder (`folder` id) and lists folders with their
  `namePath`, but only the admin API creates folders, and an API token does not reach it. The push therefore needs
  the folders of the site (`/media/<dir>`, `/files/<dir>`) to exist and exits 2 naming the missing ones; `--dry-run`
  lists them too. Recorded as a decision for the owner in the PR.
- `--out <dir>` is a root laid out as `www/`: `content/`, `public/media/`, `public/files/`, plus `manifest.json` of the
  pull (documentId and updatedAt per file, SHA-256 per media file, the pull time). The default (`--out` not given) is
  `www` of the repository. The removed-URL rule and the media cache read `--snapshot <dir>` (same layout), else the
  tree being replaced.

## Risks

- Strapi behaviour the docs leave open (relations to never-published documents in a published read, the order of a
  many-to-many relation set by REST, file names and sizes of uploads, read-only token on drafts) is learned in the
  rehearsal; a mapping bug found there is fixed here with a test.
- One Strapi instance and one merged build at a time on this machine (memory).

## External References

- None (`--skill-url` not given).

## Implementation Plan

### Phase 3

#### Step 3.1: yarn om www-push with its fake Strapi tests

- REST client, push planner and writer, command, fake Strapi, tests: idempotent (second run `0 changed`), relations in
  the spec's order, each media file uploaded once, `--dry-run` writes nothing, refused in CI, token never printed.

#### Step 3.2: yarn om www-pull with --check, --drafts, --status, removed URLs, media cache

- Paged populated reads, the anonymous check, media with the manifest cache, fresh directory, validation, replace,
  `--check`; tests: fixture to valid files, removed slug without redirect fails, corrupt answer leaves the tree
  untouched, more than 100 documents over pages, a page size other than 100 exits 2, an anonymous 200 fails, a changed
  media file is named, `--status draft` reads only the drafts token.

#### Step 3.2-recording: REST fixture recorded from a throwaway local instance, rehearsal fixes

- Push all of `www/content` and the media into a throwaway local instance, push again (`0 changed`), pull, compare,
  build, record the fixture; fix what the rehearsal finds.
