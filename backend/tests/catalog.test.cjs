const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const serverless = require("serverless-http");
process.env.JWT_SECRET = "isolated-catalog-tests-secret-with-at-least-32-chars";
const { env } = require("../dist/config/env");
const { logger } = require("../dist/logging/logger");
for (const level of ["info", "warn", "error", "debug"])
  logger[level] = () => {};
const {
  calculateConsumption,
} = require("../dist/modules/calculations/consumption");
const {
  calculateAppliance,
} = require("../dist/modules/calculations/calculation.service");
const { catalogSeed } = require("../dist/modules/catalog/catalog.seed");
const {
  catalogQuerySchema,
  catalogTokens,
  catalogSeedSchema,
} = require("../dist/modules/catalog/catalog.schema");
const { MongoDatabase } = require("../dist/storage/mongo-db");
const { createApp, buildIntegrations } = require("../dist/app");
const { attachPropertyRepository } = require("./helpers/property-repository.cjs");

function database() {
  const records = new Map(),
    tokens = new Map();
  const catalog = structuredClone(catalogSeed.devices);
  return {
    records,
    tokens,
    catalog,
    getSession: async (id) =>
      ["session-a", "session-b"].includes(id)
        ? { id, userId: id.slice(-1) }
        : null,
    getUserById: async (id) => (["a", "b"].includes(id) ? { id } : null),
    consumeRateLimit: async () => ({
      totalHits: 1,
      resetTime: new Date(Date.now() + 60000),
    }),
    getCatalogDevice: async (id) =>
      structuredClone(catalog.find((device) => device.id === id) || null),
    searchCatalog: async (query) => {
      const rows = catalog.filter(
        (device) =>
          (!query.category || device.category === query.category) &&
          (!query.brand || device.brand === query.brand) &&
          (!query.model || device.model === query.model) &&
          (!query.subcategory || device.subcategory === query.subcategory) &&
          (!query.search ||
            catalogTokens(query.search).every((token) =>
              catalogTokens(
                [device.displayName, ...device.aliases].join(" "),
              ).includes(token),
            )),
      );
      return {
        devices: rows.slice(
          (query.page - 1) * query.limit,
          query.page * query.limit,
        ),
        total: rows.length,
        page: query.page,
        limit: query.limit,
        brands: ["Genérico", "Samsung", "Newmaq"],
        subcategories: ["TV", "Geladeira", "Lavadora"],
      };
    },
    listAppliances: async (userId) =>
      [...records.values()].filter((row) => row.userId === userId),
    addAppliance: async (row) => {
      if (
        row.importKey &&
        [...records.values()].some(
          (existing) => existing.importKey === row.importKey,
        )
      )
        throw new Error("DEVICE_ALREADY_IMPORTED");
      records.set(row.id, structuredClone(row));
      return row;
    },
    updateAppliance: async (userId, row) => {
      if (records.get(row.id)?.userId !== userId) return null;
      records.set(row.id, structuredClone(row));
      return row;
    },
    deleteAppliance: async (userId, id) =>
      records.get(id)?.userId === userId ? records.delete(id) : false,
    getIntegrationToken: async (userId, provider) =>
      tokens.get(`${userId}:${provider}`) || null,
    saveEnergySample: async () => {},
  };
}
function client(db) {
  const handler = serverless(
    createApp({ db: attachPropertyRepository(db), integrationManager: buildIntegrations() }),
  );
  return async (path, { user = "a", method = "GET", body, expectedUser } = {}) => {
    const headers = { "content-type": "application/json" };
    if (expectedUser) headers["x-wattstatus-user"] = expectedUser;
    if (user)
      headers.authorization = `Bearer ${jwt.sign(
        { sub: user, purpose: "access" },
        env.jwtSecret,
        {
          expiresIn: "1h",
          jwtid: `session-${user}`,
          issuer: "wattstatus",
          audience: "wattstatus-api",
        },
      )}`;
    const response = await handler(
      {
        httpMethod: method,
        path: path.split("?")[0],
        queryStringParameters: Object.fromEntries(
          new URLSearchParams(path.split("?")[1] || ""),
        ),
        headers,
        body: JSON.stringify(body || {}),
        requestContext: { identity: { sourceIp: "192.0.2.77" } },
      },
      {},
    );
    return {
      status: response.statusCode,
      data: response.body ? JSON.parse(response.body) : null,
    };
  };
}
const base = {
  name: "TV da sala",
  power: 120,
  usageHours: 5,
  days: 30,
  tariff: "SP",
  tariffValue: 1,
};

