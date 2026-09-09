const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { createApp } = require("../dist/app");
const { IntegrationManager } = require("../dist/modules/integrations/integration-manager");
const { SmartThingsIntegration } = require("../dist/modules/integrations/providers/smartthings");
const { MongoDatabase } = require("../dist/storage/mongo-db");
const {
  runWithLogContext,
  sanitizeForLog,
} = require("../dist/logging/logger");
const { env } = require("../dist/config/env");

const captureLogs = async (action) => {
  const lines = [];
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  process.stdout.write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  try {
    await action();
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
  return lines.join("");
};

test("sanitiza credenciais em campos e strings", () => {
  const sanitized = sanitizeForLog({
    password: "visible-password",
    authorization: "Bearer visible-authorization",
    smartThingsToken: "visible-smartthings-token",
    nested: {
      message: "request failed with Bearer visible-bearer",
      url: "mongodb://db-user:db-password@localhost/wattstatus",
    },
  });
  const serialized = JSON.stringify(sanitized);
  for (const secret of [
    "visible-password",
    "visible-authorization",
    "visible-smartthings-token",
    "visible-bearer",
    "db-password",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("instrumenta HTTP, autenticação, validação, SmartThings, MongoDB e relatórios sem vazar secrets", async () => {
  const password = "NeverLogThisPassword!";
  const passwordHash = await bcrypt.hash(password, 4);
  const user = {
    id: "user-test-123",
    name: "Test User",
    email: "test@example.invalid",
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  let failAppliances = false;
  const db = {
    getUserByEmail: async (email) => (email === user.email ? user : null),
    getUserById: async (id) => (id === user.id ? user : null),
    addUser: async (record) => record,
    listAppliances: async () => {
      if (failAppliances) throw new Error("private database diagnostic");
      return [];
    },
    getIntegrationToken: async () => null,
    saveIntegrationToken: async () => undefined,
    deleteIntegrationToken: async () => undefined,
    getIntegrationUsage: async () => [],
    saveIntegrationUsage: async () => undefined,
    getIntegrationUsageHistory: async () => [],
    getUserSettings: async () => ({ userId: user.id }),
    updateUserSettings: async (_id, input) => ({ userId: user.id, ...input }),
  };

  const fakeIntegration = {
    id: "smartthings",
    name: "Samsung SmartThings",
    vendor: "Samsung",
    isConfigured: () => true,
    setToken: () => undefined,
    listDevices: async () => [{ id: "tv-1", name: "TV", brand: "Samsung" }],
    getDeviceStatus: async (deviceId) => ({ id: deviceId, online: true, raw: {} }),
    executeCommand: async () => ({ ok: true }),
  };
  const manager = new IntegrationManager();
  manager.register(fakeIntegration);
  const server = http.createServer(createApp({ db, integrationManager: manager }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const authToken = jwt.sign({ sub: user.id }, env.jwtSecret, { expiresIn: "1h" });

  const logs = await captureLogs(async () => {
    const health = await fetch(`${base}/api/health`, {
      headers: { "X-Request-Id": "support-case-123" },
    });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-request-id"), "support-case-123");

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password }),
    });
    assert.equal(login.status, 200);

    const refused = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "wrong-password" }),
    });
    assert.equal(refused.status, 401);

    const unauthorized = await fetch(`${base}/api/calculations/appliance`, { method: "POST" });
    assert.equal(unauthorized.status, 401);

    const invalid = await fetch(`${base}/api/calculations/appliance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ power: -1 }),
    });
    assert.equal(invalid.status, 400);

    const devices = await fetch(`${base}/api/integrations/smartthings/devices`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(devices.status, 200);

    const command = await fetch(`${base}/api/integrations/smartthings/devices/tv-1/commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ capability: "switch", command: "off" }),
    });
    assert.equal(command.status, 200);

    const report = await fetch(`${base}/api/reports/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ event: "generation_completed", itemCount: 1, durationMs: 12 }),
    });
    assert.equal(report.status, 204);

    failAppliances = true;
    const internal = await fetch(`${base}/api/appliances`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(internal.status, 500);
    assert.deepEqual(await internal.json(), { error: "Erro interno do servidor" });

    await runWithLogContext({ requestId: "smartthings-test", userId: user.id }, async () => {
      const integration = new SmartThingsIntegration("NeverLogThisSmartThingsToken");
      integration.client = {
        get: async () => ({ data: { items: [] } }),
        post: async () => ({ data: { accepted: true } }),
      };
      await integration.listDevices();
      await integration.getDeviceStatus("tv-success");
      await integration.executeCommand("tv-success", { capability: "switch", command: "on" });

      integration.client = {
        get: async () => {
          const error = new Error("timeout with Bearer NeverLogThisBearer");
          error.code = "ETIMEDOUT";
          throw error;
        },
      };
      await assert.rejects(() => integration.getDeviceStatus("tv-timeout"));

      integration.client = {
        get: async () => {
          const error = new Error("device unavailable");
          error.response = { status: 404 };
          throw error;
        },
      };
      await assert.rejects(() => integration.getDeviceStatus("tv-offline"));
    });

    const mongo = new MongoDatabase("mongodb://localhost:27017", "test-db");
    mongo.client.connect = async () => {
      throw new Error("database failed at mongodb://user:NeverLogThisMongoPassword@localhost/db");
    };
    await assert.rejects(() => mongo.init());
  });

  await new Promise((resolve) => server.close(resolve));

  for (const event of [
    "http.request_completed",
    "auth.login_succeeded",
    "auth.login_refused",
    "auth.unauthorized_access",
    "validation.request_invalid",
    "report.generation_completed",
    "internal.request_failed",
    "smartthings.devices_query_succeeded",
    "smartthings.device_status_query_succeeded",
    "smartthings.device_command_succeeded",
    "smartthings.device_status_query_failed",
    "smartthings.consumption_query_failed",
    "mongodb.connection_failed",
  ]) {
    assert.equal(logs.includes(`\"event\":\"${event}\"`), true, `missing ${event}`);
  }
  assert.equal(logs.includes('"reason":"timeout"'), true);
  assert.equal(logs.includes('"reason":"not_found_or_offline"'), true);
  for (const secret of [
    password,
    authToken,
    "NeverLogThisSmartThingsToken",
    "NeverLogThisBearer",
    "NeverLogThisMongoPassword",
    "private database diagnostic",
  ]) {
    assert.equal(logs.includes(secret), false, `secret leaked: ${secret}`);
  }
});
