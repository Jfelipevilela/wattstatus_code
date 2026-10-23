const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PropertyService, autoPlaceRoom, estimateMonthly } = require('../dist/modules/properties/properties.service');
const { createPropertyRouter } = require('../dist/modules/properties/properties.routes');
const { ApplianceService } = require('../dist/modules/appliances/appliances.service');
const { toEnergyIntervals } = require('../dist/modules/energy/energy-history');
const { errorHandler } = require('../dist/middleware/error-handler');

// In-memory repository with the same user scoping as the Mongo one.
const createRepo = () => {
  const data = { properties: [], floors: [], rooms: [], appliances: [], intervals: [] };
  const patch = (list, userId, id, changes) => {
    const row = list.find((item) => item.id === id && item.userId === userId);
    if (!row) return null;
    Object.assign(row, changes);
    return { ...row };
  };
  return {
    data,
    listProperties: async (userId) => data.properties.filter((p) => p.userId === userId).map((p) => ({ ...p })),
    insertProperty: async (record) => {
      if (record.legacyDefault && data.properties.some((p) => p.userId === record.userId && p.legacyDefault)) {
        throw new Error('E11000 duplicate key');
      }
      data.properties.push({ ...record });
    },
    updateProperty: async (userId, id, changes) => patch(data.properties, userId, id, changes),
    setPrimaryProperty: async (userId, id) => {
      for (const p of data.properties) if (p.userId === userId) p.isPrimary = p.id === id;
    },
    deleteProperty: async (userId, id) => {
      const before = data.properties.length;
      data.properties = data.properties.filter((p) => !(p.userId === userId && p.id === id));
      return before !== data.properties.length;
    },
    listFloors: async (userId, propertyId) => data.floors.filter((f) => f.userId === userId && f.propertyId === propertyId).map((f) => ({ ...f })),
    insertFloor: async (record) => { data.floors.push({ ...record }); },
    updateFloor: async (userId, id, changes) => patch(data.floors, userId, id, changes),
    deleteFloors: async (userId, propertyId, floorId) => {
      data.floors = data.floors.filter((f) => !(f.userId === userId && f.propertyId === propertyId && (!floorId || f.id === floorId)));
    },
    listRooms: async (userId, propertyId) => data.rooms.filter((r) => r.userId === userId && r.propertyId === propertyId).map((r) => ({ ...r })),
    insertRoom: async (record) => { data.rooms.push({ ...record }); },
    updateRoom: async (userId, id, changes) => patch(data.rooms, userId, id, changes),
    deleteRooms: async (userId, propertyId, roomId) => {
      data.rooms = data.rooms.filter((r) => !(r.userId === userId && r.propertyId === propertyId && (!roomId || r.id === roomId)));
    },
    listAppliances: async (userId) => data.appliances.filter((a) => a.userId === userId).map((a) => ({ ...a })),
    addAppliance: async (record) => { data.appliances.push({ ...record }); return record; },
    updateAppliance: async (userId, record) => patch(data.appliances, userId, record.id, record),
    moveAppliances: async (userId, filter, target) => {
      let count = 0;
      for (const a of data.appliances) {
        if (a.userId !== userId) continue;
        if (filter.propertyId === null && a.propertyId != null) continue;
        if (filter.propertyId && a.propertyId !== filter.propertyId) continue;
        if (filter.roomId && a.roomId !== filter.roomId) continue;
        Object.assign(a, target);
        count++;
      }
      return count;
    },
    getEnergyHistory: async (userId) => data.intervals.filter((i) => i.userId === userId),
  };
};

