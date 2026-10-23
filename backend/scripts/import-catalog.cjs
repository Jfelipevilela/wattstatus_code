// Administrative local-file ingestion. No network fetching or public endpoint.
const { lstatSync, readFileSync } = require('node:fs');
const { CatalogImportService } = require('../dist/modules/catalog/import/service');
const { readDataset } = require('../dist/modules/catalog/import/files');
const { manifestSchema } = require('../dist/modules/catalog/import/providers');
const { MongoDatabase } = require('../dist/storage/mongo-db');
async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--file', '--manifest', '--apply', '--local', '--dry-run']);
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.has(key) || seen.has(key)) throw new Error('ARGUMENT_INVALID');
    seen.add(key);
    if (['--file', '--manifest'].includes(key) && (!args[++i] || args[i].startsWith('--'))) throw new Error('VALUE_REQUIRED');
  }
  const option = name => args[args.indexOf(name) + 1];
  if (!seen.has('--file') || !seen.has('--manifest')) throw new Error('FILE_AND_MANIFEST_REQUIRED');
  if (seen.has('--apply') && (seen.has('--dry-run') || !seen.has('--local'))) throw new Error('LOCAL_APPLY_REQUIRED');
  const file = option('--manifest'), stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10000) throw new Error('MANIFEST_LIMIT');
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const records = readDataset(option('--file'));
  const apply = seen.has('--apply');
  const db = apply ? new MongoDatabase('mongodb://127.0.0.1:27017', 'wattstatus_catalog_dev') : undefined;
  try {
    if (db) await db.init();
    const report = await new CatalogImportService(db).run(records, manifest, !apply);
    console.log(JSON.stringify(report, null, 2));
    if (report.invalid || report.failed) process.exitCode = 1;
  } finally { if (db) await db.close(); }
}
main().catch(() => { console.error('Importação recusada. Confira formato, manifesto, limites e MongoDB local.'); process.exitCode = 1; });
