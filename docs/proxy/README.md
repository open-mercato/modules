# Proxy for www.openmercato.com/run

The module catalog becomes the **Run** section of the main site, at `https://www.openmercato.com/run`. The catalog is
a Cloudflare Pages project, `open-mercato-modules`, and it already serves every page under `/run/` itself. The main
site only has to pass `/run` and `/run/*` to it. This folder is that proxy, ready to deploy:

| File            | What it is                                                                             |
| --------------- | -------------------------------------------------------------------------------------- |
| `worker.ts`     | The Cloudflare Worker. One file, no dependencies.                                      |
| `wrangler.toml` | An example config: the route `www.openmercato.com/run*` and the two settings.          |
| `check.sh`      | Checks a host with `curl` and prints pass or fail per line. Exit code 0 when all pass. |

The rules it follows are in [docs/RUNBOOK.md](../RUNBOOK.md), section Contract for the proxy of the main site. In
short: the same path and query, `/run` not cut, redirects not followed, the answer passed back as it is, no cache rule
of its own for `/run`.

## What the Worker does

- `/run` and `/run/*`: sent to `UPSTREAM` with the same path and query. Method, body and headers go along, except
  the hop headers (`Connection` and the like), `Host` and `Cookie`. It adds `X-Forwarded-Host` and
  `X-Forwarded-Proto`. Redirects come back to the browser unchanged (`/run` answers a 302 to `/run/modules`).
- Any other path the route catches (`/running`): passed on to the main site unchanged.
- `/modules` and `/templates`: a 302 to `/run/modules` and `/run/templates`, only when `SHORT_REDIRECTS` is `on` and
  their routes are added.
- `UPSTREAM` missing or not an `https://` origin: a 502 with a short text, nothing is fetched.

## Settings

| Setting           | Test value                                           | After the switch                         |
| ----------------- | ---------------------------------------------------- | ---------------------------------------- |
| `UPSTREAM`        | `https://run-preview.open-mercato-modules.pages.dev` | `https://open-mercato-modules.pages.dev` |
| `SHORT_REDIRECTS` | `off`                                                | `on` if you want the short addresses     |

The test value is a preview of the new layout. Every push to `main` of this repository deploys it to the branch
`run-preview` of the Pages project (`.github/workflows/pages.yml`, jobs `preview-build` and `preview`). It answers
with `X-Robots-Tag: noindex`, and so does `/run` behind the proxy while it points there. That is intended: nothing
links to `/run` before the switch.

## Deploy against the preview

On the Cloudflare account that holds the `openmercato.com` zone:

1. Copy `worker.ts` and `wrangler.toml` to a folder of your own, and change `name` or `zone_name` if needed.
2. `npx wrangler deploy` in that folder. Or, in the dashboard: Workers & Pages > Create > Worker, paste `worker.ts`,
   add the variables of the table above, then Settings > Domains & Routes > Add route `www.openmercato.com/run*` on
   the zone `openmercato.com`.
3. Check the preview itself, then the proxy:

```sh
docs/proxy/check.sh https://run-preview.open-mercato-modules.pages.dev
docs/proxy/check.sh https://www.openmercato.com
```

Both must end with `0 failed`. The `info` line shows the `X-Robots-Tag`; `noindex` is right for the preview.

Also on the zone, for `/run` (items 4 and 5 of the contract): no cache rule with its own TTL, Email Obfuscation off
(a configuration rule on URI path starts with `/run`), and the line
`Sitemap: https://www.openmercato.com/run/sitemap-index.xml` in the main site's `robots.txt` on switch day.

## Switch day

The full order is in [docs/RUNBOOK.md](../RUNBOOK.md), section Switch, in order. For the proxy it is one change, made
right after the `pages` run that moves production to `/run`:

1. Set `UPSTREAM` to `https://open-mercato-modules.pages.dev` (in `wrangler.toml` and `npx wrangler deploy`, or
   Worker > Settings > Variables in the dashboard, then deploy).
2. `docs/proxy/check.sh https://www.openmercato.com` ends with `0 failed`, and the `info` line shows `none` for the
   `X-Robots-Tag`.

## Roll back

- Proxy only: set `UPSTREAM` back to the preview, or remove the route `www.openmercato.com/run*`. With no route,
  `/run` is the main site's own 404 again.
- The whole move: [docs/RUNBOOK.md](../RUNBOOK.md), section Rollback. Production goes back to
  `https://modules.openmercato.com`; then remove the route, or point `/run` at a redirect to that address.
