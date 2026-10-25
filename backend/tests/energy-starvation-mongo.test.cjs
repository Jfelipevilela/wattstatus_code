// Starvation regression (review finding): 250 opted-in devices, scheduled runs
// claim and finish one device at a time. Before the queue, the candidate
// window (.limit(200)) always returned the same 200 rows; 50 devices were
// never collected. Runs on old and new code (sync is called when it exists).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to an isolated local MongoDB instance');
}

test('250 dispositivos habilitados: todos recebem coleta (regressão de starvation)', { skip: !uri, timeout: 120000 }, async () => {
  const dbName = `wattstatus_starve_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init();
  await admin.connect();
  const raw = admin.db(dbName);
  try {
    const docs = [];
    for (let i = 0; i < 250; i++) docs.push({ id: `a${i}`, userId: `u${Math.floor(i / 5)}`, name: 'x', integrationProvider: 'smartthings', integrationDeviceId: `dev${i}` });
    await raw.collection('appliances').insertMany(docs);
    await raw.collection('user_settings').insertMany([...new Set(docs.map((d) => d.userId))].map((userId) => ({ userId, energyCollectionEnabled: true })));
    const served = new Set();
    let now = new Date('2026-10-24T12:00:00Z');
    // 100 runs of 3 devices = 300 claims, more than one full round.
    for (let runIndex = 0; runIndex < 100; runIndex++) {
      if (typeof db.syncEnergyCollection === 'function') await db.syncEnergyCollection(now);
      for (let i = 0; i < 3; i++) {
        const claim = await db.claimEnergyCollection(now, 60000);
        if (!claim) break;
        served.add(claim.key);
        await db.finishEnergyCollection(claim.key, now, 30 * 60000, true);
      }
      now = new Date(now.getTime() + 5 * 60000);
    }
    console.log('STARVATION', JSON.stringify({ devices: 250, served: served.size }));
    assert.equal(served.size, 250, `only ${served.size} of 250 devices were ever collected`);
  } finally {
    await raw.dropDatabase().catch(() => {});
    await admin.close();
    await db.close();
  }
});
