import type { EnergyProfile } from "../catalog/catalog.types";
import { normalizeEnergyProfile } from "../catalog/reference";

export interface MeasuredInterval { kWh: number; startAt: string; endAt: string; }
export function selectEnergyMethod(profile?: EnergyProfile, interval?: MeasuredInterval) {
  if (interval && Number.isFinite(interval.kWh) && interval.kWh >= 0 &&
      Number.isFinite(Date.parse(interval.startAt)) && Date.parse(interval.endAt) > Date.parse(interval.startAt)) {
    return { method: "LIVE_MEASUREMENT" as const, measurementType: "METERED" as const, interval };
  }
  if (profile) {
    const normalized = normalizeEnergyProfile(profile);
    if (normalized.method !== "POWER_TIME" || (Number.isFinite(normalized.typicalPowerW) && normalized.typicalPowerW! > 0)) {
      return { method: normalized.method, measurementType: "ESTIMATED" as const, profile: normalized };
    }
  }
  return { method: "UNAVAILABLE" as const, measurementType: null };
}
