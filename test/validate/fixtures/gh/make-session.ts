// Builds session.json: the gh answers `yarn om triage` gets for six open new-entry pull requests.
// The catalog repository has no pull requests yet, so the answers are written here in the exact shape of
// `gh pr list --json ...` (checked against a live `gh pr list` of open-mercato/open-mercato on 2026-10-23:
// files[].changeType, statusCheckRollup[].__typename/name/status/conclusion, headRepository.nameWithOwner)
// and of the contents API (`encoding: base64`, content wrapped at 60 characters).
// Run: node test/validate/fixtures/gh/make-session.ts
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'open-mercato/modules'
const FIELDS =
  'number,title,author,headRefOid,headRepository,headRepositoryOwner,isCrossRepository,isDraft,mergeable,labels,files,statusCheckRollup,url'

const sha = (n: number) => `${n}`.padStart(4, '0').repeat(10)
const check = (conclusion: string | null, status = 'COMPLETED', at = '2026-10-23T10:00:00Z') => ({
  __typename: 'CheckRun',
  completedAt: status === 'COMPLETED' ? at : '0001-01-01T00:00:00Z',
  conclusion: conclusion ?? '',
  detailsUrl: `https://github.com/${REPO}/actions/runs/1/job/1`,
  name: 'validate',
  startedAt: at,
  status,
  workflowName: 'validate',
})
const pr = (o: {
  number: number
  title: string
  author: string
  fork: boolean
  draft?: boolean
  mergeable?: string
  labels?: string[]
  files: { path: string; changeType: string }[]
  checks: unknown[]
}) => ({
  author: { id: `U_${o.author}`, is_bot: false, login: o.author, name: '' },
  files: o.files.map((f) => ({ ...f, additions: 9, deletions: f.changeType === 'ADDED' ? 0 : 1 })),
  headRefOid: sha(o.number),
  headRepository: {
    id: `R_${o.number}`,
    name: 'modules',
    nameWithOwner: o.fork ? `${o.author}/modules` : REPO,
  },
  headRepositoryOwner: { id: `O_${o.number}`, login: o.fork ? o.author : 'wojciechszyjka' },
  isCrossRepository: o.fork,
  isDraft: o.draft ?? false,
  labels: ['new-entry', ...(o.labels ?? [])].map((name) => ({
    id: `LA_${name}`,
    name,
    description: '',
    color: 'ededed',
  })),
  mergeable: o.mergeable ?? 'MERGEABLE',
  number: o.number,
  statusCheckRollup: o.checks,
  title: o.title,
  url: `https://github.com/${REPO}/pull/${o.number}`,
})

const content = (path: string, text: string) => {
  const b64 = Buffer.from(text, 'utf8').toString('base64')
  return JSON.stringify({
    name: path.split('/').pop(),
    path,
    sha: 'f'.repeat(40),
    size: Buffer.byteLength(text),
    type: 'file',
    encoding: 'base64',
    content: `${b64.match(/.{1,60}/g)?.join('\n')}\n`,
  })
}

const LOYALTY = `npm: "@acme-labs/om-loyalty"
github: acme-labs/om-loyalty
category: marketing-loyalty
tags: [loyalty, points]
summary: Loyalty points for customers, earned on paid orders and spent at checkout.
whenToUse: Use when the shop rewards repeat customers with points they can spend on later orders.
`
const BROKEN = `npm: "@acme-labs/om-crm-notes"
category: crm
summary: Notes.
whenToUse: For notes.
`
const SQUAT = `npm: "@fastwhite-cat/integration-ksef-direct"
category: localization-compliance
summary: Sends and receives Polish structured e-invoices through the KSeF API v2.
whenToUse: Use when the app must issue or receive structured invoices in KSeF (Poland).
`
const KSEF_UPDATE = `npm: "@fastwhitecat/integration-ksef-direct"
github: FastWhiteCat/openmercato-module-ksef
category: localization-compliance
tags: [ksef, e-invoicing, poland]
summary: Sends and receives Polish structured e-invoices through the KSeF API v2.
whenToUse: Use when the app must issue or receive structured invoices in KSeF (Poland) and you have a KSeF token for the NIP.
providers:
  - { name: ksef, label: KSeF }
renamedFrom: ["npm:@fast-white-cat/integration-ksef-direct"]
featured: true
`
const WAREHOUSE = `npm: "@acme-labs/om-bins"
category: warehouse-shipping
summary: Bin locations and pick lists for small warehouses that run on Open Mercato.
whenToUse: Use when staff pick orders from shelves and need bin locations on the pick list.
`

