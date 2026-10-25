// One-time migration of the data branch to the decision of 24 Oct (lib/receipts/preset-model.ts). `yarn om health`
// runs it by itself until it has run once with a receipt of a new app in the data; by hand (docs/RUNBOOK.md
// "Migration of 24 Oct"):
//
//   node scripts/migrate-preset-model.ts --data .data [--dry-run]
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrateData, migrationLine } from '../lib/receipts/preset-model.ts'

export {
  migrateData,
  migratePresetModel,
  type MigrationInput,
  type MigrationResult,
} from '../lib/receipts/preset-model.ts'

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--data')
  const data = at >= 0 ? args[at + 1] : undefined
  if (!data) {
    console.error('usage: node scripts/migrate-preset-model.ts --data <dir> [--dry-run]')
    process.exit(64)
  }
  const dry = args.includes('--dry-run')
  console.log(migrationLine(migrateData(resolve(data), dry), dry))
}
