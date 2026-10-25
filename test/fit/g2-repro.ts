// Re-runs the g2 measurement with lib/fit (heavy: unpacks @open-mercato/* tarballs of 4 OM versions; run on Cezar).
//   node test/fit/g2-repro.ts <cache-dir> <out.json>
// Input: test/fit/fixtures/g2-imports.json (imports of 16 packages outside the org and 23 official packages,
// from the g2 static scans). Output: the recorded run that test/fit/g2.test.ts checks.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FitModule } from '../../lib/fit/compute.ts'
import { computeFit, computeStatic } from '../../lib/fit/compute.ts'
import { writeJson } from '../../lib/fit/data.ts'
import { createStore, templateDeps } from '../../lib/fit/om-tarballs.ts'

export const G2_VERSIONS = ['0.7.0', '0.8.0', '0.9.0', '0.10.1-develop.7583.1.0c886d0a14'] as const
export const G2_LATEST = '0.9.0'
/** Spike day (consents installed on Cezar on 22-23 Oct 2026). */
export const G2_AS_OF = '2026-10-22T12:00:00.000Z'

export interface G2Package {
  set: 'external' | 'control'
  locator: string
  version: string
  omPeers: Record<string, string>
  dependencies: Record<string, string>
  imports: Record<string, Record<string, string[]>>
}

export function loadG2Packages(): G2Package[] {
  const file = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'g2-imports.json')
  return (JSON.parse(readFileSync(file, 'utf8')) as { packages: G2Package[] }).packages
}

export const toFitModule = (p: G2Package): FitModule => ({
  key: `${p.locator}@${p.version}`,
  locator: p.locator,
  version: p.version,
  imports: p.imports,
  omPeers: p.omPeers,
  dependencies: p.dependencies,
})

async function main(cacheDir: string, outFile: string): Promise<void> {
  const store = createStore(cacheDir)
  const log = (m: string): void => console.error(m)
  const pkgs = loadG2Packages()
  const external = pkgs.filter((p) => p.set === 'external').map(toFitModule)
  const control = pkgs.filter((p) => p.set === 'control').map(toFitModule)
  const t0 = Date.now()
  const fit = await computeFit(store, {
    versions: G2_VERSIONS,
    latest: G2_LATEST,
    modules: external,
    asOf: new Date(G2_AS_OF),
    log,
  })
  const tFit = Date.now() - t0
  const controlRuns: Record<string, Record<string, { checked: number; missing: unknown[]; unknown: number }>> = {}
  for (const v of G2_VERSIONS) {
    const res = await computeStatic(store, v, control, log)
    controlRuns[v] = Object.fromEntries(
      [...res].map(([k, r]) => [k, { checked: r.checked, missing: r.missing, unknown: r.unknown.length }]),
    )
  }
  const templates = Object.fromEntries(
    await Promise.all(
      G2_VERSIONS.map(async (v) => {
        const t = await templateDeps(store, v)
        return [
          v,
          t
            ? {
                reactTable: t.dependencies['@tanstack/react-table'] ?? null,
                ageGateMinutes: t.ageGateMinutes,
                preapproved: t.preapproved,
              }
            : null,
        ]
      }),
    ),
  )
  writeJson(outFile, {
    source: 'test/fit/g2-repro.ts on Cezar (lib/fit, tarballs from registry.npmjs.org)',
    measuredAt: new Date().toISOString(),
    node: process.version,
    asOf: G2_AS_OF,
    latest: G2_LATEST,
    versions: G2_VERSIONS,
    durationMs: { externalFit: tFit, total: Date.now() - t0 },
    templates,
    external: Object.fromEntries(G2_VERSIONS.map((v) => [v, fit.get(v) ?? {}])),
    control: controlRuns,
  })
  console.error(`done in ${Date.now() - t0} ms -> ${outFile}`)
}

if (import.meta.main) {
  const [cache, out] = process.argv.slice(2)
  main(cache ?? 'out/om-tarballs', out ?? 'out/g2-run.json').catch((err: unknown) => {
    console.error(err)
    process.exitCode = 2
  })
}
