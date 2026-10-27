import type {
  SimulationCalculationInput, SimulationItem, SimulationScenario, SimulationUsage,
} from "../../backend/src/modules/simulations/simulations.types";

export function createSimulationScenario(tariffPerKwh = 0): SimulationScenario {
  return { name: "", sourceType: "NEW", propertyType: "RESIDENTIAL", environmentType: "living", tariffPerKwh, items: [] };
}

export function copySimulationItem(item: SimulationItem): SimulationItem {
  const copy = structuredClone(item);
  return { ...copy, id: crypto.randomUUID(), quantity: 1, usage: { ...copy.defaultUsage, ...copy.usage } };
}

export function copyRoomScenario(scenario: SimulationScenario): SimulationScenario {
  return structuredClone(scenario);
}

export function editSimulationItem(scenario: SimulationScenario, id: string, quantity: number, usage: SimulationUsage): SimulationScenario {
  return { ...scenario, items: scenario.items.map((item) => item.id === id ? { ...item, quantity, usage: { ...usage } } : item) };
}

/** Send only editable inputs and source identities; the server resolves trusted profiles. */
export function simulationPayload(scenario: SimulationScenario): SimulationCalculationInput {
  return {
    ...(scenario.sourcePropertyId && { sourcePropertyId: scenario.sourcePropertyId }),
    ...(scenario.sourceRoomId && { sourceRoomId: scenario.sourceRoomId }),
    tariffPerKwh: scenario.tariffPerKwh,
    items: scenario.items.map(({ id, source, userApplianceId, catalogDeviceId, sourceFingerprint, quantity, usage }) => ({
      id, source, ...(userApplianceId && { userApplianceId }), ...(catalogDeviceId && { catalogDeviceId }),
      sourceFingerprint, quantity, ...(usage && { usage: { ...usage } }),
    })),
  };
}
