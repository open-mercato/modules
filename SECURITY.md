# Security

## Reporting

Report a vulnerability in this repository, the site or the MCP server through GitHub private vulnerability reporting on this repository. Do not open a public issue. To report a malicious or compromised module, use the `Report a module` issue form, or private reporting when details should not be public yet.

## What the catalog does and does not promise

- Verified is a compatibility signal, not a security review. A module's own code runs during the nightly test.
- Anatomy is read statically from `src/` of the published tarball. Code is not executed. It describes what the code declares, not whether it is safe.
- OM Quality is a human review against a published checklist (`quality/checklist/v1.md`), valid for one published tarball.

## Controls

- Nightly installs run on disposable GitHub runners with no secrets and read-only tokens, as a separate user without sudo, with dependency install scripts disabled. Status comes from the Actions API, not from artifacts.
- No `pull_request_target`, no workflows triggered by comments. The nightly install runs only for entries merged by a person.
- Tarballs are unpacked with a filter: files and directories only, no symlinks, no `..`, size and file count limits.
- Author texts are plain text with length limits; README content is shown only as untrusted text.
- Dependencies of this repository use exact versions, a 14-day minimum age and disabled install scripts; actions are pinned to commit SHAs.
