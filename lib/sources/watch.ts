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

/** out/queue.json: versions without facts on the data branch (input of `scan --queue`). */
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
    let ok = 0
    for (const wf of KEEPALIVE_WORKFLOWS) {
      try {
        const res = await o.http.request(`${GITHUB_API}/repos/${o.keepalive.repo}/actions/workflows/${wf}/enable`, {
          method: 'PUT',
        })
        if (res.status === 204) ok++
        else errors.push(`keepalive ${wf}: HTTP ${res.status}`)
      } catch (err) {
        errors.push(errText(`keepalive ${wf}`, err))
      }
    }
    if (ok === KEEPALIVE_WORKFLOWS.length) lines = Lines.parse({ ...lines, keepaliveAt: isoSeconds(o.now) })
  }
  if (lines) writeJson(join(o.dataDir, 'lines.json'), lines)

  const { entries } = loadEntries(o.modulesDir)
  const items: QueueItem[] = []
  await Promise.all(
    entries.map(async (e) => {
      const rec = readSyncRecord(o.dataDir, e.path)
      try {
        if (e.locator.startsWith('npm:')) {
          const name = e.locator.slice(4)
          const tags = await fetchDistTags(o.http, name)
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
          if (!top || hasFacts(o.dataDir, e.path, top.version)) return
          const knownTags = new Set((rec?.github?.tags ?? []).map((t) => t.name))
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
    errors,
  })
  writeJson(join(o.outDir, 'queue.json'), queue)
  log(`watch: ${items.length} versions queued, lines changed: ${changed.join(', ') || 'none'}`)
  return { lines, queue }
}
