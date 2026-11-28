# Rehearsal on a throwaway local instance (evidence for Step 3.3, not 3.3)

Strapi 5.64.0 from cms/ (compose.yaml + compose.test.yaml, project cms-rehearsal, 127.0.0.1:1337 only), cms/.env from
cms/scripts/dev-env.sh, one full-access and one read-only API token made for the run and gone with the volumes
(down --volumes). Commands from this branch. Tokens were read from files of mode 600 and never printed.

## Push (dry run, run, second run)
```
dry run: nothing written, the counts are what a run would do
  author: 5 created, 0 updated, 0 unchanged
  blog-category: 6 created, 0 updated, 0 unchanged
  case-study-category: 8 created, 0 updated, 0 unchanged
  partner-tier: 4 created, 0 updated, 0 unchanged
  partner-industry: 10 created, 0 updated, 0 unchanged
  partner-service: 5 created, 0 updated, 0 unchanged
  partner-language: 29 created, 0 updated, 0 unchanged
  partner-location: 41 created, 0 updated, 0 unchanged
  partner: 27 created, 0 updated, 0 unchanged
  case-study: 20 created, 0 updated, 0 unchanged
  blog-post: 72 created, 0 updated, 0 unchanged
  job: 1 created, 0 updated, 0 unchanged
  landing: 32 created, 0 updated, 0 unchanged
  page: 19 created, 0 updated, 0 unchanged
  navigation: 1 created, 0 updated, 0 unchanged
  footer: 1 created, 0 updated, 0 unchanged
  landing-template: 1 created, 0 updated, 0 unchanged
  redirect: 0 created, 0 updated, 0 unchanged
  media: 365 uploaded, 0 replaced, 0 unchanged
647 changed

647 changed

www-push
  author: 0 created, 0 updated, 5 unchanged
  blog-category: 0 created, 0 updated, 6 unchanged
  case-study-category: 0 created, 0 updated, 8 unchanged
  partner-tier: 0 created, 0 updated, 4 unchanged
  partner-industry: 0 created, 0 updated, 10 unchanged
  partner-service: 0 created, 0 updated, 5 unchanged
  partner-language: 0 created, 0 updated, 29 unchanged
  partner-location: 0 created, 0 updated, 41 unchanged
  partner: 0 created, 0 updated, 27 unchanged
  case-study: 0 created, 0 updated, 20 unchanged
  blog-post: 0 created, 0 updated, 72 unchanged
  job: 0 created, 0 updated, 1 unchanged
  landing: 0 created, 0 updated, 32 unchanged
  page: 0 created, 0 updated, 19 unchanged
  navigation: 0 created, 0 updated, 1 unchanged
  footer: 0 created, 0 updated, 1 unchanged
  landing-template: 0 created, 0 updated, 1 unchanged
  redirect: 0 created, 0 updated, 0 unchanged
  media: 0 uploaded, 0 replaced, 365 unchanged
0 changed
```

## Parity pull (--drafts, read-only token as STRAPI_DRAFTS_TOKEN) into a fresh directory
```
www-pull
  landing: 32
  page: 19
  blog-post: 72
  author: 5
  blog-category: 6
  case-study: 20
  case-study-category: 8
  partner: 27
  partner-tier: 4
  partner-industry: 10
  partner-service: 5
  partner-language: 29
  partner-location: 41
  job: 1
  redirect: 0
  navigation: 1
  footer: 1
  landing-template: 1
  media: 365 downloaded, 0 reused
  newest change in Strapi: 2026-11-28T01:34:38.610Z
replaced
$ diff -rq www/content pulled/content
Only in www/content: embeds
Only in www/content: .webflow-import.json
content files: 183 pulled, 183 held by Strapi in www/content, all byte-identical
media: sha256 of www/public/{media,files} vs pulled: diff exit 0, 365/365 files
```

## Built-site parity

Merged production layout (PAGES_MERGED=1, SITE_URL=https://www.openmercato.com, BASE_PATH=/run, HOME_PATH=/modules,
PAGES_SERVE_ORIGIN=https://modules.openmercato.com, MCP_URL of the repository, OM_NOW=2026-11-28T00:00:00Z, GITHUB_SHA of
a16f320, data a34fa69), one worktree of main a16f320: build of the files, then `www-pull` (published, read-only token)
into its www/ (git status: the 13 never-published entries deleted, manifest.json added, nothing else), build again.
```
diff -r dist-main dist: exit 0, 0 lines; 4491 files each; functions/site.ts identical; pages-site --check dist passes
```

## Draft sentinel

A never-published post pushed as a draft; `www-pull --status draft --drafts` with the read-only token as
STRAPI_DRAFTS_TOKEN wrote it with draft: true; the published pull did not. The read-only token reads drafts. The
sentinel was deleted (204) and the push printed 0 changed again.

## --check against the repository www
```
0 files differ
```
