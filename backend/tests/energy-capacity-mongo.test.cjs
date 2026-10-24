// Collection capacity on an isolated MongoDB (TEST_MONGO_URL) with a simulated
// SmartThings: latency, 429 with X-RateLimit-Reset, 404, 401, lease expiry,
// deadlines. Prints CAPACITY lines with measured throughput.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { collectEnergy, COLLECTION_LIMITS } = require('../dist/modules/energy/energy-collector');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) throw new Error('TEST_MONGO_URL must be local');
const MIN = 60000;
const INTERVAL_MIN = 30;
const RUN_EVERY = 5 * MIN;

const withDb = async (fn) => {
  const dbName = `wattstatus_cap_${randomUUID().replaceAll('-', '')}`;
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
const seed = async (raw, devices, perUser = 5) => {
  const docs = [];
  for (let i = 0; i < devices; i++) docs.push({ id: `a${i}`, userId: `u${Math.floor(i / perUser)}`, name: 'x', integrationProvider: 'smartthings', integrationDeviceId: `dev${i}` });
  await raw.collection('appliances').insertMany(docs);
  await raw.collection('user_settings').insertMany([...new Set(docs.map((d) => d.userId))].map((userId) => ({ userId, energyCollectionEnabled: true })));
  return docs;
};
let counter = 0;
// Simulated SmartThings account per token, with call accounting.
const fakeSmartThings = ({ latencyMs = 20, fail = () => null } = {}) => {
  const stats = { reads: 0, lists: 0, inFlight: new Map(), maxPerUser: 0, maxGlobal: 0, global: 0 };
  const integration = (token) => {
    const userId = token.slice(4);
    const track = async (fn) => {
      stats.global++; stats.maxGlobal = Math.max(stats.maxGlobal, stats.global);
      const n = (stats.inFlight.get(userId) ?? 0) + 1;
      stats.inFlight.set(userId, n); stats.maxPerUser = Math.max(stats.maxPerUser, n);
      try { await new Promise((r) => setTimeout(r, latencyMs)); return await fn(); } finally { stats.global--; stats.inFlight.set(userId, stats.inFlight.get(userId) - 1); }
    };
    return {
      listEnergyDeviceIds: () => track(async () => {
        stats.lists++;
        const index = Number(userId.slice(1));
        return new Set(Array.from({ length: 5 }, (_, k) => `dev${index * 5 + k}`));
      }),
      getDeviceReading: (deviceId) => track(async () => {
        stats.reads++;
        const error = fail(userId, deviceId);
        if (error) throw error;
        counter += 0.001;
        return { raw: { components: { main: { energyMeter: { energy: { value: 100 + counter, unit: 'kWh' } } } } } };
      }),
    };
  };
  return { integration, stats, token: async (userId) => `tok-${userId}` };
};
const httpError = (status, extra = {}) => Object.assign(new Error(`HTTP ${status}`), { status, ...extra });

// Virtual hours of scheduled runs; returns per-device read times.
const simulate = async (db, { hours, start, config, st }) => {
  let now = start;
  const runs = [];
  for (let i = 0; i < (hours * 3600000) / RUN_EVERY; i++) {
    const clock = now;
    runs.push(await collectEnergy(db, { enabled: true, intervalMinutes: INTERVAL_MIN, deadlineMs: 23000, now: () => clock, integration: st.integration, token: st.token, ...config }));
    now = new Date(now.getTime() + RUN_EVERY);
  }
  return { runs, end: now };
};

const CONFIGS = {
  old: { maxDevices: 3, concurrency: 1, perUserConcurrency: 1 },
  default: { maxDevices: 60, concurrency: 4, perUserConcurrency: 2 },
  large: { maxDevices: 200, concurrency: 8, perUserConcurrency: 2 },
  max: { maxDevices: COLLECTION_LIMITS.maxDevicesPerRun, concurrency: COLLECTION_LIMITS.maxConcurrency, perUserConcurrency: 2 },
};

// Throughput of one run per config at two simulated latencies.
test('capacidade por execução e por hora para cada configuração', { skip: !uri, timeout: 600000 }, async () => {
  for (const latencyMs of [50, 300]) {
    for (const [name, config] of Object.entries(CONFIGS)) {
      await withDb(async (db, raw) => {
        await seed(raw, 2000);
        const st = fakeSmartThings({ latencyMs });
        const result = await collectEnergy(db, { enabled: true, intervalMinutes: INTERVAL_MIN, deadlineMs: 23000, now: () => new Date('2026-10-24T12:00:00Z'), integration: st.integration, token: st.token, ...config });
        const perHour = result.saved * 12;
        console.log('CAPACITY', JSON.stringify({ latencyMs, config: name, ...config, saved: result.saved, durationMs: result.durationMs, avgDeviceMs: result.avgDeviceMs, externalCalls: result.externalCalls, stoppedBy: result.stoppedBy, readsPerHour: perHour, devicesAt30min: Math.floor(perHour / 2) }));
        assert.ok(result.durationMs < 25000);
        assert.ok(st.stats.maxPerUser <= config.perUserConcurrency, `per-user ${st.stats.maxPerUser}`);
        assert.ok(st.stats.maxGlobal <= config.concurrency);
        assert.equal(await raw.collection('energy_collection').countDocuments({ leaseUntil: { $gt: new Date('2026-10-24T12:00:00Z') } }), 0, 'no lease left behind');
      });
    }
  }
});

// Steady state: does every device get read within the planned interval?
for (const size of [50, 250, 500, 1000, 5000]) {
  test(`${size} dispositivos: intervalo real entre leituras com a configuração adequada`, { skip: !uri, timeout: 900000 }, async () => {
    await withDb(async (db, raw) => {
      await seed(raw, size);
      const st = fakeSmartThings({ latencyMs: 50 });
      // Budget per run = devices × run period / interval, with 25% headroom, clamped.
      const needed = Math.ceil((size * RUN_EVERY) / (INTERVAL_MIN * MIN) * 1.25);
      const config = { maxDevices: Math.min(needed, COLLECTION_LIMITS.maxDevicesPerRun), concurrency: size > 1000 ? 16 : 8, perUserConcurrency: 2 };
      const start = new Date('2026-10-24T12:00:00Z');
      const { runs, end } = await simulate(db, { hours: 2, start, config, st });
      const stats = await db.energyCollectionStats(end, INTERVAL_MIN * MIN);
      const rows = await raw.collection('energy_collection').find({}, { projection: { lastSuccessAt: 1, lastIntervalMs: 1, _id: 0 } }).toArray();
      const never = rows.filter((r) => !r.lastSuccessAt).length;
      const intervals = rows.map((r) => r.lastIntervalMs).filter(Boolean).sort((a, b) => a - b);
      const p95 = intervals.length ? intervals[Math.floor(intervals.length * 0.95)] / MIN : null;
      const wallMs = runs.reduce((sum, r) => sum + r.durationMs, 0);
      console.log('STEADY', JSON.stringify({ size, config, reads: runs.reduce((s, r) => s + r.saved, 0), never, intervalP95Min: p95, late: stats.late, capacityShort: stats.capacityShort, avgRunMs: Math.round(wallMs / runs.length), maxRunMs: Math.max(...runs.map((r) => r.durationMs)) }));
      assert.equal(never, 0, 'every device read at least once');
      if (needed <= COLLECTION_LIMITS.maxDevicesPerRun) {
        assert.ok(p95 !== null && p95 <= INTERVAL_MIN + 5, `p95 interval ${p95} min`);
        assert.equal(stats.capacityShort, false);
      } else {
        // Above the per-run ceiling the queue stays fair but slower; metrics say so.
        assert.ok(p95 > INTERVAL_MIN, 'slower than planned');
        assert.equal(stats.capacityShort, true, 'metrics flag the shortfall');
      }
    });
  });
}

test('429: a conta descansa até o reset, as outras seguem; sem falhas contadas', { skip: !uri, timeout: 60000 }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 50);
    const st = fakeSmartThings({ latencyMs: 10, fail: (userId) => (userId === 'u0' ? httpError(429, { retryAfterMs: 120000 }) : null) });
    const now = new Date('2026-10-24T12:00:00Z');
    const result = await collectEnergy(db, { enabled: true, intervalMinutes: 30, deadlineMs: 20000, now: () => now, integration: st.integration, token: st.token, maxDevices: 50, concurrency: 4, perUserConcurrency: 1 });
    assert.ok(result.rateLimited >= 1);
    assert.equal(result.saved, 45);
    const u0 = await raw.collection('energy_collection').find({ userId: 'u0' }).toArray();
    assert.ok(u0.every((row) => row.nextAt.getTime() >= now.getTime() + 119000), 'all u0 devices postponed past the reset');
    assert.ok(u0.every((row) => (row.failures ?? 0) === 0));
    const u0Reads = st.stats.reads - 45;
    assert.ok(u0Reads <= 1, `u0 read ${u0Reads} times after the 429`);
  });
});

