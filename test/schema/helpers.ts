// Shared helpers for test/schema (fixture paths, YAML loading, file walking).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const FIXTURES = join(ROOT, 'test', 'fixtures')
export const DATA = join(FIXTURES, 'data')
export const VALID_DESCRIPTORS = join(FIXTURES, 'descriptors', 'valid')
export const INVALID_DESCRIPTORS = join(FIXTURES, 'descriptors', 'invalid')

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

export function rel(from: string, p: string): string {
  return relative(from, p).split(sep).join('/')
}

export function readYaml(p: string): unknown {
  return parse(readFileSync(p, 'utf8'))
}

export function readJson(p: string): unknown {
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function readJsonl(p: string): unknown[] {
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as unknown)
}
