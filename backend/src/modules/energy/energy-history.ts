export interface EnergySample {
  userId: string;
  applianceId: string | null;
  provider: string;
  deviceId: string;
  capturedAt: Date;
  counterKWh: number;
  tariffValue: number | null;
  source: "iot";
  readingType: "cumulative";
  createdAt: Date;
  sampleKey: string;
}

export interface EnergyInterval {
  applianceId: string | null;
  provider: string;
  deviceId: string;
  startAt: string;
  endAt: string;
  consumptionKWh: number;
  cost: number | null;
  tariffValue: number | null;
  source: "iot";
  readingType: "interval";
}

export const extractCumulativeKWh = (raw: unknown): number | null => {
  if (!raw || typeof raw !== "object") return null;
  const components = (raw as Record<string, unknown>).components;
  if (!components || typeof components !== "object") return null;
  const main = (components as Record<string, unknown>).main;
  if (!main || typeof main !== "object") return null;
  const meter = (main as Record<string, unknown>).energyMeter;
  if (!meter || typeof meter !== "object") return null;
  const energy = (meter as Record<string, unknown>).energy;
  if (!energy || typeof energy !== "object") return null;
  const { value, unit } = energy as Record<string, unknown>;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (unit === "kWh") return value;
  if (unit === "Wh") return value / 1000;
  return null;
};

export const toEnergyIntervals = (samples: EnergySample[]): EnergyInterval[] => {
  const last = new Map<string, EnergySample>();
  const intervals: EnergyInterval[] = [];
  for (const sample of [...samples].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())) {
    const key = `${sample.provider}\u0000${sample.deviceId}`;
    const previous = last.get(key);
    if (previous && sample.capturedAt > previous.capturedAt && sample.counterKWh >= previous.counterKWh) {
      const consumptionKWh = sample.counterKWh - previous.counterKWh;
      intervals.push({
        applianceId: sample.applianceId,
        provider: sample.provider,
        deviceId: sample.deviceId,
        startAt: previous.capturedAt.toISOString(),
        endAt: sample.capturedAt.toISOString(),
        consumptionKWh,
        tariffValue: sample.tariffValue,
        cost: sample.tariffValue === null ? null : consumptionKWh * sample.tariffValue,
        source: "iot",
        readingType: "interval",
      });
    }
    last.set(key, sample);
  }
  return intervals;
};
