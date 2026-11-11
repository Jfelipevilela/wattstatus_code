const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const {
  GroupOffService,
  groupOffSchema,
} = require("../dist/modules/appliances/group-off.service");
const {
  PropertyService,
} = require("../dist/modules/properties/properties.service");
const {
  createPropertyRouter,
} = require("../dist/modules/properties/properties.routes");
const { createAuthenticate } = require("../dist/middleware/auth-middleware");
const {
  protectMutation,
  createRequestLimiter,
  issueCsrf,
} = require("../dist/middleware/security");
const { errorHandler } = require("../dist/middleware/error-handler");
const { env } = require("../dist/config/env");
const {
  userProviderResolver,
} = require("../dist/modules/integrations/user-provider");
const {
  attachPropertyRepository,
} = require("./helpers/property-repository.cjs");

// Exercise the real Express middleware without opening a network socket.
function request(
  app,
  url,
  { headers = {}, body = "{}", method = "POST" } = {},
) {
  const { IncomingMessage, ServerResponse } = require("node:http");
  const { Socket } = require("node:net");
  return new Promise((resolve, reject) => {
    const req = new IncomingMessage(new Socket());
    req.method = method;
    req.url = url;
    req.headers = Object.fromEntries(
      Object.entries({
        ...headers,
        "content-length": String(Buffer.byteLength(body)),
      }).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const res = new ServerResponse(req);
    res.end = (chunk) => {
      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        body: chunk ? JSON.parse(String(chunk)) : null,
      });
      return res;
    };
    req.push(body);
    req.push(null);
    app.handle(req, res, reject);
  });
}

function fixture(overrides = {}, limits) {
  // The mock provider gets a gate that mirrors the batch concurrency, without spacing.
  require("../dist/modules/integrations/provider-gate").setGateLimits("mock", {
    concurrency: limits?.concurrency ?? 2,
    minIntervalMs: 0,
  });
  const propertyId = randomUUID(),
    floorId = randomUUID(),
    roomId = randomUUID();
  const records = [];
  const db = {
    listAppliances: async (user) => records.filter((a) => a.userId === user),
  };
  attachPropertyRepository(db, {
    state: {
      properties: [
        { id: propertyId, userId: "a", name: "Casa", isPrimary: true },
      ],
      floors: [
        {
          id: floorId,
          propertyId,
          userId: "a",
          name: "Térreo",
          block: "Bloco A",
        },
      ],
      rooms: [{ id: roomId, floorId, propertyId, userId: "a", name: "Sala" }],
    },
  });
  const commands = [],
    reads = [];
  const provider = {
    isConfigured: () => true,
    listDevices: async () =>
      records.map((a) => ({ id: a.integrationDeviceId })),
    getPowerOffCommands: async (d) =>
      d.id === "manual" ? [] : [{ capability: "switch", command: "off" }],
    executeCommand: async (id) => {
      commands.push(id);
      return { ok: true };
    },
    getDeviceStatus: async (id) => {
      reads.push(id);
      return { online: true, state: { switch: "off" } };
    },
    ...overrides,
  };
  const properties = new PropertyService(db);
  const service = new GroupOffService(
    properties,
    db,
    async (user) => {
      assert.equal(user, "a");
      return provider;
    },
    limits || {
      concurrency: 2,
      callMs: 50,
      batchMs: 500,
      retryMs: 1,
      maxDevices: 100,
    },
  );
  const add = (device, changes = {}) =>
    records.push({
      id: randomUUID(),
      userId: "a",
      propertyId,
      roomId,
      name: device,
      integrationProvider: "mock",
      integrationDeviceId: device,
      ...changes,
    });
  return {
    db,
    service,
    properties,
    propertyId,
    roomId,
    floorId,
    records,
    commands,
    reads,
    add,
  };
}

