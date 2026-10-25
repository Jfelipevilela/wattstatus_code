// The columnar energy format must rebuild exactly the objects the API used to
// send. Runs the backend encoder and the frontend decoder together.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const load = (file) => {
  const filename = path.resolve(__dirname, '..', file);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.require = () => ({});
  loaded._compile(compiled, filename);
  return loaded.exports;
};
const { compactIntervals, intervalsBody } = load('backend/src/modules/energy/energy-compact.ts');
const { expandIntervals } = load('src/lib/energy-compact.ts');

const base = { provider: 'smartthings', source: 'iot', readingType: 'interval', tariffValue: 0.92 };
const intervals = [
  { ...base, applianceId: 'a1', deviceId: 'd1', startAt: '2026-10-01T03:00:00.000Z', endAt: '2026-10-01T04:00:00.000Z', consumptionKWh: 0.153, cost: 0.14076, propertyId: 'p1', roomId: 'r1' },
  { ...base, applianceId: null, deviceId: 'd2', startAt: '2026-10-01T03:00:00.000Z', endAt: '2026-10-01T03:07:31.250Z', consumptionKWh: 0.01, cost: null, tariffValue: null, propertyId: null, roomId: null, locationChanged: true },
  { ...base, applianceId: 'a1', deviceId: 'd1', startAt: '2026-10-01T04:00:00.000Z', endAt: '2026-10-01T05:00:00.000Z', consumptionKWh: 0, cost: 0 },
  { ...base, applianceId: 'a1', deviceId: 'd1', startAt: '2026-10-01T05:00:00.000Z', endAt: '2026-10-01T06:00:00.000Z', consumptionKWh: 1e-7, cost: 9.2e-8, propertyId: 'p1', roomId: null, locationChanged: false },
];
const sorted = (item) => Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));

test('formato em colunas reconstrói exatamente os mesmos intervalos', () => {
  const wire = JSON.parse(JSON.stringify(compactIntervals(intervals)));
  assert.deepEqual(expandIntervals(wire).map(sorted), intervals.map(sorted));
  assert.deepEqual(expandIntervals([]), []);
});

test('formato simples continua sendo o padrão e o fallback', () => {
  assert.equal(intervalsBody(intervals, undefined), intervals);
  assert.deepEqual(expandIntervals(intervals), intervals);
  const odd = [{ ...intervals[0], startAt: '2026-10-01T03:00:00Z' }];
  assert.equal(intervalsBody(odd, 'columns'), odd, 'non-canonical dates are sent as-is');
  const extra = [{ ...intervals[0], note: 'x' }];
  assert.equal(intervalsBody(extra, 'columns'), extra, 'unknown fields are sent as-is');
});

test('um mês de leituras horárias fica bem menor', () => {
  const month = [];
  for (let device = 0; device < 6; device++) for (let hour = 0; hour < 720; hour++) {
    const start = Date.UTC(2026, 9, 1) + hour * 3600000;
    month.push({ ...base, applianceId: `appliance-${device}-0000-0000-0000-000000000000`, deviceId: `device-${device}-0000-0000-0000-000000000000`,
      startAt: new Date(start).toISOString(), endAt: new Date(start + 3600000).toISOString(),
      consumptionKWh: 0.05 + (hour % 11) / 100, cost: (0.05 + (hour % 11) / 100) * 0.92, propertyId: 'property-0000-0000-0000-000000000000', roomId: `room-${device}` });
  }
  const plain = JSON.stringify(month).length;
  const columns = JSON.stringify(compactIntervals(month)).length;
  assert.ok(columns < plain / 3, `${columns} vs ${plain}`);
});