test("métodos POWER_TIME, REFERENCE_MONTHLY, PER_CYCLE e LIVE_MEASUREMENT", () => {
  assert.equal(calculateAppliance(base).consumptionKWh, 18);
  assert.equal(
    calculateAppliance({ ...base, usageHours: 0 }).consumptionKWh,
    0,
  );
  assert.equal(
    calculateAppliance({
      ...base,
      energyProfile: { method: "REFERENCE_MONTHLY", referenceMonthlyKwh: 35.4 },
    }).consumptionKWh,
    35.4,
  );
  assert.equal(
    calculateAppliance({
      ...base,
      energyProfile: { method: "PER_CYCLE", energyPerCycleKwh: 0.5 },
      cyclesPerMonth: 12,
    }).consumptionKWh,
    6,
  );
  assert.equal(
    calculateAppliance({
      ...base,
      energyProfile: { method: "PER_CYCLE", energyPerCycleKwh: 0 },
      cyclesPerMonth: 0,
    }).consumptionKWh,
    0,
  );
  const measured = {
    profile: { method: "LIVE_MEASUREMENT" },
    counterStartKwh: 5,
    counterEndKwh: 7,
    startAt: new Date("2026-10-01T00:00:00Z"),
    endAt: new Date("2026-10-02T00:00:00Z"),
  };
  assert.deepEqual(calculateConsumption(measured), {
    consumptionKWh: 2,
    consumptionType: "METERED",
  });
  assert.throws(() => calculateConsumption({ ...measured, counterEndKwh: 4 }));
  assert.throws(() =>
    calculateConsumption({ ...measured, endAt: measured.startAt }),
  );
  for (const input of [
    { ...base, power: -1 },
    { ...base, usageHours: 25 },
    { ...base, days: 32 },
    { ...base, energyProfile: { method: "invalid" } },
    { ...base, energyProfile: { method: "REFERENCE_MONTHLY" } },
    { ...base, energyProfile: { method: "PER_CYCLE", energyPerCycleKwh: 1 } },
  ])
    assert.throws(() => calculateAppliance(input));
});

test("seed tem seis categorias, modelos reais rastreáveis e genéricos não oficiais", () => {
  assert.equal(catalogSeed.categories.length, 6);
  assert.ok(
    catalogSeed.devices.some(
      (device) => device.source.type === "PBE" && device.verified,
    ),
  );
  assert.ok(
    catalogSeed.devices
      .filter((device) => device.isGeneric)
      .every(
        (device) =>
          !device.verified && device.source.type === "WATTSTATUS_GENERIC",
      ),
  );
  assert.equal(
    catalogSeedSchema.safeParse({
      ...catalogSeed,
      devices: [...catalogSeed.devices, catalogSeed.devices[0]],
    }).success,
    false,
  );
  assert.deepEqual(catalogTokens("LÂMPADA LED + 9 W"), [
    "lampada",
    "led",
    "9",
    "w",
  ]);
});

