// A rate limit or a transient failure must never end the session: only a 401
// does. Runs src/lib/api.ts and src/lib/query-client.ts with a mocked fetch.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const stubs = {
  '@/lib/error-toast': { notifyError: () => {} },
  '@tanstack/react-query': { QueryClient: class { constructor(options) { this.options = options; } } },
};
const cache = new Map();
const load = (relative) => {
  if (cache.has(relative)) return cache.get(relative);
  const filename = path.resolve(__dirname, '../src', relative);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/import\.meta\.env/g, '({})'); // import.meta would make Node load it as ESM
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.require = (request) => {
    if (stubs[request]) return stubs[request];
    if (request.startsWith('@/')) return load(`${request.slice(2)}.ts`);
    throw new Error(`unexpected import ${request}`);
  };
  cache.set(relative, loaded.exports);
  loaded._compile(compiled, filename);
  return loaded.exports;
};

const events = [];
globalThis.window = {
  location: { origin: 'http://127.0.0.1' },
  dispatchEvent: (event) => events.push(event.type),
};
globalThis.Event = class { constructor(type) { this.type = type; } };
const { apiRequest, ApiError, isSessionExpired } = load('lib/api.ts');
const { shouldRetry, createQueryClient } = load('lib/query-client.ts');

const respond = (status, body = {}) => async () => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const statusOf = async (status) => {
  events.length = 0;
  globalThis.fetch = respond(status, { error: 'x' });
  const error = await apiRequest('/api/appliances', { skipErrorToast: true }).catch((err) => err);
  return { error, expired: events.includes('wattstatus-session-expired') };
};

test('429, 403, 500 e 503 não encerram a sessão; 401 encerra', async () => {
  for (const status of [429, 403, 500, 503]) {
    const { error, expired } = await statusOf(status);
    assert.equal(error.status, status);
    assert.equal(expired, false, `${status} must not end the session`);
    assert.equal(isSessionExpired(error), false);
  }
  const { error, expired } = await statusOf(401);
  assert.equal(expired, true);
  assert.equal(isSessionExpired(error), true);
});

test('falha de conexão vira erro transitório (status 0), não sessão expirada', async () => {
  events.length = 0;
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  const error = await apiRequest('/api/auth/me', { skipErrorToast: true }).catch((err) => err);
  assert.equal(error.status, 0);
  assert.equal(isSessionExpired(error), false);
  assert.deepEqual(events, []);
});

test('consultas repetem apenas falhas transitórias, no máximo duas vezes', () => {
  assert.equal(shouldRetry(0, new ApiError(429, '')), true);
  assert.equal(shouldRetry(1, new ApiError(503, '')), true);
  assert.equal(shouldRetry(0, new ApiError(0, '')), true);
  assert.equal(shouldRetry(2, new ApiError(429, '')), false);
  for (const status of [400, 401, 403, 404]) assert.equal(shouldRetry(0, new ApiError(status, '')), false);
  const { queries } = createQueryClient().options.defaultOptions;
  assert.ok(queries.staleTime > 0, 'cached data is reused between pages');
  assert.ok(queries.retryDelay(1) >= 2000, 'backoff grows');
});
