// Isolated performance fixture: real Express app + real MongoDB driver against a
// throwaway local database with synthetic data. Never point it at production.
//
// Usage (from the repo root, after `npm run build` and `npm --prefix backend run build`):
//   node scripts/perf/bench-server.cjs [--rooms=20] [--port=4511] [--keep]
// Prints the seeded credentials and serves dist/ + /api on 127.0.0.1.
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const arg = (name, fallback) => {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};
const port = Number(arg("port", 4511));
const roomCount = Number(arg("rooms", 20));
const keep = process.argv.includes("--keep");
const mongoUrl = process.env.PERF_MONGO_URL || "mongodb://127.0.0.1:27017";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(mongoUrl)) {
  throw new Error("PERF_MONGO_URL must point to an isolated local MongoDB instance");
}
const dbName = `wattstatus_perf_${randomUUID().slice(0, 8)}`;

// env.ts reads these at import time, so they must be set before requiring dist/.
process.env.NODE_ENV = "test";
process.env.MONGO_URL = mongoUrl;
process.env.MONGO_DB_NAME = dbName;
process.env.JWT_SECRET = "perf-fixture-isolated-secret-with-32-characters!!";
process.env.SMARTTHINGS_TOKEN_SECRET = "perf-fixture-isolated-token-secret";
process.env.APP_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "error";

const backend = path.resolve(__dirname, "../../backend/dist");
const express = require(path.join(backend, "../node_modules/express"));
const { MongoClient } = require(path.join(backend, "../node_modules/mongodb"));
const { createApp, buildIntegrations } = require(path.join(backend, "app"));
const { MongoDatabase } = require(path.join(backend, "storage/mongo-db"));
const { AuthService } = require(path.join(backend, "modules/auth/auth.service"));
const { PropertyService } = require(path.join(backend, "modules/properties/properties.service"));
const { ApplianceService } = require(path.join(backend, "modules/appliances/appliances.service"));
const { logger } = require(path.join(backend, "logging/logger"));
for (const level of ["info", "warn", "debug"]) logger[level] = () => {};

// Counts every MongoDB command so a sequential client can attribute them per request.
const commands = { total: 0, byName: {} };
const db = new MongoDatabase(mongoUrl, dbName, { monitorCommands: true });
db.client.on("commandStarted", (event) => {
  if (["hello", "isMaster", "ping", "endSessions"].includes(event.commandName)) return;
  commands.total++;
  const key = `${event.commandName}:${event.command[event.commandName]}`;
  commands.byName[key] = (commands.byName[key] || 0) + 1;
});

const ROOM_TYPES = ["living", "kitchen", "bedroom", "bathroom", "office", "laundry", "garage", "balcony"];
const APPLIANCES = [
  ["Geladeira", 150, 24], ["Ar-condicionado", 1400, 6], ["TV", 120, 5], ["Chuveiro", 5500, 0.5],
  ["Micro-ondas", 1200, 0.3], ["Lâmpada LED", 9, 6], ["Computador", 300, 8], ["Máquina de lavar", 500, 1],
];

const seed = async (count) => {
  const auth = new AuthService(db);
  const properties = new PropertyService(db);
  const appliances = new ApplianceService(db, properties);
  const users = [];
  for (const [index, email] of ["perf-a@example.test", "perf-b@example.test"].entries()) {
    const password = "Perf-Fixture-123!";
    const { user } = await auth.register({ name: `Perf ${index}`, email, password, confirmPassword: password, acceptTerms: true });
    const [property] = await properties.list(user.id);
    let measured = 0;
    for (let room = 0; room < count; room++) {
      const created = await properties.addRoom(user.id, property.id, {
        name: `Ambiente ${room + 1}`, type: ROOM_TYPES[room % ROOM_TYPES.length],
      });
      for (let item = 0; item < 2; item++) {
        const [name, power, hours] = APPLIANCES[(room * 2 + item) % APPLIANCES.length];
        const deviceId = measured < 6 ? `perf-device-${index}-${measured++}` : undefined;
        await appliances.create(user.id, {
          name: `${name} ${room + 1}`, power, usageHours: hours, days: 30, tariff: "SP",
          propertyId: property.id, roomId: created.id,
          ...(deviceId ? { integrationProvider: "smartthings", integrationDeviceId: deviceId } : {}),
        });
      }
    }
    // 30 days of hourly delta readings for the measured devices.
    const end = new Date(); end.setMinutes(0, 0, 0);
    const jobs = [];
    for (let device = 0; device < Math.min(measured, 6); device++) {
      for (let hour = 0; hour < 30 * 24; hour++) {
        const endAt = new Date(end.getTime() - hour * 3600000);
        jobs.push(() => db.saveEnergyDelta(user.id, "smartthings", `perf-device-${index}-${device}`,
          0.05 + ((hour * 7 + device) % 11) / 100, new Date(endAt.getTime() - 3600000), endAt));
      }
    }
    for (let at = 0; at < jobs.length; at += 50) await Promise.all(jobs.slice(at, at + 50).map((job) => job()));
    users.push({ email, password, propertyId: property.id });
  }
  return users;
};

const start = async () => {
  await db.init();
  const startedAt = Date.now();
  const users = await seed(roomCount);
  const seedMs = Date.now() - startedAt;
  const app = express();
  app.get("/__perf/commands", (req, res) => {
    res.json(commands);
    if (req.query.reset) { commands.total = 0; commands.byName = {}; }
  });
  const dist = path.resolve(__dirname, "../../dist");
  app.use(express.static(dist, { maxAge: "1y", index: false, setHeaders: (res, file) => {
    if (file.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
  } }));
  // Static files first: on Netlify the CDN serves them without touching the
  // API function (and its rate limiter).
  const api = createApp({ db, integrationManager: buildIntegrations() });
  app.use((req, res, next) => (req.path.startsWith("/api/") ? api(req, res, next) : next()));
  app.get("*", (_req, res) => res.setHeader("Cache-Control", "no-cache").sendFile(path.join(dist, "index.html")));
  const server = app.listen(port, "127.0.0.1", () => {
    console.log(JSON.stringify({ ready: true, url: `http://127.0.0.1:${port}`, dbName, rooms: roomCount, seedMs, users }));
  });
  const shutdown = async () => {
    server.close();
    if (!keep) {
      const admin = new MongoClient(mongoUrl);
      await admin.connect();
      await admin.db(dbName).dropDatabase();
      await admin.close();
    }
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.stdin.on("data", (chunk) => { if (String(chunk).trim() === "quit") void shutdown(); });
};

start().catch((error) => { console.error(error); process.exit(1); });
