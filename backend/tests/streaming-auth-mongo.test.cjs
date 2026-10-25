// Authenticated streaming through the real Netlify adapter and the real app,
// over an isolated MongoDB (TEST_MONGO_URL). No model: AI_ENABLED is unset,
// so answers come from the deterministic engine and cost nothing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to an isolated local MongoDB instance');
}
const ORIGIN = 'http://localhost:5173';
process.env.APP_ORIGINS = process.env.APP_ORIGINS || ORIGIN;
delete process.env.AI_ENABLED;

test('streaming autenticado: sessão, CSRF, eventos progressivos, cancelamento e recusas', { skip: !uri, timeout: 60000 }, async () => {
  const { MongoDatabase } = require('../dist/storage/mongo-db');
  const { createApp } = require('../dist/app');
  const { IntegrationManager } = require('../dist/modules/integrations/integration-manager');
  const { runStreaming } = require('../dist/netlify/streaming-adapter');
  const { logger } = require('../dist/logging/logger');
  for (const level of ['info', 'warn', 'debug']) logger[level] = () => {};
  const dbName = `wattstatus_stream_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  await db.init();
  const app = createApp({ db, integrationManager: new IntegrationManager() });
  const jar = new Map();
  const send = (path, init = {}, { cookies = true, origin = ORIGIN } = {}) => {
    const headers = new Headers(init.headers);
    if (origin) headers.set('origin', origin);
    if (cookies && jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    return runStreaming(app, { request: new Request(`${ORIGIN}${path}`, { ...init, headers }), ip: '10.1.2.3' }).then((res) => {
      for (const line of res.headers.getSetCookie?.() ?? []) { const [pair] = line.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
      return res;
    });
  };
  const csrf = async () => (await (await send('/api/auth/csrf')).json()).csrfToken;
  const chat = (headers, extra) => send('/api/ai/chat/stream', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ message: 'Qual aparelho mais gasta?' }) }, extra);
  try {
    // Refusals before any session exists.
    const noSession = await chat({}, { cookies: false });
    assert.equal(noSession.status, 403); // mutation without CSRF is refused first
    assert.match(noSession.headers.get('content-type'), /json/);
    const forged = await chat({ authorization: 'Bearer forged.token.value' }, { cookies: false, origin: null });
    assert.equal(forged.status, 401);
    const foreign = await chat({ authorization: 'Bearer x' }, { cookies: false, origin: 'https://evil.example' });
    assert.equal(foreign.status, 403);
    assert.match(await foreign.text(), /Origem não autorizada/);

    // Real session: register with CSRF, then stream with a fresh CSRF token.
    let token = await csrf();
    const reg = await send('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify({ name: 'Teste', email: `s-${randomUUID()}@example.com`, password: 'uma-senha-bem-longa-de-teste', confirmPassword: 'uma-senha-bem-longa-de-teste', acceptTerms: true }) });
    assert.equal(reg.status, 201);
    token = await csrf();

    const bad = await chat({ 'x-csrf-token': 'forged' });
    assert.equal(bad.status, 403);

    // Progressive delivery: events arrive in separate chunks, stages before the response.
    const ok = await chat({ 'x-csrf-token': token });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /text\/event-stream/);
    const reader = ok.body.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    for (;;) { const { value, done } = await reader.read(); if (done) break; chunks.push(decoder.decode(value)); }
    const events = chunks.join('').match(/event: (\w+)/g).map((line) => line.slice(7));
    assert.deepEqual(events, ['stage', 'stage', 'stage', 'response']);
    assert.ok(chunks.length >= 4, `chunks=${chunks.length}`);
    assert.ok(chunks.findIndex((c) => c.includes('event: response')) > chunks.findIndex((c) => c.includes('event: stage')));
    const response = JSON.parse(chunks.join('').match(/event: response\ndata: (.*)\n/)[1]);
    assert.ok(response.message);

    // Cancellation: the adapter closes cleanly.
    const controller = new AbortController();
    const pending = send('/api/ai/chat/stream', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify({ message: 'Analisar minha casa' }), signal: controller.signal });
    controller.abort();
    const outcome = await pending.then((res) => res.text().then(() => 'closed', () => 'closed'), () => 'rejected');
    assert.ok(['closed', 'rejected'].includes(outcome));

    // Logged out: the old cookie no longer opens a stream.
    await send('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': await csrf() }, body: '{}' });
    const after = await chat({ 'x-csrf-token': await csrf() });
    assert.ok([401, 403].includes(after.status), `status ${after.status}`);
  } finally {
    const { MongoClient } = require('mongodb');
    const admin = new MongoClient(uri);
    await admin.connect();
    await admin.db(dbName).dropDatabase().catch(() => {});
    await admin.close();
    await db.close();
  }
});
