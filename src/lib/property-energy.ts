import type { Appliance } from "../hooks/useAppliances";
import type { EnergyInterval } from "../hooks/useEnergyHistory";
import type { Room } from "../types/property";
import { estimateAppliance } from "./energy";

export interface EnergyBucket {
  estimatedKWh: number;
  estimatedCost: number;
  applianceCount: number;
  estimatedApplianceCount?: number;
  measuredKWh: number;
  measuredCost: number;
  // Some measured interval had no tariff, so measuredCost is a lower bound.
  measuredCostIncomplete: boolean;
  measuredIntervals: number;
}

const emptyBucket = (): EnergyBucket => ({
  estimatedKWh: 0,
  estimatedCost: 0,
  applianceCount: 0,
  estimatedApplianceCount: 0,
  measuredKWh: 0,
  measuredCost: 0,
  measuredCostIncomplete: false,
  measuredIntervals: 0,
});

export const UNASSIGNED = "__unassigned__";

// Legacy appliances without a property belong to the primary property.
export const appliancePropertyId = (appliance: Appliance, primaryId: string | null) =>
  appliance.propertyId ?? primaryId;

export interface PropertyEnergy {
  total: EnergyBucket;
  byRoom: Map<string, EnergyBucket>;
  // Measured intervals whose appliance moved between readings: real energy
  // that cannot be pinned to one room.
  unattributedMeasuredKWh: number;
}

// Estimated values come from the current appliance setup; measured values come
// only from intervals captured while the appliance was in this property.
// Each appliance and each interval is counted exactly once.
export const aggregatePropertyEnergy = (
  propertyId: string,
  primaryId: string | null,
  appliances: Appliance[],
  rooms: Room[],
  intervals: EnergyInterval[],
  daysInMonth: number,
): PropertyEnergy => {
  const roomIds = new Set(rooms.map((room) => room.id));
  const byRoom = new Map<string, EnergyBucket>([[UNASSIGNED, emptyBucket()]]);
  for (const room of rooms) byRoom.set(room.id, emptyBucket());
  const total = emptyBucket();

  for (const appliance of appliances) {
    if (appliancePropertyId(appliance, primaryId) !== propertyId) continue;
    const key = appliance.roomId && roomIds.has(appliance.roomId) ? appliance.roomId : UNASSIGNED;
    const { consumption, cost, available } = estimateAppliance(appliance, daysInMonth);
    for (const bucket of [byRoom.get(key)!, total]) {
      bucket.estimatedKWh += consumption;
      bucket.estimatedCost += cost;
      bucket.applianceCount += 1;
      if (available) bucket.estimatedApplianceCount! += 1;
    }
  }

  let unattributedMeasuredKWh = 0;
  for (const interval of intervals) {
    if (interval.propertyId !== propertyId) continue;
    const buckets = [total];
    if (interval.locationChanged) unattributedMeasuredKWh += interval.consumptionKWh;
    else buckets.push(byRoom.get(interval.roomId && roomIds.has(interval.roomId) ? interval.roomId : UNASSIGNED)!);
    for (const bucket of buckets) {
      bucket.measuredKWh += interval.consumptionKWh;
      bucket.measuredIntervals += 1;
      if (interval.cost === null) bucket.measuredCostIncomplete = true;
      else bucket.measuredCost += interval.cost;
    }
  }
  return { total, byRoom, unattributedMeasuredKWh };
};

export const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
