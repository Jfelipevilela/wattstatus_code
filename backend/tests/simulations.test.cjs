const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'simulation-isolated-test-secret-at-least-32-characters';
process.env.APP_ORIGINS = 'http://localhost:4411';

// Source mutation would make the immutability tests fail. Repository reads
// intentionally return original references to catch accidental shallow copies.
const fixture = () => {
  const propertyId = randomUUID(), roomId = randomUUID(), otherProperty = randomUUID(), otherRoom = randomUUID();
  const state = {
    properties: [
      { id: propertyId, userId: 'a', name: 'Casa', type: 'house', tariffValue: 1, address: 'PRIVATE', isPrimary: true },
      { id: otherProperty, userId: 'b', name: 'Empresa B', type: 'commercial' },
    ],
    rooms: [
      { id: roomId, propertyId, userId: 'a', name: 'Sala', type: 'living', sortOrder: 0 },
      { id: otherRoom, propertyId: otherProperty, userId: 'b', name: 'Escritório B', type: 'office', sortOrder: 0 },
    ],
    appliances: [], catalog: [],
  };
  const appliance = (changes = {}) => {
    const row = { id: randomUUID(), userId: 'a', name: 'Lâmpada', propertyId, roomId, power: 9,
      usageHours: 6, days: 30, tariff: 'SP', tariffValue: 1, status: 'normal', monthlyConsumption: 1.62,
      monthlyCost: 1.62, createdAt: '2026-01-01T00:00:00.000Z', energyProfile: { method: 'POWER_TIME', typicalPowerW: 9 },
      ...changes };
    state.appliances.push(row); return row;
  };
  const catalog = (changes = {}) => {
    const row = { id: 'test-lamp', category: 'lighting', subcategory: 'LED', displayName: 'Lâmpada 9 W',
      aliases: [], energyProfile: { method: 'POWER_TIME', typicalPowerW: 9 },
      source: { type: 'WATTSTATUS_GENERIC', reference: 'WattStatus', verifiedAt: '2026-01-01T00:00:00.000Z' },
      region: 'BR', verified: false, isGeneric: true, ...changes };
    state.catalog.push(row); return row;
  };
  const forbidden = () => { throw new Error('Simulation attempted a mutation or IoT access'); };
  const repo = {
    listProperties: async user => state.properties.filter(row => row.userId === user),
    listRooms: async (user, property) => state.rooms.filter(row => row.userId === user && row.propertyId === property),
    listAppliances: async user => state.appliances.filter(row => row.userId === user),
    getCatalogDevice: async id => state.catalog.find(row => row.id === id && row.active !== false) || null,
    getUserSettings: forbidden, ensureDefault: forbidden, moveAppliances: forbidden,
    insertProperty: forbidden, insertRoom: forbidden, addAppliance: forbidden, updateAppliance: forbidden,
    getIntegrationToken: forbidden, saveEnergySample: forbidden,
  };
  return { state, repo, propertyId, roomId, otherProperty, otherRoom, appliance, catalog };
};

function service(repo) {
  let SimulationService;
  try { ({ SimulationService } = require('../dist/modules/simulations/simulations.service')); }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof SimulationService, 'function', 'Read-only simulation service is not implemented');
  return new SimulationService(repo);
}
const inputItem = (item, changes = {}) => ({ id: item.id, source: item.source,
  ...(item.userApplianceId ? { userApplianceId: item.userApplianceId } : { catalogDeviceId: item.catalogDeviceId }),
  sourceFingerprint: item.sourceFingerprint, quantity: item.quantity, ...changes });

test('simulation sources read owned records without creating defaults or leaking private fields', async () => {
  const f = fixture(); f.appliance();
  const before = structuredClone(f.state);
  const result = await service(f.repo).sources('a');
  assert.equal(result.properties.length, 1);
  assert.equal(result.rooms.length, 1);
  assert.equal(result.appliances.length, 1);
  assert.equal(result.appliances[0].quantity, 1);
  assert.equal(result.properties[0].tariffPerKwh, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(result).includes('userId'), false);
  assert.deepEqual(f.state, before);
});

