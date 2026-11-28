// The issue of A9 (Strapi CMS spec 2026-11-27-www-strapi-cms.md, Resolved assumptions A9 and Edge Cases; Step 4.2):
// one issue of this repository, under a fixed title, that a failed publish build or a build that fell back to the
// snapshot creates or updates with the cause, and that the next build which reads Strapi without a problem closes.
// It names no person and has no assignee: the problem lines (by file and field, from a published pull, so no draft
// text) go inside a code fence that no line of them can close, where GitHub renders no mention, reference or link.
// Isomorphic: no Node APIs.
import type { Decision, PullResult } from './source.ts'

/** The fixed title the workflow finds the open issue by. */
export const ISSUE_TITLE = 'Main site content from Strapi is not live'

/** The most problem lines in the body; the run summary has them all. */
export const ISSUE_MAX_PROBLEMS = 200

/** GitHub refuses an issue body above 65536 characters; the body stays well below. */
const MAX_LINE = 300

export interface IssueFacts {
  /** The decision of lib/www-cms/source.ts: a failure, or the snapshot as a fallback. */
  decision: Decision
  /** What the pull gave. */
  pull: PullResult
  /** The `www_content` input of the run, empty for push, workflow_run and schedule. */
  input: string
  /** The address of the run. */
  runUrl: string
}

/** What a pull report says, for source.ts: problems make it invalid, otherwise it is good. */
export function pullResultOf(report: { problems: readonly string[]; newest: string | null }): PullResult {
  return report.problems.length > 0
    ? { kind: 'invalid', problems: [...report.problems] }
    : { kind: 'good', newest: report.newest ?? 'none' }
}

/** A line as plain text: no control characters, at most MAX_LINE characters. */
const plain = (s: string): string => {
  const t = s
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > MAX_LINE ? `${t.slice(0, MAX_LINE - 3)}...` : t
}

/** Lines in a fence longer than any run of backticks in them, so no line can end it. */
function fenced(lines: readonly string[]): string[] {
  const longest = Math.max(0, ...lines.map((l) => Math.max(0, ...[...l.matchAll(/`+/g)].map((m) => m[0].length))))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return [`${fence}text`, ...lines, fence]
}

/** The body of the issue for a decision that updates it (`issue: 'update'`). */
export function issueBody(x: IssueFacts): string {
  const d = x.decision
  if (d.issue !== 'update') throw new Error(`the decision ${d.use} does not update the issue`)
  const what =
    d.use === 'fail'
      ? `The build stopped before the build of the site: nothing was deployed, and the site keeps its last good version.`
      : d.use === 'snapshot'
        ? `The build fell back to the snapshot ${d.commit} of the branch www-content: once it is deployed, the site shows that content, not the latest in Strapi.`
        : `The build read Strapi.`
  const started =
    x.input === 'publish' ? 'a publish in Strapi' : x.input === '' ? 'a push, the catalog data or the schedule' : 'hand'
  const lines: string[] = [
    `The main site content from Strapi did not go live in [this run](${x.runUrl}), started by ${started}.`,
    '',
    what,
    '',
  ]
  const pull = x.pull
  if (pull.kind === 'invalid') {
    const shown = pull.problems.slice(0, ISSUE_MAX_PROBLEMS).map((p) => `- ${plain(p)}`)
    const more = pull.problems.length - shown.length
    lines.push(
      `**Strapi content invalid:** ${pull.problems.length} ${pull.problems.length === 1 ? 'problem' : 'problems'}, by file and field.`,
      '',
      ...fenced(more > 0 ? [...shown, `- and ${more} more, listed in the summary of the run`] : shown),
      '',
      'Fix each one in Strapi and publish again.',
    )
  } else if (pull.kind === 'unreachable') {
    lines.push(
      '**Strapi unreachable.** The answer of the pull:',
      '',
      ...fenced([plain(pull.status)]),
      '',
      'Check the Strapi host and the token (docs/RUNBOOK.md), then start the pages workflow again or publish again.',
    )
  } else {
    lines.push('**Strapi was not read.** See the run for the reason.')
  }
  lines.push(
    '',
    'The next build that reads Strapi without a problem closes this issue. Written by the pages workflow; it has no assignee.',
  )
  return `${lines.join('\n')}\n`
}

/** The body for a publish build that read Strapi without a problem and then failed in a later step. */
export function buildFailedBody(runUrl: string): string {
  return [
    `The main site content from Strapi did not go live in [this run](${runUrl}), started by a publish in Strapi.`,
    '',
    'Strapi was read without a problem, then a later step of the build or the deploy failed: nothing new was deployed, and the site keeps its last good version. The failed step is in the run.',
    '',
    'The next build that reads Strapi without a problem closes this issue. Written by the pages workflow; it has no assignee.',
    '',
  ].join('\n')
}
