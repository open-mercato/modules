// `describe-local` (spec 5.4): for authors, without network. Reads a local package (a directory with package.json
// or a .tgz from `npm pack`), runs the same static Rentgen as CI (nothing is executed) and prints the gate result
// and a proposed descriptor. Fields only the author can write (category when it cannot be guessed, whenToUse) are
// left as visible TODOs, so the proposal fails `validate` until a person fills them.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Document, Scalar } from 'yaml'
import { isPlainText } from '../core/text.ts'
import { builtForText, kindText, licenseText, lintOf, anatomyText } from './remote.ts'
import { scanPackageDir } from '../rentgen/extract.ts'
import { removeDir, tempDir, unpackTarball } from '../rentgen/unpack.ts'
import { parseRepoUrl } from '../sources/github.ts'
import { CategoryId, GithubRepo, NpmName, descriptorFile, type Facts, type LintFinding } from '../schema/index.ts'
import type { Catalog } from './catalog.ts'
import { checkSchema } from './local.ts'
import { formatDescriptorText } from './format.ts'

export const TODO = 'TODO'

export interface DescribeResult {
  locator: string
  /** Repo-relative path the descriptor belongs at. */
  file: string
  yaml: string
  facts: Facts
  gate: { pass: boolean; text: string }
  report: { check: string; result: string }[]
  lint: LintFinding[]
  /** What still keeps the proposal from passing validation (TODO fields). */
  problems: string[]
}

const IGNORED_KEYWORDS = new Set(['open-mercato', 'open-mercato-module', 'openmercato', 'mercato', 'module'])

/** Category from package keywords: a category ID or one of its aliases. */
export function guessCategory(keywords: readonly string[], aliases: ReadonlyMap<string, string>): string | null {
  for (const k of keywords) {
    const kw = k.toLowerCase()
    if ((CategoryId.options as readonly string[]).includes(kw)) return kw
    const a = aliases.get(kw)
    if (a) return a
  }
  return null
}

async function withPackage<T>(input: string, fn: (dir: string) => Promise<T>): Promise<T> {
  if (statSync(input).isDirectory()) return fn(input)
  if (!/\.(tgz|tar\.gz|tar)$/.test(input)) throw new Error(`${input}: expected a package directory or a .tgz`)
  const dir = tempDir('om-describe-')
  try {
    await unpackTarball(new Uint8Array(readFileSync(input)), dir, { strip: 1 })
    return await fn(dir)
  } finally {
    removeDir(dir)
  }
}

export async function describeLocal(
  input: string,
  catalog: Catalog,
  opts: { category?: string } = {},
): Promise<DescribeResult> {
  return withPackage(input, async (dir) => {
    const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
    const name = typeof pj.name === 'string' ? pj.name : ''
    const repoRaw = pj.repository
    const repoUrl =
      typeof repoRaw === 'string'
        ? repoRaw
        : repoRaw && typeof repoRaw === 'object' && typeof (repoRaw as { url?: unknown }).url === 'string'
          ? (repoRaw as { url: string }).url
          : null
    const repo = parseRepoUrl(repoUrl)
    const github = repo && GithubRepo.safeParse(repo).success ? repo : null
    const npmOk = NpmName.safeParse(name).success
    if (!npmOk && !github) throw new Error('package.json needs a valid npm name or a GitHub repository URL')
    const locator = npmOk ? `npm:${name}` : `github:${github}`
    const latestOm =
      catalog.lines?.lines.find((l) => l.source === 'latest')?.version ?? catalog.builtin?.coreVersion ?? null
    const facts = await scanPackageDir(dir, {
      locator,
      source: 'npm-tarball',
      integrity: null,
      gitRef: null,
      builtin: catalog.builtin,
      latestOm,
    })
    const keywords = Array.isArray(pj.keywords) ? pj.keywords.filter((k): k is string => typeof k === 'string') : []
    const category =
      opts.category && (CategoryId.options as readonly string[]).includes(opts.category)
        ? opts.category
        : guessCategory(keywords, catalog.categoryAliases)
    const tags = [...new Set(keywords.map((k) => k.toLowerCase()))]
      .filter((k) => /^[a-z0-9-]{2,24}$/.test(k) && !IGNORED_KEYWORDS.has(k))
      .slice(0, 8)
    const desc = typeof pj.description === 'string' ? pj.description.trim() : ''
    const summaryOk = desc.length >= 20 && desc.length <= 140 && isPlainText(desc)
    const peers = Object.keys((pj.peerDependencies as Record<string, string> | undefined) ?? {})

    const d: Record<string, unknown> = {}
    if (npmOk) d.npm = name
    if (github) d.github = github
    if (facts.kind !== 'module') d.kind = facts.kind
    d.category = category ?? TODO
    if (tags.length > 0) d.tags = tags
    d.summary = summaryOk ? desc : TODO
    d.whenToUse = `Use when ${TODO}`
    if (facts.kind === 'provider' && peers.includes('@open-mercato/web-research'))
      d.extends = 'npm:@open-mercato/web-research'
    const scripts = Object.keys((pj.scripts as Record<string, string> | undefined) ?? {}).filter((s) =>
      ['preinstall', 'install', 'postinstall', 'prepare'].includes(s),
    )
    if (scripts.length > 0) d.scriptsRequired = { reason: TODO }

    const doc = new Document(d)
    const note = (key: string, text: string) => {
      const node = doc.get(key, true)
      if (node instanceof Scalar) node.comment = ` ${text}`
    }
    if (!category) note('category', `TODO one of: ${CategoryId.options.join(', ')}`)
    if (!summaryOk) note('summary', 'TODO 20-140 characters, plain English, what the module does')
    note('whenToUse', 'TODO 40-240 characters: the situation in which an app needs it')
    if (scripts.length > 0) {
      const sr = doc.get('scriptsRequired', true)
      if (sr && typeof sr === 'object' && 'commentBefore' in sr)
        (sr as { commentBefore?: string }).commentBefore =
          ` install scripts: ${scripts.join(', ')}; say why they are needed`
    }
    doc.commentBefore = ` Proposed by yarn om describe-local from ${name || github}@${facts.package.version}. Fill the TODOs.`
    const file = descriptorFile(locator)
    const yaml = (
      await formatDescriptorText(doc.toString({ lineWidth: 0 }), join(catalog.root, file), {
        categoryAliases: catalog.categoryAliases,
      })
    ).text

    const problems = checkSchema({ file, text: yaml }, catalog).findings.map((x) => x.message)
    const lint = lintOf(facts, latestOm, null)
    const pass = facts.kind !== 'module' || facts.gate.installable
    const fake = { kind: facts.kind, extends: d.extends as string | undefined } as Parameters<typeof kindText>[1]
    const report = [
      { check: 'Kind', result: kindText(facts, fake) },
      { check: 'License', result: licenseText(facts) },
      { check: 'Anatomy', result: anatomyText(facts) },
      { check: 'Built for', result: builtForText(facts.omPeers, latestOm) },
    ]
    return {
      locator,
      file,
      yaml,
      facts,
      gate: {
        pass,
        text: pass
          ? `passes: ${facts.kind === 'module' ? 'src/modules and dist/modules pair found' : `${facts.kind}, read from package.json`}`
          : `fails: ${facts.gate.reason ?? 'no src/modules and dist/modules pair'}`,
      },
      report,
      lint,
      problems,
    }
  })
}