test('quantities aggregate central power-time, reference and cost without premature rounding', async () => {
  const f = fixture();
  f.appliance();
  f.appliance({ name: 'TV', power: 102, usageHours: 5, energyProfile: { method: 'POWER_TIME', typicalPowerW: 102 } });
  f.appliance({ name: 'Ar-condicionado', power: 0, energyProfile: { method: 'REFERENCE_PERIOD', value: 402, unit: 'kWh', period: 'YEAR' } });
  const s = service(f.repo), sources = await s.sources('a');
  const result = await s.calculate('a', { tariffPerKwh: 2, items: sources.appliances.map((item, i) => inputItem(item, { quantity: i === 0 ? 5 : 1 })) });
  assert.ok(Math.abs(result.items[0].monthlyKwh - 8.1) < 1e-10);
  assert.ok(Math.abs(result.monthlyKwh - 56.9) < 1e-10);
  assert.ok(Math.abs(result.monthlyCost - 113.8) < 1e-10);
  assert.equal(result.items[0].unitMonthlyKwh, 1.62);
  assert.ok(Math.abs(result.items.reduce((sum, item) => sum + item.sharePercent, 0) - 100) < 1e-10);
});

test('reference ignores hours and days; weekly cycles and standby reuse central rules', async () => {
  const f = fixture();
  f.appliance({ power: 0, energyProfile: { method: 'REFERENCE_PERIOD', value: 40.5, unit: 'kWh', period: 'MONTH' } });
  f.appliance({ power: 0, energyProfile: { method: 'PER_CYCLE', energyPerCycleKwh: 0.45 }, cyclesPerWeek: 5 });
  f.appliance({ power: 100, usageHours: 2, days: 30, standbyEnabled: true,
    energyProfile: { method: 'POWER_TIME', typicalPowerW: 100, standbyPowerW: 1 } });
  const s = service(f.repo), { appliances } = await s.sources('a');
  const result = await s.calculate('a', { tariffPerKwh: 0, items: appliances.map((item, i) => inputItem(item,
    i === 0 ? { usage: { usageHours: 24, days: 1 } } : {})) });
  assert.equal(result.items[0].monthlyKwh, 40.5);
  assert.equal(result.items[1].monthlyKwh, 9.75);
  assert.equal(result.items[2].monthlyKwh, 6.66);
  assert.equal(result.monthlyCost, 0);
  assert.ok(result.items.every(item => item.available));
});

test('monthly cycle override replaces saved weekly frequency instead of mixing the two', async () => {
  const f = fixture();
  f.appliance({ power: 0, energyProfile: { method: 'PER_CYCLE', energyPerCycleKwh: 0.45 }, cyclesPerWeek: 5 });
  const s = service(f.repo), { appliances } = await s.sources('a');
  const result = await s.calculate('a', { tariffPerKwh: 1,
    items: [inputItem(appliances[0], { usage: { cyclesPerMonth: 12 } })] });
  assert.equal(result.monthlyKwh, 5.4);
  assert.equal(f.state.appliances[0].cyclesPerWeek, 5);
});

test('legacy monthly reference and manual saved watts keep their original energy meanings', async () => {
  const f = fixture();
  f.appliance({ power: 0, energyProfile: { method: 'REFERENCE_MONTHLY', referenceMonthlyKwh: 35.4 } });
  f.appliance({ power: 120, usageHours: 5, energyProfile: undefined });
  const s = service(f.repo), { appliances } = await s.sources('a');
  const result = await s.calculate('a', { tariffPerKwh: 1, items: appliances.map(item => inputItem(item)) });
  assert.equal(result.items[0].monthlyKwh, 35.4);
  assert.equal(result.items[1].monthlyKwh, 18);
  assert.equal(f.state.appliances[0].energyProfile.method, 'REFERENCE_MONTHLY');
});

test('saved source provenance survives a missing catalog snapshot without leaking extra metadata', async () => {
  const f = fixture();
  f.appliance({ source: { type: 'MANUFACTURER', reference: 'https://manufacturer.example.invalid/model',
    verifiedAt: '2026-01-01T00:00:00.000Z', privateInternal: 'PRIVATE-SOURCE' } });
  const { appliances } = await service(f.repo).sources('a');
  assert.equal(appliances[0].sourceDetails.type, 'MANUFACTURER');
  assert.equal(JSON.stringify(appliances).includes('PRIVATE-SOURCE'), false);
});