test("catálogo autenticado: lista, busca, filtros, paginação, seleção, inexistente e injection", async () => {
  const call = client(database());
  assert.equal((await call("/api/device-catalog", { user: null })).status, 401);
  const page = await call("/api/device-catalog?limit=2");
  assert.equal(page.status, 200);
  assert.equal(page.data.devices.length, 2);
  assert.equal(page.data.categories.length, 6);
  assert.equal(
    (await call("/api/device-catalog?search=Samsung")).data.devices.length,
    1,
  );
  assert.equal(
    (
      await call(
        "/api/device-catalog?category=laundry&brand=Newmaq&model=LAVADORA%2010%2C0KG%20220V%2060HZ",
      )
    ).data.devices.length,
    1,
  );
  assert.equal(
    (await call("/api/device-catalog?search=nadaencontrado")).data.total,
    0,
  );
  assert.equal((await call("/api/device-catalog/generic-tv-50")).status, 200);
  assert.equal((await call("/api/device-catalog/missing-device")).status, 404);
  for (const query of [
    "brand[$ne]=x",
    "page=0",
    "limit=200",
    "search[$regex]=.*",
    "category[$ne]=null",
    "category=a&unknown=b",
  ]) {
    assert.equal((await call(`/api/device-catalog?${query}`)).status, 400);
  }
  assert.equal(
    catalogQuerySchema.safeParse({ brand: { $ne: null } }).success,
    false,
  );
});

test("Mongo usa tokens literais indexáveis, paginação limitada e seed idempotente sem remover dados", async () => {
  const db = new MongoDatabase("mongodb://127.0.0.1:27017", "test");
  let filter, options, writes;
  const cursor = {
    sort() {
      return this;
    },
    skip(value) {
      assert.equal(value, 12);
      return this;
    },
    limit(value) {
      assert.equal(value, 12);
      return this;
    },
    toArray: async () => [],
  };
  db.db = {
    collection: () => ({
      find: (value, opts) => {
        filter = value;
        options = opts;
        return cursor;
      },
      countDocuments: async () => 0,
      distinct: async () => [],
      bulkWrite: async (value) => {
        writes = value;
        return {};
      },
    }),
  };
  await db.searchCatalog({
    search: "TV .* Samsung",
    category: "entertainment",
    page: 2,
    limit: 12,
  });
  assert.deepEqual(filter, {
    active: { $ne: false },
    category: "entertainment",
    searchTokens: { $all: [/^tv/, /^samsung/] },
  });
  assert.equal(options.maxTimeMS, 3000);
  await db.seedCatalog();
  assert.ok(
    writes.every(
      (row) =>
        row.updateOne.upsert &&
        row.updateOne.update.$setOnInsert &&
        !row.deleteOne,
    ),
  );
  await db.seedCatalog(true);
  assert.ok(writes.every((row) => row.updateOne.update.$set));
});

