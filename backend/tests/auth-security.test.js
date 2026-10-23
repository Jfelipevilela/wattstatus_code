const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
process.env.JWT_SECRET = "isolated-test-secret-with-at-least-32-characters";
process.env.APP_ORIGINS = "http://localhost:4411";
const jwt = require("jsonwebtoken");
const serverless = require("serverless-http");
const { createApp } = require("../dist/app");
const { IntegrationManager } = require("../dist/modules/integrations/integration-manager");
const { registerSchema, loginSchema } = require("../dist/modules/auth/auth.schema");
const { hashPassword, verifyPassword } = require("../dist/modules/auth/password");
const { MongoDatabase } = require("../dist/storage/mongo-db");
const { env } = require("../dist/config/env");
const { AUTH_COOKIE_NAME } = require("../dist/modules/auth/auth-security");
const { logger } = require("../dist/logging/logger");
for (const level of ["info", "warn", "error", "debug"]) logger[level] = () => {};

function memoryDatabase() {
  const users = new Map();
  const sessions = new Map();
  const limits = new Map();
  return {
    users, sessions, limits,
    getUserByEmail: async email => [...users.values()].find(user => user.email.toLowerCase() === email.toLowerCase()),
    getUserById: async id => users.get(id),
    addUser: async user => {
      if ([...users.values()].some(row => row.emailCanonical === user.emailCanonical)) {
        const error = new Error("duplicate"); error.code = 11000; throw error;
      }
      users.set(user.id, user);
    },
    updatePasswordHash: async (id, old, value) => {
      const user = users.get(id); if (user.passwordHash === old) user.passwordHash = value;
    },
    addSession: async session => sessions.set(session.id, session),
    getSession: async id => {
      const session = sessions.get(id);
      return session?.expiresAt > new Date() ? session : null;
    },
    deleteSession: async id => sessions.delete(id),
    consumeRateLimit: async (scope, key, windowMs) => {
      const window = Math.floor(Date.now() / windowMs);
      const identity = `${scope}:${window}:${key}`;
      const hits = (limits.get(identity) || 0) + 1;
      limits.set(identity, hits);
      return { totalHits: hits, resetTime: new Date((window + 1) * windowMs) };
    },
    listAppliances: async () => [],
    getUserSettings: async userId => ({ userId, theme: "system", apps: [], historicalData: [] }),
    updateUserSettings: async (userId, input) => ({ userId, ...input }),
  };
}
function client(handler, ip = "192.0.2.10") {
  const cookies = new Map();
  let csrf;
  const request = async (method, route, input, options = {}) => {
    const headers = { "content-type": "application/json", ...options.headers };
    if (cookies.size) headers.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (csrf && !options.noCsrf) headers["x-csrf-token"] = csrf;
    if (options.cookie !== undefined) headers.cookie = options.cookie;
    const response = await handler({ httpMethod: method, path: route, headers,
      body: typeof input === "string" ? input : JSON.stringify(input || {}), isBase64Encoded: false,
      requestContext: { identity: { sourceIp: ip } } }, {});
    for (const [name, values] of Object.entries({ ...response.headers, ...response.multiValueHeaders })) {
      if (name.toLowerCase() !== "set-cookie") continue;
      for (const value of Array.isArray(values) ? values : [values]) {
        const pair = value.split(";")[0]; const index = pair.indexOf("=");
        const key = pair.slice(0, index); const content = pair.slice(index + 1);
        if (content) cookies.set(key, content); else cookies.delete(key);
      }
    }
    const data = response.body ? JSON.parse(response.body) : {};
    return { ...response, data };
  };
  return { request, cookies,
    refreshCsrf: async () => { const res = await request("GET", "/api/auth/csrf"); csrf = res.data.csrfToken; return res; },
  };
}
const registration = email => ({ name: "Test User", email,
  password: "Uma frase de teste segura!", confirmPassword: "Uma frase de teste segura!", acceptTerms: true });

