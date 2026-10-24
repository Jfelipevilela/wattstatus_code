// Measurement freshness in WattStatus AI: the five collection states, their
// transitions, forecasts, anomalies, alerts, investigations, the guard and
// user isolation. Collection status is simulated as the contract defines it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Orchestrator } = require('../dist/modules/ai/ai.orchestrator');
const engine = require('../dist/modules/ai/ai.engine');
const { validateNarration } = require('../dist/modules/ai/ai.guard');
const { createAIRouter } = require('../dist/modules/ai/ai.routes');
const { errorHandler } = require('../dist/middleware/error-handler');

const NOW = new Date('2026-10-20T15:00:00Z');
const H = 3600000;
const config = {
  enabled: false, provider: 'anthropic', apiKey: '', baseUrl: '', modelFast: 'claude-haiku-5-5', modelReasoning: 'claude-sonnet-5-5',
  maxOutputTokens: 300, timeoutMs: 300, maxToolCalls: 2, dailyUserBudget: 50, monthlyGlobalBudget: 1000, maxConcurrent: 2,
  priceInput: 0.1, priceOutput: 0.5, monthlyCostLimitUsd: 0,
};
const P = (id, userId) => ({ id, userId, name: `Casa ${id}`, type: 'house', timezone: 'America/Sao_Paulo', isPrimary: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
const A = (id, userId, propertyId, extra = {}) => ({ id, userId, propertyId, roomId: null, name: id, power: 100, status: 'normal', usageHours: 4, days: 30, monthlyCost: 0, monthlyConsumption: 0, tariff: 'SP', tariffValue: 1, createdAt: '2026-01-01T00:00:00Z', ...extra });
const day = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T15:00:00Z`;
const device = (applianceId, state, ageMs = null, extra = {}) => ({ applianceId, state, ageMs, lastReadingAt: ageMs === null ? null : new Date(NOW.getTime() - ageMs).toISOString(), nextAt: null, lastStatus: state === 'error' ? 'unauthorized' : 'ok', failures: 0, ...extra });

// TV and AC are connected and measured daily; PC is estimate-only.
const world = ({ status = {}, measureAc = true, spike = false, catchUp = false } = {}) => {
  const intervals = [];
  for (const [m, days] of [[9, 30], [10, 19]]) {
    for (let d = 1; d <= days; d++) {
      const kwhTv = spike && m === 10 && d === 19 ? 9 : 0.5;
      intervals.push({ userId: 'u1', applianceId: 'tv', endAt: day(m, d), startAt: catchUp && m === 10 && d === 19 ? day(10, 15) : day(m, d), consumptionKWh: kwhTv, cost: kwhTv, tariffValue: 1, propertyId: 'p1' });
      if (measureAc) intervals.push({ userId: 'u1', applianceId: 'ac', endAt: day(m, d), startAt: day(m, d), consumptionKWh: 4, cost: 4, tariffValue: 1, propertyId: 'p1' });
    }
  }
  const data = {
    properties: [P('p1', 'u1'), P('px', 'u2')],
    appliances: [
      A('tv', 'u1', 'p1', { name: 'TV', power: 150, usageHours: 5, integrationProvider: 'smartthings', integrationDeviceId: 'd-tv' }),
      A('ac', 'u1', 'p1', { name: 'Ar condicionado', power: 1200, usageHours: 6, integrationProvider: 'smartthings', integrationDeviceId: 'd-ac' }),
      A('pc', 'u1', 'p1', { name: 'Computador', power: 300, usageHours: 8 }),
      A('alien', 'u2', 'px', { name: 'Sauna', power: 9000, integrationProvider: 'smartthings', integrationDeviceId: 'd-x' }),
    ],
    intervals,
    statusCalls: [],
  };
  const statusFor = (userId) => {
    if (userId === 'u2') return { enabled: true, intervalMs: 30 * 60000, devices: [device('alien', 'recent', 60000)] };
    return { enabled: status.enabled ?? true, intervalMs: 30 * 60000, devices: [device('tv', status.tv ?? 'recent', status.tvAge ?? 10 * 60000, status.tvExtra), device('ac', status.ac ?? 'recent', status.acAge ?? 15 * 60000), device('alien', 'recent', 1)] };
  };
  return {
    data,
    listProperties: async (u) => data.properties.filter((p) => p.userId === u),
    listRooms: async () => [],
    listAppliances: async (u) => data.appliances.filter((a) => a.userId === u),
    getEnergyHistory: async (u, s, e) => data.intervals.filter((i) => i.userId === u && new Date(i.endAt) >= s && new Date(i.endAt) < e),
    getCollectionStatus: async (u) => { data.statusCalls.push(u); return statusFor(u); },
  };
};
const ask = async (w, message, context) => (await new Orchestrator({ data: w, config, provider: null, now: () => NOW }).chat('u1', { message, context })).response;
const tvContext = { propertyId: 'p1', applianceId: 'tv' };

test('recente: confirma a última medição com a idade vinda do backend', async () => {
  const r = await ask(world(), 'Quanto a TV está consumindo agora?', tvContext);
  assert.match(r.message, /Última medição de TV: há 10 min\./);
  assert.deepEqual(r.dataQuality.map((q) => [q.name, q.state, q.label]), [['TV', 'recent', 'Atualizado']]);
});

test('atrasada: não apresenta como atual e informa a idade', async () => {
  const r = await ask(world({ status: { tv: 'delayed', tvAge: 3 * H } }), 'Quanto a TV gasta?', tvContext);
  assert.match(r.message, /A última medição de TV ocorreu há 3 h\. Posso analisar o histórico disponível, mas não confirmar o consumo atual\./);
  assert.equal(r.dataQuality[0].label, 'Leitura atrasada');
  assert.equal(r.dataQuality[0].age, 'há 3 h');
});

test('desativada, erro e sem medição: frases do contrato', async () => {
  const disabled = await ask(world({ status: { enabled: false, tv: 'disabled' } }), 'Quanto a TV gasta?', tvContext);
  assert.match(disabled.message, /TV não está sendo monitorado automaticamente\. Posso usar os dados estimados cadastrados para fazer uma simulação\./);
  const error = await ask(world({ status: { tv: 'error' } }), 'Quanto a TV gasta?', tvContext);
  assert.match(error.message, /Há um problema na atualização das medições de TV\. Os valores recentes podem estar incompletos\./);
  assert.equal(error.dataQuality[0].label, 'Erro de coleta');
  const missing = await ask(world({ status: { tv: 'missing', tvAge: null } }), 'Quanto a TV gasta?', tvContext);
  assert.match(missing.message, /TV ainda não tem nenhuma medição automática/);
  assert.equal(missing.dataQuality[0].label, 'Sem medição');
});

test('transições: recente → atrasada → erro → recente', async () => {
  const states = [['recent', 10 * 60000, /Última medição/], ['delayed', 5 * H, /há 5 h/], ['error', 5 * H, /problema na atualização/], ['recent', 60000, /há 1 min/]];
  for (const [state, age, pattern] of states) {
    const r = await ask(world({ status: { tv: state, tvAge: age } }), 'Quanto a TV consome agora?', tvContext);
    assert.match(r.message, pattern, state);
    assert.equal(r.dataQuality[0].state, state);
  }
});

test('falha temporária (1 falha, ainda recente) não vira erro', async () => {
  const r = await ask(world({ status: { tv: 'recent', tvExtra: { failures: 1, lastStatus: 'failed' } } }), 'Quanto a TV gasta?', tvContext);
  assert.doesNotMatch(r.message, /problema na atualização/);
  assert.equal(r.dataQuality[0].state, 'recent');
});

test('aparelho sem medição automática: pergunta sobre consumo atual admite a limitação', async () => {
  const r = await ask(world(), 'Quanto o computador consome agora?');
  assert.match(r.message, /Computador não tem medição automática; os valores vêm do cadastro\./);
  assert.ok(r.limitations.some((l) => /não há como confirmar o consumo atual/.test(l)));
});

test('medição parcial preservada e estados na cobertura', async () => {
  const r = await ask(world({ status: { ac: 'delayed', acAge: 6 * H } }), 'Quais dispositivos estão sem medição?');
  assert.equal(r.metrics[0].source, 'measured_partial');
  assert.match(r.message, /Atualização: 1 atualizado\(s\), 1 com leitura atrasada, 0 sem medição, 0 com erro, 0 com coleta desativada\./);
  assert.ok(r.limitations.some((l) => /Ar condicionado: há 6 h/.test(l)));
  assert.equal(r.dataQuality[0].name, 'Ar condicionado', 'stale devices first');
});

test('previsão: medidor atrasado derruba o ritmo medido e a confiança', async () => {
  // Fully measured home (TV and AC both read daily), PC removed.
  const w = world({ status: { ac: 'delayed', acAge: 30 * H } });
  w.data.appliances = w.data.appliances.filter((a) => a.id !== 'pc');
  const stale = await ask(w, 'Quanto vou gastar no fim do mês?');
  const forecast = stale.cards.find((c) => c.type === 'forecast').forecast;
  assert.equal(forecast.source, 'estimated');
  assert.equal(forecast.confidence, 'baixa');
  assert.match(forecast.reason, /medidor\(es\) com leitura atrasada/);
  assert.ok(stale.limitations.includes('Confiança da previsão: baixa.'));
  const w2 = world();
  w2.data.appliances = w2.data.appliances.filter((a) => a.id !== 'pc');
  const fresh = (await ask(w2, 'Quanto vou gastar no fim do mês?')).cards.find((c) => c.type === 'forecast').forecast;
  assert.equal(fresh.source, 'projected');
  assert.notEqual(fresh.confidence, 'baixa');
});

test('falha de medição não vira aumento: sem pico, sem alerta de aumento', async () => {
  const healthy = await new Orchestrator({ data: world({ spike: true }), config, provider: null, now: () => NOW }).snapshotFor('u1', 'p1');
  assert.ok(engine.detectAnomalies(healthy.snapshot, NOW).some((a) => a.kind === 'consumption_spike'), 'real spike is still detected');
  const stale = await new Orchestrator({ data: world({ spike: true, status: { tv: 'delayed', tvAge: 4 * H } }), config, provider: null, now: () => NOW }).snapshotFor('u1', 'p1');
  const anomalies = engine.detectAnomalies(stale.snapshot, NOW);
  assert.ok(!anomalies.some((a) => a.kind === 'consumption_spike' || a.kind === 'baseline_increase'));
  assert.ok(anomalies.some((a) => a.kind === 'measurement_quality'));
  assert.ok(!engine.evaluateAlerts(stale.snapshot, {}, NOW).some((a) => a.kind === 'consumption_increase'));
  const catchUp = await new Orchestrator({ data: world({ spike: true, catchUp: true }), config, provider: null, now: () => NOW }).snapshotFor('u1', 'p1');
  assert.equal(catchUp.snapshot.freshness.catchUpIntervals, 1);
  assert.ok(!engine.detectAnomalies(catchUp.snapshot, NOW).some((a) => a.kind === 'consumption_spike'), 'catch-up reading is not a spike');
});

test('investigação considera atualização e não usa medidor atrasado como evidência', async () => {
  const r = await ask(world({ status: { tv: 'delayed', tvAge: 8 * H } }), 'Minha conta aumentou muito. Descubra o motivo.');
  const card = r.cards.find((c) => c.type === 'investigation');
  assert.ok(card.findings.some((f) => /A última medição de TV ocorreu há 8 h/.test(f.text)));
  assert.ok(!card.findings.some((f) => f.id === 'change:tv'));
  assert.match(r.message, /TV está com medição atrasada ou com erro/);
});

test('guarda: "agora" só para aparelho com leitura recente', () => {
  const facts = { draft: 'TV: R$ 22,50 por mês.', values: { cost: 22.5 }, allowedNames: [], forbiddenNames: ['TV', 'Ar condicionado'], measured: true, claims: { recentNames: ['Ar condicionado'] } };
  assert.ok(validateNarration('A TV está consumindo agora R$ 22,50 por mês.', facts).includes('currentness'));
  assert.deepEqual(validateNarration('A TV custa R$ 22,50 por mês.', facts), []);
});

test('isolamento e custo: status só do usuário, só quando há dispositivo conectado', async () => {
  const w = world();
  const r = await ask(w, 'Quais dispositivos estão sem medição?');
  assert.deepEqual(w.data.statusCalls, ['u1']);
  assert.ok(!JSON.stringify(r).includes('alien') && !JSON.stringify(r).includes('Sauna'), 'foreign device in the status is ignored');
  const offline = world();
  offline.data.appliances = offline.data.appliances.map((a) => ({ ...a, integrationProvider: undefined, integrationDeviceId: undefined }));
  await ask(offline, 'Quais dispositivos estão sem medição?');
  assert.deepEqual(offline.data.statusCalls, [], 'no status read without connected devices');
});

test('rotas: usa energyCollectionStatus do banco quando o data source não fornece', async () => {
  const w = world({ status: { tv: 'delayed', tvAge: 2 * H } });
  const statusFn = w.getCollectionStatus;
  delete w.getCollectionStatus;
  const calls = [];
  const store = { getPreferences: async () => ({}), getSettings: async () => ({}), recordUsage: async () => {}, appendConversation: async () => null };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = 'u1'; next(); });
  app.use('/api/ai', createAIRouter({
    data: w, store, limiter: false, config, provider: null,
    limits: { consumeRateLimit: async () => ({ totalHits: 1, resetTime: new Date() }), energyCollectionStatus: async (userId, now, intervalMs) => { calls.push([userId, intervalMs]); return statusFn(userId); } },
  }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Quanto a TV gasta?', context: tvContext }) });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.match(body.message, /há 2 h/);
    assert.deepEqual(calls[0], ['u1', 30 * 60000]);
  } finally { server.close(); }
});
