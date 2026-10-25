# Test fixtures

`data/` is a snapshot of the `data` branch; `descriptors/valid/modules/` holds descriptors laid out as in the repo, `descriptors/invalid/` holds broken ones (first line: `# expect-path: <field>` or `# expect-message: <text>`).

## data/

A validated snapshot of the `data` branch (spec 3.2, 4.5) for 8 entries and 3 built-in modules. Every file validates against `lib/schema/data` (test `test/schema/fixtures.test.ts`). Use it instead of the network in tests. Do not edit by hand; regenerate with `test/fixtures/build-data.py`, run Prettier on `test/fixtures/data`, and record the change here.

## Entries

| Key        | Locator                                              | Version                         | Receipts                         |
| ---------- | ---------------------------------------------------- | ------------------------------- | -------------------------------- |
| ksef       | `npm:@fastwhitecat/integration-ksef-direct`          | 0.1.8                           | verified on 0.9 and next         |
| consents   | `npm:@piotrkarwatka/marketing-consents`              | 0.1.0                           | broken on 0.9 (typecheck, build) |
| durable    | `npm:@fullstackhouse/open-mercato-durable-work`      | 0.6.0                           | verified on 0.9                  |
| datasync   | `npm:@fullstackhouse/open-mercato-data-sync-durable` | 0.6.0                           | none (untested)                  |
| stripe     | `npm:@open-mercato/gateway-stripe`                   | 0.9.0                           | verified on 0.9 (synthetic)      |
| tpay       | `npm:@open-mercato/gateway-tpay`                     | 0.8.1-develop.7442.1.4c1dbf1f0e | none (preview only)              |
| enterprise | `npm:@open-mercato/enterprise`                       | 0.9.0                           | none (skipped)                   |
| treg       | `github:Chmarusso/open-mercato-enrichment-treg`      | none (no tag)                   | none (untested)                  |

Built-in: `currencies`, `data_sync`, `wms` from `@open-mercato/core` 0.9.0.

Baselines: 0.9 (with the `api-keys` harness patch, OM #7473) and next.

## Where the numbers come from (all read on 2026-10-23, nothing executed)

- `sync/**`: npm packuments (`registry.npmjs.org`, read only) and GitHub repository metadata (`gh api repos/...`, read only). Downloads from `research/i4-inwentarz-modulow.json`. `firstSeenAt` is the fixture date with seconds in table order (the repo has no descriptor history yet).
- `facts/**`: g2 static scans (`~/kod/katalog-src/spikes/g2/out/*.json`, `@open-mercato/cli@0.9.0` `extractModuleFacts`) plus static reads of the published tarballs: table names and class lines from `data/entities.ts`, route lines, event lines in `events.ts`, migration dates from file names, worker queues, credentials from `integration.ts`, `process.env` names and `https://` hosts with file and line. Route paths are public paths (`/api/...`); legacy method directories (`api/get/...`) drop the method segment, matching the spike smoke call `GET /api/integration-ksef-direct/documents`. `extractor.catalog` is `fixture-wp01`.
- `fit/**`: `research/g2-dane.json` (`macierz` for third-party entries, `kontrola_ujemna` for official ones). `next` cells use the g2 `develop` column; drift is the g2 sample `0.9.0->develop`. `hostDuplicates` for consents on 0.9 comes from the spike (`@tanstack/react-table` 9.2.6 vs 9.3.1).
- `receipts/**`: step times and failures from `projekt/spike-cezar-nocna-instalacja.md`. 0.9 baseline and ksef on 0.9: row A (ksef smoke time taken from row C, row A did not time smoke). next baseline and ksef on next: row C. consents: row B1, two attempts, the second confirms `broken` with `alsoFailed: [build]`; both carry the night's `run.id` (as collect writes it since WP07), the second the url of its own run (25 Oct). durable-work: row B2 (smoke not timed: `sec: null`). The spike ran on Cezar with 4 CPU limits, not on `ubuntu-latest`; `run.id`, `run.url` and `cellKey` inputs (`harnessHash`) are placeholders until WP07 exists.
- `receipts/@open-mercato/gateway-stripe.jsonl` is synthetic: no install of gateway-stripe was measured. It exists so that WP08 has a Verified official entry; step times are copied from row B2.
- Every receipt above is an app from the empty preset (`om.preset: "empty"`, the spike scaffolded `--preset empty`): since the decision of 24 Oct it is the signal `in isolation`. Each has a synthetic copy as a receipt of a new app (`om.preset: "classic"`, the main verdict): the same steps and result, the classic cell key (`|preset:classic`, lib/receipts/cell-key.ts), the classic baseline of its line, no `core:` requirement and no `api-keys` patch (a new app has integrations and api_keys on). No classic night is measured for the fixture; `python3 -I test/fixtures/build-data.py --add-classic` writes the copies from the existing rows (`classic_copies`), a full build writes them too.
- `health/**`: computed by the WP01 builder from the rules in spec 6.3 and 6.5 as a reference input; WP08 owns the real `health` command and its golden tests.
- `builtin/0.9.0.json`: `dist/agentic/guides/module-facts.v2.json` of `@open-mercato/cli@0.9.0` (3 of 46 core modules). Routes are not measured there (`routesMeasured: false`).
- `presets.json`: `EMPTY_MODULES` read from `dist/index.js` of `create-mercato-app` 0.8.0, 0.9.0 and the develop snapshot. 0.8.0 and 0.9.0 lack `api_keys`; develop has it.
- `lines.json`: npm dist-tags of `create-mercato-app` (latest 0.9.0, develop `0.10.1-develop.7583.1.0c886d0a14`) and `npmPreapprovedPackages` from `template/.yarnrc.yml.template`.
- `radar/next.json`: g2 drift `0.9.0->develop` for the fixture modules; `createRequestContainer` 15 of 16 from g2.
- `hive.json`: empty slots (state before the first `yarn om hive`, WP11).
- `claims.json`: empty (all entries seeded by a curator are Unclaimed).

## Real findings worth knowing

- `@open-mercato/gateway-stripe` has a stable `1.0.1` that is deprecated ("published by mistake, use 0.4.x"). `latestStable` must skip deprecated versions, otherwise it would be 1.0.1.
- `fullstackhouse/open-mercato-durable` (the `repository.url` of both durable packages) returns 404.
- ksef 0.1.8 has MIT in `package.json`, `LICENSE` and `integration.ts`, so no `license-mismatch` in this version (0.1.7 had no license in `package.json`).
- `@open-mercato/enterprise` `agent_orchestrator` subscribes to `*`; the fixture rejects it with the `invalid-identifier` lint.
- `Chmarusso/open-mercato-enrichment-treg` has no tags, so its agent policy is `refuse UNPINNED_GIT`.

## create-app/

`modules-0.8.0.ts.txt` and `modules-0.9.0.ts.txt` are `template/src/modules.ts` of the `create-mercato-app` 0.8.0 and 0.9.0 tarballs (npm, read on 2026-10-24), the source of the default preset (`classic`) that `watch` writes into `lines.json` `defaultPreset`. test/core/review-r11.test.ts keeps the day-0 fallback in lib/core/lines.ts in step with them. The `.txt` suffix keeps them out of the TypeScript build.
