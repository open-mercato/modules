# Contributing

One file in `modules/` is one entry. A descriptor holds only what an author or a curator decides. Everything measured (versions, anatomy, receipts, levels) is computed by CI and lives on the `data` branch, never in YAML.

## Where the file goes

| Source                       | Locator                                         | File                                                                     |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| scoped npm package           | `npm:@fastwhitecat/integration-ksef-direct`     | `modules/@fastwhitecat/integration-ksef-direct.yml`                      |
| unscoped npm package         | `npm:create-mercato-module`                     | `modules/create-mercato-module.yml`                                      |
| GitHub only (no npm release) | `github:Chmarusso/open-mercato-enrichment-treg` | `modules/github/chmarusso/open-mercato-enrichment-treg.yml` (lower case) |

The locator is the key of an entry. Two entries may register the same module ID; the site shows that they compete for the slot.

## Fields

Author fields (A) are yours. Curator fields (K) are set by a maintainer of this repository; a PR that changes them gets a note in the summary. Unknown fields are an error.

| Field                             | Who | Rule                                                                                           |
| --------------------------------- | --- | ---------------------------------------------------------------------------------------------- |
| `npm`                             | A   | required without `github`; a stable version must exist; not deprecated                         |
| `github`                          | A   | `owner/repo`; required for GitHub-only entries; must match `repository.url` of the npm tarball |
| `repo`                            | A   | monorepo only: `owner/name#ref/path`                                                           |
| `module`                          | A   | only when the package has several modules and the entry is about one                           |
| `kind`                            | A   | `module` (default), `provider`, `library` or `tool`; CI confirms it from the tarball           |
| `category`                        | A   | one of the 16 IDs in `policy/categories.yml`                                                   |
| `tags`                            | A   | up to 8, `^[a-z0-9-]{2,24}$`; `example` hides the entry by default                             |
| `summary`                         | A   | plain text, 20 to 140 characters, English                                                      |
| `whenToUse`                       | A   | plain text, 40 to 240 characters, starts with `Use when `                                      |
| `whenNotToUse`                    | A   | optional, up to 160 characters, ideally with an alternative                                    |
| `providers`                       | A   | up to 20 `{ name, label }`; searchable                                                         |
| `extends`                         | A   | locator of the host package, only for `kind: provider`                                         |
| `links.docs`, `.support`, `.demo` | A   | `https://` URLs (`support` may be `mailto:`)                                                   |
| `pricing`                         | A   | `free` (default), `paid` or `contact`                                                          |
| `smoke.paths`                     | A   | up to 5 extra GET paths under `/backend/` or `/api/` for the nightly smoke test                |
| `scriptsRequired.reason`          | A   | explicit reason when the package needs install scripts                                         |
| `declares.hosts`, `declares.env`  | A   | hosts and environment variables you expect; compared with what the code shows                  |
| `status`, `reason`                | K   | `active`, `hold`, `unmaintained`, `delisted`; anything but `active` needs a public `reason`    |
| `alternatives`                    | K   | up to 5 locators                                                                               |
| `replaces`                        | K   | `core:<id>` when the module replaces a built-in module                                         |
| `renamedFrom`                     | K   | old locators                                                                                   |
| `supersededBy`                    | K   | locator or `core:<id>`                                                                         |
| `enterprise`                      | K   | reserved for `@open-mercato/enterprise`                                                        |
| `featured`                        | K   | featured section only; never changes ranking                                                   |
| `aliases`                         | K   | extra search phrases                                                                           |

Key order in the file follows this table. `yarn om format` sorts keys and formats the file with Prettier; the autofix job only formats.

## Text rules

- English, short, one idea per sentence, ending with a period. No exclamation marks.
- Plain text only in `summary`, `whenToUse`, `whenNotToUse`, provider labels and aliases: no URLs, no markdown, no HTML, no backticks.
- No long dashes: the characters U+2014 (em dash) and U+2013 (en dash) are banned in every text of this repository, including docs, YAML and commit messages. Use a hyphen or rewrite the sentence. `yarn om check-text` enforces it in CI.
- Evidence over adjectives: say what the module does, not how good it is.
- Phrases that look like instructions to an AI model are flagged for a human reviewer.

## Pull requests

- Tick `I maintain this package or have the maintainer's consent`. Agents may open a PR; a person merges it.
- CI runs `yarn check`, `yarn test` and `yarn om validate`, and writes up to 10 lines per entry in the job summary. There are no bot comments.
- The nightly install runs only for entries merged to `main`, never for PR content.

## Working on the code

Node 24 runs TypeScript directly (type stripping), so only erasable syntax is allowed: relative imports with the `.ts` extension, `import type` for types, no `enum`, `namespace`, parameter properties or decorators. Exact dependency versions, no new dependencies without a change to the specification.
