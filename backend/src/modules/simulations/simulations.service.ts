import { createHash, randomUUID } from "crypto";
import { STATE_TARIFFS } from "../../config/tariffs";
import { ApiError } from "../../middleware/error-handler";
import type { ApplianceRecord, PropertyRecord, RoomRecord } from "../../types";
import { calculateConsumption } from "../calculations/consumption";
import { catalogDeviceSchema, catalogIdSchema, energyProfileSchema } from "../catalog/catalog.schema";
import type { CatalogDevice, CatalogSource, EnergyProfile } from "../catalog/catalog.types";
import { normalizeEnergyProfile } from "../catalog/reference";
import { simulationCalculationSchema, simulationRoomParamsSchema } from "./simulations.schema";
import type { SimulationCalculationResult, SimulationItem, SimulationItemInput, SimulationItemResult,
  SimulationRoomResponse, SimulationSources, SimulationUsage } from "./simulations.types";

// Deliberately exposes reads only: no default migration, settings upsert,
// integration clients, device commands or persistence belong in this service.
export interface SimulationRepository {
  listProperties(userId: string): Promise<PropertyRecord[]>;
  listRooms(userId: string, propertyId: string): Promise<RoomRecord[]>;
  listAppliances(userId: string): Promise<ApplianceRecord[]>;
  getCatalogDevice(id: string): Promise<CatalogDevice | null>;
}

const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const propertyTariff = (property: PropertyRecord) => property.tariffValue ??
  (property.tariffState ? STATE_TARIFFS[property.tariffState] ?? null : null);
const safeProfile = (profile: unknown) => {
  const parsed = energyProfileSchema.safeParse(profile);
  return parsed.success ? structuredClone(parsed.data) : undefined;
};
const safeSource = (source: CatalogSource | undefined): CatalogSource | undefined => {
  if (!source) return undefined;
  const { type, reference, verifiedAt, official, manufacturer } = source;
  return { type, reference, verifiedAt, official, manufacturer };
};
const safeCatalog = (catalog: CatalogDevice | undefined) => {
  if (!catalog) return undefined;
  // Catalog fields are allowlisted so Mongo/internal fields never enter drafts.
  const { id, category, subcategory, brand, model, displayName, aliases, energyProfile, source,
    region, verified, isGeneric, active, variant, specifications, sources, profiles, equivalence } = catalog;
  const parsed = catalogDeviceSchema.safeParse({ id, category, subcategory, brand, model, displayName, aliases,
    energyProfile, source, region, verified, isGeneric, active, variant, specifications, sources, profiles, equivalence });
  return parsed.success ? structuredClone(parsed.data) : undefined;
};
const trustedOperatingPower = (catalog: CatalogDevice | undefined) => {
  if (!catalog?.verified) return 0;
  const entry = catalog.profiles?.find(entry => entry.profile.method === "POWER_TIME" &&
    entry.source.type !== "WATTSTATUS_GENERIC" && entry.source.official !== false);
  return entry?.profile.method === "POWER_TIME" ? entry.profile.typicalPowerW ?? 0 : 0;
};
const summarize = (items: SimulationItemResult[]): SimulationCalculationResult => {
  const unavailableCount = items.filter(item => !item.available).length;
  const knownMonthlyKwh = items.reduce((sum, item) => sum + (item.monthlyKwh ?? 0), 0);
  const knownMonthlyCost = items.reduce((sum, item) => sum + (item.monthlyCost ?? 0), 0);
  return {
    items: items.map(item => ({ ...item, sharePercent: unavailableCount === 0 && knownMonthlyKwh > 0
      ? (item.monthlyKwh ?? 0) / knownMonthlyKwh * 100 : null })),
    monthlyKwh: unavailableCount ? null : knownMonthlyKwh,
    monthlyCost: unavailableCount ? null : knownMonthlyCost,
    knownMonthlyKwh, knownMonthlyCost, unavailableCount,
  };
};

