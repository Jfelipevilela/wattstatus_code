// Refinements found while integrating collection freshness into the AI:
// 1) a reading up to two intervals old is never described as real time;
// 2) one stale meter does not throw away the other meters' measured pace;
// 3) devices with history from before the new queue are not "never measured".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Orchestrator } = require('../dist/modules/ai/ai.orchestrator');
const { validateNarration } = require('../dist/modules/ai/ai.guard');

const NOW = new Date('2026-10-20T15:00:00Z');
const H = 3600000;
const config = { enabled: false, provider: 'anthropic', apiKey: '', baseUrl: '', modelFast: 'claude-haiku-5-5', modelReasoning: 'claude-sonnet-5-5', maxOutputTokens: 300, timeoutMs: 300, maxToolCalls: 2, dailyUserBudget: 50, monthlyGlobalBudget: 1000, maxConcurrent: 2, priceInput: 0.1, priceOutput: 0.5, monthlyCostLimitUsd: 0 };
const A = (id, extra) => ({ id, userId: 'u1', propertyId: 'p1', roomId: null, name: id, power: 100, status: 'normal', usageHours: 4, days: 30, monthlyCost: 0, monthlyConsumption: 0, tariff: 'SP', tariffValue: 1, createdAt: '2026-01-01T00:00:00Z', integrationProvider: 'smartthings', integrationDeviceId: `d-${id}`, ...extra });
const day = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T15:00:00Z`;
const dev = (applianceId, state, ageMs) => ({ applianceId, state, ageMs, lastReadingAt: ageMs === null ? null : new Date(NOW.getTime() - ageMs).toISOString(), nextAt: null, lastStatus: 'ok', failures: 0 });

const world = (devices, { lampDays = 19 } = {}) => {
  const intervals = [];
  for (let d = 1; d <= 19; d++) intervals.push({ userId: 'u1', applianceId: 'ac', endAt: day(10, d), startAt: day(10, d), consumptionKWh: 10, cost: 10, tariffValue: 1, propertyId: 'p1' });
  for (let d = 1; d <= lampDays; d++) intervals.push({ userId: 'u1', applianceId: 'lamp', endAt: day(10, d), startAt: day(10, d), consumptionKWh: 0.1, cost: 0.1, tariffValue: 1, propertyId: 'p1' });
  return {
    listProperties: async () => [{ id: 'p1', userId: 'u1', name: 'Casa', type: 'house', timezone: 'America/Sao_Paulo', isPrimary: true, createdAt: '', updatedAt: '' }],
    listRooms: async () => [],
    listAppliances: async () => [A('ac', { name: 'Ar condicionado', power: 1200, usageHours: 8 }), A('lamp', { name: 'Luminária', power: 10, usageHours: 10 })],
    getEnergyHistory: async (_u, s, e) => intervals.filter((i) => new Date(i.endAt) >= s && new Date(i.endAt) < e),
    getCollectionStatus: async () => ({ enabled: true, intervalMs: 30 * 60000, devices }),
  };
};
const ask = async (w, message, context) => (await new Orchestrator({ data: w, config, provider: null, now: () => NOW }).chat('u1', { message, context })).response;

test('1. leitura recente (até 2 intervalos) nunca é descrita como tempo real', async () => {
  const r = await ask(world([dev('ac', 'recent', 50 * 60000), dev('lamp', 'recent', 10 * 60000)]), 'Quanto o ar condicionado consome agora?', { propertyId: 'p1', applianceId: 'ac' });
  assert.match(r.message, /Última medição de Ar condicionado: há 50 min;/);
  assert.match(r.message, /não é uma medição em tempo real/);
  // A model rewrite may not turn it into instantaneous consumption either.
  const facts = { draft: r.message, values: {}, allowedNames: [], forbiddenNames: ['Ar condicionado', 'Luminária'], measured: true, claims: { recentNames: ['Ar condicionado'] } };
  assert.ok(validateNarration('O Ar condicionado está consumindo agora.', facts).includes('currentness'));
});

test('2. um medidor pequeno atrasado não descarta o ritmo medido dos outros', async () => {
  const r = await ask(world([dev('ac', 'recent', 10 * 60000), dev('lamp', 'delayed', 30 * H)], { lampDays: 18 }), 'Quanto vou gastar no fim do mês?');
  const forecast = r.cards.find((c) => c.type === 'forecast').forecast;
  assert.equal(forecast.source, 'projected', 'measured pace kept');
  assert.equal(forecast.method, 'pace_mixed');
  assert.equal(forecast.confidence, 'media');
  assert.match(forecast.reason, /Luminária/);
  // 19 days of AC at 10 kWh + lamp 1.8 kWh measured; 12 days left at AC pace 10/day + lamp estimate 0.1/day.
  assert.ok(Math.abs(forecast.kWh - (190 + 1.8 + 12 * (10 + 0.1))) < 0.5, `kWh ${forecast.kWh}`);
  // If the stale meter carries a large share, the estimate is used instead.
  const big = await ask(world([dev('ac', 'delayed', 30 * H), dev('lamp', 'recent', 10 * 60000)]), 'Quanto vou gastar no fim do mês?');
  assert.equal(big.cards.find((c) => c.type === 'forecast').forecast.source, 'estimated');
});

test('3. histórico anterior à fila nova não vira "nenhuma medição"', async () => {
  // Queue rows exist but lastSuccessAt was never written (pre-queue device):
  // the contract says "missing"; the readings in history say otherwise.
  const r = await ask(world([dev('ac', 'missing', null), dev('lamp', 'missing', null)]), 'Quanto o ar condicionado gasta?', { propertyId: 'p1', applianceId: 'ac' });
  assert.doesNotMatch(r.message, /ainda não tem nenhuma medição automática/);
  assert.match(r.message, /A última medição de Ar condicionado ocorreu há \d+ (h|dias)/);
  assert.equal(r.dataQuality[0].state, 'delayed');
});
