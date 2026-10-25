// Where the catalog lives (orchestrator, round 13): the repository is open-mercato/modules, so every default address
// of the site, the emitter, the MCP card, the CLI and the skill reads these constants, never a personal account.
// SITE_URL, BASE_PATH, MCP_URL and GITHUB_REPOSITORY still override them at build and run time. Isomorphic.

/** The catalog repository on GitHub (`owner/name`). */
export const CATALOG_REPO = 'open-mercato/modules'

/** The repository URL (footer, /about, /submit, the Propose-an-edit links). */
export const CATALOG_REPO_URL = `https://github.com/${CATALOG_REPO}`

/**
 * Who maintains the catalog, as /about names it (round 14): the team of the organization the repository belongs to,
 * never a personal handle read from .github/CODEOWNERS (which names reviewers and changes at the transfer).
 */
export const CATALOG_MAINTAINERS = 'the Open Mercato core team'

/** Default site origin before the custom domain: GitHub Pages of the repository's owner. */
export const DEFAULT_SITE_ORIGIN = 'https://open-mercato.github.io'

/** Default base path on that origin (the repository name). */
export const DEFAULT_BASE_PATH = '/modules'

/** Default site root plus base path, without a trailing slash. */
export const DEFAULT_SITE_URL = `${DEFAULT_SITE_ORIGIN}${DEFAULT_BASE_PATH}`

/** The address the site moves to once the domain routes there (spec 1). */
export const TARGET_SITE_URL = 'https://modules.openmercato.com'

/** User-Agent suffix of the catalog's read-only fetchers. */
export const USER_AGENT_HOME = `+${CATALOG_REPO_URL}`
