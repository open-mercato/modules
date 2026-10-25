// `yarn om watch` (spec 5.2 watch.yml step 1, 5): lines -> `.data/lines.json`; new versions of entries ->
// `out/queue.json` for `yarn om scan --queue` (WP05); optional keepalive of the cron workflows.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { Lines, LineKey, Locator, SemVer, type Lines as LinesT } from '../schema/index.ts'
import { loadEntries, readSyncRecord } from './entries.ts'
import { API as GITHUB_API, repoTags } from './github.ts'
import { errText, type Http } from './http.ts'
import { fetchDistTags, fetchPackument, pickVersions } from './npm.ts'
import { readCadence, resolveLines } from './lines.ts'
import { compareVersions, isoSeconds, isSemVer, parseVersion } from './semver.ts'
import { writeJson } from './sync.ts'
import { githubArchiveUrl } from './tarball.ts'

/**
 * out/queue.json: versions without facts on the data branch (input of `scan --queue`), and the entries whose sync
 * record is missing or older than the registry (`needsSync`, input of `sync <locator>...` in watch.yml, finding of
 * 25 Oct: without it a new entry waited for the weekly sync to be Listed and installed).
 */
export const QueueFile = z
  .object({
    generatedAt: z.string(),
    lines: z.object({ changed: z.array(LineKey), coreLatest: z.string(), coreChanged: z.boolean() }).strict(),
    items: z.array(
      z
        .object({
          locator: Locator,
          path: z.string(),
          version: SemVer,
          source: z.enum(['npm-tarball', 'github-archive']),
          tarball: z.string().url(),
          integrity: z.string().nullable(),
          gitRef: z.string().nullable(),
          reason: z.enum(['new-version', 'missing-facts']),
        })
        .strict(),
    ),
    needsSync: z.array(Locator),
    errors: z.array(z.string()),
  })
  .strict()
export type QueueFile = z.output<typeof QueueFile>
export type QueueItem = QueueFile['items'][number]

export const KEEPALIVE_WORKFLOWS = ['nightly.yml', 'watch.yml', 'sync.yml', 'collect.yml'] as const
export const KEEPALIVE_DAYS = 30

export interface WatchOptions {
  http: Http
  root: string
  modulesDir: string
  dataDir: string
  outDir: string
  now: Date
  /** Re-enable the cron workflows when the last call is 30 days old (needs GITHUB_REPOSITORY and a token). */
  keepalive?: { repo: string } | null
  log?: (line: string) => void
}

export interface WatchResult {
  lines: LinesT | null
  queue: QueueFile
}

function readLines(dataDir: string): LinesT | null {
  const f = join(dataDir, 'lines.json')
  if (!existsSync(f)) return null
  const r = Lines.safeParse(JSON.parse(readFileSync(f, 'utf8')))
  return r.success ? r.data : null
}

const hasFacts = (dataDir: string, path: string, version: string) =>
  existsSync(join(dataDir, 'facts', path, `${version}.json`))

/**
 * The keepalive of the cron workflows (spec 5.2 step 5): `enable` on each workflow resets GitHub's inactivity timer.
 * It reads the state first and never turns on a workflow someone disabled by hand (finding of 25 Oct: watch re-enabled
 * every workflow, so disabling nightly.yml as an emergency stop lasted until the next keepalive). `active` and
 * `disabled_inactivity` get `enable`; `disabled_manually` is left off and logged. `ok` is true when every workflow was
 * handled; a workflow whose state could not be read is never enabled.
 */
export async function keepaliveWorkflows(
  http: Http,
  repo: string,
  log: (line: string) => void = () => {},
): Promise<{ ok: boolean; errors: string[]; leftOff: string[] }> {
  const errors: string[] = []
  const leftOff: string[] = []
  let handled = 0
  for (const wf of KEEPALIVE_WORKFLOWS) {
    const url = `${GITHUB_API}/repos/${repo}/actions/workflows/${wf}`
    try {
      const got = await http.request(url)
      const state = (got.json as { state?: unknown } | null)?.state
      if (got.status !== 200 || typeof state !== 'string') {
        errors.push(`keepalive ${wf}: state not read (HTTP ${got.status})`)
        continue
      }
      if (state === 'disabled_manually') {
        leftOff.push(wf)
        log(`keepalive: ${wf} was disabled by hand; left off`)
        handled++
        continue
      }
      if (state !== 'active' && state !== 'disabled_inactivity') {
        errors.push(`keepalive ${wf}: state ${state}, left as it is`)
        continue
      }
      const res = await http.request(`${url}/enable`, { method: 'PUT' })
      if (res.status === 204) handled++
      else errors.push(`keepalive ${wf}: HTTP ${res.status}`)
    } catch (err) {
      errors.push(errText(`keepalive ${wf}`, err))
    }
  }
  return { ok: handled === KEEPALIVE_WORKFLOWS.length, errors, leftOff }
}

