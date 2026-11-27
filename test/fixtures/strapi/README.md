# Strapi REST fixture

One trimmed answer of the Strapi 5 REST API per type of `lib/www-cms/model.ts`, written by hand from the output of
`toDocument` for a few published entries of `www/content` (Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 1.2).

- `api/<route>.json`: the answer to `GET /api/<route>?populate=...&status=published&pagination[pageSize]=100` as
  Strapi 5 gives it: flattened documents (no `attributes`), each with its `id`, `documentId`, `slug` and status
  fields; relations as the related document with its `documentId` and `slug`; media as the upload's file object;
  `meta.pagination` for a collection type.
- `media.json`: the site paths of the media files the answers use, for the media index of the test.
- Public content only: no document is a draft, and the only entry that is not in `www/content` is the manual
  redirect `/old-pricing`, made up to cover a rule of source `manual`.

Step 3.2 replaces these answers with a recording from the Strapi instance on Cezar and runs `test/www-cms` again.
