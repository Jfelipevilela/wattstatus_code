const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to an isolated local MongoDB instance');
}

test('MongoDB persists isolated energy samples and historical tariffs', { skip: !uri }, async () => {
  const dbName = `wattstatus_test_${randomUUID().replaceAll('-', '')}`;
  let db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init();
  try {
    const appliance = { id: 'appliance-a', userId: 'a', name: 'Medidor', power: 100,
      status: 'normal', usageHours: 1, days: 30, monthlyCost: 3, monthlyConsumption: 3,
      tariff: 'SP', tariffValue: 1.5, createdAt: '2026-10-01T00:00:00.000Z',
      integrationProvider: 'smartthings', integrationDeviceId: 'device-a' };
    await db.addAppliance(appliance);
    const at = (minute) => new Date(`2026-10-22T10:${String(minute).padStart(2, '0')}:00.000Z`);
    await db.saveEnergySample('a', 'smartthings', 'device-a', 10, at(0));
    await db.saveEnergySample('a', 'smartthings', 'device-a', 10, at(0));
    await db.saveEnergySample('a', 'smartthings', 'device-a', 11, at(1));
    await db.saveEnergySample('b', 'smartthings', 'device-a', 100, at(0));
    await db.saveEnergySample('b', 'smartthings', 'device-a', 101, at(1));
    const range = [new Date('2026-10-01T00:00:00.000Z'), new Date('2026-11-01T00:00:00.000Z')];
    let rows = await db.getEnergyHistory('a', ...range, 'appliance-a');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].consumptionKWh, 1);
    assert.equal(rows[0].cost, 1.5);
    assert.equal((await db.getEnergyHistory('b', ...range)).length, 1);
    assert.equal((await db.getEnergyHistory('a', ...range, 'other')).length, 0);
    await db.updateAppliance('a', { ...appliance, power: 500, tariffValue: 2 });
    await db.saveEnergySample('a', 'smartthings', 'device-a', 12, at(2));
    rows = await db.getEnergyHistory('a', ...range);
    assert.deepEqual(rows.map(row => row.cost), [1.5, 2]);
    await db.deleteAppliance('a', 'appliance-a');
    assert.equal((await db.getEnergyHistory('a', ...range, 'appliance-a')).length, 2);
    await db.close();
    db = new MongoDatabase(uri, dbName);
    await db.init();
    assert.equal((await db.getEnergyHistory('a', ...range)).length, 2);
  } finally {
    await db.close();
    await admin.connect();
    await admin.db(dbName).dropDatabase();
    await admin.close();
  }
});
