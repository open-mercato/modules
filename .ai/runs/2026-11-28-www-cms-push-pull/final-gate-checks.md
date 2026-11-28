# Final gate: www-cms-push-pull

Steps 3.1 (c7b14ba), 3.2 (62ff6f7), 3.2-recording (bbd483d). Run on Cezar, 28 Nov 2026.

## Validation gate

The repository's gate (AGENTS.md, Checks), in place of the `npm` commands of the copied operator config:

| Command      | Result                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| `yarn check` | exit 0: tsc (root, mcp, workers), astro check x2 0 errors, Prettier clean, check-text 800 files clean |
| `yarn test`  | 219 files passed, 2551 tests passed, 176 skipped (after the review fixes) |

`test/www-cms`: 176 tests (40 of them in push.test.ts and pull.test.ts; the rest model, drift, source, workflows). Root `package.json` and `yarn.lock`
unchanged (`git diff origin/main --stat -- package.json yarn.lock` is empty).

## Integration suite

Skipped: the change has no UI and the repository has no integration suite for the main site's content path. The
site-level check is the rehearsal's merged build `diff -r` (rehearsal.md): empty over 4491 files.

## Rehearsal

See rehearsal.md: push 647 changed then 0 changed; pull with drafts 183 of 183 content files byte-identical, 365 of 365
media files with equal SHA-256; merged build from the published pull equal to the build of main; the read-only token
read a never-published sentinel with `status=draft`.

## Design-system / style pass

Skipped: no UI and no style tooling for this area.

## Review

A fresh reviewer applied the `om-code-review` checklist: request changes, 3 major and 5 minor, all fixed in the
3.2-review-fix step with a test each (the token only to the instance's origin and no redirects; a token a header cannot
carry refused before any request; a moved upload and a raw link without its file fail the pull; a short upload page
probed; every written path checked; a failed replace undone; an empty snapshot noted; the page-size test seeds the
tree). Nits taken: `redirect: 'error'`. Not taken: parallel `sameBytes` in the push (a one-off import, 71 MB).

Re-review of e8d05ac: approve; its three minors fixed in 3.2-review-fix-b (a 3xx named as a redirect, not retried as
unreachable; a replace whose undo fails keeps its stage and names it; redirects.yaml may name a file that is gone).
Nits left: an upload deleted between two pages of the list can be skipped once; the manifest write is outside the undo
(the next run downloads again).
