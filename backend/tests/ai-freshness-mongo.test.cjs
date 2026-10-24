// Freshness end to end on an isolated MongoDB (TEST_MONGO_URL): the AI router
// reads the collector's stored status (energyCollectionStatus) for the
// signed-in user only. No SmartThings, no model.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const { MongoClient } = require('mongodb');
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { MongoAIStore } = require('../dist/modules/ai/ai.store');
const { createAIRouter } = require('../dist/modules/ai/ai.routes');
const { PropertyService } = require('../dist/modules/properties/properties.service');
const { ApplianceService } = require('../dist/modules/appliances/appliances.service');
const { errorHandler } = require('../dist/middleware/error-handler');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) throw new Error('TEST_MONGO_URL must be local');

test('IA lê o estado da coleta do MongoDB: atrasada, erro, desativada, isolamento', { skip: !uri, timeout: 60000 }, async () => {
  const dbName = `wattstatus_fresh_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init();
  await admin.connect();
  const raw = admin.db(dbName);
  const properties = new PropertyService(db);
  const appliances = new ApplianceService(db, properties);
  try {
    const [home] = await properties.list('u1');
    const tv = await appliances.create('u1', { name: 'TV', power: 150, usageHours: 5, days: 30, tariff: 'SP', tariffValue: 1, propertyId: home.id, integrationProvider: 'smartthings', integrationDeviceId: 'dev-tv' });
    await appliances.create('u1', { name: 'Computador', power: 300, usageHours: 8, days: 30, tariff: 'SP', tariffValue: 1, propertyId: home.id });
    const [other] = await properties.list('u2');
    await appliances.create('u2', { name: 'Sauna', power: 9000, usageHours: 1, days: 30, tariff: 'SP', tariffValue: 1, propertyId: other.id, integrationProvider: 'smartthings', integrationDeviceId: 'dev-x' });
    await db.updateUserSettings('u1', { energyCollectionEnabled: true });
    await db.updateUserSettings('u2', { energyCollectionEnabled: true });
    await db.syncEnergyCollection(new Date());
    // The collector last read the TV 5 hours ago.
    await raw.collection('energy_collection').updateOne({ key: 'u1:smartthings:dev-tv' }, { $set: { lastSuccessAt: new Date(Date.now() - 5 * 3600000), lastStatus: 'ok', failures: 0 } });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.userId = req.headers['x-user'] || 'u1'; next(); });
    app.use('/api/ai', createAIRouter({
      data: {
        listProperties: (u) => properties.list(u),
        listRooms: (u, pid) => properties.listRooms(u, pid),
        listAppliances: (u) => appliances.list(u),
        getEnergyHistory: (u, s, e) => db.getEnergyHistory(u, s, e),
      },
      store: new MongoAIStore(db), limits: db, limiter: false, provider: null,
    }));
    app.use(errorHandler);
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const ask = async (message, user = 'u1', context) => (await fetch(`http://127.0.0.1:${server.address().port}/api/ai/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user }, body: JSON.stringify({ message, ...(context ? { context } : {}) }),
    })).json();
    try {
      const delayed = await ask('Quanto a TV está consumindo agora?', 'u1', { propertyId: home.id, applianceId: tv.id });
      assert.match(delayed.message, /A última medição de TV ocorreu há 5 h\. Posso analisar o histórico disponível, mas não confirmar o consumo atual\./);
      assert.equal(delayed.dataQuality[0].state, 'delayed');
      assert.doesNotMatch(delayed.message, /não tem medição real/, 'no contradiction with the stored reading');

      await raw.collection('energy_collection').updateOne({ key: 'u1:smartthings:dev-tv' }, { $set: { lastStatus: 'unauthorized' } });
      const error = await ask('Quanto a TV gasta?', 'u1', { propertyId: home.id, applianceId: tv.id });
      assert.match(error.message, /Há um problema na atualização das medições de TV/);

      await db.updateUserSettings('u1', { energyCollectionEnabled: false });
      const disabled = await ask('Quanto a TV gasta?', 'u1', { propertyId: home.id, applianceId: tv.id });
      assert.match(disabled.message, /não está sendo monitorado automaticamente/);

      const coverage = await ask('Quais dispositivos estão sem medição?', 'u2');
      assert.ok(!JSON.stringify(coverage).includes('TV'), 'u2 never sees u1 devices');
      assert.equal(coverage.dataQuality[0].name, 'Sauna');
      assert.equal(coverage.dataQuality[0].state, 'missing');
    } finally { server.close(); }
  } finally {
    await raw.dropDatabase().catch(() => {});
    await admin.close();
    await db.close();
  }
});
