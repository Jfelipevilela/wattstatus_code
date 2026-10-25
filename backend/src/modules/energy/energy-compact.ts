import type { EnergyInterval } from "./energy-history";

// Columnar form of an interval list, opt-in with ?format=columns. A month of
// hourly readings is ~1.6 MB as plain JSON, almost all of it repeated ids and
// ISO dates. Lossless: src/lib/energy-compact.ts rebuilds the same objects.
//
// Row: [appliance, provider, device, startMs, durationMs, kWh, cost, tariff,
//       property, room, locationChanged]
// Text columns are indexes into `strings`; -1 means null, -2 means absent.
export interface CompactIntervals {
  format: "columns-v1";
  strings: string[];
  rows: Array<Array<number | null>>;
}

const ABSENT = -2;
const NULL = -1;
const KNOWN = new Set(["applianceId", "provider", "deviceId", "startAt", "endAt", "consumptionKWh", "cost",
  "tariffValue", "source", "readingType", "propertyId", "roomId", "locationChanged"]);

export const compactIntervals = (intervals: EnergyInterval[]): CompactIntervals | null => {
  const strings: string[] = [];
  const index = new Map<string, number>();
  const ref = (value: string | null | undefined) => {
    if (value === undefined) return ABSENT;
    if (value === null) return NULL;
    let at = index.get(value);
    if (at === undefined) { at = strings.length; strings.push(value); index.set(value, at); }
    return at;
  };
  // Instants repeat across devices; parse and check each one once. NaN marks
  // a date the decoder could not rebuild exactly.
  const instants = new Map<string, number>();
  const instant = (value: string) => {
    let ms = instants.get(value);
    if (ms === undefined) {
      ms = Date.parse(value);
      if (Number.isNaN(ms) || new Date(ms).toISOString() !== value) ms = NaN;
      instants.set(value, ms);
    }
    return ms;
  };
  const rows: CompactIntervals["rows"] = [];
  for (const item of intervals) {
    const start = instant(item.startAt);
    const end = instant(item.endAt);
    // Anything the decoder could not rebuild exactly keeps the plain format.
    if (item.source !== "iot" || item.readingType !== "interval" || Number.isNaN(start) || Number.isNaN(end)) return null;
    if (Object.keys(item).some((key) => !KNOWN.has(key))) return null;
    rows.push([
      ref(item.applianceId), ref(item.provider), ref(item.deviceId), start, end - start,
      item.consumptionKWh, item.cost, item.tariffValue,
      ref(item.propertyId), ref(item.roomId),
      item.locationChanged === undefined ? ABSENT : item.locationChanged ? 1 : 0,
    ]);
  }
  return { format: "columns-v1", strings, rows };
};

// Sends `intervals` in columns when the client asked and the data allows it.
export const intervalsBody = (intervals: EnergyInterval[], format: unknown) =>
  (format === "columns" && compactIntervals(intervals)) || intervals;
