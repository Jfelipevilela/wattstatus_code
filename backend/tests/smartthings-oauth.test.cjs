const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const oauth = require('../dist/modules/integrations/smartthings-oauth');

test('OAuth state is bound to the user and expires', () => {
  const state = oauth.createState('user-a');
  assert.equal(oauth.verifyState(state, 'user-a'), true);
  assert.equal(oauth.verifyState(state, 'user-b'), false);
  assert.equal(oauth.verifyState(state + 'x', 'user-a'), false);
  assert.equal(oauth.verifyState(state, 'user-a', Date.now() + 11 * 60_000), false);
  assert.equal(oauth.verifyState('garbage', 'user-a'), false);
});

test('personal tokens pass through and fresh OAuth tokens are reused', async () => {
  const store = { value: 'pat-token', getIntegrationToken: async () => store.value, saveIntegrationToken: async () => assert.fail('must not save') };
  assert.equal(await oauth.resolveAccessToken(store, 'u'), 'pat-token');
  store.value = oauth.serializeCredentials({ accessToken: 'fresh', refreshToken: 'r', expiresAt: Date.now() + 3600_000 });
  assert.equal(await oauth.resolveAccessToken(store, 'u'), 'fresh');
});

test('expiring OAuth tokens refresh once and persist the rotated refresh token', async () => {
  const original = axios.defaults.adapter;
  let calls = 0;
  axios.defaults.adapter = async (config) => {
    calls++;
    assert.match(String(config.data), /grant_type=refresh_token/);
    assert.match(String(config.data), /refresh_token=old-refresh/);
    return { data: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 86399 }, status: 200, statusText: 'OK', headers: {}, config };
  };
  const saved = [];
  const store = {
    getIntegrationToken: async () => oauth.serializeCredentials({ accessToken: 'old', refreshToken: 'old-refresh', expiresAt: Date.now() + 1000, installedAppId: 'app-1' }),
    saveIntegrationToken: async (_u, _p, token) => { saved.push(token); },
  };
  try {
    const [a, b] = await Promise.all([oauth.resolveAccessToken(store, 'u'), oauth.resolveAccessToken(store, 'u')]);
    assert.equal(a, 'new-access');
    assert.equal(b, 'new-access');
    assert.equal(calls, 1);
    const stored = oauth.parseStoredToken(saved[0]);
    assert.equal(stored.credentials.refreshToken, 'new-refresh');
    assert.equal(stored.credentials.installedAppId, 'app-1');
  } finally { axios.defaults.adapter = original; }
});

test('a rejected refresh asks the user to reconnect', async () => {
  const original = axios.defaults.adapter;
  axios.defaults.adapter = async (config) => {
    throw new axios.AxiosError('bad', 'ERR_BAD_REQUEST', config, undefined, { data: {}, status: 401, statusText: 'x', headers: {}, config });
  };
  const store = {
    getIntegrationToken: async () => oauth.serializeCredentials({ accessToken: 'old', refreshToken: 'revoked', expiresAt: 0 }),
    saveIntegrationToken: async () => assert.fail('must not save'),
  };
  try {
    await assert.rejects(oauth.resolveAccessToken(store, 'u2'), (err) => err.status === 424 && /Token SmartThings/.test(err.message));
  } finally { axios.defaults.adapter = original; }
});
