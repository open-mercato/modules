# Publish your app as a template

A template is a whole Open Mercato app in a public GitHub repository that a new app starts from. You save your app with [`create-mercato-template`](https://github.com/open-mercato/create-mercato-template), list it in the catalog with a pull request, and anyone can then create an app from it.

Listed templates are in the gallery at https://www.openmercato.com/run/templates.

## Requirements

- Node.js 24 or newer and Git 2.40 or newer.
- For `publish`: the GitHub CLI `gh`, signed in (`gh auth login`). If the app has files in `.github/workflows/`, also run `gh auth refresh -s workflow`.
- An Open Mercato app on Yarn 4 (`packageManager: yarn@4.x`), with `@open-mercato/core` in `dependencies`, a root `yarn.lock` and a `src/modules.ts`.
- The app is the top level of a Git repository with at least one commit. `prepare` reads committed files only, so commit everything first, the license and the README included.
- A GitHub account or organization that will own the template repository.

## 1. Check the app before you start

Fix these in the app and commit. `prepare`, the catalog's `validate` check or the reviewer stops on them.

- A `LICENSE` file with an OSI license, such as MIT or Apache-2.0. A template is copied, so an `active` entry needs one.
- A root `README.md` that says what the app is for. `prepare` warns when there is none, and the catalog refuses the stock `create-mercato-app` README.
- All Open Mercato packages on one release line. Use the latest stable line.
- Seed and demo data without real-looking people, emails or links. Use `example.com` or `acme.com` only.
- No secrets in committed files. `prepare` stops on anything that looks like one. Move the value to `.env` and commit again.

## 2. Prepare, review, publish, describe

```bash
cd my-app
npx create-mercato-template prepare --out ../my-template
# Review ../my-template/report.json and ../my-template/tree.
npx create-mercato-template publish --from ../my-template --repo your-name/my-template --public
npx create-mercato-template describe --from ../my-template
```

What each step does:

1. `prepare` reads one pinned commit, offline and without running app code. It leaves out files that must not leave your machine, such as `.env` files and uploads. It empties the values in `.env.example` that are not stock, scans the files for secrets and writes `mercato-template.json`. The result is `<out>/tree` and `<out>/report.json` with a `snapshotId`. `--out` is a new or empty directory outside the app. On a secret or any other error, only the report is written and nothing can be published.
2. Review `report.json`: errors, warnings, emptied env keys, images, modules and uncommitted files. Open each image and check it for personal data. Uncommitted files are not exported by default. Fix every `env-undocumented` warning now: write a comment line above the key in `.env.example`, commit and run `prepare` again. The catalog entry needs that description, and a published repository is not rewritten.
3. `publish` checks that `<out>` still matches the report. Then it creates the repository, pushes the snapshot as one commit without history, marks the repository as a template and adds the topics `open-mercato-template` and `open-mercato`. Choose `--public` for the catalog. On a terminal it asks before it creates anything. Add `--expect <snapshotId>` to publish without the prompt. A script needs `--expect`. If a GitHub step fails, the output has a `Retry:` command that continues with `--resume`.
4. `describe` prints the catalog entry as YAML, with its path in the first line. A required value it could not fill is a comment that says what to do. For `useCase`, `summary` and `whenToUse` it names a flag, for example `--use-case b2b-portal --summary "..." --when-to-use "Use when ..."`. Run it again with those flags until no such comment is left. The texts are plain: no links, markdown, HTML, backticks or long dashes.

Every flag is in the tool's [guide](https://github.com/open-mercato/create-mercato-template/blob/main/docs/guide.md).

## 3. Add the entry to the catalog

1. Fork https://github.com/open-mercato/modules and save the printed YAML at the printed path, `templates/<owner>/<repo>.yml`, with the owner and repository in lower case.
2. Run `yarn om format templates` in your clone, after `yarn install`. The Node.js and Yarn versions for the clone are in the [README](../README.md#development).
3. Open the pull request and tick `I maintain this package or have the maintainer's consent`.
4. Read the summary of the `validate` check and fix what it lists. A person reviews and merges.

Your fields: `github`, `ref`, `useCase`, `summary` (20 to 140 characters), `whenToUse` (40 to 240 characters, starts with `Use when `), `whenNotToUse` (optional, up to 160 characters), `links`, `screenshots`, `pricing`, `declares` and `smoke`. Required: `github`, `useCase`, `summary` and `whenToUse`.

Curator fields are not yours to set: `slug`, `status`, `reason`, `alternatives`, `supersededBy` and `featured`.

The rule for each field and the full review checklist are in [CONTRIBUTING.md](../CONTRIBUTING.md#templates).

## 4. How someone uses your template

```bash
npx create-mercato-app my-app --template <slug | owner/repo>[#ref]
```

A slug exists only after a curator assigns one to your entry. Without it, use `owner/repo`. `#ref` is a branch, tag or commit.

The CLI prints `Template: owner/repo@<sha> (<state>)` before it downloads anything. The state is `verified` or a form of `not verified`, for example `not listed, not verified` for a repository that is not in the catalog yet. The CLI then renames the app in `package.json` (unless `--keep-name`), adds an `openMercatoTemplate` field and removes `mercato-template.json`.

On an older `create-mercato-app` without `--template`:

```bash
npx create-mercato-app my-app --app-url https://github.com/<owner>/<repo>
```

## 5. Stay out of `hold`

`hold` is a status a curator sets. A held entry is shown with its reason and without a create command, and `--template` refuses it. Two things lead there:

- No OSI license. `validate` fails an `active` entry without one. A LICENSE text the catalog does not recognize counts as none, whatever `package.json` says.
- An old Open Mercato line. `validate` only reports how far behind the app is. Still, the first held entry, `open-mercato/ready-app-oss-prm`, is held for this together with a missing license. Keep the template repository on the latest stable line.

Also avoid:

- an archived or private repository;
- a repository without a root `package.json` on Yarn 4;
- a stock README;
- a repository name that is reserved or looks like another template.

## 6. Private templates

Publish with `--private` instead of `--public`. A private template is never listed in the catalog. To create an app from it, set `GITHUB_TOKEN` to a token that can read the repository and use `--template <owner>/<repo>`.
