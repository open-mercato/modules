// Claims (D26, spec 6.1 Ownership): an entry is Claimed when `repository.url` of the tarball is the entry's repository
// AND (provenance points to that repository OR the PR author owns it OR is a public member of the owning org).
// Evidence is the history of merged pull requests that touched the descriptor; curators' PRs never claim
// ("seeded by a curator = Unclaimed").
import type { Claims, SyncRecord } from '../schema/index.ts'
import { commitPulls, isPublicMember, ownerOf, sameRepo } from './github.ts'
import type { Http } from './http.ts'

export type Claim = Claims[string]

export interface ClaimInput {
  locator: string
  /** Entry's repository: descriptor `github` (or the GitHub locator), else `repository.url`. */
  entryRepo: string | null
  /** `owner/repo` of `repository.url` in the published package; null for GitHub-only entries. */
  tarballRepo: string | null
  ownerType: 'User' | 'Organization' | null
  provenance: SyncRecord['provenance']
  /** Commits that touched the descriptor, newest first. */
  commits: { sha: string }[]
}

export interface ClaimContext {
  http: Http
  /** The catalog repository, e.g. `open-mercato/modules`. */
  modulesRepo: string
  curators: string[]
  baseBranch?: string
}

const BOT = /\[bot\]$|^dependabot$|^github-actions$|^autofix-ci$/i

/** The claim the PR history proves, or null. Oldest merged PR wins. */
export async function claimFromHistory(input: ClaimInput, ctx: ClaimContext): Promise<Claim | null> {
  const repo = input.entryRepo
  if (!repo) return null
  const github = input.locator.startsWith('github:')
  if (!github && !sameRepo(input.tarballRepo, repo)) return null
  const owner = ownerOf(repo)
  const curators = new Set(ctx.curators.map((c) => c.toLowerCase()))
  const seen = new Set<number>()
  const pulls: { number: number; author: string; mergedAt: string }[] = []
  for (const c of [...input.commits].reverse()) {
    for (const p of await commitPulls(ctx.http, ctx.modulesRepo, c.sha)) {
      if (seen.has(p.number) || !p.mergedAt || p.baseRef !== (ctx.baseBranch ?? 'main')) continue
      seen.add(p.number)
      pulls.push({ number: p.number, author: p.author, mergedAt: p.mergedAt })
    }
  }
  pulls.sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))
  for (const p of pulls) {
    const author = p.author
    if (!author || BOT.test(author) || curators.has(author.toLowerCase())) continue
    const at = p.mergedAt.slice(0, 10)
    if (author.toLowerCase() === owner.toLowerCase()) return { by: author, method: 'repo-owner', pr: p.number, at }
    if (input.ownerType === 'Organization' && (await isPublicMember(ctx.http, owner, author)))
      return { by: author, method: 'org-member', pr: p.number, at }
    if (input.provenance.status === 'verified' && sameRepo(input.provenance.sourceRepo, repo))
      return { by: author, method: 'provenance', pr: p.number, at }
  }
  return null
}
