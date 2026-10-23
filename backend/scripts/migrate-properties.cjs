#!/usr/bin/env node
// Living Energy migration: gives every user a default property ("Meu imóvel"
// + "Térreo") and attaches appliances without a property to the user's
// primary property. Idempotent, additive only, never deletes.
//
//   npm run build
//   node scripts/migrate-properties.cjs            # dry run (default)
//   node scripts/migrate-properties.cjs --apply    # write changes
//
// Uses MONGO_URL / MONGO_DB_NAME from the environment (.env).
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { PropertyService } = require('../dist/modules/properties/properties.service');
const { env } = require('../dist/config/env');

const apply = process.argv.includes('--apply');

(async () => {
  const db = new MongoDatabase(env.mongoUrl, env.mongoDbName);
  await db.init(apply);
  const raw = db.db;
  try {
    const userIds = new Set([
      ...(await raw.collection('users').distinct('id')),
      ...(await raw.collection('appliances').distinct('userId')),
    ].filter((value) => typeof value === 'string' && value));
    let usersWithoutProperty = 0;
    let appliancesWithoutProperty = 0;
    for (const userId of userIds) {
      const hasProperty = await raw.collection('properties').countDocuments({ userId }, { limit: 1 });
      const loose = await raw.collection('appliances').countDocuments({ userId, propertyId: { $in: [null] } });
      if (!hasProperty) usersWithoutProperty++;
      appliancesWithoutProperty += loose;
      if (apply && (!hasProperty || loose > 0)) await new PropertyService(db).ensureDefault(userId);
    }
    // Counts only: no names, emails or ids are printed.
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      usersScanned: userIds.size,
      usersWithoutProperty,
      appliancesWithoutProperty,
      note: apply ? 'Changes written. Re-running is safe.' : 'Nothing written. Run with --apply after a backup.',
    }, null, 2));
  } finally {
    await db.close();
  }
})().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