test('estimativa por uso é explícita, valida potência e preserva referência e isolamento', async () => {
  const db = database();
  const call = client(db);
  const body = { ...base, catalogDeviceId: 'pbe-samsung-rf29db9950qdaz', estimateByUsage: true,
    energyProfile: { method: 'POWER_TIME', typicalPowerW: 99999, standbyPowerW: 99999 } };
  const response = await call('/api/appliances', { method: 'POST', body });
  assert.equal(response.status, 201);
  const row = response.data.appliance;
  assert.equal(row.monthlyConsumption, 18);
  assert.equal(row.estimateByUsage, true);
  assert.equal(row.energyProfile.method, 'POWER_TIME');
  assert.equal(row.energyProfile.standbyPowerW, undefined, 'não aceita métricas de catálogo forjadas');
  assert.equal(row.catalogSnapshot.energyProfile.value, 40.5);
  db.catalog.find(item => item.id === row.catalogDeviceId).energyProfile.value = 999;
  const edit = await call(`/api/appliances/${row.id}`, { method: 'PUT', body: { power: 200 } });
  assert.equal(edit.data.appliance.monthlyConsumption, 30);
  assert.equal(edit.data.appliance.estimateByUsage, true);
  const original = await call(`/api/appliances/${row.id}`, { method: 'PUT', body: { estimateByUsage: false } });
  assert.equal(original.data.appliance.monthlyConsumption, 40.5, 'retorna à referência congelada, não à atualização do catálogo');
  assert.equal(original.data.appliance.catalogSnapshot.energyProfile.value, 40.5);
  assert.equal((await call(`/api/appliances/${row.id}`, { user: 'b', method: 'PUT', body: { estimateByUsage: true } })).status, 404);
  for (const bad of [{ power: 0 }, { usageHours: 25 }, { days: 32 }, { estimateByUsage: 'true' }]) {
    assert.equal((await call('/api/appliances', { method: 'POST', body: { ...body, ...bad } })).status, 400);
  }
  const cycle = db.catalog.find(item => item.energyProfile.method === 'PER_CYCLE');
  assert.ok(cycle);
  assert.equal((await call('/api/appliances', { method: 'POST', body: { ...body, catalogDeviceId: cycle.id, cyclesPerMonth: 4 } })).status, 400);
  assert.equal((await call('/api/appliances', { method: 'POST', body: { ...base, estimateByUsage: true } })).status, 400);
  const withPower = structuredClone(db.catalog.find(item => item.id === body.catalogDeviceId));
  withPower.id = 'fixture-reference-with-power';
  withPower.profiles = [{ profile: { method: 'POWER_TIME', typicalPowerW: 80, standbyPowerW: 0.5 }, source: withPower.source }];
  db.catalog.push(withPower);
  const known = await call('/api/appliances', { method: 'POST', body: { ...base, catalogDeviceId: withPower.id,
    power: 80, usageHours: 2, days: 30, estimateByUsage: true, standbyEnabled: true } });
  assert.equal(known.status, 201);
  assert.equal(known.data.appliance.monthlyConsumption, 5.13);
  assert.equal(known.data.appliance.energyProfile.standbyPowerW, 0.5);
});

