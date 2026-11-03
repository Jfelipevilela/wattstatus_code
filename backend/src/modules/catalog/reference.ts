import type { EnergyProfile } from "./catalog.types";

// Legacy snapshots are interpreted in memory, never rewritten in user documents.
export const normalizeEnergyProfile = (profile: EnergyProfile) => profile.method === "REFERENCE_MONTHLY"
  ? { method: "REFERENCE_PERIOD" as const, value: profile.referenceMonthlyKwh, unit: "kWh" as const,
      period: "MONTH" as const, measurementType: "ESTIMATED" as const } : { ...profile, measurementType: "ESTIMATED" as const };

export const referenceMonthly = (profile: Extract<EnergyProfile, { method: "REFERENCE_PERIOD" }>) =>
  profile.period === "YEAR" ? profile.value / 12 : profile.period === "DAY" ? profile.value * 365 / 12 : profile.value;

export const referenceLabel = (profile: EnergyProfile) => {
  const value = normalizeEnergyProfile(profile);
  if (value.method !== "REFERENCE_PERIOD") return "";
  const period = { DAY: "dia", MONTH: "mês", YEAR: "ano" }[value.period];
  const original = `${value.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kWh/${period}`;
  return value.period === "MONTH" ? `${original} · Referência mensal de ensaio`
    : `${original} · Média mensal derivada da referência ${value.period === "YEAR" ? "anual" : "diária"}: ${referenceMonthly(value).toLocaleString("pt-BR")} kWh/mês`;
};