test('catalog selection resolves trusted snapshot and rejects changes instead of refreshing drafts', async () => {
  const f = fixture(), original = f.catalog();
  const s = service(f.repo), item = await s.resolveCatalog('test-lamp');
  assert.equal(item.source, 'CATALOG');
  assert.deepEqual(item.energyProfileSnapshot, original.energyProfile);
  item.energyProfileSnapshot.typicalPowerW = 10000;
  const result = await s.calculate('a', { tariffPerKwh: 1, items: [inputItem(item, { quantity: 5, usage: { usageHours: 6 } })] });
  assert.ok(Math.abs(result.monthlyKwh - 8.1) < 1e-10);
  original.energyProfile.typicalPowerW = 10;
  await assert.rejects(s.calculate('a', { tariffPerKwh: 1, items: [inputItem(item)] }), err => err.status === 409 && err.code === 'SIMULATION_SOURCE_CHANGED');
});

test('generic alternate watts never silently project a reference without manual scenario power', async () => {
  const f = fixture();
  f.catalog({ energyProfile: { method: 'REFERENCE_PERIOD', value: 40.5, unit: 'kWh', period: 'MONTH' },
    profiles: [{ profile: { method: 'POWER_TIME', typicalPowerW: 500 },
      source: { type: 'WATTSTATUS_GENERIC', reference: 'WattStatus', verifiedAt: '2026-01-01T00:00:00.000Z' } }] });
  const s = service(f.repo), item = await s.resolveCatalog('test-lamp');
  assert.equal(item.defaultUsage.power, 0);
  const result = await s.calculate('a', { tariffPerKwh: 1, items: [inputItem(item, { usage: { estimateByUsage: true, usageHours: 2 } })] });
  assert.equal(result.monthlyKwh, null);
  const manual = await s.calculate('a', { tariffPerKwh: 1, items: [inputItem(item, { usage: { estimateByUsage: true, usageHours: 2, power: 100 } })] });
  assert.equal(manual.monthlyKwh, 6);
});

test('saved appliance snapshot remains usable after global catalog changes or removal', async () => {
  const f = fixture(), catalog = f.catalog({ energyProfile: { method: 'REFERENCE_PERIOD', value: 40.5, unit: 'kWh', period: 'MONTH' } });
  f.appliance({ power: 0, catalogDeviceId: catalog.id, energyProfile: structuredClone(catalog.energyProfile), catalogSnapshot: structuredClone(catalog) });
  const s = service(f.repo), { appliances } = await s.sources('a');
  catalog.active = false; catalog.energyProfile.value = 1000;
  const result = await s.calculate('a', { tariffPerKwh: 1, items: [inputItem(appliances[0])] });
  assert.equal(result.monthlyKwh, 40.5);
  f.state.appliances[0].usageHours = 8;
  await assert.rejects(s.calculate('a', { tariffPerKwh: 1, items: [inputItem(appliances[0])] }), err => err.status === 409);
});

test('existing by-usage appliance can restore its original reference without mutating saved profile', async () => {
  const f = fixture(), catalog = f.catalog({ energyProfile: { method: 'REFERENCE_PERIOD', value: 40.5, unit: 'kWh', period: 'MONTH' },
    profiles: [{ profile: { method: 'POWER_TIME', typicalPowerW: 100 }, source: { type: 'WATTSTATUS_GENERIC', reference: 'WattStatus', verifiedAt: '2026-01-01T00:00:00.000Z' } }] });
  f.appliance({ power: 100, usageHours: 2, estimateByUsage: true, energyProfile: { method: 'POWER_TIME', typicalPowerW: 100 }, catalogSnapshot: structuredClone(catalog) });
  const s = service(f.repo), { appliances } = await s.sources('a');
  assert.equal(appliances[0].canEstimateByUsage, true);
  const restored = await s.calculate('a', { tariffPerKwh: 1, items: [inputItem(appliances[0], { usage: { estimateByUsage: false } })] });
  assert.equal(restored.monthlyKwh, 40.5);
  const byUsage = await s.calculate('a', { tariffPerKwh: 1, items: [inputItem(appliances[0], { usage: { estimateByUsage: true } })] });
  assert.equal(byUsage.monthlyKwh, 6);
  assert.equal(f.state.appliances[0].energyProfile.method, 'POWER_TIME');
});