test("off: confirmation after retry, unconfirmed, failure and uncontrollable are independent", async () => {
  const counts = {};
  const f = fixture({
    executeCommand: async (id) => {
      if (id === "broken") throw new Error("secret provider error");
      return { ok: id !== "rejected" };
    },
    getDeviceStatus: async (id) => {
      counts[id] = (counts[id] || 0) + 1;
      if (id === "read-error") throw new Error("secret token");
      return {
        online: id !== "offline",
        state: {
          switch:
            id === "unknown"
              ? null
              : id === "late" && counts[id] === 1
                ? "on"
                : "off",
        },
      };
    },
  });
  for (const id of [
    "late",
    "unknown",
    "broken",
    "rejected",
    "offline",
    "manual",
    "read-error",
  ])
    f.add(id);
  f.add("estimate", { integrationProvider: null });
  const result = await f.service.run("a", f.propertyId, { type: "property" });
  assert.deepEqual(
    result.results.map((r) => r.outcome),
    [
      "desligado-confirmado",
      "comando-enviado-sem-confirmacao",
      "falhou",
      "falhou",
      "comando-enviado-sem-confirmacao",
      "nao-controlavel",
      "comando-enviado-sem-confirmacao",
      "nao-controlavel",
    ],
  );
  assert.equal(counts.late, 2);
  assert.equal(counts["read-error"], 2);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("off: property, floor, block and room select only owned appliances; empty and foreign scopes send nothing", async () => {
  const f = fixture();
  f.add("own");
  f.add("other", { propertyId: randomUUID() });
  f.add("foreign", { userId: "b" });
  f.add("unassigned", { roomId: null });
  for (const scope of [
    { type: "room", roomId: f.roomId },
    { type: "floor", floorId: f.floorId },
    { type: "block", block: "Bloco A" },
  ]) {
    const r = await f.service.run("a", f.propertyId, scope);
    assert.deepEqual(
      r.results.map((a) => a.name),
      ["own"],
    );
  }
  const all = await f.service.run("a", f.propertyId, { type: "property" });
  assert.deepEqual(
    all.results.map((a) => a.name),
    ["own", "unassigned"],
  );
  const before = f.commands.length;
  await assert.rejects(
    f.service.run("b", f.propertyId, { type: "property" }),
    (e) => e.status === 404,
  );
  for (const scope of [
    { type: "room", roomId: randomUUID() },
    { type: "floor", floorId: randomUUID() },
    { type: "block", block: "Bloco B" },
  ])
    await assert.rejects(
      f.service.run("a", f.propertyId, scope),
      (e) => e.status === 404,
    );
  assert.equal(f.commands.length, before);
  f.records.length = 0;
  assert.equal(
    (await f.service.run("a", f.propertyId, { type: "property" })).results
      .length,
    0,
  );
});

test("off: bounded concurrency, duplicate links, no overlapping user jobs, abort on timeout, no command retry", async () => {
  let active = 0,
    peak = 0,
    calls = 0,
    aborted = 0;
  const f = fixture({
    getDeviceStatus: async () => ({ online: true, state: { switch: null } }),
    executeCommand: async (_id, _cmd, signal) => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      return new Promise((_, reject) =>
        signal.addEventListener(
          "abort",
          () => {
            active--;
            aborted++;
            reject(new Error("timeout"));
          },
          { once: true },
        ),
      );
    },
  });
  for (const id of ["a", "a", "b", "c", "d"]) f.add(id);
  const pending = f.service.run("a", f.propertyId, { type: "property" });
  await assert.rejects(
    f.service.run("a", f.propertyId, { type: "property" }),
    (e) => e.status === 409,
  );
  const r = await pending;
  assert.ok(peak <= 2);
  assert.equal(calls, 4);
  assert.equal(aborted, 4);
  assert.ok(
    r.results.every((a) => a.outcome === "comando-enviado-sem-confirmacao"),
  );
});

test("off: batch deadline stops dispatching new commands, provider account ownership and max batch size", async () => {
  let calls = 0;
  const f = fixture(
    {
      executeCommand: async (_id, _cmd, signal) => {
        calls++;
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("timeout"))),
        );
      },
    },
    { concurrency: 1, callMs: 100, batchMs: 15, retryMs: 1, maxDevices: 100 },
  );
  f.add("a");
  f.add("b");
  const r = await f.service.run("a", f.propertyId, { type: "property" });
  assert.equal(calls, 1);
  // Devices the deadline never reached are reported as not sent, never as failed.
  assert.equal(r.results[1].outcome, "nao-enviado");
  const unowned = fixture({ listDevices: async () => [] });
  unowned.add("foreign-provider-device");
  assert.equal(
    (await unowned.service.run("a", unowned.propertyId, { type: "property" }))
      .results[0].outcome,
    "falhou",
  );
  assert.equal(unowned.commands.length, 0);
  for (let i = 0; i < 101; i++) unowned.add(String(i));
  await assert.rejects(
    unowned.service.run("a", unowned.propertyId, { type: "property" }),
    (e) => e.status === 400,
  );
});

