// Release radar (spec 1.1 pkt 3, 3.7 of K1, 4.6 `Radar`, 7.7 E): what the `next` snapshot does to the modules
// outside the `@open-mercato` scope. Three layers: static breaks on next, signature drift against latest,
// receipts on next; plus the load-bearing APIs from the surface. Pure function of the data (no network).
import { decisiveReceipt, MAIN_PRESET, receiptPreset, sortReceipts } from '../core/lines.ts'
import type { FitCell, Radar, Receipt, Step, Surface } from '../schema/index.ts'
import { symbolKey } from './drift.ts'
import type { MissingRef } from './static.ts'
import { loadBearing } from './surface.ts'

export interface RadarModule {
  locator: string
  /** Version the fit cells were computed for; only its receipts are read. Absent: the newest version tested on next. */
  version?: string | null
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

/** Which receipts the radar reads on its line: one snapshot and the module versions it looks at. */
export interface ReceiptScope {
  /** Open Mercato version of the snapshot (`om.version`). */
  om: string
  /** Version per locator; a locator not listed is left out, null takes the newest version tested. */
  versions: ReadonlyMap<string, string | null>
}

/**
 * The receipt per module that judges it on `line`, picked as `versionStatus` picks it: realistic mode and the
 * classic preset only (the main verdict), the last receipt when it judged the module, else the decisive one. With a
 * scope, only receipts of that snapshot and of the listed module versions count, so an older snapshot, an early-mode
 * or empty-preset receipt or an outdated version never stands for a module under a newer `next` (audit R8).
 */
export function latestReceipts(
  receipts: readonly Receipt[],
  line: string,
  scope: ReceiptScope | null = null,
): Map<string, Receipt> {
  const by = new Map<string, Receipt[]>()
  for (const r of sortReceipts(receipts)) {
    if (!r.module || r.om.line !== line || r.harness.mode !== 'realistic' || receiptPreset(r) !== MAIN_PRESET) continue
    if (scope && (r.om.version !== scope.om || !scope.versions.has(r.module.locator))) continue
    const want = scope?.versions.get(r.module.locator) ?? null
    if (want !== null && r.module.version !== want) continue
    by.set(r.module.locator, [...(by.get(r.module.locator) ?? []), r])
  }
  const out = new Map<string, Receipt>()
  for (const [locator, all] of by) {
    // without a named version: the newest version tested on the line
    const version = scope?.versions.get(locator) ?? all.at(-1)?.module?.version
    const list = all.filter((r) => r.module?.version === version)
    const last = list.at(-1)
    if (!last) continue
    const judged = last.result.status === 'verified' || last.result.status === 'broken'
    out.set(locator, judged ? last : (decisiveReceipt(list, line, version) ?? last))
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
  const versions = new Map(args.modules.map((m) => [m.locator, m.version ?? null]))
  const onNext = latestReceipts(args.receipts, 'next', { om: args.next, versions })
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