test("catálogo salva snapshot confiável, mantém legado e impede IDOR/BOLA e mass assignment", async () => {
  const db = database();
  const call = client(db);
  const stale = await call("/api/appliances", { method: "POST", body: base, expectedUser: "b" });
  assert.equal(stale.status, 409);
  assert.equal(db.records.size, 0);
  const result = await call("/api/appliances", {
    method: "POST",
    body: {
      ...base,
      catalogDeviceId: "pbe-samsung-rf29db9950qdaz",
      power: 0,
      room: "Cozinha",
      energyProfile: { method: "REFERENCE_MONTHLY", referenceMonthlyKwh: 999 },
      userId: "b",
      source: { type: "FAKE" },
    },
  });
  assert.equal(result.status, 201);
  const row = result.data.appliance;
  assert.equal(row.userId, "a");
  assert.equal(row.monthlyConsumption, 40.5);
  assert.equal(row.source.type, "PBE");
  assert.equal(row.consumptionType, "ESTIMATED");
  assert.equal(row.origin, "CATALOG");
  assert.equal(row.catalogSnapshot.energyProfile.value,40.5);
  assert.equal(row.catalogSnapshot.region,'BR');
  db.catalog.find(
    (item) => item.id === row.catalogDeviceId,
  ).energyProfile.value = 999;
  const edit = await call(`/api/appliances/${row.id}`, {
    method: "PUT",
    body: { name: "Minha geladeira" },
  });
  assert.equal(edit.data.appliance.monthlyConsumption, 40.5);
  assert.equal(edit.data.appliance.catalogSnapshot.energyProfile.value,40.5);
  assert.equal(
    (await call("/api/appliances", { user: "b" })).data.appliances.length,
    0,
  );
  assert.equal(
    (
      await call(`/api/appliances/${row.id}`, {
        user: "b",
        method: "PUT",
        body: { name: "Ataque" },
      })
    ).status,
    404,
  );
  assert.equal(
    (await call(`/api/appliances/${row.id}`, { user: "b", method: "DELETE" }))
      .status,
    404,
  );
  assert.equal(
    (
      await call("/api/appliances", {
        method: "POST",
        body: { ...base, catalogDeviceId: "missing" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("/api/appliances", {
        method: "POST",
        body: { ...base, measuredConsumptionKWh: 50 },
      })
    ).status,
    400,
  );
  for (const input of [
    { power: -1 },
    { days: 32 },
    { usageHours: 25 },
    { energyProfile: { method: "LIVE_MEASUREMENT" } },
    { integrationProvider: "arbitrary" },
    { catalogDeviceId: { $ne: null } },
    { monitoringOnly: true },
  ]) {
    assert.equal(
      (
        await call("/api/appliances", {
          method: "POST",
          body: { ...base, ...input },
        })
      ).status,
      400,
    );
  }
  const legacy = await call("/api/appliances", { method: "POST", body: base });
  assert.equal(legacy.status, 201);
  assert.equal(legacy.data.appliance.monthlyConsumption, 18);
  const old = {
    ...legacy.data.appliance,
    integrationProvider: "legacy-provider",
    integrationDeviceId: "legacy/device",
  };
  delete old.origin;
  delete old.energyProfile;
  Object.assign(old,{room:null,tariffValue:null,cyclesPerMonth:null,cyclesPerWeek:null});
  db.records.set(old.id, old);
  const oldEdit = await call(`/api/appliances/${old.id}`, {
    method: "PUT",
    body: { name: "Aparelho legado" },
  });
  assert.equal(oldEdit.status, 200);
  assert.equal(oldEdit.data.appliance.integrationDeviceId, "legacy/device");
});

test("importação usa conta autorizada e leitura real; sem energia permanece estimativa e falhas não criam aparelho", async () => {
  const db = database();
  const call = client(db);
  db.tokens.set("a:smartthings", "test-only-token");
  const original = axios.defaults.adapter;
  let energy = true,
    fail = false;
  axios.defaults.adapter = async (config) => {
    assert.equal(config.headers.Authorization, "Bearer test-only-token");
    if (fail)
      throw new axios.AxiosError(
        "timeout test-only-token",
        "ECONNABORTED",
        config,
      );
    const data =
      config.url === "/devices"
        ? {
            items: [
              { deviceId: "owned", name: "TV" },
              { deviceId: "other-owned", name: "Lamp" },
            ],
          }
        : {
            components: {
              main: energy
                ? { energyMeter: { energy: { value: 2500, unit: "Wh" } } }
                : {},
            },
          };
    return { data, status: 200, statusText: "OK", headers: {}, config };
  };
  const imported = {
    ...base,
    integrationProvider: "smartthings",
    integrationDeviceId: "owned",
    measuredConsumptionKWh: 9999,
  };
  try {
    assert.equal(
      (
        await call("/api/appliances", {
          method: "POST",
          user: "b",
          body: imported,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/api/appliances", {
          method: "POST",
          body: { ...imported, integrationDeviceId: "foreign" },
        })
      ).status,
      404,
    );
    const result = await call("/api/appliances", {
      method: "POST",
      body: imported,
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.appliance.measuredConsumptionKWh, 2.5);
    assert.equal(result.data.appliance.monthlyConsumption, 18);
    assert.equal(result.data.appliance.consumptionType, "METERED");
    assert.equal(result.data.appliance.measurement.readingType, "cumulative");
    const monitored = await call('/api/appliances', {method:'POST',body:{...imported,power:0,usageHours:0,monitoringOnly:true,integrationDeviceId:'other-owned'}});
    assert.equal(monitored.status,201);
    assert.equal(monitored.data.appliance.monthlyConsumption,null);
    assert.equal(monitored.data.appliance.monthlyCost,null);
    assert.equal(monitored.data.appliance.measurement.counterKWh,2.5);
    assert.equal((await call(`/api/appliances/${monitored.data.appliance.id}`,{method:'PUT',body:{name:'Somente medição'}})).status,200);
    await call(`/api/appliances/${monitored.data.appliance.id}`,{method:'DELETE'});
    assert.equal(
      (await call("/api/appliances", { method: "POST", body: imported }))
        .status,
      409,
    );
    energy = false;
    assert.equal((await call('/api/appliances',{method:'POST',body:{...imported,monitoringOnly:true,integrationDeviceId:'other-owned'}})).status,400);
    const retained = await call(`/api/appliances/${result.data.appliance.id}`, {
      method: "PUT",
      body: { measuredConsumptionKWh: 9999 },
    });
    assert.equal(retained.status, 200);
    assert.equal(retained.data.appliance.measuredConsumptionKWh, 2.5);
    assert.equal(retained.data.appliance.consumptionType, "METERED");
    assert.equal(
      retained.data.appliance.measurement.capturedAt,
      result.data.appliance.measurement.capturedAt,
    );
    // The new OAuth storage format must be resolved, never sent as a Bearer token.
    db.tokens.set("a:smartthings", "oauth:" + JSON.stringify({
      accessToken: "test-only-token", refreshToken: "synthetic-refresh",
      expiresAt: Date.now() + 3600000,
    }));
    const noMeter = await call("/api/appliances", {
      method: "POST",
      body: { ...imported, integrationDeviceId: "other-owned" },
    });
    assert.equal(noMeter.data.appliance.consumptionType, "ESTIMATED");
    assert.equal(noMeter.data.appliance.measurement, undefined);
    assert.equal(noMeter.data.appliance.measuredConsumptionKWh, undefined);
    fail = true;
    const before = db.records.size;
    const failed = await call("/api/appliances", {
      method: "POST",
      body: imported,
    });
    assert.equal(failed.status, 503);
    assert.equal(
      JSON.stringify(failed.data).includes("test-only-token"),
      false,
    );
    assert.equal(db.records.size, before);
  } finally {
    axios.defaults.adapter = original;
  }
});

test('SmartThings delta-only aceita monitoramento sem inventar contador e rejeita dispositivo offline', async () => {
  const db=database(); const call=client(db); db.tokens.set('a:smartthings','test-only-token');
  const original=axios.defaults.adapter; let offline=false;
  axios.defaults.adapter=async config=>({status:200,statusText:'OK',headers:{},config,
    data:config.url==='/devices'?{items:[{deviceId:'owned',name:'TV'}]}:
      config.url.endsWith('/health')?{state:offline?'OFFLINE':'ONLINE'}:
        {components:{main:{powerConsumptionReport:{powerConsumption:{value:{energy:0,deltaEnergy:2650,start:'2026-10-25T00:00:00Z',end:'2026-10-25T01:00:00Z'}}}}}}});
  const input={...base,power:0,usageHours:0,monitoringOnly:true,integrationProvider:'smartthings',integrationDeviceId:'owned'};
  try {
    const response=await call('/api/appliances',{method:'POST',body:input});
    assert.equal(response.status,201);
    assert.equal(response.data.appliance.measurement.readingType,'interval');
    assert.equal(response.data.appliance.measurement.consumptionKWh,2.65);
    assert.equal(response.data.appliance.measuredConsumptionKWh,undefined);
    assert.equal(response.data.appliance.monthlyConsumption,null);
    offline=true;
    assert.equal((await call('/api/appliances',{method:'POST',body:input})).status,503);
    assert.equal(db.records.size,1);
  } finally {axios.defaults.adapter=original;}
});

test("perfis brasileiros preservam IDs e declaram estimativas sem marcas inventadas", () => {
  const expected = {
    "generic-shower-5500w": 5500, "generic-shower-7500w": 7500,
    "generic-iron-1200w": 1200, "generic-hair-dryer-1800w": 1800,
    "generic-air-fryer-1500w": 1500, "generic-coffee-maker-800w": 800,
    "generic-oven-1800w": 1800, "generic-pool-pump-750w": 750,
    "generic-heater-1500w": 1500, "generic-fluorescent-20w": 20,
    "generic-ceiling-fan-100w": 100, "generic-router-12w": 12,
    "generic-console-150w": 150, "generic-led-9w": 9,
    "generic-microwave-1200w": 1200, "generic-tv-40": 80, "generic-tv-50": 120,
  };
  for (const [id, power] of Object.entries(expected)) {
    const row = catalogSeed.devices.find(row => row.id === id);
    assert.equal(row.energyProfile.method, "POWER_TIME");
    assert.equal(row.energyProfile.typicalPowerW, power);
    assert.equal(row.isGeneric, true);
    assert.equal(row.verified, false);
    assert.equal(row.source.type, "WATTSTATUS_GENERIC");
    assert.equal(row.region, "BR");
    assert.equal(row.model, undefined);
    assert.ok(!row.brand || row.brand === "Genérico");
  }
  for (const [id, value] of [["generic-fridge-monthly", 45], ["generic-freezer-monthly", 50]]) {
    const row = catalogSeed.devices.find(row => row.id === id);
    assert.equal(row.energyProfile.method, "REFERENCE_PERIOD");
    assert.equal(row.energyProfile.period, "MONTH");
    assert.equal(row.energyProfile.value, value);
    assert.equal(row.source.official, false);
    assert.match(row.source.reference, /não é medição nem dado oficial/);
  }
  assert.equal(catalogSeed.devices.find(row => row.id === "generic-dishwasher-cycle").energyProfile.energyPerCycleKwh, 1.2);
});

test("generic=true valida entrada, filtra, ordena e pagina no endpoint e JSON", async () => {
  const { JsonCatalogRepository } = require("../dist/modules/catalog/json-repository");
  const rows = structuredClone(catalogSeed.devices);
  // Priority differs deliberately; generic order must depend only on displayName/id.
  rows.find(row => row.id === "generic-led-9w").region = "US";
  const repository = new JsonCatalogRepository(rows);
  const db = database();
  db.searchCatalog = query => repository.searchCatalog(query);
  const call = client(db);
  const expected = rows.filter(row => row.isGeneric).sort((a,b) =>
    a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : a.id < b.id ? -1 : 1);
  const first = await call("/api/device-catalog?generic=true&limit=3");
  assert.equal(first.status, 200);
  assert.equal(first.data.total, expected.length);
  assert.deepEqual(first.data.devices.map(row => row.id), expected.slice(0,3).map(row => row.id));
  const next = await call("/api/device-catalog?generic=true&limit=3&page=2");
  assert.deepEqual(next.data.devices.map(row => row.id), expected.slice(3,6).map(row => row.id));
  const filtered = await call("/api/device-catalog?generic=true&category=kitchen&region=BR&limit=48");
  assert.ok(filtered.data.devices.every(row => row.isGeneric && row.category === "kitchen" && row.region === "BR"));
  assert.deepEqual((await call("/api/device-catalog?generic=false")).data, (await call("/api/device-catalog")).data);
  for (const value of ["1", "yes", "", "TRUE", "%24ne"]) {
    assert.equal((await call("/api/device-catalog?generic=" + value)).status, 400);
  }
});

test("Mongo generic filtra resultados e facetas e ordena por nome antes da paginação", async () => {
  const db = new MongoDatabase("mongodb://127.0.0.1:27017", "test");
  let filter, order, offset, size;
  const facets = [];
  const cursor = {
    sort(value) { order = value; return this; },
    skip(value) { offset = value; return this; },
    limit(value) { size = value; return this; },
    toArray: async () => [],
  };
  db.db = { collection: () => ({
    find(value) { filter = value; return cursor; },
    countDocuments: async value => { assert.equal(value.isGeneric, true); return 0; },
    distinct: async (_key, value) => { facets.push(value); return []; },
  }) };
  await db.searchCatalog({generic:true, category:"kitchen", page:2, limit:3});
  assert.equal(filter.isGeneric, true);
  assert.equal(filter.category, "kitchen");
  assert.deepEqual(order, {displayName:1, id:1});
  assert.equal(offset, 3);
  assert.equal(size, 3);
  assert.ok(facets.every(value => value.isGeneric === true));
});

test("quantity cria unidades independentes, limita nomes e preserva isolamento", async () => {
  const db = database(), call = client(db);
  for (const quantity of [0, 21, -1, 1.5, "2", null]) {
    assert.equal((await call("/api/appliances", {method:"POST", body:{...base, quantity}})).status, 400);
  }
  assert.equal(db.records.size, 0);
  const single = await call("/api/appliances", {method:"POST", body:base});
  assert.equal(single.data.created, 1);
  assert.deepEqual(single.data.appliances, [single.data.appliance]);
  assert.equal(single.data.appliance.name, base.name);
  const result = await call("/api/appliances", {method:"POST",
    body:{...base, name:"A".repeat(160), quantity:20, userId:"b", catalogDeviceId:"generic-led-9w"}});
  assert.equal(result.status, 201);
  assert.equal(result.data.created, 20);
  assert.deepEqual(result.data.appliance, result.data.appliances[0]);
  assert.equal(new Set(result.data.appliances.map(row => row.id)).size, 20);
  for (const [index, row] of result.data.appliances.entries()) {
    assert.ok(row.name.endsWith(" " + (index+1)));
    assert.equal(row.name.length, 160);
    assert.equal(row.userId, "a");
    assert.equal(row.quantity, undefined);
    assert.equal(db.records.get(row.id).quantity, undefined);
    assert.equal((await call("/api/appliances/" + row.id, {method:"DELETE",user:"b"})).status,404);
  }
  assert.equal((await call("/api/appliances", {user:"b"})).data.appliances.length, 0);
  const owned = result.data.appliance;
  for (const placement of [{propertyId:owned.propertyId}, {roomId:require("node:crypto").randomUUID()}]) {
    const before = db.records.size;
    assert.equal((await call("/api/appliances", {method:"POST", user:"b",body:{...base, quantity:2,...placement}})).status,404);
    assert.equal(db.records.size, before);
  }
  assert.equal((await call("/api/appliances", {method:"POST", body:{...base,quantity:2,
    integrationProvider:"smartthings",integrationDeviceId:"owned"}})).status,400);
});

test("lote valida antes de gravar e reverte inclusive escrita sem acknowledgement", async () => {
  const db = database(), call = client(db);
  const before = await call("/api/appliances", {method:"POST", user:"b", body:base});
  const original = db.addAppliance;
  let writes = 0;
  db.addAppliance = async row => {
    writes++;
    await original(row);
    if (writes === 2) throw new Error("synthetic storage failure after write");
  };
  const invalid = await call("/api/appliances", {method:"POST",body:{...base,quantity:3,
    energyProfile:{method:"PER_CYCLE",energyPerCycleKwh:1}}});
  assert.equal(invalid.status,400);
  assert.equal(writes,0);
  const failed = await call("/api/appliances", {method:"POST", body:{...base,quantity:3}});
  assert.equal(failed.status,500);
  assert.equal(writes,2);
  assert.deepEqual([...db.records.keys()], [before.data.appliance.id]);
  db.deleteAppliance = async () => { throw new Error("synthetic cleanup failure"); };
  writes = 0;
  const partial = await call("/api/appliances", {method:"POST", body:{...base,quantity:3}});
  assert.equal(partial.status,500);
  assert.equal(partial.data.code,"APPLIANCE_BATCH_ROLLBACK_FAILED");
});