for (const action of [null, "on", "off"]) test(`power route ${action ?? "legacy"}: authentication, validation, session binding, CSRF and distributed rate limit`, async () => {
  const f = fixture({ getPowerOnCommands: async () => [{ capability: "switch", command: "on" }], getDeviceStatus: async () => ({ online: true, state: { switch: action ?? "off" } }) });
  f.add("lamp");
  const counters = new Map();
  f.db.getSession = async (id) => ({ id, userId: id === "s-a" ? "a" : "b" });
  f.db.getUserById = async (id) => ({ id });
  f.db.consumeRateLimit = async (_scope, key) => {
    const totalHits = (counters.get(key) || 0) + 1;
    counters.set(key, totalHits);
    return { totalHits, resetTime: new Date(Date.now() + 60000) };
  };
  const app = express();
  app.use(express.json());
  app.use(protectMutation);
  app.get("/csrf", issueCsrf);
  app.use(
    "/properties",
    createAuthenticate(f.db),
    createPropertyRouter(
      f.properties,
      f.service,
      createRequestLimiter(
        f.db,
        "group-off-test",
        3,
        60000,
        (req) => req.userId,
      ),
    ),
  );
  app.use(errorHandler);
  const path = `/properties/${f.propertyId}/${action ? "power" : "power-off"}`;
  const body = action ? JSON.stringify({ action, scope: { type: "property" } }) : JSON.stringify({ type: "property" });
  const auth = (user) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt.sign({ sub: user, purpose: "access" }, env.jwtSecret, { expiresIn: "1h", jwtid: `s-${user}`, issuer: "wattstatus", audience: "wattstatus-api" })}`,
  });
  try {
    assert.equal(
      (
        await request(app, path, {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer invalid",
          },
          body: "{}",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(app, path, {
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(app, path, {
          headers: { ...auth("a"), cookie: "synthetic=1" },
          body: "{}",
        })
      ).status,
      403,
    );
    const {
      AUTH_COOKIE_NAME,
      CSRF_COOKIE_NAME,
    } = require("../dist/modules/auth/auth-security");
    const sessionCookie = `${AUTH_COOKIE_NAME}=${auth("a").Authorization.slice(7)}`;
    const csrf = await request(app, "/csrf", {
      method: "GET",
      headers: { cookie: sessionCookie },
    });
    if (action) {
      const preview = await request(app, `/properties/${f.propertyId}/power/preview`, { headers: auth("a"), body });
      assert.equal(preview.status, 200);
      assert.equal(preview.body.controllableCount, 1);
      assert.equal(f.commands.length, 0);
      assert.equal((await request(app, `/properties/${f.propertyId}/power/preview`, { headers: auth("b"), body })).status, 404);
    }
    const valid = await request(app, path, {
      headers: {
        "Content-Type": "application/json",
        cookie: `${sessionCookie}; ${CSRF_COOKIE_NAME}=${csrf.body.csrfToken}`,
        "X-CSRF-Token": csrf.body.csrfToken,
      },
      body,
    });
    assert.equal(valid.status, 200);
    assert.equal(valid.body.summary[action === "on" ? "ligado-confirmado" : "desligado-confirmado"], 1);
    assert.equal(
      (
        await request(app, path, {
          headers: auth("b"),
          body,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(app, path, {
          headers: { ...auth("a"), "X-WattStatus-User": "b" },
          body,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(app, path, {
          headers: auth("a"),
          body: '{"type":"property","deviceIds":["foreign"]}',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(app, path, {
          headers: auth("a"),
          body,
        })
      ).status,
      429,
    );
    assert.equal(f.commands.length, 1);
    assert.equal(
      groupOffSchema.safeParse({ type: "room", roomId: "invalid" }).success,
      false,
    );
  } finally {
    /* No network socket or live provider is used. */
  }
});

for (const action of ["on", "off"]) test(`real provider adapters: SmartThings + LG ${action} then fresh status`, async () => {
  const original = axios.defaults.adapter;
  const calls = [];
  const f = fixture();
  f.records.length = 0;
  f.add("st", { integrationProvider: "smartthings" });
  f.add("lg", { integrationProvider: "lg-thinq" });
  f.db.getIntegrationToken = async (user, provider) => {
    assert.equal(user, "a");
    return provider === "smartthings"
      ? "synthetic-st"
      : JSON.stringify({
          accessToken: "synthetic-lg",
          clientId: "client",
          apiKey: "key",
          countryCode: "BR",
          region: "aic",
        });
  };
  axios.defaults.adapter = async (config) => {
    calls.push({
      method: config.method,
      url: config.url,
      token: config.headers.Authorization,
      body: config.data,
    });
    const lg = config.baseURL.includes("lgthinq");
    let data;
    if (config.url === "/devices")
      data = lg
        ? { response: [{ deviceId: "lg", deviceInfo: { alias: "Ar LG" } }] }
        : {
            items: [
              {
                deviceId: "st",
                name: "TV",
                components: [{ id: "main", capabilities: [{ id: "switch" }] }],
              },
            ],
          };
    else if (config.url.endsWith("/profile"))
      data = {
        response: {
          property: {
            operation: {
              airConOperationMode: {
                mode: ["r", "w"],
                value: { w: ["POWER_OFF", "POWER_ON"] },
              },
            },
          },
        },
      };
    else if (config.url.endsWith("/state"))
      data = { response: { operation: { airConOperationMode: action === "on" ? "POWER_ON" : "POWER_OFF" } } };
    else if (config.url.endsWith("/status"))
      data = { components: { main: { switch: { switch: { value: action } } } } };
    else data = lg ? { response: {} } : {};
    return { data, status: 200, statusText: "OK", headers: {}, config };
  };
  try {
    const service = new GroupOffService(
      f.properties,
      f.db,
      userProviderResolver(f.db),
    );
    const result = await service.run("a", f.propertyId, { type: "property" }, action);
    assert.ok(
      result.results.every((r) => r.outcome === (action === "on" ? "ligado-confirmado" : "desligado-confirmado")),
    );
    const lgCommand = calls.find((c) => c.url === "/devices/lg/control");
    assert.equal(lgCommand.token, "Bearer synthetic-lg");
    assert.deepEqual(JSON.parse(lgCommand.body), {
      operation: { airConOperationMode: action === "on" ? "POWER_ON" : "POWER_OFF" },
    });
    for (const [command, state] of [
      ["/devices/lg/control", "/devices/lg/state"],
      ["/devices/st/commands", "/devices/st/status"],
    ])
      assert.ok(
        calls.findIndex((c) => c.url === state) >
          calls.findIndex((c) => c.url === command),
      );
    assert.equal(
      calls.find((c) => c.url === "/devices/st/commands").token,
      "Bearer synthetic-st",
    );
  } finally {
    axios.defaults.adapter = original;
  }
});

test("off: a timed-out acknowledgement is verified without resubmitting; every component must be off", async () => {
  const f = fixture({
    getPowerOffCommands: async () => [
      { capability: "switch", command: "off", component: "main" },
      { capability: "switch", command: "off", component: "secondary" },
    ],
    executeCommand: async () => {
      throw new Error("timeout");
    },
    readPowerState: (status, command) => status.raw[command.component],
    getDeviceStatus: async () => ({
      online: true,
      raw: { main: "off", secondary: "on" },
    }),
  });
  f.add("multi");
  assert.equal(
    (await f.service.run("a", f.propertyId, { type: "property" })).results[0]
      .outcome,
    "comando-enviado-sem-confirmacao",
  );
  const confirmed = fixture({
    executeCommand: async () => {
      throw new Error("timeout");
    },
  });
  confirmed.add("lost-ack");
  assert.equal(
    (
      await confirmed.service.run("a", confirmed.propertyId, {
        type: "property",
      })
    ).results[0].outcome,
    "desligado-confirmado",
  );
});

test("provider adapters never guess off from missing LG profiles, unrelated features or absent component state", async () => {
  const {
    LgThinQIntegration,
  } = require("../dist/modules/integrations/providers/lg-thinq");
  const {
    SmartThingsIntegration,
  } = require("../dist/modules/integrations/providers/smartthings");
  const original = axios.defaults.adapter;
  const makeLg = () =>
    new LgThinQIntegration({
      accessToken: "synthetic",
      clientId: "client",
      apiKey: "key",
      countryCode: "BR",
      region: "aic",
    });
  let profile = {};
  axios.defaults.adapter = async (config) => ({
    data: { response: profile },
    status: 200,
    headers: {},
    config,
  });
  const lg = makeLg();
  try {
    assert.deepEqual(await lg.getPowerOffCommands({ id: "lg" }), []);
    profile = {
      property: {
        display: { light: { mode: ["w"], value: { w: ["POWER_OFF"] } } },
        operation: { readOnly: { mode: ["r"], value: { w: ["POWER_OFF"] } } },
      },
    };
    assert.deepEqual(await lg.getPowerOffCommands({ id: "lg" }), []);
    assert.equal(
      lg.readPowerState(
        { raw: { operation: {} } },
        { command: "airConOperationMode" },
      ),
      null,
    );
    const st = new SmartThingsIntegration("synthetic");
    assert.equal(
      st.readPowerState(
        {
          raw: {
            components: { main: { switch: { switch: { value: "off" } } } },
          },
        },
        { component: "secondary" },
      ),
      null,
    );
    axios.defaults.adapter = async (config) => ({
      data: { results: [{ status: "FAILED" }] },
      status: 200,
      headers: {},
      config,
    });
    assert.equal(
      (
        await new SmartThingsIntegration("synthetic").executeCommand("st", {
          capability: "switch",
          command: "off",
        })
      ).ok,
      false,
    );
    axios.defaults.adapter = async (config) => {
      throw new axios.AxiosError(
        "secret authorization",
        "ERR_BAD_RESPONSE",
        config,
      );
    };
    await assert.rejects(
      makeLg().listDevices(),
      (error) => !error.message.includes("secret") && error.status === 503,
    );
  } finally {
    axios.defaults.adapter = original;
  }
});

test("LG setup/discovery uses encrypted-store boundary per user and exposes no credentials", async () => {
  const {
    createIntegrationRouter,
  } = require("../dist/modules/integrations/integration.routes");
  const {
    IntegrationManager,
  } = require("../dist/modules/integrations/integration-manager");
  const saved = new Map();
  const db = {
    saveIntegrationToken: async (user, provider, token) =>
      saved.set(`${user}:${provider}`, token),
    getIntegrationToken: async (user, provider) =>
      saved.get(`${user}:${provider}`) ?? null,
    deleteIntegrationToken: async (user, provider) =>
      saved.delete(`${user}:${provider}`),
  };
  const original = axios.defaults.adapter;
  axios.defaults.adapter = async (config) => ({
    data: {
      response: [
        {
          deviceId: config.headers.Authorization.endsWith("synthetic-a")
            ? "device-a"
            : "device-b",
          deviceInfo: { alias: "LG" },
        },
      ],
    },
    status: 200,
    headers: {},
    config,
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = req.header("test-user");
    next();
  });
  app.use(
    "/integrations",
    createIntegrationRouter(new IntegrationManager(), db),
  );
  app.use(errorHandler);
  const call = (user, suffix, body, method = "POST") =>
    request(app, `/integrations/lg-thinq/${suffix}`, {
      method,
      headers: { "Content-Type": "application/json", "test-user": user },
      body: JSON.stringify(body ?? {}),
    });
  const credentials = (user) => ({
    accessToken: `synthetic-${user}`,
    clientId: "client",
    apiKey: "key",
    countryCode: "BR",
    region: "aic",
  });
  try {
    for (const user of ["a", "b"])
      assert.equal(
        (await call(user, "token", { credentials: credentials(user) })).status,
        200,
      );
    assert.equal(
      (await call("a", "devices", null, "GET")).body.devices[0].id,
      "device-a",
    );
    assert.equal(
      (await call("b", "devices", null, "GET")).body.devices[0].id,
      "device-b",
    );
    const info = await call("a", "token", null, "GET");
    assert.equal(info.body.hasToken, true);
    assert.equal(JSON.stringify(info.body).includes("synthetic"), false);
    assert.equal(
      (
        await call("a", "token", {
          credentials: { ...credentials("a"), region: "attacker.invalid" },
        })
      ).status,
      400,
    );
    assert.equal((await call("a", "token", { credentials: null })).status, 200);
    assert.equal((await call("a", "devices", null, "GET")).status, 400);
    assert.equal((await call("b", "devices", null, "GET")).status, 200);
  } finally {
    axios.defaults.adapter = original;
  }
});

test("LG appliance linking validates the provider account and keeps energy estimated", async () => {
  const {
    ApplianceService,
  } = require("../dist/modules/appliances/appliances.service");
  const f = fixture();
  f.db.addAppliance = async (record) => {
    f.records.push(record);
    return record;
  };
  f.db.getIntegrationToken = async (user) =>
    JSON.stringify({
      accessToken: `synthetic-${user}`,
      clientId: "client",
      apiKey: "key",
      countryCode: "BR",
      region: "aic",
    });
  const original = axios.defaults.adapter;
  axios.defaults.adapter = async (config) => ({
    data: {
      response: [
        {
          deviceId: config.headers.Authorization.endsWith("synthetic-a")
            ? "device-a"
            : "device-b",
          deviceInfo: { alias: "LG" },
        },
      ],
    },
    status: 200,
    headers: {},
    config,
  });
  const service = new ApplianceService(f.db, f.properties);
  const input = {
    name: "LG da sala",
    power: 1000,
    usageHours: 1,
    days: 30,
    tariff: "SP",
    integrationProvider: "lg-thinq",
    integrationDeviceId: "device-a",
    propertyId: f.propertyId,
    roomId: f.roomId,
  };
  try {
    const appliance = await service.create("a", input);
    assert.equal(appliance.origin, "INTEGRATION");
    assert.equal(appliance.consumptionType, "ESTIMATED");
    assert.equal(appliance.measurement, undefined);
    assert.equal(appliance.propertyId, f.propertyId);
    await assert.rejects(
      service.create("b", input),
      (error) => error.status === 404,
    );
    assert.equal(f.records.length, 1);
  } finally {
    axios.defaults.adapter = original;
  }
});

for (const action of ["on", "off"]) test(`power ${action}: floor/property ownership, preview without dispatch, confirmation and foreign account`, async () => {
  const sent = [];
  const f = fixture({
    getPowerOnCommands: async d => d.id === "manual" ? [] : [{ capability: "switch", command: "on" }],
    executeCommand: async (id, command) => { sent.push([id, command.command]); return { ok: true }; },
    getDeviceStatus: async () => ({ online: true, state: { switch: action } }),
  });
  f.add("own"); f.add("unassigned", { roomId: null }); f.add("manual");
  f.add("other-user", { userId: "b" }); f.add("other-property", { propertyId: randomUUID() });
  const upperFloor = await f.properties.addFloor("a", f.propertyId, { name: "Superior", level: 1 });
  const upperRoom = await f.properties.addRoom("a", f.propertyId, { name: "Quarto", type: "bedroom", floorId: upperFloor.id });
  f.add("upstairs", { roomId: upperRoom.id });
  const preview = await f.service.run("a", f.propertyId, { type: "floor", floorId: f.floorId }, action, true);
  assert.equal(preview.controllableCount, 1); assert.equal(sent.length, 0);
  const floor = await f.service.run("a", f.propertyId, { type: "floor", floorId: f.floorId }, action);
  assert.deepEqual(floor.results.map(r => r.name), ["own", "manual"]);
  assert.equal(floor.results[0].outcome, action === "on" ? "ligado-confirmado" : "desligado-confirmado");
  const all = await f.service.run("a", f.propertyId, { type: "property" }, action);
  assert.deepEqual(all.results.map(r => r.name), ["own", "unassigned", "manual", "upstairs"]);
  assert.ok(sent.every(([,command]) => command === action));
  const before = sent.length;
  await assert.rejects(f.service.run("b", f.propertyId, { type: "property" }, action), e => e.status === 404);
  await assert.rejects(f.service.run("a", f.propertyId, { type: "floor", floorId: randomUUID() }, action), e => e.status === 404);
  assert.equal(sent.length, before);
  const foreign = fixture({ listDevices: async () => [], getPowerOnCommands: async () => [{ capability: "switch", command: "on" }] });
  foreign.add("foreign-device");
  assert.equal((await foreign.service.run("a", foreign.propertyId, { type: "property" }, action)).results[0].outcome, "falhou");
  assert.equal(foreign.commands.length, 0);
});

test("on: ambiguous timeout is not retried, offline/unknown never confirms", async () => {
  let calls = 0;
  const f = fixture({
    getPowerOnCommands: async () => [{ capability: "switch", command: "on" }],
    executeCommand: async () => { calls++; throw new Error("timeout"); },
    getDeviceStatus: async () => ({ online: false, state: { switch: "on" } }),
  });
  f.add("lamp");
  assert.equal((await f.service.run("a", f.propertyId, { type: "property" }, "on")).results[0].outcome, "comando-enviado-sem-confirmacao");
  assert.equal(calls, 1);
});


test("on: only Tuya may adapt its existing switch commands; other providers must explicitly support on", async () => {
  for (const provider of ["tuya", "mock"]) {
    let sent = [];
    const f = fixture({
      executeCommand: async (_id, command) => { sent.push(command); return { ok: true }; },
      getDeviceStatus: async () => ({ online: true, state: { switch: "on" } }),
    });
    f.add("switch", { integrationProvider: provider });
    const r = await f.service.run("a", f.propertyId, { type: "property" }, "on");
    assert.equal(r.results[0].outcome, provider === "tuya" ? "ligado-confirmado" : "nao-controlavel");
    assert.equal(sent.length, provider === "tuya" ? 1 : 0);
    if (sent.length) assert.equal(sent[0].command, "on");
  }
});

test("power schema rejects arbitrary actions, ids and additional fields", () => {
  const { groupPowerSchema } = require("../dist/modules/appliances/group-off.service");
  for (const body of [
    { action: "toggle", scope: { type: "property" } },
    { action: "on", scope: { type: "floor", floorId: "foreign" } },
    { action: "on", scope: { type: "property", deviceIds: ["foreign"] } },
    { action: "on", scope: { type: "property" }, userId: "b" },
  ]) assert.equal(groupPowerSchema.safeParse(body).success, false);
});

test("queue: dispatches every command before verifying, reports progress and caps provider load across users", async () => {
  const { setGateLimits } = require("../dist/modules/integrations/provider-gate");
  const log = [];
  let inFlight = 0, peak = 0;
  const slow = async (tag) => { inFlight++; peak = Math.max(peak, inFlight); log.push(tag); await new Promise((r) => setTimeout(r, 5)); inFlight--; };
  const f = fixture(
    {
      executeCommand: async (id) => { await slow(`cmd:${id}`); return { ok: true }; },
      getDeviceStatus: async (id) => { await slow(`read:${id}`); return { online: true, state: { switch: "off" } }; },
    },
    { concurrency: 8, callMs: 500, batchMs: 5000, retryMs: 1, maxDevices: 100 },
  );
  setGateLimits("mock", { concurrency: 3, minIntervalMs: 0 });
  for (let i = 0; i < 12; i++) f.add(`dev${i}`);
  f.add("estimate", { integrationProvider: null });
  const events = [];
  const r = await f.service.run("a", f.propertyId, { type: "property" }, "off", false, (event) => events.push(event));
  // The provider gate holds at most 3 calls in flight even with 8 workers.
  assert.ok(peak <= 3, `peak ${peak}`);
  const lastCommand = Math.max(...log.map((t, i) => (t.startsWith("cmd:") ? i : -1)));
  const firstRead = log.findIndex((t) => t.startsWith("read:"));
  assert.ok(lastCommand < firstRead, "all commands are sent before the first status read");
  assert.equal(r.summary["desligado-confirmado"], 12);
  assert.equal(events[0].type, "start");
  assert.equal(events[0].total, 13);
  assert.equal(events[0].items.find((i) => i.name === "estimate").state, "nao-controlavel");
  const states = (name) => events.filter((e) => e.type === "item" && e.applianceId === f.records.find((a) => a.name === name).id).map((e) => e.state);
  assert.deepEqual(states("dev0"), ["enviando", "conferindo", "desligado-confirmado"]);
});

test("power stream: authenticated SSE sends start, per-device progress and the final result", async () => {
  const f = fixture();
  f.add("lamp");
  f.add("tv", { integrationProvider: null });
  f.db.getSession = async (id) => ({ id, userId: id === "s-a" ? "a" : "b" });
  f.db.getUserById = async (id) => ({ id });
  const app = express();
  app.use(express.json());
  app.use(protectMutation);
  app.use("/properties", createAuthenticate(f.db), createPropertyRouter(f.properties, f.service));
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const token = (user) => jwt.sign({ sub: user, purpose: "access" }, env.jwtSecret, { expiresIn: "1h", jwtid: `s-${user}`, issuer: "wattstatus", audience: "wattstatus-api", algorithm: "HS256" });
  const post = (user, body) => fetch(`http://127.0.0.1:${server.address().port}/properties/${f.propertyId}/power/stream`, {
    method: "POST", headers: { Authorization: `Bearer ${token(user)}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    const res = await post("a", { action: "off", scope: { type: "property" } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/event-stream/);
    const events = (await res.text()).trim().split("\n\n").map((chunk) => ({
      event: chunk.match(/^event: (\w+)/m)[1], data: JSON.parse(chunk.match(/^data: (.*)$/m)[1]),
    }));
    assert.equal(events[0].event, "start");
    assert.deepEqual(events[0].data.items.map((i) => i.state).sort(), ["na-fila", "nao-controlavel"]);
    assert.deepEqual(events.filter((e) => e.event === "item").map((e) => e.data.state), ["enviando", "conferindo", "desligado-confirmado"]);
    const done = events.at(-1);
    assert.equal(done.event, "done");
    assert.equal(done.data.summary["desligado-confirmado"], 1);
    // Another account cannot drive this property, and nothing is streamed.
    const foreign = await post("b", { action: "off", scope: { type: "property" } });
    assert.equal(foreign.status, 404);
    assert.match(foreign.headers.get("content-type"), /json/);
    // Invalid input is rejected before the stream opens.
    assert.equal((await post("a", { action: "toggle", scope: { type: "property" } })).status, 400);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
