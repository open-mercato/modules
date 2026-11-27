# The Strapi project of www.openmercato.com

The content of the main site in Strapi 5 Community, as the spec
[2026-11-27-www-strapi-cms.md](../docs/specs/2026-11-27-www-strapi-cms.md) designs it. A project of its own: its own
`package.json`, `yarn.lock` and `.yarnrc.yml`, outside the root toolchain (spec, The `cms/` folder). The site build
never installs or reads this folder; it reads Strapi only through its REST API.

## Layout

| Path                 | What it holds                                                               |
| -------------------- | --------------------------------------------------------------------------- |
| `compose.yaml`       | Strapi, PostgreSQL 17 and the tunnel, on a network of their own, no port    |
| `compose.test.yaml`  | Strapi on 127.0.0.1 of the machine, for tests and a local instance only     |
| `Dockerfile`         | The Strapi image on Node 24, run as the non-root user `node`                |
| `.env.example`       | The keys of `cms/.env` on the host; there is no API token encryption key    |
| `config/`            | Server, database, admin, `api.ts` (`maxLimit` 100), upload (25 MiB, local)  |
| `src/index.ts`       | The bootstrap: the Media Library settings of A7 at every start              |
| `scripts/dev-env.sh` | Writes `cms/.env` with random values for a throwaway instance               |
| `test/unit/`         | `node --test` without a server                                              |
| `test/instance/`     | `node --test` against a started instance with an empty database (`cms.yml`) |

Strapi is pinned at exactly 5.64.0 (spec, Docker and versions). It is younger than the 14-day age gate of the root
rules, so `.yarnrc.yml` pre-approves `@strapi/*` only; every other package of the tree keeps the gate.

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
