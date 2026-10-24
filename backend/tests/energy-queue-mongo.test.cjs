// Scheduled collection queue against a real, isolated MongoDB (TEST_MONGO_URL).
// Regression for the starvation found in review: with more than 200 opted-in
// devices, the old candidate window (.limit(200)) returned the same 200 rows
// forever and the rest were never collected.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { collectEnergy } = require('../dist/modules/energy/energy-collector');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to an isolated local MongoDB instance');
}
const MIN = 60000;
const INTERVAL = 30 * MIN;
const RUN_EVERY = 5 * MIN;
const PER_RUN = 3; // collectEnergy caps a scheduled run at 3 devices
const T0 = new Date('2026-10-24T12:00:00Z');

const withDb = async (fn) => {
  const dbName = `wattstatus_queue_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init();
  await admin.connect();
  try { await fn(db, admin.db(dbName)); } finally {
    await admin.db(dbName).dropDatabase().catch(() => {});
    await admin.close();
    await db.close();
  }
};
const seed = async (raw, devices, { perUser = 5, prefix = 'u', enabled = true } = {}) => {
  const docs = [];
  const users = new Set();
  for (let i = 0; i < devices; i++) {
    const userId = `${prefix}${Math.floor(i / perUser)}`;
    users.add(userId);
    docs.push({ id: `${prefix}-a${i}`, userId, name: `d${i}`, integrationProvider: 'smartthings', integrationDeviceId: `${prefix}-dev${i}` });
  }
  if (docs.length) await raw.collection('appliances').insertMany(docs);
  await raw.collection('user_settings').insertMany([...users].map((userId) => ({ userId, energyCollectionEnabled: enabled, theme: 'system', apps: [], historicalData: [] })));
  return docs;
};
// One scheduled run: register a page, then serve up to PER_RUN devices.
const run = async (db, now, served, { capacity = PER_RUN, fail = () => false, interval = () => INTERVAL } = {}) => {
  await db.syncEnergyCollection(now);
  let claims = 0;
  for (let i = 0; i < capacity; i++) {
    const claim = await db.claimEnergyCollection(now, MIN);
    if (!claim) break;
    claims++;
    const ok = !fail(claim);
    if (ok) served.set(claim.key, (served.get(claim.key) ?? 0) + 1);
    await db.finishEnergyCollection(claim.key, now, interval(claim), ok);
  }
  return claims;
};

for (const size of [1, 50, 199, 200, 201, 250, 500, 1000]) {
  test(`fila atende todos os ${size} dispositivos, um de cada vez, sem esquecer nenhum`, { skip: !uri, timeout: 240000 }, async () => {
    await withDb(async (db, raw) => {
      await seed(raw, size);
      const served = new Map();
      let now = T0, runs = 0, claims = 0;
      const claimTimes = [];
      // Capacity bound: ceil(size / PER_RUN) runs, plus one per sync page.
      const bound = Math.ceil(size / PER_RUN) + Math.ceil(size / 500) + 1;
      while (served.size < size && runs < bound) {
        const t0 = process.hrtime.bigint();
        claims += await run(db, now, served);
        claimTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
        now = new Date(now.getTime() + RUN_EVERY);
        runs++;
      }
      assert.equal(served.size, size, `served ${served.size} of ${size} in ${runs} runs`);
      // Fairness: nobody is served twice before everyone was served once,
      // as long as a full round fits in the interval.
      if (Math.ceil(size / PER_RUN) * RUN_EVERY <= INTERVAL) assert.ok([...served.values()].every((count) => count === 1));
      else assert.ok([...served.values()].every((count) => count <= 1 + Math.ceil((runs * RUN_EVERY) / INTERVAL)));
      const rows = await raw.collection('energy_collection').countDocuments();
      assert.equal(rows, size);
      console.log('QUEUE_BENCH', JSON.stringify({ size, runs, claims, hoursToServeAll: Number(((runs * RUN_EVERY) / 3600000).toFixed(1)), msPerRunAvg: Number((claimTimes.reduce((a, b) => a + b, 0) / claimTimes.length).toFixed(2)) }));
    });
  });
}

test('dispositivo ainda não vencido não é atendido; vencido sim', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 2);
    await db.syncEnergyCollection(T0);
    const first = await db.claimEnergyCollection(T0, MIN);
    await db.finishEnergyCollection(first.key, T0, INTERVAL, true);
    const second = await db.claimEnergyCollection(T0, MIN);
    assert.notEqual(second.key, first.key);
    await db.finishEnergyCollection(second.key, T0, INTERVAL, true);
    assert.equal(await db.claimEnergyCollection(new Date(T0.getTime() + 10 * MIN), MIN), null);
    assert.ok(await db.claimEnergyCollection(new Date(T0.getTime() + INTERVAL), MIN));
  });
});

test('dispositivo com erro não bloqueia os outros e é tentado de novo com backoff', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 10);
    const served = new Map();
    const bad = 'u0:smartthings:u-dev0';
    let now = T0;
    for (let i = 0; i < 4; i++) { await run(db, now, served, { fail: (c) => c.key === bad }); now = new Date(now.getTime() + RUN_EVERY); }
    assert.equal(served.size, 9, 'all healthy devices served');
    const row = await raw.collection('energy_collection').findOne({ key: bad });
    assert.ok(row.failures >= 1);
    assert.ok(row.nextAt.getTime() > T0.getTime());
    // After its backoff the failed device is served again.
    const later = new Date(row.nextAt.getTime() + 1);
    const claim = await db.claimEnergyCollection(later, MIN);
    assert.equal(claim.key, bad);
  });
});

test('dois workers simultâneos nunca pegam o mesmo dispositivo', { skip: !uri, timeout: 60000 }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 120);
    await db.syncEnergyCollection(T0);
    const other = new MongoDatabase(uri, raw.databaseName);
    await other.init(false);
    try {
      const claims = await Promise.all(Array.from({ length: 60 }, (_, i) => (i % 2 ? other : db).claimEnergyCollection(T0, MIN)));
      const keys = claims.filter(Boolean).map((c) => c.key);
      assert.equal(keys.length, 60);
      assert.equal(new Set(keys).size, 60);
    } finally { await other.close(); }
  });
});

test('ativação, desativação durante o processamento e reativação', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 3, { prefix: 'a', perUser: 3 });
    await seed(raw, 3, { prefix: 'b', perUser: 3, enabled: false });
    await db.syncEnergyCollection(T0);
    assert.equal(await raw.collection('energy_collection').countDocuments({ userId: 'b0' }), 0, 'not opted in: not queued');
    // Turn on: registered on the next sync and due immediately.
    await db.updateUserSettings('b0', { energyCollectionEnabled: true });
    await db.syncEnergyCollection(T0);
    assert.equal(await raw.collection('energy_collection').countDocuments({ userId: 'b0' }), 3);
    // Turn off while a device is being collected.
    const claimed = [];
    for (let i = 0; i < 6; i++) { const c = await db.claimEnergyCollection(T0, MIN); if (c?.appliance.userId === 'b0') { claimed.push(c); break; } if (c) await db.finishEnergyCollection(c.key, T0, INTERVAL, true); }
    assert.ok(claimed.length);
    await db.updateUserSettings('b0', { energyCollectionEnabled: false });
    await db.finishEnergyCollection(claimed[0].key, T0, INTERVAL, true);
    const later = new Date(T0.getTime() + 2 * INTERVAL);
    const after = [];
    for (let c; (c = await db.claimEnergyCollection(later, MIN));) { after.push(c.appliance.userId); await db.finishEnergyCollection(c.key, later, INTERVAL, true); }
    assert.ok(!after.includes('b0'), 'disabled user is never served');
    assert.equal(await raw.collection('energy_collection').countDocuments({ userId: 'b0' }), 0, 'their rows were dropped');
    // Turn on again: back in the queue.
    await db.updateUserSettings('b0', { energyCollectionEnabled: true });
    await db.syncEnergyCollection(later);
    await db.syncEnergyCollection(later);
    const back = await db.claimEnergyCollection(later, MIN);
    assert.equal(back.appliance.userId, 'b0');
  });
});

test('dispositivo novo sem registro entra na frente dos que já foram atendidos; removido sai da fila', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 5);
    const served = new Map();
    await run(db, T0, served, { capacity: 5 });
    await raw.collection('appliances').insertOne({ id: 'new', userId: 'u0', name: 'n', integrationProvider: 'smartthings', integrationDeviceId: 'fresh' });
    const later = new Date(T0.getTime() + INTERVAL + MIN);
    await db.syncEnergyCollection(later);
    await db.syncEnergyCollection(later);
    const claim = await db.claimEnergyCollection(later, MIN);
    assert.equal(claim.appliance.id, 'new', 'never-collected device first');
    await db.finishEnergyCollection(claim.key, later, INTERVAL, true);
    await raw.collection('appliances').deleteOne({ id: 'u-a1' });
    const seen = [];
    for (let c; (c = await db.claimEnergyCollection(later, MIN));) { seen.push(c.appliance.id); await db.finishEnergyCollection(c.key, later, INTERVAL, true); }
    assert.ok(!seen.includes('u-a1'));
    assert.equal(await raw.collection('energy_collection').countDocuments({ key: 'u0:smartthings:u-dev1' }), 0);
  });
});

test('intervalos diferentes por execução são respeitados', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 2);
    await db.syncEnergyCollection(T0);
    const a = await db.claimEnergyCollection(T0, MIN);
    await db.finishEnergyCollection(a.key, T0, 10 * MIN, true);
    const b = await db.claimEnergyCollection(T0, MIN);
    await db.finishEnergyCollection(b.key, T0, 60 * MIN, true);
    const at20 = await db.claimEnergyCollection(new Date(T0.getTime() + 20 * MIN), MIN);
    assert.equal(at20.key, a.key);
    assert.equal(await db.claimEnergyCollection(new Date(T0.getTime() + 20 * MIN), MIN), null);
  });
});

test('recuperação após interrupção: reserva expira e o dispositivo volta', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 1);
    await db.syncEnergyCollection(T0);
    const lost = await db.claimEnergyCollection(T0, MIN); // worker dies, never finishes
    assert.ok(lost);
    assert.equal(await db.claimEnergyCollection(new Date(T0.getTime() + 30000), MIN), null, 'still leased');
    const again = await db.claimEnergyCollection(new Date(T0.getTime() + 2 * MIN), MIN);
    assert.equal(again.key, lost.key);
  });
});

test('linhas antigas (só key) continuam funcionando', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 1);
    await raw.collection('energy_collection').insertOne({ key: 'u0:smartthings:u-dev0', nextAt: new Date(0), leaseUntil: new Date(0), failures: 0 });
    const claim = await db.claimEnergyCollection(T0, MIN);
    assert.equal(claim.appliance.id, 'u-a0');
  });
});

test('coleta ponta a ponta não duplica leituras', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 2, { perUser: 2 });
    await db.saveIntegrationToken?.('u0', 'smartthings', 'token');
    const integration = () => ({
      listDevices: async () => [{ id: 'u-dev0', capabilities: ['energyMeter'] }, { id: 'u-dev1', capabilities: ['energyMeter'] }],
      getDeviceStatus: async () => ({ raw: { components: { main: { energyMeter: { energy: { value: 12.5, unit: 'kWh' } } } } } }),
    });
    const options = { enabled: true, intervalMinutes: 30, maxDevices: 3, deadlineMs: 20000, now: () => T0, integration };
    const first = await collectEnergy(db, options);
    const second = await collectEnergy(db, options);
    assert.equal(second.claimed, 0, 'nothing due again inside the interval');
    const samples = await raw.collection('energy_samples').countDocuments();
    console.log('QUEUE_E2E', JSON.stringify({ first, second, samples }));
    assert.equal(first.claimed, 2);
    assert.equal(first.saved, 2, 'both devices read');
    assert.equal(samples, 2, 'one reading per device');
    // Same device and minute twice: sampleKey keeps one row.
    await db.saveEnergySample('u0', 'smartthings', 'u-dev0', 12.5, T0);
    assert.equal(await raw.collection('energy_samples').countDocuments(), samples);
  });
});

test('consulta da fila usa índice (explain)', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 300);
    await db.syncEnergyCollection(T0);
    const plan = await raw.collection('energy_collection').find({ nextAt: { $lte: T0 }, leaseUntil: { $lte: T0 } }).sort({ nextAt: 1, key: 1 }).limit(1).explain('executionStats');
    const text = JSON.stringify(plan.queryPlanner.winningPlan);
    assert.match(text, /IXSCAN/);
    assert.doesNotMatch(text, /COLLSCAN/);
    assert.ok(plan.executionStats.totalDocsExamined <= 5, `examined ${plan.executionStats.totalDocsExamined}`);
    console.log('QUEUE_EXPLAIN', JSON.stringify({ stage: plan.queryPlanner.winningPlan.stage, docsExamined: plan.executionStats.totalDocsExamined, keysExamined: plan.executionStats.totalKeysExamined }));
  });
});
