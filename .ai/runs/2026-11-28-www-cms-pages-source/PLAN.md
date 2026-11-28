# Execution plan: www-cms-pages-source

Source spec: docs/specs/2026-11-27-www-strapi-cms.md (Phase 4: Steps 4.1 and 4.2; Step 4.3 is the owner's)
Branch: feat/www-cms-pages-source
Base: main (1b8b688)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA. The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed; per-Step commits touch only `Status` and `Commit`.

| Phase | Step | Title                                                                        | Exec   | Status | Commit |
| ----- | ---- | ---------------------------------------------------------------------------- | ------ | ------ | ------ |
| 4     | 4.1  | pages.yml reads www content by WWW_CONTENT_SOURCE, with the snapshot job      | inline | done   | ae9a529 |
| 4     | 4.2  | A9: one issue for a failed publish build or a snapshot fallback               | inline | todo   | —      |

## Goal

`pages` reads the main site's content as `lib/www-cms/source.ts` decides: the files (default, variable unset), a
comparison with Strapi (`shadow`), or Strapi itself (`strapi`) with the `www-content` snapshot as fallback, plus a
rollback build from a snapshot commit by hand. A failed publish build or a fallback keeps one issue up to date. With
`WWW_CONTENT_SOURCE` unset the site does not change by a byte and no secret is read.

## Scope

- 4.1: `.github/workflows/pages.yml` (inputs `www_content` and `snapshot`, steps Choose www content, Read www content,
  Use www snapshot, job Write www snapshot), `lib/commands/www-content.ts` (the step logic), `lib/www-cms/source.ts`
  (helpers the steps need), `lib/www-cms/snapshot.ts` (the snapshot tree), `lib/cli.ts` (the command list), tests.
- 4.2: `lib/www-cms/issue.ts` (title and body), the `www issue` job in `pages.yml` (`issues: write` on that job only),
  tests.

## Non-goals

- Step 4.3: no token, secret, variable, environment or Pages change; `WWW_CONTENT_SOURCE` stays unset.
- No `www-content` branch, no push to `main`, nothing deployed.
- The preview jobs (`preview-build`, `www-preview-build`) keep reading the files.
- No new dependency in the root `package.json` or `yarn.lock`.

## Design decisions

- Secrets only in Read www content, which runs only when `pullMode` is `compare` or `replace`; Choose www content
  decides that from the variable and the inputs alone, without secrets.
- The pull goes into a fresh directory; shadow compares it with `www/`, strapi applies it. The same apply function
  lays a snapshot over `www/` (content a Strapi type holds, `redirects.yaml` from the checkout plus the snapshot's
  manual rules, the media folders).
- Snapshot branch layout: the pull's own tree (`content/`, `public/media/`, `public/files/`, `manifest.json`), so it is
  the `--snapshot` of the next pull as it is.
- Deploy and preview deploys run only on `refs/heads/main` (plus the main-only rule of environment `cloudflare`); a
  run on another ref builds that ref and deploys nothing, so the snapshot build can be tested on a branch.
- A snapshot commit by hand must be an ancestor of `www-content` on main; on another ref the tip of a branch of this
  repository is accepted too (a fork commit can be fetched by SHA and is never accepted).

## Risks

- The `strapi` and `shadow` paths cannot run end to end before Step 4.3 (no instance reachable from Actions); they are
  covered by unit tests against the fake Strapi.

## External References

- None (`--skill-url` not given).

## Implementation Plan

### Phase 4

#### Step 4.1: pages.yml reads www content by WWW_CONTENT_SOURCE, with the snapshot job

- Inputs, the three steps, the snapshot artifact and job, the main-only deploy guard; tests for every branch of
  source.ts the workflow takes, for the command's plan, read and apply, and for the workflow file (secrets only in
  Read www content, skipped while the variable is unset).

#### Step 4.2: A9: one issue for a failed publish build or a snapshot fallback

- `issueBody` from the decision and the pull report, the fixed title, the `www issue` job; unit test of the body.
