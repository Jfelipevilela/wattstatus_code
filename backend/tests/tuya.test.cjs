const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, createHmac } = require('node:crypto');
const { signTuyaRequest, buildTuyaUrl } = require('../dist/modules/integrations/providers/tuya-signer');
const { TuyaIntegration, parseDpScales, tuyaStatusToRaw, resetTuyaTokenCache } = require('../dist/modules/integrations/providers/tuya');

test('signs business requests with sorted query and body hash', () => {
  const body = '{"commands":[]}';
  const { url, headers } = signTuyaRequest({
    clientId: 'cid', secret: 'sec', method: 'post', path: '/v1.0/x', query: { b: 2, a: 1 },
    body, accessToken: 'tok', t: '1700000000000', nonce: 'n1',
  });
  assert.equal(url, '/v1.0/x?a=1&b=2');
  const str = ['POST', createHash('sha256').update(body).digest('hex'), '', url].join('\n');
  const expected = createHmac('sha256', 'sec').update('cid' + 'tok' + '1700000000000' + 'n1' + str).digest('hex').toUpperCase();
  assert.equal(headers.sign, expected);
  assert.equal(headers.access_token, 'tok');
  assert.equal(buildTuyaUrl('/p'), '/p');
});

test('maps plug DPs using spec scales, unknown scale stays null', () => {
  const scales = parseDpScales({ status: [
    { code: 'cur_power', values: '{"unit":"W","scale":1}' },
    { code: 'add_ele', values: '{"unit":"kW·h","scale":3}' },
    { code: 'bad', values: 'not json' },
  ] });
  const raw = tuyaStatusToRaw([
    { code: 'switch_1', value: true }, { code: 'cur_power', value: 1234 }, { code: 'add_ele', value: 5678 },
  ], scales, '2026-11-10T00:00:00Z');
  assert.equal(raw.components.main.switch.switch.value, 'on');
  assert.equal(raw.components.main.powerMeter.power.value, 123.4);
  assert.equal(raw.components.main.energyMeter.energy.value, 5.678);
  const noSpec = tuyaStatusToRaw([{ code: 'cur_power', value: 1234 }], new Map());
  assert.equal(noSpec.components.main.powerMeter, undefined);
});

const fakeHttp = (routes, calls) => ({
  request: async ({ method, url, data }) => {
    calls.push({ method, url, data });
    const key = `${method} ${url.split('?')[0]}`;
    if (!(key in routes)) throw new Error('unexpected ' + key);
    return { data: routes[key] };
  },
});

test('turns a device off using its switch code and normalizes status', async () => {
  resetTuyaTokenCache();
  const calls = [];
  const http = fakeHttp({
    'GET /v1.0/token': { success: true, result: { access_token: 'AT', expire_time: 7200 } },
    'GET /v1.0/devices/abc123/status': { success: true, result: [{ code: 'switch_1', value: false }, { code: 'cur_power', value: 0 }] },
    'GET /v1.0/devices/abc123': { success: true, result: { online: true } },
    'GET /v1.0/devices/abc123/specifications': { success: true, result: { status: [{ code: 'cur_power', values: '{"unit":"W","scale":1}' }] } },
    'POST /v1.0/devices/abc123/commands': { success: true, result: true },
  }, calls);
  const tuya = new TuyaIntegration('cid', 'sec', 'uid1', { http });
  assert.deepEqual(await tuya.executeCommand('abc123', { capability: 'switch', command: 'off' }), { ok: true });
  assert.deepEqual(JSON.parse(calls.find((c) => c.method === 'POST').data), { commands: [{ code: 'switch_1', value: false }] });
  const status = await tuya.getDeviceStatus('abc123');
  assert.equal(status.state.switch, 'off');
  assert.equal(status.state.powerW, 0);
  assert.equal(calls.filter((c) => c.url.startsWith('/v1.0/token')).length, 1);
});

test('rejects unsafe ids, unsupported commands and unlinked accounts', async () => {
  const tuya = new TuyaIntegration('cid', 'sec', 'uid1', { http: fakeHttp({}, []) });
  await assert.rejects(tuya.getDeviceStatus('../x'), { status: 400 });
  await assert.rejects(tuya.executeCommand('abc', { capability: 'thermostat', command: 'set' }), { status: 400 });
  await assert.rejects(new TuyaIntegration('cid', 'sec', '').listDevices(), { status: 400 });
});

test('maps Tuya API errors without leaking payloads', async () => {
  resetTuyaTokenCache();
  const tuya = new TuyaIntegration('cid2', 'sec', 'uid1', { http: fakeHttp({
    'GET /v1.0/token': { success: true, result: { access_token: 'AT', expire_time: 7200 } },
    'GET /v1.0/users/uid1/devices': { success: false, code: 1106, msg: 'permission deny' },
  }, []) });
  await assert.rejects(tuya.listDevices(), { status: 403 });
});

test('links Tuya only from the stored per-user link, never from env or client input', async () => {
  const { createTuyaForUser } = require('../dist/modules/integrations/providers/tuya-link');
  const config = { tuyaAccessId: 'cid', tuyaAccessSecret: 'sec', tuyaRegion: 'us' };
  const store = (rows) => ({ getIntegrationToken: async (user, provider) => (provider === 'tuya' ? rows[user] ?? null : null) });
  const db = store({ 'user-a': JSON.stringify({ uid: 'uid1' }), 'user-bad': JSON.stringify({ uid: '../x' }), 'user-junk': 'not json' });
  assert.ok(await createTuyaForUser(db, 'user-a', config));
  assert.equal(await createTuyaForUser(db, 'user-b', config), null);
  assert.equal(await createTuyaForUser(db, 'user-bad', config), null);
  assert.equal(await createTuyaForUser(db, 'user-junk', config), null);
  assert.equal(await createTuyaForUser(db, 'user-a', { ...config, tuyaAccessSecret: '' }), null);
});

test('advertises power-off only for devices with a switch', async () => {
  const tuya = new TuyaIntegration('cid', 'sec', 'uid1', { http: fakeHttp({}, []) });
  assert.deepEqual(await tuya.getPowerOffCommands({ id: 'a', name: 'x', brand: 'Tuya', capabilities: ['switch', 'powerMeter'] }), [{ capability: 'switch', command: 'off' }]);
  assert.deepEqual(await tuya.getPowerOffCommands({ id: 'b', name: 'y', brand: 'Tuya', capabilities: ['powerMeter'] }), []);
});
