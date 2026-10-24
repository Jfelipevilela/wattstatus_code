// WattStatus AI persistence against a real, isolated MongoDB (TEST_MONGO_URL).
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
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to an isolated local MongoDB instance');
}

const withDb = async (fn) => {
  const dbName = `wattstatus_ai_test_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  const admin = new MongoClient(uri);
  await db.init();
  try { await fn(db, dbName, admin); } finally {
    await admin.db(dbName).dropDatabase().catch(() => {});
    await admin.close();
    await db.close();
  }
};

test('AI store: preferences, states, conversations, alerts, settings and deletion', { skip: !uri }, async () => {
  await withDb(async (db, dbName, admin) => {
    const store = new MongoAIStore(db);
    // Preferences: upsert, merge, unset with null, isolation.
    await store.savePreferences('a', { monthlyGoal: 200, essentialApplianceIds: ['x'] });
    await store.savePreferences('a', { monthlyGoal: null, alertFrequency: 'weekly' });
    assert.deepEqual(await store.getPreferences('a'), { essentialApplianceIds: ['x'], alertFrequency: 'weekly' });
    assert.deepEqual(await store.getPreferences('b'), {});

    // Recommendation states: one row per user and id.
    await store.setRecommendationState('a', { recommendationId: 'reduce_usage:1', state: 'viewed' });
    await store.setRecommendationState('a', { recommendationId: 'reduce_usage:1', state: 'applied', appliedAt: new Date(), expectedMonthlyKWh: 30 });
    await store.setRecommendationState('b', { recommendationId: 'reduce_usage:1', state: 'dismissed' });
    const statesA = await store.listRecommendationStates('a');
    assert.equal(statesA.length, 1);
    assert.equal(statesA[0].state, 'applied');

    // Conversations: append, cap, isolation, retention TTL field, delete.
    const id = await store.appendConversation('a', null, 30, 'p1', [{ role: 'user', content: 'Oi' }, { role: 'assistant', content: 'Olá' }]);
    assert.equal(await store.appendConversation('a', id, 30, 'p1', [{ role: 'user', content: 'De novo' }]), id);
    // Someone else's id never appends to the owner's conversation.
    const other = await store.appendConversation('b', id, 30, null, [{ role: 'user', content: 'Invasão' }]);
    assert.notEqual(other, id);
    const conversation = await store.getConversation('a', id);
    assert.equal(conversation.messages.length, 3);
    assert.ok(conversation.expiresAt > new Date(Date.now() + 29 * 86400000));
    assert.equal(await store.getConversation('b', id), null);
    for (let i = 0; i < 45; i++) await store.appendConversation('a', id, 30, 'p1', [{ role: 'user', content: `m${i}` }]);
    assert.equal((await store.getConversation('a', id)).messages.length, 40);
    assert.equal(await store.deleteConversation('b', id), false);
    assert.equal(await store.deleteConversation('a', id), true);

    // Alerts: unique key, per-kind interval, concurrency.
    const alert = { key: 'goal_risk:p1:2026-10', kind: 'goal_risk', title: 't', detail: 'd', propertyId: 'p1' };
    const results = await Promise.all(Array.from({ length: 5 }, () => store.saveAlerts('a', [alert], 0)));
    assert.equal(results.flat().length, 1);
    assert.equal((await store.saveAlerts('a', [{ ...alert, key: 'goal_risk:p1:2026-11' }], 86400000)).length, 0);
    assert.equal((await store.listAlerts('a')).length, 1);
    assert.equal((await store.listAlerts('b')).length, 0);

    // Usage and settings.
    for (const latencyMs of [10, 20, 30, 40]) {
      await store.recordUsage(latencyMs === 40 ? 'b' : 'a', { feature: 'chat', intent: 'top_consumers', generated: latencyMs === 10 ? 'llm' : 'deterministic', model: latencyMs === 10 ? 'claude-haiku-5-5' : null, inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.00002, latencyMs, guardViolations: latencyMs === 20 ? ['number'] : [] });
    }
    const summary = await store.usageSummary(new Date(Date.now() - 86400000));
    assert.equal(summary.requests, 4);
    assert.equal(summary.activeUsers, 2);
    assert.equal(summary.inputTokens, 400);
    assert.equal(summary.llm, 1);
    assert.equal(summary.guardRejected, 1);
    assert.equal(summary.p95LatencyMs, 40);
    assert.equal(summary.byModel[0]._id, 'claude-haiku-5-5');
    await store.saveSettings({ enabled: false, modelFast: 'claude-haiku-5-5' }, 'admin');
    assert.equal((await store.getSettings()).enabled, false);

    // Indexes exist as declared (TTL and unique).
    const indexes = async (name) => admin.db(dbName).collection(name).indexes();
    assert.ok((await indexes('ai_conversations')).some((ix) => ix.key.expiresAt === 1 && ix.expireAfterSeconds === 0));
    assert.ok((await indexes('ai_alerts')).some((ix) => ix.unique && ix.key.userId === 1 && ix.key.key === 1));
    assert.ok((await indexes('ai_usage_metrics')).some((ix) => ix.expireAfterSeconds > 0));
    assert.ok((await indexes('ai_recommendation_states')).some((ix) => ix.unique));

    // Restart: a fresh store and client read the same data, indexes are idempotent.
    const restarted = new MongoDatabase(uri, dbName);
    await restarted.init();
    try {
      const again = new MongoAIStore(restarted);
      await again.ready();
      assert.equal((await again.getPreferences('a')).alertFrequency, 'weekly');
      assert.equal((await again.listAlerts('a')).length, 1);
    } finally { await restarted.close(); }

    // Deleting one user's data leaves the other untouched.
    await store.deleteUserData('a');
    assert.deepEqual(await store.getPreferences('a'), {});
    assert.equal((await store.listAlerts('a')).length, 0);
    assert.equal((await store.listConversations('a')).length, 0);
    assert.equal((await store.listRecommendationStates('b')).length, 1);
  });
});

test('AI routes over MongoDB: budget limit counters and ownership', { skip: !uri }, async () => {
  await withDb(async (db) => {
    const properties = new PropertyService(db);
    const appliances = new ApplianceService(db, properties);
    const [home] = await properties.list('u1');
    await appliances.create('u1', { name: 'Ar condicionado', power: 1000, usageHours: 8, days: 30, tariff: 'SP', tariffValue: 0.8, propertyId: home.id });
    await properties.list('u2');
    let calls = 0;
    const provider = { name: 'fake', async complete(req) { calls++; return { text: 'Seu Ar condicionado custa R$ 192,00 por mês, estimado pelo cadastro.', inputTokens: 300, outputTokens: 30, model: req.model }; } };
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
      store: new MongoAIStore(db), limits: db, limiter: false, provider,
      config: { enabled: true, provider: 'anthropic', apiKey: 'k', baseUrl: '', modelFast: 'claude-haiku-5-5', modelReasoning: 'claude-sonnet-5-5', maxOutputTokens: 200, timeoutMs: 1000, maxToolCalls: 2, dailyUserBudget: 2, monthlyGlobalBudget: 100, maxConcurrent: 2, priceInput: 0.1, priceOutput: 0.5 },
    }));
    app.use(errorHandler);
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/ai`;
    const post = (path, body, user) => fetch(base + path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) } });
    try {
      const generated = [];
      for (let i = 0; i < 4; i++) generated.push((await (await post('/chat', { message: 'Qual aparelho mais gasta?' })).json()).meta.generated);
      // Daily budget of 2 model calls, counted in MongoDB.
      assert.deepEqual(generated, ['llm', 'llm', 'deterministic', 'deterministic']);
      assert.equal(calls, 2);
      const other = await (await post('/chat', { message: 'Qual aparelho mais gasta?', context: { propertyId: home.id } }, 'u2')).json();
      assert.ok(!JSON.stringify(other).includes('Ar condicionado'));
      const conversations = await (await fetch(`${base}/conversations`)).json();
      assert.equal(conversations.conversations.length, 4);
    } finally { server.close(); }
  });
});
