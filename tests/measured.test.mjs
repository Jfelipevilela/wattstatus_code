import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/measured.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { localMonthKey, measuredByMonth, measuredByDevice, summarizeMeasured } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const row = (endAt, consumptionKWh, cost = 1) => ({ applianceId: 'a', provider: 'smartthings', deviceId: 'd', endAt, consumptionKWh, cost, tariffValue: cost === null ? null : 1, source: 'iot', readingType: 'interval' });

test('measured grouping uses local calendar month and keeps missing cost distinct', () => {
  const local = new Date(2026, 9, 31, 23, 30).toISOString();
  assert.equal(localMonthKey(local), '2026-10');
  const intervals = [row(local, 1), row(new Date(2026, 10, 1, 1).toISOString(), 2, null)];
  assert.deepEqual(measuredByMonth(intervals).map(item => item.consumptionKWh), [1, 2]);
  assert.equal(summarizeMeasured(intervals).costComplete, false);
  assert.equal(measuredByDevice(intervals).length, 2);
});
