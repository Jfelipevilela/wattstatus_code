const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Loads a TypeScript module from src/ with relative imports resolved to src/.
const load = (relative) => {
  const filename = path.resolve(__dirname, '../src', relative);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const parentRequire = loaded.require.bind(loaded);
  loaded.require = (request) => {
    if (request.startsWith('./')) {
      const target = path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), request));
      return load(`${target}.ts`);
    }
    return parentRequire(request);
  };
  loaded._compile(compiled, filename);
  return loaded.exports;
};

const { aggregatePropertyEnergy, UNASSIGNED } = load('lib/property-energy.ts');
const { heatScale, metricValue } = load('components/floorplan/heat.ts');

const appliance = (id, overrides = {}) => ({
  id, name: id, power: 1000, status: 'normal', usageHours: 1, days: 30, monthlyCost: 30, monthlyConsumption: 30,
  tariff: 'SP', tariffValue: 1, createdAt: '2026-01-01T00:00:00.000Z', ...overrides,
});
const interval = (overrides) => ({
  applianceId: 'x', provider: 'smartthings', deviceId: 'd', startAt: '2026-10-01T00:00:00Z', endAt: '2026-10-01T01:00:00Z',
  consumptionKWh: 1, cost: 1, tariffValue: 1, source: 'iot', readingType: 'interval', ...overrides,
});
const rooms = [{ id: 'sala' }, { id: 'quarto' }];

test('rooms plus unassigned add up to the property total, each appliance once', () => {
  const appliances = [
    appliance('tv', { propertyId: 'casa', roomId: 'sala', tariffValue: 1 }),
    appliance('ac', { propertyId: 'casa', roomId: 'quarto', tariffValue: 2 }),
    appliance('legacy'), // no property: belongs to the primary
    appliance('ghost', { propertyId: 'casa', roomId: 'deleted-room' }),
    appliance('beach', { propertyId: 'praia', roomId: 'sala' }),
  ];
  const result = aggregatePropertyEnergy('casa', 'casa', appliances, rooms, [], 30);
  const sum = [...result.byRoom.values()].reduce((total, bucket) => total + bucket.estimatedCost, 0);
  assert.equal(result.total.applianceCount, 4);
  assert.equal(result.total.estimatedCost, 30 + 60 + 30 + 30);
  assert.equal(sum, result.total.estimatedCost);
  assert.equal(result.byRoom.get(UNASSIGNED).applianceCount, 2);
  const beach = aggregatePropertyEnergy('praia', 'casa', appliances, rooms, [], 30);
  assert.equal(beach.total.applianceCount, 1);
  assert.equal(beach.total.estimatedCost + result.total.estimatedCost, 180);
});

test('measured energy stays separate and never borrows estimates', () => {
  const intervals = [
    interval({ propertyId: 'casa', roomId: 'sala', consumptionKWh: 2, cost: 2 }),
    interval({ propertyId: 'casa', roomId: null, locationChanged: true, consumptionKWh: 0.5, cost: null }),
    interval({ propertyId: null, roomId: null, consumptionKWh: 9 }),
    interval({ propertyId: 'praia', roomId: 'sala', consumptionKWh: 4 }),
  ];
  const result = aggregatePropertyEnergy('casa', 'casa', [], rooms, intervals, 30);
  assert.equal(result.total.measuredKWh, 2.5);
  assert.equal(result.total.measuredCostIncomplete, true);
  assert.equal(result.byRoom.get('sala').measuredKWh, 2);
  assert.equal(result.byRoom.get('quarto').measuredIntervals, 0);
  assert.equal(result.unattributedMeasuredKWh, 0.5);
  assert.equal(result.total.estimatedKWh, 0);
});

test('heat map treats missing data as unknown, not as low', () => {
  const empty = { estimatedKWh: 0, estimatedCost: 0, applianceCount: 0, measuredKWh: 0, measuredCost: 0, measuredCostIncomplete: false, measuredIntervals: 0 };
  assert.equal(metricValue(empty, 'measured'), null);
  assert.equal(metricValue({ ...empty, measuredIntervals: 1, measuredKWh: 0 }, 'measured'), 0);
  const scale = heatScale([10, null, 5]);
  assert.equal(scale(10), 1);
  assert.equal(scale(5), 0.5);
  assert.equal(scale(null), null);
});