const appliance = (overrides) => ({
  id: overrides.id, userId: 'a', name: overrides.id, power: 1000, status: 'normal', usageHours: 1, days: 30,
  monthlyCost: 30, monthlyConsumption: 30, tariff: 'SP', tariffValue: 1, createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

test('default property is created once and adopts legacy appliances', async () => {
  const repo = createRepo();
  repo.data.appliances.push(appliance({ id: 'legacy-1' }), appliance({ id: 'legacy-2', propertyId: null }));
  repo.data.appliances.push(appliance({ id: 'other-user', userId: 'b' }));
  const service = new PropertyService(repo);
  const [first, second] = await Promise.all([service.list('a'), service.list('a')]);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal((await service.list('a')).length, 1);
  const property = first[0];
  assert.equal(property.isPrimary, true);
  assert.equal(property.name, 'Meu imóvel');
  assert.equal((await service.listFloors('a', property.id)).length, 1);
  assert.deepEqual(repo.data.appliances.filter((a) => a.userId === 'a').map((a) => a.propertyId), [property.id, property.id]);
  assert.equal(repo.data.appliances.find((a) => a.userId === 'b').propertyId, undefined);
});

test('rooms are auto-placed deterministically without moving saved rooms', () => {
  const first = autoPlaceRoom('living', []);
  const second = autoPlaceRoom('bedroom', [first]);
  assert.deepEqual(first, { x: 0, y: 0, width: 6, depth: 5 });
  assert.deepEqual(second, { x: 6, y: 0, width: 4, depth: 4 });
  assert.deepEqual(autoPlaceRoom('bedroom', [first]), second);
});

test('foreign users cannot read or change properties, rooms or placements', async () => {
  const repo = createRepo();
  const service = new PropertyService(repo);
  const home = await service.create('a', { name: 'Casa', type: 'house', timezone: 'America/Sao_Paulo' });
  const room = await service.addRoom('a', home.id, { name: 'Sala', type: 'living' });
  await assert.rejects(service.get('b', home.id), (err) => err.status === 404);
  await assert.rejects(service.addRoom('b', home.id, { name: 'X', type: 'other' }), (err) => err.status === 404);
  await assert.rejects(service.updateRoom('b', home.id, room.id, { name: 'Hack' }), (err) => err.status === 404);
  await assert.rejects(service.resolvePlacement('b', home.id, room.id), (err) => err.status === 404);
  const beach = await service.create('a', { name: 'Praia', type: 'house', timezone: 'America/Sao_Paulo' });
  // A room of another property of the same user is also rejected.
  await assert.rejects(service.resolvePlacement('a', beach.id, room.id), (err) => err.status === 404);
});

test('summary splits rooms and unassigned without double counting, with per-appliance tariffs', async () => {
  const repo = createRepo();
  const service = new PropertyService(repo);
  const home = await service.create('a', { name: 'Casa', type: 'house', timezone: 'America/Sao_Paulo' });
  const sala = await service.addRoom('a', home.id, { name: 'Sala', type: 'living' });
  repo.data.appliances.push(
    appliance({ id: 'tv', propertyId: home.id, roomId: sala.id, tariffValue: 1 }),
    appliance({ id: 'ac', propertyId: home.id, roomId: sala.id, tariffValue: 2 }),
    appliance({ id: 'loose', propertyId: home.id, roomId: null, tariffValue: 0.5 }),
    appliance({ id: 'elsewhere', propertyId: 'other-property' }),
  );
  const summary = await service.summary('a', home.id, new Date(2026, 9, 15));
  const salaRow = summary.rooms.find((room) => room.id === sala.id);
  assert.equal(salaRow.applianceCount, 2);
  assert.equal(salaRow.estimatedKWh, 60);
  assert.equal(salaRow.estimatedCost, 90);
  assert.equal(summary.unassigned.estimatedCost, 15);
  assert.equal(summary.totals.applianceCount, 3);
  assert.equal(summary.totals.estimatedKWh, salaRow.estimatedKWh + summary.unassigned.estimatedKWh);
  assert.equal(summary.totals.estimatedCost, 105);
  assert.equal(estimateMonthly(appliance({ id: 'feb', days: 31 }), 28).consumption, 28);
});

test('deleting a room keeps appliances; deleting a property requires a destination', async () => {
  const repo = createRepo();
  const service = new PropertyService(repo);
  // Every user starts with the default property, which is primary.
  const [home] = await service.list('a');
  const beach = await service.create('a', { name: 'Praia', type: 'house', timezone: 'America/Sao_Paulo' });
  const sala = await service.addRoom('a', home.id, { name: 'Sala', type: 'living' });
  repo.data.appliances.push(appliance({ id: 'tv', propertyId: home.id, roomId: sala.id }));
  await service.removeRoom('a', home.id, sala.id);
  assert.equal(repo.data.appliances[0].roomId, null);
  assert.equal(repo.data.appliances[0].propertyId, home.id);
  await assert.rejects(service.remove('a', home.id), (err) => err.status === 409);
  await service.remove('a', home.id, beach.id);
  assert.equal(repo.data.appliances[0].propertyId, beach.id);
  assert.equal((await service.list('a')).find((p) => p.id === beach.id).isPrimary, true);
  await assert.rejects(service.remove('a', beach.id), (err) => err.status === 409);
});

test('layout rejects foreign rooms and invalid geometry', async () => {
  const repo = createRepo();
  const service = new PropertyService(repo);
  const home = await service.create('a', { name: 'Casa', type: 'house', timezone: 'America/Sao_Paulo' });
  const other = await service.create('b', { name: 'Outra', type: 'house', timezone: 'America/Sao_Paulo' });
  const foreign = await service.addRoom('b', other.id, { name: 'Sala', type: 'living' });
  const mine = await service.addRoom('a', home.id, { name: 'Sala', type: 'living' });
  await assert.rejects(service.saveLayout('a', home.id, [{ id: foreign.id, layout: { x: 1, y: 1, width: 2, depth: 2 } }]), (err) => err.status === 404);
  await assert.rejects(service.saveLayout('a', home.id, [{ id: mine.id, layout: { x: 199, y: 0, width: 5, depth: 2 } }]), (err) => err.status === 400);
  const rooms = await service.saveLayout('a', home.id, [{ id: mine.id, layout: { x: 3, y: 2, width: 5, depth: 4 } }]);
  assert.deepEqual(rooms[0].layout, { x: 3, y: 2, width: 5, depth: 4 });
});

test('appliance moves are validated against the owner hierarchy', async () => {
  const repo = createRepo();
  const properties = new PropertyService(repo);
  const appliances = new ApplianceService(repo, properties);
  const [home] = await properties.list('a');
  const beach = await properties.create('a', { name: 'Praia', type: 'house', timezone: 'America/Sao_Paulo' });
  const quarto = await properties.addRoom('a', beach.id, { name: 'Quarto', type: 'bedroom' });
  const created = await appliances.create('a', { name: 'Ar', power: 1400, usageHours: 6, days: 30, tariff: 'SP' });
  assert.equal(created.propertyId, home.id);
  assert.equal(created.roomId, null);
  const moved = await appliances.update('a', created.id, { propertyId: beach.id, roomId: quarto.id });
  assert.equal(moved.propertyId, beach.id);
  assert.equal(moved.roomId, quarto.id);
  await assert.rejects(appliances.update('a', created.id, { propertyId: home.id, roomId: quarto.id }), (err) => err.status === 404);
  const otherHome = await properties.create('b', { name: 'B', type: 'house', timezone: 'America/Sao_Paulo' });
  await assert.rejects(appliances.update('a', created.id, { propertyId: otherHome.id }), (err) => err.status === 404);
});

test('measured intervals keep the location of capture and flag moves', () => {
  const sample = (minute, counterKWh, roomId, propertyId = 'p1') => ({
    userId: 'a', applianceId: 'ac', provider: 'smartthings', deviceId: 'd', capturedAt: new Date(Date.UTC(2026, 9, 1, 10, minute)),
    counterKWh, tariffValue: 1, source: 'iot', readingType: 'cumulative', propertyId, roomId, createdAt: new Date(), sampleKey: String(minute),
  });
  const intervals = toEnergyIntervals([sample(0, 10, 'sala'), sample(10, 11, 'sala'), sample(20, 13, 'quarto'), sample(30, 14, 'quarto')]);
  assert.deepEqual(intervals.map((i) => [i.consumptionKWh, i.roomId, Boolean(i.locationChanged)]), [
    [1, 'sala', false],
    [2, null, true],
    [1, 'quarto', false],
  ]);
  assert.equal(intervals[1].propertyId, 'p1');
  const legacy = toEnergyIntervals([{ ...sample(0, 1, undefined), propertyId: undefined }, { ...sample(5, 2, undefined), propertyId: undefined }]);
  assert.equal(legacy[0].propertyId, null);
  assert.equal(legacy[0].locationChanged, undefined);
});

test('HTTP routes isolate users and reject malformed ids', async () => {
  const repo = createRepo();
  const service = new PropertyService(repo);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = req.headers['x-user']; next(); });
  app.use('/api/properties', createPropertyRouter(service));
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/properties`;
  const call = async (path, user, method = 'GET', body) => {
    const response = await fetch(base + path, {
      method, headers: { 'x-user': user, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const list = await call('', 'a');
    assert.equal(list.status, 200);
    const home = list.body.properties[0];
    const room = await call(`/${home.id}/rooms`, 'a', 'POST', { name: 'Sala de TV', type: 'living' });
    assert.equal(room.status, 201);
    assert.ok(room.body.room.layout.width > 0);
    assert.equal((await call(`/${home.id}`, 'b')).status, 404);
    assert.equal((await call(`/${home.id}/rooms/${room.body.room.id}`, 'b', 'PATCH', { name: 'x' })).status, 404);
    assert.equal((await call(`/${home.id}/rooms/not-a-uuid`, 'a')).status, 404);
    assert.equal((await call('', 'a', 'POST', { name: '', type: 'house' })).status, 400);
    assert.equal((await call(`/${home.id}/layout`, 'a', 'PUT', { rooms: [{ id: room.body.room.id, layout: { x: -1, y: 0, width: 2, depth: 2 } }] })).status, 400);
    const summary = await call(`/${home.id}/summary`, 'a');
    assert.equal(summary.body.totals.roomCount, 1);
    const energy = await call(`/${home.id}/energy?start=2026-10-01T00:00:00.000Z&end=2026-11-01T00:00:00.000Z`, 'a');
    assert.deepEqual(energy.body.intervals, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