test('monitoring context is not a forecast and missing data makes the scenario incomplete', async () => {
  const f = fixture();
  f.appliance({ power: 0, monitoringOnly: true, energyProfile: undefined, consumptionType: 'METERED',
    measurement: { method: 'LIVE_MEASUREMENT', readingType: 'interval', capturedAt: '2026-10-25T00:00:00.000Z', consumptionKWh: 500,
      startAt: '2026-10-24T00:00:00.000Z', endAt: '2026-10-25T00:00:00.000Z' },
    integrationProvider: 'smartthings', integrationDeviceId: 'PRIVATE-IOT-ID', importKey: 'PRIVATE-IMPORT-KEY' });
  f.appliance();
  const s = service(f.repo), { appliances } = await s.sources('a');
  assert.equal(appliances[0].measurementContext.consumptionKWh, 500);
  assert.equal(JSON.stringify(appliances).includes('PRIVATE'), false);
  const result = await s.calculate('a', { tariffPerKwh: 2, items: appliances.map(item => inputItem(item)) });
  assert.equal(result.items[0].available, false);
  assert.equal(result.items[0].monthlyKwh, null);
  assert.equal(result.unavailableCount, 1);
  assert.equal(result.monthlyKwh, null);
  assert.equal(result.monthlyCost, null);
  assert.equal(result.knownMonthlyKwh, 1.62);
  assert.equal(result.knownMonthlyCost, 3.24);
  assert.equal(result.items[1].sharePercent, null);
  const manual = await s.calculate('a', { tariffPerKwh: 1, items: [inputItem(appliances[0], { usage: { power: 100, usageHours: 2 } })] });
  assert.equal(manual.monthlyKwh, 6);
});

test('monitoring-only saved power is an estimated projection with zero physical commands', async () => {
  const f = fixture(); f.appliance({ monitoringOnly: true, consumptionType: 'METERED', integrationProvider: 'smartthings', integrationDeviceId: 'private' });
  const s = service(f.repo), { appliances } = await s.sources('a');
  const result = await s.calculate('a', { tariffPerKwh: 1, items: [inputItem(appliances[0])] });
  assert.equal(result.items[0].method, 'POWER_TIME');
  assert.equal(result.monthlyKwh, 1.62);
});

test('room cloning, changed usage, quantity and tariff never alter registered data', async () => {
  const f = fixture(); f.appliance({ tariffValue: 2 });
  const before = structuredClone(f.state), s = service(f.repo);
  const loaded = await s.loadRoom('a', f.propertyId, f.roomId);
  assert.equal(loaded.baseline.monthlyKwh, 1.62);
  assert.equal(loaded.baseline.monthlyCost, 3.24);
  loaded.scenario.items[0].energyProfileSnapshot.typicalPowerW = 90000;
  const result = await s.calculate('a', { sourcePropertyId: f.propertyId, sourceRoomId: f.roomId, tariffPerKwh: 3,
    items: [inputItem(loaded.scenario.items[0], { quantity: 5, usage: { usageHours: 12 } })] });
  assert.ok(Math.abs(result.monthlyKwh - 16.2) < 1e-10);
  assert.ok(Math.abs(result.baseline.monthlyCost - 3.24) < 1e-10);
  assert.ok(Math.abs(result.comparison.differenceKwh - 14.58) < 1e-10);
  const reloaded = await s.loadRoom('a', f.propertyId, f.roomId);
  assert.deepEqual(reloaded.baseline, loaded.baseline);
  assert.deepEqual(f.state, before);
});

