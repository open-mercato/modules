# The Strapi project of www.openmercato.com

The content of the main site in Strapi 5 Community, as the spec
[2026-11-27-www-strapi-cms.md](../docs/specs/2026-11-27-www-strapi-cms.md) designs it. A project of its own: its own
`package.json`, `yarn.lock` and `.yarnrc.yml`, outside the root toolchain (spec, The `cms/` folder). The site build
never installs or reads this folder; it reads Strapi only through its REST API.

## Layout

| Path                          | What it holds                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `compose.yaml`                | Strapi, PostgreSQL 17 and the tunnel, on a network of their own, no port                                                 |
| `compose.test.yaml`           | Strapi on 127.0.0.1 of the machine and a fake GitHub endpoint, for tests and a local instance only                       |
| `Dockerfile`                  | The Strapi image on Node 24, run as the non-root user `node`                                                             |
| `.env.example`                | The keys of `cms/.env` on the host; there is no API token encryption key                                                 |
| `config/`                     | Server, database, admin, `api.ts` (`maxLimit` 100), upload (25 MiB, local)                                               |
| `src/api/`, `src/components/` | The content model of the spec's Data Model; `test/www-cms/model-drift.test.ts` keeps it equal to `lib/www-cms/model.ts`  |
| `src/hook/`, `src/preview.ts` | The publish hook (a dispatch of `pages`) and the preview handler, off until Phase 5                                      |
| `src/index.ts`                | The bootstrap, at every start: the Media Library settings of A7, the Public role emptied, the roles seed, the edit views |
| `scripts/dev-env.sh`          | Writes `cms/.env` with random values for a throwaway instance                                                            |
| `test/unit/`                  | `node --test` without a server                                                                                           |
| `test/instance/`              | `node --test` against a started instance with an empty database (`cms.yml`)                                              |

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