test("schemas rejeitam operadores, espaços, senhas fracas e termos ausentes; e-mail é literal", () => {
  const input = registration(" Ana++teste@Example.com ");
  assert.equal(registerSchema.parse(input).email, "ana++teste@example.com");
  assert.equal(registerSchema.safeParse({ ...input, name: "  " }).success, false);
  assert.equal(registerSchema.safeParse({ ...input, acceptTerms: false }).success, false);
  assert.equal(registerSchema.safeParse({ ...input, password: "123456", confirmPassword: "123456" }).success, false);
  assert.equal(loginSchema.safeParse({ email: { $ne: null }, password: "123456" }).success, false);
  assert.equal(loginSchema.parse({ email: "ANA.SILVA@example.com", password: "123456" }).email, "ana.silva@example.com");
});

test("scrypt verifica toda a senha, inclusive após 72 bytes e caracteres Unicode", async () => {
  const password = "x".repeat(72) + "áA";
  const hash = await hashPassword(password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("x".repeat(72) + "áB", hash), false);
  assert.equal(await verifyPassword(password), false);
});

test("trabalho de senha tem concorrência limitada e se recupera após a rajada", async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => hashPassword("Uma frase de teste segura!")));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 2);
  assert.ok(results.filter(result => result.status === "rejected").every(result => result.reason.status === 503));
  assert.ok((await hashPassword("Uma frase de teste segura!")).startsWith("scrypt$"));
});

test("cadastro, sessão, CSRF vinculado, API autenticada e logout revogável", async () => {
  const db = memoryDatabase();
  const handler = serverless(createApp({ db, integrationManager: new IntegrationManager() }));
  const browser = client(handler);
  await browser.refreshCsrf();
  const signup = await browser.request("POST", "/api/auth/register", registration("ana+teste@example.com"));
  assert.equal(signup.statusCode, 201);
  assert.equal(signup.data.token, undefined);
  const token = browser.cookies.get(AUTH_COOKIE_NAME);
  assert.ok(token);
  const me = await browser.request("GET", "/api/auth/me");
  assert.equal(me.statusCode, 200);
  assert.equal(me.headers["cache-control"], "no-store");
  assert.equal(me.data.user.email, "ana+teste@example.com");
  assert.equal(me.data.user.passwordHash, undefined);
  assert.equal((await browser.request("POST", "/api/user-settings", {})).statusCode, 403);
  await browser.refreshCsrf();
  assert.equal((await browser.request("PUT", "/api/user-settings", { theme: "dark" })).statusCode, 200);
  assert.equal((await browser.request("POST", "/api/auth/logout", {})).statusCode, 200);
  assert.equal((await browser.request("GET", "/api/auth/me", {}, {
    headers: { authorization: `Bearer ${token}` }, cookie: "",
  })).statusCode, 401);
  await browser.refreshCsrf();
  assert.equal((await browser.request("POST", "/api/auth/login", {
    email: "ANA+TESTE@example.com", password: registration("").password,
  })).statusCode, 200);
});

test("cadastros concorrentes com e-mails equivalentes geram uma conta e conflito controlado", async () => {
  const db = memoryDatabase();
  const handler = serverless(createApp({ db, integrationManager: new IntegrationManager() }));
  const one = client(handler); const two = client(handler, "192.0.2.11");
  await Promise.all([one.refreshCsrf(), two.refreshCsrf()]);
  const responses = await Promise.all([
    one.request("POST", "/api/auth/register", registration("person@example.com")),
    two.request("POST", "/api/auth/register", registration("PERSON@example.com")),
  ]);
  assert.deepEqual(responses.map(res => res.statusCode).sort(), [201, 409]);
  assert.equal(db.users.size, 1);
});

test("consultas Mongo usam igualdade com collation, índice único parcial e TTL", async () => {
  const db = new MongoDatabase("mongodb://127.0.0.1:27017", "isolated");
  const indexes = [];
  let query;
  db.client.connect = async () => {};
  db.client.db = () => ({ collection: name => ({
    createIndex: async (fields, options) => indexes.push({ name, fields, options }),
    find: (filter, options) => {
      query = { filter, options };
      const cursor = { limit: () => cursor, maxTimeMS: () => cursor, toArray: async () => [] };
      return cursor;
    },
  }) });
  await db.init();
  await db.getUserByEmail(" Ana++Teste@Example.com ");
  assert.deepEqual(query.filter, { email: "ana++teste@example.com" });
  assert.equal(query.options.collation.strength, 2);
  assert.ok(indexes.some(index => index.name === "users" && index.fields.emailCanonical && index.options.unique));
  assert.ok(indexes.some(index => index.name === "auth_sessions" && index.options?.expireAfterSeconds === 0));
});

