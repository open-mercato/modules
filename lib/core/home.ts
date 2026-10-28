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

/**
 * Default site origin: Cloudflare Pages at the custom domain, the only place of the site (Piotr and owner decision
 * A(a), 28 Oct; GitHub Pages is no longer a target).
 */
export const DEFAULT_SITE_ORIGIN = 'https://modules.openmercato.com'

/** Default base path on that origin: the domain root. */
export const DEFAULT_BASE_PATH = '/'

/** Default site root plus base path, without a trailing slash (the origin itself while the base path is `/`). */
export const DEFAULT_SITE_URL = DEFAULT_SITE_ORIGIN

/** The address of the site (spec 1); since 28 Oct the same as the default. */
export const TARGET_SITE_URL = DEFAULT_SITE_URL

/** User-Agent suffix of the catalog's read-only fetchers. */
export const USER_AGENT_HOME = `+${CATALOG_REPO_URL}`
