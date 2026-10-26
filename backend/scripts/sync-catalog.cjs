// Administrative sync. Fixed sources, explicit database target, dry-run by default.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { registeredSources, downloadRegisteredSource } = require('../dist/modules/catalog/import/remote');
const { readDataset } = require('../dist/modules/catalog/import/files');
const { CatalogImportService } = require('../dist/modules/catalog/import/service');
const { MongoDatabase } = require('../dist/storage/mongo-db');
const { logger } = require('../dist/logging/logger');
const { catalogDeviceSchema } = require('../dist/modules/catalog/catalog.schema');
const { catalogFingerprint } = require('../dist/modules/catalog/resolver');
const { catalogTarget } = require('./catalog-target.cjs');

function writePreview(cache, batches) {
  const target=path.join(cache,'..','catalog-preview.json');
  let previous=[];
  if(fs.existsSync(target)) {
    const stat=fs.lstatSync(target);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>30*1024*1024)throw new Error('PREVIEW_PATH_REFUSED');
    previous=catalogDeviceSchema.array().max(20000).parse(JSON.parse(fs.readFileSync(target,'utf8')));
  }
  const replaced=new Set(batches.map(batch=>batch.manifest.referenceUrl));
  const rows=new Map(previous.filter(row=>!replaced.has(row.source.reference)).map(row=>[row.id,row]));
  for(const row of batches.flatMap(batch=>batch.rows)) {
    const old=rows.get(row.id);
    if(old&&catalogFingerprint(old)!==catalogFingerprint(row))throw new Error('PREVIEW_IDENTITY_CONFLICT');
    rows.set(row.id,row);
  }
  const content=JSON.stringify(catalogDeviceSchema.array().max(20000).parse([...rows.values()]));
  if(Buffer.byteLength(content)>30*1024*1024)throw new Error('PREVIEW_SIZE_LIMIT');
  const temporary=path.join(cache,`${randomUUID()}.preview.tmp`);
  fs.writeFileSync(temporary,content,{flag:'wx',mode:0o600});
  fs.renameSync(temporary,target);
  return rows.size;
}
async function main() {
  const args = process.argv.slice(2), flags = new Set(); let source;
  for (let i=0;i<args.length;i++) {
    const key=args[i]; if(flags.has(key)||!['--source','--dry-run','--apply','--local','--configured','--preview'].includes(key)) throw new Error('ARGUMENT_INVALID'); flags.add(key);
    if(key==='--source') {source=args[++i];if(!source||source.startsWith('--'))throw new Error('SOURCE_REQUIRED');}
  }
  if(!source)throw new Error('ARGUMENT_INVALID');
  const target=catalogTarget(flags);
  if(source!=='all'&&!Object.prototype.hasOwnProperty.call(registeredSources,source))throw new Error('SOURCE_NOT_REGISTERED');
  const root=path.resolve(__dirname,'../..'), cache=path.join(root,'wattstatus.local','catalog-cache');
  fs.mkdirSync(cache,{recursive:true});
  const realRoot=fs.realpathSync(root).toLowerCase(), realCache=fs.realpathSync(cache).toLowerCase();
  if(!realCache.startsWith(realRoot+path.sep)) throw new Error('CACHE_PATH_REFUSED');
  const batches=[];
  for(const key of source==='all'?Object.keys(registeredSources):[source]) {
    logger.info('catalog.sync.source_started',{source:key});
    const downloaded=await downloadRegisteredSource(key);
    const file=path.join(cache,`${randomUUID()}.csv`),at=new Date().toISOString();
    fs.writeFileSync(file,downloaded.body,{flag:'wx',mode:0o600});
    const manifest={provider:downloaded.source.provider,adapter:downloaded.source.adapter,
      referenceUrl:downloaded.source.url,sourceVersion:downloaded.sha256,retrievedAt:at,verifiedAt:at};
    fs.writeFileSync(file+'.manifest.json',JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
    const records=readDataset(file);let rows=[];
    const report=await new CatalogImportService().run(records,manifest,true,staged=>{rows=staged;});
    batches.push({key,records,manifest,rows,report});
  }
  const db=target?new MongoDatabase(target.uri,target.database):undefined;
  try {
    if(db&&!batches.some(batch=>batch.report.invalid)) {
      await db.init(target.apply);
      for(const batch of batches)batch.report=await new CatalogImportService(db).run(batch.records,batch.manifest,true);
      if(target.apply&&!batches.some(batch=>batch.report.invalid||batch.report.failed)) {
        for(const batch of batches)batch.report=await new CatalogImportService(db).run(batch.records,batch.manifest,false);
      }
    }
    const failed=batches.some(batch=>batch.report.invalid||batch.report.failed);
    const previewRecords=!failed&&flags.has('--preview')?writePreview(cache,batches):undefined;
    const totals=Object.fromEntries(['received','valid','invalid','outsideRegion','inserted','updated','unchanged','failed']
      .map(key=>[key,batches.reduce((sum,batch)=>sum+batch.report[key],0)]));
    logger.info(failed?'catalog.sync.failed':'catalog.sync.completed',{sourceCount:batches.length,dryRun:!target?.apply,...totals});
    console.log(JSON.stringify({dryRun:!target?.apply,totals,previewRecords,sources:batches.map(batch=>({source:batch.key,...batch.report}))},null,2));
    if(failed)process.exitCode=1;
  } finally {if(db)await db.close();}
}
if(require.main===module)main().catch(()=>{console.error('Sincronização recusada: verifique fonte registrada, rede, limites e destino explícito do MongoDB. Nenhum segredo foi impresso.');process.exitCode=1;});
module.exports={writePreview};
