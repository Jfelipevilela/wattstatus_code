const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');
const { createTuyaRouter } = require('../dist/modules/integrations/tuya.routes');
const { TuyaIntegration, resetTuyaTokenCache } = require('../dist/modules/integrations/providers/tuya');
const { createAuthenticate } = require('../dist/middleware/auth-middleware');
const { errorHandler } = require('../dist/middleware/error-handler');
const { env } = require('../dist/config/env');

const fakeHttp = (uidDevice, calls) => ({
  request: async ({ method, url, data }) => {
    calls.push({ method, url, data });
    const path = url.split('?')[0];
    const ok = (result) => ({ data: { success: true, result } });
    if (path === '/v1.0/token') return ok({ access_token: 'AT', expire_time: 7200 });
    const users = path.match(/^\/v1\.0\/users\/(\w+)\/devices$/);
    if (users) return ok([{ id: uidDevice[users[1]], name: 'Tomada', status: [{ code: 'switch_1', value: true }, { code: 'cur_power', value: 155 }] }]);
    const dev = path.match(/^\/v1\.0\/devices\/(\w+)(\/status|\/specifications|\/commands)?$/);
    if (dev) {
      if (dev[2] === '/status') return ok([{ code: 'switch_1', value: true }, { code: 'cur_power', value: 155 }, { code: 'add_ele', value: 2500 }]);
      if (dev[2] === '/specifications') return ok({ status: [{ code: 'cur_power', values: '{"unit":"W","scale":1}' }, { code: 'add_ele', values: '{"unit":"kW·h","scale":3}' }] });
      if (dev[2] === '/commands') return ok(true);
      return ok({ online: true });
    }
    throw new Error('unexpected ' + path);
  },
});

const start = async () => {
  resetTuyaTokenCache();
  const calls = [];
  const samples = [];
  const db = {
    getSession: async (id) => id === 'session-a' || id === 'session-b' ? { id, userId: id.slice(-1) } : null,
    getUserById: async (id) => id === 'a' || id === 'b' ? { id } : null,
    saveEnergySample: async (userId, provider, deviceId, counterKWh) => { samples.push({ userId, provider, deviceId, counterKWh }); },
    saveEnergyDelta: async () => {},
  };
  const http = fakeHttp({ uidA: 'devA1', uidB: 'devB1' }, calls);
  const links = { a: 'uidA', b: 'uidB' };
  const app = express();
  app.use(express.json());
  app.use('/api/integrations/tuya', createAuthenticate(db), createTuyaRouter(db, {
    projectConfigured: () => true,
    resolve: (userId) => links[userId] ? new TuyaIntegration('cid', 'sec', links[userId], { http }) : null,
  }));
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/integrations/tuya`;
  const auth = (user) => ({ Authorization: `Bearer ${jwt.sign({ sub: user, purpose: 'access' }, env.jwtSecret, { expiresIn: '1h', jwtid: `session-${user}`, issuer: 'wattstatus', audience: 'wattstatus-api', algorithm: 'HS256' })}`, 'Content-Type': 'application/json' });
  const call = async (path, user, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: auth(user), body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  return { call, calls, samples, close: () => new Promise((resolve) => server.close(resolve)) };
};

test('status reports the link without exposing keys or uid', async () => {
  const t = await start();
  try {
    const res = await t.call('/status', 'a');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { provider: 'tuya', projectConfigured: true, linked: true, method: 'server-link' });
    assert.ok(!JSON.stringify(res.body).includes('uidA'));
  } finally { await t.close(); }
});

test('overview normalizes readings and stores the energy counter', async () => {
  const t = await start();
  try {
    const res = await t.call('/overview', 'a');
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    const { device, status } = res.body.items[0];
    assert.equal(device.id, 'devA1');
    assert.deepEqual(device.capabilities, ['switch', 'powerMeter']);
    assert.equal(status.state.switch, 'on');
    assert.equal(status.state.powerW, 15.5);
    assert.equal(status.state.energyKWh, 2.5);
    assert.deepEqual(t.samples, [{ userId: 'a', provider: 'tuya', deviceId: 'devA1', counterKWh: 2.5 }]);
  } finally { await t.close(); }
});

test('devices stay within each linked account and ids are validated', async () => {
  const t = await start();
  try {
    assert.equal((await t.call('/devices', 'a')).body.devices[0].id, 'devA1');
    assert.equal((await t.call('/devices', 'b')).body.devices[0].id, 'devB1');
    // User b must not read or command a's device.
    assert.equal((await t.call('/devices/devA1/status', 'b')).status, 404);
    assert.equal((await t.call('/devices/devA1/commands', 'b', 'POST', { capability: 'switch', command: 'off' })).status, 404);
    assert.equal((await t.call('/devices/..%2Fx/status', 'a')).status, 400);
    assert.ok(!t.calls.some((c) => c.url.includes('/devices/devA1') && c.method === 'POST'));
  } finally { await t.close(); }
});

test('commands accept only the power switch', async () => {
  const t = await start();
  try {
    const ok = await t.call('/devices/devA1/commands', 'a', 'POST', { capability: 'switch', command: 'off' });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.result, { ok: true });
    const sent = t.calls.find((c) => c.method === 'POST');
    assert.deepEqual(JSON.parse(sent.data), { commands: [{ code: 'switch_1', value: false }] });
    assert.equal((await t.call('/devices/devA1/commands', 'a', 'POST', { capability: 'switchLevel', command: 'setLevel', arguments: [50] })).status, 400);
  } finally { await t.close(); }
});

test('unlinked users and disabled projects get a clear error', async () => {
  const t = await start();
  try {
    const res = await t.call('/devices', 'c');
    assert.equal(res.status, 401);
  } finally { await t.close(); }
  const db = { getSession: async () => ({ id: 's', userId: 'z' }), getUserById: async () => ({ id: 'z' }) };
  const app = express();
  app.use('/t', createAuthenticate(db), createTuyaRouter(db, { projectConfigured: () => false }));
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const token = jwt.sign({ sub: 'z', purpose: 'access' }, env.jwtSecret, { expiresIn: '1h', jwtid: 's', issuer: 'wattstatus', audience: 'wattstatus-api', algorithm: 'HS256' });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/t/status`, { headers: { Authorization: `Bearer ${token}` } });
    assert.deepEqual(await res.json(), { provider: 'tuya', projectConfigured: false, linked: false, method: null });
    const devices = await fetch(`http://127.0.0.1:${server.address().port}/t/devices`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(devices.status, 503);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