const mergeUsage = (base: SimulationUsage, override: SimulationUsage = {}): SimulationUsage => ({
  ...base, ...override,
  ...(override.cyclesPerMonth !== undefined ? { cyclesPerWeek: undefined } : {}),
  ...(override.cyclesPerWeek !== undefined ? { cyclesPerMonth: undefined } : {}),
});

export class SimulationService {
  constructor(private readonly repo: SimulationRepository) {}

  private applianceItem(appliance: ApplianceRecord): SimulationItem {
    const defaultUsage = {
      power: appliance.power, usageHours: appliance.usageHours, days: appliance.days,
      ...(appliance.cyclesPerWeek != null ? { cyclesPerWeek: appliance.cyclesPerWeek }
        : appliance.cyclesPerMonth != null ? { cyclesPerMonth: appliance.cyclesPerMonth } : {}),
      standbyEnabled: appliance.standbyEnabled ?? false,
      estimateByUsage: appliance.estimateByUsage ?? false,
    };
    const catalogSnapshot = safeCatalog(appliance.catalogSnapshot);
    const profile = safeProfile(appliance.energyProfile);
    const sourceDetails = safeSource(appliance.source) ?? catalogSnapshot?.source;
    const original = catalogSnapshot?.energyProfile ?? profile;
    const reference = original && normalizeEnergyProfile(original).method === "REFERENCE_PERIOD";
    const item: SimulationItem = {
      id: appliance.id, source: "USER_APPLIANCE", userApplianceId: appliance.id, quantity: 1,
      sourceFingerprint: fingerprint({ id: appliance.id, name: appliance.name, profile: appliance.energyProfile,
        catalog: catalogSnapshot, defaultUsage, propertyId: appliance.propertyId, roomId: appliance.roomId,
        tariff: appliance.tariff, tariffValue: appliance.tariffValue, sourceDetails }),
      name: appliance.name, defaultUsage,
      energyProfileSnapshot: profile,
      catalogSnapshot,
      sourceDetails,
      canEstimateByUsage: Boolean(reference),
      ...(appliance.measurement ? { measurementContext: {
        kind: appliance.measurement.readingType, capturedAt: appliance.measurement.capturedAt,
        ...(appliance.measurement.readingType === "interval" ? {
          consumptionKWh: appliance.measurement.consumptionKWh,
          startAt: appliance.measurement.startAt, endAt: appliance.measurement.endAt,
        } : {}),
      } } : {}),
    };
    return structuredClone(item);
  }

  async resolveCatalog(catalogDeviceId: string): Promise<SimulationItem> {
    const id = catalogIdSchema.parse(catalogDeviceId);
    const catalog = safeCatalog(await this.repo.getCatalogDevice(id) ?? undefined);
    if (!catalog) throw new ApiError(404, "Aparelho não encontrado no catálogo.");
    const profile = normalizeEnergyProfile(catalog.energyProfile);
    const power = profile.method === "POWER_TIME" ? profile.typicalPowerW ?? 0
      : trustedOperatingPower(catalog);
    return {
      id: randomUUID(), source: "CATALOG", catalogDeviceId: id, sourceFingerprint: fingerprint(catalog),
      quantity: 1, name: catalog.displayName, energyProfileSnapshot: structuredClone(catalog.energyProfile),
      catalogSnapshot: catalog, sourceDetails: catalog.source,
      defaultUsage: { power, usageHours: profile.method === "POWER_TIME" ? 1 : 0, days: 30,
        ...(profile.method === "PER_CYCLE" ? { cyclesPerMonth: 0 } : {}),
        standbyEnabled: profile.method === "POWER_TIME" && profile.standbyPowerW !== undefined,
        estimateByUsage: false },
      canEstimateByUsage: profile.method === "REFERENCE_PERIOD",
    };
  }

