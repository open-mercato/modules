// Which content a build of the main site uses (Strapi CMS spec 2026-11-27-www-strapi-cms.md, Edge Cases and API
// Contracts, `pages` workflow; Step 1.3): from the repository variable WWW_CONTENT_SOURCE, the `www_content` input of
// the run, and what the pull of Strapi gave, to the files of the commit, the pulled content, the `www-content`
// snapshot, or a failed build. A build started by a publish fails loudly, so the editor learns the publish did not go
// live; every other build falls back to the last good snapshot and keeps the catalog's deploys going (A3). The issue
// of A9 is updated on every failure and fallback and closed by the next good Strapi build. Isomorphic: no Node APIs.

/** The values of WWW_CONTENT_SOURCE; unset is `files`. */
export const CONTENT_SOURCES = ['files', 'shadow', 'strapi'] as const
export type ContentSource = (typeof CONTENT_SOURCES)[number]

/** The values of the `www_content` input of workflow_dispatch; a run of another trigger is `auto`. */
export const WWW_CONTENT_INPUTS = ['auto', 'publish', 'snapshot'] as const
export type WwwContentInput = (typeof WWW_CONTENT_INPUTS)[number]

/** What the pull of Strapi gave (Read www content); `not-run` when the build did not pull. */
export type PullResult =
  | { kind: 'not-run' }
  /** Valid content; `differs` is the number of files that differ from www/content (shadow mode). */
  | { kind: 'good'; newest: string; differs?: number }
  | { kind: 'unreachable'; status: string }
  | { kind: 'invalid'; problems: readonly string[] }

/** The last good snapshot, the newest commit of the branch `www-content`; undefined while none exists. */
export interface Snapshot {
  sha: string
  date: string
}

export interface SourceInput {
  /** WWW_CONTENT_SOURCE as the run reads it. */
  variable: string | undefined
  /** The `www_content` input; undefined for push, workflow_run and schedule. */
  input: string | undefined
  /** The `snapshot` input: a commit of `www-content`, only with `www_content: snapshot`. */
  snapshotCommit?: string
  pull: PullResult
  snapshot?: Snapshot
}

/** What happens to the issue of A9. */
export type IssueAction = 'update' | 'close' | 'none'

export type Decision =
  /** The build reads www/content of the commit; in shadow mode the pull only compared. */
  | { use: 'files'; writeSnapshot: boolean; issue: IssueAction; summary: string[] }
  /** The pulled content replaces www/content and the media; the snapshot job writes it after the deploy. */
  | { use: 'pull'; writeSnapshot: true; issue: IssueAction; summary: string[] }
  /** The build reads a commit of `www-content` and never Strapi. */
  | { use: 'snapshot'; commit: string; writeSnapshot: false; issue: IssueAction; summary: string[] }
  /** Nothing deploys; the live site keeps its last good version. */
  | { use: 'fail'; reason: string; issue: IssueAction }

/** How the build reads Strapi before deciding: not at all, into a temporary directory to compare, or for real. */
export type PullMode = 'none' | 'compare' | 'replace'

const SHA_RE = /^[0-9a-f]{7,40}$/

/** WWW_CONTENT_SOURCE, unset as `files`; undefined for a value that is none of them. */
function sourceOf(variable: string | undefined): ContentSource | undefined {
  const v = variable?.trim() ?? ''
  if (v === '') return 'files'
  return (CONTENT_SOURCES as readonly string[]).includes(v) ? (v as ContentSource) : undefined
}

/** The `www_content` input, absent as `auto`; undefined for a value that is none of them. */
function inputOf(input: string | undefined): WwwContentInput | undefined {
  const v = input?.trim() ?? ''
  if (v === '') return 'auto'
  return (WWW_CONTENT_INPUTS as readonly string[]).includes(v) ? (v as WwwContentInput) : undefined
}

/** Whether and how the build pulls Strapi, before it knows the result: decided by the variable and the input alone. */
export function pullMode(variable: string | undefined, input: string | undefined): PullMode {
  const source = sourceOf(variable)
  const trigger = inputOf(input)
  if (source === undefined || trigger === undefined || trigger === 'snapshot') return 'none'
  return source === 'files' ? 'none' : source === 'shadow' ? 'compare' : 'replace'
}

/** One line of a problem list in the run summary, as many as there are. */
const problemLines = (problems: readonly string[]): string[] => problems.map((p) => `- ${p}`)

