import type { EnergyInterval } from "@/hooks/useEnergyHistory";
import { zonedMonthKey } from "./timezone";

// Month of an instant in the given IANA zone; the browser zone when omitted.
export const localMonthKey = (iso: string, timeZone?: string | null) => zonedMonthKey(iso, timeZone);

export const summarizeMeasured = (intervals: EnergyInterval[]) => ({
  consumptionKWh: intervals.reduce((sum, row) => sum + row.consumptionKWh, 0),
  knownCost: intervals.reduce((sum, row) => sum + (row.cost ?? 0), 0),
  costComplete: intervals.every((row) => row.cost !== null),
});

// Intervals are filed in the month their reading ended.
export const measuredByMonth = (intervals: EnergyInterval[], timeZone?: string | null) => {
  const grouped = new Map<string, number>();
  for (const row of intervals) {
    const month = localMonthKey(row.endAt, timeZone);
    grouped.set(month, (grouped.get(month) ?? 0) + row.consumptionKWh);
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([month, consumptionKWh]) => ({ month, consumptionKWh }));
};

export const measuredByDevice = (intervals: EnergyInterval[]) => {
  const grouped = new Map<string, { applianceId: string | null; deviceId: string; tariffValue: number | null; consumptionKWh: number; cost: number | null }>();
  for (const row of intervals) {
    const key = JSON.stringify([row.applianceId, row.deviceId, row.tariffValue]);
    const existing = grouped.get(key) ?? { applianceId: row.applianceId, deviceId: row.deviceId, tariffValue: row.tariffValue, consumptionKWh: 0, cost: row.cost === null ? null : 0 };
    existing.consumptionKWh += row.consumptionKWh;
    if (existing.cost !== null && row.cost !== null) existing.cost += row.cost;
    grouped.set(key, existing);
  }
  return [...grouped.values()];
};
