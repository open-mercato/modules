# The Strapi project of www.openmercato.com

The content of the main site in Strapi 5 Community, as the spec
[2026-11-27-www-strapi-cms.md](../docs/specs/2026-11-27-www-strapi-cms.md) designs it. A project of its own: its own
`package.json`, `yarn.lock` and `.yarnrc.yml`, outside the root toolchain (spec, The `cms/` folder). The site build
never installs or reads this folder; it reads Strapi only through its REST API.

## Layout

| Path                                                 | What it holds                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `compose.yaml`                                       | Strapi, PostgreSQL 17, the tunnel and the backup and restore jobs, on a network of their own, no port                    |
| `compose.test.yaml`                                  | Strapi on 127.0.0.1 of the machine and a fake GitHub endpoint, for tests and a local instance only                       |
| `Dockerfile`                                         | The Strapi image on Node 24, run as the non-root user `node`                                                             |
| `.env.example`                                       | The keys of `cms/.env` on the host; there is no API token encryption key                                                 |
| `config/`                                            | Server, database, admin, `api.ts` (`maxLimit` 100), upload (25 MiB, local)                                               |
| `src/api/`, `src/components/`                        | The content model of the spec's Data Model; `test/www-cms/model-drift.test.ts` keeps it equal to `lib/www-cms/model.ts`  |
| `src/hook/`, `src/preview.ts`                        | The publish hook (a dispatch of `pages`) and the preview handler, off until Phase 5                                      |
| `src/index.ts`                                       | The bootstrap, at every start: the Media Library settings of A7, the Public role emptied, the roles seed, the edit views |
| `backup/`, `scripts/backup.sh`, `scripts/restore.sh` | The backup and restore jobs (PostgreSQL 17 tools, age, ssh)                                                              |
| `scripts/dev-env.sh`                                 | Writes `cms/.env` with random values for a throwaway instance                                                            |
| `test/unit/`                                         | `node --test` without a server                                                                                           |
| `test/instance/`                                     | `node --test` against a started instance with an empty database (`cms.yml`)                                              |

Strapi is pinned at exactly 5.64.0 (spec, Docker and versions). It is younger than the 14-day age gate of the root
rules, so `.yarnrc.yml` pre-approves `@strapi/*` only; every other package of the tree keeps the gate.

## Accounts (Q9)

Every editor is a Super Admin with a personal account; there is no Editor-role account and no shared login.
`CMS_ADMIN_ACCOUNTS` in `cms/.env` lists them as `First Last <address>`, separated by commas (`.env.example` shows the
shape with placeholders). At a start the seed creates each listed account that does not exist yet, without a password,
and logs its invitation link once (`docker compose -f cms/compose.yaml logs strapi | grep invited`); the person sets
the first password through that link. The seed never changes or deletes an account, warns about an account that is
not listed, and stops the start on a list with a repeated address or a role address (`admin@`, `marketing@`).

In production (`strapi start`) the Content-Type Builder refuses every change of the model, so a type or field changes
only through a reviewed commit to `cms/src`. The Public role loses every permission at each start, and end-user
registration is off: the content API answers only to an API token.

## Publish hook

**Mechanism, confirmed in the source of 5.64.0 (spec Step 2.4).** Strapi reports a publish, an unpublish and a delete
of a document on its event hub: `publish`, `unpublish` and `delete` of the document service repository
(`node_modules/@strapi/core/dist/services/document-service/repository.js`) emit `entry.publish`, `entry.unpublish` and
`entry.delete` through `strapi.eventHub.emit`, one event per database row of the document; the upload service
(`node_modules/@strapi/upload/dist/server/services/upload.js`) emits `media.update` and `media.delete` the same way. The
built-in webhooks listen to the same hub (`node_modules/@strapi/core/dist/services/webhook-runner.js`,
`eventHub.on(event, ...)`), so the hook sees exactly the events a webhook would, without a webhook: no Super Admin can
read its token in the admin. Document service middlewares and lifecycle hooks were not needed. The relay fallback of
the spec is not used.

**What it does** (`src/hook/`). On those five events of the site's types and the media library it waits for
`CMS_DISPATCH_QUIET_MS` (60 000) without a new event, at most `CMS_DISPATCH_MAX_WAIT_MS` (300 000) from the first, then
sends `POST /repos/open-mercato/modules/actions/workflows/pages.yml/dispatches` with
`{"ref":"main","inputs":{"www_content":"publish"}}` and the token `GITHUB_DISPATCH_TOKEN` of `cms/.env` (Q4). Three
tries with backoff on a 5xx or a network error; a 401 or 403 is logged as `dispatch refused: token` and not retried.
A draft save sends nothing (Phase 5 adds the drafts build). Without a token the hook logs that it is off.

**Tests.** `test/unit/dispatch.test.ts` against a fake GitHub endpoint (`test/fake-github/`): a burst gives one
dispatch with the fixed body, the longest wait holds, a 401 or 403 is not retried, a 5xx is tried three times.
`test/instance/hook.test.ts` on the started instance, whose hook `compose.test.yaml` points at the same fake as a
Compose service: a draft save gives none, one publish, one unpublish and one delete each exactly one.

