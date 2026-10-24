const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const engine = require('../dist/modules/ai/ai.engine');
const { Orchestrator } = require('../dist/modules/ai/ai.orchestrator');
const { AnthropicProvider, completeWithLimits, ProviderError } = require('../dist/modules/ai/ai.provider');
const { createAIRouter } = require('../dist/modules/ai/ai.routes');
const { errorHandler } = require('../dist/middleware/error-handler');

const NOW = new Date('2026-10-20T15:00:00Z');
const config = {
  enabled: true, provider: 'anthropic', apiKey: 'test', baseUrl: '', modelFast: 'claude-haiku-5-5', modelReasoning: 'claude-sonnet-5-5',
  maxOutputTokens: 300, timeoutMs: 300, maxToolCalls: 2, dailyUserBudget: 50, monthlyGlobalBudget: 1000,
  maxConcurrent: 2, priceInput: 0.1, priceOutput: 0.5,
};
const property = (id, userId, extra = {}) => ({ id, userId, name: `Casa ${id}`, type: 'house', timezone: 'America/Sao_Paulo', isPrimary: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra });
const appliance = (id, userId, propertyId, extra = {}) => ({
  id, userId, propertyId, roomId: null, name: id, power: 100, status: 'normal', usageHours: 4, days: 30,
  monthlyCost: 0, monthlyConsumption: 0, tariff: 'SP', tariffValue: 1, createdAt: '2026-01-01T00:00:00Z', ...extra,
});
const createData = () => {
  const data = {
    properties: [property('p1', 'u1'), property('px', 'u2', { name: 'Alheia' })],
    rooms: [{ id: 'r1', userId: 'u1', propertyId: 'p1', floorId: 'f', name: 'Sala', type: 'living', sortOrder: 0 }],
    appliances: [
      appliance('tv', 'u1', 'p1', { name: 'TV', power: 100, usageHours: 5, roomId: 'r1' }),
      appliance('ac', 'u1', 'p1', { name: 'Ar condicionado', power: 1000, usageHours: 8, roomId: 'r1' }),
      appliance('pc', 'u1', 'p1', { name: 'Computador', power: 300, usageHours: 8, createdAt: '2026-09-15T00:00:00Z' }),
      appliance('alien', 'u2', 'px', { name: 'Ar condicionado', power: 9000 }),
    ],
    intervals: [],
  };
  return {
    data,
    listProperties: async (u) => data.properties.filter((p) => p.userId === u),
    listRooms: async (u, pid) => data.rooms.filter((r) => r.userId === u && r.propertyId === pid),
    listAppliances: async (u) => data.appliances.filter((a) => a.userId === u),
    getEnergyHistory: async (u) => { data.historyCalls = (data.historyCalls ?? 0) + 1; return data.intervals.filter((i) => i.userId === u); },
  };
};

// ---------------------------------------------------------------- SDK provider

const sdkClient = (impl) => ({ calls: [], messages: { create(body, options) { this.calls?.push?.(body); sdkClient.last = { body, options }; return impl(body, options); } } });

test('SDK provider: request shape, usage and truncation', async () => {
  const client = sdkClient(async () => ({ content: [{ type: 'text', text: 'Olá' }], usage: { input_tokens: 12, output_tokens: 3 }, model: 'claude-haiku-5-5', stop_reason: 'max_tokens' }));
  const provider = new AnthropicProvider(config, client);
  const result = await provider.complete({ model: 'claude-haiku-5-5', system: 'S', messages: [{ role: 'user', content: 'oi' }], maxTokens: 50 });
  assert.equal(result.text, 'Olá');
  assert.equal(result.inputTokens, 12);
  assert.equal(result.truncated, true);
  const { body, options } = sdkClient.last;
  assert.equal(body.max_tokens, 50);
  assert.equal(body.temperature, undefined);
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.equal(options.maxRetries, 0);
});

