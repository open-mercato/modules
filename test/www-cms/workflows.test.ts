// The boundary between the Strapi project in cms/ and the site (spec 2026-11-27-www-strapi-cms.md, The cms/ folder,
// Step 2.1): a push that changes only cms/ does not build the site, cms.yml starts only for a change under cms/, reads
// nothing but the repository, holds no secret and starts Strapi from the Compose file with an empty database.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const text = (f: string) => readFileSync(join(ROOT, f), 'utf8')
interface Step {
  name: string
  run?: string
  if?: string
}
interface Workflow {
  on: Record<string, { branches?: string[]; paths?: string[]; 'paths-ignore'?: string[] } | null>
  permissions: Record<string, string>
  defaults: { run: { shell: string; 'working-directory'?: string } }
  jobs: Record<string, { 'runs-on': string; steps: Step[]; env?: Record<string, string> }>
}
const wf = (f: string) => parse(text(f)) as Workflow

describe('pages.yml and cms/', () => {
  it('ignores pushes that change only cms/, and keeps its other triggers', () => {
    const on = wf('.github/workflows/pages.yml').on
    expect(on.push).toEqual({ branches: ['main'], 'paths-ignore': ['cms/**'] })
    expect(Object.keys(on)).toEqual(['push', 'workflow_run', 'schedule', 'workflow_dispatch'])
    expect(JSON.stringify(on.workflow_run)).not.toContain('paths')
  })
})

describe('cms.yml', () => {
  const w = wf('.github/workflows/cms.yml')
  const steps = Object.values(w.jobs).flatMap((j) => j.steps)
  const run = (name: string) => steps.find((s) => s.name === name)?.run ?? ''

  it('runs only for a change under cms/: pull requests, and pushes to main', () => {
    expect(w.on).toEqual({
      pull_request: { paths: ['cms/**'] },
      push: { branches: ['main'], paths: ['cms/**'] },
    })
  })

  it('reads only, holds no secret, runs in cms/ on ubuntu-latest', () => {
    expect(w.permissions).toEqual({ contents: 'read' })
    expect(text('.github/workflows/cms.yml')).not.toMatch(/secrets\.|vars\./)
    expect(w.defaults.run['working-directory']).toBe('cms')
    for (const j of Object.values(w.jobs)) expect(j['runs-on']).toBe('ubuntu-latest')
  })

  it('installs from the lockfile of cms/, builds, tests and checks the Compose file', () => {
    expect(run('Install')).toBe('yarn install --immutable')
    expect(run('Build')).toBe('yarn build')
    expect(run('Unit tests')).toBe('yarn test')
    expect(run('Compose config')).toContain('docker compose -f compose.yaml config --quiet')
  })

  it('starts Strapi with an empty database, tests the instance, removes the volumes', () => {
    const env = Object.values(w.jobs)[0]?.env ?? {}
    expect(env.CMS_URL).toBe('http://127.0.0.1:1337')
    expect(run('Compose config')).toContain('./scripts/dev-env.sh')
    expect(run('Start with an empty database')).toBe('$CMS_COMPOSE up --detach --build --wait')
    expect(run('Instance tests')).toBe('yarn test:instance')
    const stop = steps.find((s) => s.name === 'Stop')
    expect(stop?.if).toBe('${{ always() }}')
    expect(stop?.run).toBe('$CMS_COMPOSE down --volumes')
  })

  it('publishes Strapi on 127.0.0.1 only, and the Compose file of the host publishes no port', () => {
    const host = parse(text('cms/compose.yaml')) as { services: Record<string, { ports?: string[] }> }
    for (const [name, s] of Object.entries(host.services)) expect(s.ports, name).toBeUndefined()
    const local = parse(text('cms/compose.test.yaml')) as { services: Record<string, { ports?: string[] }> }
    for (const p of local.services.strapi?.ports ?? []) expect(p).toMatch(/^127\.0\.0\.1:/)
  })
})

