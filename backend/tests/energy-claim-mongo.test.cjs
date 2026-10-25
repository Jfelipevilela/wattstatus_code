// The scheduled collector must find opted-in users even when many appliances
// belong to users who did not opt in, without writing their settings.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');

const SETTINGS = 'user_settings';
const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to an isolated local MongoDB instance');
}

test('coleta agendada não é bloqueada por usuários sem opt-in', { skip: !uri }, async () => {
  const dbName = `wattstatus_test_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init();
  try {
    const docs = [];
    for (let i = 0; i < 250; i++) docs.push({ id: `off-${i}`, userId: `off-user-${i}`, name: 'x', integrationProvider: 'smartthings', integrationDeviceId: `dev-off-${i}` });
    docs.push({ id: 'on-1', userId: 'on-user', name: 'y', integrationProvider: 'smartthings', integrationDeviceId: 'dev-on' });
    await admin.connect();
    await admin.db(dbName).collection('appliances').insertMany(docs);
    await db.updateUserSettings('on-user', { energyCollectionEnabled: true });
    const settingsBefore = await admin.db(dbName).collection(SETTINGS).countDocuments();
    await db.syncEnergyCollection(new Date());
    const claim = await db.claimEnergyCollection(new Date(), 60000);
    assert.equal(claim?.appliance.id, 'on-1');
    assert.equal(await admin.db(dbName).collection(SETTINGS).countDocuments(), settingsBefore, 'no settings created for other users');
  } finally {
    await admin.db(dbName).dropDatabase();
    await admin.close();
    await db.close();
  }
});
