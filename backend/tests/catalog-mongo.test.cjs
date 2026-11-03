const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { MongoClient } = require("mongodb");
const { MongoDatabase } = require("../dist/storage/mongo-db");
const {
  ApplianceService,
} = require("../dist/modules/appliances/appliances.service");

const uri = process.env.TEST_MONGO_URL;
if (uri && !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) {
  throw new Error("TEST_MONGO_URL deve apontar para MongoDB local isolado.");
}
test(
  "MongoDB real: catálogo, índices, seed idempotente e snapshot independente",
  { skip: !uri },
  async () => {
    const name = `wattstatus_catalog_test_${randomUUID().replaceAll("-", "")}`;
    const db = new MongoDatabase(uri, name);
    const admin = new MongoClient(uri);
    try {
      await db.init();
      await db.seedCatalog();
      await db.seedCatalog();
      const { JsonCatalogRepository } = require('../dist/modules/catalog/json-repository');
      const { catalogSeed } = require('../dist/modules/catalog/catalog.seed');
      const json = new JsonCatalogRepository(catalogSeed.devices);
      assert.equal((await db.searchCatalog({page:1,limit:12})).devices[0].source.type,'PBE');
      for (const query of [{page:1,limit:12},{page:2,limit:3},{page:1,limit:3,category:'kitchen'},{page:1,limit:12,search:'LÂMPADA LED'},{page:1,limit:2,brand:'Newmaq'},
        {page:1,limit:12,region:'BR',search:'Samsung RF29'},{page:1,limit:12,region:'US'}]) {
        assert.deepEqual(await db.searchCatalog(query), await json.searchCatalog(query));
      }
      const page = await db.searchCatalog({
        search: "LÂMPADA LED",
        page: 1,
        limit: 12,
      });
      assert.equal(page.total, 1);
      assert.equal(page.devices[0].id, "generic-led-9w");
      assert.equal(
        (await db.searchCatalog({ brand: "Newmaq", page: 1, limit: 12 })).total,
        2,
      );
      const service = new ApplianceService(db);
      const {CatalogImportService}=require('../dist/modules/catalog/import/service');
      const {readDataset}=require('../dist/modules/catalog/import/files');
      const fixture=readDataset(require('node:path').join(__dirname,'fixtures/catalog/eprel.json'));
      const manifest={...require('./fixtures/catalog/pbe.manifest.json'),provider:'EPREL',referenceUrl:'https://eprel.ec.europa.eu/'};
      assert.equal((await new CatalogImportService(db).run(fixture,manifest,false)).inserted,1);
      assert.equal((await new CatalogImportService(db).run(fixture,manifest,false)).unchanged,1);
      // Exercise the actual configured CLI only against this test's isolated database.
      const {spawnSync}=require('node:child_process');
      const runImport=flags=>spawnSync(process.execPath,['scripts/import-catalog.cjs','--file','tests/fixtures/catalog/pbe.json','--manifest','tests/fixtures/catalog/pbe.manifest.json','--configured',...flags],{
        cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8',timeout:20000,
        env:{...process.env,NODE_ENV:'test',MONGO_URL:uri,MONGO_DB_NAME:name},
      });
      const raw=admin.db(name).collection('device_catalog');
      const before=await raw.find({}).sort({id:1}).toArray();
      const planned=runImport(['--dry-run']);
      assert.equal(planned.status,0);assert.match(planned.stdout,/"dryRun": true/);
      assert.deepEqual(await raw.find({}).sort({id:1}).toArray(),before,'dry-run não escreve índices ou catálogo');
      const applied=runImport(['--apply']);
      assert.equal(applied.status,0);assert.match(applied.stdout,/"updated": 1/);
      const cycle=await service.create('catalog-test-user',{name:'Ciclo sintético',power:0,usageHours:0,days:30,tariff:'SP',tariffValue:1,
        energyProfile:{method:'PER_CYCLE',energyPerCycleKwh:.45},cyclesPerWeek:4});
      assert.ok(Math.abs(cycle.monthlyConsumption-7.8)<1e-10);
      await service.update('catalog-test-user',cycle.id,{cyclesPerMonth:12});
      const saved=(await db.listAppliances('catalog-test-user')).find(row=>row.id===cycle.id);
      assert.equal(require('../dist/modules/properties/properties.service').estimateMonthly(saved,30).consumption,5.4);
      const row = await service.create("catalog-test-user", {
        name: "Geladeira",
        power: 0,
        usageHours: 0,
        days: 30,
        tariff: "SP",
        tariffValue: 1,
        catalogDeviceId: "pbe-samsung-rf29db9950qdaz",
      });
      assert.equal(row.monthlyConsumption, 40.5);
      await admin.connect();
      const collection = admin.db(name).collection("device_catalog");
      const indexes = await collection.indexes();
      assert.ok(indexes.some((index) => index.key.id === 1 && index.unique));
      await collection.updateOne(
        { id: row.catalogDeviceId },
        { $set: { "energyProfile.value": 99 } },
      );
      await db.seedCatalog();
      assert.equal(
        (await db.getCatalogDevice(row.catalogDeviceId)).energyProfile
          .value,
        99,
      );
      assert.equal(
        (await service.update("catalog-test-user", row.id, { room: "Cozinha" }))
          .monthlyConsumption,
        40.5,
      );
      await db.seedCatalog(true);
      assert.equal(
        (await db.getCatalogDevice(row.catalogDeviceId)).energyProfile
          .value,
        40.5,
      );
    } finally {
      await db.close();
      await admin.connect();
      // Only the fresh random database owned by this test is removed.
      await admin.db(name).dropDatabase();
      await admin.close();
    }
  },
);
