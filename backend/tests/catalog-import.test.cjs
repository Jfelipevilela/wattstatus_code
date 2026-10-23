const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { CatalogImportService } = require('../dist/modules/catalog/import/service');
const { readDataset, parseCsv } = require('../dist/modules/catalog/import/files');
const { decimal } = require('../dist/modules/catalog/import/normalizer');
const { providerFor, manifestSchema } = require('../dist/modules/catalog/import/providers');
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { JsonCatalogRepository } = require('../dist/modules/catalog/json-repository');
const { calculateConsumption } = require('../dist/modules/calculations/consumption');
const { matchCatalog } = require('../dist/modules/catalog/matching');
const { referenceLabel } = require('../dist/modules/catalog/reference');
const records = readDataset(path.join(__dirname, 'fixtures/catalog/pbe.json'));
const manifest = require('./fixtures/catalog/pbe.manifest.json');
const clone = value => structuredClone(value);

// Executes the actual Mongo adapter with a deterministic collection double.
function database() {
  const rows = new Map();
  const db = new MongoDatabase('mongodb://127.0.0.1:1', 'never_connect');
  const match = (row, filter) => Object.entries(filter).every(([key, value]) =>
    value && typeof value === 'object' ? ('$ne' in value ? row[key] !== value.$ne : '$all' in value ? value.$all.every(token => row[key]?.includes(token)) : false) : row[key] === value);
  const project = row => { if (!row) return null; const { _id, searchTokens, importFingerprint, ...data } = row; return clone(data); };
  db.db = { collection: () => ({
    findOne: async filter => clone([...rows.values()].find(row => match(row, filter)) || null),
    updateOne: async (filter, update) => {
      const old = rows.get(filter.id), row = clone(old || { id: filter.id });
      for (const [key, value] of Object.entries(update.$set)) {
        if (key === 'source.lastSeenAt') row.source.lastSeenAt = value; else row[key] = clone(value);
      }
      rows.set(row.id, row); return { upsertedCount: old ? 0 : 1, matchedCount: old ? 1 : 0 };
    },
    find: filter => {
      let values = [...rows.values()].filter(row => match(row, filter));
      const cursor = { sort: () => { values.sort((a,b) => a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : a.id.localeCompare(b.id)); return cursor; },
        skip: n => { values = values.slice(n); return cursor; }, limit: n => { values = values.slice(0,n); return cursor; }, toArray: async () => values.map(project) };
      return cursor;
    },
    countDocuments: async filter => [...rows.values()].filter(row => match(row, filter)).length,
    distinct: async (key, filter) => [...new Set([...rows.values()].filter(row => match(row, filter)).map(row => row[key]).filter(Boolean))],
  }) };
  return { db, rows };
}

test('PBE → normalizar → validar → Mongo adapter: 100 registros, idempotência, atualização e snapshot', async () => {
  const { db, rows } = database(); const service = new CatalogImportService(db);
  const dataset = Array.from({length:100}, (_,i) => ({...clone(records[0]), id:`fixture-${i}`, model:`SYNTHETIC-${i}`}));
  assert.equal((await service.run(dataset, manifest)).inserted, 0); assert.equal(rows.size,0);
  assert.equal((await service.run(dataset, manifest,false)).inserted,100);
  const snapshot = clone([...rows.values()][0].energyProfile);
  assert.equal((await service.run(dataset, {...manifest,retrievedAt:'2026-10-24T00:00:00.000Z'},false)).unchanged,100);
  assert.equal(rows.size,100);
  dataset[0].energyProfile.value=41;
  assert.equal((await service.run(dataset,manifest,false)).updated,1);
  assert.equal(snapshot.value,40.5);
  const json = new JsonCatalogRepository([...rows.values()].map(row => { const { searchTokens,importFingerprint,...value }=row; return value; }));
  for(const query of [{page:1,limit:12},{page:2,limit:5,search:'SYNTHETIC'},{page:1,limit:3,category:'kitchen',brand:'Samsung'},{page:1,limit:12,search:'inexistente'}]) {
    assert.deepEqual(await db.searchCatalog(query),await json.searchCatalog(query));
  }
});
test('lote inválido e duplicatas conflitantes não gravam; variantes e regiões não se misturam', async () => {
  const {db,rows}=database(); const service=new CatalogImportService(db);
  const bad=clone(records[0]); bad.energyProfile.value=-1;
  assert.equal((await service.run([records[0],bad],manifest,false)).invalid,1); assert.equal(rows.size,0);
  const conflict=clone(records[0]); conflict.energyProfile.value=41;
  assert.equal((await service.run([records[0],conflict],manifest,false)).invalid,1); assert.equal(rows.size,0);
  const a={...clone(records[0]),variant:{voltage:127}}, b={...clone(records[0]),variant:{voltage:220}};
  assert.equal((await service.run([a,b],manifest,false)).inserted,2);
  const candidates=[...rows.values()];
  assert.equal(matchCatalog(candidates,{brand:'SAMSUNG',model:a.model,region:'BR'}).length,2);
  assert.equal(matchCatalog(candidates,{brand:'SAMSUNG',model:a.model,region:'BR',voltage:127})[0].confidence,'EXACT');
  assert.equal(matchCatalog(candidates,{brand:'Samsung',model:a.model,region:'US'}).length,0);
  assert.equal(matchCatalog(candidates,{brand:'Samsung',model:'OTHER',region:'BR'}).length,0);
});
test('ENERGY STAR CSV e fabricante JSON têm ingestão real com proveniência', async () => {
  const {db,rows}=database(); const service=new CatalogImportService(db);
  const us={...manifest,provider:'ENERGY_STAR',adapter:'energystar-refrigerator-csv-v1',referenceUrl:'https://www.energystar.gov/productfinder/product/certified-residential-refrigerators/details/4049645'};
  assert.equal((await service.run(readDataset(path.join(__dirname,'fixtures/catalog/energystar.csv')),us,false)).inserted,1);
  assert.equal([...rows.values()][0].region,'US'); assert.equal([...rows.values()][0].energyProfile.value,733);
  const item=clone(records[0]); item.source.type='MANUFACTURER'; item.id='synthetic-manufacturer';
  const mf={...manifest,provider:'MANUFACTURER',manufacturer:'Synthetic fixture',referenceUrl:'https://example.invalid/specification'};
  assert.equal((await service.run([item],mf,false)).inserted,1);
  const normalized=providerFor('MANUFACTURER').normalize(item,mf);
  assert.equal(normalized.source.metrics.value,mf.referenceUrl);
  assert.throws(()=>manifestSchema.parse({...manifest,provider:'UNKNOWN'}));
  assert.throws(()=>manifestSchema.parse({...manifest,referenceUrl:'http://127.0.0.1/'}));
});
test('unidades, números locais e períodos; inválidos não entram no catálogo', () => {
  assert.equal(decimal('40,50'),40.5); assert.equal(decimal('40.50','US'),40.5); assert.equal(decimal('12.000'),12000);
  const input={power:120,usageHours:5,days:30};
  assert.equal(calculateConsumption({...input,profile:{method:'POWER_TIME'}}).consumptionKWh,18);
  for(const [period,value,expected] of [['YEAR',402,33.5],['MONTH',40.5,40.5],['DAY',1,365/12]]) {
    assert.equal(calculateConsumption({...input,profile:{method:'REFERENCE_PERIOD',value,unit:'kWh',period}}).consumptionKWh,expected);
  }
  assert.match(referenceLabel({method:'REFERENCE_PERIOD',value:402,unit:'kWh',period:'YEAR'}),/402,00 kWh\/ano.*Média mensal derivada/);
  for(const value of [-40,NaN,Infinity]) {const row=clone(records[0]);row.energyProfile.value=value;assert.throws(()=>providerFor('PBE').normalize(row,manifest));}
  for(const patch of [{unit:'W'},{period:'WEEK'},{method:'LIVE_MEASUREMENT'}]) {const row=clone(records[0]);Object.assign(row.energyProfile,patch);assert.throws(()=>providerFor('PBE').normalize(row,manifest));}
  const row=clone(records[0]); row.model='';assert.throws(()=>providerFor('PBE').normalize(row,manifest));
});