test('zero and unavailable baseline never yield an invented percentage', async () => {
  const f = fixture(); f.appliance({ usageHours: 0 });
  const s = service(f.repo), loaded = await s.loadRoom('a', f.propertyId, f.roomId);
  let result = await s.calculate('a', { sourcePropertyId: f.propertyId, sourceRoomId: f.roomId, tariffPerKwh: 1,
    items: [inputItem(loaded.scenario.items[0], { usage: { usageHours: 6 } })] });
  assert.equal(result.comparison.differencePercent, null);
  f.state.appliances[0].power = 0; f.state.appliances[0].energyProfile = undefined;
  const missing = await s.loadRoom('a', f.propertyId, f.roomId);
  result = await s.calculate('a', { sourcePropertyId: f.propertyId, sourceRoomId: f.roomId, tariffPerKwh: 1,
    items: [inputItem(missing.scenario.items[0], { usage: { power: 9 } })] });
  assert.equal(result.baseline.monthlyKwh, null);
  assert.equal(result.comparison.differenceKwh, null);
  assert.equal(result.comparison.differencePercent, null);
});

test('ownership is revalidated for property-room pairs and all user appliance IDs', async () => {
  const f = fixture(); f.appliance({ userId: 'b', propertyId: f.otherProperty, roomId: f.otherRoom });
  const s = service(f.repo), foreign = (await s.sources('b')).appliances[0];
  await assert.rejects(s.loadRoom('a', f.otherProperty, f.otherRoom), err => err.status === 404);
  await assert.rejects(s.loadRoom('a', f.propertyId, f.otherRoom), err => err.status === 404);
  await assert.rejects(s.calculate('a', { tariffPerKwh: 1, items: [inputItem(foreign)] }), err => err.status === 404);
  await assert.rejects(s.calculate('a', { sourcePropertyId: f.otherProperty, sourceRoomId: f.otherRoom, tariffPerKwh: 1, items: [] }), err => err.status === 404);
});

test('strict payload validation rejects tampering, unsafe ranges, duplicate IDs and mixed cycles', async () => {
  const f = fixture(); f.appliance();
  const s = service(f.repo), item = inputItem((await s.sources('a')).appliances[0]);
  const base = { tariffPerKwh: 1, items: [item] };
  const invalid = [
    { ...base, tariffPerKwh: -1 }, { ...base, tariffPerKwh: Infinity },
    { ...base, sourcePropertyId: f.propertyId }, { ...base, items: [{ ...item, quantity: 0 }] },
    { ...base, items: [{ ...item, quantity: 1001 }] }, { ...base, items: [{ ...item, quantity: 1.5 }] },
    { ...base, items: [{ ...item, userApplianceId: { $ne: null } }] },
    { ...base, items: [{ ...item, catalogDeviceId: 'test-lamp' }] },
    { ...base, items: [{ ...item, energyProfileSnapshot: { method: 'POWER_TIME', typicalPowerW: 90000 } }] },
    { ...base, items: [{ ...item, usage: { usageHours: 25 } }] },
    { ...base, items: [{ ...item, usage: { days: 0 } }] },
    { ...base, items: [{ ...item, usage: { power: 100001 } }] },
    { ...base, items: [{ ...item, usage: { cyclesPerMonth: 1, cyclesPerWeek: 1 } }] },
    { ...base, items: [{ ...item, sourceFingerprint: 'fake' }] },
    { ...base, items: [item, item] },
    { ...base, items: Array.from({ length: 101 }, (_, i) => ({ ...item, id: `row-${i}` })) },
  ];
  for (const input of invalid) await assert.rejects(s.calculate('a', input));
});

