// Schemas of the `data` branch and the file each one governs (spec 3.2, 4.5).
import type { z } from 'zod'
import { Change } from './changes.ts'
import { BuiltinData, Facts } from './facts.ts'
import { FitResult } from './fit.ts'
import { Health } from './health.ts'
import { HiveSlots, Lines, Presets } from './lines.ts'
import { Receipt } from './receipt.ts'
import { Claims, Stats, SyncRecord } from './sync.ts'
import { Radar } from '../published/radar.ts'
import { OfficialCoverageFile } from './coverage.ts'

export * from './changes.ts'
export * from './coverage.ts'
export * from './facts.ts'
export * from './fit.ts'
export * from './health.ts'
export * from './lines.ts'
export * from './receipt.ts'
export * from './sync.ts'

export interface DataFileRule {
  /** Path pattern relative to the root of the `data` branch. */
  pattern: RegExp
  schema: z.ZodType
  /** One JSON document per line. */
  jsonl: boolean
  /** Job that may write it (spec 5.1). */
  writer: 'watch' | 'sync' | 'collect' | 'any'
}

const LOC = String.raw`(?:@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*|[a-z0-9-~][a-z0-9-._~]*|github\/[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100})`
const VER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`

export const DATA_FILES: readonly DataFileRule[] = [
  { pattern: new RegExp(`^sync/${LOC}\\.json$`), schema: SyncRecord, jsonl: false, writer: 'sync' },
  { pattern: new RegExp(`^facts/${LOC}/${VER}\\.json$`), schema: Facts, jsonl: false, writer: 'watch' },
  { pattern: new RegExp(`^fit/${VER}\\.json$`), schema: FitResult, jsonl: false, writer: 'watch' },
  { pattern: /^receipts\/_baseline\.jsonl$/, schema: Receipt, jsonl: true, writer: 'collect' },
  { pattern: new RegExp(`^receipts/${LOC}\\.jsonl$`), schema: Receipt, jsonl: true, writer: 'collect' },
  { pattern: new RegExp(`^health/${LOC}\\.json$`), schema: Health, jsonl: false, writer: 'any' },
  { pattern: /^builtin\/\d+\.\d+\.\d+\.json$/, schema: BuiltinData, jsonl: false, writer: 'watch' },
  { pattern: /^lines\.json$/, schema: Lines, jsonl: false, writer: 'watch' },
  { pattern: /^presets\.json$/, schema: Presets, jsonl: false, writer: 'collect' },
  { pattern: /^hive\.json$/, schema: HiveSlots, jsonl: false, writer: 'watch' },
  { pattern: /^claims\.json$/, schema: Claims, jsonl: false, writer: 'sync' },
  { pattern: /^stats\.json$/, schema: Stats, jsonl: false, writer: 'sync' },
  { pattern: /^radar\/next\.json$/, schema: Radar, jsonl: false, writer: 'any' },
  { pattern: /^official-coverage\.json$/, schema: OfficialCoverageFile, jsonl: false, writer: 'sync' },
  { pattern: /^changes\/\d{4}-\d{2}\.jsonl$/, schema: Change, jsonl: true, writer: 'any' },
]

/** Rule for a path on the `data` branch, or null when the path is not part of the contract. */
export function dataFileRule(path: string): DataFileRule | null {
  return DATA_FILES.find((r) => r.pattern.test(path)) ?? null
}
