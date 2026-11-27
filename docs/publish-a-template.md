# Publish your app as a template

A template is a whole Open Mercato app in a public GitHub repository that a new app starts from. You save your app with [`create-mercato-template`](https://github.com/open-mercato/create-mercato-template), list it in the catalog with a pull request, and anyone can then create an app from it.

Listed templates are in the [Open Mercato template gallery](https://modules.openmercato.com/run/templates).

## 1. Prepare your app

```bash
cd my-app
```

`prepare` exports the latest commit, so commit everything you want to share, including your README and license. Run it from the root of the app's Git repository with Node.js 24 or newer and Git 2.40 or newer. The app needs Yarn 4 (`packageManager` set to `yarn@4.x`), `@open-mercato/core` in `dependencies`, a root `yarn.lock` and `src/modules.ts`.

If you plan to list the template in the catalog, check these before you commit:

- README - Replace the starter `README.md` with a description of what the app does and when someone would use it.
- License - Include the full text of an OSI-approved license, such as MIT or Apache-2.0, in the root `LICENSE` file.
- Packages - Keep all Open Mercato packages on the latest stable release line.
- Demo data - Use fictional names. For email addresses and links in seed and demo data, use `example.com` or `acme.com`.

Prepare the snapshot in a new or empty directory outside the app:

```bash
npx create-mercato-template prepare --out ../my-template
```

`prepare` works offline and doesn't run your app code. It excludes files such as `.env` files and uploads, clears non-stock values from `.env.example`, scans for secrets and writes `mercato-template.json` into the snapshot.

The files you'll publish are in `../my-template/tree`. The export report, including the `snapshotId`, is in `../my-template/report.json`. If preparation fails, only the report is written.

## 2. Review the snapshot

Open `../my-template/report.json`. Check the errors and warnings, the modules and images included in the export, and the values cleared from `.env.example`. The report also lists uncommitted files. If one belongs in the template, commit it in the app before preparing the next snapshot.

For each `env-undocumented` warning, add a comment above the key in the app's `.env.example` explaining what it's for. That comment supplies the description for the catalog entry. If the scan found a secret, move the value to your local `.env` and remove it from the committed file.

Then inspect `../my-template/tree`. This is what people will get when they create an app from your template. Open each image and check for personal data.

Make any fixes in the original app, commit them and run `prepare` again into a new or empty directory. If you choose a different directory, use its path for `--from` in the remaining commands.

## 3. Publish to GitHub

Choose the GitHub account or organization that will own the repository. Sign in with the GitHub CLI:

```bash
gh auth login
```

If the snapshot includes files under `.github/workflows/`, grant the CLI permission to publish them:

```bash
gh auth refresh -s workflow
```

Replace `your-name/my-template` with the owner and repository name you've chosen. Use `--public` for a template you want to list in the catalog.

```bash
npx create-mercato-template publish --from ../my-template --repo your-name/my-template --public
```

`publish` checks that the snapshot still matches the report and asks for confirmation before creating the repository. It pushes the reviewed files as a single commit, marks the repository as a GitHub template and adds the topics `open-mercato-template` and `open-mercato`. Your app's commit history stays in the original repository.

When publishing from a script, pass `--expect <snapshotId>` with the ID from `report.json` to skip the interactive prompt. If a GitHub operation fails partway through, run the `Retry:` command printed by the CLI. It uses `--resume` to continue where the operation stopped.

## 4. Generate the catalog entry

```bash
npx create-mercato-template describe --from ../my-template
```

`describe` prints the file path on the first line, followed by the catalog entry as YAML. If it can't fill in a required field, it adds a comment telling you what to supply. For `useCase`, `summary` and `whenToUse`, pass the suggested flags and run `describe` again. For example, a wholesale ordering portal might use:

```bash
npx create-mercato-template describe --from ../my-template \
  --use-case b2b-portal \
  --summary "A self-service ordering portal for wholesale customers." \
  --when-to-use "Use when wholesale customers need to place repeat orders themselves."
```

The entry requires four fields:

| Field       | What to provide                                                                 |
| ----------- | ------------------------------------------------------------------------------- |
| `github`    | The template's GitHub repository.                                               |
| `useCase`   | The use case the template serves.                                               |
| `summary`   | What the app does, in 20 to 140 characters.                                     |
| `whenToUse` | When someone should choose it, in 40 to 240 characters. Start with `Use when `. |

Use plain text for the descriptions. Leave out links, Markdown, HTML, backticks and long dashes. You can also set `ref`, `whenNotToUse` (up to 160 characters), `links`, `screenshots`, `pricing`, `declares` and `smoke`.

Once you've supplied all required values, the YAML is ready to submit. For the full list of CLI flags, see the [`create-mercato-template` guide](https://github.com/open-mercato/create-mercato-template/blob/main/docs/guide.md).

## 5. Add the entry to the catalog

1. Fork [`open-mercato/modules`](https://github.com/open-mercato/modules) and clone your fork. Save the YAML at the path printed by `describe`, under `templates/<owner>/<repo>.yml`. Use lowercase for the owner and repository name.
2. In your clone, run `yarn install`, then `yarn om format templates`. The [development README](../README.md#development) lists the Node.js and Yarn versions used by the catalog.
3. Commit the entry and open a pull request. Tick `I maintain this package or have the maintainer's consent`.
4. Read the summary from the `validate` check and fix any issues it lists. A maintainer reviews and merges the entry.

Leave `slug`, `status`, `reason`, `alternatives`, `supersededBy` and `featured` to the curator. The field definitions and review checklist are in [CONTRIBUTING.md](../CONTRIBUTING.md#templates).

## Create an app from your template

As soon as the repository is public, anyone can create an app from it using the GitHub owner and repository name:

```bash
npx create-mercato-app my-app --template your-name/my-template
```

Once a curator assigns a catalog slug, you can use the slug in place of `your-name/my-template`. To select a branch, tag or commit, append `#ref` to the template name.

Before downloading, the CLI prints `Template: owner/repo@<sha> (<state>)`. The state is `verified` or a form of `not verified`. For example, a repository that hasn't been listed yet shows `not listed, not verified`.

The CLI sets the new app's name in `package.json`, adds an `openMercatoTemplate` field and removes `mercato-template.json`. Pass `--keep-name` to keep the template's package name.

If your version of `create-mercato-app` predates `--template`, use:

```bash
npx create-mercato-app my-app --app-url https://github.com/your-name/my-template
```

## Keep your catalog entry active

Keep the template repository public and unarchived, with Yarn 4 declared in the root `package.json`. Keep the README specific to the app and choose a repository name that's unreserved and easy to distinguish from other templates.

Two things can put an entry on hold:

- A missing or unrecognized license. The catalog checks the text of the root `LICENSE` file first. If it doesn't recognize that text, a license declaration in `package.json` won't pass validation for an active entry.
- An outdated Open Mercato release line. The `validate` check reports how far behind the template is. A curator decides whether to put the entry on hold.

While an entry is on hold, the gallery shows the curator's reason, hides the create command and the CLI refuses to create an app from that entry.

## Publish a private template

Prepare and review the snapshot as described in steps 1 and 2. When you publish, use `--private`:

```bash
npx create-mercato-template publish --from ../my-template --repo your-name/my-template --private
```

Skip the catalog steps. Private templates are shared through GitHub repository access. To create an app from one, set `GITHUB_TOKEN` to a token with read access to the repository, then run:

```bash
npx create-mercato-app my-app --template your-name/my-template
```
