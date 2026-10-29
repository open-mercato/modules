# Contributing guide

This guide is for people who add or edit a module entry in the catalog. It also covers the rules for text and for the code of this repository.

One file in `modules/` is one entry. A descriptor holds only what an author or a curator decides. Everything measured (versions, anatomy, receipts, levels) is computed by CI and lives on the `data` branch, never in YAML.

## Why contribute

An entry is how a module becomes visible to people and to agents. A good entry says what the module does and when to use it, so the right people find it and the wrong people skip it.

You can add your own module, fix a summary, add screenshots or correct a field. Small pull requests are welcome.

## Quick start

1. Publish your module to npm. `create-mercato-module` turns a module of your app into a package and a GitHub repository. A GitHub-only entry is possible too.
2. Open the `/submit` page of the site, or write the file by hand. The page checks the package in your browser, builds the descriptor with the same schema as CI and opens GitHub's new-file page with it filled in.
3. Commit the file and create the pull request. Tick `I maintain this package or have the maintainer's consent`.
4. Read the summary of the `validate` check. Fix what it lists.
5. A person reviews and merges.

> **Good to know:**
>
> The /submit page needs JavaScript. Without it, add the descriptor by hand at the path from [File structure](#file-structure), or open a [listing request](https://github.com/open-mercato/modules/issues/new?template=listing-request.yml) issue.

## How to contribute

### Pull requests

- Tick `I maintain this package or have the maintainer's consent`. Agents may open a PR; a person merges it.
- Run `yarn om format modules` before you push, or let the autofix job format the file. See [Formatting](#formatting).
- Add screenshot files in the same pull request as the descriptor.
- A PR that changes a curator field gets a note in the summary.

### Review process

- CI runs `yarn om validate` and `yarn check` on every PR, and `yarn test` when the PR changes files outside `modules/`. A PR that changes only `modules/` skips the suite, because `validate` already reports those descriptors. CI writes up to 10 lines per entry in the job summary. There are no bot comments.
- A person reads the summary and the descriptor, then merges.
- The nightly install runs only for entries merged to `main`, never for PR content.
- Phrases that look like instructions to an AI model are flagged for a human reviewer.

## File structure

The path of a descriptor follows its locator. The locator is the key of an entry. Two entries may register the same module ID; the site shows that they compete for the slot.

| Source                       | Locator                                         | File                                                                     |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| scoped npm package           | `npm:@fastwhitecat/integration-ksef-direct`     | `modules/@fastwhitecat/integration-ksef-direct.yml`                      |
| unscoped npm package         | `npm:create-mercato-module`                     | `modules/create-mercato-module.yml`                                      |
| GitHub only (no npm release) | `github:Chmarusso/open-mercato-enrichment-treg` | `modules/github/chmarusso/open-mercato-enrichment-treg.yml` (lower case) |

Screenshot files sit next to the descriptor, in a `screenshots/` folder. See [Screenshots](#screenshots).

## Add or edit an entry

1. Work out the path from your locator, as in the table above. For an edit, open the file that exists.
2. Fill the author fields (A) from [Fields](#fields). Leave curator fields (K) alone.
3. Write the texts with the [Style guide](#style-guide).
4. Add screenshots if you have them (optional).
5. Run `yarn om format modules`.
6. Open the pull request.

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
| `screenshots`                     | A   | optional, up to 6 `{ src, alt }`; see [Screenshots](#screenshots)                              |
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

### Formatting

Key order in the file follows the table above. `yarn om format` sorts keys and formats the file with Prettier; the autofix job only formats.

> **Good to know:**
>
> The autofix job formats `modules/**` in your PR and commits the result, forks included. Running `yarn om format modules` before you push saves that round trip. Until the file is formatted, the `checks` job fails on it and `validate` warns about it in its summary.

## Screenshots

Optional. Images of the module in a running app, 16:10, at least 1280 px wide. The module page shows them; agents get them as links.

```yaml
screenshots:
  - src: screenshots/invoices.webp
    alt: The invoices list with the send status of each invoice.
  - src: https://raw.githubusercontent.com/acme/om-invoices/main/docs/settings.png
    alt: Settings of the connection to the tax office.
```

- `src` is a file in this repository or an image on GitHub. A file goes next to the descriptor: `screenshots/<name>.webp` (or `.png`, `.jpg`, lower case letters, digits, `-` and `_`) in `modules/@acme/x.yml` means `modules/@acme/screenshots/<name>.webp`, and a descriptor right under `modules/` uses `modules/screenshots/`. Add the file in the same pull request; it must be at most 600 KB, so prefer WebP.
- An image on GitHub is a `https://raw.githubusercontent.com/<owner>/<repo>/...` link to the module's own repository (the `github` field, or the repository of `repo`), or a `https://github.com/user-attachments/assets/...` link.
- `alt` says what the image shows: plain text, 10 to 120 characters.
- The site copies a hosted file to `shots/<folder>/<name>`; `modules.json` and `/m/<path>.json` carry `screenshots` with a `src` the site loads as it is, and the Markdown card lists absolute links.

## Style guide

Texts for people are English and short. Evidence over adjectives: say what the module does, not how good it is.

- One idea per sentence, ending with a period. No exclamation marks.
- Plain text only in `summary`, `whenToUse`, `whenNotToUse`, provider labels, aliases and screenshot `alt`: no URLs, no markdown, no HTML, no backticks.
- No long dashes: the characters U+2014 (em dash) and U+2013 (en dash) are banned in every text of this repository, including docs, YAML and commit messages. Use a hyphen or rewrite the sentence. `yarn om check-text` enforces it in CI.

## Working on the code

For changes to the emitter, the schemas or the site, not for adding an entry. Read `AGENTS.md` first.

```bash
yarn install
yarn check
yarn test
```

Node 24 runs TypeScript directly (type stripping), so only erasable syntax is allowed: relative imports with the `.ts` extension, `import type` for types, no `enum`, `namespace`, parameter properties or decorators. Exact dependency versions, no new dependencies without a change to the specification.
