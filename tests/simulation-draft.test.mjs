import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./vite-test-server.mjs";

test("cenário e itens são cópias independentes e payload não envia dados privados ou snapshots", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const draft = await server.ssrLoadModule('/src/lib/simulation-draft.ts');
    const original = { name: 'Sala', sourceType: 'EXISTING_ENVIRONMENT', sourcePropertyId: 'property', sourceRoomId: 'room',
      tariffPerKwh: 0.82, items: [{ id: 'original', source: 'USER_APPLIANCE', userApplianceId: 'appliance',
        name: 'Lâmpada', sourceFingerprint: 'trusted-fingerprint', quantity: 1, defaultUsage: { power: 9, usageHours: 4, days: 30 },
        energyProfileSnapshot: { method: 'POWER_TIME', typicalPowerW: 9 }, canEstimateByUsage: false }] };
    const before = structuredClone(original);
    const copied = draft.copyRoomScenario(original);
    const edited = draft.editSimulationItem(copied, 'original', 5, { power: 9, usageHours: 6, days: 30 });
    assert.deepEqual(original, before);
    assert.equal(copied.items[0].quantity, 1);
    assert.equal(edited.items[0].quantity, 5);
    assert.equal(edited.items[0].usage.usageHours, 6);
    const another = draft.copySimulationItem(original.items[0]);
    assert.notEqual(another.id, original.items[0].id);
    another.energyProfileSnapshot.typicalPowerW = 10;
    assert.equal(original.items[0].energyProfileSnapshot.typicalPowerW, 9);
    assert.deepEqual(draft.simulationPayload(edited), { sourcePropertyId: 'property', sourceRoomId: 'room', tariffPerKwh: .82,
      items: [{ id: 'original', source: 'USER_APPLIANCE', userApplianceId: 'appliance', sourceFingerprint: 'trusted-fingerprint', quantity: 5,
        usage: { power: 9, usageHours: 6, days: 30 } }] });
    const fresh = draft.createSimulationScenario(1);
    assert.equal(fresh.name, '');
    assert.equal(fresh.sourceType, 'NEW'); assert.deepEqual(fresh.items, []);
    assert.equal(fresh.tariffPerKwh, 1);
  } finally { await server.close(); }
});
