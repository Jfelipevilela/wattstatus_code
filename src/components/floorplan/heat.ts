import type { EnergyBucket } from "@/lib/property-energy";

export type HeatMetric = "estimated" | "measured";

export const metricValue = (bucket: EnergyBucket | undefined, metric: HeatMetric): number | null => {
  if (!bucket) return null;
  if (metric === "measured") return bucket.measuredIntervals > 0 ? bucket.measuredKWh : null;
  return bucket.applianceCount > 0 ? bucket.estimatedKWh : null;
};

// Rooms without data return null and are drawn hatched, never as "low".
export const heatScale = (values: Array<number | null>) => {
  const max = Math.max(0, ...values.filter((value): value is number => value !== null));
  return (value: number | null) => (value === null ? null : max > 0 ? value / max : 0);
};

// Green (low) to amber to orange (high).
export const heatColor = (intensity: number) => {
  const stops = [
    [187, 247, 208],
    [253, 230, 138],
    [251, 146, 60],
  ];
  const t = Math.min(1, Math.max(0, intensity)) * 2;
  const [a, b] = t <= 1 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const k = t <= 1 ? t : t - 1;
  const mix = a.map((value, index) => Math.round(value + (b[index] - value) * k));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
};

export const supportsWebGL = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
};
