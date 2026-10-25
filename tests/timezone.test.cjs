const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const load = (relative) => {
  const filename = path.resolve(__dirname, '../src', relative);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const parentRequire = loaded.require.bind(loaded);
  loaded.require = (request) => (request.startsWith('./') ? load(`${path.join(path.dirname(relative), request)}.ts`) : parentRequire(request));
  loaded._compile(compiled, filename);
  return loaded.exports;
};

const tz = load('lib/timezone.ts');
const { measuredByMonth } = load('lib/measured.ts');

test('month key follows the property time zone at month turns', () => {
  const instant = '2026-11-01T02:30:00Z';
  assert.equal(tz.zonedMonthKey(instant, 'America/Sao_Paulo'), '2026-10');
  assert.equal(tz.zonedMonthKey(instant, 'UTC'), '2026-11');
  assert.equal(tz.zonedMonthKey(instant, 'Asia/Kolkata'), '2026-11');
  assert.equal(tz.zonedMonthKey('2026-10-31T23:00:00Z', 'America/Manaus'), '2026-10');
});

test('month ranges are local midnights, including across DST', () => {
  const sp = tz.zonedMonthRange(2026, 11, 'America/Sao_Paulo');
  assert.equal(sp.start.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(sp.end.toISOString(), '2026-12-01T03:00:00.000Z');
  // New York switches to daylight time on 8 March 2026.
  const ny = tz.zonedMonthRange(2026, 3, 'America/New_York');
  assert.equal(ny.start.toISOString(), '2026-03-01T05:00:00.000Z');
  assert.equal(ny.end.toISOString(), '2026-04-01T04:00:00.000Z');
  const india = tz.zonedMonthRange(2026, 1, 'Asia/Kolkata');
  assert.equal(india.start.toISOString(), '2025-12-31T18:30:00.000Z');
  const december = tz.zonedMonthRange(2026, 12, 'UTC');
  assert.equal(december.end.toISOString(), '2027-01-01T00:00:00.000Z');
});

test('a day whose midnight does not exist starts at its first valid instant', () => {
  // Chile moves clocks from 00:00 to 01:00 on 6 September 2026.
  const start = tz.zonedStartOfDay(2026, 9, 6, 'America/Santiago');
  const parts = tz.zonedParts(start, 'America/Santiago');
  assert.equal(parts.day, 6);
  assert.ok(parts.hour <= 1);
  const before = tz.zonedParts(new Date(start.getTime() - 1000), 'America/Santiago');
  assert.equal(before.day, 5);
});

test('intervals crossing a month turn are filed by their end, per zone', () => {
  const interval = (startAt, endAt, consumptionKWh) => ({ startAt, endAt, consumptionKWh, cost: null });
  const rows = [interval('2026-10-31T23:50:00Z', '2026-11-01T02:10:00Z', 1), interval('2026-11-01T02:10:00Z', '2026-11-01T03:10:00Z', 2)];
  assert.deepEqual(measuredByMonth(rows, 'America/Sao_Paulo'), [
    { month: '2026-10', consumptionKWh: 1 },
    { month: '2026-11', consumptionKWh: 2 },
  ]);
  assert.deepEqual(measuredByMonth(rows, 'UTC'), [{ month: '2026-11', consumptionKWh: 3 }]);
});

test('invalid or missing zones fall back to the browser zone', () => {
  assert.equal(tz.isValidTimeZone('Mars/Olympus'), false);
  const local = new Date(2026, 4, 1);
  assert.equal(tz.zonedStartOfDay(2026, 5, 1, 'Mars/Olympus').getTime(), local.getTime());
  assert.equal(tz.zonedMonthKey(local, null), '2026-05');
  assert.deepEqual(tz.shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
});
