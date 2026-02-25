import { v4 as uuid } from "uuid";
import { ApiError } from "../../middleware/error-handler";
import { PostgresDatabase } from "../../storage/postgres-db";
import { ApplianceRecord, CalculationInput } from "../../types";
import { calculateAppliance } from "../calculations/calculation.service";

export class ApplianceService {
  constructor(private db: PostgresDatabase) {}

  private resolveCreatedAt(timestamp?: string) {
    if (!timestamp) return new Date().toISOString();

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  list(userId: string) {
    return this.db.listAppliances(userId);
  }

  async create(userId: string, input: CalculationInput) {
    const calc = calculateAppliance(input);

    const record: ApplianceRecord = {
      id: uuid(),
      userId,
      name: input.name || "Aparelho",
      power: input.power,
      status: calc.status,
      usageHours: input.usageHours,
      days: input.days,
      monthlyCost: calc.cost,
      monthlyConsumption: calc.consumptionKWh,
      tariff: input.tariff,
      createdAt: this.resolveCreatedAt(input.createdAt),
      measuredConsumptionKWh: input.measuredConsumptionKWh,
      integrationProvider: input.integrationProvider,
      integrationDeviceId: input.integrationDeviceId,
    };

    await this.db.addAppliance(record);
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
      measuredConsumptionKWh:
        input.measuredConsumptionKWh ?? existing.measuredConsumptionKWh ?? undefined,
      integrationProvider: input.integrationProvider ?? existing.integrationProvider ?? undefined,
      integrationDeviceId: input.integrationDeviceId ?? existing.integrationDeviceId ?? undefined,
    };

    const calc = calculateAppliance(payload);
    const updated: ApplianceRecord = {
      ...existing,
      ...payload,
      status: calc.status,
      monthlyCost: calc.cost,
      monthlyConsumption: calc.consumptionKWh,
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
