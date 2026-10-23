export interface EnergySample {
  userId: string;
  applianceId: string | null;
  provider: string;
  deviceId: string;
  capturedAt: Date;
  counterKWh: number;
  tariffValue: number | null;
  source: "iot";
  // cumulative: counterKWh is a meter total. delta: counterKWh is the energy
  // used between startAt and capturedAt (Samsung powerConsumptionReport).
  readingType: "cumulative" | "delta";
  startAt?: Date;
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

type Report = { energy?: unknown; deltaEnergy?: unknown; start?: unknown; end?: unknown };

const readReport = (raw: unknown): Report | null => {
  const main = (raw as { components?: { main?: Record<string, unknown> } } | null)?.components?.main;
  const value = (main?.powerConsumptionReport as { powerConsumption?: { value?: unknown } } | undefined)
    ?.powerConsumption?.value;
  return value && typeof value === "object" ? (value as Report) : null;
};

// Samsung appliances without energyMeter keep a running total in the report.
export const extractReportCumulativeKWh = (raw: unknown): number | null => {
  const energy = readReport(raw)?.energy;
  return typeof energy === "number" && Number.isFinite(energy) && energy > 0 ? energy / 1000 : null;
};

// Devices whose report has no running total (energy 0), such as Samsung TVs,
// still report the energy used in each ~15 min window.
export const extractReportDelta = (raw: unknown) => {
  const report = readReport(raw);
  if (!report) return null;
  const { deltaEnergy, start, end } = report;
  if (typeof deltaEnergy !== "number" || !Number.isFinite(deltaEnergy) || deltaEnergy < 0) return null;
  if (typeof start !== "string" || typeof end !== "string") return null;
  const startAt = new Date(start);
  const endAt = new Date(end);
  if (!(endAt.getTime() > startAt.getTime())) return null;
  return { deltaKWh: deltaEnergy / 1000, startAt, endAt };
};

export interface EnergyReadingStore {
  saveEnergySample(userId: string, provider: string, deviceId: string, counterKWh: number, capturedAt?: Date): Promise<void>;
  saveEnergyDelta(userId: string, provider: string, deviceId: string, deltaKWh: number, startAt: Date, endAt: Date): Promise<void>;
}

// Stores whichever energy reading the status carries. A cumulative counter
// always wins, so a device is never counted twice.
export const saveDeviceReading = async (
  db: EnergyReadingStore,
  userId: string,
  provider: string,
  deviceId: string,
  raw: unknown,
  capturedAt?: Date
) => {
  const counter = extractCumulativeKWh(raw) ?? extractReportCumulativeKWh(raw);
  if (counter !== null) {
    await db.saveEnergySample(userId, provider, deviceId, counter, capturedAt);
    return "cumulative" as const;
  }
  const delta = extractReportDelta(raw);
  if (delta) {
    await db.saveEnergyDelta(userId, provider, deviceId, delta.deltaKWh, delta.startAt, delta.endAt);
    return "delta" as const;
  }
  return null;
};

export const ENERGY_CAPABILITIES = ["energyMeter", "powerConsumptionReport"];

export const toEnergyIntervals = (samples: EnergySample[]): EnergyInterval[] => {
  const last = new Map<string, EnergySample>();
  const intervals: EnergyInterval[] = [];
  for (const sample of [...samples].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())) {
    if (sample.readingType === "delta") {
      if (sample.startAt) {
        intervals.push({
          applianceId: sample.applianceId,
          provider: sample.provider,
          deviceId: sample.deviceId,
          startAt: sample.startAt.toISOString(),
          endAt: sample.capturedAt.toISOString(),
          consumptionKWh: sample.counterKWh,
          tariffValue: sample.tariffValue,
          cost: sample.tariffValue === null ? null : sample.counterKWh * sample.tariffValue,
          source: "iot",
          readingType: "interval",
        });
      }
      continue;
    }
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
