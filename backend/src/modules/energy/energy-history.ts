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
  // Where the appliance was when the reading was captured. Absent on readings
  // taken before locations were recorded; never back-filled.
  propertyId?: string | null;
  roomId?: string | null;
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
  propertyId?: string | null;
  roomId?: string | null;
  // The appliance changed place between the two readings: the consumption is
  // real but cannot be attributed to one room.
  locationChanged?: boolean;
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

const intervalLocation = (previous: EnergySample, sample: EnergySample) => {
  const before = { propertyId: previous.propertyId ?? null, roomId: previous.roomId ?? null };
  const after = { propertyId: sample.propertyId ?? null, roomId: sample.roomId ?? null };
  if (before.propertyId === after.propertyId && before.roomId === after.roomId) return after;
  // Moved between readings: keep the property only if both ends agree.
  return {
    propertyId: before.propertyId === after.propertyId ? after.propertyId : null,
    roomId: null,
    locationChanged: Boolean(before.propertyId || after.propertyId),
  };
};

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
          propertyId: sample.propertyId ?? null,
          roomId: sample.roomId ?? null,
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
        ...intervalLocation(previous, sample),
      });
    }
    last.set(key, sample);
  }
  return intervals;
};
