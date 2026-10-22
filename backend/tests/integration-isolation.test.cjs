const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const express = require('express');
const { createIntegrationRouter } = require('../dist/modules/integrations/integration.routes');
const { IntegrationManager } = require('../dist/modules/integrations/integration-manager');
const { SmartThingsIntegration } = require('../dist/modules/integrations/providers/smartthings');
const { authenticate } = require('../dist/middleware/auth-middleware');
const { errorHandler } = require('../dist/middleware/error-handler');
const { env } = require('../dist/config/env');

test('SmartThings credentials and devices stay within each user session', async () => {
  const saved = new Map();
  const db = {
    getIntegrationToken: async (user, provider) => saved.get(`${user}:${provider}`) || null,
    saveIntegrationToken: async (user, provider, token) => saved.set(`${user}:${provider}`, token),
    deleteIntegrationToken: async (user, provider) => saved.delete(`${user}:${provider}`),
  };
  const manager = new IntegrationManager();
  manager.register(new SmartThingsIntegration(''));
  const originalAdapter = axios.defaults.adapter;
  axios.defaults.adapter = async (config) => {
    const token = String(config.headers.Authorization).replace('Bearer ', '');
    const ownDevice = token === 'token-a' ? 'device-a' : 'device-b';
    const path = config.url;
    if (path === '/devices') return { data: { items: [{ deviceId: ownDevice, name: ownDevice }] }, status: 200, statusText: 'OK', headers: {}, config };
    return { data: { deviceId: ownDevice }, status: 200, statusText: 'OK', headers: {}, config };
  };
  const app = express();
  app.use(express.json());
  app.use('/api/integrations', authenticate, createIntegrationRouter(manager, db));
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/integrations/smartthings`;
  const auth = (user) => ({ Authorization: `Bearer ${jwt.sign({ sub: user }, env.jwtSecret, { expiresIn: '1h' })}`, 'Content-Type': 'application/json' });
  const call = async (path, user, method = 'GET', body) => {
    const response = await fetch(url + path, { method, headers: auth(user), body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await call('/token', 'a', 'POST', { token: 'token-a' })).status, 200);
    assert.equal((await call('/token', 'b', 'POST', { token: 'token-b' })).status, 200);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => call('/devices', i % 2 ? 'b' : 'a')));
    results.forEach((result, i) => assert.equal(result.body.devices[0].id, i % 2 ? 'device-b' : 'device-a'));
    assert.equal((await call('/devices/device-b/status', 'a')).status, 404);
    assert.equal((await call('/devices/device-a/commands', 'b', 'POST', { capability: 'switch', command: 'on' })).status, 404);
    assert.equal((await call('/token', 'a', 'POST', { token: '' })).status, 200);
    assert.equal((await call('/devices', 'a')).status, 400);
    assert.equal((await call('/devices', 'b')).status, 200);
    const expired = jwt.sign({ sub: 'b' }, env.jwtSecret, { expiresIn: -1 });
    assert.equal((await fetch(url + '/devices', { headers: { Authorization: `Bearer ${expired}` } })).status, 401);
  } finally {
    axios.defaults.adapter = originalAdapter;
    await new Promise(resolve => server.close(resolve));
  }
});
