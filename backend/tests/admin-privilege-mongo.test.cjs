// Privilege escalation checks on the real app over an isolated MongoDB
// (TEST_MONGO_URL). Administrative access comes only from a server-side grant
// tied to the user id; registration does not verify e-mail ownership, so an
// e-mail address (configured, similar or declared) must never grant it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error('TEST_MONGO_URL must point to an isolated local MongoDB instance');
}
const ORIGIN = 'http://localhost:5173';
process.env.APP_ORIGINS = process.env.APP_ORIGINS || ORIGIN;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'isolated-test-secret-with-at-least-32-characters';
delete process.env.AI_ENABLED;

const ADMIN_PATHS = [
  ['GET', '/api/ai/admin/settings'],
  ['GET', '/api/ai/admin/usage'],
  ['GET', '/api/energy/collection-stats'],
];

test('privilégios administrativos: concessão no servidor, nunca por e-mail', { skip: !uri, timeout: 120000 }, async () => {
  const jwt = require('jsonwebtoken');
  const { MongoDatabase } = require('../dist/storage/mongo-db');
  const { createApp } = require('../dist/app');
  const { IntegrationManager } = require('../dist/modules/integrations/integration-manager');
  const { JWT_AUDIENCE, JWT_ISSUER } = require('../dist/modules/auth/auth-security');
  const { logger } = require('../dist/logging/logger');
  for (const level of ['info', 'warn', 'error', 'debug']) logger[level] = () => {};
  const dbName = `wattstatus_admin_${randomUUID().replaceAll('-', '')}`;
  const db = new MongoDatabase(uri, dbName);
  await db.init();
  const app = createApp({ db, integrationManager: new IntegrationManager() });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  // One cookie jar per browser.
  const client = () => {
    const jar = new Map();
    const send = async (method, path, { body, headers = {}, cookies = true } = {}) => {
      const h = new Headers({ origin: ORIGIN, ...headers });
      if (body !== undefined) h.set('content-type', 'application/json');
      if (cookies && jar.size) h.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      const res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const line of res.headers.getSetCookie()) { const [pair] = line.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
      return res;
    };
    const csrf = async () => (await (await send('GET', '/api/auth/csrf')).json()).csrfToken;
    const mutate = async (method, path, body) => send(method, path, { body, headers: { 'x-csrf-token': await csrf() } });
    const register = async (email, extra = {}) => {
      const res = await mutate('POST', '/api/auth/register', { name: 'Teste', email, password: 'uma-senha-bem-longa-de-teste', confirmPassword: 'uma-senha-bem-longa-de-teste', acceptTerms: true, ...extra });
      return { status: res.status, user: res.status === 201 ? (await res.json()).user : null };
    };
    return { send, mutate, register, jar };
  };
  const statuses = async (c, opts) => Promise.all(ADMIN_PATHS.map(async ([method, path]) => (await c.send(method, path, opts)).status));
  const flag = async (c) => (await (await c.send('GET', '/api/ai/status')).json()).admin;

  const adminEmail = `ops-${randomUUID().slice(0, 8)}@example.com`;
  // The old configuration is still present in some environments: it must grant nothing.
  process.env.AI_ADMIN_EMAILS = adminEmail;
  try {
    // Unverified registration with the configured administrative address.
    const squatter = client();
    const reg = await squatter.register(adminEmail);
    assert.equal(reg.status, 201, 'registration itself is allowed (no e-mail verification)');
    assert.deepEqual(await statuses(squatter), [403, 403, 403], 'configured e-mail alone grants nothing');
    assert.equal(await flag(squatter), false);

    // Similar addresses: case, spaces, plus tag, trailing dot, look-alike.
    for (const variant of [adminEmail.toUpperCase().replace('@EXAMPLE.COM', '@example.com'), adminEmail.replace('@', '+x@'), `${adminEmail}.`, adminEmail.replace('o', 'ο')]) {
      const c = client();
      const r = await c.register(variant);
      if (r.status !== 201) continue; // refused as invalid or duplicate: also fine
      assert.deepEqual(await statuses(c), [403, 403, 403], `similar e-mail ${variant}`);
    }

    // Common user, and client-side attempts to raise its own privilege.
    const user = client();
    const created = await user.register(`user-${randomUUID().slice(0, 8)}@example.com`, { role: 'admin', isAdmin: true, admin: true });
    assert.equal(created.status, 201);
    const stored = await db.getUserById(created.user.id);
    assert.equal(stored.role, undefined, 'register ignores privilege fields');
    assert.equal(stored.isAdmin, undefined);
    await user.mutate('PUT', '/api/user-settings', { role: 'admin', isAdmin: true, admin: true });
    await user.mutate('PUT', '/api/ai/preferences', { admin: true, role: 'admin' });
    assert.deepEqual(await statuses(user), [403, 403, 403]);
    assert.equal(await flag(user), false);
    assert.equal((await user.mutate('PUT', '/api/ai/admin/settings', { enabled: false })).status, 403);
    assert.equal(await db.isAdmin(created.user.id), false);

    // Valid administrator: server-side grant by user id (scripts/admin-grant.cjs).
    const admin = client();
    const adminUser = await admin.register(`real-admin-${randomUUID().slice(0, 8)}@example.com`);
    await db.db.collection('admin_grants').insertOne({ userId: adminUser.user.id, grantedAt: new Date(), grantedBy: 'test', reason: 'test', revokedAt: null });
    assert.deepEqual(await statuses(admin), [200, 200, 200]);
    assert.equal(await flag(admin), true);
    // CSRF still applies to administrators.
    assert.equal((await admin.send('PUT', '/api/ai/admin/settings', { body: { dailyUserBudget: 10 } })).status, 403);
    assert.equal((await admin.send('PUT', '/api/ai/admin/settings', { body: { dailyUserBudget: 10 }, headers: { 'x-csrf-token': 'forged' } })).status, 403);
    assert.equal((await admin.mutate('PUT', '/api/ai/admin/settings', { dailyUserBudget: 10 })).status, 200);

    // Between users: the grant belongs to one id; the others stay common.
    assert.deepEqual(await statuses(user), [403, 403, 403]);
    assert.deepEqual(await statuses(squatter), [403, 403, 403]);

    // Revoked grant stops working on the next request.
    await db.db.collection('admin_grants').updateOne({ userId: adminUser.user.id }, { $set: { revokedAt: new Date() } });
    assert.deepEqual(await statuses(admin), [403, 403, 403]);
    await db.db.collection('admin_grants').updateOne({ userId: adminUser.user.id }, { $set: { revokedAt: null } });

    // Invalid, expired and tampered sessions.
    const anon = client();
    assert.deepEqual(await statuses(anon), [401, 401, 401], 'no session');
    const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` }, cookies: false });
    assert.deepEqual(await statuses(anon, bearer('forged.token.value')), [401, 401, 401], 'garbage token');
    const sign = (payload, opts = {}) => jwt.sign({ sub: adminUser.user.id, purpose: 'access', ...payload }, process.env.JWT_SECRET,
      { algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE, jwtid: randomUUID(), expiresIn: 60, ...opts });
    assert.deepEqual(await statuses(anon, bearer(sign({}, { expiresIn: -10 }))), [401, 401, 401], 'expired token');
    assert.deepEqual(await statuses(anon, bearer(jwt.sign({ sub: adminUser.user.id, purpose: 'access' }, 'another-secret-with-at-least-32-characters!!', { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, jwtid: randomUUID(), expiresIn: 60 }))), [401, 401, 401], 'wrong signature');
    assert.deepEqual(await statuses(anon, bearer(sign({}))), [401, 401, 401], 'valid signature but no server session');
    // Tamper the payload of a real session token: change sub to the admin.
    const userToken = decodeURIComponent([...user.jar].find(([k]) => /token|session|auth/i.test(k))?.[1] ?? '');
    assert.equal(userToken.split('.').length, 3, 'session cookie holds a JWT');
    {
      const [h, p, s] = userToken.split('.');
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
      const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, sub: adminUser.user.id, admin: true })).toString('base64url')}.${s}`;
      assert.deepEqual(await statuses(anon, bearer(forged)), [401, 401, 401], 'tampered payload');
    }
    // Admin after logout: session revoked server-side.
    await admin.mutate('POST', '/api/auth/logout', {});
    assert.deepEqual(await statuses(admin), [401, 401, 401], 'logged out');
  } finally {
    delete process.env.AI_ADMIN_EMAILS;
    server.close();
    await db.db.dropDatabase().catch(() => {});
    await db.close();
  }
});
