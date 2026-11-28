# Handoff: 2026-11-28-www-cms-push-pull

**Last updated:** 2026-11-28T02:13:24Z
**Branch:** feat/www-cms-push-pull
**PR:** https://github.com/open-mercato/modules/pull/45 (ready, not merged)
**Current phase/step:** done: 3.1, 3.2, 3.2-recording, 3.2-review-fix, 3.2-review-fix-b
**Last commit:** 18b502a, re-review minors of www-pull

## What just happened

- www-push and www-pull with their tests; a rehearsal on a throwaway local instance (rehearsal.md), the fixture
  recorded from it; review approved after two fix rounds.

## Next concrete action

- The owner: review and merge; decide on the media path in the caption; Step 3.3 on the real instance.

## Blockers / open questions

- Decision: the content API of 5.64.0 hides a file's folder from API tokens, so the path rides in the caption.
- Risk: a read-only token read a never-published sentinel with status=draft (local data point).

## Environment caveats

- Dev runtime runnable: yes; the rehearsal instance is torn down (down --volumes), its tokens gone with it
- Browser / UI checks: skipped, no UI
- Database/migration state: clean

## Worktree

- Path: the cezar task worktree
- Created this run: no
