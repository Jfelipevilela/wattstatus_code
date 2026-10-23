import { randomUUID } from "crypto";
import { ApiError } from "../../middleware/error-handler";
import { MongoDatabase } from "../../storage/mongo-db";
import { ApplianceRecord, CalculationInput } from "../../types";
import { calculateAppliance } from "../calculations/calculation.service";

// Validates that a property/room pair belongs to the user.
export interface PlacementResolver {
  ensureDefault(userId: string): Promise<unknown>;
  resolvePlacement(
    userId: string,
    propertyId: string | null | undefined,
    roomId: string | null | undefined
  ): Promise<{ propertyId: string; roomId: string | null }>;
}

export class ApplianceService {
  constructor(private db: MongoDatabase, private placement?: PlacementResolver) {}

  private resolveCreatedAt(timestamp?: string) {
    if (!timestamp) return new Date().toISOString();

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  async list(userId: string) {
    // Attaches legacy appliances to the default property before listing.
    if (this.placement) await this.placement.ensureDefault(userId);
    return this.db.listAppliances(userId);
  }

  async create(userId: string, input: CalculationInput) {
    const calc = calculateAppliance(input);
    const placement = this.placement
      ? await this.placement.resolvePlacement(userId, input.propertyId, input.roomId)
      : null;

    const record: ApplianceRecord = {
      id: randomUUID(),
      userId,
      name: input.name || "Aparelho",
      power: input.power,
      status: calc.status,
      usageHours: input.usageHours,
      days: input.days,
      monthlyCost: calc.cost,
      monthlyConsumption: calc.consumptionKWh,
      tariff: input.tariff,
      tariffValue: input.tariffValue,
      createdAt: this.resolveCreatedAt(input.createdAt),
      measuredConsumptionKWh: input.measuredConsumptionKWh,
      integrationProvider: input.integrationProvider,
      integrationDeviceId: input.integrationDeviceId,
      ...(placement ? placement : {}),
      ...(input.integrationProvider && input.integrationDeviceId ? { importKey: `${userId}:${input.integrationProvider}:${input.integrationDeviceId}` } : {}),
    };

    try {
      await this.db.addAppliance(record);
    } catch (err) {
      if (err instanceof Error && (err.message === "DEVICE_ALREADY_IMPORTED" || err.message.includes("E11000"))) {
        throw new ApiError(409, "Dispositivo já importado");
      }
      throw err;
    }
    return record;
  }

  async update(
    userId: string,
    applianceId: string,
    input: Partial<CalculationInput>
  ) {
    const existing = (await this.db.listAppliances(userId)).find(
      (item) => item.id === applianceId
    );
    if (!existing) {
      throw new ApiError(404, "Aparelho n\u00e3o encontrado");
    }

    const payload: CalculationInput = {
      name: input.name || existing.name,
      power: input.power ?? existing.power,
      usageHours: input.usageHours ?? existing.usageHours,
      days: input.days ?? existing.days,
      tariff: input.tariff || existing.tariff,
      tariffValue: input.tariffValue ?? (input.tariff && input.tariff !== existing.tariff ? undefined : existing.tariffValue),
      measuredConsumptionKWh:
        input.measuredConsumptionKWh ?? existing.measuredConsumptionKWh ?? undefined,
      integrationProvider: input.integrationProvider ?? existing.integrationProvider ?? undefined,
      integrationDeviceId: input.integrationDeviceId ?? existing.integrationDeviceId ?? undefined,
    };

    let placement: { propertyId: string; roomId: string | null } | null = null;
    if (this.placement && (input.propertyId !== undefined || input.roomId !== undefined)) {
      const propertyId = input.propertyId ?? existing.propertyId ?? null;
      const movedProperty = Boolean(input.propertyId) && input.propertyId !== existing.propertyId;
      const roomId = input.roomId !== undefined ? input.roomId : movedProperty ? null : existing.roomId ?? null;
      placement = await this.placement.resolvePlacement(userId, propertyId, roomId);
    }

    const calc = calculateAppliance(payload);
    const updated: ApplianceRecord = {
      ...existing,
      ...payload,
      ...(placement ? placement : {}),
      status: calc.status,
      monthlyCost: calc.cost,
      monthlyConsumption: calc.consumptionKWh,
      ...(payload.integrationProvider && payload.integrationDeviceId ? { importKey: `${userId}:${payload.integrationProvider}:${payload.integrationDeviceId}` } : {}),
    };

    const saved = await this.db.updateAppliance(userId, updated);
    if (!saved) {
      throw new ApiError(500, "Falha ao salvar aparelho");
    }
    return saved;
  }

  async delete(userId: string, applianceId: string) {
    const ok = await this.db.deleteAppliance(userId, applianceId);
    if (!ok) {
      throw new ApiError(404, "Aparelho n\u00e3o encontrado");
    }
    return true;
  }
}
