// The Config section of the X-ray film (AnatomyFilm.astro): its rows and the count its header and legend print come
// from one list, so a package without a module, whose env names come from its own src/ (rentgen 3 `packageCode`),
// never reads `Config 0` above its env rows (audit R11, 28 Oct).
import type { Facts, ModuleFacts } from '../../../lib/schema/index.ts'

export interface ConfigItem {
  lead: string
  text: string
  tag?: string
  tagTone?: 'wait'
  file?: string | null
  line?: number | null
}

type EnvRead = ModuleFacts['config']['env'][number]

// a name the code only checks is set (rentgen 4 `ifSet`) is tagged `if set`: the package runs without it
const envItem = (e: EnvRead): ConfigItem => ({
  lead: 'env   ',
  text: e.name,
  file: e.src?.file ?? null,
  line: e.src?.line ?? null,
  ...(e.ifSet ? { tag: 'if set', tagTone: 'wait' as const } : {}),
})

/** Rows of the Config section: each module's credentials and env, then the env of the package's own src/. */
export function configSection(
  ms: readonly ModuleFacts[],
  pkgCode: Facts['packageCode'] | null,
): { items: ConfigItem[]; credentials: number; env: number } {
  const credentials = ms.flatMap((m) => m.config.credentials)
  const env = [...ms.flatMap((m) => m.config.env), ...(pkgCode?.env ?? [])]
  const items = ms
    .flatMap((m): ConfigItem[] => [
      // the lead says what the field is: only a secret-type credential is a secret (`nip (text)` is a plain field)
      ...m.config.credentials.map((c) => ({
        lead: c.type === 'secret' ? 'secret' : 'field',
        text: c.type === 'secret' ? c.key : `${c.key} (${c.type})`,
        tag: c.required ? 'required' : undefined,
        tagTone: 'wait' as const,
      })),
      ...m.config.env.map(envItem),
    ])
    .concat((pkgCode?.env ?? []).map(envItem))
  return { items, credentials: credentials.length, env: env.length }
}

/** Non-zero parts with their unit (`['18 pages', '4 widgets']`); a section of one kind prints its bare number. */
export function filmParts(...xs: [number, string, string][]): string[] {
  const nz = xs.filter(([n]) => n > 0)
  if (nz.length < 2) return [String(nz[0]?.[0] ?? 0)]
  return nz.map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
}

/** Count text of the Config header and legend row. */
export const configCount = (c: { credentials: number; env: number }): string[] =>
  filmParts([c.credentials, 'credential', 'credentials'], [c.env, 'env', 'env'])
