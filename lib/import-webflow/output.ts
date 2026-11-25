// Output of the importer (spec API Contracts, "Output" and "Ownership manifest"): files formatted with the
// repository's Prettier config, LF, UTF-8, dates as quoted ISO strings, and www/content/.webflow-import.json holding
// per written file its path, webflowId and the SHA-256 of what the importer wrote. A re-run overwrites a file only while
// its hash equals the manifest, reports every edited file as a conflict and leaves it unless --force names it. Files the
// importer did not write are never touched; an entry gone from the export is reported, not deleted.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Document, isScalar, visit } from 'yaml'

/** The manifest's place under the target root. */
export const MANIFEST_PATH = 'www/content/.webflow-import.json'

/** One file of the import's output. */
export interface OutFile {
  /** Path under the target root, `/`-separated (`www/content/blog/x.md`, `www/public/media/blog/y.png`). */
  path: string
  bytes: Uint8Array
  /** The Webflow item, page, collection or file id the file came from. */
  webflowId: string
}

export interface ManifestEntry {
  path: string
  webflowId: string
  sha256: string
}

export interface Manifest {
  version: 1
  files: ManifestEntry[]
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/
/** Words a YAML 1.1 reader takes for a boolean or null; quoted so every reader keeps them strings. */
const YAML11_WORDS = /^(?:y|yes|n|no|on|off|true|false|null|~)$/i

/**
 * YAML of a value with keys in insertion order (the writers build objects in schema order) and every string that
 * reads as a date quoted: Astro's frontmatter parser turns an unquoted date into a Date and rolls an impossible day over.
 */
export function toYaml(value: unknown): string {
  const doc = new Document(value)
  visit(doc, {
    Scalar(_key, node) {
      if (
        isScalar(node) &&
        typeof node.value === 'string' &&
        (ISO_DATE_RE.test(node.value) || YAML11_WORDS.test(node.value))
      )
        node.type = 'QUOTE_DOUBLE'
    },
  })
  return doc.toString({ lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' })
}

/** A Markdown file with YAML frontmatter. */
export function markdownFile(frontmatter: unknown, body: string): string {
  return `---\n${toYaml(frontmatter)}---\n\n${body.trim()}\n`
}

type PrettierApi = typeof import('prettier')
let prettierApi: Promise<PrettierApi> | undefined

/** Formats text with the repository's Prettier config, resolved from `repoRoot` (never from the target folder). */
export async function format(text: string, path: string, repoRoot: string): Promise<string> {
  prettierApi ??= import('prettier')
  const prettier = await prettierApi
  const config = (await prettier.resolveConfig(join(repoRoot, path))) ?? {}
  const out = await prettier.format(text, { ...config, filepath: path, endOfLine: 'lf' })
  return out.endsWith('\n') ? out : `${out}\n`
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function readManifest(root: string): Manifest {
  const file = join(root, MANIFEST_PATH)
  if (!existsSync(file)) return { version: 1, files: [] }
  const m = JSON.parse(readFileSync(file, 'utf8')) as Manifest
  if (m.version !== 1 || !Array.isArray(m.files)) throw new Error(`${MANIFEST_PATH}: not a manifest of version 1`)
  return m
}

/** What a run does with one file. */
export type Action =
  | { kind: 'create'; file: OutFile }
  | { kind: 'update'; file: OutFile }
  | { kind: 'unchanged'; file: OutFile }
  | { kind: 'forced'; file: OutFile }
  /** Edited since the importer wrote it (hash differs from the manifest): kept. */
  | { kind: 'conflict'; file: OutFile; why: string }

export interface Plan {
  actions: Action[]
  /** Manifest entries whose item is gone from the export (or was not produced this run): reported, not deleted. */
  gone: ManifestEntry[]
  manifest: Manifest
  /** The manifest's bytes as this run writes them. */
  manifestBytes: Uint8Array
  /** True when the manifest on disk differs from the one this run writes. */
  manifestChanged: boolean
}

/**
 * Decides per file. `owned` tells which manifest entries this run is responsible for (the collections it ran with
 * --only); the others are carried over untouched. `force` lists paths a conflict may overwrite.
 */
export async function planOutput(
  root: string,
  repoRoot: string,
  files: OutFile[],
  owned: (entry: ManifestEntry) => boolean,
  force: ReadonlySet<string>,
): Promise<Plan> {
  const previous = readManifest(root)
  const byPath = new Map(previous.files.map((e) => [e.path, e]))
  const produced = new Set(files.map((f) => f.path))
  const actions: Action[] = []
  const entries = new Map<string, ManifestEntry>()
  for (const e of previous.files) if (!owned(e)) entries.set(e.path, e)

  for (const file of [...files].sort((a, b) => cmp(a.path, b.path))) {
    const target = join(root, file.path)
    const hash = sha256(file.bytes)
    const entry: ManifestEntry = { path: file.path, webflowId: file.webflowId, sha256: hash }
    const known = byPath.get(file.path)
    if (!existsSync(target)) {
      actions.push({ kind: 'create', file })
      entries.set(file.path, entry)
      continue
    }
    const current = sha256(new Uint8Array(readFileSync(target)))
    const edited =
      known === undefined
        ? 'the importer did not write it'
        : current !== known.sha256
          ? 'edited since the import'
          : null
    if (edited !== null && current !== hash) {
      if (force.has(file.path)) {
        actions.push({ kind: 'forced', file })
        entries.set(file.path, entry)
      } else {
        actions.push({ kind: 'conflict', file, why: edited })
        // keep the old entry: the file stays a conflict until someone forces it or restores it
        if (known) entries.set(file.path, known)
      }
      continue
    }
    actions.push({ kind: current === hash ? 'unchanged' : 'update', file })
    entries.set(file.path, entry)
  }

  const gone: ManifestEntry[] = []
  for (const e of previous.files) {
    if (owned(e) && !produced.has(e.path)) {
      gone.push(e)
      entries.set(e.path, e)
    }
  }

  const manifest: Manifest = { version: 1, files: [...entries.values()].sort((a, b) => cmp(a.path, b.path)) }
  const manifestBytes = utf8(await format(JSON.stringify(manifest), MANIFEST_PATH, repoRoot))
  const onDisk = join(root, MANIFEST_PATH)
  const manifestChanged = !existsSync(onDisk) || sha256(new Uint8Array(readFileSync(onDisk))) !== sha256(manifestBytes)
  return { actions, gone, manifest, manifestBytes, manifestChanged }
}

/** Writes the files of a plan (create, update, forced) and the manifest. */
export function applyPlan(root: string, plan: Plan): void {
  for (const a of plan.actions) {
    if (a.kind === 'create' || a.kind === 'update' || a.kind === 'forced')
      writeAtomic(join(root, a.file.path), a.file.bytes)
  }
  if (plan.manifestChanged) writeAtomic(join(root, MANIFEST_PATH), plan.manifestBytes)
}

function writeAtomic(file: string, bytes: Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, bytes)
  renameSync(`${file}.tmp`, file)
}

/** Code-point order, the same on every machine. */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
