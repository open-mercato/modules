// /search-index.json (spec 4.6, 8.2): serialized MiniSearch plus the card metadata, from WP08 `buildSearchIndex`,
// so the site, WebMCP and the Worker rank with the same function. Budget: 100 KB gzipped. Pure.
import { buildSearchIndex, type SearchIndexData } from '../core/search.ts'
import type { LineInfo } from '../core/lines.ts'
import type { BuiltInModule } from '../schema/published/builtin.ts'
import type { IndexEntry } from '../schema/published/modules.ts'
import type { ReceiptSource } from '../core/source.ts'

export const SEARCH_INDEX_MAX_GZIP = 100 * 1024

export function buildPublishedSearchIndex(
  entries: readonly IndexEntry[],
  builtIn: readonly BuiltInModule[],
  lines: readonly LineInfo[],
  dataVersion: string,
  generatedAt: string,
  site: string,
  receiptSource?: ReceiptSource | null,
): SearchIndexData {
  return buildSearchIndex({
    entries,
    builtIn,
    lines,
    dataVersion,
    generatedAt,
    site,
    ...(receiptSource !== undefined ? { receiptSource } : {}),
  })
}
