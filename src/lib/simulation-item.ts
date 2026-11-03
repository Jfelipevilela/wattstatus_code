import type { EnergyProfile } from "../../backend/src/modules/catalog/catalog.types";
import { normalizeEnergyProfile, referenceLabel } from "../../backend/src/modules/catalog/reference";
import type { SimulationItem, SimulationUsage } from "../../backend/src/modules/simulations/simulations.types";
import { formatNumber } from "./energy";

type PowerProfile = Extract<EnergyProfile, { method: "POWER_TIME" }>;

export function simulationItemUsage(item: SimulationItem, override?: SimulationUsage): SimulationUsage {
  return [item.usage, override].reduce<SimulationUsage>((usage, change) => {
    if (!change) return usage;
    const merged = { ...usage, ...change };
    if (change.cyclesPerWeek !== undefined) delete merged.cyclesPerMonth;
    else if (change.cyclesPerMonth !== undefined) delete merged.cyclesPerWeek;
    return merged;
  }, { ...item.defaultUsage });
}

export function simulationItemProfiles(item: SimulationItem) {
  const snapshotProfile = item.energyProfileSnapshot && normalizeEnergyProfile(item.energyProfileSnapshot);
  const catalogProfile = item.catalogSnapshot && normalizeEnergyProfile(item.catalogSnapshot.energyProfile);
  const referenceProfile = snapshotProfile?.method === "REFERENCE_PERIOD" ? snapshotProfile
    : item.canEstimateByUsage && catalogProfile?.method === "REFERENCE_PERIOD" ? catalogProfile : undefined;
  const operatingEntry = item.catalogSnapshot?.profiles?.find((entry) => entry.profile.method === "POWER_TIME");
  const operatingProfile: PowerProfile | undefined = snapshotProfile?.method === "POWER_TIME" && (!referenceProfile || item.defaultUsage.estimateByUsage) ? snapshotProfile
    : operatingEntry?.profile.method === "POWER_TIME" ? operatingEntry.profile : undefined;
  const documented = operatingEntry?.profile.method === "POWER_TIME" ? operatingEntry.profile.typicalPowerW : undefined;
  const documentedPower = item.catalogSnapshot?.verified === true && operatingEntry?.source.type !== "WATTSTATUS_GENERIC"
    && operatingEntry?.source.official !== false && typeof documented === "number" && Number.isFinite(documented)
    && documented > 0 && documented <= 100000 ? documented : undefined;
  return { snapshotProfile, referenceProfile, operatingProfile, documentedPower };
}

export function effectiveSimulationProfile(item: SimulationItem, override?: SimulationUsage): EnergyProfile | undefined {
  const usage = simulationItemUsage(item, override);
  const { snapshotProfile, referenceProfile, operatingProfile } = simulationItemProfiles(item);
  if (referenceProfile) return usage.estimateByUsage ? operatingProfile ?? { method: "POWER_TIME" } : referenceProfile;
  if (snapshotProfile) return snapshotProfile;
  return typeof usage.power === "number" && Number.isFinite(usage.power) && usage.power > 0 ? { method: "POWER_TIME" } : undefined;
}

const compact = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function simulationUsageSummary(item: SimulationItem, override?: SimulationUsage): string {
  const usage = simulationItemUsage(item, override);
  const profile = effectiveSimulationProfile(item, override);
  if (profile?.method === "REFERENCE_PERIOD") return `Referência: ${referenceLabel(profile)}`;
  if (profile?.method === "PER_CYCLE") return usage.cyclesPerWeek != null
    ? `${compact(usage.cyclesPerWeek)} ciclos/semana`
    : `${compact(usage.cyclesPerMonth ?? 0)} ciclos/mês`;
  const profiles = simulationItemProfiles(item);
  const power = usage.power || (profiles.referenceProfile ? profiles.documentedPower
    : profile?.method === "POWER_TIME" ? profile.typicalPowerW : undefined);
  if (!power || !Number.isFinite(power)) return "Informe a potência para simular";
  return `${compact(power)} W · ${compact(usage.usageHours ?? 0)} h/dia · ${formatNumber(usage.days ?? 30, 0)} dias/mês`;
}
