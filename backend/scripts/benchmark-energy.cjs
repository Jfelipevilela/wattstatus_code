const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');

const uri = process.env.TEST_MONGO_URL;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) throw new Error('Use isolated local TEST_MONGO_URL');
const name = `wattstatus_bench_${randomUUID().replaceAll('-', '')}`;

(async () => {
  const db = new MongoDatabase(uri, name);
  const admin = new MongoClient(uri);
  await db.init();
  try {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date('2026-11-01T00:00:00Z');
    for (let i = 0; i < 200; i++) {
      await db.saveEnergySample('bench', 'smartthings', 'meter', 100 + i, new Date(start.getTime() + i * 3600000));
    }
    const times = [];
    for (let i = 0; i < 10; i++) {
      const tick = performance.now();
      const intervals = await db.getEnergyHistory('bench', start, end);
      times.push(performance.now() - tick);
      if (intervals.length !== 199) throw new Error('Unexpected interval count');
    }
    await admin.connect();
    const plan = await admin.db(name).collection('energy_samples').find({ userId: 'bench', capturedAt: { $gte: start, $lt: end } }).explain('executionStats');
    const planText = JSON.stringify(plan.queryPlanner.winningPlan);
    console.log(JSON.stringify({ samples: 200, intervals: 199, queries: 10,
      meanMs: Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)),
      maxMs: Number(Math.max(...times).toFixed(2)),
      examinedDocuments: plan.executionStats.totalDocsExamined,
      returnedDocuments: plan.executionStats.nReturned,
      indexUsed: planText.includes('IXSCAN') }, null, 2));
  } finally {
    await db.close();
    await admin.connect();
    await admin.db(name).dropDatabase();
    await admin.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
