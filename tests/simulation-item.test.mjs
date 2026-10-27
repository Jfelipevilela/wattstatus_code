import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./vite-test-server.mjs";

test("perfis da simulação preservam snapshot, referência original e potência com origem conhecida", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { simulationItemProfiles, simulationItemUsage, effectiveSimulationProfile, simulationUsageSummary } = await server.ssrLoadModule("/src/lib/simulation-item.ts");
    const reference = { method: "REFERENCE_PERIOD", value: 402, unit: "kWh", period: "YEAR", measurementType: "ESTIMATED" };
    const operational = { method: "POWER_TIME", typicalPowerW: 80, standbyPowerW: .5, measurementType: "ESTIMATED" };
    const source = { type: "ENERGY_STAR", reference: "https://example.invalid/source", verifiedAt: "2026-10-26T00:00:00Z" };
    const item = {
      id: "fixture", source: "USER_APPLIANCE", userApplianceId: "fixture", sourceFingerprint: "fixture",
      name: "TV cadastrada", quantity: 1, energyProfileSnapshot: operational,
      defaultUsage: { power: 83, usageHours: 4, days: 30, estimateByUsage: true },
      catalogSnapshot: { id: "catalog-fixture", displayName: "Modelo original", category: "entertainment", subcategory: "TV",
        aliases: [], source, energyProfile: reference, profiles: [{ profile: operational, source }], region: "US", verified: true, isGeneric: false },
      sourceDetails: source, canEstimateByUsage: true,
    };
    const original = structuredClone(item);
    assert.deepEqual(effectiveSimulationProfile(item), operational, "mantém o perfil energético realmente salvo");
    assert.deepEqual(effectiveSimulationProfile(item, { estimateByUsage: false }), reference, "permite voltar à referência original congelada");
    assert.equal(simulationItemProfiles(item).documentedPower, 80);
    assert.match(simulationUsageSummary(item), /83.*W.*4.*h\/dia.*30.*dias/);
    assert.match(simulationUsageSummary(item, { estimateByUsage: false }), /402,00 kWh\/ano/);
    assert.deepEqual(item, original, "seleção e descrição não alteram o item original");

    const referenceItem = { ...item, energyProfileSnapshot: reference, defaultUsage: { power: 0, usageHours: 4, days: 30 } };
    assert.deepEqual(effectiveSimulationProfile(referenceItem), reference);
    assert.deepEqual(effectiveSimulationProfile(referenceItem, { estimateByUsage: true }), operational);
    const unverified = { ...referenceItem, catalogSnapshot: { ...item.catalogSnapshot, verified: false } };
    assert.equal(simulationItemProfiles(unverified).documentedPower, undefined, "potência não verificada exige confirmação manual");
    assert.match(simulationUsageSummary(unverified, { estimateByUsage: true }), /Informe a potência/);
    const generic = { ...referenceItem, catalogSnapshot: { ...item.catalogSnapshot, profiles: [{ profile: operational, source: { ...source, type: "WATTSTATUS_GENERIC" } }] } };
    assert.equal(simulationItemProfiles(generic).documentedPower, undefined);
    const unofficial = { ...referenceItem, catalogSnapshot: { ...item.catalogSnapshot, profiles: [{ profile: operational, source: { ...source, official: false } }] } };
    assert.equal(simulationItemProfiles(unofficial).documentedPower, undefined);

    const cycle = { ...item, energyProfileSnapshot: { method: "PER_CYCLE", energyPerCycleKwh: .45 }, catalogSnapshot: undefined,
      canEstimateByUsage: false, defaultUsage: { cyclesPerWeek: 5 } };
    assert.match(simulationUsageSummary(cycle), /5.*ciclos\/semana/);
    assert.match(simulationUsageSummary(cycle, { cyclesPerMonth: 12, cyclesPerWeek: undefined }), /12.*ciclos\/mês/);
    assert.deepEqual(simulationItemUsage({ ...cycle, usage: { cyclesPerMonth: 12 } }), { cyclesPerMonth: 12 });
    assert.match(simulationUsageSummary({ ...cycle, usage: { cyclesPerMonth: 12 } }), /12.*ciclos\/mês/);
    const measuredOnly = { ...item, energyProfileSnapshot: undefined, catalogSnapshot: undefined, canEstimateByUsage: false,
      defaultUsage: { power: 0, usageHours: 0, days: 30 }, measurementContext: { kind: "interval", capturedAt: "2026-10-26T00:00:00Z", consumptionKWh: 500 } };
    assert.equal(effectiveSimulationProfile(measuredOnly), undefined);
    assert.match(simulationUsageSummary(measuredOnly), /Informe a potência/);
    assert.deepEqual(effectiveSimulationProfile(measuredOnly, { power: 100 }), { method: "POWER_TIME" });
    assert.doesNotMatch(simulationUsageSummary(measuredOnly, { power: 100 }), /500/);
  } finally {
    await server.close();
  }
});
