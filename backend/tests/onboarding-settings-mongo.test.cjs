const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to isolated local MongoDB');
}

test('onboarding progress persists per user without changing other preferences', { skip: !uri }, async () => {
  const dbName = `wattstatus_onboarding_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init();
  try {
    await db.updateUserSettings('account-a', { theme: 'dark', tariffState: 'SP', tariffValue: 0.82 });
    await db.updateUserSettings('account-a', { onboarding: { status: 'in_progress', step: 3 } });
    assert.deepEqual((await db.getUserSettings('account-a')).onboarding, { status: 'in_progress', step: 3 });
    assert.equal((await db.getUserSettings('account-a')).tariffValue, 0.82);
    assert.equal((await db.getUserSettings('account-a')).theme, 'dark');
    assert.equal((await db.getUserSettings('account-b')).onboarding, undefined);
    await db.updateUserSettings('account-a', { onboarding: { status: 'complete', step: 5 } });
    assert.deepEqual((await db.getUserSettings('account-a')).onboarding, { status: 'complete', step: 5 });
  } finally {
    await admin.db(dbName).dropDatabase().catch(() => {});
    await admin.close();
    await db.close();
  }
});