test('404, 401 e falhas repetidas: backoff, conta desativada no restante da execução, estado de erro', { skip: !uri, timeout: 60000 }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 15);
    const st = fakeSmartThings({ latencyMs: 5, fail: (userId, deviceId) => (deviceId === 'dev0' ? httpError(404) : userId === 'u1' ? httpError(424) : deviceId === 'dev10' ? new Error('timeout') : null) });
    let now = new Date('2026-10-24T12:00:00Z');
    const run = () => collectEnergy(db, { enabled: true, intervalMinutes: 30, deadlineMs: 20000, now: () => now, integration: st.integration, token: st.token, maxDevices: 15, concurrency: 1, perUserConcurrency: 1 });
    const first = await run();
    assert.equal(first.failed, 1);
    const gone = await raw.collection('energy_collection').findOne({ deviceId: 'dev0' });
    assert.equal(gone.lastStatus, 'gone');
    assert.ok(gone.nextAt.getTime() - now.getTime() >= 23 * 3600000);
    const unauthorized = await raw.collection('energy_collection').find({ userId: 'u1' }).toArray();
    assert.ok(unauthorized.every((row) => row.lastStatus === 'unauthorized'));
    const u1Reads = st.stats.reads;
    // Repeated failures: backoff grows and the device reaches "error".
    for (let i = 0; i < 4; i++) { now = new Date(now.getTime() + 7 * 3600000); await run(); }
    const failing = await raw.collection('energy_collection').findOne({ deviceId: 'dev10' });
    assert.ok(failing.failures >= 3);
    const status = await db.energyCollectionStatus('u2', now, 30 * MIN);
    assert.equal(status.devices.find((d) => d.applianceId === 'a10').state, 'error');
    assert.ok(u1Reads > 0);
  });
});