export function keepaliveDue(keepaliveAt: string | null, now: Date): boolean {
  if (!keepaliveAt) return true
  return now.getTime() - new Date(keepaliveAt).getTime() >= KEEPALIVE_DAYS * 86_400_000
}

export async function runWatch(o: WatchOptions): Promise<WatchResult> {
  const log = o.log ?? (() => {})
  const errors: string[] = []
  const prev = readLines(o.dataDir)
  let lines: LinesT | null = prev
  let changed: string[] = []
  let coreChanged = false
  try {
    const r = await resolveLines(o.http, prev, readCadence(join(o.root, 'harness', 'lines.yml')), o.now)
    lines = r.lines
    changed = r.changed
    coreChanged = r.coreChanged
    errors.push(...r.errors)
  } catch (err) {
    errors.push(errText('lines', err))
  }

  if (lines && o.keepalive && keepaliveDue(lines.keepaliveAt, o.now)) {
    const k = await keepaliveWorkflows(o.http, o.keepalive.repo, log)
    errors.push(...k.errors)
    if (k.ok) lines = Lines.parse({ ...lines, keepaliveAt: isoSeconds(o.now) })
  }
  if (lines) writeJson(join(o.dataDir, 'lines.json'), lines)

  const { entries } = loadEntries(o.modulesDir)
  const items: QueueItem[] = []
  const needsSync = new Set<string>()
  await Promise.all(
    entries.map(async (e) => {
      const rec = readSyncRecord(o.dataDir, e.path)
      try {
        if (e.locator.startsWith('npm:')) {
          const name = e.locator.slice(4)
          const tags = await fetchDistTags(o.http, name)
          // no record yet: the sync writes one (also `not found`), so LST-2 and the nightly plan do not wait a week
          if (rec === null) needsSync.add(e.locator)
          if (!tags) return
          const known = rec?.npm ?? null
          const same =
            known &&
            JSON.stringify(Object.entries(known.distTags).sort()) ===
              JSON.stringify(
                Object.entries(tags)
                  .filter(([, v]) => isSemVer(v))
                  .sort(),
              )
          // a dist-tag moved: health and the plan read installable versions from the sync record
          if (!same) needsSync.add(e.locator)
          let versions = known ? [known.latestStable, known.previousStable, known.preview] : []
          const missing = () => versions.filter((v): v is string => !!v && !hasFacts(o.dataDir, e.path, v))
          if (same && missing().length === 0) return
          const p = await fetchPackument(o.http, name)
          if (!p) return
          const pick = pickVersions(p)
          versions = [pick.latestStable, pick.previousStable, pick.preview]
          const knownSet = new Set([known?.latestStable, known?.previousStable, known?.preview].filter(Boolean))
          for (const v of missing()) {
            const dist = p.versions?.[v]?.dist
            if (!dist?.tarball) continue
            items.push({
              locator: e.locator,
              path: e.path,
              version: v,
              source: 'npm-tarball',
              tarball: dist.tarball,
              integrity: dist.integrity ?? null,
              gitRef: null,
              reason: knownSet.has(v) ? 'missing-facts' : 'new-version',
            })
          }
        } else {
          const repo = e.locator.slice(7)
          const tags = await repoTags(o.http, repo)
          const semverTags = tags
            .map((t) => ({ tag: t.name, version: t.name.replace(/^v/, '') }))
            .filter((t) => isSemVer(t.version) && parseVersion(t.version))
            .sort((a, b) => compareVersions(a.version, b.version))
          const top = semverTags.at(-1)
          const knownTags = new Set((rec?.github?.tags ?? []).map((t) => t.name))
          if (rec === null || (top && !knownTags.has(top.tag))) needsSync.add(e.locator)
          if (!top || hasFacts(o.dataDir, e.path, top.version)) return
          items.push({
            locator: e.locator,
            path: e.path,
            version: top.version,
            source: 'github-archive',
            tarball: githubArchiveUrl(repo, top.tag),
            integrity: null,
            gitRef: top.tag,
            reason: knownTags.has(top.tag) ? 'missing-facts' : 'new-version',
          })
        }
      } catch (err) {
        errors.push(errText(`watch ${e.locator}`, err))
      }
    }),
  )
  items.sort((a, b) => a.locator.localeCompare(b.locator) || compareVersions(b.version, a.version))
  const queue = QueueFile.parse({
    generatedAt: isoSeconds(o.now),
    lines: { changed, coreLatest: lines?.coreLatest ?? '', coreChanged },
    items,
    needsSync: [...needsSync].sort(),
    errors,
  })
  writeJson(join(o.outDir, 'queue.json'), queue)
  log(
    `watch: ${items.length} versions queued, ${needsSync.size} entries to sync, lines changed: ${changed.join(', ') || 'none'}`,
  )
  return { lines, queue }
}