function httpClient(repo) {
  const jwt = require('jsonwebtoken');
  const serverless = require('serverless-http');
  const { createApp } = require('../dist/app');
  const { IntegrationManager } = require('../dist/modules/integrations/integration-manager');
  const { env } = require('../dist/config/env');
  const { logger } = require('../dist/logging/logger');
  for (const level of ['info', 'warn', 'error', 'debug']) logger[level] = () => {};
  const db = { ...repo,
    getUserById: async id => ['a', 'b'].includes(id) ? { id } : null,
    getSession: async id => ['session-a', 'session-b'].includes(id) ? { id, userId: id.slice(-1), expiresAt: new Date(Date.now() + 60000) } : null,
    consumeRateLimit: async () => ({ totalHits: 1, resetTime: new Date(Date.now() + 60000) }),
  };
  const handler = serverless(createApp({ db, integrationManager: new IntegrationManager() }));
  const token = user => jwt.sign({ sub: user, purpose: 'access' }, env.jwtSecret, {
    expiresIn: '1h', jwtid: `session-${user}`, issuer: 'wattstatus', audience: 'wattstatus-api',
  });
  return { token, request: async (path, { user = 'a', method = 'GET', body, headers = {} } = {}) => {
    const response = await handler({ httpMethod: method, path, queryStringParameters: {},
      headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${token(user)}` } : {}), ...headers },
      body: JSON.stringify(body ?? {}), isBase64Encoded: false,
      requestContext: { identity: { sourceIp: '192.0.2.46' } } }, {});
    let data;
    try { data = response.body ? JSON.parse(response.body) : null; } catch { data = response.body; }
    return { status: response.statusCode, headers: response.headers, data };
  } };
}

test('simulation HTTP sources/load/resolve/calculate are authenticated, isolated and validate IDs', async () => {
  const f = fixture(); f.appliance(); f.catalog();
  const before = structuredClone(f.state), client = httpClient(f.repo);
  assert.equal((await client.request('/api/simulations/sources', { user: null })).status, 401);
  const sources = await client.request('/api/simulations/sources');
  assert.equal(sources.status, 200);
  assert.equal(sources.data.properties.length, 1);
  assert.equal(sources.headers['cache-control'], 'no-store');
  const loaded = await client.request(`/api/simulations/properties/${f.propertyId}/rooms/${f.roomId}`);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.data.scenario.items.length, 1);
  assert.equal((await client.request(`/api/simulations/properties/${f.otherProperty}/rooms/${f.otherRoom}`)).status, 404);
  assert.equal((await client.request(`/api/simulations/properties/bad/rooms/${f.roomId}`)).status, 404);
  const resolved = await client.request('/api/simulations/resolve', { method: 'POST', body: { catalogDeviceId: 'test-lamp' } });
  assert.equal(resolved.status, 200);
  const result = await client.request('/api/simulations/calculate', { method: 'POST', body: { tariffPerKwh: 1,
    sourcePropertyId: f.propertyId, sourceRoomId: f.roomId,
    items: [inputItem(resolved.data.item, { quantity: 5, usage: { usageHours: 6 } })] } });
  assert.equal(result.status, 200);
  assert.ok(Math.abs(result.data.monthlyKwh - 8.1) < 1e-10);
  assert.equal((await client.request('/api/simulations/resolve', { method: 'POST', body: { catalogDeviceId: { $ne: null } } })).status, 400);
  assert.equal((await client.request('/api/simulations/calculate', { method: 'POST', body: { tariffPerKwh: -1, items: [] } })).status, 400);
  assert.deepEqual(f.state, before);
});

test('cookie simulation requests retain session-bound CSRF and reject a changed account intent', async () => {
  const f = fixture(); f.appliance();
  const client = httpClient(f.repo);
  const { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } = require('../dist/modules/auth/auth-security');
  const cookie = `${AUTH_COOKIE_NAME}=${client.token('a')}`;
  const body = { tariffPerKwh: 1, items: [] };
  const refused = await client.request('/api/simulations/calculate', { user: null, method: 'POST', body,
    headers: { cookie, origin: 'http://localhost:4411' } });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.code, 'CSRF_INVALID');
  const csrf = await client.request('/api/auth/csrf', { user: null, headers: { cookie } });
  const headers = { cookie: `${cookie}; ${CSRF_COOKIE_NAME}=${csrf.data.csrfToken}`, origin: 'http://localhost:4411',
    'x-csrf-token': csrf.data.csrfToken };
  assert.equal((await client.request('/api/simulations/calculate', { user: null, method: 'POST', body, headers })).status, 200);
  assert.equal((await client.request('/api/simulations/calculate', { user: null, method: 'POST', body,
    headers: { ...headers, 'x-wattstatus-user': 'b' } })).status, 409);
  assert.equal((await client.request('/api/simulations/calculate', { user: null, method: 'POST', body,
    headers: { ...headers, origin: 'https://untrusted.example.invalid' } })).status, 403);
});
