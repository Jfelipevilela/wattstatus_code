// Serialization cost of the energy history formats (plain vs columns) for a
// month of hourly readings from N devices. CPU-only, no network.
//   node scripts/perf/codec-bench.cjs [--devices=6] [--rounds=30]
const path = require("node:path");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const ts = require(path.resolve(__dirname, "../../backend/node_modules/typescript"));
const { compactIntervals } = require(path.resolve(__dirname, "../../backend/dist/modules/energy/energy-compact"));
const filename = path.resolve(__dirname, "../../src/lib/energy-compact.ts");
const decoder = new Module(filename, module);
decoder.require = () => ({});
decoder._compile(ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { expandIntervals } = decoder.exports;

const arg = (name, fallback) => Number((process.argv.find((item) => item.startsWith(`--${name}=`)) || `=${fallback}`).split("=")[1]);
const devices = arg("devices", 6);
const rounds = arg("rounds", 30);
const rows = [];
for (let device = 0; device < devices; device++) for (let hour = 0; hour < 720; hour++) {
  const start = Date.UTC(2026, 8, 24) + hour * 3600000;
  const kWh = 0.05 + ((hour * 7 + device) % 11) / 100;
  rows.push({ applianceId: `0b3f${device}a7e-3c1d-4f8a-9e2b-7d6c5b4a3f21`, provider: "smartthings", deviceId: `d1e2${device}f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f`,
    startAt: new Date(start).toISOString(), endAt: new Date(start + 3600000).toISOString(), consumptionKWh: kWh, cost: kWh * 0.8734,
    tariffValue: 0.8734, source: "iot", readingType: "interval", propertyId: "6f1e2d3c-4b5a-4987-8765-43210fedcba9", roomId: `7a8b${device}c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d` });
}
const time = (fn) => { const samples = []; let out; for (let i = 0; i < rounds; i++) { const t = process.hrtime.bigint(); out = fn(); samples.push(Number(process.hrtime.bigint() - t) / 1e6); } samples.sort((a, b) => a - b); return { out, p50: +samples[samples.length >> 1].toFixed(2), p95: +samples[Math.floor(samples.length * 0.95)].toFixed(2) }; };
const plainEncode = time(() => JSON.stringify({ intervals: rows }));
const columnsEncode = time(() => JSON.stringify({ intervals: compactIntervals(rows) }));
const plainDecode = time(() => JSON.parse(plainEncode.out).intervals);
const columnsDecode = time(() => expandIntervals(JSON.parse(columnsEncode.out).intervals));
global.gc?.();
const heap = (fn) => { global.gc?.(); const before = process.memoryUsage().heapUsed; const keep = fn(); global.gc?.(); const after = process.memoryUsage().heapUsed; keep.length; return { mb: +((after - before) / 1048576).toFixed(2), keep }; };
const plainHeap = heap(() => JSON.parse(plainEncode.out).intervals);
const columnsHeap = heap(() => expandIntervals(JSON.parse(columnsEncode.out).intervals));
console.log(JSON.stringify({
  rows: rows.length, bytes: { plain: plainEncode.out.length, columns: columnsEncode.out.length },
  serverEncodeMs: { plain: [plainEncode.p50, plainEncode.p95], columns: [columnsEncode.p50, columnsEncode.p95] },
  clientDecodeMs: { plain: [plainDecode.p50, plainDecode.p95], columns: [columnsDecode.p50, columnsDecode.p95] },
  decodedHeapMB: { plain: plainHeap.mb, columns: columnsHeap.mb, gcExposed: Boolean(global.gc) },
}));