test("origem externa, CSRF ausente, formato inválido e JSON/corpo excessivo são recusados", async () => {
  const handler = serverless(createApp({ db: memoryDatabase(), integrationManager: new IntegrationManager() }));
  const browser = client(handler);
  assert.equal((await browser.request("POST", "/api/auth/login", {})).statusCode, 403);
  assert.equal((await browser.request("GET", "/api/auth/csrf", {}, {
    headers: { origin: "https://attacker.invalid" },
  })).statusCode, 403);
  assert.equal((await browser.request("POST", "/api/auth/login", "{", { noCsrf: true })).statusCode, 400);
  assert.equal((await browser.request("POST", "/api/auth/login", "x".repeat(110000))).statusCode, 413);
  assert.equal((await browser.request("POST", "/api/auth/login", {}, {
    headers: { "content-type": "text/plain" },
  })).statusCode, 415);
});

test("limite de tentativas é compartilhado entre instâncias e retorna Retry-After", async () => {
  const db = memoryDatabase();
  const one = client(serverless(createApp({ db, integrationManager: new IntegrationManager() })));
  const two = client(serverless(createApp({ db, integrationManager: new IntegrationManager() })));
  await Promise.all([one.refreshCsrf(), two.refreshCsrf()]);
  for (let index = 0; index < 10; index++) {
    const res = await (index % 2 ? one : two).request("POST", "/api/auth/login", { email: "none@example.com", password: {} });
    assert.equal(res.statusCode, 400);
  }
  const refused = await one.request("POST", "/api/auth/login", { email: "NONE@example.com", password: {} });
  assert.equal(refused.statusCode, 429);
  assert.ok(refused.headers["retry-after"]);
});

test("JWT inválido, conta removida, cookie duplicado e credenciais conflitantes são recusados", async () => {
  const db = memoryDatabase();
  const browser = client(serverless(createApp({ db, integrationManager: new IntegrationManager() })));
  await browser.refreshCsrf();
  await browser.request("POST", "/api/auth/register", registration("valid@example.com"));
  const token = browser.cookies.get(AUTH_COOKIE_NAME);
  assert.equal((await browser.request("GET", "/api/auth/me", {}, {
    headers: { authorization: "Bearer different" },
  })).statusCode, 401);
  assert.equal((await browser.request("GET", "/api/auth/me", {}, {
    cookie: `${AUTH_COOKIE_NAME}=${token}; ${AUTH_COOKIE_NAME}=${token}`,
  })).statusCode, 401);
  const foreign = jwt.sign({ sub: "unknown", purpose: "reset" }, env.jwtSecret, {
    algorithm: "HS256", issuer: "other", audience: "other", jwtid: randomUUID(), expiresIn: "1h",
  });
  assert.equal((await browser.request("GET", "/api/auth/me", {}, {
    cookie: "", headers: { authorization: `Bearer ${foreign}` },
  })).statusCode, 401);
  db.users.clear();
  assert.equal((await browser.request("GET", "/api/auth/me")).statusCode, 401);
});

test("logout limpa cookie expirado e hashes bcrypt existentes são atualizados após login", async () => {
  const bcrypt = require("bcryptjs");
  const db = memoryDatabase();
  const id = randomUUID();
  db.users.set(id, { id, name: "Legacy", email: "legacy@example.com",
    passwordHash: await bcrypt.hash("123456", 4), createdAt: new Date().toISOString() });
  const browser = client(serverless(createApp({ db, integrationManager: new IntegrationManager() })));
  await browser.refreshCsrf();
  assert.equal((await browser.request("POST", "/api/auth/login", { email: "legacy@example.com", password: "123456" })).statusCode, 200);
  assert.ok(db.users.get(id).passwordHash.startsWith("scrypt$"));
  const original = jwt.decode(browser.cookies.get(AUTH_COOKIE_NAME));
  const expired = jwt.sign({ sub: id, purpose: "access" }, env.jwtSecret, {
    expiresIn: -1, jwtid: original.jti, issuer: "wattstatus", audience: "wattstatus-api",
  });
  browser.cookies.set(AUTH_COOKIE_NAME, expired);
  await browser.refreshCsrf();
  assert.equal((await browser.request("POST", "/api/auth/logout", {})).statusCode, 200);
  assert.equal(browser.cookies.has(AUTH_COOKIE_NAME), false);
  assert.equal(db.sessions.has(original.jti), false);
});

