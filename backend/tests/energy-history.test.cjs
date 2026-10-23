const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractCumulativeKWh, toEnergyIntervals } = require('../dist/modules/energy/energy-history');

const sample = (time, counterKWh, tariffValue = 1.2) => ({
  userId: 'a', applianceId: 'appliance', provider: 'smartthings', deviceId: 'device',
  capturedAt: new Date(time), counterKWh, tariffValue, source: 'iot',
  readingType: 'cumulative', createdAt: new Date(time), sampleKey: time,
});

test('energyMeter units and missing measurements', () => {
  assert.equal(extractCumulativeKWh({ components: { main: { energyMeter: { energy: { value: 2500, unit: 'Wh' } } } } }), 2.5);
  assert.equal(extractCumulativeKWh({ components: { main: { energyMeter: { energy: { value: 2.5, unit: 'kWh' } } } } }), 2.5);
  for (const value of [-1, NaN, Infinity]) assert.equal(extractCumulativeKWh({ components: { main: { energyMeter: { energy: { value, unit: 'Wh' } } } } }), null);
  assert.equal(extractCumulativeKWh({ components: { main: { powerMeter: { power: { value: 100, unit: 'W' } } } } }), null);
});

test('counters require two readings; duplicates and resets never create excess energy', () => {
  const t = (minute) => `2026-10-22T10:${String(minute).padStart(2, '0')}:00.000Z`;
  assert.deepEqual(toEnergyIntervals([sample(t(0), 10)]), []);
  const intervals = toEnergyIntervals([sample(t(0), 10), sample(t(1), 11), sample(t(2), 11), sample(t(3), 2), sample(t(4), 2.5)]);
  assert.deepEqual(intervals.map(item => item.consumptionKWh), [1, 0, 0.5]);
  assert.equal(intervals[0].cost, 1.2);
});

test('reads Samsung powerConsumptionReport readings', async () => {
  const { extractReportCumulativeKWh, extractReportDelta, saveDeviceReading } = require('../dist/modules/energy/energy-history');
  const report = (value) => ({ components: { main: { powerConsumptionReport: { powerConsumption: { value } } } } });
  const ac = report({ energy: 539354, deltaEnergy: 0, start: '2026-10-23T14:46:37Z', end: '2026-10-23T14:55:27Z' });
  const tv = report({ energy: 0, deltaEnergy: 4.848791, start: '2026-10-23T14:41:48Z', end: '2026-10-23T14:56:49Z' });
  assert.equal(extractReportCumulativeKWh(ac), 539.354);
  assert.equal(extractReportCumulativeKWh(tv), null);
  assert.equal(extractReportDelta(tv).deltaKWh, 0.004848791);
  const calls = [];
  const db = {
    saveEnergySample: async (...args) => calls.push(['sample', ...args]),
    saveEnergyDelta: async (...args) => calls.push(['delta', ...args]),
  };
  assert.equal(await saveDeviceReading(db, 'u', 'smartthings', 'ac', ac), 'cumulative');
  assert.equal(await saveDeviceReading(db, 'u', 'smartthings', 'tv', tv), 'delta');
  assert.equal(await saveDeviceReading(db, 'u', 'smartthings', 'x', {}), null);
  assert.deepEqual(calls.map((call) => call[0]), ['sample', 'delta']);
});

test('delta samples become intervals without touching cumulative math', () => {
  const t = (minute) => `2026-10-22T10:${String(minute).padStart(2, '0')}:00.000Z`;
  const delta = { ...sample(t(1), 0.5), readingType: 'delta', startAt: new Date(t(0)) };
  const intervals = toEnergyIntervals([sample(t(0), 10), delta, sample(t(2), 11)]);
  assert.equal(intervals.length, 2);
  assert.equal(intervals.find((item) => item.consumptionKWh === 0.5).startAt, new Date(t(0)).toISOString());
  assert.equal(intervals.find((item) => item.consumptionKWh === 1).startAt, new Date(t(0)).toISOString());
});
