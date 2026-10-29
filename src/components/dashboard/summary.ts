import type { Appliance } from "@/hooks/useAppliances";
import type { EnergyInterval } from "@/hooks/useEnergyHistory";
import { localMonthKey, summarizeMeasured } from "@/lib/measured";
import { zonedParts } from "@/lib/timezone";

export const GAP_THRESHOLD_MS = 2 * 3600000;

export type DataStatus = "estimated" | "measured" | "incomplete";

export interface EstimateRow {
  id?: string;
  name: string;
  consumo: number;
  custo: number;
}

export interface MeasuredSummary {
  consumptionKWh: number;
  lastReadingAt: string;
  knownCost: number;
  costComplete: boolean;
  intervals: number;
  longGaps: number;
  byAppliance: Map<string, number>;
  daily: Array<{ day: string; consumptionKWh: number }>;
}

export const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export function summarizeMonth(
  intervals: EnergyInterval[],
  appliances: Appliance[],
  year: number,
  month: number,
  timeZone?: string | null,
): MeasuredSummary | null {
  const key = monthKey(year, month);
  const current = intervals.filter((row) => localMonthKey(row.endAt, timeZone) === key);
  if (current.length === 0) return null;
  const totals = summarizeMeasured(current);
  const byAppliance = new Map<string, number>();
  const daily = new Map<number, number>();
  for (const row of current) {
    const name =
      appliances.find((item) => item.id === row.applianceId)?.name ||
      `Dispositivo ${row.deviceId}`;
    byAppliance.set(name, (byAppliance.get(name) ?? 0) + row.consumptionKWh);
    const day = zonedParts(new Date(row.endAt), timeZone).day;
    daily.set(day, (daily.get(day) ?? 0) + row.consumptionKWh);
  }
  return {
    ...totals,
    lastReadingAt: current.reduce((latest, row) => row.endAt > latest ? row.endAt : latest, current[0].endAt),
    intervals: current.length,
    longGaps: current.filter(
      (row) =>
        new Date(row.endAt).getTime() - new Date(row.startAt).getTime() >
        GAP_THRESHOLD_MS,
    ).length,
    byAppliance,
    daily: [...daily]
      .sort(([a], [b]) => a - b)
      .map(([day, consumptionKWh]) => ({
        day: String(day).padStart(2, "0"),
        consumptionKWh,
      })),
  };
}

export const percentChange = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;