test('lease expirado: dois workers, conclusão atrasada é ignorada e não duplica leitura', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 1);
    await db.syncEnergyCollection(new Date());
    const t0 = new Date('2026-10-24T12:00:00Z');
    const a = await db.claimEnergyCollection(t0, MIN);
    const t1 = new Date(t0.getTime() + 2 * MIN); // A stalled past its lease
    const b = await db.claimEnergyCollection(t1, MIN);
    assert.equal(b.key, a.key);
    assert.notEqual(b.leaseId, a.leaseId);
    assert.equal(await db.finishEnergyCollection(a.key, t1, 30 * MIN, { status: 'ok' }, a.leaseId), false, 'late finish ignored');
    assert.equal(await db.finishEnergyCollection(b.key, t1, 30 * MIN, { status: 'ok' }, b.leaseId), true);
    await db.saveEnergySample('u0', 'smartthings', 'dev0', 5, t1);
    await db.saveEnergySample('u0', 'smartthings', 'dev0', 5, t1);
    assert.equal(await raw.collection('energy_samples').countDocuments(), 1);
  });
});

test('prazo curto: para sem deixar reservas e retoma na execução seguinte', { skip: !uri, timeout: 60000 }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 100);
    const st = fakeSmartThings({ latencyMs: 200 });
    const now = new Date('2026-10-24T12:00:00Z');
    const short = await collectEnergy(db, { enabled: true, intervalMinutes: 30, deadlineMs: 7000, now: () => now, integration: st.integration, token: st.token, maxDevices: 100, concurrency: 2, perUserConcurrency: 1 });
    assert.equal(short.stoppedBy, 'deadline');
    assert.ok(short.durationMs < 7000);
    assert.equal(await raw.collection('energy_collection').countDocuments({ leaseUntil: { $gt: now } }), 0);
    const next = await collectEnergy(db, { enabled: true, intervalMinutes: 30, deadlineMs: 20000, now: () => new Date(now.getTime() + RUN_EVERY), integration: st.integration, token: st.token, maxDevices: 100, concurrency: 8, perUserConcurrency: 2 });
    assert.equal(short.saved + next.saved, 100);
  });
});