  private project(item: SimulationItem, input: SimulationItemInput, tariff: number): SimulationItemResult {
    const usage = mergeUsage(item.defaultUsage, input.usage);
    const originalReference = item.catalogSnapshot?.energyProfile;
    let profile: EnergyProfile | undefined = item.energyProfileSnapshot ? normalizeEnergyProfile(item.energyProfileSnapshot) : undefined;
    const reference = originalReference && normalizeEnergyProfile(originalReference);
    if (item.canEstimateByUsage) {
      if (usage.estimateByUsage === true) {
        // A personal POWER_TIME snapshot already selected by the owner wins.
        // Other alternatives only come from the frozen original catalog snapshot.
        const operating = item.catalogSnapshot?.profiles?.find(entry => entry.profile.method === "POWER_TIME")?.profile;
        profile = item.defaultUsage.estimateByUsage && profile?.method === "POWER_TIME" ? profile
          : operating?.method === "POWER_TIME" ? normalizeEnergyProfile(operating) : { method: "POWER_TIME" };
      } else if (reference?.method === "REFERENCE_PERIOD") profile = reference;
    }
    const power = input.usage?.power ?? (item.defaultUsage.power ||
      (item.canEstimateByUsage ? trustedOperatingPower(item.catalogSnapshot)
        : profile?.method === "POWER_TIME" ? profile.typicalPowerW ?? 0 : 0));
    if (!profile && power > 0) profile = { method: "POWER_TIME", typicalPowerW: power };
    const unavailable: SimulationItemResult = {
      id: input.id, name: item.name, quantity: input.quantity, available: false,
      reason: "Este aparelho não possui dados energéticos suficientes para simulação.",
      unitMonthlyKwh: null, monthlyKwh: null, monthlyCost: null, sharePercent: null,
    };
    if (!profile) return unavailable;
    try {
      const result = calculateConsumption({ profile, power, usageHours: usage.usageHours ?? 0, days: usage.days ?? 30,
        cyclesPerMonth: usage.cyclesPerMonth, cyclesPerWeek: usage.cyclesPerWeek, standbyEnabled: usage.standbyEnabled ?? false });
      const monthlyKwh = result.consumptionKWh * input.quantity;
      return { id: input.id, name: item.name, quantity: input.quantity, available: true, method: profile.method,
        energyProfileSnapshot: profile.method === "POWER_TIME" ? { ...profile, typicalPowerW: power } : profile,
        unitMonthlyKwh: result.consumptionKWh, monthlyKwh, monthlyCost: monthlyKwh * tariff, sharePercent: null };
    } catch (error) {
      // Invalid/missing persisted energy data is unavailable, never a fake zero.
      // Request overrides have already passed the strict runtime schema.
      if (error instanceof ApiError && error.status === 400) return unavailable;
      throw error;
    }
  }

  private async ownedRoom(userId: string, propertyId: string, roomId: string) {
    simulationRoomParamsSchema.parse({ propertyId, roomId });
    const property = (await this.repo.listProperties(userId)).find(row => row.id === propertyId && !row.archivedAt);
    if (!property) throw new ApiError(404, "Imóvel não encontrado.");
    const room = (await this.repo.listRooms(userId, propertyId)).find(row => row.id === roomId);
    if (!room) throw new ApiError(404, "Ambiente não encontrado neste imóvel.");
    return { property, room };
  }

  private baseline(property: PropertyRecord, appliances: ApplianceRecord[]): SimulationCalculationResult {
    return summarize(appliances.map(appliance => {
      const item = this.applianceItem(appliance);
      const tariff = appliance.tariffValue ?? propertyTariff(property) ?? STATE_TARIFFS[appliance.tariff] ?? 0;
      return this.project(item, item, tariff);
    }));
  }

