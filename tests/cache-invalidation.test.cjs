// Cache keys are per user and every change that alters derived data marks
// the derived queries stale. Uses the real TanStack QueryClient.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { QueryClient } = require('@tanstack/query-core');

const filename = path.resolve(__dirname, '../src/lib/cache-keys.ts');
const loaded = new Module(filename, module);
loaded.require = () => ({});
loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { applianceKeys, propertyKeys, energyHistoryKeys, refreshAfterApplianceChange, refreshAfterPlaceChange } = loaded.exports;

const seeded = () => {
  const client = new QueryClient();
  const keys = {
    appliances: applianceKeys.list('u1'),
    properties: propertyKeys.list('u1', false),
    layout: propertyKeys.detail('u1', 'p1'),
    propertyEnergy: propertyKeys.energy('u1', 'p1', 's', 'e'),
    history: energyHistoryKeys.range('u1', 's', 'e', null),
    insights: ['wattai', 'insights', 'primary'],
    reportSummary: ['wattai', 'report-summary', 'p1', 2026, 10],
    aiPreferences: ['wattai', 'preferences'],
    planProgress: ['wattai', 'plan', 'plan-1'],
    planList: ['wattai', 'plans'],
    alerts: ['wattai', 'alerts'],
    settings: ['integration-usage', 'u1'],
  };
  for (const key of Object.values(keys)) client.setQueryData(key, { cached: true });
  const stale = () => Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, client.getQueryState(key).isInvalidated]));
  return { client, stale };
};

test('chaves de cache são separadas por usuário e por período', () => {
  assert.notDeepEqual(applianceKeys.list('u1'), applianceKeys.list('u2'));
  assert.notDeepEqual(propertyKeys.list('u1', false), propertyKeys.list('u2', false));
  assert.notDeepEqual(propertyKeys.detail('u1', 'p'), propertyKeys.detail('u2', 'p'));
  assert.notDeepEqual(propertyKeys.energy('u1', 'p', 's', 'e'), propertyKeys.energy('u2', 'p', 's', 'e'));
  assert.notDeepEqual(propertyKeys.energy('u1', 'p', 's1', 'e1'), propertyKeys.energy('u1', 'p', 's2', 'e2'));
  assert.notDeepEqual(energyHistoryKeys.range('u1', 's', 'e', null), energyHistoryKeys.range('u2', 's', 'e', null));
  assert.notDeepEqual(energyHistoryKeys.range('u1', 's', 'e', null), energyHistoryKeys.range('u1', 's', 'e', 'a1'));
  // Prefixes used for invalidation still match every user's entries.
  for (const [prefix, key] of [[applianceKeys.all, applianceKeys.list('x')], [propertyKeys.all, propertyKeys.energy('x', 'p', 's', 'e')], [energyHistoryKeys.all, energyHistoryKeys.range('x', 's', 'e', null)]]) {
    assert.deepEqual(key.slice(0, prefix.length), [...prefix]);
  }
});

test('alterar aparelho (potência, horas, tarifa, imóvel) invalida tudo o que deriva dele', async () => {
  const { client, stale } = seeded();
  await refreshAfterApplianceChange(client);
  assert.deepEqual(stale(), {
    appliances: false, // the list itself is written from the server's answer
    properties: true, layout: true, propertyEnergy: true, history: true,
    insights: true, reportSummary: true, aiPreferences: false, settings: false,
    planProgress: true, planList: false, alerts: false,
  });
});

test('excluir ambiente ou imóvel também recarrega a lista de aparelhos', async () => {
  const { client, stale } = seeded();
  await refreshAfterPlaceChange(client);
  const result = stale();
  assert.equal(result.appliances, true);
  assert.equal(result.history, true);
  assert.equal(result.propertyEnergy, true);
  assert.equal(result.aiPreferences, false);
});
