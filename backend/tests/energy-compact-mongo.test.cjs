// Columns format against real MongoDB history: legacy cumulative samples,
// delta samples, readings without appliance or place, moved appliances and
// historical tariffs must all come back identical after encode + decode.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { compactIntervals, intervalsBody } = require('../dist/modules/energy/energy-compact');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to an isolated local MongoDB instance');
}
const loadDecoder = () => {
  const filename = path.resolve(__dirname, '../../src/lib/energy-compact.ts');
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.require = () => ({});
  loaded._compile(compiled, filename);
  return loaded.exports.expandIntervals;
};

test('histórico real do MongoDB sobrevive ao formato em colunas', { skip: !uri }, async () => {
  const expandIntervals = loadDecoder();
  const dbName = `wattstatus_test_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init();
  try {
    const base = { userId: 'u', status: 'normal', usageHours: 1, days: 30, monthlyCost: 1, monthlyConsumption: 1,
      tariff: 'SP', tariffValue: 0.8734, createdAt: '2026-09-01T00:00:00.000Z', integrationProvider: 'smartthings' };
    await db.addAppliance({ ...base, id: 'ap-legacy', name: 'Antigo', power: 100, integrationDeviceId: 'dev-legacy' });
    await db.addAppliance({ ...base, id: 'ap-placed', name: 'Novo', power: 200, integrationDeviceId: 'dev-placed',
      propertyId: 'prop-1', roomId: 'room-1' });
    const at = (iso) => new Date(iso);
    // Legacy cumulative counter readings (no location recorded).
    await db.saveEnergySample('u', 'smartthings', 'dev-legacy', 10.123456789, at('2026-10-01T02:59:59.999Z'));
    await db.saveEnergySample('u', 'smartthings', 'dev-legacy', 10.5, at('2026-10-01T03:30:00.000Z'));
    await db.saveEnergySample('u', 'smartthings', 'dev-legacy', 12.25, at('2026-10-02T03:00:00.001Z'));
    // Delta readings with location, plus a device that is not imported.
    for (let hour = 0; hour < 30; hour++) {
      const start = at(`2026-10-03T00:00:00.000Z`).getTime() + hour * 3600000;
      await db.saveEnergyDelta('u', 'smartthings', 'dev-placed', 0.1 + hour / 1000, new Date(start), new Date(start + 3600000));
    }
    await db.saveEnergyDelta('u', 'smartthings', 'dev-orphan', 0.333333, at('2026-10-04T10:00:00.000Z'), at('2026-10-04T10:15:00.000Z'));
    // The appliance changes place; later readings carry the new room.
    await db.updateAppliance('u', { ...base, id: 'ap-placed', name: 'Novo', power: 200, integrationDeviceId: 'dev-placed',
      propertyId: 'prop-1', roomId: 'room-2' });
    await db.saveEnergyDelta('u', 'smartthings', 'dev-placed', 0.05, at('2026-10-05T00:00:00.000Z'), at('2026-10-05T01:00:00.000Z'));

    const rows = await db.getEnergyHistory('u', at('2026-09-30T00:00:00.000Z'), at('2026-11-01T00:00:00.000Z'));
    assert.ok(rows.length >= 30, `${rows.length} rows`);
    assert.ok(rows.some((row) => row.applianceId === null), 'covers readings without appliance');
    assert.ok(rows.some((row) => !('propertyId' in row) || row.propertyId == null), 'covers readings without property');
    const wire = JSON.parse(JSON.stringify({ intervals: intervalsBody(rows, 'columns') }));
    assert.equal(wire.intervals.format, 'columns-v1');
    // Exact same objects, same order, as the plain JSON the API sent before.
    assert.deepEqual(expandIntervals(wire.intervals), JSON.parse(JSON.stringify(rows)));
    assert.deepEqual(JSON.parse(JSON.stringify({ intervals: intervalsBody(rows, undefined) })).intervals, JSON.parse(JSON.stringify(rows)));
    const appliance = await db.getEnergyHistory('u', at('2026-09-30T00:00:00.000Z'), at('2026-11-01T00:00:00.000Z'), 'ap-placed');
    assert.deepEqual(expandIntervals(JSON.parse(JSON.stringify(compactIntervals(appliance)))), JSON.parse(JSON.stringify(appliance)));
  } finally {
    await admin.connect();
    await admin.db(dbName).dropDatabase();
    await admin.close();
    await db.close();
  }
});
