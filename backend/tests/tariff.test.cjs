const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculationSchema } = require('../dist/modules/calculations/calculation.schema');
const { calculateAppliance } = require('../dist/modules/calculations/calculation.service');

test('custom R$/kWh rate produces correct monthly consumption and cost', () => {
  const input = calculationSchema.parse({ power: 150, usageHours: 4, days: 30, tariff: 'SP', tariffValue: 1.25 });
  const result = calculateAppliance(input);
  assert.equal(result.consumptionKWh, 18);
  assert.equal(result.cost, 22.5);
});

test('invalid custom tariff is rejected', () => {
  for (const value of [-1, 0, NaN, Infinity]) {
    assert.equal(calculationSchema.safeParse({ power: 100, usageHours: 1, days: 1, tariff: 'SP', tariffValue: value }).success, false);
  }
});

test('cumulative device reading never replaces monthly estimate', () => {
  const result = calculateAppliance({ power: 100, usageHours: 2, days: 30, tariff: 'SP', measuredConsumptionKWh: 900 });
  assert.equal(result.consumptionKWh, 6);
});
