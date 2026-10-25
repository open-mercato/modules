// Locator, descriptor path and page address (spec 4.2). The locator is the key of an entry;
// the module ID is an attribute (two entries may share an ID, #7289).
import { GithubRepo, Locator, LocPath, NpmName } from './common.ts'

export type ParsedLocator =
  { source: 'npm'; locator: string; name: string } | { source: 'github'; locator: string; owner: string; repo: string }

export class LocatorError extends Error {}

/** Parses `npm:<name>` or `github:<owner>/<repo>`. Throws LocatorError on anything else. */
export function parseLocator(s: string): ParsedLocator {
  if (!Locator.safeParse(s).success) throw new LocatorError(`invalid locator: ${JSON.stringify(s)}`)
  if (s.startsWith('npm:')) return { source: 'npm', locator: s, name: s.slice(4) }
  const [owner, repo] = s.slice(7).split('/') as [string, string]
  return { source: 'github', locator: s, owner, repo }
}

/** Locator to path without extension: `@scope/name`, `name` or `github/owner/repo` (GitHub always lower case). */
export function locatorToPath(loc: string): string {
  const p = parseLocator(loc)
  return p.source === 'npm' ? p.name : `github/${p.owner.toLowerCase()}/${p.repo.toLowerCase()}`
}

/**
 * Path (as in `modules/<path>.yml` or `/m/<path>`) back to a locator. GitHub paths are lower case,
 * so the returned GitHub locator is lower case too; compare GitHub locators case-insensitively.
 */
export function pathToLocator(path: string): string {
  if (!LocPath.safeParse(path).success) throw new LocatorError(`invalid path: ${JSON.stringify(path)}`)
  if (path.startsWith('github/')) return `github:${path.slice(7)}`
  return `npm:${path}`
}

/** Locator of a descriptor: `npm` wins over `github`. */
export function descriptorLocator(d: { npm?: string | undefined; github?: string | undefined }): string {
  if (d.npm !== undefined) {
    if (!NpmName.safeParse(d.npm).success) throw new LocatorError(`invalid npm name: ${JSON.stringify(d.npm)}`)
    return `npm:${d.npm}`
  }
  if (d.github !== undefined) {
    if (!GithubRepo.safeParse(d.github).success)
      throw new LocatorError(`invalid github repo: ${JSON.stringify(d.github)}`)
    return `github:${d.github}`
  }
  throw new LocatorError('npm or github is required')
}

/** Repo-relative descriptor file of a locator: `modules/<path>.yml`. */
export function descriptorFile(loc: string): string {
  return `modules/${locatorToPath(loc)}.yml`
}

/** Site page of a locator, without the base path: `/m/<path>`. */
export function pagePath(loc: string): string {
  return `/m/${locatorToPath(loc)}`
}

/** Throws when `file` (repo-relative or absolute, any separator) is not where the descriptor's locator says. */
export function assertPathMatches(file: string, d: { npm?: string | undefined; github?: string | undefined }): void {
  const expected = descriptorFile(descriptorLocator(d))
  const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '')
  if (normalized !== expected && !normalized.endsWith(`/${expected}`))
    throw new LocatorError(`descriptor path ${normalized} does not match its locator; expected ${expected}`)
}