  async loadRoom(userId: string, propertyId: string, roomId: string): Promise<SimulationRoomResponse> {
    const { property, room } = await this.ownedRoom(userId, propertyId, roomId);
    const appliances = (await this.repo.listAppliances(userId)).filter(row => row.propertyId === propertyId && row.roomId === roomId);
    const tariff = propertyTariff(property) ?? appliances[0]?.tariffValue ?? STATE_TARIFFS[appliances[0]?.tariff] ?? 0;
    return {
      scenario: { name: room.name, sourceType: "EXISTING_ENVIRONMENT", sourcePropertyId: propertyId,
        sourceRoomId: roomId, environmentType: room.type, propertyType: property.type === "commercial" ? "BUSINESS" : "RESIDENTIAL",
        tariffPerKwh: tariff, items: appliances.map(appliance => this.applianceItem(appliance)) },
      baseline: this.baseline(property, appliances),
    };
  }

  async calculate(userId: string, raw: unknown): Promise<SimulationCalculationResult> {
    const input = simulationCalculationSchema.parse(raw);
    const source = input.sourcePropertyId && input.sourceRoomId
      ? await this.ownedRoom(userId, input.sourcePropertyId, input.sourceRoomId) : undefined;
    // Load the owned appliances once for the entire request, not once per item.
    const appliances = await this.repo.listAppliances(userId);
    const owned = new Map(appliances.map(appliance => [appliance.id, appliance]));
    const catalog = new Map<string, SimulationItem>();
    for (const id of new Set(input.items.flatMap(item => item.catalogDeviceId ? [item.catalogDeviceId] : []))) {
      catalog.set(id, await this.resolveCatalog(id));
    }
    const items = input.items.map(item => {
      const appliance = item.userApplianceId ? owned.get(item.userApplianceId) : undefined;
      const resolved = appliance ? this.applianceItem(appliance) : item.catalogDeviceId ? catalog.get(item.catalogDeviceId) : undefined;
      if (!resolved) throw new ApiError(404, "Aparelho não encontrado.");
      if (resolved.sourceFingerprint !== item.sourceFingerprint) {
        throw new ApiError(409, "Os dados de origem mudaram. Carregue o aparelho novamente antes de simular.", "SIMULATION_SOURCE_CHANGED");
      }
      return this.project(resolved, item, input.tariffPerKwh);
    });
    const result = summarize(items);
    if (source) {
      const baseline = this.baseline(source.property, appliances.filter(appliance =>
        appliance.propertyId === input.sourcePropertyId && appliance.roomId === input.sourceRoomId));
      result.baseline = { monthlyKwh: baseline.monthlyKwh, monthlyCost: baseline.monthlyCost, unavailableCount: baseline.unavailableCount };
      const differenceKwh = result.monthlyKwh !== null && baseline.monthlyKwh !== null ? result.monthlyKwh - baseline.monthlyKwh : null;
      result.comparison = {
        differenceKwh,
        differenceCost: result.monthlyCost !== null && baseline.monthlyCost !== null ? result.monthlyCost - baseline.monthlyCost : null,
        differencePercent: differenceKwh !== null && baseline.monthlyKwh !== null && baseline.monthlyKwh > 0
          ? differenceKwh / baseline.monthlyKwh * 100 : null,
      };
    }
    return result;
  }

  async sources(userId: string): Promise<SimulationSources> {
    const [properties, appliances] = await Promise.all([
      this.repo.listProperties(userId), this.repo.listAppliances(userId),
    ]);
    const active = properties.filter(property => !property.archivedAt);
    const rooms = (await Promise.all(active.map(property => this.repo.listRooms(userId, property.id)))).flat();
    return {
      properties: active.map(property => ({ id: property.id, name: property.name, type: property.type,
        tariffPerKwh: propertyTariff(property) })),
      rooms: rooms.map(room => ({ id: room.id, propertyId: room.propertyId, name: room.name, type: room.type })),
      appliances: appliances.map(appliance => this.applianceItem(appliance)),
    };
  }
}