test('SDK provider: typed errors map to retryable or not', async () => {
  const make = (error) => new AnthropicProvider(config, sdkClient(async () => { throw error; }));
  const headers = new Headers();
  const rate = new Anthropic.RateLimitError(429, { type: 'error' }, 'rate', headers);
  const server = new Anthropic.InternalServerError(500, { type: 'error' }, 'boom', headers);
  const bad = new Anthropic.BadRequestError(400, { type: 'error' }, 'bad', headers);
  await assert.rejects(make(rate).complete({ model: 'm', system: '', messages: [], maxTokens: 1 }), (e) => e instanceof ProviderError && e.retryable && e.status === 429);
  await assert.rejects(make(server).complete({ model: 'm', system: '', messages: [], maxTokens: 1 }), (e) => e.retryable && e.status === 500);
  await assert.rejects(make(bad).complete({ model: 'm', system: '', messages: [], maxTokens: 1 }), (e) => !e.retryable && e.status === 400);
  await assert.rejects(make(new Anthropic.APIUserAbortError()).complete({ model: 'm', system: '', messages: [], maxTokens: 1 }), (e) => !e.retryable);
  await assert.rejects(make(new Anthropic.APIConnectionError({ message: 'down' })).complete({ model: 'm', system: '', messages: [], maxTokens: 1 }), (e) => e.retryable && e.status === null);
});

test('SDK provider: refusal is a failure, not a rewrite', async () => {
  const provider = new AnthropicProvider(config, sdkClient(async () => ({ content: [], usage: {}, model: 'm', stop_reason: 'refusal' })));
  await assert.rejects(provider.complete({ model: 'm', system: '', messages: [], maxTokens: 1 }), /recusou/);
});

