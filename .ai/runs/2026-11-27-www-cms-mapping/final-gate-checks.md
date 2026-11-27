# Final gate: 2026-11-27-www-cms-mapping

Tip: afa234f. Baseline: main 71c9fc1. Recorded 2026-11-27T23:03:52Z.

## Validation commands

- `yarn check` (tsc root, mcp, old-hosts; astro check site and www; Prettier; check-text): exit 0, 0 errors, 0 warnings, check-text 657 files clean.
- `yarn test`: 215 files, 2427 passed, 176 skipped, exit 0.
- CI on afa234f: build, checks, validate pass.

## Built site

- Both layouts built in one fixed worktree path with `OM_NOW=2026-11-27T22:00:00Z` and `GITHUB_SHA` of 71c9fc1 pinned; data branch at a34fa69.
- `diff -r` of main 71c9fc1 against the tip afa234f: catalog-only empty, merged empty; functions/site.ts identical for both layouts. The same holds for the builds of 14382ca, a61c4ef, 79ed9f5 and d531039.
- `yarn om pages-site --check dist`: passes for both layouts.
- `scripts/pages-smoke.sh dist` in wrangler pages dev on the merged tip upload: 35 checks pass, exit 0.
- Noise found and handled: the emit clock (`OM_NOW`), the build stamp of /about (`GITHUB_SHA`), Astro's scoped CSS ids (hash of the absolute path; one build path), and one blog PNG that the image step re-encoded differently in one of three builds of main itself; the baseline is the main build that matches.

## Integration suite and style pass

- Skipped: no UI or behaviour change; the byte diff of both layouts and the smoke test stand for the integration suite. No design-system lint exists in this repository.

## Review

- `om-auto-review-pr`: approve, review https://github.com/open-mercato/modules/pull/43#pullrequestreview-6094083475; two minor fixes landed (2039d9f, afa234f); open points in the PR body.
