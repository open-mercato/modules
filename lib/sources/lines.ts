// Release lines of Open Mercato (spec 4.4 end, D6, D7): `latest` = create-mercato-app@latest (key X.Y),
// `previous` = highest stable of the previous minor or the `latest-X.Y` tag when it exists, `next` = exact
// create-mercato-app@develop. `preapproved` = npmPreapprovedPackages of template/.yarnrc.yml.template in that
// version's tarball (read once per version, then carried over).
import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { presetFromModulesTs } from '../receipts/state.ts'
import { HarnessLinesFile, Lines, type DefaultPreset, type Lines as LinesT } from '../schema/index.ts'
import type { Http } from './http.ts'
import { fetchDistTags, fetchPackument, type Packument, pickVersions } from './npm.ts'
import { compareVersions, isoSeconds, isStable, lineKeyOf } from './semver.ts'
import { tarballTextFiles } from './tarball.ts'

export const CREATE_APP = 'create-mercato-app'
export const CORE = '@open-mercato/core'
const TEMPLATE = 'package/template/.yarnrc.yml.template'
const MODULES_TS = 'package/template/src/modules.ts'
const DIST = 'package/dist/index.js'

export type Cadence = { latest: 'nightly' | 'weekly'; next: 'nightly' | 'weekly'; previous: 'nightly' | 'weekly' }
export const DEFAULT_CADENCE: Cadence = { latest: 'nightly', next: 'nightly', previous: 'weekly' }

/** Cadence from harness/lines.yml (WP07) when present, else the spec default. */
export function readCadence(file: string): Cadence {
  if (!existsSync(file)) return DEFAULT_CADENCE
  const r = HarnessLinesFile.safeParse(parse(readFileSync(file, 'utf8')))
  return r.success ? r.data.cadence : DEFAULT_CADENCE
}

/** npmPreapprovedPackages from a .yarnrc.yml template (template placeholders such as `{{REGISTRY_CONFIG}}` dropped). */
export function preapprovedFrom(template: string): string[] {
  const clean = template
    .split('\n')
    .filter((l) => !l.includes('{{'))
    .join('\n')
  const y = parse(clean) as { npmPreapprovedPackages?: unknown } | null
  const v = y?.npmPreapprovedPackages
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').slice(0, 20)
  return []
}

/**
 * The default starter preset of a create-mercato-app version (review r11) from its tarball: `DEFAULT_PRESET_ID` of
 * dist/index.js and, for `classic` (which keeps the template as it is, apply-starter-preset.ts `isClassic`), the
 * `enabledModules` literal of template/src/modules.ts as the receipts' parser reads a scaffold (comments, `@app` and
 * the modules pushed in `if (env)` blocks are not in a new app). Null when the id is unknown or another preset, whose
 * modules the tarball does not list as data.
 */
