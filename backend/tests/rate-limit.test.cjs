const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
process.env.JWT_SECRET = "isolated-test-secret-with-at-least-32-characters";
process.env.APP_ORIGINS = "http://localhost:4411";
const express = require("express");
const jwt = require("jsonwebtoken");
const { createHttpLimiter } = require("../dist/middleware/security");
const { env } = require("../dist/config/env");
const { AUTH_COOKIE_NAME, JWT_AUDIENCE, JWT_ISSUER } = require("../dist/modules/auth/auth-security");
const { logger } = require("../dist/logging/logger");
for (const level of ["info", "warn", "error", "debug"]) logger[level] = () => {};

const memoryLimits = () => {
  const limits = new Map();
  return {
    limits,
    consumeRateLimit: async (scope, key, windowMs) => {
      const window = Math.floor(Date.now() / windowMs);
      const identity = `${scope}:${window}:${key}`;
      const hits = (limits.get(identity) || 0) + 1;
      limits.set(identity, hits);
      return { totalHits: hits, resetTime: new Date((window + 1) * windowMs) };
    },
  };
};
const token = (overrides = {}) => jwt.sign({ sub: "user-1", purpose: "access",
  exp: Math.floor(Date.now() / 1000) + 3600, ...overrides }, env.jwtSecret, {
  algorithm: "HS256", issuer: JWT_ISSUER, audience: JWT_AUDIENCE, jwtid: randomUUID(),
});
const LIMITS = { anonymousPerIp: 3, perSession: 5, authenticatedPerIp: 8, windowMs: 60000 };

const serve = async (db) => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(createHttpLimiter(db, LIMITS));
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (headers = {}) => fetch(`${base}/api/ping`, { headers: { "x-forwarded-for": "198.51.100.7", ...headers } });
  return { get, close: () => new Promise((resolve) => server.close(resolve)) };
};
const cookie = (value) => ({ cookie: `${AUTH_COOKIE_NAME}=${value}` });

test("vários usuários atrás do mesmo IP não dividem o limite de sessão", async () => {
  const api = await serve(memoryLimits());
  try {
    const sessions = [token(), token({ sub: "user-2" })];
    // 4 + 4 requests from one IP: above the anonymous 3/min, within each session's 5/min.
    for (const value of sessions) {
      for (let i = 0; i < 4; i++) assert.equal((await api.get(cookie(value))).status, 200);
    }
    for (let i = 0; i < 3; i++) assert.equal((await api.get()).status, 200);
    assert.equal((await api.get()).status, 429, "anonymous traffic keeps the per-IP limit");
  } finally { await api.close(); }
});

test("429 traz Retry-After e código próprio, distinto de sessão expirada", async () => {
  const api = await serve(memoryLimits());
  try {
    const value = token();
    for (let i = 0; i < 5; i++) assert.equal((await api.get(cookie(value))).status, 200);
    const refused = await api.get(cookie(value));
    assert.equal(refused.status, 429);
    assert.ok(Number(refused.headers.get("retry-after")) >= 1);
    assert.equal((await refused.json()).code, "RATE_LIMITED");
    // Another session on the same IP is unaffected.
    assert.equal((await api.get(cookie(token()))).status, 200);
  } finally { await api.close(); }
});

test("teto por IP limita quantas sessões um endereço consegue usar", async () => {
  const api = await serve(memoryLimits());
  try {
    const statuses = [];
    for (let i = 0; i < 10; i++) statuses.push((await api.get(cookie(token({ sub: `user-${i}` })))).status);
    assert.deepEqual(statuses.filter((status) => status === 429).length, 2);
  } finally { await api.close(); }
});

test("token forjado ou expirado cai no limite anônimo por IP", async () => {
  const api = await serve(memoryLimits());
  try {
    const forged = jwt.sign({ sub: "user-1", purpose: "access" }, "another-secret-with-at-least-32-characters!!", {
      expiresIn: 3600, algorithm: "HS256", issuer: JWT_ISSUER, audience: JWT_AUDIENCE, jwtid: randomUUID(),
    });
    const expired = token({ exp: Math.floor(Date.now() / 1000) - 10 });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await api.get(cookie(i % 2 ? forged : expired))).status);
    assert.deepEqual(statuses, [200, 200, 200, 429]);
  } finally { await api.close(); }
});

test("requisições simultâneas contam todas, sem perder incrementos", async () => {
  const db = memoryLimits();
  const api = await serve(db);
  try {
    const value = token();
    const results = await Promise.all(Array.from({ length: 8 }, () => api.get(cookie(value))));
    assert.equal(results.filter((res) => res.status === 200).length, 5);
    assert.equal(results.filter((res) => res.status === 429).length, 3);
  } finally { await api.close(); }
});
