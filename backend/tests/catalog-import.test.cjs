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
    value && typeof value === 'object' ? ('$exists' in value ? (row[key] !== undefined) === value.$exists : '$ne' in value ? row[key] !== value.$ne : '$all' in value ? value.$all.every(token => row[key]?.some(item => token instanceof RegExp ? token.test(item) : token === item)) : false) : row[key] === value);
  const project = row => { if (!row) return null; const { _id, searchTokens, importFingerprint, catalogPriority, ...data } = row; return clone(data); };
  db.db = { collection: () => ({
    findOne: async (filter,options) => {
      const row=[...rows.values()].find(row => match(row,filter)) || null;
      if(options?.projection?.importFingerprint === 0) return project(row);
      if(row && options?.projection?.catalogPriority === 0){const {catalogPriority,...data}=row;return clone(data);}
      return clone(row);
    },
    updateOne: async (filter, update) => {
      const old = rows.get(filter.id), row = clone(old || { id: filter.id });
      if (old && !match(old, filter)) return { upsertedCount: 0, matchedCount: 0 };
      for (const [key, value] of Object.entries(update.$set)) {
        if (key === 'source.lastSeenAt') row.source.lastSeenAt = value; else row[key] = clone(value);
      }
      rows.set(row.id, row); return { upsertedCount: old ? 0 : 1, matchedCount: old ? 1 : 0 };
    },
    find: filter => {
      let values = [...rows.values()].filter(row => match(row, filter));
      const cursor = { sort: () => { values.sort((a,b) => (a.catalogPriority??4)-(b.catalogPriority??4) || (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : a.id.localeCompare(b.id))); return cursor; },
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
  const json = new JsonCatalogRepository([...rows.values()].map(row => { const { searchTokens,importFingerprint,catalogPriority,...value }=row; return value; }));
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

test('EPREL curado passa pelo pipeline, persiste e preserva região, tensão e período', async () => {
  const {db,rows}=database(); const service=new CatalogImportService(db);
  const fixture=readDataset(path.join(__dirname,'fixtures/catalog/eprel.json'));
  const eu={...manifest,provider:'EPREL',referenceUrl:'https://eprel.ec.europa.eu/'};
  assert.equal((await service.run(fixture,eu,false)).inserted,1);
  const row=[...rows.values()][0];
  assert.equal(row.region,'EU'); assert.equal(row.variant.voltage,230); assert.equal(row.energyProfile.value,204);
  assert.equal((await service.run(fixture,eu,false)).unchanged,1);
  assert.throws(()=>providerFor('EPREL').normalize({...fixture[0],region:'BR'},eu));
  assert.throws(()=>manifestSchema.parse({...eu,referenceUrl:'https://example.invalid/'}));
});

test('fontes comprovadas compõem potência e standby sem perder proveniência ou duplicar produtos', async () => {
  const {db,rows}=database(); const service=new CatalogImportService(db);
  const tv={...clone(records[0]),id:'synthetic-tv',model:'TEST-TV',category:'entertainment',subcategory:'TV',
    variant:{voltage:127},equivalence:{key:'test:tv:127',referenceUrl:'https://example.invalid/equivalence'},
    energyProfile:{method:'POWER_TIME',standbyPowerW:.5}};
  const mf={...manifest,provider:'MANUFACTURER',manufacturer:'Fixture',referenceUrl:'https://example.invalid/tv'};
  const operating={...clone(tv),id:'synthetic-operating',source:{...tv.source,type:'MANUFACTURER'},energyProfile:{method:'POWER_TIME',typicalPowerW:100}};
  assert.equal((await service.run([tv],manifest,false)).inserted,1);
  assert.equal((await service.run([operating],mf,true)).wouldUpdate,1); assert.equal(rows.size,1);
  assert.equal((await service.run([operating],mf,false)).updated,1); assert.equal(rows.size,1);
  const canonical=await db.getCatalogDevice([...rows.keys()][0]);
  assert.deepEqual(canonical.energyProfile,{method:'POWER_TIME',typicalPowerW:100,standbyPowerW:.5,measurementType:'ESTIMATED'});
  assert.equal(canonical.sources.length,2); assert.equal(canonical.profiles.length,2);
  assert.equal(canonical.source.metrics.typicalPowerW,mf.referenceUrl);
  assert.equal(canonical.source.metrics.standbyPowerW,manifest.referenceUrl);
  assert.equal(calculateConsumption({profile:canonical.energyProfile,power:100,usageHours:5,days:30}).consumptionKWh,15.285);
  const snapshot=clone(canonical);
  assert.equal((await service.run([operating],{...mf,retrievedAt:'2026-10-26T00:00:00.000Z',verifiedAt:'2026-10-26T00:00:00.000Z'},false)).unchanged,1);
  operating.energyProfile.typicalPowerW=110;
  assert.equal((await service.run([operating],mf,false)).updated,1);
  assert.equal(snapshot.energyProfile.typicalPowerW,100);
  const write=db.upsertCatalogRecord.bind(db); let concurrent=true;
  db.upsertCatalogRecord=async incoming=>{
    if(concurrent){concurrent=false;
      const newer=providerFor('MANUFACTURER').normalize({...operating,energyProfile:{method:'POWER_TIME',typicalPowerW:120}},mf);
      await write(require('../dist/modules/catalog/resolver').resolveCatalog([newer])[0]);
    }
    return write(incoming);
  };
  assert.equal((await service.run([{...tv,energyProfile:{method:'POWER_TIME',standbyPowerW:.6}}],manifest,false)).updated,1);
  const current=await db.getCatalogDevice([...rows.keys()][0]);
  assert.equal(current.energyProfile.typicalPowerW,120,'staging antigo não sobrescreve nova potência de outra fonte');
  assert.equal(current.energyProfile.standbyPowerW,.6);
});

test('não agrega homônimos, regiões/tensões desconhecidas e métricas conflitantes sem revisão', () => {
  const {resolveCatalog}=require('../dist/modules/catalog/resolver');
  const row={...clone(records[0]),variant:{voltage:127},equivalence:{key:'test:identity',referenceUrl:'https://example.invalid/proof'}};
  const other={...clone(row),id:'different-source',source:{...row.source,type:'MANUFACTURER',externalId:'other'}};
  assert.equal(resolveCatalog([row,{...other,region:'US'}]).length,2);
  assert.equal(resolveCatalog([row,{...other,variant:{voltage:220}}]).length,2);
  assert.equal(resolveCatalog([row,{...other,variant:undefined}]).length,2);
  assert.equal(resolveCatalog([{...row,equivalence:undefined},{...other,equivalence:undefined}]).length,2);
  const conflict={...clone(other),source:{...other.source,externalId:'conflict'},energyProfile:{method:'REFERENCE_PERIOD',value:999,unit:'kWh',period:'MONTH'}};
  assert.throws(()=>resolveCatalog([other,conflict]),/METRIC_CONFLICT_REQUIRES_REVIEW/);
  const power={...other,energyProfile:{method:'POWER_TIME',typicalPowerW:100}};
  const standby=(value,id)=>({...other,source:{...other.source,externalId:id},energyProfile:{method:'POWER_TIME',standbyPowerW:value}});
  assert.throws(()=>resolveCatalog([power,standby(.5,'a'),standby(.6,'b')]),/METRIC_CONFLICT_REQUIRES_REVIEW/);
  assert.throws(()=>providerFor('PBE').normalize({...row,profiles:[{profile:row.energyProfile,source:other.source}]},manifest),/AGGREGATED_INPUT_REFUSED/);
});

test('busca por prefixo e filtros têm contrato equivalente entre JSON e Mongo', async () => {
  const {db,rows}=database(); await new CatalogImportService(db).run(records,manifest,false);
  const json=new JsonCatalogRepository([...rows.values()].map(({searchTokens,importFingerprint,catalogPriority,...row})=>row));
  for (const query of [
    {search:'Samsung RF29',region:'BR',page:1,limit:1},
    {search:'Samsung RF29',region:'US',page:1,limit:1},
    {model:records[0].model,region:'BR',page:1,limit:12},
  ]) assert.deepEqual(await db.searchCatalog(query),await json.searchCatalog(query));
  assert.equal((await json.searchCatalog({search:'Samsung RF29',page:1,limit:12})).total,1);
});

test('biblioteca prefere PBE BR, fabricante BR, US, EU e deixa genéricos ao final', async () => {
  const base=clone(records[0]);
  const rows=[
    {...base,id:'generic',displayName:'A genérico',source:{...base.source,type:'WATTSTATUS_GENERIC'},isGeneric:true},
    {...base,id:'eu',displayName:'B europeu',source:{...base.source,type:'EPREL'},region:'EU'},
    {...base,id:'us',displayName:'C americano',source:{...base.source,type:'ENERGY_STAR'},region:'US'},
    {...base,id:'manufacturer',displayName:'D fabricante',source:{...base.source,type:'MANUFACTURER'}},
    {...base,id:'pbe',displayName:'Z brasileiro'},
  ];
  assert.deepEqual((await new JsonCatalogRepository(rows).searchCatalog({page:1,limit:12})).devices.map(row=>row.id),['pbe','manufacturer','us','eu','generic']);
});

test('ENERGY STAR aceita nome longo original e conta mercado excluído sem mascarar dados inválidos', async () => {
  const us={...manifest,provider:'ENERGY_STAR',adapter:'energystar-refrigerator-csv-v1',referenceUrl:'https://www.energystar.gov/'};
  const row={'ENERGY STAR Unique ID':'synthetic',Markets:'United States','Brand Name':'Synthetic '+ 'X'.repeat(90),'Model Number':'FIXTURE','Annual Energy Use (kWh/yr)':'204'};
  assert.equal(providerFor('ENERGY_STAR').normalize(row,us).brand,row['Brand Name']);
  const report=await new CatalogImportService().run([row,{...row,Markets:'Canada'}],us);
  assert.equal(report.valid,1); assert.equal(report.outsideRegion,1); assert.equal(report.invalid,0);
  assert.equal(report.wouldInsert,null); assert.equal(report.wouldWrite,1);
});

test('download restrito recusa URLs, endereços privados, redirect, HTML, compressão e excesso', async () => {
  const {downloadRegisteredSource,publicIPv4,validateRemoteResponse}=require('../dist/modules/catalog/import/remote');
  for(const key of ['https://127.0.0.1/','__proto__','constructor','eprel']) await assert.rejects(downloadRegisteredSource(key),/SOURCE_NOT_REGISTERED/);
  for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','198.18.0.1','0.0.0.0','::1','999.1.1.1']) assert.equal(publicIPv4(ip),false,ip);
  assert.equal(publicIPv4('8.8.8.8'),true);
  validateRemoteResponse(200,'text/csv; charset=utf-8',undefined,'1024');
  for(const args of [[302,'text/csv'],[200,'text/html'],[200,'text/csv','gzip'],[200,'text/csv',undefined,'10485761'],[200,'text/csv',undefined,'NaN']]) assert.throws(()=>validateRemoteResponse(...args));
});

test('cálculo central: standby, minutos, ciclos semanais e prioridade da medição válida', () => {
  const {selectEnergyMethod}=require('../dist/modules/calculations/decision');
  const base={power:100,usageHours:5,days:30,profile:{method:'POWER_TIME',standbyPowerW:.5}};
  assert.equal(calculateConsumption(base).consumptionKWh,15.285);
  assert.equal(calculateConsumption({...base,standbyEnabled:false}).consumptionKWh,15);
  assert.equal(calculateConsumption({...base,power:1200,usageHours:15/60,profile:{method:'POWER_TIME'}}).consumptionKWh,9);
  const cycle={...base,profile:{method:'PER_CYCLE',energyPerCycleKwh:.45},cyclesPerWeek:4};
  assert.ok(Math.abs(calculateConsumption(cycle).consumptionKWh-7.8)<1e-10);
  assert.throws(()=>calculateConsumption({...cycle,cyclesPerMonth:10}));
  assert.throws(()=>calculateConsumption({...cycle,cyclesPerWeek:Infinity}));
  const reference={method:'REFERENCE_PERIOD',value:402,unit:'kWh',period:'YEAR'};
  const interval={kWh:2.65,startAt:'2026-10-25T00:00:00Z',endAt:'2026-10-25T01:00:00Z'};
  assert.equal(selectEnergyMethod(reference,interval).method,'LIVE_MEASUREMENT');
  assert.equal(selectEnergyMethod(reference,{...interval,kWh:-1}).method,'REFERENCE_PERIOD');
  assert.equal(selectEnergyMethod({method:'POWER_TIME'}).method,'UNAVAILABLE');
  assert.equal(selectEnergyMethod(undefined,{...interval,kWh:0}).method,'LIVE_MEASUREMENT');
});

test('datasets oficiais por categoria preservam energia, tensão e perfis alternativos', async () => {
  const fixtures=require('./fixtures/catalog/energy-star-categories.json');
  const {registeredSources}=require('../dist/modules/catalog/import/remote');
  const {db}=database();
  const normalized=[];
  for(const fixture of fixtures) {
    const source=Object.values(registeredSources).find(source=>source.adapter===fixture.adapter);
    const input={...manifest,provider:'ENERGY_STAR',adapter:fixture.adapter,referenceUrl:source.url};
    const report=await new CatalogImportService(db).run([fixture.raw],input,false);
    assert.equal(report.inserted,1);assert.equal(report.invalid,0);
    assert.equal((await new CatalogImportService(db).run([fixture.raw],input,false)).unchanged,1);
    normalized.push(providerFor('ENERGY_STAR').normalize(fixture.raw,input));
  }
  const [tv,ac,freezer,display]=normalized;
  assert.equal(tv.subcategory,'TV');assert.equal(tv.energyProfile.value,66);
  assert.equal(tv.profiles.find(entry=>entry.profile.method==='POWER_TIME').profile.typicalPowerW,31.52);
  assert.equal(ac.specifications.capacityBtuH,8000);assert.equal(ac.variant.voltage,115);assert.equal(ac.energyProfile.value,400);
  assert.equal(freezer.subcategory,'Freezer');assert.equal(freezer.energyProfile.value,394);
  assert.equal(display.subcategory,'Display profissional');assert.equal(display.energyProfile.typicalPowerW,131.04);
  assert.equal(display.energyProfile.standbyPowerW,undefined,'sleep não é promovido a standby sem condição de uso');
  assert.equal(display.specifications.sleepPowerW,.45);assert.equal(display.variant,undefined);
  assert.equal(decimal('8,000','US'),8000);assert.throws(()=>decimal('40,50','US'));
});

test('descrição do catálogo importa características opcionais sem inferir energia ou tamanho comercial', () => {
  const fixtures = require('./fixtures/catalog/energy-star-categories.json');
  const provider = providerFor('ENERGY_STAR');
  const normalize = (index, extra) => provider.normalize({ ...fixtures[index].raw, ...extra }, {
    ...manifest, provider: 'ENERGY_STAR', adapter: fixtures[index].adapter, referenceUrl: 'https://www.energystar.gov/',
  });
  const tv = normalize(0, { 'Diagonal Viewable Screen Size (in.)': '31.51', 'Display Type': 'LCD',
    'Native Horizontal Resolution (pixels)': '1366', 'Native Vertical Resolution (pixels)': '768' });
  assert.equal(tv.specifications.screenSizeInches, 31.51);
  assert.equal(tv.specifications.displayTechnology, 'LCD');
  assert.equal(tv.specifications.nativeResolution, '1366 × 768');
  assert.deepEqual(tv.energyProfile, normalize(0, {}).energyProfile);
  assert.equal(tv.id, normalize(0, {}).id);
  const ac = normalize(1, { 'Heating Mode': 'No', 'Variable Speed Compressor': 'Yes' });
  assert.equal(ac.specifications.heatingMode, 'No');
  assert.equal(ac.specifications.variableSpeedCompressor, 'Yes');
  const freezer = normalize(2, { 'Capacity (Total Volume) (ft3)': '13.8', 'Defrost Type': 'Automatic' });
  assert.equal(freezer.specifications.volumeFt3, 13.8);
  assert.equal(freezer.specifications.defrostType, 'Automatic');
  const display = normalize(3, { 'Native Resolution (pixels)': '3840 x 2160', 'Panel Type': 'TFT-LCD' });
  assert.equal(display.specifications.screenSizeInches, 65);
  assert.equal(display.specifications.nativeResolution, '3840 × 2160');
  for (const value of ['1778.9', '-1', 'N/A', 'Infinity']) {
    const row = normalize(3, { 'Screen Size (inches)': value });
    assert.equal(row.specifications.screenSizeInches, undefined);
    assert.deepEqual(row.energyProfile, display.energyProfile, 'metadado opcional inválido não descarta energia válida');
  }
});

test('cabeçalhos alterados, tensão inválida e modelos extensos não são silenciosamente reinterpretados', () => {
  const fixtures=require('./fixtures/catalog/energy-star-categories.json');
  const provider=providerFor('ENERGY_STAR');
  const tv={...manifest,provider:'ENERGY_STAR',adapter:fixtures[0].adapter,referenceUrl:'https://www.energystar.gov/'};
  const bad={...fixtures[0].raw};delete bad['Reported Annual Energy Consumption (kWh)'];
  assert.throws(()=>provider.normalize(bad,tv),/SOURCE_COLUMNS_CHANGED/);
  const ac={...tv,adapter:fixtures[1].adapter};
  assert.throws(()=>provider.normalize({...fixtures[1].raw,'Voltage (volts)':'115/230'},ac));
  const display={...tv,adapter:fixtures[3].adapter};
  const long=provider.normalize({...fixtures[3].raw,'Model Number':'TEST-'.repeat(49)},display);
  assert.equal(long.model.length,245);assert.ok(long.displayName.length<=160);
  const reference=provider.normalize({...fixtures[3].raw,'Product Type':'Monitor','Monitor Total Energy Consumption at 115 Volts (kWh/yr)':'24'},display);
  assert.equal(reference.energyProfile.period,'YEAR');assert.match(reference.energyProfile.testBasis,/115 V/);
  assert.equal(reference.variant,undefined,'tensão de ensaio não vira tensão do produto');
});

test('prévia multi-fonte preserva categorias anteriores e recusa identidade conflitante', () => {
  const fs=require('node:fs'),os=require('node:os');
  const {writePreview}=require('../scripts/sync-catalog.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wattstatus-catalog-preview-')),cache=path.join(root,'catalog-cache');fs.mkdirSync(cache);
  try {
    const a=clone(records[0]), b={...clone(a),id:'different',source:{...a.source,reference:'https://example.invalid/second'}};
    assert.equal(writePreview(cache,[{manifest:{referenceUrl:a.source.reference},rows:[a]}]),1);
    assert.equal(writePreview(cache,[{manifest:{referenceUrl:b.source.reference},rows:[b]}]),2);
    assert.equal(writePreview(cache,[{manifest:{referenceUrl:b.source.reference},rows:[b]}]),2);
    assert.throws(()=>writePreview(cache,[{manifest:{referenceUrl:'https://example.invalid/conflict'},rows:[{...b,energyProfile:{method:'REFERENCE_PERIOD',value:999,unit:'kWh',period:'MONTH'}}]}]),/PREVIEW_IDENTITY_CONFLICT/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'catalog-preview.json'))).length,2);
  } finally {
    const resolved=fs.realpathSync(root),temporaryRoot=fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved).toLowerCase(),temporaryRoot.toLowerCase());
    assert.ok(path.basename(resolved).startsWith('wattstatus-catalog-preview-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
});

test('destino configurado exige opção explícita e nunca aplica no dry-run', () => {
  const {catalogTarget}=require('../scripts/catalog-target.cjs');
  const environment={MONGO_URL:'mongodb://127.0.0.1:27019',MONGO_DB_NAME:'wattstatus_catalog_test'};
  assert.equal(catalogTarget(new Set(),environment),null);
  assert.equal(catalogTarget(new Set(['--configured']),environment).apply,false);
  assert.equal(catalogTarget(new Set(['--configured','--dry-run']),environment).apply,false);
  assert.equal(catalogTarget(new Set(['--configured','--apply']),environment).apply,true);
  for(const flags of [['--apply'],['--configured','--local'],['--configured','--apply','--dry-run']])
    assert.throws(()=>catalogTarget(new Set(flags),environment));
  assert.throws(()=>catalogTarget(new Set(['--configured']),{}),/CONFIGURED_TARGET_REQUIRED/);
  assert.throws(()=>catalogTarget(new Set(['--configured']),{...environment,MONGO_URL:'https://example.invalid'}));
  assert.throws(()=>catalogTarget(new Set(['--configured']),{...environment,MONGO_DB_NAME:'../other'}));
});

test('CLI recusa configuração inválida sem imprimir credenciais ou URI', () => {
  const {spawnSync}=require('node:child_process');
  const sentinel='FIXTURE_SECRET_NOT_REAL';
  const result=spawnSync(process.execPath,['scripts/import-catalog.cjs','--configured','--dry-run','--file','tests/fixtures/catalog/pbe.json','--manifest','tests/fixtures/catalog/pbe.manifest.json'],{
    cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:10000,
    env:{...process.env,NODE_ENV:'test',MONGO_URL:`mongodb://fixture:${sentinel}@127.0.0.1:1`,MONGO_DB_NAME:'../invalid'},
  });
  assert.equal(result.status,1);
  assert.equal((result.stdout+result.stderr).includes(sentinel),false);
  assert.equal((result.stdout+result.stderr).includes('mongodb://'),false);
});
