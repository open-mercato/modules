// .github/workflows/mcp-deploy.yml (spec 5.1, 5.2): push to main on mcp/**, lib/core/**, lib/schema/** and by hand;
// read-only token, environment `mcp`, 10 minutes, wrangler-action pinned to its SHA in mcp/, and a warning instead
// of an error when the CLOUDFLARE_API_TOKEN secret is missing. The workflow-wide rules are in test/validate.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const wf = parse(readFileSync(join(ROOT, '.github/workflows/mcp-deploy.yml'), 'utf8')) as {
  on: { push: { branches: string[]; paths: string[] }; workflow_dispatch: unknown }
  permissions: Record<string, string>
  defaults: { run: { shell: string } }
  jobs: Record<
    string,
    {
      'runs-on': string
      'timeout-minutes': number
      environment: { name: string }
      steps: {
        name: string
        id?: string
        if?: string
        uses?: string
        run?: string
        with?: Record<string, string>
        env?: Record<string, string>
      }[]
    }
  >
}
const job = wf.jobs['deploy']!

describe('mcp-deploy.yml', () => {
  it('triggers, permissions and limits of the 5.1 table', () => {
    expect(wf.on.push.branches).toEqual(['main'])
    expect(wf.on.push.paths).toEqual(['mcp/**', 'lib/core/**', 'lib/schema/**'])
    expect('workflow_dispatch' in wf.on).toBe(true)
    expect(wf.permissions).toEqual({ contents: 'read' })
    expect(wf.defaults.run.shell).toBe('bash')
    expect(job['runs-on']).toBe('ubuntu-latest')
    expect(job['timeout-minutes']).toBe(10)
    expect(job.environment.name).toBe('mcp')
  })

  it('deploys with wrangler-action in mcp/ with the token secret and the account variable (5.2)', () => {
    const deploy = job.steps.find((s) => s.uses?.startsWith('cloudflare/wrangler-action@'))!
    expect(deploy.uses).toBe('cloudflare/wrangler-action@953926a2e2182532811c01a25e53647d93bf07c0')
    expect(deploy.with).toMatchObject({
      apiToken: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      accountId: '${{ vars.CLOUDFLARE_ACCOUNT_ID }}',
      workingDirectory: 'mcp',
      command: 'deploy',
      wranglerVersion: '4.149.0',
    })
    expect(deploy.if).toBe("${{ steps.token.outputs.present == 'true' }}")
  })

  it('every step after the token check runs only with a token', () => {
    const [first, ...rest] = job.steps
    expect(first?.id).toBe('token')
    for (const s of rest) expect(s.if, s.name).toBe("${{ steps.token.outputs.present == 'true' }}")
  })

  it('without a token the check step ends with a warning annotation, a summary and exit code 0', () => {
    const script = job.steps[0]!.run!
    const dir = mkdtempSync(join(tmpdir(), 'om-mcp-deploy-'))
    const out = join(dir, 'output')
    const summary = join(dir, 'summary')
    const stdout = execFileSync('bash', ['-eo', 'pipefail', '-c', script], {
      env: { PATH: process.env['PATH'] ?? '', HAS_TOKEN: 'false', GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary },
      encoding: 'utf8',
    })
    // a warning, not a quiet notice: the run is visibly flagged while no MCP server runs (finding of 25 Oct)
    expect(stdout).toContain('::warning title=mcp-deploy not deployed::No CLOUDFLARE_API_TOKEN')
    expect(stdout).not.toContain('::notice')
    expect(readFileSync(out, 'utf8')).toBe('present=false\n')
    expect(readFileSync(summary, 'utf8')).toContain('**Not deployed.**')
    expect(readFileSync(summary, 'utf8')).toContain('the site publishes no MCP server card')
    const withToken = execFileSync('bash', ['-eo', 'pipefail', '-c', script], {
      env: { PATH: process.env['PATH'] ?? '', HAS_TOKEN: 'true', GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary },
      encoding: 'utf8',
    })
    expect(withToken).toBe('')
    expect(readFileSync(out, 'utf8')).toBe('present=false\npresent=true\n')
  })
})

describe('mcp/wrangler.toml (spec 3.4)', () => {
  const toml = readFileSync(join(ROOT, 'mcp/wrangler.toml'), 'utf8')
  it('names the Worker, entry, date, index URLs and turns observability off', () => {
    expect(toml).toMatch(/^name = "om-modules"$/m)
    expect(toml).toMatch(/^main = "worker.ts"$/m)
    expect(toml).toMatch(/^compatibility_date = "2026-10-01"$/m)
    // the site on Cloudflare Pages at its domain (Piotr and owner decision A(a), 28 Oct)
    expect(toml).toMatch(/^MODULES_INDEX_URL = "https:\/\/modules\.openmercato\.com\/modules\.json"$/m)
    expect(toml).toMatch(/^BUILTIN_INDEX_URL = "https:\/\/modules\.openmercato\.com\/built-in\.json"$/m)
    expect(toml).toMatch(/\[observability\]\nenabled = false/)
  })

  it('the Worker entry exports only the default handler (workerd treats named exports as entrypoints)', () => {
    const entry = readFileSync(join(ROOT, 'mcp/worker.ts'), 'utf8')
    expect(entry.match(/^export /gm)).toEqual(['export '])
    expect(entry).toMatch(/^export default \{/m)
  })
})
