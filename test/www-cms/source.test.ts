// Strapi CMS spec 2026-11-27-www-strapi-cms.md, Step 1.3: the decision table of Edge Cases (and of the `pages`
// workflow in API Contracts) as one function, one case per row.
import { describe, expect, it } from 'vitest'
import { decideContent, pullMode, type Decision, type SourceInput } from '../../lib/www-cms/source.ts'

const snapshot = { sha: '1a2b3c4', date: '2026-11-27' }
const down = { kind: 'unreachable', status: '503' } as const
const invalid = {
  kind: 'invalid',
  problems: ['blog/x.md: thumbnail.alt is required', 'case-studies/y.md: stats: 4'],
} as const
const good = { kind: 'good', newest: '2026-11-27T10:00:00.000Z', differs: 0 } as const

const ROWS: [row: string, input: SourceInput, expected: Partial<Decision> & { use: Decision['use'] }][] = [
  // Edge Cases
  [
    'Strapi down or timing out, build started by a publish: fails with Strapi unreachable',
    { variable: 'strapi', input: 'publish', pull: down, snapshot },
    { use: 'fail', reason: 'Strapi unreachable: 503.', issue: 'update' },
  ],
  [
    'Strapi down, any other build: the snapshot, with a warning line, and the issue updated',
    { variable: 'strapi', input: undefined, pull: down, snapshot },
    {
      use: 'snapshot',
      commit: '1a2b3c4',
      issue: 'update',
      summary: ['Main site content from snapshot 1a2b3c4 of 2026-11-27: Strapi unreachable: 503.'],
    },
  ],
  [
    'Strapi down, a dispatch by hand with www_content auto: the snapshot too',
    { variable: 'strapi', input: 'auto', pull: down, snapshot },
    { use: 'snapshot', commit: '1a2b3c4', issue: 'update' },
  ],
  [
    'Strapi down and no snapshot yet: fails',
    { variable: 'strapi', input: undefined, pull: down },
    { use: 'fail', reason: 'Strapi unreachable: 503, and there is no snapshot to fall back to.', issue: 'update' },
  ],
  [
    'Content invalid, build started by a publish: fails with every problem listed',
    { variable: 'strapi', input: 'publish', pull: invalid, snapshot },
    {
      use: 'fail',
      reason: 'Strapi content invalid.\n- blog/x.md: thumbnail.alt is required\n- case-studies/y.md: stats: 4',
      issue: 'update',
    },
  ],
  [
    'Content invalid, any other build: the snapshot, with Strapi content invalid as the reason',
    { variable: 'strapi', input: undefined, pull: invalid, snapshot },
    {
      use: 'snapshot',
      commit: '1a2b3c4',
      issue: 'update',
      summary: [
        'Main site content from snapshot 1a2b3c4 of 2026-11-27: Strapi content invalid.',
        '- blog/x.md: thumbnail.alt is required',
        '- case-studies/y.md: stats: 4',
      ],
    },
  ],
  [
    'A publish while WWW_CONTENT_SOURCE is files: the build reads the files',
    { variable: 'files', input: 'publish', pull: { kind: 'not-run' } },
    { use: 'files', writeSnapshot: false, issue: 'none' },
  ],
  [
    'A publish while WWW_CONTENT_SOURCE is shadow: the build reads the files and only compares',
    { variable: 'shadow', input: 'publish', pull: { ...good, differs: 2 } },
    { use: 'files', writeSnapshot: true, summary: ['Strapi shadow: 2 files differ.'] },
  ],
  // the pages workflow (API Contracts)
  [
    'WWW_CONTENT_SOURCE unset: files, nothing changes',
    { variable: undefined, input: undefined, pull: { kind: 'not-run' } },
    { use: 'files', writeSnapshot: false, issue: 'none', summary: [] },
  ],
  [
    'shadow with a good pull: the files, the comparison in the summary, and a snapshot for the first strapi build',
    { variable: 'shadow', input: undefined, pull: good },
    { use: 'files', writeSnapshot: true, issue: 'none', summary: ['Strapi shadow: 0 files differ.'] },
  ],
  [
    'shadow with Strapi down: the files, and no snapshot of a pull that did not happen',
    { variable: 'shadow', input: undefined, pull: down },
    { use: 'files', writeSnapshot: false, summary: ['Strapi shadow: Strapi unreachable: 503.'] },
  ],
  [
    'strapi with a good pull: the pulled content, the snapshot job, and the issue closed',
    { variable: 'strapi', input: 'publish', pull: good, snapshot },
    { use: 'pull', writeSnapshot: true, issue: 'close' },
  ],
  [
    'www_content snapshot with a commit: that commit, never Strapi',
    { variable: 'strapi', input: 'snapshot', snapshotCommit: '9f8e7d6c', pull: { kind: 'not-run' } },
    { use: 'snapshot', commit: '9f8e7d6c', writeSnapshot: false, issue: 'none' },
  ],
  [
    'www_content snapshot without a commit: fails',
    { variable: 'strapi', input: 'snapshot', pull: { kind: 'not-run' } },
    { use: 'fail', reason: 'www_content: snapshot needs the commit of www-content to build.' },
  ],
  [
    'a snapshot commit with another www_content: fails',
    { variable: 'strapi', input: 'publish', snapshotCommit: '9f8e7d6c', pull: good },
    { use: 'fail', reason: 'The snapshot input is read only with www_content: snapshot.' },
  ],
  [
    'www_content outside its enum: fails',
    { variable: 'strapi', input: 'deploy', pull: { kind: 'not-run' } },
    { use: 'fail', reason: 'www_content is "deploy": it must be auto, publish or snapshot.' },
  ],
  [
    'WWW_CONTENT_SOURCE outside its values: fails',
    { variable: 'cms', input: undefined, pull: { kind: 'not-run' } },
    { use: 'fail', reason: 'WWW_CONTENT_SOURCE is "cms": it must be files, shadow or strapi.' },
  ],
]

describe('lib/www-cms/source.ts: which content a build uses (Step 1.3)', () => {
  for (const [row, input, expected] of ROWS) {
    it(row, () => {
      expect(decideContent(input)).toMatchObject(expected)
    })
  }

  it('never deploys anything but the pull from a publish in strapi mode', () => {
    for (const pull of [down, invalid, { kind: 'not-run' } as const])
      expect(decideContent({ variable: 'strapi', input: 'publish', pull, snapshot }).use).toBe('fail')
  })

  it('pulls only when the variable asks for it, and never for a snapshot build', () => {
    expect(pullMode(undefined, undefined)).toBe('none')
    expect(pullMode('files', 'publish')).toBe('none')
    expect(pullMode('shadow', undefined)).toBe('compare')
    expect(pullMode('strapi', 'publish')).toBe('replace')
    expect(pullMode('strapi', 'snapshot')).toBe('none')
    expect(pullMode('cms', undefined)).toBe('none')
  })
})