test('limits: one retry on 429, cancellation stops immediately, timeout aborts', async () => {
  let calls = 0;
  const flaky = { name: 'f', async complete() { calls++; if (calls === 1) throw new ProviderError('429', 429, true); return { text: 'ok', inputTokens: 1, outputTokens: 1, model: 'm' }; } };
  assert.equal((await completeWithLimits(flaky, { model: 'm', system: '', messages: [], maxTokens: 1 }, 500, 1)).text, 'ok');
  assert.equal(calls, 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(completeWithLimits(flaky, { model: 'm', system: '', messages: [], maxTokens: 1, signal: controller.signal }, 500), /cancelada/);
  const slow = { name: 's', complete: ({ signal }) => new Promise((_r, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) };
  await assert.rejects(completeWithLimits(slow, { model: 'm', system: '', messages: [], maxTokens: 1 }, 50, 0), /Tempo esgotado/);
});

// ---------------------------------------------------------------- engine

test('preferences: comfort floor and max reduction shape the budget plan', () => {
  const snapshot = engine.buildSnapshot({
    property: property('p1', 'u1'), rooms: [], appliances: [appliance('a', 'u1', 'p1', { power: 1000, usageHours: 10 }), appliance('b', 'u1', 'p1', { power: 500, usageHours: 4 })],
    intervals: [], previousIntervals: [], period: engine.monthPeriod(NOW, 'America/Sao_Paulo'),
  });
  const plan = engine.planBudget(snapshot, 0, { maxReduction: 0.1, minHours: { b: 4 } });
  const a = plan.actions.find((item) => item.applianceId === 'a');
  assert.equal(a.toHours, 9);
  assert.ok(!plan.actions.some((item) => item.applianceId === 'b'));
  assert.ok(plan.excluded.some((item) => /conforto/.test(item.reason)));
});

test('recommendation categories filter the list', () => {
  const snapshot = engine.buildSnapshot({
    property: property('p1', 'u1'), rooms: [], appliances: [appliance('a', 'u1', 'p1', { power: 1000, usageHours: 10 })],
    intervals: [], previousIntervals: [], period: engine.monthPeriod(NOW, 'America/Sao_Paulo'),
  });
  const all = engine.buildRecommendations(snapshot, []);
  assert.ok(all.some((item) => item.kind === 'set_goal'));
  const only = engine.buildRecommendations(snapshot, [], { categories: ['reduce_usage'] });
  assert.ok(only.length > 0 && only.every((item) => item.kind === 'reduce_usage'));
});

test('trend matches the dashboard rule: appliances count from their creation month', () => {
  const points = engine.buildTrend(createData().data.appliances.filter((a) => a.userId === 'u1'), new Map(), 2026, 10);
  assert.equal(points.length, 6);
  // September has the computer (created mid-September); August does not.
  assert.ok(points[4].estimatedKWh > points[3].estimatedKWh);
  const explained = engine.explainTrend(points, null);
  assert.equal(explained.status, 'ok');
  assert.ok(explained.facts.some((fact) => fact.kind === 'biggest_change'));
  assert.ok(explained.limitations.some((item) => /só estimada/.test(item)));
});

test('alerts: goal risk and missing readings, deterministic keys', () => {
  const snapshot = engine.buildSnapshot({
    property: property('p1', 'u1'), rooms: [],
    appliances: [appliance('a', 'u1', 'p1', { power: 1000, usageHours: 10 }), appliance('b', 'u1', 'p1', { integrationProvider: 'smartthings', integrationDeviceId: 'x' })],
    intervals: [], previousIntervals: [], period: engine.monthPeriod(NOW, 'America/Sao_Paulo'),
  });
  const alerts = engine.evaluateAlerts(snapshot, { monthlyGoal: 250 }, NOW);
  assert.ok(alerts.some((item) => item.kind === 'goal_risk' && item.key === 'goal_risk:p1:2026-10'));
  assert.ok(alerts.some((item) => item.kind === 'missing_reading'));
  assert.deepEqual(engine.evaluateAlerts(snapshot, { monthlyGoal: 250 }, NOW).map((a) => a.key), alerts.map((a) => a.key));
});

test('report summary works without any model', () => {
  const snapshot = engine.buildSnapshot({
    property: property('p1', 'u1'), rooms: [], appliances: [appliance('a', 'u1', 'p1', { power: 1000, usageHours: 10 })],
    intervals: [], previousIntervals: [], period: engine.monthPeriodFor(2026, 9, 'America/Sao_Paulo', NOW),
  });
  assert.equal(snapshot.period.daysElapsed, 30);
  const summary = engine.buildReportSummary(snapshot, engine.buildRecommendations(snapshot, []));
  assert.equal(summary.quality, 'somente estimativa');
  assert.ok(summary.lines.some((line) => /Maior impacto/.test(line)));
});

// ---------------------------------------------------------------- orchestrator

const orchestrator = (deps = {}) => new Orchestrator({ data: createData(), config, provider: null, now: () => NOW, ...deps });

test('explain chart: series recomputed on the server, facts verifiable', async () => {
  const data = createData();
  const { response } = await orchestrator({ data }).chat('u1', { message: 'Qual foi a maior mudança?', chart: { kind: 'consumption_trend', year: 2026, month: 10, propertyId: 'p1' } });
  assert.equal(response.intent, 'explain_chart');
  assert.ok(response.cards.some((card) => card.type === 'trend' && card.points.length === 6));
  assert.match(response.message, /maior mudança/);
  assert.equal(data.data.historyCalls, 2);
});

test('explain chart on someone else property ignores the foreign id', async () => {
  const { response } = await orchestrator().chat('u1', { message: 'Explique o gráfico', chart: { kind: 'consumption_trend', year: 2026, month: 10, propertyId: 'px' } });
  assert.ok(!JSON.stringify(response).includes('Alheia'));
  assert.ok(!JSON.stringify(response).includes('9000'));
});

test('explain chart without data says so', async () => {
  const data = createData();
  data.data.appliances = [];
  const { response } = await orchestrator({ data }).chat('u1', { message: 'Explique', chart: { kind: 'consumption_trend', year: 2026, month: 10 } });
  assert.match(response.message, /ainda não tem aparelhos|^Não tenho informações suficientes/);
  assert.equal(response.metrics.length, 0);
});

test('questions outside the data admit it', async () => {
  const { response } = await orchestrator().chat('u1', { message: 'Quanto vai custar a energia no Japão em 2030?' });
  assert.match(response.message, /^Não tenho informações suficientes/);
});

test('stages are reported and never carry numbers', async () => {
  const stages = [];
  await orchestrator().chat('u1', { message: 'Qual aparelho mais gasta?' }, { onStage: (stage) => stages.push(stage) });
  assert.deepEqual(stages, ['context', 'data', 'compute']);
});

test('queries per message stay bounded', async () => {
  const data = createData();
  let calls = 0;
  const counting = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'function' ? (...args) => { calls++; return v(...args); } : v]));
  await orchestrator({ data: counting }).chat('u1', { message: 'Qual aparelho mais gasta?' });
  assert.ok(calls <= 4, `calls=${calls}`);
});

