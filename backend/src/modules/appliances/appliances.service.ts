import { randomUUID } from "crypto";
import { ApiError } from "../../middleware/error-handler";
import { MongoDatabase } from "../../storage/mongo-db";
import { ApplianceRecord, CalculationInput } from "../../types";
import { calculateAppliance } from "../calculations/calculation.service";
import { SmartThingsIntegration } from "../integrations/providers/smartthings";
import { resolveAccessToken } from "../integrations/smartthings-oauth";
import { extractCumulativeKWh, extractReportCumulativeKWh } from "../energy/energy-history";
import {
  applianceInputSchema,
  applianceUpdateSchema,
} from "./appliances.schema";
import { logger } from "../../logging/logger";
import { normalizeEnergyProfile } from "../catalog/reference";

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

  private async readOwnedMeasurement(userId: string, input: CalculationInput) {
    if (!input.integrationProvider && !input.integrationDeviceId) {
      if (input.measuredConsumptionKWh !== undefined)
        throw new ApiError(400, "Medição exige uma integração autorizada.");
      return {};
    }
    if (
      input.integrationProvider !== "smartthings" ||
      !input.integrationDeviceId
    )
      throw new ApiError(400, "Integração inválida.");
    const token = await resolveAccessToken(this.db, userId);
    if (!token)
      throw new ApiError(
        400,
        "Conecte sua conta SmartThings antes de importar.",
      );
    const provider = new SmartThingsIntegration(token);
    const devices = await provider.listDevices();
    if (!devices.some((device) => device.id === input.integrationDeviceId))
      throw new ApiError(404, "Dispositivo não encontrado.");
    const status = await provider.getDeviceStatus(input.integrationDeviceId);
    const counterKWh = extractCumulativeKWh(status.raw) ?? extractReportCumulativeKWh(status.raw);
    // Missing telemetry is not zero and must not erase the last verified reading.
    if (counterKWh === null) return {};
    return {
      measuredConsumptionKWh: counterKWh,
      consumptionType: "METERED" as const,
      measurement: {
        method: "LIVE_MEASUREMENT" as const,
        readingType: "cumulative" as const,
        counterKWh,
        capturedAt: new Date().toISOString(),
      },
    };
  }

  private resolveCreatedAt(timestamp?: string) {
    if (!timestamp) return new Date().toISOString();

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  async list(userId: string) {
    if (this.placement) await this.placement.ensureDefault(userId);
    const rows = await this.db.listAppliances(userId);
    return rows.map((row) => ({
      ...row,
      origin:
        row.origin ||
        (row.integrationProvider === "smartthings"
          ? "SMARTTHINGS"
          : row.integrationProvider
            ? "INTEGRATION"
            : "MANUAL"),
      energyProfile: row.energyProfile || { method: "POWER_TIME" },
      consumptionType: row.consumptionType || "ESTIMATED",
    }));
  }

  async create(userId: string, input: CalculationInput) {
    input = applianceInputSchema.parse(input);
    const catalog = input.catalogDeviceId
      ? await this.db.getCatalogDevice(input.catalogDeviceId)
      : null;
    if (input.catalogDeviceId && !catalog)
      throw new ApiError(404, "Aparelho não encontrado no catálogo.");
    // Snapshot trusted reference data; catalog updates must not change existing appliances.
    input = {
      ...input,
      energyProfile: normalizeEnergyProfile(catalog?.energyProfile ||
        input.energyProfile || { method: "POWER_TIME" }),
    };
    const measurement = await this.readOwnedMeasurement(userId, input);
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
      catalogDeviceId: input.catalogDeviceId,
      energyProfile: input.energyProfile,
      cyclesPerMonth: input.cyclesPerMonth,
      room: input.room,
      origin: input.integrationProvider
        ? "SMARTTHINGS"
        : catalog
          ? "CATALOG"
          : "MANUAL",
      source: catalog?.source,
      consumptionType: "ESTIMATED",
      ...measurement,
      integrationProvider: input.integrationProvider,
      integrationDeviceId: input.integrationDeviceId,
      ...(placement ? placement : {}),
      ...(input.integrationProvider && input.integrationDeviceId ? { importKey: `${userId}:${input.integrationProvider}:${input.integrationDeviceId}` } : {}),
    };

    try {
      await this.db.addAppliance(record);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === "DEVICE_ALREADY_IMPORTED" ||
          err.message.includes("E11000"))
      ) {
        throw new ApiError(409, "Dispositivo já importado");
      }
      throw err;
    }
    logger.info(
      catalog
        ? "appliance.catalog_created"
        : input.integrationProvider
          ? "integration.device_added"
          : "appliance.manual_created",
      {
        method: input.energyProfile?.method,
        ...(catalog ? { catalogDeviceId: catalog.id } : {}),
      },
    );
    return record;
  }

  async update(
    userId: string,
    applianceId: string,
    input: Partial<CalculationInput>,
  ) {
    input = applianceUpdateSchema.parse(input);
    const existing = (await this.db.listAppliances(userId)).find(
      (item) => item.id === applianceId,
    );
    if (!existing) {
      throw new ApiError(404, "Aparelho n\u00e3o encontrado");
    }
    if (
      (input.catalogDeviceId &&
        input.catalogDeviceId !== existing.catalogDeviceId) ||
      (input.integrationProvider &&
        input.integrationProvider !== existing.integrationProvider) ||
      (input.integrationDeviceId &&
        input.integrationDeviceId !== existing.integrationDeviceId)
    ) {
      throw new ApiError(
        400,
        "Não é permitido trocar o vínculo de um aparelho existente.",
      );
    }

    const payload: CalculationInput = {
      name: input.name || existing.name,
      power: input.power ?? existing.power,
      usageHours: input.usageHours ?? existing.usageHours,
      days: input.days ?? existing.days,
      tariff: input.tariff || existing.tariff,
      tariffValue:
        input.tariffValue ??
        (input.tariff && input.tariff !== existing.tariff
          ? undefined
          : existing.tariffValue),
      measuredConsumptionKWh: existing.measuredConsumptionKWh ?? undefined,
      integrationProvider:
        input.integrationProvider ?? existing.integrationProvider ?? undefined,
      integrationDeviceId:
        input.integrationDeviceId ?? existing.integrationDeviceId ?? undefined,
      energyProfile: existing.catalogDeviceId
        ? existing.energyProfile
        : (input.energyProfile ?? existing.energyProfile),
      cyclesPerMonth: input.cyclesPerMonth ?? existing.cyclesPerMonth,
      room: input.room ?? existing.room,
    };
    // Old provider links are read-only here; editing usage must not invalidate legacy metadata.
    applianceInputSchema.parse({
      ...payload,
      integrationProvider: undefined,
      integrationDeviceId: undefined,
    });
    const measurement =
      input.measuredConsumptionKWh !== undefined
        ? await this.readOwnedMeasurement(userId, payload)
        : {};

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
      ...measurement,
      ...(payload.integrationProvider && payload.integrationDeviceId
        ? {
            importKey: `${userId}:${payload.integrationProvider}:${payload.integrationDeviceId}`,
          }
        : {}),
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