test('estado por dispositivo para a IA: recente, atrasado, ausente, desativado, erro', { skip: !uri }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 3, 3);
    const now = new Date('2026-10-24T12:00:00Z');
    await db.syncEnergyCollection(now);
    const queue = raw.collection('energy_collection');
    await queue.updateOne({ deviceId: 'dev0' }, { $set: { lastSuccessAt: new Date(now.getTime() - 10 * MIN) } });
    await queue.updateOne({ deviceId: 'dev1' }, { $set: { lastSuccessAt: new Date(now.getTime() - 3 * 3600000) } });
    let status = await db.energyCollectionStatus('u0', now, 30 * MIN);
    assert.deepEqual(status.devices.map((d) => d.state), ['recent', 'delayed', 'missing']);
    await queue.updateOne({ deviceId: 'dev2' }, { $set: { lastStatus: 'unauthorized' } });
    status = await db.energyCollectionStatus('u0', now, 30 * MIN);
    assert.equal(status.devices[2].state, 'error');
    await db.updateUserSettings('u0', { energyCollectionEnabled: false });
    status = await db.energyCollectionStatus('u0', now, 30 * MIN);
    assert.ok(status.devices.every((d) => d.state === 'disabled'));
    assert.deepEqual((await db.energyCollectionStatus('other', now, 30 * MIN)).devices, []);
  });
});

test('crescimento da fila: métricas indicam capacidade insuficiente', { skip: !uri, timeout: 120000 }, async () => {
  await withDb(async (db, raw) => {
    await seed(raw, 600);
    const st = fakeSmartThings({ latencyMs: 5 });
    const start = new Date('2026-10-24T12:00:00Z');
    const { end } = await simulate(db, { hours: 1, start, config: CONFIGS.old, st });
    const stats = await db.energyCollectionStats(end, INTERVAL_MIN * MIN);
    console.log('GROWTH', JSON.stringify(stats));
    assert.equal(stats.capacityShort, true);
    assert.ok(stats.due > 500);
    assert.equal(stats.neededPerHour, 1200);
  });
});

test('rotas de status da coleta: por usuário e métricas só para administradores', { skip: !uri }, async () => {
  const express = require('express');
  const { createEnergyRouter } = require('../dist/modules/energy/energy.routes');
  const { errorHandler } = require('../dist/middleware/error-handler');
  await withDb(async (db, raw) => {
    await seed(raw, 10);
    await raw.collection('users').insertMany([{ id: 'u0', email: 'admin@x.com' }, { id: 'u1', email: 'user@x.com' }]);
    await db.syncEnergyCollection(new Date());
    const app = express();
    app.use((req, _res, next) => { req.userId = req.headers['x-user']; next(); });
    app.use('/api/energy', createEnergyRouter(db));
    app.use(errorHandler);
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/energy`;
    process.env.AI_ADMIN_EMAILS = 'admin@x.com';
    try {
      const mine = await (await fetch(`${base}/collection-status`, { headers: { 'x-user': 'u1' } })).json();
      assert.equal(mine.devices.length, 5);
      assert.ok(mine.devices.every((d) => d.applianceId.startsWith('a') && Number(d.applianceId.slice(1)) >= 5 && Number(d.applianceId.slice(1)) < 10));
      assert.ok(mine.devices.every((d) => d.state === 'missing'));
      assert.equal((await fetch(`${base}/collection-stats`, { headers: { 'x-user': 'u1' } })).status, 403);
      const stats = await (await fetch(`${base}/collection-stats`, { headers: { 'x-user': 'u0' } })).json();
      assert.equal(stats.queued, 10);
      assert.ok(!JSON.stringify(stats).includes('dev'), 'no device ids in operator metrics');
    } finally { server.close(); delete process.env.AI_ADMIN_EMAILS; }
  });
});
