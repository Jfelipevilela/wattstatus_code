const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { collectEnergy } = require('../dist/modules/energy/energy-collector');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) throw new Error('TEST_MONGO_URL must be local');

test('scheduled collection is opt-in, concurrent-safe and idempotent', { skip: !uri }, async () => {
  const name = `wattstatus_test_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, name);
  const admin = new MongoClient(uri);
  await db.init();
  try {
    await db.addAppliance({ id: 'meter', userId: 'owner', name: 'Meter', power: 100, status: 'normal', usageHours: 1,
      days: 30, monthlyCost: 1, monthlyConsumption: 1, tariff: 'SP', tariffValue: 1,
      createdAt: new Date().toISOString(), integrationProvider: 'smartthings', integrationDeviceId: 'device-1' });
    await db.saveIntegrationToken('owner', 'smartthings', 'owned-token');
    let reads = 0;
    const integration = token => {
      assert.equal(token, 'owned-token');
      return {
        listDevices: async () => [{ id: 'device-1', capabilities: ['energyMeter'] }],
        getDeviceStatus: async () => {
          reads++;
          await new Promise(resolve => setTimeout(resolve, 20));
          return { raw: { components: { main: { energyMeter: { energy: { value: 12, unit: 'kWh' } } } } } };
        },
      };
    };
    const options = { enabled: true, intervalMinutes: 30, maxDevices: 2, deadlineMs: 20000, integration };
    assert.equal((await collectEnergy(db, options)).claimed, 0);
    await db.updateUserSettings('owner', { energyCollectionEnabled: true });
    const [one, two] = await Promise.all([collectEnergy(db, options), collectEnergy(db, options)]);
    assert.equal(one.saved + two.saved, 1);
    assert.equal(reads, 1);
    assert.equal((await collectEnergy(db, options)).claimed, 0);
    const rows = await db.getEnergyHistory('owner', new Date(Date.now() - 3600000), new Date(Date.now() + 3600000));
    assert.equal(rows.length, 0); // First cumulative sample is baseline, never invented consumption.
    const later = new Date(Date.now() + 31 * 60000);
    const failed = await collectEnergy(db, { ...options, now: () => later, integration: () => ({
      listDevices: async () => [{ id: 'device-1', capabilities: ['energyMeter'] }],
      getDeviceStatus: async () => { throw new Error('temporary outage'); },
    }) });
    assert.equal(failed.failed, 1);
    assert.equal((await collectEnergy(db, { ...options, now: () => later })).claimed, 0);
    const muchLater = new Date(Date.now() + 63 * 60000);
    const incompatible = await collectEnergy(db, { ...options, now: () => muchLater, integration: () => ({
      listDevices: async () => [{ id: 'device-1', capabilities: ['switch'] }],
      getDeviceStatus: async () => { throw new Error('incompatible device must never be read'); },
    }) });
    assert.equal(incompatible.skipped, 1);
    await db.updateUserSettings('owner', { energyCollectionEnabled: false });
    assert.equal((await collectEnergy(db, options)).claimed, 0);
  } finally {
    await db.close();
    await admin.connect();
    await admin.db(name).dropDatabase();
    await admin.close();
  }
});