// ---------------------------------------------------------------- API

const memoryStore = () => {
  const prefs = new Map(); const conversations = []; const alerts = []; let settings = {}; const usage = [];
  return {
    usage, conversations, alerts,
    getPreferences: async (u) => prefs.get(u) ?? {},
    savePreferences: async (u, p) => { prefs.set(u, { ...(prefs.get(u) ?? {}), ...p }); return prefs.get(u); },
    listRecommendationStates: async () => [], setRecommendationState: async () => {},
    recordUsage: async (u, r) => { usage.push({ ...r, userId: u }); },
    usageSummary: async () => ({ requests: usage.length }),
    appendConversation: async (u, id, days, pid, messages) => {
      let c = conversations.find((x) => x.id === id && x.userId === u);
      if (!c) { c = { id: require('crypto').randomUUID(), userId: u, title: messages[0].content, messages: [] }; conversations.push(c); }
      c.messages.push(...messages);
      return c.id;
    },
    listConversations: async (u) => conversations.filter((c) => c.userId === u),
    getConversation: async (u, id) => conversations.find((c) => c.userId === u && c.id === id) ?? null,
    deleteConversation: async (u, id) => { const i = conversations.findIndex((c) => c.userId === u && c.id === id); if (i < 0) return false; conversations.splice(i, 1); return true; },
    saveAlerts: async (u, list) => { const created = list.filter((a) => !alerts.some((x) => x.userId === u && x.key === a.key)).map((a) => ({ ...a, userId: u })); alerts.push(...created); return created; },
    listAlerts: async (u) => alerts.filter((a) => a.userId === u),
    getSettings: async () => settings,
    saveSettings: async (p) => { settings = { ...settings, ...p }; return settings; },
    dismissedRecommendations: async () => [], setRecommendationFeedback: async () => {}, setAlertState: async () => true, markDelivered: async () => {},
    listAlertRecipients: async () => [], savePlan: async (u, p) => ({ ...p, id: 'x', userId: u }), listPlans: async () => [], getPlan: async () => null,
    setPlanAction: async () => null, deletePlan: async () => false, costSince: async () => 0,
    deleteUserData: async () => {},
  };
};
const serve = async (overrides = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = req.headers['x-user'] || 'u1'; next(); });
  const store = overrides.store ?? memoryStore();
  let hits = 0;
  app.use('/api/ai', createAIRouter({
    data: createData(), store, limiter: false, config, provider: null,
    limits: { consumeRateLimit: async () => ({ totalHits: ++hits, resetTime: new Date() }) },
    getUserEmail: async (u) => (u === 'admin' ? 'admin@x.com' : 'user@x.com'),
    ...overrides,
  }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;
  const call = (path, init = {}, user) => fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) } });
  return { server, call, store };
};

