// Real-provider homologation for WattStatus AI. Spends real credits, so it
// never runs in `npm test` and refuses to start without explicit consent:
//
//   AI_LIVE_API_KEY=...            key from a homologation workspace (never production)
//   AI_LIVE_CONFIRM=consumir-creditos
//   AI_LIVE_MAX_CALLS=12           hard cap on model calls (default 12)
//   AI_LIVE_MAX_USD=0.05           hard cap on estimated spend (default 0.05)
//   node tests/homolog/ai-live.homolog.cjs   (after `npm run build`)
//
// Prints a JSON report; every value in it comes from a real response.
const Anthropic = require('@anthropic-ai/sdk').default;
const { AnthropicProvider, completeWithLimits, aiConfig } = require('../../dist/modules/ai/ai.provider');
const { Orchestrator } = require('../../dist/modules/ai/ai.orchestrator');

const key = process.env.AI_LIVE_API_KEY;
if (!key || process.env.AI_LIVE_CONFIRM !== 'consumir-creditos') {
  console.log('Homologação real não executada: defina AI_LIVE_API_KEY e AI_LIVE_CONFIRM=consumir-creditos.');
  process.exit(0);
}
const MAX_CALLS = Number(process.env.AI_LIVE_MAX_CALLS || 12);
const MAX_USD = Number(process.env.AI_LIVE_MAX_USD || 0.05);
process.env.AI_ENABLED = 'true';
process.env.AI_API_KEY = key;
const config = { ...aiConfig(), timeoutMs: 20000 };
let calls = 0, cost = 0;
const real = new AnthropicProvider(config);
// Budget wrapper: stops before exceeding calls or spend.
const provider = {
  name: 'anthropic',
  async complete(request) {
    if (calls >= MAX_CALLS || cost >= MAX_USD) throw new Error('orçamento de homologação esgotado');
    calls++;
    const result = await real.complete(request);
    cost += (result.inputTokens * config.priceInput + result.outputTokens * config.priceOutput) / 1e6;
    return result;
  },
};
const report = { models: {}, checks: {}, scenarios: [], calls: 0, estimatedCostUsd: 0 };

(async () => {
  const client = new Anthropic({ apiKey: key });
  for (const id of [config.modelFast, config.modelReasoning]) {
    try { const model = await client.models.retrieve(id); report.models[id] = { ok: true, displayName: model.display_name }; }
    catch (error) { report.models[id] = { ok: false, error: error?.status ?? String(error) }; }
  }
  const base = { model: config.modelFast, system: 'Responda em uma frase.', messages: [{ role: 'user', content: 'Diga olá.' }], maxTokens: 30 };
  try { const r = await completeWithLimits(provider, base, 20000, 0); report.checks.basic = { ok: Boolean(r.text), inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model }; }
  catch (error) { report.checks.basic = { ok: false, error: error.message }; }
  try { const r = await completeWithLimits(provider, { ...base, maxTokens: 3, messages: [{ role: 'user', content: 'Conte até cinquenta por extenso.' }] }, 20000, 0); report.checks.truncated = { truncated: Boolean(r.truncated) }; }
  catch (error) { report.checks.truncated = { error: error.message }; }
  try { await completeWithLimits(provider, base, 1, 0); report.checks.timeout = { ok: false, note: 'respondeu antes do timeout de 1 ms' }; }
  catch (error) { report.checks.timeout = { ok: /Tempo esgotado|cancelada/.test(error.message), error: error.message }; }
  const controller = new AbortController();
  controller.abort();
  try { await completeWithLimits(provider, { ...base, signal: controller.signal }, 20000, 0); report.checks.cancel = { ok: false }; }
  catch (error) { report.checks.cancel = { ok: /cancelada/.test(error.message) }; }

  // End-to-end narration on synthetic data, through the guard.
  const P = { id: 'p1', userId: 'u', name: 'Casa', type: 'house', timezone: 'America/Sao_Paulo', isPrimary: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const A = (id, name, power, hours) => ({ id, userId: 'u', propertyId: 'p1', roomId: null, name, power, usageHours: hours, days: 30, status: 'normal', monthlyCost: 0, monthlyConsumption: 0, tariff: 'SP', tariffValue: 0.8, createdAt: '2026-01-01T00:00:00Z' });
  const data = {
    listProperties: async () => [P], listRooms: async () => [],
    listAppliances: async () => [A('ac', 'Ar condicionado', 1400, 8), A('tv', 'TV', 120, 5), A('pc', 'Computador', 300, 8)],
    getEnergyHistory: async () => [],
  };
  const orchestrator = new Orchestrator({ data, config, provider });
  for (const message of ['Qual aparelho mais gasta?', 'E se eu usar ele duas horas a menos?', 'Minha conta aumentou muito. Descubra o motivo.', 'Quero reduzir minha conta de R$ 350 para R$ 250']) {
    try {
      const { response, usage } = await orchestrator.chat('u', { message });
      report.scenarios.push({ message, intent: usage.intent, generated: usage.generated, guard: usage.guardViolations ?? [], error: usage.error ?? null, latencyMs: usage.latencyMs, tokens: usage.inputTokens + usage.outputTokens, text: response.message.slice(0, 300) });
    } catch (error) { report.scenarios.push({ message, error: error.message }); }
  }
  report.calls = calls;
  report.estimatedCostUsd = Number(cost.toFixed(6));
  console.log(JSON.stringify(report, null, 2));
})();
