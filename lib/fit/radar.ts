// Release radar (spec 1.1 pkt 3, 3.7 of K1, 4.6 `Radar`, 7.7 E): what the `next` snapshot does to the modules
// outside the `@open-mercato` scope. Three layers: static breaks on next, signature drift against latest,
// receipts on next; plus the load-bearing APIs from the surface. Pure function of the data (no network).
import type { FitCell, Radar, Receipt, Step, Surface } from '../schema/index.ts'
import { symbolKey } from './drift.ts'
import type { MissingRef } from './static.ts'
import { loadBearing } from './surface.ts'

export interface RadarModule {
  locator: string
  /** Fit of the current version against `next`. */
  next: FitCell
  /** Fit of the same version against `latest` (to tell a removal on next from an old miss). */
  latest: FitCell | null
}

/** `pkg/subpath#Symbol` for a missing symbol, `pkg/subpath` for a missing subpath. */
export function missingKey(m: MissingRef): string {
  if (m.kind === 'symbol' && m.symbol !== null) return symbolKey(m.pkg, m.subpath, m.symbol.split('.')[0] as string)
  return m.subpath === '.' ? m.pkg : `${m.pkg}/${m.subpath}`
}

/** Latest receipt per module on one line (by `run.at`, then attempt). */
export function latestReceipts(receipts: readonly Receipt[], line: string): Map<string, Receipt> {
  const out = new Map<string, Receipt>()
  for (const r of receipts) {
    if (!r.module || r.om.line !== line) continue
    const prev = out.get(r.module.locator)
    const newer = !prev || r.run.at > prev.run.at || (r.run.at === prev.run.at && r.run.attempt >= prev.run.attempt)
    if (newer) out.set(r.module.locator, r)
  }
  return out
}

/** Same failure signature in at least `min` modules on the line: likely a core change (spec 5.3 pkt 5). */
export function sameFailure(latest: ReadonlyMap<string, Receipt>, min = 3): Radar['sameFailure'] {
  const groups = new Map<string, { signature: string; step: Step; modules: string[] }>()
  for (const [locator, r] of latest) {
    if (r.result.status !== 'broken' || !r.result.failedStep) continue
    const step = r.result.failedStep
    const signature = r.steps.find((s) => s.name === step)?.signature
    if (!signature) continue
    const key = `${step}|${signature}`
    const g = groups.get(key) ?? { signature, step, modules: [] }
    g.modules.push(locator)
    groups.set(key, g)
  }
  return [...groups.values()]
    .filter((g) => g.modules.length >= min)
    .map((g) => ({ ...g, modules: g.modules.sort() }))
    .sort((a, b) => b.modules.length - a.modules.length || a.signature.localeCompare(b.signature))
}

export function buildRadar(args: {
  generatedAt: string
  base: string
  next: string
  modules: readonly RadarModule[]
  surface: Surface
  receipts: readonly Receipt[]
  top?: number
}): Radar {
  const changed = new Map<string, { change: 'signature' | 'removed'; modules: Set<string> }>()
  const note = (symbol: string, change: 'signature' | 'removed', locator: string): void => {
    const e = changed.get(symbol) ?? { change, modules: new Set<string>() }
    if (change === 'removed') e.change = 'removed'
    e.modules.add(locator)
    changed.set(symbol, e)
  }
  const staticBreaks: Radar['staticBreaks'] = []
  const touched = new Set<string>()
  for (const m of [...args.modules].sort((a, b) => a.locator.localeCompare(b.locator))) {
    for (const d of m.next.drift) {
      note(d, 'signature', m.locator)
      touched.add(m.locator)
    }
    const before = new Set((m.latest?.missing ?? []).map(missingKey))
    const removed = [...new Set(m.next.missing.map(missingKey))].filter((k) => !before.has(k))
    for (const k of removed) {
      note(k, 'removed', m.locator)
      touched.add(m.locator)
    }
    if (removed.length > 0) staticBreaks.push({ locator: m.locator, missing: removed })
  }
  const changedApis = [...changed.entries()]
    .map(([symbol, e]) => ({ symbol, change: e.change, modules: [...e.modules].sort() }))
    .sort((a, b) => b.modules.length - a.modules.length || a.symbol.localeCompare(b.symbol))
  const onNext = latestReceipts(args.receipts, 'next')
  const statuses = [...onNext.values()].map((r) => r.result.status)
  const receiptsOnNext = {
    verified: statuses.filter((s) => s === 'verified').length,
    broken: statuses.filter((s) => s === 'broken').length,
  }
  const of = args.modules.length
  const summary =
    `${touched.size} of ${of} modules outside the @open-mercato scope use APIs that changed since ${args.base}. ` +
    `${staticBreaks.length} break statically. ` +
    `Receipts on next: ${receiptsOnNext.verified} verified, ${receiptsOnNext.broken} broken.`
  return {
    schemaVersion: 1,
    generatedAt: args.generatedAt,
    next: args.next,
    base: args.base,
    summary,
    changedApis,
    staticBreaks,
    receiptsOnNext,
    sameFailure: sameFailure(onNext),
    loadBearing: loadBearing(args.surface, args.top ?? 15),
  }
}
