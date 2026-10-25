// End-to-end check of the AI chat stream through both Netlify adapters, with
// the real Express app, real auth/CSRF and a throwaway local MongoDB.
//   node scripts/perf/stream-check.cjs
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const backend = path.resolve(__dirname, "../../backend/dist");
const mongoUrl = process.env.PERF_MONGO_URL || "mongodb://127.0.0.1:27017";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(mongoUrl)) throw new Error("local MongoDB only");
const dbName = `wattstatus_perf_${randomUUID().slice(0, 8)}`;
Object.assign(process.env, { NODE_ENV: "test", MONGO_URL: mongoUrl, MONGO_DB_NAME: dbName, LOG_LEVEL: "error",
  JWT_SECRET: "perf-fixture-isolated-secret-with-32-characters!!", SMARTTHINGS_TOKEN_SECRET: "perf-fixture-isolated-token-secret",
  APP_ORIGINS: "https://wattstatus.test" });
const serverless = require(path.join(backend, "../node_modules/serverless-http"));
const { MongoClient } = require(path.join(backend, "../node_modules/mongodb"));
const { createApp, buildIntegrations } = require(path.join(backend, "app"));
const { MongoDatabase } = require(path.join(backend, "storage/mongo-db"));
const { AuthService } = require(path.join(backend, "modules/auth/auth.service"));
const { PropertyService } = require(path.join(backend, "modules/properties/properties.service"));
const { ApplianceService } = require(path.join(backend, "modules/appliances/appliances.service"));
const { runStreaming } = require(path.join(backend, "netlify/streaming-adapter"));
const { logger } = require(path.join(backend, "logging/logger"));
for (const level of ["info", "warn", "debug"]) logger[level] = () => {};

const ORIGIN = "https://wattstatus.test";
const main = async () => {
  const db = new MongoDatabase(mongoUrl, dbName);
  await db.init();
  try {
    const password = "Perf-Fixture-123!";
    const { user } = await new AuthService(db).register({ name: "Stream", email: "stream@example.test", password, confirmPassword: password, acceptTerms: true });
    const properties = new PropertyService(db);
    const [property] = await properties.list(user.id);
    await new ApplianceService(db, properties).create(user.id, { name: "Geladeira", power: 150, usageHours: 24, days: 30, tariff: "SP", propertyId: property.id });
    const app = createApp({ db, integrationManager: buildIntegrations() });
    const call = (pathname, init = {}) => runStreaming(app, { request: new Request(ORIGIN + pathname, init), ip: "203.0.113.20" });
    const cookies = new Map();
    const keep = (response) => response.headers.getSetCookie().forEach((item) => { const [pair] = item.split(";"); const at = pair.indexOf("="); cookies.set(pair.slice(0, at), pair.slice(at + 1)); });
    const cookie = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const csrf = await call("/api/auth/csrf"); keep(csrf);
    const { csrfToken } = await csrf.json();
    const headers = () => ({ "content-type": "application/json", origin: ORIGIN, cookie: cookie(), "x-csrf-token": csrfToken });
    const login = await call("/api/auth/login", { method: "POST", headers: headers(), body: JSON.stringify({ email: "stream@example.test", password }) });
    keep(login);
    if (!login.ok) throw new Error(`login ${login.status}`);
    const token2 = await call("/api/auth/csrf", { headers: { cookie: cookie() } }); keep(token2);
    const fresh = (await token2.json()).csrfToken;
    const body = JSON.stringify({ message: "Quanto vou gastar este mês?" });
    const streamHeaders = { ...headers(), "x-csrf-token": fresh };

    const started = performance.now();
    const response = await call("/api/ai/chat/stream", { method: "POST", headers: streamHeaders, body });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push({ ms: +(performance.now() - started).toFixed(1), events: (decoder.decode(value).match(/^event: \w+/gm) || []).map((e) => e.slice(7)) });
    }

    const lambda = serverless(app);
    const lambdaStarted = performance.now();
    const result = await lambda({ httpMethod: "POST", path: "/api/ai/chat/stream", headers: streamHeaders, body, isBase64Encoded: false,
      requestContext: { identity: { sourceIp: "203.0.113.20" } } }, {});
    const lambdaMs = +(performance.now() - lambdaStarted).toFixed(1);
    console.log(JSON.stringify({
      streamingAdapter: { status: response.status, contentType: response.headers.get("content-type"), chunks },
      serverlessHttp: { status: result.statusCode, bodies: 1, events: (result.body.match(/^event: \w+/gm) || []).map((e) => e.slice(7)), availableAfterMs: lambdaMs },
    }, null, 1));
  } finally {
    const admin = new MongoClient(mongoUrl);
    await admin.connect();
    await admin.db(dbName).dropDatabase();
    await admin.close();
    await db.close();
  }
};
main().catch((error) => { console.error(error); process.exit(1); });
