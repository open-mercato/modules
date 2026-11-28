# Final gate: 2026-11-27-www-cms-strapi-project

Baseline: main 2d2fadb. Recorded 2026-11-28.

## Validation commands

- Root `yarn install --immutable`: exit 0; `yarn.lock` SHA-256 unchanged, `package.json` unchanged (no new root dependency).
- Root `yarn check` and `yarn test`: see the PR body for the run on the tip.
- `cd cms && yarn install --immutable && yarn build && yarn test`: build exit 0, 21 unit tests pass.
- `cms.yml` (ubuntu-latest, empty database): green on every step commit; instance tests 12 pass on 5a1542f
  (run 46086725169): settings off after a restart, the four SHA-256 equal, anonymous GET under /uploads/ 200, every
  type and component loaded, roles seed, Content-Type Builder 403, Public role empty, edit views, one dispatch per
  publish, unpublish and delete, backup and restore (1715 listing entries, the same rows and upload SHA-256).

## Drift test

- `test/www-cms/model-drift.test.ts` fails when one side changes alone: drift-evidence.txt (a schema field added, a
  mapping field renamed, a component type changed: each 1 failed of 75; restored 75 pass). The review made it compare
  every enumeration with its source too.

## Built site

- Merged production layout (PAGES_MERGED=1, SITE_URL=https://www.openmercato.com, BASE_PATH=/run, HOME_PATH=/modules,
  PAGES_SERVE_ORIGIN=https://modules.openmercato.com, OM_NOW=2026-11-27T22:00:00Z, GITHUB_SHA of 2d2fadb, data a34fa69),
  main 2d2fadb and the tip built in one fixed worktree path: `diff -r` of dist empty (4490 files), functions/site.ts
  identical, `yarn om pages-site --check dist` passes for both.

## Integration suite and style pass

- The repository's integration suite (Playwright) covers the site, which does not change; the cms/ instance tests in
  cms.yml stand for the integration tests of this run. No design-system lint exists.

## Review

- `om-auto-review-pr 44 --autofix` (subagent): request changes, then approve after 0238fef, 544963b, 0eae850,
  5879b02; one minor and two nits taken up in 0b8d620 (age-gate end, empty account list); the idle() race of the hook
  under a dispatch longer than the quiet period is left open (tests only).
