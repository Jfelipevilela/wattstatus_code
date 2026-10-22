import type { EnergyInterval } from "@/hooks/useEnergyHistory";

export const localMonthKey = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const summarizeMeasured = (intervals: EnergyInterval[]) => ({
  consumptionKWh: intervals.reduce((sum, row) => sum + row.consumptionKWh, 0),
  knownCost: intervals.reduce((sum, row) => sum + (row.cost ?? 0), 0),
  costComplete: intervals.every((row) => row.cost !== null),
});

export const measuredByMonth = (intervals: EnergyInterval[]) => {
  const grouped = new Map<string, number>();
  for (const row of intervals) {
    const month = localMonthKey(row.endAt);
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
