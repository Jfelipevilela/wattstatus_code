const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { PropertyService } = require('../dist/modules/properties/properties.service');
const { ApplianceService } = require('../dist/modules/appliances/appliances.service');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to an isolated local MongoDB instance');
}

test('MongoDB keeps properties isolated and snapshots measurement locations', { skip: !uri }, async () => {
  const dbName = `wattstatus_test_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init();
  try {
    const legacy = {
      id: randomUUID(), userId: 'a', name: 'Ar', power: 1000, status: 'normal', usageHours: 1, days: 30,
      monthlyCost: 30, monthlyConsumption: 30, tariff: 'SP', tariffValue: 1, createdAt: '2026-01-01T00:00:00.000Z',
      integrationProvider: 'smartthings', integrationDeviceId: 'device-a',
    };
    await db.addAppliance(legacy);
    const properties = new PropertyService(db);
    const appliances = new ApplianceService(db, properties);

    // Concurrent first access still yields one default property (unique index).
    await Promise.all([properties.list('a'), properties.list('a'), properties.list('a')]);
    const [home] = await properties.list('a');
    assert.equal((await properties.list('a')).length, 1);
    assert.equal((await db.listAppliances('a'))[0].propertyId, home.id);
    assert.equal((await properties.list('b')).length, 1);
    assert.equal((await db.listProperties('a')).some((p) => p.userId !== 'a'), false);

    const sala = await properties.addRoom('a', home.id, { name: 'Sala', type: 'living' });
    const quarto = await properties.addRoom('a', home.id, { name: 'Quarto', type: 'bedroom' });
    await appliances.update('a', legacy.id, { roomId: sala.id });

    const at = (minute) => new Date(Date.UTC(2026, 9, 10, 10, minute));
    await db.saveEnergySample('a', 'smartthings', 'device-a', 10, at(0));
    await db.saveEnergySample('a', 'smartthings', 'device-a', 11, at(10));
    await appliances.update('a', legacy.id, { roomId: quarto.id });
    await db.saveEnergySample('a', 'smartthings', 'device-a', 13, at(20));
    await db.saveEnergySample('a', 'smartthings', 'device-a', 14, at(30));

    const range = [new Date(Date.UTC(2026, 9, 1)), new Date(Date.UTC(2026, 10, 1))];
    const all = await properties.energy('a', home.id, ...range);
    assert.deepEqual(all.intervals.map((i) => [i.consumptionKWh, i.roomId]), [[1, sala.id], [2, null], [1, quarto.id]]);
    const onlySala = await properties.energy('a', home.id, ...range, sala.id);
    assert.equal(onlySala.intervals.length, 1);
    await assert.rejects(properties.energy('b', home.id, ...range), (err) => err.status === 404);

    // Deleting a room never deletes appliances or samples.
    await properties.removeRoom('a', home.id, quarto.id);
    assert.equal((await db.listAppliances('a'))[0].roomId, null);
    assert.equal((await properties.energy('a', home.id, ...range)).intervals.length, 3);
  } finally {
    await admin.connect();
    await admin.db(dbName).dropDatabase();
    await admin.close();
    await db.close();
  }
});

test('default property stays unique even without secondary indexes', { skip: !uri }, async () => {
  const dbName = `wattstatus_test_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init(false); // no indexes: only the deterministic _id protects
  try {
    const properties = new PropertyService(db);
    await Promise.all(Array.from({ length: 8 }, () => properties.list('legacy-user')));
    assert.equal((await db.listProperties('legacy-user')).length, 1);
  } finally {
    await admin.connect();
    await admin.db(dbName).dropDatabase();
    await admin.close();
    await db.close();
  }
});
