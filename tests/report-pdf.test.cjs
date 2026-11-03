const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/report-pdf.ts');
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(compiled, filename);
const { createReportPdf } = loaded.exports;

test('PDF paginates long report and produces a valid document', () => {
  const estimated = Array.from({ length: 90 }, (_, index) => ({
    applianceName: `Aparelho ${index} com descrição longa para testar a quebra de linha`,
    source: 'Estimativa', tariffValue: 1.25, consumptionKWh: 5, cost: 6.25,
  }));
  const pdf = createReportPdf({ userName: 'Pessoa Teste', month: '10', year: '2026', issuedAt: '22/10/2026', estimated, measured: [] });
  assert.ok(pdf.getNumberOfPages() > 1);
  const firstWidth = pdf.internal.pageSize.getWidth();
  for (let page = 2; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    assert.equal(pdf.internal.pageSize.getWidth(), firstWidth);
  }
  const bytes = Buffer.from(pdf.output('arraybuffer'));
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  assert.ok(bytes.length > 1000);
});

test('PDF somente medido não inventa estimativa zero', () => {
  const pdf=createReportPdf({userName:'Teste',month:'10',year:'2026',issuedAt:'25/10/2026',estimated:[],
    measured:[{applianceName:'Medidor',source:'SmartThings',tariffValue:1,consumptionKWh:2.65,cost:2.65}]});
  assert.match(pdf.output(),/Sem estimativa/);
});
