// Installability gate and kind of a package, from the tarball layout (spec 4.3 `kind`, LST-3):
// a module is the pair `src/modules/<id>/index.ts` + `dist/modules/<id>/` (the check of
// `mercato module add`, packages/cli/src/lib/module-package.ts:299-318). Other kinds come from
// package.json: `bin` = tool, `openMercato.webResearchAdapter` or an `extends` hint = provider,
// otherwise library. The author's proposed kind (descriptor) is accepted for non-module packages.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Facts } from '../schema/data/facts.ts'
import { isDir, isFile } from './ast.ts'

export type PackageKind = Facts['kind']
export type Gate = Facts['gate']

/** Directory names the OM CLI accepts as module IDs (module-package.ts:40). */
export const CLI_MODULE_DIR = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

export interface GateResult extends Gate {
  /** Module directories that have source (`src/modules/<id>/`), in order. */
  sourceModules: string[]
  /** Directory names under src/ or dist/ modules that are not valid module IDs (skipped). */
  skippedDirs: number
}

function listDirs(p: string): string[] {
  try {
    return readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('__'))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/** The gate of `mercato module add`, read from an unpacked package. */
export function readGate(pkgRoot: string): GateResult {
  const src = join(pkgRoot, 'src', 'modules')
  const dist = join(pkgRoot, 'dist', 'modules')
  const enumDir = isDir(src) ? src : isDir(dist) ? dist : null
  const names = enumDir ? listDirs(enumDir) : []
  const ids = names.filter((n) => CLI_MODULE_DIR.test(n))
  const modules = ids.slice(0, 60).map((id) => ({
    id,
    src: isFile(join(src, id, 'index.ts')) || isFile(join(src, id, 'index.tsx')),
    dist: isDir(join(dist, id)),
  }))
  const passing = modules.filter((m) => m.src && m.dist)
  let reason: string | null = null
  if (modules.length === 0)
    reason = isDir(join(pkgRoot, 'src'))
      ? 'Package has no src/modules and dist/modules pair.'
      : 'Package has no src/ in the tarball.'
  else if (passing.length === 0) {
    const m = modules[0] as { id: string; src: boolean; dist: boolean }
    reason = !m.src
      ? `No src/modules/${m.id}/index.ts in the tarball.`
      : `No dist/modules/${m.id}/ in the tarball (not built).`
  }
  return {
    installable: passing.length > 0,
    needsModuleFlag: modules.length > 1,
    reason,
    modules,
    sourceModules: ids.filter((id) => isDir(join(src, id))),
    skippedDirs: names.length - ids.length,
  }
}

export interface KindHint {
  /** Kind proposed in the descriptor (author), if any. */
  proposed?: 'module' | 'provider' | 'library' | 'tool'
  /** Descriptor `extends` (providers). */
  extends?: string
}

/** Kind confirmed from the tarball (LST-3), with the reason when it differs from the proposal. */
export function resolveKind(
  gate: GateResult,
  pkgJson: Record<string, unknown>,
  hint: KindHint = {},
): { kind: PackageKind; note: string | null } {
  if (gate.modules.length > 0) {
    if (hint.proposed && hint.proposed !== 'module')
      return {
        kind: 'module',
        note: `Proposed kind ${hint.proposed}, but the tarball has src/modules/${gate.modules[0]?.id}.`,
      }
    return { kind: 'module', note: null }
  }
  if (hint.proposed && hint.proposed !== 'module') return { kind: hint.proposed, note: null }
  const om = pkgJson.openMercato
  if ((om && typeof om === 'object' && 'webResearchAdapter' in om) || hint.extends)
    return { kind: 'provider', note: null }
  if (pkgJson.bin) return { kind: 'tool', note: null }
  return {
    kind: 'library',
    note:
      hint.proposed === 'module'
        ? 'Proposed kind module, but the tarball has no src/modules. Confirmed as library.'
        : null,
  }
}
