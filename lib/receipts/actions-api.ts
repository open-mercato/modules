// GitHub Actions REST calls used by `collect` (read jobs, download artifacts, dispatch and find the retry run).
// Status always comes from these JSON endpoints; artifacts are downloaded with `gh run download` (preinstalled on
// ubuntu-latest, authenticated by GH_TOKEN), which keeps one directory per artifact.
import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { promisify } from 'node:util'
import type { ApiJob, ApiRun } from './from-actions.ts'

const exec = promisify(execFile)

export interface ActionsApi {
  getRun(id: number): Promise<ApiRun>
  listJobs(runId: number): Promise<ApiJob[]>
  downloadArtifacts(runId: number, dir: string): Promise<void>
  dispatch(workflow: string, ref: string, inputs: Record<string, string>): Promise<void>
  /** Runs of a workflow file created at or after `since` (newest first). */
  listWorkflowRuns(workflow: string, params: { event: string; branch: string; since: string }): Promise<ApiRun[]>
}

export interface GithubApiOptions {
  repo: string
  token: string
  apiUrl?: string
  fetchImpl?: typeof fetch
}

export function githubActionsApi(o: GithubApiOptions): ActionsApi {
  const base = (o.apiUrl ?? 'https://api.github.com').replace(/\/$/, '')
  const f = o.fetchImpl ?? fetch
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${o.token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'om-modules-collect',
  }
  async function call(path: string, init?: RequestInit): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      const res = await f(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
      if (res.status < 500 || attempt >= 3) return res
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
  async function json<T>(path: string): Promise<T> {
    const res = await call(path)
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
    return (await res.json()) as T
  }
  return {
    getRun: (id) => json<ApiRun>(`/repos/${o.repo}/actions/runs/${id}`),
    async listJobs(runId) {
      const out: ApiJob[] = []
      for (let page = 1; page <= 20; page++) {
        const r = await json<{ total_count: number; jobs: ApiJob[] }>(
          `/repos/${o.repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100&page=${page}`,
        )
        out.push(...r.jobs)
        if (r.jobs.length < 100 || out.length >= r.total_count) break
      }
      return out
    },
    async downloadArtifacts(runId, dir) {
      mkdirSync(dir, { recursive: true })
      await exec('gh', ['run', 'download', String(runId), '--repo', o.repo, '--dir', dir], {
        env: { ...process.env, GH_TOKEN: o.token },
        maxBuffer: 16 * 1024 * 1024,
      })
    },
    async dispatch(workflow, ref, inputs) {
      const res = await call(`/repos/${o.repo}/actions/workflows/${workflow}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref, inputs }),
        headers: { 'content-type': 'application/json' },
      })
      if (res.status !== 204 && res.status !== 200) throw new Error(`dispatch ${workflow}: ${res.status}`)
    },
    async listWorkflowRuns(workflow, p) {
      const q = new URLSearchParams({ event: p.event, branch: p.branch, created: `>=${p.since}`, per_page: '50' })
      const r = await json<{ workflow_runs: ApiRun[] }>(`/repos/${o.repo}/actions/workflows/${workflow}/runs?${q}`)
      return r.workflow_runs
    },
  }
}
