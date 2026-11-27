# Execution plan: www-cms-mapping

Source spec: docs/specs/2026-11-27-www-strapi-cms.md (Phase 1: the mapping, offline)
Branch: feat/www-cms-mapping
Base: main (71c9fc1)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA. The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed; per-Step commits touch only `Status` and `Commit`.

| Phase | Step | Title                                                         | Exec   | Status | Commit |
| ----- | ---- | ------------------------------------------------------------- | ------ | ------ | ------ |
| 1     | 1.1  | Navbar and footer as content files                            | inline | done   | 14382ca |
| 1     | 1.1a | Comments out of the content, files in the pull's format       | inline | done   | (next) |
| 1     | 1.1b | Landing template words as a content file                      | inline | todo   | -      |
| 1     | 1.2  | Mapping table, toDocument and fromDocument, Strapi REST fixture | inline | todo   | -      |
| 1     | 1.3  | Content source decision table                                 | inline | todo   | -      |

## Goal

Phase 1 of the spec: every piece of main-site content that will live in Strapi is a content file, and a pure mapping
turns each file into a Strapi 5 document and back to the same bytes, proven over every file of `www/content` with no
Strapi server. The built site does not change.

## Scope

- 1.1: `MAIN_SITE_MENUS`, `MAIN_SITE_LINKS`, `MAIN_SITE_SANDBOX` and the footer constants of `lib/core/main-site.ts` move
  to `www/content/navigation.json` and `www/content/footer.json`, with Zod schemas in `lib/schema/www-content.ts`;
  `main-site.ts` re-exports the same names, read from the JSON with an import attribute.
- 1.1a: the YAML comments of `www/content/pages/*.yaml` move out (structure notes to the block schemas, Webflow notes
  to the import manifest); `redirects.yaml` keeps its comments.
- 1.1b: `LANDING_TEMPLATE_TEXT` moves to `www/content/landing-template.yaml`, a `file` collection with its own schema,
  read by the landing template through the collection.
- 1.2: `lib/www-cms/model.ts` (mapping table, `toDocument`, `fromDocument`, isomorphic), the file serializer, the
  byte round-trip test over every file of `www/content`, and a hand-written REST fixture in `test/fixtures/strapi/`.
- 1.3: `lib/www-cms/source.ts`, the decision table of Edge Cases, with one test case per row.

## Non-goals

- Nothing of Phase 2 or later: no `cms/` folder, no Strapi dependency, no `www-push` or `www-pull` command, no change
  of any workflow, no network call to any Strapi.
- No change of the built site, of any route or of the catalog's `RUN_MENU`.
- No new dependency in the root `package.json` or `yarn.lock`.

## Implementation Plan

### Phase 1: the mapping, offline

#### 1.1 Navbar and footer as content files

- JSON files in the shape of today's constants; schemas `navigationSchema()` and `footerSchema()`; `NAV_ICONS` as the
  enum of the icons.
- Test: unit tests (the JSON files validate, the re-exported constants keep their values); catalog-only and merged
  builds byte-identical to `main` (`diff -r`), `yarn om pages-site --check dist`.

#### 1.1a Comments out of the content, files in the pull's format

- Structure notes into the doc comments of the block schemas; Webflow notes into a `notes` list of
  `www/content/.webflow-import.json` that the importer keeps on a re-run.
- Test: no file of `www/content` but `redirects.yaml` has a comment (YAML parser, not grep); merged build
  byte-identical.

#### 1.1b Landing template words as a content file

- Collection `landingTemplate` (`landing-template.yaml`, entries `en` and `pl`); the schema keeps the keys of the
  constant; the template and the importer read the file.
- Test: schema test of the file; merged build byte-identical.

#### 1.2 Mapping table, toDocument and fromDocument, Strapi REST fixture

- `lib/www-cms/model.ts`: per Strapi type its API id, kind, file collection and fields (scalars, components, media,
  relations, dynamic zone), and the two pure functions. Media through a media library of folders and files, as the
  push lays them out.
- `lib/www-cms/files.ts`: files to entries and entries to files (YAML, frontmatter Markdown, JSON; Prettier).
- `test/fixtures/strapi/`: one trimmed REST answer per type, Strapi 5 shape (flattened, `documentId`), published
  content only.
- Test: every file of `www/content` round-trips byte for byte, counted per collection; the fixture maps to valid files.

#### 1.3 Content source decision table

- `lib/www-cms/source.ts`: from `WWW_CONTENT_SOURCE`, the `www_content` input and the pull result to `files`, `pull`,
  `snapshot` or `fail`.
- Test: one case per row of the Edge Cases table that the function decides.

## Risks

- A file the mapping cannot round-trip byte for byte: the step stops, the case goes into the PR body and HANDOFF.md;
  the test is not bent.
- Strapi naming limits (reserved attribute names, enumeration values) are not checked against a running Strapi in
  Phase 1; the mapping keeps a Strapi name per field so Step 2.2 can rename without touching the files.

## External References

- None (`--skill-url` not given).