/** The content a build uses, and what it reports. Every row of the spec's Edge Cases that the build decides is here. */
export function decideContent(x: SourceInput): Decision {
  const source = sourceOf(x.variable)
  if (source === undefined)
    return {
      use: 'fail',
      reason: `WWW_CONTENT_SOURCE is "${x.variable}": it must be files, shadow or strapi.`,
      issue: 'none',
    }
  const trigger = inputOf(x.input)
  if (trigger === undefined)
    return { use: 'fail', reason: `www_content is "${x.input}": it must be auto, publish or snapshot.`, issue: 'none' }
  if (x.snapshotCommit !== undefined && x.snapshotCommit !== '' && trigger !== 'snapshot')
    return { use: 'fail', reason: 'The snapshot input is read only with www_content: snapshot.', issue: 'none' }

  // rollback: a commit of www-content, whatever the variable says, and Strapi is never read
  if (trigger === 'snapshot') {
    const commit = x.snapshotCommit?.trim() ?? ''
    if (!SHA_RE.test(commit))
      return { use: 'fail', reason: 'www_content: snapshot needs the commit of www-content to build.', issue: 'none' }
    return {
      use: 'snapshot',
      commit,
      writeSnapshot: false,
      issue: 'none',
      summary: [`Main site content from snapshot ${commit}, by hand (www_content: snapshot).`],
    }
  }

  const publish = trigger === 'publish'
  const pull = x.pull

  if (source === 'files')
    return {
      use: 'files',
      writeSnapshot: false,
      issue: 'none',
      summary: publish ? ['A publish build while WWW_CONTENT_SOURCE is files: the build reads the files.'] : [],
    }

  if (source === 'shadow') {
    if (pull.kind === 'good')
      return {
        use: 'files',
        // the first strapi build then already has a fallback
        writeSnapshot: true,
        issue: 'none',
        summary: [`Strapi shadow: ${pull.differs ?? 0} files differ.`],
      }
    const why = pull.kind === 'unreachable' ? `Strapi unreachable: ${pull.status}.` : 'Strapi content invalid.'
    // the problems are what has to be fixed in Strapi before the source switch (Phase 6), so the summary lists them
    const problems = pull.kind === 'invalid' ? problemLines(pull.problems) : []
    return {
      use: 'files',
      writeSnapshot: false,
      issue: 'none',
      summary: pull.kind === 'not-run' ? ['Strapi shadow: not read.'] : [`Strapi shadow: ${why}`, ...problems],
    }
  }

  // strapi
  if (pull.kind === 'good')
    return {
      use: 'pull',
      writeSnapshot: true,
      issue: 'close',
      summary: [`Main site content from Strapi, newest change ${pull.newest}.`],
    }
  if (pull.kind === 'not-run') return { use: 'fail', reason: 'Strapi was not read in strapi mode.', issue: 'update' }

  const reason = pull.kind === 'unreachable' ? `Strapi unreachable: ${pull.status}` : 'Strapi content invalid'
  const problems = pull.kind === 'invalid' ? problemLines(pull.problems) : []
  // a publish must not go live from anything else: the editor learns it did not (A3)
  if (publish) return { use: 'fail', reason: [`${reason}.`, ...problems].join('\n'), issue: 'update' }
  if (x.snapshot === undefined)
    return {
      use: 'fail',
      reason: [`${reason}, and there is no snapshot to fall back to.`, ...problems].join('\n'),
      issue: 'update',
    }
  return {
    use: 'snapshot',
    commit: x.snapshot.sha,
    writeSnapshot: false,
    issue: 'update',
    summary: [`Main site content from snapshot ${x.snapshot.sha} of ${x.snapshot.date}: ${reason}.`, ...problems],
  }
}

/** What the first step of the build does, before any secret: read Strapi, or use a content it can decide alone. */
export type Plan = { pull: 'compare' | 'replace' } | { pull: 'none'; decision: Decision }

/**
 * The plan of a build from the variable and the inputs alone (step Choose www content of `pages`): when the build
 * pulls Strapi, the step that holds the token decides after the pull; otherwise the decision is made here, without
 * the token: the files, a snapshot commit by hand, or a failure on a value outside its enum.
 */
export function planContent(x: Pick<SourceInput, 'variable' | 'input' | 'snapshotCommit'>): Plan {
  const mode = pullMode(x.variable, x.input)
  const decision = decideContent({ ...x, pull: { kind: 'not-run' } })
  // a value outside its enum, or a snapshot commit without www_content: snapshot, fails before any read
  if (mode === 'none' || (decision.use === 'fail' && decision.issue === 'none')) return { pull: 'none', decision }
  return { pull: mode }
}
