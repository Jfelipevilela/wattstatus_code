const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const engine = require('../dist/modules/ai/ai.engine');
const { Orchestrator } = require('../dist/modules/ai/ai.orchestrator');
const { buildSavingsPlan, parsePlanRequest, planProgress } = require('../dist/modules/ai/ai.plans');
const { runInvestigation, sanitizePlan, defaultPlan, DEFAULT_BUDGET } = require('../dist/modules/ai/ai.tools');
const { detectAlerts, runAlertSweep } = require('../dist/modules/ai/ai.alerts');
const { validateNarration } = require('../dist/modules/ai/ai.guard');
const { ProviderError } = require('../dist/modules/ai/ai.provider');
const { createAIRouter } = require('../dist/modules/ai/ai.routes');
const { errorHandler } = require('../dist/middleware/error-handler');

const NOW = new Date('2026-10-20T15:00:00Z');
const config = {
  enabled: true, provider: 'anthropic', apiKey: 'k', baseUrl: '', modelFast: 'claude-haiku-5-5', modelReasoning: 'claude-sonnet-5-5',
  maxOutputTokens: 300, timeoutMs: 300, maxToolCalls: 2, dailyUserBudget: 50, monthlyGlobalBudget: 1000, maxConcurrent: 2,
  priceInput: 0.1, priceOutput: 0.5, monthlyCostLimitUsd: 0,
};
const P = (id, userId, extra = {}) => ({ id, userId, name: `Casa ${id}`, type: 'house', timezone: 'America/Sao_Paulo', isPrimary: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra });
const A = (id, userId, propertyId, extra = {}) => ({ id, userId, propertyId, roomId: null, name: id, power: 100, status: 'normal', usageHours: 4, days: 30, monthlyCost: 0, monthlyConsumption: 0, tariff: 'SP', tariffValue: 1, createdAt: '2026-01-01T00:00:00Z', ...extra });
const day = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T15:00:00Z`;

// TV measured: 0.3 kWh/day in September, 1.0 kWh/day in October.
const world = ({ measured = true, recent = false } = {}) => {
  const intervals = [];
  if (measured) {
    for (let d = 1; d <= 30; d++) intervals.push({ userId: 'u1', applianceId: 'tv', endAt: day(9, d), startAt: day(9, d), consumptionKWh: 0.3, cost: 0.3, tariffValue: 1, propertyId: 'p1', roomId: 'sala' });
    for (let d = 1; d <= 19; d++) intervals.push({ userId: 'u1', applianceId: 'tv', endAt: day(10, d), startAt: day(10, d), consumptionKWh: 1.0, cost: 1.0, tariffValue: 1, propertyId: 'p1', roomId: 'sala' });
  }
  const data = {
    properties: [P('p1', 'u1'), P('px', 'u2', { name: 'Alheia' })],
    rooms: [
      { id: 'sala', userId: 'u1', propertyId: 'p1', floorId: 'f', name: 'Sala', type: 'living', sortOrder: 0 },
      { id: 'quarto', userId: 'u1', propertyId: 'p1', floorId: 'f', name: 'Quarto', type: 'bedroom', sortOrder: 1 },
    ],
    appliances: [
      A('tv', 'u1', 'p1', { name: 'TV', power: 150, usageHours: 6, roomId: 'sala', integrationProvider: 'smartthings', integrationDeviceId: 'd' }),
      A('ac', 'u1', 'p1', { name: 'Ar condicionado', power: 1200, usageHours: 6, roomId: 'quarto', createdAt: recent ? '2026-10-05T00:00:00Z' : '2026-01-01T00:00:00Z' }),
      A('pc', 'u1', 'p1', { name: 'Computador', power: 300, usageHours: 8 }),
      A('fridge', 'u1', 'p1', { name: 'Geladeira', power: 150, usageHours: 24 }),
      A('alien', 'u2', 'px', { name: 'Sauna', power: 9000 }),
    ],
    intervals,
  };
  return {
    data,
    listProperties: async (u) => data.properties.filter((p) => p.userId === u),
    listRooms: async (u, pid) => data.rooms.filter((r) => r.userId === u && r.propertyId === pid),
    listAppliances: async (u) => data.appliances.filter((a) => a.userId === u),
    getEnergyHistory: async (u, s, e) => data.intervals.filter((i) => i.userId === u && new Date(i.endAt) >= s && new Date(i.endAt) < e),
  };
};
const snapshotOf = async (w) => {
  const o = new Orchestrator({ data: w, config, provider: null, now: () => NOW });
  return (await o.snapshotFor('u1', 'p1')).snapshot;
};
const orchestrator = (deps = {}) => new Orchestrator({ data: world(), config, provider: null, now: () => NOW, ...deps });

// ---------------------------------------------------------------- investigation

test('investigation: multi-step, evidence-based, with a savings plan', async () => {
  const { response, usage } = await orchestrator().chat('u1', { message: 'Minha conta aumentou muito. Descubra o motivo e me ajude a economizar R$ 80.' });
  assert.equal(response.intent, 'investigate');
  const card = response.cards.find((c) => c.type === 'investigation');
  const tools = card.steps.map((s) => s.tool);
  for (const tool of ['measurement_coverage', 'period_comparison', 'appliance_changes', 'top_consumers', 'room_breakdown', 'savings_plan']) assert.ok(tools.includes(tool), tool);
  assert.ok(card.findings.some((f) => f.id === 'change:tv' && f.evidence === 'measured'));
  assert.match(response.message, /TV/);
  assert.doesNotMatch(response.message, /porque|causou|culpa/);
  const plan = response.cards.find((c) => c.type === 'budget').plan;
  assert.ok(plan.achieved <= plan.reference);
  assert.equal(new Set(plan.actions.map((a) => a.applianceId)).size, plan.actions.length);
  assert.ok(!plan.actions.some((a) => a.applianceId === 'fridge'));
  assert.ok(response.actions.some((a) => a.type === 'save_plan'));
  assert.ok(usage.toolCalls >= 6 && usage.toolCalls <= DEFAULT_BUDGET.maxCalls);
  assert.ok(!JSON.stringify(response).includes('Sauna'));
});

test('investigation: without readings it says what it cannot know', async () => {
  const { response } = await orchestrator({ data: world({ measured: false }) }).chat('u1', { message: 'Por que minha conta aumentou?' });
  assert.equal(response.intent, 'investigate');
  assert.match(response.message, /^Não tenho informações suficientes para determinar o motivo/);
  const recent = await orchestrator({ data: world({ measured: false, recent: true }) }).chat('u1', { message: 'Por que minha conta aumentou?' });
  assert.match(recent.response.message, /Não há medições para confirmar.*Ar condicionado/);
});

test('investigation: model plan is validated, deduplicated and bounded', async () => {
  assert.deepEqual(sanitizePlan(['savings_plan', 'drop_table', 'appliance_changes', 'appliance_changes'], DEFAULT_BUDGET, false), ['measurement_coverage', 'appliance_changes']);
  assert.equal(sanitizePlan(defaultPlan(true), { maxCalls: 3, maxMs: 1000, maxDepth: 1 }, true).length, 3);
  assert.ok(!sanitizePlan(['room_breakdown'], { ...DEFAULT_BUDGET, maxDepth: 1 }, false).includes('room_breakdown'));
  let calls = 0;
  const provider = { name: 'f', async complete(req) {
    calls++;
    if (calls === 1) return { text: '{"tools":["anomalies","rm -rf","period_comparison"]}', inputTokens: 50, outputTokens: 10, model: req.model };
    return { text: 'texto livre', inputTokens: 50, outputTokens: 10, model: req.model };
  } };
  const { response } = await orchestrator({ provider }).chat('u1', { message: 'Investigue por que meu consumo subiu' });
  const tools = response.cards.find((c) => c.type === 'investigation').steps.map((s) => s.tool);
  assert.deepEqual(tools, ['measurement_coverage', 'anomalies', 'period_comparison']);
  assert.equal(calls, 2);
  const bad = { name: 'f', async complete(req) { return { text: 'não sei', inputTokens: 5, outputTokens: 2, model: req.model }; } };
  const fallback = await orchestrator({ provider: bad }).chat('u1', { message: 'Investigue por que meu consumo subiu' });
  assert.ok(fallback.response.cards.find((c) => c.type === 'investigation').steps.length >= 6);
});

test('investigation: time and call budget stop the executor', async () => {
  const snapshot = await snapshotOf(world());
  let t = 0;
  const result = runInvestigation(snapshot, defaultPlan(false), { budget: { maxCalls: 3, maxMs: 10, maxDepth: 2 }, now: () => (t += 4) });
  assert.ok(result.budget.callsUsed <= 3);
  assert.ok(result.steps.some((s) => s.skipped));
});

// ---------------------------------------------------------------- plans

test('plans: no double counting, never above the reference, honest when unreachable', async () => {
  const snapshot = await snapshotOf(world());
  const plan = buildSavingsPlan(snapshot, 0, { protectedIds: ['pc'] });
  const sum = plan.actions.reduce((total, a) => total + a.monthlyCost, 0);
  assert.ok(Math.abs(sum - plan.achieved) < 1e-9 || plan.achieved <= sum);
  assert.ok(plan.achieved <= plan.reference);
  assert.equal(plan.reachable, false);
  assert.ok(plan.remaining > 0);
  assert.ok(plan.excluded.some((e) => e.applianceId === 'pc' && /preservado/.test(e.reason)));
  assert.ok(plan.excluded.some((e) => e.applianceId === 'fridge'));
  assert.ok(plan.ideas.every((idea) => idea.kind === 'replacement'));
  assert.ok(plan.actions.every((a) => a.toHours >= 0 && a.toHours < a.fromHours && ['baixo', 'medio', 'alto'].includes(a.effort)));
  const ok = buildSavingsPlan(snapshot, plan.reference + 10);
  assert.equal(ok.gap, 0);
  assert.equal(ok.actions.length, 0);
  const cyclic = plan.actions.find((a) => a.applianceId === 'ac');
  assert.ok(cyclic.conservativeCost < cyclic.monthlyCost);
});

test('plans: parse requests and flag a stated bill far from the estimate', async () => {
  assert.deepEqual(parsePlanRequest('Quero reduzir minha conta de R$ 350 para R$ 250', 300), { statedCurrent: 350, target: 250 });
  assert.deepEqual(parsePlanRequest('me ajude a economizar R$ 80', 300), { statedCurrent: null, target: 220 });
  assert.deepEqual(parsePlanRequest('quero gastar no máximo R$ 1.200,50', 300), { statedCurrent: null, target: 1200.5 });
  const snapshot = await snapshotOf(world());
  const plan = buildSavingsPlan(snapshot, 100, { statedCurrent: 999 });
  assert.ok(plan.uncertainty.some((u) => /Você informou/.test(u)));
});

test('plans: chat "de R$ X para R$ Y" builds a plan with effort and a save action', async () => {
  const { response } = await orchestrator().chat('u1', { message: 'Quero reduzir minha conta de R$ 350 para R$ 250' });
  assert.equal(response.intent, 'budget');
  assert.match(response.message, /esforço/);
  assert.ok(response.limitations.some((l) => /Você informou R\$ 350/.test(l)));
  const save = response.actions.find((a) => a.type === 'save_plan');
  assert.equal(save.target, 250);
});

test('plans: progress follows the registration and marks', async () => {
  const snapshot = await snapshotOf(world());
  const plan = buildSavingsPlan(snapshot, 0);
  const first = plan.actions[0];
  const changed = { ...snapshot, appliances: snapshot.appliances.map((a) => (a.id === first.applianceId ? { ...a, usageHours: first.toHours } : a)) };
  const progress = planProgress({ actions: plan.actions.map((a) => ({ ...a, status: 'pending' })) }, changed);
  assert.equal(progress.find((p) => p.applianceId === first.applianceId).registeredAtTarget, true);
});

// ---------------------------------------------------------------- alerts

test('alerts: priorities, appliance anomaly, savings opportunity respects dismissals', async () => {
  const w = world();
  Object.assign(w.data.appliances.find((a) => a.id === 'pc'), { integrationProvider: 'smartthings', integrationDeviceId: 'pc' });
  w.data.intervals.push({ userId: 'u1', applianceId: 'pc', endAt: day(10, 2), startAt: day(10, 2), consumptionKWh: 50, cost: 50, tariffValue: 1, propertyId: 'p1' });
  const snapshot = await snapshotOf(w);
  const alerts = detectAlerts(snapshot, { monthlyGoal: 100 }, NOW);
  const kinds = alerts.map((a) => a.kind);
  assert.ok(kinds.includes('goal_risk'));
  assert.ok(kinds.includes('appliance_anomaly'));
  assert.ok(kinds.includes('savings_opportunity'));
  assert.deepEqual(alerts.map((a) => a.priority), [...alerts.map((a) => a.priority)].sort((x, y) => ['alta', 'media', 'baixa'].indexOf(x) - ['alta', 'media', 'baixa'].indexOf(y)));
  const best = alerts.find((a) => a.kind === 'savings_opportunity');
  const dismissed = detectAlerts(snapshot, {}, NOW, [`reduce_usage:${best.applianceId}`]);
  assert.ok(!dismissed.some((a) => a.kind === 'savings_opportunity' && a.applianceId === best.applianceId));
  assert.ok(detectAlerts(snapshot, { monthlyGoal: 100, alertCategories: ['goal_risk'] }, NOW).every((a) => a.kind === 'goal_risk'));
});

test('alert sweep: consent, frequency, pages, delivery only through a ready channel', async () => {
  const saved = [];
  const delivered = [];
  const users = [
    { userId: 'a', preferences: { proactiveInsights: true, alertFrequency: 'daily', monthlyGoal: 10 } },
    { userId: 'b', preferences: { proactiveInsights: true, alertFrequency: 'off' } },
    { userId: 'c', preferences: { proactiveInsights: false, alertFrequency: 'daily' } },
  ];
  const store = {
    listAlertRecipients: async (after, limit) => users.filter((u) => !after || u.userId > after).slice(0, limit),
    saveAlerts: async (userId, alerts, interval) => { saved.push({ userId, interval }); return alerts.map((a) => ({ ...a, createdAt: new Date() })); },
    markDelivered: async (userId, key) => { delivered.push(key); },
    dismissedRecommendations: async () => [],
  };
  const snapshot = await snapshotOf(world());
  const snapshots = { snapshotsFor: async () => [snapshot] };
  const off = await runAlertSweep({ store, snapshots, now: () => NOW }, { pageSize: 2 });
  assert.equal(off.users, 3);
  assert.equal(off.skippedConsent, 2);
  assert.equal(off.delivered, 0);
  assert.equal(saved[0].interval, 86400000);
  const sent = [];
  const channel = { channel: 'test', ready: true, send: async (u, a) => { sent.push(a); } };
  const notEnabled = await runAlertSweep({ store, snapshots, delivery: channel, deliveryEnabled: false, now: () => NOW });
  assert.equal(notEnabled.delivered, 0);
  const on = await runAlertSweep({ store, snapshots, delivery: channel, deliveryEnabled: true, now: () => NOW });
  assert.ok(on.delivered > 0);
  assert.ok(sent.every((a) => a.priority !== 'baixa'));
  const notReady = await runAlertSweep({ store, snapshots, delivery: { ...channel, ready: false }, deliveryEnabled: true, now: () => NOW });
  assert.equal(notReady.delivered, 0);
});

// ---------------------------------------------------------------- guard v2

test('guard v2: structured claims reject qualitative errors', () => {
  const facts = {
    draft: 'O maior custo estimado é Ar condicionado: R$ 216,00 por mês (52% do imóvel). TV: R$ 27,00.',
    values: { items: [{ share: 0.52, cost: 216 }, { share: 0.065, cost: 27 }] },
    allowedNames: [], forbiddenNames: ['Ar condicionado', 'TV', 'Computador', 'Geladeira', 'Sauna'],
    measured: true,
    claims: { trend: null, topName: 'Ar condicionado', measuredNames: ['TV'], protectedNames: ['Computador', 'Geladeira'], actionableNames: ['Ar condicionado'] },
  };
  const v = (text) => validateNarration(text, facts);
  assert.deepEqual(v('O Ar condicionado é o maior custo estimado: R$ 216,00 por mês, 52% do imóvel.'), []);
  assert.ok(v('O Ar condicionado representa 60% do imóvel.').includes('percent'));
  assert.ok(v('A TV representa 52 % da conta e o consumo aumentou.').includes('direction'));
  assert.ok(v('A TV é o que mais gasta: R$ 27,00.').includes('superlative'));
  assert.ok(v('Reduza o uso do Computador para economizar.').includes('constraint'));
  assert.ok(v('Diminua o uso da TV para economizar R$ 27,00.').includes('recommendation'));
  assert.ok(v('O Ar condicionado medido gastou R$ 216,00.').includes('source'));
  assert.deepEqual(v('A TV tem leitura medida; o Ar condicionado é estimado em R$ 216,00.').filter((x) => x === 'source'), []);
});

// ---------------------------------------------------------------- appliances, provider, API

test('compare appliances', async () => {
  const { response } = await orchestrator().chat('u1', { message: 'Compare a TV e o computador' });
  assert.equal(response.intent, 'compare_appliances');
  assert.deepEqual(response.cards[0].items.map((i) => i.label).sort(), ['Computador', 'TV']);
});

test('provider homologation with a simulated client: 5xx retry, 429 fallback, tokens counted', async () => {
  let n = 0;
  const flaky = { name: 'f', async complete(req) { n++; if (n === 1) throw new ProviderError('500', 500, true); return { text: 'O aparelho com maior custo estimado é Ar condicionado.', inputTokens: 400, outputTokens: 40, model: req.model }; } };
  const ok = await orchestrator({ provider: flaky }).chat('u1', { message: 'Qual aparelho mais gasta?' });
  assert.equal(n, 2);
  assert.equal(ok.response.meta.inputTokens, 400);
  assert.ok(ok.response.meta.estimatedCostUsd > 0);
  const limited = { name: 'f', async complete() { throw new ProviderError('429', 429, true); } };
  const fallback = await orchestrator({ provider: limited }).chat('u1', { message: 'Qual aparelho mais gasta?' });
  assert.equal(fallback.response.meta.generated, 'deterministic');
  assert.ok(fallback.response.limitations.some((l) => /indisponível/.test(l)));
});

const memoryStore = () => {
  const plans = []; const alerts = [{ userId: 'u1', key: 'goal_risk:p1:2026-10', kind: 'goal_risk', state: 'new' }]; const feedback = [];
  let cost = 0;
  return {
    plans, feedback, setCost: (value) => { cost = value; },
    getPreferences: async () => ({}), savePreferences: async (u, p) => p,
    listRecommendationStates: async () => [], setRecommendationState: async () => {},
    recordUsage: async () => {}, usageSummary: async () => ({}),
    appendConversation: async () => null, listConversations: async () => [], getConversation: async () => null, deleteConversation: async () => false,
    saveAlerts: async () => [], listAlerts: async (u) => alerts.filter((a) => a.userId === u),
    setAlertState: async (u, key, state) => { const a = alerts.find((x) => x.userId === u && x.key === key); if (a) a.state = state; return Boolean(a); },
    markDelivered: async () => {}, listAlertRecipients: async () => [], dismissedRecommendations: async () => [],
    setRecommendationFeedback: async (u, id, f) => { feedback.push({ u, id, f }); },
    savePlan: async (u, plan) => { const saved = { ...plan, id: require('crypto').randomUUID(), userId: u, actions: plan.actions.map((a) => ({ ...a, status: 'pending' })) }; plans.push(saved); return saved; },
    listPlans: async (u) => plans.filter((p) => p.userId === u),
    getPlan: async (u, id) => plans.find((p) => p.userId === u && p.id === id) ?? null,
    setPlanAction: async (u, id, appliance, status) => { const p = plans.find((x) => x.userId === u && x.id === id); const a = p?.actions.find((x) => x.applianceId === appliance); if (!a) return null; a.status = status; return p; },
    deletePlan: async (u, id) => { const i = plans.findIndex((p) => p.userId === u && p.id === id); if (i < 0) return false; plans.splice(i, 1); return true; },
    costSince: async () => cost,
    getSettings: async () => ({}), saveSettings: async (p) => p, deleteUserData: async () => {},
  };
};
const serve = async (overrides = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = req.headers['x-user'] || 'u1'; next(); });
  const store = memoryStore();
  let hits = 0;
  app.use('/api/ai', createAIRouter({ data: world(), store, limiter: false, config, provider: null, limits: { consumeRateLimit: async () => ({ totalHits: ++hits, resetTime: new Date() }) }, ...overrides, ...(overrides.storeFn ? { store: overrides.storeFn(store) } : {}) }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;
  const call = (path, init = {}, user) => fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) } });
  return { server, call, store };
};

test('API: plans are computed server-side, saved, tracked and isolated', async () => {
  const { server, call } = await serve();
  try {
    const created = await call('/plans', { method: 'POST', body: JSON.stringify({ propertyId: 'p1', target: 100 }) });
    assert.equal(created.status, 201);
    const { plan } = await created.json();
    assert.ok(plan.actions.length > 0 && plan.achieved <= plan.reference);
    assert.equal((await call('/plans', { method: 'POST', body: JSON.stringify({ propertyId: 'px', target: 100 }) })).status, 404);
    assert.equal((await call('/plans', { method: 'POST', body: JSON.stringify({ propertyId: 'p1', target: 100, actions: [] }) })).status, 400);
    const detail = await (await call(`/plans/${plan.id}`)).json();
    assert.equal(detail.progress.length, plan.actions.length);
    assert.equal((await call(`/plans/${plan.id}`, {}, 'u2')).status, 404);
    const marked = await call(`/plans/${plan.id}/actions/${plan.actions[0].applianceId}`, { method: 'PATCH', body: JSON.stringify({ status: 'applied' }) });
    assert.equal((await marked.json()).plan.actions[0].status, 'applied');
    assert.equal((await call(`/plans/${plan.id}/actions/${plan.actions[0].applianceId}`, { method: 'PATCH', body: JSON.stringify({ status: 'applied' }) }, 'u2')).status, 404);
    assert.equal((await call(`/plans/${plan.id}`, { method: 'DELETE' }, 'u2')).status, 404);
    assert.equal((await call(`/plans/${plan.id}`, { method: 'DELETE' })).status, 200);
  } finally { server.close(); }
});

test('API: alert state, recommendation feedback', async () => {
  const { server, call, store } = await serve();
  try {
    assert.equal((await call('/alerts/goal_risk:p1:2026-10', { method: 'PATCH', body: JSON.stringify({ state: 'dismissed' }) })).status, 200);
    assert.equal((await call('/alerts/goal_risk:p1:2026-10', { method: 'PATCH', body: JSON.stringify({ state: 'dismissed' }) }, 'u2')).status, 404);
    const recs = await (await call('/insights?propertyId=p1')).json();
    const rec = recs.recommendations[0];
    assert.equal((await call(`/recommendations/${encodeURIComponent(rec.id)}?propertyId=p1`, { method: 'PATCH', body: JSON.stringify({ feedback: 'not_useful' }) })).status, 200);
    assert.deepEqual(store.feedback[0], { u: 'u1', id: rec.id, f: 'not_useful' });
    assert.equal((await call(`/recommendations/${encodeURIComponent(rec.id)}?propertyId=p1`, { method: 'PATCH', body: '{}' })).status, 400);
  } finally { server.close(); }
});

test('API: monthly USD cap stops model calls', async () => {
  let calls = 0;
  const provider = { name: 'f', async complete(req) { calls++; return { text: 'ok', inputTokens: 1, outputTokens: 1, model: req.model }; } };
  const { server, call, store } = await serve({ provider, config: { ...config, monthlyCostLimitUsd: 1 } });
  try {
    await call('/chat', { method: 'POST', body: JSON.stringify({ message: 'Qual aparelho mais gasta?' }) });
    assert.equal(calls, 1);
    store.setCost(1.5);
    const res = await (await call('/chat', { method: 'POST', body: JSON.stringify({ message: 'Qual aparelho mais gasta?' }) })).json();
    assert.equal(calls, 1);
    assert.ok(res.limitations.some((l) => /Limite de uso da IA/.test(l)));
  } finally { server.close(); }
});
