// Disposable demo fixture for the landing's platform screenshots: the real
// Express app and MongoDB driver against a throwaway LOCAL database seeded
// with synthetic data. Regular (non-admin) account, random password, and the
// database is dropped on exit. Never point it at a shared or production DB.
//
// Usage (from the repo root, after `npm run build` and `npm --prefix backend run build`):
//   docker run -d --rm --name ws-landing-demo -p 127.0.0.1:27117:27017 mongo:7
//   DEMO_MONGO_URL=mongodb://127.0.0.1:27117 node scripts/landing/demo-server.cjs
// Prints the generated credentials; then run capture-screens.mjs. Type
// "quit" (or Ctrl+C) to stop and drop the database.
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const port = Number(process.env.DEMO_PORT || 4611);
const mongoUrl = process.env.DEMO_MONGO_URL || "mongodb://127.0.0.1:27117";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(mongoUrl)) {
  throw new Error("DEMO_MONGO_URL must point to an isolated local MongoDB instance");
}
const dbName = `wattstatus_landing_demo_${randomUUID().slice(0, 8)}`;

// env.ts reads these at import time, so they must be set before requiring dist/.
process.env.NODE_ENV = "test";
process.env.MONGO_URL = mongoUrl;
process.env.MONGO_DB_NAME = dbName;
process.env.JWT_SECRET = randomUUID() + randomUUID();
process.env.SMARTTHINGS_TOKEN_SECRET = randomUUID();
process.env.APP_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;
process.env.LOG_LEVEL = "error";

const root = path.resolve(__dirname, "../..");
const backend = path.join(root, "backend/dist");
const express = require(path.join(root, "backend/node_modules/express"));
const { MongoClient } = require(path.join(root, "backend/node_modules/mongodb"));
const { createApp, buildIntegrations } = require(path.join(backend, "app"));
const { MongoDatabase } = require(path.join(backend, "storage/mongo-db"));
const { AuthService } = require(path.join(backend, "modules/auth/auth.service"));
const { PropertyService } = require(path.join(backend, "modules/properties/properties.service"));
const { ApplianceService } = require(path.join(backend, "modules/appliances/appliances.service"));
const { logger } = require(path.join(backend, "logging/logger"));
for (const level of ["info", "warn", "debug"]) logger[level] = () => {};

const db = new MongoDatabase(mongoUrl, dbName);

// Room → appliances [name, watts, hours/day, measured?]. Synthetic.
const HOUSE = [
  ["Sala de estar", "living", [["Televisão", 110, 5, true], ["Ar-condicionado sala", 1400, 4, true], ["Soundbar", 40, 3, false]]],
  ["Cozinha", "kitchen", [["Geladeira", 150, 24, true], ["Micro-ondas", 1200, 0.3, false], ["Lava-louças", 1300, 1, false]]],
  ["Quarto", "bedroom", [["Ar-condicionado quarto", 1100, 6, true], ["Luminária", 9, 4, false]]],
  ["Banheiro", "bathroom", [["Chuveiro elétrico", 5500, 0.5, false]]],
  ["Escritório", "office", [["Computador", 300, 8, true], ["Monitor", 35, 8, false]]],
];

const seed = async () => {
  const auth = new AuthService(db);
  const properties = new PropertyService(db);
  const appliances = new ApplianceService(db, properties);
  const email = "demo@example.test";
  const password = `Demo-${randomUUID().slice(0, 12)}!`;
  const { user } = await auth.register({ name: "Conta Demonstração", email, password, confirmPassword: password, acceptTerms: true });
  const [property] = await properties.list(user.id);
  const devices = [];
  for (const [name, type, items] of HOUSE) {
    const room = await properties.addRoom(user.id, property.id, { name, type });
    for (const [label, power, hours, measured] of items) {
      const deviceId = measured ? `demo-device-${devices.length}` : undefined;
      if (deviceId) devices.push({ deviceId, power, hours });
      await appliances.create(user.id, {
        name: label, power, usageHours: hours, days: 30, tariff: "SP",
        propertyId: property.id, roomId: room.id,
        ...(deviceId ? { integrationProvider: "smartthings", integrationDeviceId: deviceId } : {}),
      });
    }
  }
  // 45 days of synthetic hourly readings with a daily rhythm, demo devices only.
  const end = new Date();
  end.setMinutes(0, 0, 0);
  const jobs = [];
  devices.forEach(({ deviceId, power, hours }, d) => {
    for (let h = 0; h < 45 * 24; h++) {
      const at = new Date(end.getTime() - h * 3600000);
      const hourOfDay = at.getHours();
      const active = hours >= 24 ? 0.45 : (hourOfDay >= 18 && hourOfDay < 18 + hours) || (d % 2 && hourOfDay >= 9 && hourOfDay < 9 + hours / 2) ? 0.85 : 0.03;
      const kwh = (power / 1000) * active * (0.85 + ((h * 13 + d * 7) % 10) / 33);
      jobs.push(() => db.saveEnergyDelta(user.id, "smartthings", deviceId, +kwh.toFixed(4), new Date(at.getTime() - 3600000), at));
    }
  });
  for (let i = 0; i < jobs.length; i += 100) await Promise.all(jobs.slice(i, i + 100).map((job) => job()));
  return { email, password, propertyId: property.id };
};

const start = async () => {
  await db.init();
  const account = await seed();
  const app = express();
  const dist = path.join(root, "dist");
  app.use(express.static(dist, { index: false }));
  const api = createApp({ db, integrationManager: buildIntegrations() });
  app.use((req, res, next) => (req.path.startsWith("/api/") ? api(req, res, next) : next()));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  const server = app.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ ready: true, url: `http://127.0.0.1:${port}`, dbName, ...account })));
  const shutdown = async () => {
    server.close();
    const admin = new MongoClient(mongoUrl);
    await admin.connect();
    await admin.db(dbName).dropDatabase();
    await admin.close();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.stdin.on("data", (chunk) => { if (String(chunk).trim() === "quit") void shutdown(); });
};

start().catch((error) => { console.error(error); process.exit(1); });
