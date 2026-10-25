# Recorded HTTP responses (WP04)

`yarn om sync|discover|watch --offline` and `test/sources/**` replay these files instead of the network. One file per request: `<host>/<path and query>-<10 hex of the request key>.json` with `{ request, response }` (see `fixtureFile()` in `lib/sources/http.ts`). A request without a recording fails offline; it is never answered by a guess.

## Recorded on 2026-10-23 (read only, nothing executed)

Inputs: the 16 descriptors in `test/sources/modules/` and the policies in `test/sources/policy/`, clock `OM_NOW=2026-10-23T04:17:00Z`:

```sh
OM_NOW=2026-10-23T04:17:00Z yarn om sync --modules test/sources/modules --policy test/sources/policy --data <tmp>/data --out <tmp>/out --record
OM_NOW=2026-10-23T04:17:00Z yarn om discover --modules test/sources/modules --policy test/sources/policy --data <tmp>/data --out <tmp>/out --record
OM_NOW=2026-10-23T04:17:00Z yarn om watch --modules test/sources/modules --data <tmp>/data --out <tmp>/out --record
yarn prettier --write test/fixtures/http
```

Bodies are slimmed before they are written, and only in ways that do not change what the sources compute:

- npm packuments keep every stable version, every version a dist-tag points to (all prereleases when there is no stable version and no usable `latest` tag), and only the fields `npm.ts` reads (test: `npm.test.ts`, "the recording slimmer does not change what npm.ts computes");
- jsDelivr listings keep `src/modules/<id>/index.ts` and one `dist/modules/<id>/` file per module;
- deps.dev keeps the provenance fields; GitHub search and trees keep the fields discovery reads.

Rate limits and server errors (429, 5xx) are never recorded. Tarballs are not stored byte for byte: `tarball/<sha256 of the integrity>.json` holds the few text files read from a tarball whose SRI was checked during recording (the `create-mercato-app` templates for `lines.json`).

## Synthetic

`api.github.com/repos/wojciechszyjka/modules/commits/<sha>/pulls` and `api.github.com/orgs/FastWhiteCat/public_members/{lbajsarowicz,someone-else}` are written by `test/sources/make-claims-fixtures.ts` (`"synthetic": true` in the request). The catalog repository has no pull requests yet, so the PR history behind the claims tests cannot be recorded.
