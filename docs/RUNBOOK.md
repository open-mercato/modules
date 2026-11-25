# Runbook: nightly install and receipts

How the nightly install works, what to do when a new Open Mercato minor ships, and how to run cells in preview mode.
Spec: sections 5.3, 4.4 and Appendix A. This file is documentation only: it is outside `harnessHash`, so editing it
never invalidates receipts.

## The night in one picture

1. `nightly.yml` at 02:17 UTC. Job `plan` runs `yarn om plan-matrix` (no foreign code) and uploads `matrix-a<n>`.
2. One `cell` job per cell, at most 6 at a time, 40 minutes each. Steps `prepare`, `scaffold`, `patch`, `env`,
   `install`, `add`, `generate`, `typecheck`, `initialize`, `build`, `start`, `smoke`, `pack`. Ladder steps run
   `harness/steps.sh`; app and module code runs as `om-cell` (no sudo, `env -i`, no Actions tokens). Logs go to the
   artifact `cell-<key12>-<line>-a<n>` (30 days). The job limit (40 minutes) is deliberately below the sum of the step
   limits (about 65 minutes): each step stops a step that hangs with its own marker, and a cell that is slow in every
   step without passing any limit is cut by the runner instead, a `cancelled` step that reads as `infra-error` (never
   the module's fault; the retry runs it again). Measure a classic cell on the first CI night, then set the job limit
   and `MINUTES_BY_PRESET.classic` (`lib/receipts/plan.ts`) from that measure.
3. `collect.yml` on `workflow_run`. It reads step conclusions from the Actions API (the only source of status), log
   excerpts from artifacts, decides each cell with `lib/receipts/state.ts`, dispatches one retry (attempt 2) for
   unconfirmed red and infra cells, waits for it and collects it in the same job. The wait is sized to the retry: its
   estimate (10 minutes to start, then waves of 6 cells at the minutes of `lib/receipts/plan.ts`) plus a 10 minute
   margin, at least 40 and at most 120 minutes (`lib/receipts/gather.ts`). Cells that do not fit 120 minutes are left
   out of the retry (baselines go in first, then infra, then module failures) and named in the notes of the night. A
   retry that ends after the wait leaves the night provisional (`receipts/_provisional.json`): the collect its own
   completion starts applies the whole night again with it, in place of the provisional receipts, once. Then
   `collect --bundle`, `radar` and `health --changed` are written to the `data` branch through `data-branch.ts`.

## Two starter presets (decision of 24 Oct)

Every line runs in two starter presets of create-mercato-app, a parameter of the cell (`preset` in the matrix,
`PRESET` for `steps.sh`, `--preset $PRESET` in `scaffold`):

- `classic`, what `npx create-mercato-app` makes without `--preset` (`DEFAULT_PRESET_ID`). Its receipts are the main
  verdict: the square, `/compat`, the Verified seal, the agent policy, the badge, `check_compat` and `plan_install`.
  `a new app` in every sentence means an app from it. About 60 modules are on, most official packages among them: for
  such a package `add` is `yarn add` of the version the app ships (create-mercato-app pins its own version), note
  `in-preset`. That version (`compat.ships`) is the line's version in every channel: `check_compat` `version`,
  `builtFor` and `fitsStatically`, the `plan_install` order, the `/compat` cell and the card's `Module` column. A cell
  takes about 15 minutes on a 4 CPU preview host with a warm Yarn cache (typecheck 233 s, build 420 s), 2.7 times the empty one.
- `empty`, twelve modules. Its receipts are the signal `in isolation` (the module works without the rest of the
  platform), shown as a small dot beside the square and always named (`In isolation (empty preset): ...`). They never
  change the main verdict, the level or the policy.

Each preset has its own baseline per line ("Open Mercato itself"): a red baseline makes `harness-red` only the cells of
its own preset. `collect` writes the scaffold list of each baseline into `presets.json` (`empty`, `classic`). The cell
key of an empty cell is the one it had before 24 Oct (the preset adds a part to the key only for classic), and a receipt
without `om.preset` reads as `empty`. The plan holds classic cells first, and among them the packages outside the preset
before the packages a new app already ships (their cell builds the baseline's app again). It weighs a classic cell at an
estimated 20 minutes (CI has no Yarn cache), so a 70-minute night of classic cells holds 20 of them. With cells of both
presets, the classic ones stop one wave short (`EMPTY_RESERVE_MIN`, 6 empty cells) and the empty preset fills it, so
the signal `in isolation` never starves. On a regular night next tests only the baseline and the packages outside the
preset in classic: a new app on next ships a new develop snapshot most nights, which no memo holds; the weekly night and
a dispatch test those too. The plan and every queue sentence of the site read one predicate for it
(`presetCellsWeekly` and `cellCadence` in `lib/core/lines.ts`), so such a cell says `Queued for Sunday's run` (in a
preview build `Queued for the first weekly CI run (Sundays).`) and the header of `/compat` adds `packages a new app
already has: weekly on next`. The classic baseline smoke-tests the first authenticated GET route of every catalog
package its new app registers (`presetSmoke` of the matrix, `SMOKE_PRESET`), so what a new app ships is checked every
night even where those packages' own cells wait for Sunday. An empty cell whose version already has a confirmed receipt
in isolation on the line, younger than 7 days, waits, whatever harness wrote it (a change of `steps.sh` does not re-run
the whole signal). The plan counts that memo apart (`memoIsolation`, and `memoIsolationUntil`, when the first of them
runs again). The keys of 23 Oct do not come back: `steps.sh` got `--preset` on 24 Oct, so `harnessHash` changed, and
the receipts of 23 Oct spare their empty cells until 30 Oct (from 09:27 UTC, all by the evening); from then a night of
the empty preset runs every line again (119 cells, about 11 hours in one preview stream).

Cell states: `verified`, `broken` (confirmed after a retry), `harness-red` (the baseline of the line is red: the
module is not judged), `infra-error` (two infra failures; the previous state stays decisive), `quarantine` (Yarn's age
gate), `untested` and `skipped` (decided by the plan, no run). A `quarantine` receipt of a run (its `install` or `add`
step stopped on `YN0016`, as about 46 classic cells on 24 Oct, 18:02 to 18:52 UTC, held back by
`@aws-sdk/credential-provider-http` 3.972.77 and `@ai-sdk/openai` 4.0.97) judged nothing: every channel says
`Not judged on <line>: on <day>, Yarn held back a dependency younger than its age gate.` (`QUARANTINE_WHY` and
`heldBack` in `lib/core/policy.ts`), never `New release`, and it never takes Verified away. Retry those cells once the
gate passes. Only the plan's own `quarantine` entry, a release of the module still in the gate (no failed step), says
`New release` with its date. The command of an app from the empty preset on a line a
new app ships the package installs the version that app ships when the other one broke there in isolation
(`emptyPresetVersion`: checkout 0.8.0 on 0.8, not 0.9.0); the sentence of the isolation receipt stays under it only
when no other version is left.

## Migration of 24 Oct (once, by itself)

Before 24 Oct the main verdict came from receipts of the empty preset; `data/health/**` and the level changes of
`data/changes/**` are from that model (26 entries Verified on 23 Oct). After the merge:

1. The first `health --changed` of the new model writes `verdictPreset: classic` into every health file. A level or
   status change against a file without it is the change of the test model: it keeps `reason: preset-model` in the data
   and stays out of `/changes.json` and `/feed.xml` (about 24 `verified to listed` would read as regressions).
2. The same `health` run (in `collect.yml`, `watch.yml` or `sync.yml`, whichever comes first) then runs the migration
   of `lib/receipts/preset-model.ts`, as soon as the data holds a receipt of a new app, and writes the marker
   `migrations.json` (`preset-model`: when, the switch, how many changes), so it runs once and no night publishes the
   old model's changes before it. It marks every level and status change dated before the first receipt of a new app
   with `reason: preset-model` (the feed said `KSeF Integration: level listed to verified` on 23 Oct, from the empty
   preset), and dates each entry that is Verified now by its first verified receipt of a new app on the latest line
   (ksef and webhooks: 24 Oct 06:16). On the copy of the preview data: 26 changes marked, 2 dated, a second run changes
   nothing. By hand, for a data copy: `node scripts/migrate-preset-model.ts --data .data [--dry-run]` (it writes the
   marker too).

The published schemas changed with the decision before anything was published: removed fields (`compat.findings`,
`compat.inDefaultPreset`, built-in `inDefaultPreset`, compat.json `rows[].findings`) and the new meaning of `inPresets`
(a new app, classic) and of the compat.json `baseline` (classic only) carry no `schemaVersion` bump. If anything had been
published, keep removed fields as deprecated for one release instead.

## A red baseline ("Open Mercato itself")

A red baseline turns every module cell of its line into `harness-red`. Nothing is held against modules.

Except a baseline of the classic preset whose failed step names only catalog packages its new app registers
(`presetPackages` of the matrix): the smoke check of their route (`smoke: FAIL preset <npm> api ...`, the server log
check aside), or a typecheck or build whose every TS error is in a file under `node_modules/<npm>/`. The baseline keeps
`harness-red` with those packages as `result.culprits`, and `/compat` and the run panel of `/` name them (`compat.json`
`baselineCulprits`), so a break of checkout never reads as Open Mercato itself failing. The culprits' cells are judged
as on a green line (retried, `broken` when the retry confirms it), every other cell on its own run: a pass is
`verified` (and counts for the level, VER-1), a failure stays `harness-red`, because it may be the culprit's.

1. Open the baseline receipt (`/r/<id>`) and the run artifact. The failed step and the first error are in the receipt.
2. Compare `.env.example` and `src/modules.ts` of the new app with the previous line (the scaffold copy of
   `src/modules.ts` is in `app-meta.json` of the baseline artifact; `data/presets.json` keeps the parsed list, which is
   only the `enabledModules` array literal: modules pushed later in `if` blocks, such as the enterprise modules behind
   `OM_ENABLE_ENTERPRISE_MODULES*`, are not in a new app and not in the preset).
3. If the harness needs a fix, add a patch: a script in `harness/patches/<id>.sh` (runs as `om-cell` in the app,
   idempotent) and an entry in `harness/lines.yml` with `applies` (semver range of create-mercato-app), `why` and `ref`.
   The patch appears in every receipt of that range (`pass, 1 harness patch`). A patch that changes none of
   `src/modules.ts`, `tsconfig.json` and `package.json` is not recorded. It runs before `install`, so the checksums of
   `tsconfig.json` and the scripts that guard `typecheck`, `build` and `start` already include it.
4. Run `nightly.yml` with `workflow_dispatch` (empty `cells` = tonight's plan, all lines).

Example: `api-keys` registers `api_keys` after `auth` for create-mercato-app `>=0.9.0 <0.10.0`. Checked on
23 Oct 2026 in the tarballs: the empty preset of 0.8.0 and 0.9.0 lacks `api_keys`, but only core 0.9.0 locks `ApiKey`
rows during `initialize` (`auth/lib/authorizationStateLocks.js`), so 0.8 does not need it. The develop snapshot
`0.10.1-develop.7583` registers `api_keys` itself.

Example: `agent-examples-tsconfig` for create-mercato-app `>=0.8.0 <0.9.0`. The 0.8.0 empty app failed `typecheck`
and `build` on the template's sandboxed agent examples (`src/modules/agent_examples/agents/**/scripts/**` and
`**/tools/**`, plain scripts without imports: TS2393 and TS7006, 18 errors, preview run of 23 Oct 2026). 0.9.0 excludes
both globs in `tsconfig.json` (OM #6695); the patch adds the same two entries, after which the 0.8.0 `tsconfig.json`
is byte for byte the 0.9.0 one. The agent_examples directory is the same in both versions.

## New Open Mercato minor (Appendix A)

1. `watch` sees a new `latest`. Lines move by themselves: `latest` to the new minor, `previous` to the old `latest`
   (or `latest-X.Y`), `next` unchanged.
2. Check the baseline of the new line on `/compat`. Red: follow the section above.
3. Narrow patches the new line no longer needs (for example `api-keys` stays `>=0.9.0 <0.10.0`).
4. Bump `@open-mercato/cli` in `package.json` (PR, WP01), run the Rentgen golden tests and
   `yarn om scan --builtin <new>`. Core modules that the generator put in `operations` with a warning go into
   `policy/builtin-categories.yml` (`ecommerce` is already there, and listed in `policy/builtin-upcoming.yml` so emit and
   scan do not call it unknown; once a released core ships it, they ask to remove it from that file). Check
   `data/presets.json` of the new line: a change of
   the empty preset changes which modules get `in preset` (D10: `add` is then `yarn add` only).
5. Check `/radar` for the new line and any `sameFailure`.

Budget: one minor costs about half a day.

## Replay or repair a night

- Collect a run again: `collect.yml` with `workflow_dispatch(run_id)`. A night already in the receipts ends without
  changes (receipts carry the night's run id, also for retried cells).
- Run cells again: `nightly.yml` with `cells` (keys, 12-character keys or locators). The plan then ignores the memo
  and the line cadence for those cells.
- A preview receipt whose excerpt a newer classification rule reads better (its `run.url` is the local log
  directory): `node scripts/reexcerpt.ts --data <dir> [--rule duplicate-route] [--dry-run]` rewrites only the excerpt,
  signature, file and line of the failed step, and only when the class stays the same, so the id, the result and the
  transition never change. The rule `duplicate-route` (round 13: freighttech shipment-tracking in a new app adds
  `/backend/webhooks`, which the webhooks module of that app already has) came after the classic night of 24 Oct.
- A pre-check of a release in the age gate: `nightly.yml` with `mode: early` (the package is preapproved for that run
  only; the receipt says `harness.mode: early` and never counts for Verified).

The plan skips a cell when its last receipt with the same key (module version, integrity, Open Mercato version,
`harnessHash`, Node) is confirmed and younger than 7 days. An empty cell also waits when the same version has a confirmed
receipt in isolation on the line younger than 7 days, from any harness (see Two starter presets). Any change of `harness/steps.sh`, `env.sh`, `smoke.sh`,
`patches/**` or `lines.yml` changes `harnessHash` and re-runs everything on purpose. `lib/receipts/classify.ts` and
this file are outside the hash.

Retention: a receipt line is written when the status, the cell key or the confirmation changes, after a retry, or when
the last line of the same cell is 7 days old.

## What the checksums cover (D47)

`steps.sh` hashes the `scripts` section of `package.json`, `tsconfig.json` and `.yarnrc.yml` after `install`, again at
the end of `add` and before `typecheck`, `build` and `start`. Module code already runs in `add` (the generators of
`yarn mercato module add` import the module's sources), and `add` may change only dependencies (spec 5.3), so a
difference between `install` and the end of `add` fails `add` with `tampered-files` (module-fail). Not covered:
`next.config.*`, `src/**` of the app and anything else a module could write as `om-cell`. That is the boundary D47 names:
Verified is a compatibility signal, not a security review.

## Files of om-cell

Module code runs as `om-cell` and owns `/home/om-cell` (app, logs). The runner never copies, tails or greps a file
there: `copy_from_cell` in `steps.sh` lets `om-cell` read it (refusing symlinks and anything but a regular file) and
the runner only writes the copy into `$OUT`. That covers the server log (`server.log` in the artifact), its process
group id and, in preview with `--keep-generated`, `api-routes.generated.ts`. `smoke.sh --log` reads only the copy; the
route check against the generated manifest runs as `om-cell` too. The runner still hashes `package.json`,
`tsconfig.json` and `.yarnrc.yml` and parses `src/modules.ts` (only digests and a yes or no leave that).

## Preview mode (official packages only)

The repository is public on GitHub (28 Oct) and `nightly.yml` is the runner of record. Preview mode is left for
debugging cells of official packages and the harness on a Docker host; it never runs third-party module code
(AGENTS.md rule 4). `plan-matrix --runner preview-docker` leaves out, and `cells-local` and `run-cell.sh` refuse,
every cell that would run code from outside `@open-mercato/*`: the module, a catalog module or `lib:` package it
requires, a GitHub tarball of another owner, or a package its new app registers. The refusal names the cell and the
packages (`run-cell.sh` exits 77). Third-party cells get their receipts from `nightly.yml` only.

The same cell can run in Docker on any host with Docker (locally or over ssh) through `harness/local/run-cell.sh`:
same `steps.sh`, same step conditions and timeouts as the `cell` job. Preview receipts say
`harness.runner: preview-docker` and `run.url` points to the local log directory. A preview cell has its own cell key
(the key gets a `preview-docker` part), so a preview receipt never has the id of a CI receipt of the same cell and day,
and the plan memo never mixes the two. `cells-local` refuses a matrix that was not planned with
`--runner preview-docker`.

```sh
yarn om plan-matrix --runner preview-docker                       # out/matrix.json, both presets
yarn om plan-matrix --runner preview-docker --preset classic      # a night of the main verdict only
yarn om cells-local --host <user>@<docker-host> --cells <keys>    # out/preview/<run id>/
yarn om collect --local out/preview/<run id>                      # receipts into .data
# retry of unconfirmed red cells (keys in out/retry.json):
yarn om cells-local --host ... --attempt 2 --parent <run id> --cells <keys>
yarn om collect --local out/preview/<run id> --local out/preview/<retry run id>
```

### A preview night in streams

A night of every official cell of the lines on one host runs in parallel streams, each one cell at a time
(`cells-local --shard i/n`, the baselines all in shard 1). The whole night is one bash script; do not paste it into
zsh (zsh does not split an unquoted variable into words, so a loop over `$RUNS` ran once with every run directory in
one word):

```sh
N=~/kod/om-modules-night; mkdir -p $N/out && cp -R ~/kod/om-modules-preview/.data $N/.data   # a copy of the data
bash scripts/preview-night.sh --data $N/.data --out $N/out --host <user>@<docker-host> --streams 2 --stagger 300
node lib/cli.ts health --changed --data $N/.data && node lib/cli.ts emit --data $N/.data && npx astro build
```

The script plans every official cell of the lines without a budget cut (`--preset classic` by default, `--lines 0.9`
for one line, `--plan-only` to read `out/matrix.json` first). Each cell gets `--memory 10g`, and the host must have the
sum of the limits free (`--min-free-mem-gb`, default streams x memory): three streams need 30 GB, so a host of 30 GB
shared with other services (about 28 GB available when idle) runs a classic night in two streams.
8g is too little for a classic cell: in the trial of 24 Oct the baseline of 0.9 reached the limit at typecheck
(`memory.peak` 8 GiB, page cache reclaimed, no kill) and lost the type check of `next build` to it. The night refuses
a host with a running cell container (`omcell-*`) or less available memory (wait for its queue, or pass fewer
`--streams`); a host it cannot measure (no `/proc/meminfo`, as on macOS, or no Docker) is said so, with `--force` as
the way past it. A step the limit cuts short gets the marker `[harness] cell out of memory` in its log (`run-cell.sh`
reads `oom_kill` of the cell's cgroup), which collect reads as infra on every attempt, never as `broken` (that trial:
`infra-error at build`; without the marker the rule `type-check` made it a red baseline and every classic cell of the
line `harness-red`), and every preview receipt names its limit (`harness.memory`). The script
starts the streams `--stagger` seconds apart so their builds drift apart, then collects stream 1 (the baselines) first,
retry included, so the other streams' retry keys read today's baselines and a red baseline spares them their retries.
Their retries run in parallel, their collects one after another. Every `cells-local` claims its run id with an
exclusive mkdir of `out/preview/<id>` and of `<remote-dir>/<id>` on the host (the next id when it is taken), so two
retries started in the same second never share a run directory. A stream that stops early (the fence, ssh, a full
disk) still assembles and prints its run with the cells that ran, its matrix cut to those; a retry that prints no run
directory is reported and its stream is collected without it. Sizes on a 30 GB host (24 Oct, third-party cells still
included): 119 classic cells of three lines at about 15.5 minutes are about 31 hours in one stream, about 15 hours in
two; 119 empty cells at about 5.5 minutes are about 11 hours in one stream, about 4 hours in three (an empty cell stays
well under 8g: `--memory 8g` passed there).

Isolation of a preview cell:

- one container per cell from `harness/local/Dockerfile` (Ubuntu 24.04, Node 24.21.0 with Corepack, user `om-cell`
  without sudo), `--memory 10g --cpus 4` (`cells-local --memory <n>g` changes it; a step the limit cuts short is
  infra, see above), `no-new-privileges`, a private bridge network per cell;
- the cell network reaches the internet and nothing of the host (review round 2). A bridge network alone does not do
  that: through its gateway a container reaches every service the host listens on, including ports closed to the
  internet (databases, caches, a reverse proxy), and the cloud metadata service `169.254.169.254` with the server's
  user-data. `harness/local/cell-firewall.sh` runs in a throwaway container of the `fw` stage of the Dockerfile
  (`--net host --cap-add NET_ADMIN`, the script on stdin, nothing mounted; the user only
  needs the `docker` group) and adds, for the cell subnet: a chain `OMC-<suffix>` jumped to from `DOCKER-USER` that
  rejects link-local, private (`10/8`, `172.16/12` except the cell's own subnet, `192.168/16`), shared `100.64/10`,
  loopback and multicast ranges and every IPv4 of the host (published ports of other containers are DNATed to private
  addresses before that chain, so they are covered too), and an `INPUT` rule that rejects anything from the subnet to
  the host itself. IPv6 is off inside the cell. The rules go on every iptables backend that has `DOCKER-USER` (for
  example `iptables-nft`; a warning about legacy tables is harmless); a host where none has it does not run cells;
- before any step `run-cell.sh` probes from the cell as `om-cell`: TCP to the gateway, to every address of the host
  (ports 22, 80, 443, 3000, 5432, 6379, 7700, 8080) and to `169.254.169.254:80`. One open target and the cell does not
  start (exit 3; `cells-local` runs no further cell, and assembles the ones that ran before). `registry.npmjs.org:443`
  is probed too, for the log only;
- Postgres from the pgvector pin of spec 3.3 in its own container that joins the cell's network namespace, so the app
  sees it on `127.0.0.1:5432` like the job service;
- the only host directory mounted is the output directory, written by the runner role (root in the container);
  `om-cell` cannot read or write it. No environment variables except the harness inputs, no secrets, no tokens;
- containers, the firewall rules, the network and the Postgres volume are removed when the cell ends (`--keep` keeps
  them for debugging; then `run-cell.sh --unfence <chain> <subnet>` from the log line, `docker rm -fv` and
  `docker network rm`).

The fence is only as good as the host's firewall stack. The cleaner alternative is a throwaway VM
with Docker and no other services or secrets, destroyed after the run; the same commands work there.

Difference from CI: preview cells share a Yarn cache volume (`om-preview-yarn-cache`, `--yarn-cache none` turns it
off) to save time and disk on the host. The CI job has no cache at all (D12): a module could poison a shared cache for
later cells. Drop the volume (`docker volume rm om-preview-yarn-cache`) when in doubt.

The preview host never runs third-party module code: AGENTS.md rule 4 keeps it on ubuntu-latest, and the refusal at
the top of this section enforces it in the plan, in `cells-local` and in `run-cell.sh`.

Preview receipts never go to the real `data` branch. `collect` on GitHub Actions refuses a `preview-docker` night, and
the state machine reads only the history of the night's runner: a preview receipt is never `transition.from`, the last
baseline or the start of a regression for a CI night (and the other way round). Keep preview data in its own checkout
(for example a copy of `.data`).

Cleanup on the host after a session: `docker ps -a --filter name=omcell-`, `docker network ls --filter name=omcell-`,
leftover firewall chains (`docker run --rm -i --net host --cap-add NET_ADMIN om-modules-cell-fw:1 bash -s -- list
<harness/local/cell-firewall.sh`, then `run-cell.sh --unfence <chain> <subnet>`), `docker volume rm
om-preview-yarn-cache`, `docker image rm om-modules-cell:node24.21.0 om-modules-cell-fw:1`, `rm -rf ~/om-cells`.

### Serving a preview build

A build is for one address. Without `SITE_URL` and `BASE_PATH` it links to the default
`https://modules.openmercato.com` (Cloudflare Pages, 28 Oct), which serves nothing of this build until the deploy of
`pages.yml` runs, so `llms.txt`, `modules.json`, the `.md` cards and the canonical tags of a preview point at other
or dead pages (finding of 25 Oct).
`yarn om emit` warns when `SITE_URL` is not set. For a preview, build for the address that serves it:

```sh
SITE_URL=https://<preview host> BASE_PATH=/run node lib/cli.ts emit --data <data> && \
  SITE_URL=https://<preview host> BASE_PATH=/run npx astro build
```

The pages rewrite their copy commands, links and Claude Code prompts to the host they are served from either way.

A build with a `BASE_PATH` other than `/` writes the site to `dist/<base>/` (for `/run`: `dist/run/index.html`,
`dist/run/_astro/`, `dist/run/modules.json`), and `astro build --outDir <dir>` to `<dir>/<base>/`. Serve the
folder above it, so the path keeps its prefix: `node test/e2e/serve.ts dist 4410 /run` does that, and so does any
static server started in `dist`. Nothing cuts the prefix any more (see Move under www.openmercato.com/run). With
`HOME_PATH=/modules` as well (set it for `emit`, `astro build` and the e2e suite alike) the home page is
`dist/run/modules.html` and `/run` answers a redirect to it; `test/e2e/serve.ts` reads that rule from
`dist/_redirects`.

## Stop the night

To stop the nightly install at once (a hostile module, an Actions bill), disable the workflow by hand:
`gh workflow disable nightly.yml` (or Actions > nightly > Disable workflow). `collect` runs only after a night, so it
stops with it. The keepalive of `watch` (every 30 days, spec 5.2 step 5) reads each workflow's state first: it calls
`enable` on an `active` or `disabled_inactivity` workflow and leaves a `disabled_manually` one off, with the line
`keepalive: nightly.yml was disabled by hand; left off` in its log. To stop every scheduled job, disable `watch.yml`
and `sync.yml` as well. `gh workflow enable nightly.yml` turns the night back on.

## Classification

`lib/receipts/classify.ts`, first match wins, and every rule that blames the module comes before infra:
`tampered-files` (add, typecheck, build, start: module-fail), `YN0016` or `quarantined` (install, add: quarantine),
`Metadata for entity X not found` (initialize), TypeScript errors with file and line (typecheck, build),
`Failed to type check` (build), `relation "x" does not exist` (initialize, start), `JavaScript heap out of memory`
(build: infra first, module-fail on the retry), `[harness] step timed out` (any step: infra first, module-fail on the
retry from `add` on), and only then network and runner errors (`ENOSPC`, `EAI_AGAIN`, `ETIMEDOUT`, `ECONNRESET`,
`npm ERR! code E5xx`, `503 Service Unavailable`, `The operation was canceled`: infra). A TypeScript error stays
module-fail even when module output or a quoted type in the same log carries an infra token. Anything else is infra
before `add` and module-fail from `add` on, except a step whose conclusion is `cancelled` (job timeout, a cancelled
run): without a module rule that is infra.

Timeouts are one rule on both runners. `steps.sh` limits each step itself, 20 s under `timeout-minutes` of the step in
`nightly.yml` (`step_secs`), and writes `[harness] step timed out after <n> s` into the step log when the limit really
passed; the inner `timeout 900 yarn build` writes `[harness] step timed out: yarn build ran 900 s`. An exit code 124 or
137 that module code returns before the limit is an ordinary failure. GitHub's `timeout-minutes` and the `timeout` of
`run-cell.sh` (equal to `timeout-minutes`) are only backstops; the preview runner reports a step ended by its backstop
as `cancelled`.
The signature is `sha1(step + ':' + first error line)` with paths reduced to file names, hex runs to `h` and numbers to
`#`; the same signature in 3 or more modules on one line is a `sameFailure` on `/radar`.

## Repository setup (owner clicks)

Spec 5.6 was written for a public repository of a personal account; the catalog lives in `open-mercato/modules`,
public since 28 Oct. These are settings of the repository and the organization. A person with admin rights makes
them; agents and workflows never change them. The one workflow call that touches Actions state is the keepalive of
`watch`, which calls `enable` only on workflows that are active or that GitHub turned off for inactivity, never on one
disabled by hand (see Stop the night).

State on 29 Oct (read with `gh api`): steps 1 to 4 and 8 are done, step 9 except three checks. `main` requires
`validate` and a code-owner review and blocks force pushes; the six labels exist; workflow permissions are read and
first-time contributors need approval; the environment `cloudflare` exists with deployment branches `main` only. Still
to do: step 5, the rest of step 6 (the `CLOUDFLARE_API_TOKEN` secret in `cloudflare`, the variable
`CLOUDFLARE_ACCOUNT_ID`, the `main` policy and the token of `mcp`, which GitHub created on the first `mcp-deploy` run of
25 Oct with no rules, then `MCP_URL` and `WEBMCP_OT_TOKENS`) and step 7. Until step 6 ends, `pages` ends green without
a deployment and `modules.openmercato.com` answers 404.

Before the repository is public (done):

1. Settings > Branches: protect `main`. Require the `validate` check (the job of that name in `validate.yml`), require
   a review from code owners, block force pushes. `data` stays unprotected (only the trusted jobs write it).
2. Labels: `new-entry`, `update`, `name-reviewed`, `curator`, `automated`, `discovery` (spec 5.6 item 7). The issue
   forms apply `new-entry`; `sync.yml` adds `discovery` to its issue once the label exists; `validate` reads
   `name-reviewed` from the PR when it runs (not from the event), so after adding it a curator re-runs the
   `validate` check of the PR.
3. Install the autofix.ci app on the repository (`autofix.yml` formats `modules/**` in PRs). The `autofix` job is
   skipped while the repository is private (the action fetches without credentials, which a private repository
   refuses). On the public repository it runs: in PR #4 it pushed the formatted descriptor to the fork.
4. Settings > Actions > General: require approval for first-time contributors; workflow permissions: read.

At the switch to the public address (Cloudflare Pages at `modules.openmercato.com`, Piotr and owner decision A(a) of
28 Oct; GitHub Pages is not used):

5. Devops, in the Cloudflare account:
   1. Create the Pages project `open-mercato-modules` for direct upload, production branch `main`:
      `npx wrangler pages project create open-mercato-modules --production-branch main`, or Workers & Pages > Create >
      Pages > Upload assets. Another name works when the repo variable `CF_PAGES_PROJECT` names it.
   2. Create an API token (My Profile > API Tokens > Create Custom Token) with Account > Cloudflare Pages > Edit on
      this account only. Note the account ID.
   3. In the project: Custom domains > Set up a custom domain > `modules.openmercato.com`. Cloudflare adds the DNS
      record by itself only when the `openmercato.com` zone is on the same Cloudflare account as the Pages project.
      Otherwise add by hand a CNAME `modules` -> `<project>.pages.dev` (the `*.pages.dev` name the project shows,
      `open-mercato-modules.pages.dev` when the name is free) at the DNS provider of the zone; it replaces the
      `*.openmercato.com` wildcard for this name. Wait for the domain to show Active.
6. Settings > Environments: create `cloudflare` with deployment branches `main` only, then add the secret
   `CLOUDFLARE_API_TOKEN` from step 5. Then add the account ID as the repository variable `CLOUDFLARE_ACCOUNT_ID`
   (Settings > Secrets and variables > Actions > Variables; an account ID is not a secret). `pages.yml` and
   `mcp-deploy.yml` both read this variable, not a secret and not an environment variable. In `pages.yml` it is also
   the switch: the `build` job has no environment and cannot see the token, so it hands the site to the `deploy` job
   (environment `cloudflare`) only when the variable is set. Add it last: with the variable and no token, `deploy`
   fails red. `mcp` exists already: set its deployment branch policy to `main` the same way before adding its own
   `CLOUDFLARE_API_TOKEN` (spec 5.6 item 6). Repo variables: `MCP_URL` after the Worker deploy
   (D-OPEN-1) and the WebMCP origin trial tokens in `WEBMCP_OT_TOKENS` (spec 5.6 item 8). `SITE_URL`, `BASE_PATH`
   and `HOME_PATH` stay unset until the move under `www.openmercato.com/run` (its own section below): `pages.yml`
   defaults to `https://modules.openmercato.com`, `/` and `/`.
7. A second curator in `.github/CODEOWNERS` (D-OPEN-5): with one code owner a required code-owner review adds nothing.
8. Make the repository public. `pages.yml`, and the scheduled `watch`, `sync` and nightly runs, start on their own from
   then on (while the repository is private `pages` is skipped and the others run only by hand, for Actions minutes).
   Run `pages` once by hand (Actions > pages > Run workflow). Its summary says `Site deployed` with the deployment
   URL; without the `CLOUDFLARE_ACCOUNT_ID` variable it ends green with the warning `pages not deployed` and records
   no deployment. Then every push to `main`, every data refresh (`watch`, `sync`, `collect`) and the daily 05:47 UTC
   run deploy by themselves. `modules.openmercato.com` answers already from the wildcard on the Traefik host, so
   "answers" is not the test. The test is the first line of `https://modules.openmercato.com/llms.txt`, which must be
   `# Open Mercato Modules`.
9. Right after the repository is public: test the fork path, which the private repository cannot test (forking is off
   there). From a fork, open a pull request with one new valid descriptor and one broken one. Check that the
   `validate` summary appears within 3 minutes and reads the data branch (Fit is not skipped), that `checks` and
   `build` are green for the valid file alone, that `autofix` runs, that a typosquat error goes away after a curator
   adds `name-reviewed` and re-runs `validate`, that the first-time contributor approval of step 4 holds the run until
   approved, and that `yarn om triage` lists the pull request with the right verdict. Close it and write the run ids
   into the report. Done on 28 Oct in PR #4 (from a fork, closed unmerged): `validate` read the data branch (Fit ran),
   failed the broken entry with three schema errors and passed the other; `autofix` pushed the formatted file to the
   fork; `checks` and `build` passed. Runs: `validate` 40723885237, `autofix.ci` 40723763547 and 40723885267. Not
   covered: the first-time contributor approval (the fork belongs to a repository admin), and the report does not
   mention the typosquat error with `name-reviewed` or `yarn om triage`. Check those three with the first outside pull
   request.

## templates.openmercato.com (decision of 29 Oct)

`templates.openmercato.com` is a second custom domain of the same Pages project, `open-mercato-modules`. Its root
answers a 302 to `https://modules.openmercato.com/templates`, the canonical address of the section; every other path
serves the same site as `modules.openmercato.com`, which is never redirected. The target is on the modules host
because the Modules row of the Run menu and "Browse modules" link to `/`: on the templates host they would land on its
root and come straight back to the section. The redirect ships in this repository: `functions/_middleware.ts` (logic
in `lib/core/site-host.ts` and `lib/core/templates-host.ts`) runs on `/` only, because `site/public/_routes.json`
limits Functions to that path, and `pages.yml` deploys it with the site. Canonical links of every page, `/templates`
included, stay on `SITE_URL` (`modules.openmercato.com`), so search engines see one copy and the sitemap and
`llms.txt` keep one origin. The redirect target follows `SITE_URL` and `BASE_PATH`: `yarn om pages-site` writes them
into `functions/site.ts` in both jobs of `pages.yml`, so after the move the templates root leads to
`https://www.openmercato.com/run/templates`.

Devops (Dominik), in the Cloudflare account, after the site deploys (steps 5 and 6 above):

1. Pages project `open-mercato-modules` > Custom domains > Set up a custom domain > `templates.openmercato.com`.
2. DNS: Cloudflare adds the record by itself when the `openmercato.com` zone is on the same account. Otherwise add a
   CNAME `templates` -> `open-mercato-modules.pages.dev` (the `*.pages.dev` name the project shows) at the DNS provider
   of the zone; it replaces the `*.openmercato.com` wildcard for this name. Wait for the domain to show Active.

Nothing changes in the repository: no variable, no `SITE_URL`. To verify:

```sh
curl -sI https://templates.openmercato.com/ | grep -iE '^(HTTP|location)'
# HTTP/2 302 and location: https://modules.openmercato.com/templates
curl -s https://modules.openmercato.com/templates | grep -o 'data-templates-state="coming-soon"'
curl -s https://modules.openmercato.com/templates | grep -o '<link rel="canonical" href="[^"]*"'
# href="https://modules.openmercato.com/templates"
curl -sI https://modules.openmercato.com/ | grep -iE '^(HTTP|location)'
# HTTP/2 200 and no location
```

A 200 with the home page on the templates root means the deployment has no Functions: check that the `deploy` job ran
from the repository root and that the `Check Pages Functions` step of `build` passed. If Functions must be turned off,
the same redirect can be a Single Redirect rule of the zone (Rules > Redirect Rules: hostname equals
`templates.openmercato.com` and URI path equals `/`, static target `https://modules.openmercato.com/templates`, 302).

## Move under www.openmercato.com/run (decisions of 13 and 14 Nov)

The catalog moves from `https://modules.openmercato.com` to the main site, as its **Run** section:

| Page                              | Address on `www.openmercato.com`                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modules (the home of the catalog) | `/run/modules`                                                                                                                                                                                    |
| Templates                         | `/run/templates`                                                                                                                                                                                  |
| Compatibility                     | `/run/compat`                                                                                                                                                                                     |
| Radar                             | `/run/radar`                                                                                                                                                                                      |
| Quality                           | `/run/quality`                                                                                                                                                                                    |
| For agents                        | `/run/for-agents`                                                                                                                                                                                 |
| Everything else                   | under `/run/` with today's paths: `/run/m/...`, `/run/c/...`, `/run/t/...`, `/run/built-in`, `/run/submit`, `/run/about`, `/run/r/...`, the data files, `/run/llms.txt`, `/run/sitemap-index.xml` |
| `/run` and `/run/`                | no page: a 302 to `/run/modules`                                                                                                                                                                  |

The main site (Webflow behind Cloudflare; the apex answers a 301 to `www`) passes `/run` and `/run/*` to the Pages
project `open-mercato-modules`, which stays the source server. Three repository variables switch the build; without
them everything stays as it is today.

What the repository does with `SITE_URL=https://www.openmercato.com`, `BASE_PATH=/run` and `HOME_PATH=/modules`:

- **Layout.** The build writes the site to `dist/run/` (pages, `_astro/`, `modules.json`, `llms.txt`, `.well-known/`,
  sitemap, `robots.txt`). The root of `dist` holds only `404.html` (a copy; Pages needs one at the top),
  `_routes.json`, `_redirects`, `schema/`, `templates.json`, `picker.json` and `modules.json` (copies, see Fixed
  addresses below). Pages serves the prefix itself, so the proxy never cuts it. A build empties only these names at
  the root of `dist` when it starts, and warns about anything else it finds there.
- **Home page.** `HOME_PATH` names the page of the catalog home under the base. The home page is one route injected at
  that path (`astro.config.ts`, `site/src/pages/_home.astro`), so the build writes `dist/run/modules.html` and no
  `dist/run/index.html`. Every link to the home page (`href('/')` in `site/src/lib/url.ts`: the Run menu, the
  breadcrumbs, "Browse modules"), its canonical URL, `og:url`, its sitemap entry and the feed link use
  `/run/modules`. The page `/run/modules` and the data file `/run/modules.json` are two files side by side
  (`modules.html`, `modules.json`); the layout check refuses a folder `dist/run/modules/`. `HOME_PATH` is one plain
  segment and needs a `BASE_PATH` other than `/`: at the domain root the redirect of the base would answer `/` of
  every host of the Pages project. With `HOME_PATH` unset the home page is the base (`/run/`).
- **The base.** `dist/_redirects` answers `/run` and `/run/` with a 302 to `/run/modules`, query kept. It is a static
  rule and not the Function: `_routes.json` keeps the whole base away from Functions, and the target is a path on the
  same host, so the rule holds behind the proxy, on the Pages hosts and on a `*.pages.dev` address alike.
- **Check.** `yarn om pages-site --check dist` proves the layout: root files, routes and redirects, the home page at
  its path and no page at the base, the root copies of `templates.json`, `picker.json` and `modules.json` equal to the
  site's, nothing else at the root, every link of every page under `/run` or absolute, no link to the bare base, the
  fixed schema `$id`, and the file rule of the old host: every published file of the build is one the rule serves, and
  the home file is the home page (by its canonical link). Both jobs of `pages.yml` run it.
- **Old addresses.** `dist/_routes.json` runs Functions on every path but `/run`, `/run/*` and the fixed addresses.
  `functions/_middleware.ts` answers each of them on the production hosts `modules.openmercato.com` and
  `templates.openmercato.com` by one rule (`hostRedirect`, `hostFile` and `isFilePath` in `lib/core/site-host.ts`):
  only pages move.
  - A **page** answers a 302: the root `modules.openmercato.com/` to `https://www.openmercato.com/run/modules`, every
    other page to the same path and query under `https://www.openmercato.com/run` (`/m/...`, `/templates`,
    `/submit?npm=<package>` as the Open Mercato docs link it). `templates.openmercato.com/` goes to
    `https://www.openmercato.com/run/templates`. Each redirect carries `Access-Control-Allow-Origin: *`.
  - A **machine-readable file** answers a 200 with the bytes of the same file under `/run`, no redirect, with
    `Access-Control-Allow-Origin: *`: `*.json`, `*.md`, `*.txt`, `*.svg`, `*.xml`, images, and everything under
    `/raw/`, `/badge/`, `/.well-known/` and `/schema/`. The Function asks the asset server of the project
    (`env.ASSETS`) for `/run<path>` and passes its answer on (status, `ETag`, `Cache-Control`, a 304 for a conditional
    request, a 404 for a file that does not exist). See Fixed addresses below for who needs this.
  - `robots.txt` is such a file: the old host answers the site's own `robots.txt`, which allows everything and names
    `https://www.openmercato.com/run/sitemap-index.xml`, so crawlers keep reading the old host, meet the 302 of each
    page and learn the new sitemap. The **sitemaps** (`/sitemap-index.xml`, `/sitemap-0.xml`, `/sitemap.xml`) are the
    exception among the files and move with a 302 like pages: they list addresses of `www.openmercato.com`, and a
    sitemap counts only for the host that serves it.
  - A path under `/run`, a fixed address and a request that carries the `www` host are never touched (no loop); a path
    with `//` at the start, a backslash or a control character is neither redirected nor served (no open redirect).
    Any other host (local `wrangler pages dev`) gets no answer from the Function.

  The Functions read the layout from `functions/site.ts`, which `yarn om pages-site` writes from the same three
  variables in the build job and again in the deploy job (the committed copy is the default). `yarn om pages-site`
  refuses a `SITE_URL` on a host of the Pages project (a custom domain or a `*.pages.dev` address) together with a
  `BASE_PATH` other than `/`: requests that carry the site host are never redirected, so the old addresses there would
  answer 404.

- **Preview before the switch.** A deployment address (`<hash>.open-mercato-modules.pages.dev`, and the project's
  `open-mercato-modules.pages.dev`) is not redirected to production: it serves the site at `/run/`, its root
  answers a 302 to `/run/modules` on the same host, and a file of the old addresses (`/llms.txt`,
  `/m/<package>.md`) answers there as on the old host, so the file rule can be checked too. The `pages` summary and the `cloudflare` environment link to
  `<deployment address>/run/modules`. Links and copy commands on such a page point to the preview host (the page
  script, `site/src/lib/here.ts`), so the new version can be checked end to end before the proxy or the variables
  change.
- **302, not 301,** while the move is new: rollback is removing three variables, and a 301 cached in browsers would
  keep sending people to an address that then serves nothing. Once the new address is settled, set `MOVED_STATUS` in
  `lib/core/site-host.ts` to 301 (it is also the status of the `/run` rule in `_redirects`).
- **Schemas.** The `$id` of every published schema, the `$schema` of `modules.json` and every schema link on the pages
  stay `https://modules.openmercato.com/schema/<name>-1.json` (`SCHEMA_ORIGIN` in `lib/core/home.ts`):
  create-mercato-template writes that address. The Pages project serves `dist/schema/` there without a redirect.
  `dist/run/schema/` keeps a copy for the WebMCP script, which fetches `tools-1.json` from its own origin.

To look at the layout on a workstation, without Cloudflare (the Pages emulator of the locked wrangler reads
`dist/_redirects`, `dist/_routes.json` and `functions/`):

```sh
SITE_URL=https://www.openmercato.com BASE_PATH=/run HOME_PATH=/modules yarn build:run
rm -rf dist && mv dist-run dist
SITE_URL=https://www.openmercato.com BASE_PATH=/run HOME_PATH=/modules yarn om pages-site
yarn wrangler pages dev dist --port 8788
curl -sI http://127.0.0.1:8788/run | grep -iE '^(HTTP|location)'
# 302 and location: /run/modules
curl -sI -H 'Host: modules.openmercato.com' 'http://127.0.0.1:8788/submit?npm=x' | grep -iE '^(HTTP|location)'
# 302 and location: https://www.openmercato.com/run/submit?npm=x
git checkout functions/site.ts
```

### Navbar and footer: a copy of the main site's (14 Nov)

A visitor under `/run` must not feel they left `www.openmercato.com`, so the catalog has no header of its own.
`site/src/components/Header.astro` is a copy of the Webflow navbar of the main site (its `navbar_*` classes, sizes,
colours, breakpoints and phone menu), with one menu the main site gets too: **Run**, after Enterprise, with Modules,
Templates, Compatibility, Radar, Quality and For agents. Panels open on hover and keyboard focus without JavaScript;
the phone menu is a `<details>`. The GitHub button runs the main site's star count script with the same
`localStorage` key, so both share the count on one origin, with one difference: the catalog asks `api.github.com` at
the visitor's first press, key, wheel or touch and not while the page loads, to keep a page load free of third-party
requests (spec 7.11). `site/src/components/Footer.astro` is the main site's
footer in the same way. The data stamp and Submit a module sit in a line at the top of each page
(`PageContext.astro`), and the data provenance on `/about`.

When the menu or the footer changes on Webflow (an item, a description, an address, an icon), change the catalog to
match in the same week: the items, texts and addresses are in `lib/core/main-site.ts` (`MAIN_SITE_MENUS`,
`MAIN_SITE_LINKS`, `RUN_MENU`, `MAIN_SITE_FOOTER`, `MAIN_SITE_FOOTER_OTHER`), the icons in
`site/src/components/nav-icons.ts`. The layout check accepts exactly the main-site addresses listed there, so a link to
a new page of the main site that is not in the file fails `yarn om pages-site --check`. The Run menu on Webflow itself
is added by hand by whoever edits the main site, from a note with the labels, texts, addresses (the table above) and
icons. Until it is there, the main site's own pages show no way into the Run section.

### Files on modules.openmercato.com

Released tools, generated apps and READMEs have addresses of the old host written into them, and most of them do not
follow redirects. So after the move the old host keeps answering every machine-readable file with a 200 and the same
bytes as under `/run` (the file rule above). Known readers:

- `https://modules.openmercato.com/llms.txt`, `/raw/modules.md` and `/m/<package>.md`: the `om-find-module` skill
  shipped inside generated apps (open-mercato/open-mercato,
  `packages/create-app/agentic/shared/ai/skills/om-find-module/SKILL.md`) runs `curl -s` without `-L`. Apps that
  already exist cannot be updated.
- `https://modules.openmercato.com/badge/<package>.svg`: embedded in module READMEs (create-mercato-module,
  `docs/guide.md`) and shown by npm and GitHub.
- `https://modules.openmercato.com/modules.json`: read by `mercato module search` of released `@open-mercato/cli`
  versions (`DEFAULT_MODULES_INDEX_URL` in `packages/cli/src/lib/module-search.ts` of open-mercato/open-mercato).
- `https://modules.openmercato.com/templates.json`: read by `create-mercato-app --template` in released versions.
- `https://modules.openmercato.com/picker.json`: read by the module picker of released create-mercato-app versions.
- `https://modules.openmercato.com/schema/<name>-1.json`: the `$id` of every published schema, written into the files
  create-mercato-template creates.
- `https://modules.openmercato.com/built-in.json`: `BUILTIN_INDEX_URL` of the MCP Worker (`mcp/wrangler.toml`), next
  to `MODULES_INDEX_URL`.

Two mechanisms answer them. `schema/`, `templates.json`, `picker.json` and `modules.json` are **static copies** at the
root of `dist` (`SCHEMA_DIR` and `FIXED_ROOT_FILES` in `lib/core/site-host.ts`): the build copies them from
`dist/run/`, `dist/_routes.json` keeps them away from Functions, so they cost no Function invocation and answer even
when the Functions quota of the day is spent. **Every other file** is answered by the Function from `dist/run/`
(`hostFile`), with no list to keep: a new data file of the site is served on the old host from the build that first
publishes it. A file of a new kind (an extension outside `isFilePath`) fails `yarn om pages-site --check`, so the rule
cannot fall behind the build.

So `modules.openmercato.com` must stay a custom domain of the Pages project `open-mercato-modules` after the move,
with its DNS record, even when no page is served there. The addresses under `/run` are the ones for new releases.

### Contract for the proxy of the main site

1. Route `www.openmercato.com/run` and `www.openmercato.com/run/*` to `https://modules.openmercato.com` (or the
   project's `open-mercato-modules.pages.dev` name) with the same path and query. Do not cut `/run`: the Pages
   project serves the site under that prefix. Do not send any other path there. [docs/proxy/](proxy/README.md) holds a
   Worker that does items 1 to 3, with a `curl` check of the result.
2. Pass the answer through as it is: status, `Location` (the source answers redirects such as `/run` to
   `/run/modules` and `/run/sitemap.xml` to `/run/sitemap-index.xml` with paths on the same host), `Content-Type`,
   `Cache-Control`, `ETag` and `Access-Control-Allow-Origin` (the source sends `*` on every file, so other sites and
   web tools can fetch `modules.json` and the other data files). Do not follow redirects in the proxy, and do not
   override the cache: no cache rule with its own edge or browser TTL for `/run`. The data changes several times a
   day.
3. Optional, for people who type the short address: `www.openmercato.com/modules` redirects to
   `https://www.openmercato.com/run/modules` and `www.openmercato.com/templates` to
   `https://www.openmercato.com/run/templates` (zone redirect rules on the main site). The catalog works without them.
4. Add this line to `https://www.openmercato.com/robots.txt`, and keep `/run` allowed there:
   `Sitemap: https://www.openmercato.com/run/sitemap-index.xml`. Crawlers read only the robots.txt at the domain
   root; the catalog's own `/run/robots.txt` is not read.
5. Turn Cloudflare Email Obfuscation off for `/run` (a configuration rule on URI path starts with `/run`):
   `package@version` reads as an e-mail address to it (live review of 30 Oct).
6. `/.well-known/` and `/llms.txt` at the domain root belong to the main site. The catalog publishes its own under the
   prefix: `/run/llms.txt`, `/run/.well-known/agent-skills/index.json` and, once the MCP Worker is deployed,
   `/run/.well-known/mcp/server-card.json`. Tools that look only at the domain root will not find them unless the
   main site links or redirects to them; the catalog works without that.
7. Add the Run menu to the navbar of the main site in Webflow (see Navbar and footer above), with the addresses of the
   table at the top of this section.

### Preview of the /run layout (15 Nov)

While production is at the root, every `pages` run on `main` also builds the nested layout with fixed values
(`SITE_URL=https://www.openmercato.com`, `BASE_PATH=/run`, `HOME_PATH=/modules`) and deploys it to the branch
`run-preview` of the same Pages project: the jobs `preview-build` and `preview` of `pages.yml`. Cloudflare serves the
latest deployment of a branch at its alias, the branch name in lowercase with every character but `a-z`, `0-9` and `-`
turned into `-`. So the preview is `https://run-preview.open-mercato-modules.pages.dev`, its home page
`https://run-preview.open-mercato-modules.pages.dev/run/modules`. It is a `*.pages.dev` address, so nothing there is
sent to production (Preview before the switch, above): its root answers a 302 to `/run/modules` on the same host. This
is the upstream to test the proxy of the main site against ([docs/proxy/README.md](proxy/README.md)).

- **Beside production.** `deploy` needs nothing from the preview jobs, so a red preview never fails or skips the
  production deploy; the run shows the red job. The preview uses the same guards as production (the repository is
  public, `CLOUDFLARE_ACCOUNT_ID` is set, environment `cloudflare` has the token) and records its deployment in
  `cloudflare` too, linked to the preview home page. The summary of the `preview` job names both addresses.
- **Not for search engines.** The preview jobs set `PAGES_NOINDEX=1`: the build writes `dist/_headers`, which sends
  `X-Robots-Tag: noindex` with every static file, and a `/run/robots.txt` of `Disallow: /` without a sitemap (the
  alias answers `/robots.txt` with it too). `yarn om pages-site --check dist` with `PAGES_NOINDEX=1` checks both files,
  without it the check refuses a `_headers`, and a production build removes one left in `dist`. The canonical links
  name `https://www.openmercato.com/run/...`, as production will after the switch.
- **Off after the switch.** Both jobs are skipped once the repository variable `BASE_PATH` is set to anything but `/`:
  production then serves the same layout. The alias keeps its last deployment.
- **Access.** If Cloudflare Access is turned on for the preview deployments of the project, the alias asks for a login
  and the proxy cannot read it. Keep it off for this project while the proxy is tested.
- **Check.** `docs/proxy/check.sh https://run-preview.open-mercato-modules.pages.dev` prints pass or fail per line.
  On a workstation: the commands of the section above with `PAGES_NOINDEX=1` added to each, then
  `docs/proxy/check.sh http://127.0.0.1:8788`.

### Preview of the main site (www-preview)

The main site moves off Webflow into `www/` of this repository (spec
[docs/specs/2026-11-24-www-site-migration.md](specs/2026-11-24-www-site-migration.md), on its own branch until it
merges). `yarn build` writes two builds: the catalog to `dist-run/` (`yarn build:run`) and the main site to
`dist-www/` (`yarn build:www`). The upload is one of two layouts:

- **Catalog only** (production today, and the `run-preview` jobs): `dist-run/` moved to `dist/` as it is.
- **Merged** (`PAGES_MERGED=1`): `yarn om pages-site --merge` lays `dist-www/` at the root of `dist/` and the catalog's
  nested build under `/run`, and writes the root `_redirects` (the main site's `/sitemap.xml`, the catalog's
  rules, then the main site's `www/content/redirects.yaml`), `robots.txt` and a `sitemap-index.xml` that lists the main site's sitemap files and the catalog's. The
  catalog's `_routes.json`, `schema/` and fixed root files stay until its Functions leave (Phase 1c of the spec).
  `yarn om pages-site` writes `merged: true` into `functions/site.ts`, so a `*.pages.dev` address serves every path
  as a static file; the old hosts are moved as before. `yarn om pages-site --check dist` with `PAGES_MERGED=1` proves
  the merged layout and checks every link of every page against what this build serves. In the noindex preview a
  header or footer link to a page only Webflow serves yet is allowed and counted; in a production upload it fails the
  check, so `PAGES_MERGED=1` cannot reach production before the main site has every page the menus link.

Every `pages` run on `main` deploys the merged layout to the branch `www-preview` of the same project (jobs
`www-preview-build` and `www-preview`), `https://www-preview.open-mercato-modules.pages.dev/`, with `PAGES_NOINDEX=1`
(`dist/_headers` and a `robots.txt` of `Disallow: /` at the root and under `/run`), beside production with the same
guards. Production deploys the merged layout only when the repository variable `PAGES_MERGED` is `1`, which is step
C8 of the spec, not before; unset, the production upload is byte for byte what it was before the main site existed.

On a workstation:

```sh
export SITE_URL=https://www.openmercato.com BASE_PATH=/run HOME_PATH=/modules PAGES_MERGED=1 PAGES_NOINDEX=1
yarn build && yarn om pages-site --merge && yarn om pages-site && yarn om pages-site --check dist
yarn wrangler pages dev dist --port 8788
git checkout functions/site.ts
```

### Switch, in order

Each step waits for the one before it to be green.

1. **Preview green.** The `preview-build` and `preview` jobs of the latest `pages` run on `main` are green, and
   `docs/proxy/check.sh https://run-preview.open-mercato-modules.pages.dev` ends with `0 failed` (Preview of the /run
   layout, above).
2. **Proxy against the preview.** The proxy of the main site goes live with the contract above, its upstream the
   preview ([docs/proxy/README.md](proxy/README.md), Deploy against the preview). Then
   `docs/proxy/check.sh https://www.openmercato.com` ends with `0 failed`. Its answers carry `noindex` while they come
   from the preview.
3. **Run menu.** The Run item in the Webflow navbar of the main site (item 7 of the contract, and Navbar and footer
   above).
4. **Repository variables and a `pages` run.** Settings > Secrets and variables > Actions > Variables: `SITE_URL` =
   `https://www.openmercato.com`, `BASE_PATH` = `/run`, `HOME_PATH` = `/modules`. Set all three before the run:
   `SITE_URL` and `BASE_PATH` without `HOME_PATH` build a working site whose home page is `/run/`. Then run `pages` by
   hand (Actions > pages > Run workflow). `Check artifact contents` and `Check downloaded site` run
   `yarn om pages-site --check dist` for the new layout; the summary names `https://www.openmercato.com/run/modules`.
   The preview jobs are skipped from this run on. Until step 5 the proxy still reads the preview, which has the same
   layout, so nothing breaks in between.
5. **Proxy to production.** Right after the run of step 4, the proxy's upstream becomes
   `https://open-mercato-modules.pages.dev` ([docs/proxy/README.md](proxy/README.md), Switch day).
   `docs/proxy/check.sh https://www.openmercato.com` ends with `0 failed` and shows no `noindex`. Then the old hosts:

   ```sh
   curl -sI https://modules.openmercato.com/ | grep -iE '^(HTTP|location)'
   # 302 and location: https://www.openmercato.com/run/modules
   curl -sI https://modules.openmercato.com/m/@open-mercato/gateway-tpay | grep -iE '^(HTTP|location)'
   # 302 and location: https://www.openmercato.com/run/m/@open-mercato/gateway-tpay
   curl -sI 'https://modules.openmercato.com/submit?npm=@open-mercato/gateway-tpay' | grep -iE '^(HTTP|location)'
   # 302 and location: https://www.openmercato.com/run/submit?npm=@open-mercato/gateway-tpay
   curl -sI -H 'Origin: https://example.com' https://modules.openmercato.com/compat | grep -i '^access-control'
   # access-control-allow-origin: * on the 302
   for p in llms.txt raw/modules.md m/@open-mercato/gateway-tpay.md badge/@open-mercato/gateway-tpay.svg built-in.json robots.txt; do
     curl -s -o /dev/null -w "%{http_code} $p\n" "https://modules.openmercato.com/$p"
   done
   # 200 for each, no redirect: the old host serves the files itself
   diff <(curl -s https://modules.openmercato.com/llms.txt) <(curl -s https://www.openmercato.com/run/llms.txt) && echo same
   # same
   curl -sI https://modules.openmercato.com/sitemap-index.xml | grep -iE '^(HTTP|location)'
   # 302 and location: https://www.openmercato.com/run/sitemap-index.xml
   curl -sI -H 'Origin: https://example.com' https://www.openmercato.com/run/modules.json | grep -i '^access-control'
   # access-control-allow-origin: * through the proxy
   curl -sI https://templates.openmercato.com/ | grep -iE '^(HTTP|location)'
   # 302 and location: https://www.openmercato.com/run/templates
   curl -s https://modules.openmercato.com/schema/modules-1.json | grep '"\$id"'
   # "$id": "https://modules.openmercato.com/schema/modules-1.json", with a 200 and no redirect
   curl -sI https://modules.openmercato.com/templates.json | grep -iE '^(HTTP|location)'
   curl -sI https://modules.openmercato.com/picker.json | grep -iE '^(HTTP|location)'
   curl -sI https://modules.openmercato.com/modules.json | grep -iE '^(HTTP|location)'
   # HTTP/2 200 and no location, for all three
   ```

6. **The main site.** The robots.txt line (item 4 of the contract), the optional `/modules` and `/templates` redirects
   (`SHORT_REDIRECTS` of the proxy, or zone redirect rules) and the sitemap in Search Console.
7. **Links to `/run`.** Only now the pull requests of other repositories that point their links at
   `https://www.openmercato.com/run/...` (the Open Mercato docs, create-mercato-app, create-mercato-module) are ready
   to merge: before step 5 those links would reach the preview. In this repository, change the addresses that still
   name `modules.openmercato.com` for the site (pages work through the 302, files are served there as before; the new
   addresses are the ones to publish):
   - `mcp/wrangler.toml`: `BUILTIN_INDEX_URL` to `https://www.openmercato.com/run/built-in.json` and
     `MODULES_INDEX_URL` to `https://www.openmercato.com/run/modules.json`, then deploy the Worker. Both keep working
     before that: the old host serves both files.
   - `README.md`, `CONTRIBUTING.md` and `docs/DEMO.md`: the site address, to `https://www.openmercato.com/run/modules`
     for the catalog and `https://www.openmercato.com/run/submit` for the form.
   - `.github/ISSUE_TEMPLATE/config.yml`: the `/submit` link, to `https://www.openmercato.com/run/submit`.
   - The WebMCP origin trial: the token is bound to the origin of the page, so `WEBMCP_OT_TOKENS` needs an entry for
     `https://www.openmercato.com` (register the trial for that origin). The entry for
     `https://modules.openmercato.com` no longer matches a page and can go. Without the new entry the pages render
     without the token and the WebMCP tools are not registered; nothing else changes.
   - Leave every `/schema/` address as it is. The skill `skills/om-find-module/SKILL.md` needs no change on the day:
     the files it reads (`/llms.txt`, `/raw/modules.md`, `/m/<package>.md`) answer a 200 on the old host, with or
     without `-L`. The same holds for the copies inside generated apps and installed plugins, which run `curl -s`.
8. Later, once settled: `MOVED_STATUS` to 301.

### Rollback

Delete the repository variables `SITE_URL`, `BASE_PATH` and `HOME_PATH` and run `pages` by hand. The build returns to
the domain root, `functions/site.ts` to the default and Functions to `/` only, so `modules.openmercato.com` serves the
site again. The 302s were not cached. Then take the `/run` route off the proxy of the main site, or point it at a
redirect to `https://modules.openmercato.com` with the prefix cut (and `/run/modules` to its root). The preview jobs
run again from the next `pages` run, so the proxy can also go back to the preview upstream
([docs/proxy/README.md](proxy/README.md), Roll back).

### Old hosts on a Worker (www migration Phase 1b)

Once the main site sits at the root of the Pages project, the root `/` of the project cannot be both the main home
page and the 302 of `modules.openmercato.com`, so the old hosts leave the Functions for a Worker of their own (spec
[docs/specs/2026-11-24-www-site-migration.md](specs/2026-11-24-www-site-migration.md), Option B). `workers/old-hosts/`
is that Worker, ready to deploy, not deployed from this repository. It runs the rules of `lib/core/site-host.ts` that
the Functions run today (Old addresses, above), on the routes `modules.openmercato.com/*` and
`templates.openmercato.com/*`:

- A page answers a 302 to the same path and query under `https://www.openmercato.com/run`, the roots to
  `/run/modules` and `/run/templates`, with `Access-Control-Allow-Origin: *`.
- A machine-readable file answers a 200 with the bytes of `/run<path>` of the upstream, its status, `ETag`, cache
  headers and 304 as they come, plus the CORS header.
- The fixed addresses (`/schema/*`, `/templates.json`, `/picker.json`, `/modules.json`) answer the same way from
  `/run/...`, so Phase 1c can drop their root copies. Every `$id` stays `https://modules.openmercato.com/schema/...`.
- A path under `/run` is passed to the upstream as it is, redirects not followed. A path with `//` at the start, a
  backslash or a control character, and any other host, answer a 404 and fetch nothing.
- The upstream is the project's own address, `https://open-mercato-modules.pages.dev`, never `www`, so a rollback of
  the `www` record cannot break the old hosts. The Worker refuses an upstream on an old host or on `www` with a 502.

`test/workers/old-hosts.test.ts` checks every case of step 5 of Switch, in order, and of `docs/proxy/check.sh` on an
old host, and gives the same answer as `functions/_middleware.ts` path by path. The `checks` job of `validate` bundles
it with `wrangler deploy --dry-run`. This step removes nothing: the Functions, `_routes.json` and the fixed root
copies stay until Phase 1c, and answer again as soon as the Worker routes are gone.

**When.** After step 5 of Switch, in order, is green with the Functions: production serves `/run`, so the upstream
holds every file under `/run/`. Not before: at the domain root the upstream has no `/run/`.

**Before the deploy: the request count.** The Worker counts every request to the old hosts, the fixed files included,
which cost no invocation today. In the Cloudflare dashboard, zone `openmercato.com` > Analytics & Logs > HTTP Traffic,
last 30 days, filter Host equals `modules.openmercato.com`, then `templates.openmercato.com`: note the highest daily
count of each and add them. Workers & Pages > Plans shows the plan. On Workers Free the limit is 100,000 requests a day
for the whole account, shared with the other Workers and Pages Functions of the account (the `/run` proxy, the MCP
Worker): their highest day plus the old hosts' highest day must stay under 50,000 (a margin of 50%), else move to
Workers Paid before Phase 1c. Workers Paid has no daily limit.

**Deploy (owner).** On a workstation logged in to the Cloudflare account of the `openmercato.com` zone, from the
repository root:

```sh
yarn wrangler deploy --config workers/old-hosts/wrangler.toml
```

This creates the Worker `openmercato-old-hosts` with the two routes and four variables, all in
`workers/old-hosts/wrangler.toml`: `UPSTREAM` (`https://open-mercato-modules.pages.dev`), `SITE_URL`, `BASE_PATH` and
`HOME_PATH` (the values of the repository variables after the move). No secret, no DNS record: the routes run on the
existing records of the two hosts, which stay custom domains of the Pages project. No `*.workers.dev` address. On
Workers Free, set the request limit failure mode of both routes to Fail open (zone `openmercato.com` > Workers Routes,
edit each route): a request over the limit then reaches the Pages project directly. The limit is the same for the
Functions, so only static files answer there: `/run/*` and, until Phase 1c, the fixed root copies. Old page addresses
do not move and other files answer 404, and after Phase 1c the root is the main site's. Workers Paid is the protection,
not Fail open.

**Check.** The commands of step 5 of Switch, in order, each with the result it names, then:

```sh
docs/proxy/check.sh https://modules.openmercato.com
# 0 failed: /run on the old host passes through as before
curl -s https://modules.openmercato.com//x
# Not found. (the Worker's 404; the Functions answered the Pages 404 page)
```

A route change takes effect in seconds, so a failed check is undone by the rollback below. Phase 1c (no Functions in
the Pages project) merges only after these pass.

**Rollback.** Workers & Pages > `openmercato-old-hosts` > Settings > Domains & Routes: remove both routes (or
`yarn wrangler delete --name openmercato-old-hosts`). Until Phase 1c the Functions answer again from the next request.
After Phase 1c, first revert that pull request and run `pages`, then remove the routes.

## Main site switch (www migration, steps C1 to C10)

www.openmercato.com moves from Webflow to the merged layout of the Pages project `open-mercato-modules` (spec
[docs/specs/2026-11-24-www-site-migration.md](specs/2026-11-24-www-site-migration.md), Cutover). Each step waits for
the one before it. Webflow stays published and paid for 30 days after C8, so C10 can undo the switch.

**Tools.** `yarn om compare-live` requests every URL of a sitemap and every rule of `www/content/redirects.yaml` on a
reference and a candidate, without following redirects, at most 4 requests at a time, and compares the status class,
the redirect target, `<title>`, meta description, `h1`, the main text (navbar and footer removed, word similarity at
least 0.97), the image count, and canonical, `og:title`, `og:image` and JSON-LD on the candidate. A docs URL
(`/docs`, `/docs/*`, `/documentation`) must answer a 301 to docs.openmercato.com on the candidate, the target of the
docs map when it names one. It also checks that `https://openmercato.com/` answers a 301 to
`https://www.openmercato.com/`. It writes `out/compare-live/report.md` (counts per kind, every failure with its field,
every URL) and `out/compare-live/report.json` (a later run's `--baseline`), and exits 1 on any fail. `--planned <file>`
lists intended differences, a YAML list of `{ url, field, note }` (`url` a path, a trailing `*` matches a prefix;
`field` one of `status`, `redirect`, `title`, `description`, `h1`, `text`, `images`, `canonical`, `og:title`,
`og:image`, `json-ld`); any other difference fails.

**Redirects.** `www/content/redirects.yaml` holds the main site's 301s: the Webflow panel list (`source:
webflow-panel`, empty until C4), then the docs map (`source: docs-map`, written by
`yarn om import-webflow --only redirects`, with the `/docs/*` catch-all last). The www build validates the file and
writes its rules to `dist-www/_redirects`; `yarn om pages-site --merge` appends them to the root `_redirects` after the
merge's own rules (`/sitemap.xml`, the catalog's `/run` rules) and refuses a loop, a chain longer than one hop or a
source given twice. `yarn om pages-site --check dist` with `PAGES_MERGED=1` wants the root rules equal to the yaml of
the checkout, no loop or chain, no rule that hides a file of the upload, every target on the site a page or a file of
the build, and at most 1,800 static and 90 dynamic rules (Pages allows 2,000 and 100).

1. **C1 Freeze.** The team stops editing Webflow. From here every content change is a pull request on
   `www/content/**`, reviewed and merged by the owner of the main site's content (spec, D10). A post that must publish
   during the freeze is written in the repository.
2. **C2 The `/run` switch is done and stable** (Switch, in order, above, all 8 steps), and the old hosts run on their
   Worker with no Functions in the Pages project (Old hosts on a Worker, above, and Phase 1c of the spec). Check:

   ```sh
   docs/proxy/check.sh https://www.openmercato.com
   # 0 failed
   docs/proxy/check.sh https://modules.openmercato.com
   # 0 failed
   ```

3. **C3 Final export and delta (owner, on a workstation).** With the read-only token in `WEBFLOW_TOKEN`:

   ```sh
   yarn om webflow-export --dir ~/webflow-export-final
   yarn om import-webflow --export ~/webflow-export-final
   ```

   The export never enters the repository. `out/import-webflow/report.md` lists conflicts (files edited since the
   first import, kept unless `--force <path>` names them) and items gone from the export. Open one pull request with
   the changed files and the report's summary; it shows only what changed since the first import.

4. **C4 The Webflow 301 list (D8).** In Webflow, Site settings > Publishing > 301 redirects: copy every rule. Add each
   one to `www/content/redirects.yaml` right below the comment that marks `source: webflow-panel`, before the docs
   map, as:

   ```yaml
   - from: /old-path
     to: /new-path
     status: 301
     source: webflow-panel
   ```

   `to` is a path of the site or an `https://` address. A Webflow rule written with a trailing slash or a wildcard is
   written as Pages reads it (`/x/*` for a folder, `to` with `:splat`). Then, on Cezar (AGENTS.md rule 5: site builds
   run there, not on the owner's Mac):

   ```sh
   export SITE_URL=https://www.openmercato.com BASE_PATH=/run HOME_PATH=/modules PAGES_MERGED=1 PAGES_NOINDEX=1
   yarn build && yarn om pages-site --merge && yarn om pages-site && yarn om pages-site --check dist
   git checkout functions/site.ts
   ```

   The merge names every loop and every chain (a target that is itself redirected: point the rule at the last
   target); the check names every target that is not a page of the build. Open a pull request with the file.
   `yarn om import-webflow` keeps these rules on every later run.

5. **C5 Preview.** The `pages` run of that merge deploys `https://www-preview.open-mercato-modules.pages.dev/`. Check
   that it is not indexed:

   ```sh
   curl -sI https://www-preview.open-mercato-modules.pages.dev/ | grep -i '^x-robots-tag'
   # x-robots-tag: noindex
   ```

6. **C6 Compare.** Keep the Webflow sitemap (after C8 `/sitemap.xml` redirects to the new index), then compare:

   ```sh
   curl -s https://www.openmercato.com/sitemap.xml -o ~/webflow-sitemap.xml
   yarn om compare-live --live https://www.openmercato.com \
     --candidate https://www-preview.open-mercato-modules.pages.dev \
     --urls ~/webflow-sitemap.xml --redirects www/content/redirects.yaml --planned www/compare-live-planned.yaml
   cp out/compare-live/report.json ~/compare-live-c6.json
   ```

   Pass: `0 failed`. Each intended difference (the four new descriptions, token-filled numbers, replaced dashes, and
   the template parts decided in Phase 5 with the designer) is in `www/compare-live-planned.yaml`, committed, one entry
   per URL and field with its reason; anything else is fixed in a pull request and C6 runs again. Keep
   `~/compare-live-c6.json` for C8. Then a person compares every page template side by side on desktop and phone: one
   landing per kind, the Polish landing, each unique page, one detail page per collection, the lists with their
   filters, and the 404. The designer signs off the design.

7. **C7 Apex.** Find out who answers `https://openmercato.com/` today:

   ```sh
   curl -sI https://openmercato.com/ | grep -iE '^(HTTP|location|server)'
   ```

   If Cloudflare > zone `openmercato.com` > Rules > Redirect Rules has no rule for the apex, the 301 comes from
   Webflow and stops with the switch. Then, before C8 and in this order: (1) add a single redirect rule: hostname
   equals `openmercato.com`, dynamic target `concat("https://www.openmercato.com", http.request.uri.path)`, status
   301, preserve the query string; (2) a Cloudflare rule runs only on a proxied record, so if the apex records (DNS,
   name `openmercato.com`) point at Webflow DNS only, replace them with one proxied placeholder `A 192.0.2.1`; with
   the rule already in place the apex keeps answering the 301. Check with
   `curl -sI https://openmercato.com/ | grep -iE '^(HTTP|location)'`. Pass: the apex line of the C6 report reads
   `pass` (run C6 again after a change).

8. **C8 Switch.** In order:
   1. Settings > Secrets and variables > Actions > Variables: `PAGES_MERGED` = `1`. Run `pages` by hand. The
      production checks run `yarn om pages-site --check dist` on the merged layout, where every page the menus link
      must be in the build. Then `https://open-mercato-modules.pages.dev/` is the main site and
      `https://open-mercato-modules.pages.dev/run/modules` the catalog; www still shows Webflow.
   2. Write down the current `www` record (Cloudflare > zone `openmercato.com` > DNS, its type, target and proxy status) for C10.
   3. Workers & Pages > `open-mercato-modules` > Custom domains > Set up a custom domain: `www.openmercato.com`.
      Cloudflare repoints the `www` record from Webflow to the project. Wait until the domain shows Active.
   4. Remove the Worker route `www.openmercato.com/run*` of the `/run` proxy (Workers & Pages >
      `openmercato-run-proxy` > Settings > Domains & Routes). Until it is removed it proxies `/run` to the same
      project, so the order is safe.
   5. Compare against the C6 snapshot of the preview, then the checks of the old hosts and of `/run`:

      ```sh
      yarn om compare-live --baseline ~/compare-live-c6.json --candidate https://www.openmercato.com \
        --urls ~/webflow-sitemap.xml --redirects www/content/redirects.yaml --planned www/compare-live-planned.yaml
      docs/proxy/check.sh https://www.openmercato.com
      curl -sI https://www.openmercato.com/ | grep -i '^x-robots-tag'
      # nothing: production is indexed
      curl -s https://www.openmercato.com/robots.txt
      # User-agent: *, Allow: / and Sitemap: https://www.openmercato.com/sitemap-index.xml
      ```

      and the commands of step 5 of Switch, in order, above. Pass: `0 failed` and every result as named. Note the
      date and time: C10 lists the pull requests merged since.
9. **C9 After.** Search Console, property www.openmercato.com: submit `https://www.openmercato.com/sitemap-index.xml`.
   The owner of the automation that writes docs into the Webflow `docs` collection turns it off (spec, Q1). Webflow
   stays published and paid for 30 days. For 14 days, daily: Search Console, Pages, the counts of "Not found (404)" and
   "Page with redirect". Roll back (C10) when more than 10 new 404s are not in `~/webflow-sitemap.xml`, or the indexed
   pages fall by more than 10% against the day before C8.

**C10 Rollback** (within the 30 days; target 30 minutes):

In this order, so `www` always has an answer:

1. Restore the Worker route `www.openmercato.com/run*` of the `/run` proxy, its upstream
   `https://open-mercato-modules.pages.dev` ([docs/proxy/README.md](proxy/README.md), Switch day). While www is on
   the project the route sends `/run` to the same project, so nothing changes yet.
2. Cloudflare > zone `openmercato.com` > DNS: point the `www` record back to the Webflow target, with the type and
   proxy status written down at C8. The domain stays attached in Webflow for the 30 days, so Webflow answers again.
3. Workers & Pages > `open-mercato-modules` > Custom domains: remove `www.openmercato.com`. If the dashboard offers
   to delete the DNS record with it, keep the record (it now points at Webflow).
4. Check: `docs/proxy/check.sh https://www.openmercato.com` ends with `0 failed`, and
   `curl -sI https://www.openmercato.com/ | grep -iE '^(HTTP|server)'` names Webflow again.

The old hosts are not affected: their Worker reads the `pages.dev` address. `PAGES_MERGED` can stay `1`; nothing
serves the root of the project then. Webflow has no docs map, so `/docs/*` answers as before the switch. Content and
redirects merged in the repository since C8 are copied to Webflow by hand; list them with:

```sh
gh pr list --state merged --search "merged:>=YYYY-MM-DD" --json number,title,files \
  --jq '.[] | select(any(.files[]; .path | startswith("www/content/"))) | "#\(.number) \(.title)"'
```

## Triage of submissions

`yarn om triage` lists every open PR that is labelled `new-entry` or changes `modules/**` (a fork and the `/submit`
form cannot set labels), one line each with a verdict (`ready`, `hold`, `blocked`), the state of the `validate.yml`
checks and flags. `ready` needs all three jobs green (`validate`, `checks`, `build`), not only the required one.
`yarn om triage --merge` squash-merges the ready ones after a confirmation, each pinned to the head commit it judged,
with the curator's own `gh` login.