const prs = [
  pr({
    number: 101,
    title: 'Add @acme-labs/om-loyalty',
    author: 'acme-labs',
    fork: true,
    files: [{ path: 'modules/@acme-labs/om-loyalty.yml', changeType: 'ADDED' }],
    checks: [
      check('FAILURE', 'COMPLETED', '2026-10-23T09:00:00Z'),
      check('SUCCESS', 'COMPLETED', '2026-10-23T10:00:00Z'),
    ],
  }),
  pr({
    number: 102,
    title: 'Add crm notes',
    author: 'acme-labs',
    fork: true,
    files: [{ path: 'modules/@acme-labs/om-crm-notes.yml', changeType: 'ADDED' }],
    checks: [check('FAILURE')],
  }),
  pr({
    number: 103,
    title: 'Add KSeF integration',
    author: 'someone-new',
    fork: true,
    files: [{ path: 'modules/@fastwhite-cat/integration-ksef-direct.yml', changeType: 'ADDED' }],
    checks: [check(null, 'IN_PROGRESS')],
  }),
  pr({
    number: 104,
    title: 'Feature KSeF',
    author: 'FastWhiteCat',
    fork: true,
    files: [{ path: 'modules/@fastwhitecat/integration-ksef-direct.yml', changeType: 'MODIFIED' }],
    checks: [check('SUCCESS')],
  }),
  pr({
    number: 105,
    title: 'Add bins and fix the CLI',
    author: 'acme-labs',
    fork: true,
    files: [
      { path: 'modules/@acme-labs/om-bins.yml', changeType: 'ADDED' },
      { path: 'lib/cli.ts', changeType: 'MODIFIED' },
    ],
    checks: [check('SUCCESS')],
  }),
  pr({
    number: 106,
    title: 'WIP bins',
    author: 'acme-labs',
    fork: true,
    draft: true,
    mergeable: 'CONFLICTING',
    files: [{ path: 'modules/@acme-labs/om-bins.yml', changeType: 'ADDED' }],
    checks: [],
  }),
]

const api = (owner: string, path: string, n: number, text: string) => ({
  args: ['api', `repos/${owner}/modules/contents/${path}?ref=${sha(n)}`],
  code: 0,
  stdout: content(path, text),
  stderr: '',
})

const session = [
  {
    args: ['pr', 'list', '--repo', REPO, '--label', 'new-entry', '--state', 'open', '--limit', '200', '--json', FIELDS],
    code: 0,
    stdout: `${JSON.stringify(prs, null, 2)}\n`,
    stderr: '',
  },
  api('acme-labs', 'modules/@acme-labs/om-loyalty.yml', 101, LOYALTY),
  api('acme-labs', 'modules/@acme-labs/om-crm-notes.yml', 102, BROKEN),
  api('someone-new', 'modules/@fastwhite-cat/integration-ksef-direct.yml', 103, SQUAT),
  api('FastWhiteCat', 'modules/@fastwhitecat/integration-ksef-direct.yml', 104, KSEF_UPDATE),
  api('acme-labs', 'modules/@acme-labs/om-bins.yml', 105, WAREHOUSE),
  api('acme-labs', 'modules/@acme-labs/om-bins.yml', 106, WAREHOUSE),
  {
    args: ['pr', 'merge', '101', '--repo', REPO, '--squash', '--match-head-commit', sha(101)],
    code: 0,
    stdout: '',
    stderr: `Squashed and merged pull request ${REPO}#101 (Add @acme-labs/om-loyalty)\n`,
  },
]

const out = join(dirname(fileURLToPath(import.meta.url)), 'session.json')
writeFileSync(out, `${JSON.stringify(session, null, 2)}\n`)
console.log(`wrote ${out}`)
