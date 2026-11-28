# Strapi REST fixture

Answers of the Strapi 5.64.0 REST API per type of `lib/www-cms/model.ts`, recorded on 28 Nov 2026 from a throwaway
local instance of `cms/` (Compose with `compose.test.yaml`, 127.0.0.1 only, torn down after) into which `yarn om www-push`
had imported all of `www/content` and the media (Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 3.2). It replaces the
hand-written answers of Step 1.2.

- `api/<route>.json`: the answer to the pull's own request, `GET /api/<route>?status=published&populate=...` with the
  populate of the mapping and `pagination[pageSize]=100`, trimmed to the documents the hand-written fixture held (one
  or a few per type); `meta.pagination` is set to the trimmed list. Single types are answered as they are.
- `api/upload/files.json`: the uploads those documents use, from `GET /api/upload/files` (the list a read-only token
  reaches). The push writes each file's site folder into its `caption`, because the content API does not tell a token
  which Media Library folder a file is in; the pull reads the path from there.
- Published content only: no draft. The manual redirect `/old-pricing` is not in `www/content`; it was pushed only for
  the recording, to cover a rule of source `manual`.

The documentIds, ids and times are the instance's. `test/www-cms/model.test.ts` and `test/www-cms/pull.test.ts` read
these files; the pull test serves them from a fake Strapi with the media bytes of `www/public`.
