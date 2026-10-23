import { calculateConsumption } from "../calculations/consumption";

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

import { extractCumulativeKWh, extractReportCumulativeKWh, extractReportDelta } from "../integrations/energy-reading";
export { extractCumulativeKWh, extractReportCumulativeKWh, extractReportDelta } from "../integrations/energy-reading";

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
      const { consumptionKWh } = calculateConsumption({ profile: { method: "LIVE_MEASUREMENT" },
        counterStartKwh: previous.counterKWh, counterEndKwh: sample.counterKWh,
        startAt: previous.capturedAt, endAt: sample.capturedAt });
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