// Step 4.1: the main site's content in pages.yml. With WWW_CONTENT_SOURCE unset the build takes the files path: the
// only step that names the Strapi address or token is Read www content, and it runs only when the plan (which reads
// the variable and the inputs alone, test/www-cms/www-content.test.ts) pulls Strapi. Deploys run on main only, so a
// run on a branch (the test of www_content: snapshot) deploys nothing; the snapshot job alone may write contents.
describe('pages.yml: the main site content (Step 4.1)', () => {
  interface Job {
    needs?: string | string[]
    if?: string
    permissions?: Record<string, string>
    environment?: unknown
    outputs?: Record<string, string>
    steps: (Step & { id?: string; env?: Record<string, string>; with?: Record<string, unknown>; uses?: string })[]
  }
  const pages = parse(text('.github/workflows/pages.yml')) as {
    on: { workflow_dispatch: { inputs: Record<string, { type: string; options?: string[]; default: string }> } }
    permissions: Record<string, string>
    jobs: Record<string, Job>
  }
  const build = pages.jobs.build!
  const step = (name: string) => build.steps.find((s) => s.name === name)!

  it('takes the inputs www_content (auto, publish, snapshot) and snapshot', () => {
    const inputs = pages.on.workflow_dispatch.inputs
    expect(inputs.www_content).toMatchObject({
      type: 'choice',
      options: ['auto', 'publish', 'snapshot'],
      default: 'auto',
    })
    expect(inputs.snapshot).toMatchObject({ type: 'string', default: '' })
  })

  it('names STRAPI_URL and STRAPI_READ_TOKEN in Read www content only, which runs only when the plan pulls', () => {
    const naming = Object.entries(pages.jobs).flatMap(([job, j]) =>
      j.steps.filter((s) => /STRAPI|secrets\.STRAPI/.test(JSON.stringify(s))).map((s) => `${job}/${s.name}`),
    )
    expect(naming).toEqual(['build/Read www content'])
    const read = step('Read www content')
    expect(read.if).toBe("${{ steps.www.outputs.pull == 'compare' || steps.www.outputs.pull == 'replace' }}")
    expect(read.env).toMatchObject({
      STRAPI_URL: '${{ vars.STRAPI_URL }}',
      STRAPI_READ_TOKEN: '${{ secrets.STRAPI_READ_TOKEN }}',
    })
    expect(read.run).toContain('yarn om www-content read --work "$RUNNER_TEMP/www"')
    // every secret of the workflow: the Cloudflare token of the deploy jobs and this one
    expect([...new Set(text('.github/workflows/pages.yml').match(/secrets\.[A-Z_]+/g))].sort()).toEqual([
      'secrets.CLOUDFLARE_API_TOKEN',
      'secrets.STRAPI_READ_TOKEN',
    ])
  })

  it('plans from the variable and the inputs alone, before the build, without a secret', () => {
    const names = build.steps.map((s) => s.name)
    const at = (n: string) => names.indexOf(n)
    expect(at('Read data branch')).toBeLessThan(at('Choose www content'))
    expect(at('Choose www content')).toBeLessThan(at('Read www content'))
    expect(at('Read www content')).toBeLessThan(at('Use www snapshot'))
    expect(at('Use www snapshot')).toBeLessThan(at('Build'))
    const plan = step('Choose www content')
    expect(plan.id).toBe('www')
    expect(plan.if).toBeUndefined()
    expect(plan.run).toBe('yarn om www-content plan')
    expect(plan.env).toEqual({
      WWW_CONTENT_SOURCE: '${{ vars.WWW_CONTENT_SOURCE }}',
      WWW_CONTENT_INPUT: '${{ inputs.www_content }}',
      WWW_SNAPSHOT_INPUT: '${{ inputs.snapshot }}',
    })
    expect(step('Use www snapshot').if).toBe(
      "${{ steps.www.outputs.use == 'snapshot' || steps.read.outputs.use == 'snapshot' }}",
    )
    expect(JSON.stringify(step('Use www snapshot'))).not.toMatch(/secrets\./)
  })

  it('writes the snapshot only after a deploy of pulled content, from main, with contents: write on that job only', () => {
    expect(pages.permissions).toEqual({ contents: 'read' })
    const snap = pages.jobs['www-snapshot']!
    expect(snap.needs).toEqual(['build', 'deploy'])
    expect(snap.if).toBe(
      "${{ needs.build.outputs.www-snapshot == 'true' && needs.deploy.result == 'success' && github.ref == 'refs/heads/main' }}",
    )
    expect(snap.permissions).toEqual({ contents: 'write' })
    expect(build.outputs?.['www-snapshot']).toBe('${{ steps.read.outputs.snapshot }}')
    for (const [name, j] of Object.entries(pages.jobs))
      if (name !== 'www-snapshot') expect(j.permissions?.contents ?? 'read', name).toBe('read')
    expect(step('Upload www snapshot').if).toBe(
      "${{ steps.read.outputs.snapshot == 'true' && steps.settings.outputs.deploy == 'true' }}",
    )
  })

  it('deploys from main only: every job with an environment needs a build whose deploy switch requires main', () => {
    for (const [name, j] of Object.entries(pages.jobs)) {
      if (j.environment === undefined) continue
      const needs = [j.needs].flat()[0]!
      expect(j.if, name).toBe(`\${{ needs.${needs}.outputs.deploy == 'true' }}`)
      const settings = pages.jobs[needs]!.steps.find((s) => s.id === 'settings')!
      expect(settings.env?.ON_MAIN, name).toBe("${{ github.ref == 'refs/heads/main' }}")
      expect(settings.run, name).toContain('if [ "$HAS_ACCOUNT_ID" = "true" ] && [ "$ON_MAIN" = "true" ]; then')
    }
    // main as before on main; another ref builds the commit it was started on
    expect(step('Checkout').with?.ref).toBe("${{ github.ref == 'refs/heads/main' && 'main' || github.sha }}")
  })
})
