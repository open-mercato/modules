// Fixture runs of the emitter: test/fixtures/data + the 8 fixture descriptors, pinned clock and site.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEmit, type EmitResult } from '../../lib/emit/index.ts'
import { loadEmitData } from '../../lib/emit/load.ts'
import type { EmitData, EmitOptions } from '../../lib/emit/types.ts'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DATA = join(ROOT, 'test', 'fixtures', 'data')
export const DESCRIPTORS = join(ROOT, 'test', 'fixtures', 'descriptors', 'valid', 'modules')
export const POLICY = join(ROOT, 'policy')
export const NOW = '2026-10-23T03:05:00Z'
export const SITE = 'https://wojciechszyjka.github.io/modules'

export const SKILL = `---
name: om-find-module
description: Before building a feature in an Open Mercato app, search the module registry first.
---

# om-find-module

Read-only until the user agrees.
`

export function tmp(prefix = 'om-emit-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** A skills folder with one SKILL.md (WP14 owns the real one). */
export function skillsDir(): string {
  const dir = tmp('om-skills-')
  mkdirSync(join(dir, 'om-find-module'), { recursive: true })
  writeFileSync(join(dir, 'om-find-module', 'SKILL.md'), SKILL)
  return dir
}

export function fixtureData(overrides: Partial<{ data: string; modules: string; skills: string }> = {}): EmitData {
  return loadEmitData({
    data: overrides.data ?? DATA,
    modules: overrides.modules ?? DESCRIPTORS,
    policy: POLICY,
    skills: overrides.skills ?? join(ROOT, 'test', 'emit', 'no-skills'),
    root: ROOT,
  })
}

export const OPTS: EmitOptions = {
  site: SITE,
  base: '/modules',
  now: NOW,
  mcpUrl: 'https://om-modules.example.workers.dev/mcp',
  originTrialTokens: null,
}

let cached: EmitResult | null = null
/** The fixture emit with one skill, built once per test file. */
export function fixtureEmit(): EmitResult {
  if (!cached) cached = buildEmit(fixtureData({ skills: skillsDir() }), OPTS)
  return cached
}

export function text(r: EmitResult, path: string): string {
  const v = r.public.get(path)
  if (v === undefined) throw new Error(`missing ${path}`)
  return typeof v === 'string' ? v : new TextDecoder().decode(v)
}

export function json<T = unknown>(r: EmitResult, path: string): T {
  return JSON.parse(text(r, path)) as T
}