test('PBE/fabricante CSV curado: decimal, unidade composta, tensão e capacidade', () => {
  const row={id:'synthetic-ac',category:'climate',subcategory:'Ar-condicionado',brand:'SYNTHETIC',model:'SYNTHETIC',displayName:'Synthetic test only',
    region:'BR',method:'REFERENCE_PERIOD',value:'402 kWh/ano',voltage:'220 V',capacityBtuH:'12.000 BTU/h'};
  const result=providerFor('PBE').normalize(row,{...manifest,adapter:'curated-csv-v1'});
  assert.equal(result.energyProfile.value,402); assert.equal(result.energyProfile.period,'YEAR');
  assert.equal(result.variant.voltage,220);assert.equal(result.specifications.capacityBtuH,12000);
  const fridge={...clone(records[0]),energyProfile:{method:'REFERENCE_PERIOD',value:'40,5 kWh/mês'}};
  assert.equal(providerFor('PBE').normalize(fridge,manifest).energyProfile.value,40.5);
  assert.throws(()=>providerFor('PBE').normalize({...row,email:'private@example.invalid'},{...manifest,adapter:'curated-csv-v1'}));
  assert.throws(()=>providerFor('PBE').normalize({...clone(records[0]),region:'US'},manifest));
});

test('CSV seguro, generic e isolamento de métricas complementares', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x,y","linha\ncom ""aspas"""\r\n'),[{a:'x,y',b:'linha\ncom "aspas"'}]);
  for(const csv of ['a,a\n1,2','a,b\n"ab,cd','__proto__,b\n1,2','a,b\n1,2,3','a,b\n"ab"x,2']) assert.throws(()=>parseCsv(csv));
  const {catalogSeed}=require('../dist/modules/catalog/catalog.seed');
  const generic=providerFor('WATTSTATUS_GENERIC').normalize(catalogSeed.devices.find(row=>row.isGeneric),{
    ...manifest,provider:'WATTSTATUS_GENERIC',referenceUrl:'https://example.invalid/generic',numberLocale:'BR'});
  assert.equal(generic.verified,false);assert.equal(generic.source.official,false);
  const tv={...clone(records[0]),id:'synthetic-tv',category:'entertainment',subcategory:'TV',energyProfile:{method:'POWER_TIME',typicalPowerW:120,standbyPowerW:.5}};
  assert.throws(()=>providerFor('PBE').normalize(tv,manifest));
  tv.source.metrics={typicalPowerW:'https://example.invalid/manufacturer'};
  const normalized=providerFor('PBE').normalize(tv,manifest);
  assert.equal(normalized.source.metrics.typicalPowerW,'https://example.invalid/manufacturer');
  assert.equal(normalized.source.metrics.standbyPowerW,manifest.referenceUrl);
});
