import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from './vite-test-server.mjs';

test('localização identifica UFs sem rede externa e trata recusa, exterior e falha sem inventar tarifa', async () => {
  const server = await createServer({ cacheDir: 'node_modules/.vite-regional-tariff-test', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false } });
  try {
    const { identifyState, locateRegionalTariff } = await server.ssrLoadModule('/src/lib/regional-tariff.ts');
    const data = JSON.parse(readFileSync(new URL('../public/geography/br-uf.json', import.meta.url)));
    assert.equal(data.features.length, 27);
    for (const [lat, lon, uf] of [[-15.7939,-47.8828,'DF'],[-16.6869,-49.2648,'GO'],[-15.601,-56.0974,'MT'],[-20.4697,-54.6201,'MS'],[-23.5505,-46.6333,'SP'],[-22.9068,-43.1729,'RJ'],[-30.0346,-51.2177,'RS'],[-3.119,-60.0217,'AM'],[-8.0476,-34.877,'PE']]) {
      assert.equal(identifyState(lat,lon,data),uf);
    }
    assert.equal(identifyState(38.7,-9.1,data),undefined);
    assert.equal(identifyState(NaN,0,data),undefined);
    const requests=[];
    const located = await locateRegionalTariff({
      geolocation: { getCurrentPosition(success, _failure, options) { assert.equal(options.enableHighAccuracy,false); success({coords:{latitude:-16.6869,longitude:-49.2648,accuracy:100}}); } },
      fetch: async (url, options) => { requests.push({url,options}); return new Response(JSON.stringify(data)); },
    });
    assert.deepEqual(located,{state:'GO',region:'Centro-Oeste',rate:.76});
    assert.equal(requests.length,1); assert.equal(requests[0].url,'/geography/br-uf.json');
    assert.equal(requests[0].options.credentials,'omit');
    assert.ok(!JSON.stringify(requests).includes('49.2648'),'Coordenadas não entram na requisição');
    let fetched=false;
    await assert.rejects(locateRegionalTariff({geolocation:{getCurrentPosition(_success,error){error({code:1});}},fetch:async()=>{fetched=true;}}),/permissão|autorizad/i);
    assert.equal(fetched,false);
    await assert.rejects(locateRegionalTariff({geolocation:undefined,fetch:async()=>{}}),/disponível/i);
    await assert.rejects(locateRegionalTariff({geolocation:{getCurrentPosition(success){success({coords:{latitude:38.7,longitude:-9.1,accuracy:100}});}},fetch:async()=>new Response(JSON.stringify(data))}),/Brasil|estado/i);
    await assert.rejects(locateRegionalTariff({geolocation:{getCurrentPosition(success){success({coords:{latitude:-16.6,longitude:-49.2,accuracy:100}});}},fetch:async()=>new Response('',{status:503})}),/referência|região/i);
  } finally { await server.close(); }
});
