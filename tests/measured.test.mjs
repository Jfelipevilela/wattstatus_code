import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const toModule = async (file) => {
  const source = await readFile(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return compiled;
};
// measured.ts imports ./timezone; inline it as a data URL so both load in Node.
const timezoneUrl = `data:text/javascript;base64,${Buffer.from(await toModule("timezone.ts")).toString("base64")}`;
const compiled = (await toModule("measured.ts")).replace('"./timezone"', JSON.stringify(timezoneUrl));
const { localMonthKey, measuredByMonth, measuredByDevice, summarizeMeasured } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const measuredUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;

const row = (endAt, consumptionKWh, cost = 1) => ({ applianceId: 'a', provider: 'smartthings', deviceId: 'd', endAt, consumptionKWh, cost, tariffValue: cost === null ? null : 1, source: 'iot', readingType: 'interval' });

test('measured grouping uses local calendar month and keeps missing cost distinct', () => {
  const local = new Date(2026, 9, 31, 23, 30).toISOString();
  assert.equal(localMonthKey(local), '2026-10');
  const intervals = [row(local, 1), row(new Date(2026, 10, 1, 1).toISOString(), 2, null)];
  assert.deepEqual(measuredByMonth(intervals).map(item => item.consumptionKWh), [1, 2]);
  assert.equal(summarizeMeasured(intervals).costComplete, false);
  assert.equal(measuredByDevice(intervals).length, 2);
});

test('dashboard keeps readings of same-name appliances separate by id', async () => {
  const source = await readFile(new URL('../src/components/dashboard/summary.ts', import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('"@/lib/measured"', JSON.stringify(measuredUrl))
    .replace('"@/lib/timezone"', JSON.stringify(timezoneUrl));
  const { summarizeMonth } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
  const endAt = new Date(2026, 9, 15).toISOString();
  const readings = [
    { ...row(endAt, 2), applianceId: 'a', startAt: new Date(2026, 9, 14).toISOString() },
    { ...row(endAt, 3), applianceId: 'b', startAt: new Date(2026, 9, 14).toISOString() },
  ];
  const summary = summarizeMonth(readings, [{ id: 'a', name: 'Geladeira' }, { id: 'b', name: 'Geladeira' }], 2026, 10);
  assert.equal(summary.byAppliance.get('a'), 2);
  assert.equal(summary.byAppliance.get('b'), 3);
  assert.equal(summary.byAppliance.size, 2);
});
