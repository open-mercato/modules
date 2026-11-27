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
