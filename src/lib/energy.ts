import type { Appliance } from "../hooks/useAppliances";
import { normalizeEnergyProfile, referenceMonthly } from "../../backend/src/modules/catalog/reference";
import { cyclesInMonth, powerTimeKWh } from "../../backend/src/modules/calculations/usage";

// Reference values already used by the calculation API; these are not live tariffs.
export const STATE_TARIFFS: Record<string, number> = {
  AC: 0.89,
  AL: 0.78,
  AP: 0.85,
  AM: 0.82,
  BA: 0.75,
  CE: 0.71,
  DF: 0.79,
  ES: 0.73,
  GO: 0.76,
  MA: 0.69,
  MT: 0.74,
  MS: 0.72,
  MG: 0.77,
  PA: 0.81,
  PB: 0.7,
  PR: 0.78,
  PE: 0.72,
  PI: 0.68,
  RJ: 0.79,
  RN: 0.71,
  RS: 0.8,
  RO: 0.83,
  RR: 0.84,
  SC: 0.76,
  SP: 0.82,
  SE: 0.7,
  TO: 0.75,
};
export const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
export const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const formatDuration = (hours: number) => {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};
export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

export function estimateAppliance(appliance: Appliance, daysInMonth = 31) {
  if (appliance.monitoringOnly) return { consumption: 0, cost: 0, available: false };
  const profile = appliance.energyProfile && normalizeEnergyProfile(appliance.energyProfile);
  const consumption = profile?.method === "REFERENCE_PERIOD" ? referenceMonthly(profile)
    : profile?.method === "PER_CYCLE" ? profile.energyPerCycleKwh * cyclesInMonth(appliance.cyclesPerMonth, appliance.cyclesPerWeek) :
    powerTimeKWh(appliance.power, appliance.usageHours, Math.min(appliance.days, daysInMonth),
      profile?.method === "POWER_TIME" && appliance.standbyEnabled ? profile.standbyPowerW ?? 0 : 0);
  const rate =
    appliance.tariffValue ?? (appliance.monthlyConsumption !== null && appliance.monthlyCost !== null && appliance.monthlyConsumption > 0
      ? appliance.monthlyCost / appliance.monthlyConsumption
      : STATE_TARIFFS[appliance.tariff] || 0);
  return { consumption, cost: consumption * rate, available: true };
}

export const applianceSourceLabel = (appliance: Partial<Appliance>): string => {
  if (appliance.monitoringOnly && appliance.integrationProvider === "smartthings") return "Samsung SmartThings · medição";
  if (appliance.estimateByUsage) return "Estimativa pelo uso informado; referência do catálogo preservada";
  const profile = appliance.energyProfile;
  if (profile?.method === "POWER_TIME" && appliance.source?.metrics?.typicalPowerW &&
      appliance.source.metrics.typicalPowerW !== appliance.source.reference) {
    return "Potência operacional: fonte complementar por métrica; não atribuída à fonte de standby";
  }
  if (appliance.source && profile?.method === "POWER_TIME" && appliance.power !== undefined &&
      (profile.typicalPowerW === undefined || appliance.power !== profile.typicalPowerW)) {
    return "Potência informada/ajustada pelo usuário; consulte a origem das demais métricas";
  }
  return appliance.source?.type === "PBE" ? "PBE / Inmetro"
  : appliance.source?.type === "MANUFACTURER" ? "Fabricante"
  : appliance.source?.type === "ENERGY_STAR" ? "ENERGY STAR (referência internacional)"
  : appliance.source?.type === "EPREL" ? "EPREL (União Europeia)"
  : appliance.source?.type === "WATTSTATUS_GENERIC" ? "Perfil genérico WattStatus"
  : appliance.integrationProvider === "smartthings" ? "Samsung SmartThings"
  : appliance.integrationProvider ? `Integração: ${appliance.integrationProvider}` : "Dados informados pelo usuário";
};
export function getMonthlyEstimate(
  appliances: Appliance[],
  year: number,
  month: number,
) {
  const end = new Date(year, month, 1);
  const days = new Date(year, month, 0).getDate();
  const rows = appliances
    .filter((appliance) => {
      if (appliance.monitoringOnly) return false;
      const created = new Date(appliance.createdAt);
      return Number.isFinite(created.getTime()) && created < end;
    })
    .map((appliance) => {
      const estimate = estimateAppliance(appliance, days);
      return {
        id: appliance.id,
        name: appliance.name,
        consumo: estimate.consumption,
        custo: estimate.cost,
      };
    })
    .sort((a, b) => b.custo - a.custo);
  return {
    rows,
    days,
    consumption: rows.reduce((sum, row) => sum + row.consumo, 0),
    cost: rows.reduce((sum, row) => sum + row.custo, 0),
  };
}
export function getEstimateHistory(
  appliances: Appliance[],
  year: number,
  month: number,
) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, month - 6 + index, 1);
    const estimate = getMonthlyEstimate(
      appliances,
      date.getFullYear(),
      date.getMonth() + 1,
    );
    return {
      month: date.toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      }),
      consumption: estimate.consumption,
      cost: estimate.cost,
    };
  });
}
