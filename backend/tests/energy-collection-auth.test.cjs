// The collection status and stats routes sit behind the app's real
// authentication: without a session both answer 401 before any query.
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = process.env.JWT_SECRET || "isolated-test-secret-with-at-least-32-characters";
process.env.APP_ORIGINS = process.env.APP_ORIGINS || "http://localhost:4411";
const { createApp } = require("../dist/app");
const { logger } = require("../dist/logging/logger");
for (const level of ["info", "warn", "error", "debug"]) logger[level] = () => {};

test("rotas de coleta exigem sessão (401 sem cookie ou com token inválido)", async () => {
  const queried = [];
  const db = new Proxy({ consumeRateLimit: async () => ({ totalHits: 1, resetTime: new Date(Date.now() + 60000) }) }, {
    get: (target, name) => target[name] ?? (async () => { queried.push(String(name)); return null; }),
  });
  const app = createApp({ db, integrationManager: { get: () => null, list: () => [] } });
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/energy`;
  try {
    for (const path of ["collection-status", "collection-stats"]) {
      assert.equal((await fetch(`${base}/${path}`)).status, 401, path);
      assert.equal((await fetch(`${base}/${path}`, { headers: { authorization: "Bearer forged.token.value" } })).status, 401, path);
    }
    assert.ok(!queried.some((name) => /energyCollection/.test(name)), "no collection query without a session");
  } finally { server.close(); }
});
