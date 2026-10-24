import type { EnergyInterval } from "@/hooks/useEnergyHistory";

// Decoder for backend/src/modules/energy/energy-compact.ts (?format=columns).
interface CompactIntervals {
  format: "columns-v1";
  strings: string[];
  rows: Array<Array<number | null>>;
}

const ABSENT = -2;
const NULL = -1;

export const expandIntervals = (body: EnergyInterval[] | CompactIntervals): EnergyInterval[] => {
  if (Array.isArray(body)) return body;
  if (body?.format !== "columns-v1") throw new Error("Formato de medições desconhecido");
  const { strings } = body;
  const text = (at: number) => (at === NULL ? null : strings[at]);
  return body.rows.map(([appliance, provider, device, start, duration, kWh, cost, tariff, property, room, moved]) => {
    const item: EnergyInterval = {
      applianceId: text(appliance as number),
      provider: strings[provider as number],
      deviceId: strings[device as number],
      startAt: new Date(start as number).toISOString(),
      endAt: new Date((start as number) + (duration as number)).toISOString(),
      consumptionKWh: kWh as number,
      cost,
      tariffValue: tariff,
      source: "iot",
      readingType: "interval",
    };
    if (property !== ABSENT) item.propertyId = text(property as number);
    if (room !== ABSENT) item.roomId = text(room as number);
    if (moved !== ABSENT) item.locationChanged = moved === 1;
    return item;
  });
};
