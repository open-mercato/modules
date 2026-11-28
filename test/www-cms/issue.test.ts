// Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 4.2 (A9): the body of the one issue a failed publish build or a
// snapshot fallback creates or updates, from a pull report. Every problem by file and field, inside a code fence that
// no line of them can close (so no mention, issue reference or link renders), no person named, the fixed title.
import { describe, expect, it } from 'vitest'
import { buildFailedBody, ISSUE_MAX_PROBLEMS, ISSUE_TITLE, issueBody, pullResultOf } from '../../lib/www-cms/issue.ts'
import type { PullReport } from '../../lib/www-cms/pull.ts'
import { decideContent } from '../../lib/www-cms/source.ts'

const RUN = 'https://github.com/open-mercato/modules/actions/runs/123'
const snapshot = { sha: '1a2b3c4d5e6f', date: '2026-11-28' }

/** A pull report as www-pull gives it for invalid published content. */
const report: PullReport = {
  counts: { 'blog-post': 3, job: 1 },
  media: { downloaded: 2, reused: 5 },
  changedMedia: [],
  newest: '2026-11-28T10:00:00.000Z',
  problems: [
    'jobs/senior-ai-engineering.md: title: Invalid input: expected string, received null',
    'blog/x.md: thumbnail.alt: Required',
    '/old-post: the URL was in the snapshot and is gone (renamed, deleted or unpublished); add a redirect from /old-post in Strapi',
    'blog/y.md: body: unknown count token {stars} written by @someone, see #12 and ```fence``` and ````',
  ],
  written: false,
  notes: [],
}

/** Lines outside every fenced block of a Markdown text. */
function outsideFences(text: string): string[] {
  const out: string[] = []
  let fence: string | undefined
  for (const line of text.split('\n')) {
    const m = /^(`{3,})/.exec(line)
    if (fence === undefined && m) fence = m[1]
    else if (fence !== undefined && line === fence) fence = undefined
    else if (fence === undefined) out.push(line)
  }
  expect(fence, 'every fence is closed').toBeUndefined()
  return out
}

describe('lib/www-cms/issue.ts: the issue of A9 (Step 4.2)', () => {
  it('a publish build with invalid content: every problem by file and field, in a fence no line closes', () => {
    const pull = pullResultOf(report)
    const decision = decideContent({ variable: 'strapi', input: 'publish', pull, snapshot })
    expect(decision).toMatchObject({ use: 'fail', issue: 'update' })
    const body = issueBody({ decision, pull, input: 'publish', runUrl: RUN })
    expect(body).toBe(
      [
        `The main site content from Strapi did not go live in [this run](${RUN}), started by a publish in Strapi.`,
        '',
        'The build stopped before the build of the site: nothing was deployed, and the site keeps its last good version.',
        '',
        '**Strapi content invalid:** 4 problems, by file and field.',
        '',
        '`````text',
        '- jobs/senior-ai-engineering.md: title: Invalid input: expected string, received null',
        '- blog/x.md: thumbnail.alt: Required',
        '- /old-post: the URL was in the snapshot and is gone (renamed, deleted or unpublished); add a redirect from /old-post in Strapi',
        '- blog/y.md: body: unknown count token {stars} written by @someone, see #12 and ```fence``` and ````',
        '`````',
        '',
        'Fix each one in Strapi and publish again.',
        '',
        'The next build that reads Strapi without a problem closes this issue. Written by the pages workflow; it has no assignee.',
        '',
      ].join('\n'),
    )
    // no mention and no issue reference outside the fence
    for (const line of outsideFences(body)) expect(line).not.toMatch(/@|#\d/)
  })

  it('a fallback to the snapshot: names the snapshot the site now shows', () => {
    const pull = pullResultOf(report)
    const decision = decideContent({ variable: 'strapi', input: undefined, pull, snapshot })
    const body = issueBody({ decision, pull, input: '', runUrl: RUN })
    expect(body).toContain('started by a push, the catalog data or the schedule.')
    expect(body).toContain(
      'The build used the snapshot 1a2b3c4d5e6f of the branch www-content instead, and deployed it: the site shows that content, not the latest in Strapi.',
    )
    expect(body).toContain('**Strapi content invalid:** 4 problems')
  })

  it('Strapi unreachable: the answer in a fence, and what to check', () => {
    const pull = { kind: 'unreachable', status: 'GET /api/landings: fetch failed (3 tries)\u0007' } as const
    const decision = decideContent({ variable: 'strapi', input: 'auto', pull, snapshot })
    const body = issueBody({ decision, pull, input: 'auto', runUrl: RUN })
    expect(body).toContain('started by hand.')
    expect(body).toContain(
      '**Strapi unreachable.** The answer of the pull:\n\n```text\nGET /api/landings: fetch failed (3 tries)\n```',
    )
    expect(body).not.toContain('\u0007')
  })

  it('lists at most ISSUE_MAX_PROBLEMS problems and counts the rest; long lines are cut', () => {
    const many = Array.from(
      { length: ISSUE_MAX_PROBLEMS + 7 },
      (_, i) => `blog/p${i}.md: title: Required ${'x'.repeat(400)}`,
    )
    const pull = pullResultOf({ problems: many, newest: null })
    const decision = decideContent({ variable: 'strapi', input: 'publish', pull, snapshot })
    const body = issueBody({ decision, pull, input: 'publish', runUrl: RUN })
    expect(body).toContain(`**Strapi content invalid:** ${ISSUE_MAX_PROBLEMS + 7} problems`)
    expect(body).toContain('- and 7 more, listed in the summary of the run')
    expect(body).not.toContain(`blog/p${ISSUE_MAX_PROBLEMS}.md`)
    expect(Math.max(...body.split('\n').map((l) => l.length))).toBeLessThanOrEqual(302)
    expect(body.length).toBeLessThan(65536)
  })

  it('refuses a decision that does not update the issue', () => {
    const pull = pullResultOf({ ...report, problems: [] })
    expect(pull).toEqual({ kind: 'good', newest: '2026-11-28T10:00:00.000Z' })
    const decision = decideContent({ variable: 'strapi', input: 'publish', pull, snapshot })
    expect(decision.issue).toBe('close')
    expect(() => issueBody({ decision, pull, input: 'publish', runUrl: RUN })).toThrow(/does not update the issue/)
  })

  it('a publish build that read Strapi and failed later, and the fixed title', () => {
    const body = buildFailedBody(RUN)
    expect(body).toContain(`did not go live in [this run](${RUN}), started by a publish in Strapi.`)
    expect(body).toContain('nothing new was deployed')
    for (const line of outsideFences(body)) expect(line).not.toMatch(/@|#\d/)
    expect(ISSUE_TITLE).toBe('Main site content from Strapi is not live')
  })
})
