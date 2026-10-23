const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { createApp, buildIntegrations } = require('../dist/app');

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
    await assert.rejects(db.addAppliance({ ...appliance, id: 'duplicate' }), /DEVICE_ALREADY_IMPORTED/);
    await db.createSession('a', 'session-a', new Date(Date.now() + 60000));
    assert.equal(await db.hasSession('a', 'session-a'), true);
    assert.equal(await db.hasSession('b', 'session-a'), false);
    await db.revokeSession('a', 'session-a');
    assert.equal(await db.hasSession('a', 'session-a'), false);
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
    await db.saveEnergySample('a', 'smartthings', 'device-a', 13, new Date('2026-11-01T00:10:00.000Z'));
    const november = await db.getEnergyHistory('a', new Date('2026-11-01T00:00:00.000Z'), new Date('2026-12-01T00:00:00.000Z'));
    assert.equal(november.length, 1);
    assert.equal(november[0].consumptionKWh, 1);
    await db.deleteAppliance('a', 'appliance-a');
    assert.equal((await db.getEnergyHistory('a', ...range, 'appliance-a')).length, 2);
    await db.close();
    db = new MongoDatabase(uri, dbName);
    await db.init();
    assert.equal((await db.getEnergyHistory('a', ...range)).length, 2);
    const app = createApp({ db, integrationManager: buildIntegrations() });
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const registration = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Teste', email: 'test@example.invalid', password: 'secret123', confirmPassword: 'secret123' }) });
      assert.equal(registration.status, 201);
      const { token } = await registration.json();
      const headers = { Authorization: `Bearer ${token}` };
      assert.equal((await fetch(base + '/api/energy/history?start=2026-10-01T00%3A00%3A00.000Z&end=2026-11-01T00%3A00%3A00.000Z', { headers })).status, 200);
      const csrf = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: `wattstatus_token=${token}`, Origin: 'https://evil.example' } });
      assert.equal(csrf.status, 403);
      assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers })).status, 200);
      assert.equal((await fetch(base + '/api/auth/me', { headers })).status, 401);
    } finally { await new Promise(resolve => server.close(resolve)); }
  } finally {
    await db.close();
    await admin.connect();
    await admin.db(dbName).dropDatabase();
    await admin.close();
  }
});
