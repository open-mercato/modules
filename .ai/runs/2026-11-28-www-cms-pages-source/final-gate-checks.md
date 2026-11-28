# Final gate: www-cms-pages-source

Steps 4.1 (6d1a13d), 4.2 (fc24148), 4.2-review-fix (32777ce). Base main 1b8b688.

## Validation commands

The repository's gate (AGENTS.md, Checks), not the template's `npm` list:

- `yarn check`: exit 0 (tsc, mcp, workers, astro check twice, Prettier, check-text: 800 files, no banned characters).
- `yarn test`: 221 files, 2587 passed, 176 skipped.
- `actionlint` 1.7.12 (Docker image `rhysd/actionlint:1.7.12`, with shellcheck) on `.github/workflows/pages.yml`: exit 0,
  no finding; the same on the file of `main`: exit 0.
- Root `package.json` and `yarn.lock`: unchanged (`git diff origin/main --stat -- package.json yarn.lock` is empty).

## The default does not change the site

`WWW_CONTENT_SOURCE` unset. Production layout variables of the repository (SITE_URL https://www.openmercato.com,
BASE_PATH /run, HOME_PATH /modules, PAGES_SERVE_ORIGIN https://modules.openmercato.com), MCP_URL of the repository,
OM_NOW=2026-11-28T00:00:00Z, a fixed GITHUB_SHA, data a34fa69, one build at a time on Cezar, both builds in the same
worktree path (Astro hashes the absolute path into its scoped style ids: two different paths give 221 differing files
of `data-astro-cid-*` and one CSS name, the same path gives none). The branch build ran `yarn om www-content plan` as
the workflow does: outputs `pull=none use=files commit=`, 0 summary bytes, 0 changes under www/.

| Upload | main 1b8b688 | branch | diff -r |
| --- | --- | --- | --- |
| merged (PAGES_MERGED=1) | 4491 files | fc24148: 4491 files | exit 0, 0 lines; functions/site.ts identical |
| catalog only (PAGES_MERGED unset) | 2683 files | fc24148: 2683 files | exit 0, 0 lines; functions/site.ts identical |
| merged | 4491 files | 32777ce: 4491 files | exit 0, 0 lines; functions/site.ts identical |

`pages-site --check dist` passed for every build.

## The snapshot build on a branch

Throwaway branch `test/www-content-snapshot` (orphan commit 5d236d2, a snapshot tree of www/ with one added test post,
checked with the pull's `treeProblems`: 0 problems). After reading the workflow of the PR branch: every deploy job needs
`deploy == 'true'`, which needs `github.ref == 'refs/heads/main'`, and environment `cloudflare` accepts `main` only.
`gh workflow run pages.yml --ref feat/www-cms-pages-source -f www_content=snapshot -f snapshot=5d236d2...`: run
46100245320, success. build: success (checked out fc24148; Choose www content `www content: snapshot 5d236d2...`; Use
www snapshot `www content: snapshot laid over www, 184 content files and 365 media files`; `dist matches`; `dist: 4492
files` against 4491 of the last main run 46097564591, the added post; notice "only a run on main deploys"). deploy,
write www snapshot, www issue, preview, www preview: skipped. The branch was deleted after the run.

## Integration suite and style pass

`om-integration-tests`: no UI change in this run (workflow, CLI and library code only), skipped. No design-system tool
applies.
