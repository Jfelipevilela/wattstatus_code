import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/energy.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const {
  getMonthlyEstimate,
  getEstimateHistory,
  estimateAppliance,
  normalizeSearch,
  formatDuration,
  STATE_TARIFFS,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const appliance = {
  id: "fridge",
  name: "Geladeira",
  power: 100,
  usageHours: 10,
  days: 30,
  tariff: "SP",
  monthlyConsumption: 30,
  monthlyCost: 24.6,
  createdAt: new Date(2025, 7, 15).toISOString(),
  status: "normal",
};

test("aparelhos continuam nas estimativas após o mês de cadastro e na virada do ano", () => {
  assert.equal(getMonthlyEstimate([appliance], 2025, 7).rows.length, 0);
  assert.equal(getMonthlyEstimate([appliance], 2025, 8).consumption, 30);
  assert.equal(getMonthlyEstimate([appliance], 2025, 9).consumption, 30);
  assert.equal(getMonthlyEstimate([appliance], 2026, 1).consumption, 30);
  assert.equal(getMonthlyEstimate([appliance], 2024, 8).rows.length, 0);
});
test("respeita dias cadastrados e o calendário, incluindo fevereiro bissexto", () => {
  const earlier = {
    ...appliance,
    createdAt: new Date(2020, 0, 1).toISOString(),
    days: 31,
  };
  assert.equal(getMonthlyEstimate([earlier], 2024, 2).consumption, 29);
  assert.equal(getMonthlyEstimate([earlier], 2025, 2).consumption, 28);
  assert.equal(
    getMonthlyEstimate([{ ...earlier, days: 5 }], 2025, 2).consumption,
    5,
  );
});
test("não confunde leitura acumulada importada com estimativa mensal", () => {
  const imported = {
    ...appliance,
    measuredConsumptionKWh: 900,
    monthlyConsumption: 900,
    monthlyCost: 738,
  };
  assert.equal(getMonthlyEstimate([imported], 2026, 1).consumption, 30);
  assert.ok(Math.abs(estimateAppliance(imported).cost - 24.6) < 0.00001);
});
test("histórico acompanha mês e ano selecionados", () => {
  const history = getEstimateHistory([appliance], 2026, 1);
  assert.equal(history.length, 6);
  assert.match(history[0].month, /ago.*25/);
  assert.match(history[5].month, /jan.*26/);
  assert.deepEqual(
    history.map((item) => item.consumption),
    [30, 30, 30, 30, 30, 30],
  );
});
test("datas inválidas não geram histórico inventado e listas vazias têm totais zero", () => {
  assert.equal(
    getMonthlyEstimate([{ ...appliance, createdAt: "invalid" }], 2026, 1).rows
      .length,
    0,
  );
  assert.equal(getMonthlyEstimate([], 2026, 1).cost, 0);
});
test("busca ignora acentos e duração aceita minutos", () => {
  assert.equal(normalizeSearch("  MÁQUINA de Lavar "), "maquina de lavar");
  assert.equal(formatDuration(0.5), "0 h 30 min");
  assert.equal(formatDuration(1 / 60), "0 h 1 min");
});
test("tarifas de referência da interface correspondem às usadas no cálculo da API", async () => {
  const backend = await readFile(
    new URL("../backend/src/config/tariffs.ts", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(backend, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  const values = await import(
    `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
  );
  assert.deepEqual(STATE_TARIFFS, values.STATE_TARIFFS);
});