**Preview.** `src/preview.ts` maps a document to its path on the draft build; `config/admin.ts` keeps the Preview
button off (`CMS_PREVIEW`) until Phase 5.

## Operate

Everything below runs on the Strapi host from the sparse checkout of a `cms-v*` tag (spec, How the Strapi host deploys
from this repository), with `cms/.env` (mode 600) filled from `.env.example`. Nothing here is done by a pull request:
tags, tokens, the tunnel, DNS and the Storage Box are the owner's and the infrastructure owner's actions (spec Step 2.6).

```sh
git clone --filter=blob:none --no-checkout --sparse https://github.com/open-mercato/modules.git www-cms
cd www-cms && git sparse-checkout set cms && git checkout cms-v1.0.0
docker compose -f cms/compose.yaml --profile tunnel up --detach --build --wait
```

**Deploy a tag.** Take a backup first (below), then `git fetch --tags`, `git checkout cms-v<new>` and the `up` line
above. Strapi's database migrations run forward only, so a downgrade is the previous tag plus the restore of the backup
taken before the upgrade.

**Rotate tokens** (spec, Rotation; at least once a year). The dispatch token: a new fine-grained token of the machine
account (this repository, Actions read and write), into `GITHUB_DISPATCH_TOKEN` of `cms/.env`, `up --detach` again, one
publish or a dispatch by hand, then delete the old token. The read and drafts tokens: a new read-only API token in
Settings, API Tokens, into the repository secret `STRAPI_READ_TOKEN` (and, from Phase 5, `STRAPI_DRAFTS_TOKEN` of the
environment `www-drafts`), one `pages` dispatch by hand, then delete the old token in Strapi. List every API token at
the same time and delete any the RUNBOOK does not name. A token is shown once: there is no encryption key, so a lost
token is replaced, never displayed.

## Backup and restore

**Nightly** (host cron, for example at 02:17):

```sh
docker compose -f cms/compose.yaml --profile backup run --rm backup
```

`scripts/backup.sh` takes a `pg_dump --format=custom` of the database and a tar of the uploads volume, puts them in one
tar encrypted with `age` to `BACKUP_AGE_RECIPIENT` (the owner holds the private key; it is never on the host) and sends
it to `BACKUP_TARGET`, the Storage Box of Q8 as `user@host:dir` over ssh on `BACKUP_SSH_PORT` (23), with the key and
known_hosts files `BACKUP_SSH_KEY_FILE` and `BACKUP_KNOWN_HOSTS_FILE` mounted read-only. It keeps the 14 newest daily and
the 8 newest weekly archives there.

**Weekly** (Sunday, before the nightly run): a `strapi export` archive, the portable copy for the move, encrypted by
Strapi with `BACKUP_EXPORT_KEY` (never `--no-encrypt`); the Sunday backup carries the newest one.

```sh
docker compose -f cms/compose.yaml exec strapi sh -c \
  'node node_modules/@strapi/strapi/bin/strapi.js export --key "$BACKUP_EXPORT_KEY" --file "exports/strapi-export-$(date -u +%Y%m%d)"'
```

Admin users and API tokens are not in an export: after an import they are recreated (the roles seed invites the four
accounts again). `strapi transfer` is not used: it has no encryption.

**Restore** into a project whose Strapi is stopped, with the archive and the owner's private age key mounted only for the
run:

```sh
docker compose -p www-cms -f cms/compose.yaml stop strapi
docker compose -p www-cms -f cms/compose.yaml --profile restore run --rm \
  -v /path/of/the/archives:/target:ro -v /path/of/the/age/key:/run/backup/age_identity:ro \
  restore /target/strapi-<stamp>-daily.tar.age
docker compose -p www-cms -f cms/compose.yaml up --detach --wait strapi
```

**Restore drill.** `test/instance/backup.test.ts` runs the whole path in `cms.yml` on every change: a backup to a local
target, a restore into a second Compose project, the same `pg_dump` listing, the same rows per table, the same SHA-256
of every upload, and Strapi starting on the restored data. The drill with `www-pull --check` follows in Phase 3; the
RUNBOOK records its date.

## Move to another host

Because the site knows only `STRAPI_URL` and its tokens (spec, The move): a host with Docker and the sparse checkout of
the current tag; `cms/.env` copied (a new tunnel token and backup target where they differ); the latest backup restored
and checked; writes on the old host stopped, a final backup restored on the new one; the DNS record of Q1 (or the
tunnel) pointed at the new host; one `pages` dispatch by hand. The old host's volumes are kept for 30 days.

## Tests

`cms.yml` runs them on every change under `cms/`. The same on a machine with Docker, from `cms/`, as one throwaway
project with its port on 127.0.0.1 only:

```sh
corepack enable && yarn install --immutable && yarn build && yarn test
./scripts/dev-env.sh
export CMS_URL=http://127.0.0.1:1337 CMS_COMPOSE="docker compose -p cms-local -f compose.yaml -f compose.test.yaml"
$CMS_COMPOSE up --detach --build --wait
yarn test:instance
$CMS_COMPOSE down --volumes && rm .env
```

The instance tests need an empty database: the first one registers a test admin with a random password, kept only in
a temporary file of the run.