export function defaultPresetFrom(modulesTs: string | undefined, dist: string | undefined): DefaultPreset | null {
  const id = dist ? /\bDEFAULT_PRESET_ID\s*=\s*["']([a-z][a-z0-9_-]*)["']/.exec(dist)?.[1] : undefined
  if (id !== 'classic' || modulesTs === undefined) return null
  const modules = presetFromModulesTs(modulesTs, 160)
  return modules.length > 0 ? { id, modules } : null
}

export interface LinePick {
  latest: string
  previous: string | null
  develop: string | null
}

export function pickLines(p: Packument): LinePick {
  const tags = p['dist-tags'] ?? {}
  const latestTag = tags.latest
  const latest = latestTag && isStable(latestTag) ? latestTag : pickVersions(p).latestStable
  if (!latest) throw new Error(`${CREATE_APP} has no stable latest version`)
  const key = lineKeyOf(latest) as string
  const stable = Object.keys(p.versions ?? {})
    .filter((v) => isStable(v) && !p.versions?.[v]?.deprecated)
    .filter((v) => compareVersions(v, latest) < 0 && lineKeyOf(v) !== key)
    .sort(compareVersions)
  let previous = stable.at(-1) ?? null
  const prevKey = previous ? lineKeyOf(previous) : null
  const pinned = prevKey ? tags[`latest-${prevKey}`] : undefined
  if (pinned && isStable(pinned)) previous = pinned
  const develop = tags.develop ?? null
  return { latest, previous, develop }
}

export interface ResolveLinesResult {
  lines: LinesT
  errors: string[]
  /** Line keys whose version changed (or appeared) since the previous lines.json. */
  changed: string[]
  coreChanged: boolean
}

export async function resolveLines(
  http: Http,
  prev: LinesT | null,
  cadence: Cadence,
  now: Date,
): Promise<ResolveLinesResult> {
  const errors: string[] = []
  const p = await fetchPackument(http, CREATE_APP)
  if (!p) throw new Error(`${CREATE_APP} not found on npm`)
  const pick = pickLines(p)
  let coreLatest = pick.latest
  try {
    const tags = await fetchDistTags(http, CORE)
    if (tags?.latest && isStable(tags.latest)) coreLatest = tags.latest
  } catch (err) {
    errors.push(`core dist-tags: ${(err as Error).message}`)
    if (prev?.coreLatest) coreLatest = prev.coreLatest
  }
  const wanted: {
    key: string
    version: string
    source: 'latest' | 'previous' | 'develop'
    cadence: 'nightly' | 'weekly'
  }[] = [{ key: lineKeyOf(pick.latest) as string, version: pick.latest, source: 'latest', cadence: cadence.latest }]
  if (pick.previous)
    wanted.push({
      key: lineKeyOf(pick.previous) as string,
      version: pick.previous,
      source: 'previous',
      cadence: cadence.previous,
    })
  if (pick.develop) wanted.push({ key: 'next', version: pick.develop, source: 'develop', cadence: cadence.next })
  else errors.push(`${CREATE_APP} has no develop tag; no next line`)

  const lines = []
  for (const w of wanted) {
    const before = prev?.lines.find((l) => l.version === w.version)
    let preapproved = before?.preapproved ?? null
    // the default preset is read once per version with `preapproved` (review r11); null = read, not known
    let defaultPreset = before?.defaultPreset
    if (!preapproved || defaultPreset === undefined) {
      const dist = p.versions?.[w.version]?.dist
      try {
        if (!dist?.tarball || !dist.integrity) throw new Error('no tarball in the packument')
        const files = await tarballTextFiles(http, { url: dist.tarball, integrity: dist.integrity }, [
          TEMPLATE,
          MODULES_TS,
          DIST,
        ])
        if (defaultPreset === undefined) defaultPreset = defaultPresetFrom(files.get(MODULES_TS), files.get(DIST))
        if (!preapproved) {
          const t = files.get(TEMPLATE)
          if (t === undefined) throw new Error(`${TEMPLATE} not in the tarball`)
          preapproved = preapprovedFrom(t)
        }
      } catch (err) {
        errors.push(`preapproved ${CREATE_APP}@${w.version}: ${(err as Error).message}`.slice(0, 300))
        preapproved ??= prev?.lines.find((l) => l.key === w.key)?.preapproved ?? []
      }
    }
    lines.push({
      key: w.key,
      version: w.version,
      source: w.source,
      createApp: `${CREATE_APP}@${w.version}`,
      cadence: w.cadence,
      preapproved,
      ...(defaultPreset !== undefined ? { defaultPreset } : {}),
    })
  }
  const out = Lines.parse({ resolvedAt: isoSeconds(now), coreLatest, keepaliveAt: prev?.keepaliveAt ?? null, lines })
  const changed = out.lines
    .filter((l) => prev?.lines.find((x) => x.key === l.key)?.version !== l.version)
    .map((l) => l.key)
  return { lines: out, errors, changed, coreChanged: prev?.coreLatest !== out.coreLatest }
}