test("falha ao revogar não apaga cookie nem informa logout concluído", async () => {
  const db = memoryDatabase();
  const browser = client(serverless(createApp({ db, integrationManager: new IntegrationManager() })));
  await browser.refreshCsrf();
  await browser.request("POST", "/api/auth/register", registration("logout-failure@example.com"));
  const token = browser.cookies.get(AUTH_COOKIE_NAME);
  await browser.refreshCsrf();
  db.deleteSession = async () => { throw new Error("isolated failure"); };
  const response = await browser.request("POST", "/api/auth/logout", {});
  assert.equal(response.statusCode, 500);
  assert.equal(browser.cookies.get(AUTH_COOKIE_NAME), token);
  assert.equal(response.data.ok, undefined);
  assert.equal(response.body.includes("isolated failure"), false);
});

test("bcrypt com limite de 72 bytes não é migrado usando sufixo não comprovado", async () => {
  const bcrypt = require("bcryptjs");
  const { AuthService } = require("../dist/modules/auth/auth.service");
  const db = memoryDatabase();
  const id = randomUUID();
  const oldHash = await bcrypt.hash("x".repeat(72) + "original", 4);
  db.users.set(id, { id, name: "Legacy Long", email: "legacy-long@example.com", passwordHash: oldHash });
  await new AuthService(db).login({ email: "legacy-long@example.com", password: "x".repeat(72) + "different" });
  assert.equal(db.users.get(id).passwordHash, oldHash);
});

test("produção recusa segredo fraco; HTML estático não carrega script terceiro", () => {
  const result = spawnSync(process.execPath, ["-e", "require('./dist/config/env')"], {
    cwd: path.resolve(__dirname, ".."), env: { ...process.env, NODE_ENV: "production", JWT_SECRET: "weak" }, encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("JWT_SECRET"));
  const cookieCheck = spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const { AUTH_COOKIE_NAME, cookieOptions } = require('./dist/modules/auth/auth-security');
    assert.equal(AUTH_COOKIE_NAME, '__Host-wattstatus_token');
    assert.equal(cookieOptions.secure, true);
    assert.equal(cookieOptions.httpOnly, true);
    assert.equal(cookieOptions.sameSite, 'lax');
    assert.equal(cookieOptions.path, '/');
    assert.equal(cookieOptions.domain, undefined);
  `], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, NODE_ENV: "production" }, encoding: "utf8" });
  assert.equal(cookieCheck.status, 0, cookieCheck.stderr);
  const html = fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");
  assert.equal(html.includes("cdn.gpteng"), false);
  const config = fs.readFileSync(path.resolve(__dirname, "../../netlify.toml"), "utf8");
  assert.ok(config.includes("frame-ancestors 'none'"));
});

test("rajada local limitada mantém leituras saudáveis enquanto recusa abuso", async () => {
  const db = memoryDatabase();
  const handler = serverless(createApp({ db, integrationManager: new IntegrationManager() }));
  const browser = client(handler);
  await browser.refreshCsrf();
  await browser.request("POST", "/api/auth/register", registration("load@example.com"));
  const startedAt = performance.now();
  const results = await Promise.all(Array.from({ length: 20 }, () => browser.request("GET", "/api/auth/me")));
  assert.ok(results.every(result => result.statusCode === 200));
  assert.equal(db.sessions.size, 1);
  console.log(JSON.stringify({ check: "local-bounded-read-burst", requests: results.length,
    durationMs: Math.round(performance.now() - startedAt), realMongo: false }));
});