test('API: streaming sends stages then one validated response', async () => {
  const { server, call } = await serve();
  try {
    const res = await call('/chat/stream', { method: 'POST', body: JSON.stringify({ message: 'Qual aparelho mais gasta?' }) });
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const text = await res.text();
    const events = [...text.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map((m) => [m[1], JSON.parse(m[2])]);
    assert.deepEqual(events.filter(([e]) => e === 'stage').map(([, d]) => d.stage), ['context', 'data', 'compute']);
    const final = events.filter(([e]) => e === 'response');
    assert.equal(final.length, 1);
    assert.equal(final[0][1].intent, 'top_consumers');
    const bad = await call('/chat/stream', { method: 'POST', body: JSON.stringify({ message: '' }) });
    assert.equal(bad.status, 400);
  } finally { server.close(); }
});

test('API: conversations persist per user and respect retention 0', async () => {
  const { server, call, store } = await serve();
  try {
    const first = await (await call('/chat', { method: 'POST', body: JSON.stringify({ message: 'Qual aparelho mais gasta?' }) })).json();
    assert.ok(first.conversationId);
    const second = await (await call('/chat', { method: 'POST', body: JSON.stringify({ message: 'E se eu usar ele 1 hora a menos?', conversationId: first.conversationId, context: first.context }) })).json();
    assert.equal(second.conversationId, first.conversationId);
    const mine = await (await call(`/conversations/${first.conversationId}`)).json();
    assert.equal(mine.conversation.messages.length, 4);
    assert.equal((await call(`/conversations/${first.conversationId}`, {}, 'u2')).status, 404);
    assert.equal((await call(`/conversations/${first.conversationId}`, { method: 'DELETE' }, 'u2')).status, 404);
    assert.equal((await call(`/conversations/${first.conversationId}`, { method: 'DELETE' })).status, 200);
    await call('/preferences', { method: 'PUT', body: JSON.stringify({ conversationRetentionDays: 0 }) });
    const off = await (await call('/chat', { method: 'POST', body: JSON.stringify({ message: 'Oi' }) })).json();
    assert.equal(off.conversationId ?? null, null);
    assert.equal(store.conversations.length, 0);
  } finally { server.close(); }
});

test('API: preferences are validated and model guesses are not saved', async () => {
  const { server, call, store } = await serve();
  try {
    assert.equal((await call('/preferences', { method: 'PUT', body: JSON.stringify({ maxReductionPercent: 80 }) })).status, 400);
    assert.equal((await call('/preferences', { method: 'PUT', body: JSON.stringify({ inferredHabit: 'x' }) })).status, 400);
    assert.equal((await call('/preferences', { method: 'PUT', body: JSON.stringify({ minHoursByAppliance: { alien: 2 } }) })).status, 200);
    await call('/chat', { method: 'POST', body: JSON.stringify({ message: 'Eu sempre trabalho no computador, então ele é essencial' }) });
    const prefs = await store.getPreferences('u1');
    assert.equal(prefs.essentialApplianceIds, undefined);
  } finally { server.close(); }
});

test('API: alerts need consent, then dedupe', async () => {
  const { server, call } = await serve();
  try {
    const before = await (await call('/alerts/evaluate', { method: 'POST', body: '{}' })).json();
    assert.equal(before.skipped, 'consent_required');
    await call('/preferences', { method: 'PUT', body: JSON.stringify({ proactiveInsights: true, alertFrequency: 'daily', monthlyGoal: 100 }) });
    const first = await (await call('/alerts/evaluate', { method: 'POST', body: '{}' })).json();
    assert.ok(first.created.some((a) => a.kind === 'goal_risk'));
    const again = await (await call('/alerts/evaluate', { method: 'POST', body: '{}' })).json();
    assert.equal(again.created.length, 0);
  } finally { server.close(); }
});

test('API: admin settings are protected, bounded and applied', async () => {
  let calls = 0;
  const provider = { name: 'fake', async complete(req) { calls++; return { text: 'texto', inputTokens: 10, outputTokens: 2, model: req.model }; } };
  process.env.AI_ADMIN_EMAILS = 'admin@x.com';
  const { server, call } = await serve({ provider });
  try {
    assert.equal((await call('/admin/settings')).status, 403);
    assert.equal((await call('/admin/settings', { method: 'PUT', body: JSON.stringify({ enabled: false }) })).status, 403);
    assert.equal((await call('/admin/settings', { method: 'PUT', body: JSON.stringify({ modelFast: 'gpt-4' }) }, 'admin')).status, 400);
    assert.equal((await call('/admin/settings', { method: 'PUT', body: JSON.stringify({ dailyUserBudget: 5000 }) }, 'admin')).status, 400);
    assert.equal((await call('/admin/settings', { method: 'PUT', body: JSON.stringify({ enabled: false }) }, 'admin')).status, 200);
    const status = await (await call('/status')).json();
    assert.equal(status.generative, false);
    await call('/chat', { method: 'POST', body: JSON.stringify({ message: 'Qual aparelho mais gasta?' }) });
    assert.equal(calls, 0);
    const view = await (await call('/admin/settings', {}, 'admin')).json();
    assert.equal(view.effective.generative, false);
    assert.equal(view.effective.keyConfigured, true);
    assert.ok(!JSON.stringify(view).includes('"test"'));
  } finally { server.close(); delete process.env.AI_ADMIN_EMAILS; }
});

test('API: report summary for a past month', async () => {
  const { server, call } = await serve();
  try {
    const res = await (await call('/report-summary?year=2026&month=9&propertyId=p1')).json();
    assert.ok(res.lines.length >= 2);
    assert.equal((await call('/report-summary?year=2026&month=9&propertyId=px')).status, 404);
  } finally { server.close(); }
});
