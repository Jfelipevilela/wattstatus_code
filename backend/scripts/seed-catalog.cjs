// No database writes without --apply. Never deletes catalog entries or user data.
const { catalogSeed } = require("../dist/modules/catalog/catalog.seed");
const { MongoDatabase } = require("../dist/storage/mongo-db");
async function main() {
  if (!process.argv.includes("--apply")) {
    console.log(
      `Seed válido: versão ${catalogSeed.version}, ${catalogSeed.categories.length} categorias, ${catalogSeed.devices.length} aparelhos. Use --apply para importar.`,
    );
    return;
  }
  const local = process.argv.includes("--local");
  const db = local
    ? new MongoDatabase("mongodb://127.0.0.1:27017", "wattstatus_catalog_dev")
    : new MongoDatabase();
  try {
    await db.init();
    const result = await db.seedCatalog(
      process.argv.includes("--update-existing"),
    );
    console.log(
      JSON.stringify({
        inserted: result.upsertedCount,
        updated: result.modifiedCount,
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    "Falha ao importar catálogo; confira o MongoDB e os logs seguros.",
  );
  process.exitCode = 1;
});
