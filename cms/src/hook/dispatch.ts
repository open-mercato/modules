// The publish hook of the spec (API Contracts, Publish hook; Step 2.4): after a publish, unpublish or delete, and a
// media update or delete, it waits for 60 seconds without a new event (at most 5 minutes from the first) and then
// dispatches the `pages` workflow with a fixed body. Three tries with backoff on a 5xx or a network error; a 401 or
// 403 is logged as `dispatch refused: token` and not retried. The GitHub token comes from the environment only
// (cms/.env on the host), never from the database or the admin. Pure: the sender and the clock are injected.

export const DISPATCH_PATH = '/repos/open-mercato/modules/actions/workflows/pages.yml/dispatches'
export const DISPATCH_BODY = { ref: 'main', inputs: { www_content: 'publish' } } as const

/** The events that dispatch `pages`: what reaches the published site. Draft saves do not (Phase 5). */
export const PUBLISH_EVENTS = [
  'entry.publish',
  'entry.unpublish',
  'entry.delete',
  'media.update',
  'media.delete',
] as const

export interface DispatchOptions {
  /** GitHub's API, https://api.github.com; a fake endpoint in the tests. */
  apiUrl: string
  token: string | undefined
  quietMs?: number
  maxWaitMs?: number
  /** Waits between the tries after a 5xx or a network error. */
  backoffMs?: readonly number[]
  fetch?: typeof fetch
  log?: { info(m: string): void; warn(m: string): void; error(m: string): void }
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
  now?: () => number
}

export interface Dispatcher {
  /** Records an event; the dispatch follows after the quiet period. */
  notify(event: string, model?: string): void
  /** Resolves when no dispatch is waiting or running (tests). */
  idle(): Promise<void>
  stop(): void
}

const RETRY_STATUS = (s: number) => s >= 500

export function createDispatcher(o: DispatchOptions): Dispatcher {
  const quietMs = o.quietMs ?? 60_000
  const maxWaitMs = o.maxWaitMs ?? 300_000
  const backoffMs = o.backoffMs ?? [10_000, 30_000]
  const send = o.fetch ?? fetch
  const log = o.log ?? console
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>))
  const now = o.now ?? Date.now
  let timer: unknown
  let firstAt: number | undefined
  let running: Promise<void> | undefined
  let stopped = false
  const sleep = (ms: number) => new Promise<void>((r) => setTimer(r, ms))

  async function dispatch(): Promise<void> {
    if (!o.token) {
      log.warn('dispatch off: GITHUB_DISPATCH_TOKEN is not set')
      return
    }
    const tries = backoffMs.length + 1
    for (let i = 0; i < tries; i++) {
      try {
        const r = await send(`${o.apiUrl.replace(/\/$/, '')}${DISPATCH_PATH}`, {
          method: 'POST',
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${o.token}`,
            'content-type': 'application/json',
            'user-agent': 'open-mercato-www-cms',
            'x-github-api-version': '2022-11-28',
          },
          body: JSON.stringify(DISPATCH_BODY),
          signal: AbortSignal.timeout(30_000),
        })
        if (r.status === 204 || r.ok) {
          log.info('dispatch sent: pages.yml www_content=publish')
          return
        }
        if (r.status === 401 || r.status === 403) {
          log.error('dispatch refused: token')
          return
        }
        if (!RETRY_STATUS(r.status)) {
          log.error(`dispatch failed: ${r.status}`)
          return
        }
        log.warn(`dispatch try ${i + 1} of ${tries}: ${r.status}`)
      } catch (e) {
        log.warn(`dispatch try ${i + 1} of ${tries}: ${(e as Error).message}`)
      }
      if (i < tries - 1) await sleep(backoffMs[i] as number)
    }
    log.error(`dispatch failed after ${tries} tries; the daily pages run publishes instead`)
  }

  function fire(): void {
    timer = undefined
    firstAt = undefined
    const prev = running ?? Promise.resolve()
    running = prev.then(dispatch).finally(() => {
      if (timer === undefined) running = undefined
    })
  }

  return {
    notify() {
      if (stopped) return
      const t = now()
      firstAt ??= t
      if (timer !== undefined) clearTimer(timer)
      timer = setTimer(fire, Math.max(0, Math.min(t + quietMs, firstAt + maxWaitMs) - t))
    },
    async idle() {
      while (timer !== undefined || running !== undefined) {
        if (running) await running
        else await sleep(20)
      }
    },
    stop() {
      stopped = true
      if (timer !== undefined) clearTimer(timer)
      timer = undefined
    },
  }
}
