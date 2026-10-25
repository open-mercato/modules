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
   unconfirmed red and infra cells, waits for it (up to 40 minutes) and collects it in the same job. Then
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
  takes about 15 minutes on Cezar with a warm Yarn cache (typecheck 233 s, build 420 s), 2.7 times the empty one.
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

## Preview mode (before the repository is on GitHub)

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

A night of every line on one host runs in parallel streams, each one cell at a time (`cells-local --shard i/n`, the
baselines all in shard 1). The whole night is one bash script; do not paste it into zsh (zsh does not split an
unquoted variable into words, so a loop over `$RUNS` ran once with every run directory in one word):

```sh
N=~/kod/om-modules-night; mkdir -p $N/out && cp -R ~/kod/om-modules-preview/.data $N/.data   # a copy of the data
bash scripts/preview-night.sh --data $N/.data --out $N/out --host <user>@<docker-host> --streams 2 --stagger 300
node lib/cli.ts health --changed --data $N/.data && node lib/cli.ts emit --data $N/.data && npx astro build
```

The script plans every cell of the lines without a budget cut (`--preset classic` by default, `--lines 0.9` for one
line, `--plan-only` to read `out/matrix.json` first). Each cell gets `--memory 10g`, and the host must have the sum
of the limits free (`--min-free-mem-gb`, default streams x memory): three streams need 30 GB, so Cezar (30 GB shared
with three service containers and agent runs, about 28 GB available when idle) runs a classic night in two streams.
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
directory is reported and its stream is collected without it. Sizes on Cezar: 119 classic cells of three lines at
about 15.5 minutes are about 31 hours in one stream, about 15 hours in two; 119 empty cells at about 5.5 minutes are
about 11 hours in one stream, about 4 hours in three (an empty cell stays well under 8g: `--memory 8g` passed there).

Isolation of a preview cell:

- one container per cell from `harness/local/Dockerfile` (Ubuntu 24.04, Node 24.21.0 with Corepack, user `om-cell`
  without sudo), `--memory 10g --cpus 4` (`cells-local --memory <n>g` changes it; a step the limit cuts short is
  infra, see above), `no-new-privileges`, a private bridge network per cell;
- the cell network reaches the internet and nothing of the host (review round 2). A bridge network alone does not do
  that: through its gateway a container reaches every service the host listens on, including ports closed to the
  internet (on Cezar Postgres 5432, Redis 6379, Meilisearch 7700, Traefik 80 and 443), and the cloud metadata service
  `169.254.169.254` with the server's user-data. `harness/local/cell-firewall.sh` runs in a throwaway container of the
  `fw` stage of the Dockerfile (`--net host --cap-add NET_ADMIN`, the script on stdin, nothing mounted; the user only
  needs the `docker` group) and adds, for the cell subnet: a chain `OMC-<suffix>` jumped to from `DOCKER-USER` that
  rejects link-local, private (`10/8`, `172.16/12` except the cell's own subnet, `192.168/16`), shared `100.64/10`,
  loopback and multicast ranges and every IPv4 of the host (published ports of other containers are DNATed to private
  addresses before that chain, so they are covered too), and an `INPUT` rule that rejects anything from the subnet to
  the host itself. IPv6 is off inside the cell. The rules go on every iptables backend that has `DOCKER-USER` (on Cezar
  `iptables-nft`; the warning about legacy tables there is harmless); a host where none has it does not run cells;
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

The fence is only as good as the host's firewall stack. The cleaner alternative for a full matrix is a throwaway VM
with Docker and no other services or secrets, destroyed after the run; the same commands work there.

Difference from CI: preview cells share a Yarn cache volume (`om-preview-yarn-cache`, `--yarn-cache none` turns it
off) to save time and disk on the host. The CI job has no cache at all (D12): a module could poison a shared cache for
later cells. Drop the volume (`docker volume rm om-preview-yarn-cache`) when in doubt.

The preview host runs third-party module code. Spec rule 0.4 keeps that on ubuntu-latest; preview mode exists only
until the repository is on GitHub, and only for cells the owner asked for.

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
`https://open-mercato.github.io/modules`, which serves nothing while the repository is private and Pages is off, so
`llms.txt`, `modules.json`, the `.md` cards and the canonical tags of a preview point at dead pages (finding of 25 Oct).
`yarn om emit` warns when `SITE_URL` is not set. For a preview, build for the address that serves it:

```sh
SITE_URL=https://<preview host> BASE_PATH=/modules node lib/cli.ts emit --data <data> && \
  SITE_URL=https://<preview host> BASE_PATH=/modules npx astro build
```

The pages rewrite their copy commands, links and Claude Code prompts to the host they are served from either way.

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
passed; the inner `timeout 600 yarn build` writes `[harness] step timed out: yarn build ran 600 s`. An exit code 124 or
137 that module code returns before the limit is an ordinary failure. GitHub's `timeout-minutes` and the `timeout` of
`run-cell.sh` (equal to `timeout-minutes`) are only backstops; the preview runner reports a step ended by its backstop
as `cancelled`.
The signature is `sha1(step + ':' + first error line)` with paths reduced to file names, hex runs to `h` and numbers to
`#`; the same signature in 3 or more modules on one line is a `sameFailure` on `/radar`.

## Repository setup (owner clicks)

Spec 5.6 was written for a public repository of a personal account; the catalog lives in the private
`open-mercato/modules`. These are settings of the repository and the organization. A person with admin rights makes them; agents and workflows
never change them. State on 25 Oct: none of them is set (`gh api repos/open-mercato/modules/branches/main/protection`
answers 404, `gh label list` shows only the GitHub defaults, `gh variable list` is empty).

Before the repository is public:

1. Settings > Branches: protect `main`. Require the `validate` check (the job of that name in `validate.yml`), require
   a review from code owners, block force pushes. `data` stays unprotected (only the trusted jobs write it).
2. Labels: `new-entry`, `update`, `name-reviewed`, `curator`, `automated`, `discovery` (spec 5.6 item 7). The issue
   forms apply `new-entry`; `sync.yml` adds `discovery` to its issue once the label exists; `validate` reads
   `name-reviewed`, so after adding it a curator re-runs the `validate` check of the PR.
3. Install the autofix.ci app on the repository (`autofix.yml` formats `modules/**` in PRs).
4. Settings > Actions > General: require approval for first-time contributors; workflow permissions: read.

At the switch to the public address:

5. Repository variables `SITE_URL` and `BASE_PATH` (`https://modules.openmercato.com` and `/` once the domain answers;
   until then `https://open-mercato.github.io` and `/modules`), `MCP_URL` after the Worker deploy (D-OPEN-1).
6. Settings > Pages > Source: GitHub Actions. `pages.yml`, and the scheduled `watch`, `sync` and nightly runs, start on
   their own once the repository is public; while it is private they run only by hand (Actions minutes).
7. Environments `github-pages` and `mcp` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), and the WebMCP origin
   trial tokens in `WEBMCP_OT_TOKENS` (spec 5.6 items 6 and 8).
8. A second curator in `.github/CODEOWNERS` (D-OPEN-5): with one code owner a required code-owner review adds nothing.

## Triage of submissions

`yarn om triage` lists every open PR that is labelled `new-entry` or changes `modules/**` (a fork and the `/submit`
form cannot set labels), one line each with a verdict (`ready`, `hold`, `blocked`), the `validate` check and flags.
`yarn om triage --merge` squash-merges the ready ones after a confirmation, each pinned to the head commit it judged,
with the curator's own `gh` login.
