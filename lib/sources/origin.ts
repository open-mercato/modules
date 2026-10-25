// Type of an entry (spec 6.1, D25, D38, D-OPEN-6): official / community / 3rd-party, with a one-line reason.
// Never from the YAML and never from `author` in index.ts.
import type { CommunityFile, OfficialMaintainersFile, OriginType } from '../schema/index.ts'
import { ownerOf } from './github.ts'
import { isPartnerCompany, type Partners } from './partners.ts'

export interface OriginInput {
  locator: string
  kind: 'module' | 'provider' | 'library' | 'tool'
  /** `owner/repo` of `repository.url` (npm) or of the locator (GitHub); null when there is none. */
  repo: string | null
  /** false = the repository returned 404; null = unknown (lookup failed). */
  repoExists: boolean | null
  /** Current owner type from GitHub when known. */
  ownerType: 'User' | 'Organization' | null
  npmMaintainers: string[]
}

export interface OriginContext {
  community: CommunityFile
  officialMaintainers: OfficialMaintainersFile
  partners: Partners | null
  /** `GET /orgs/open-mercato/public_members/{login}` (cached by the caller). */
  isOmMember: (login: string) => Promise<boolean>
}

export interface Origin {
  type: OriginType
  typeReason: string
}

const cut = (s: string) => s.slice(0, 200)

export async function originOf(e: OriginInput, ctx: OriginContext): Promise<Origin> {
  const org = ctx.officialMaintainers.githubOrg
  if (e.locator.startsWith('npm:@open-mercato/')) return { type: 'official', typeReason: 'Scope @open-mercato.' }
  if (e.locator.startsWith('npm:') && e.kind === 'tool' && e.repo && ownerOf(e.repo).toLowerCase() === org) {
    const official = new Set(ctx.officialMaintainers.npm)
    if (e.npmMaintainers.length > 0 && e.npmMaintainers.every((m) => official.has(m)))
      return {
        type: 'official',
        typeReason: cut(`Tool from the ${org} GitHub org published only by Open Mercato npm maintainers (D38).`),
      }
  }
  const owner = e.repo && e.repoExists !== false ? ownerOf(e.repo) : null
  if (owner) {
    const lc = owner.toLowerCase()
    if (ctx.community.owners.includes(lc))
      return { type: 'community', typeReason: cut(`Repository owner ${owner} is listed in policy/community.yml.`) }
    const mapped = ctx.community.orgs.find((o) => o.org.toLowerCase() === lc)
    if (mapped && (!ctx.partners || isPartnerCompany(ctx.partners, mapped.company)))
      return {
        type: 'community',
        typeReason: cut(
          `Repository owner ${owner} is the GitHub org of certified partner ${mapped.company} (policy/community.yml).`,
        ),
      }
    const company = ctx.partners?.contributors.get(lc)
    if (company)
      return {
        type: 'community',
        typeReason: cut(`Repository owner ${owner} is a contributor of certified partner ${company}.`),
      }
    if (e.ownerType !== 'Organization' && (await ctx.isOmMember(owner)))
      return { type: 'community', typeReason: cut(`Repository owner ${owner} is a public member of ${org}.`) }
    return {
      type: '3rd-party',
      typeReason: cut(`Owner ${owner} is not a public member of ${org} and not in policy/community.yml.`),
    }
  }
  const scope = e.locator.startsWith('npm:@') ? e.locator.slice(4).split('/')[0] : null
  if (scope && ctx.community.npmScopes.includes(scope))
    return {
      type: 'community',
      typeReason: cut(
        `${e.repo ? `Repository ${e.repo} returns 404` : 'No repository'}; npm scope ${scope} is listed in policy/community.yml.`,
      ),
    }
  return {
    type: '3rd-party',
    typeReason: cut(
      `${e.repo ? `Repository ${e.repo} returns 404` : 'No repository in package.json'}; npm scope is not in policy/community.yml.`,
    ),
  }
}
