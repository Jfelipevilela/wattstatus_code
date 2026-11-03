import { STATE_TARIFFS } from "../../config/tariffs";
import { ApiError } from "../../middleware/error-handler";
import {
  CalculationInput,
  CalculationResult,
  ApplianceStatus,
} from "../../types";
import { calculateConsumption } from "./consumption";

export const calculateAppliance = (
  input: CalculationInput
): CalculationResult => {
  const tariff = input.tariffValue ?? STATE_TARIFFS[input.tariff];

  if (typeof tariff !== "number" || !Number.isFinite(tariff) || tariff <= 0) {
    throw new ApiError(400, "Estado n\u00e3o selecionado ou tarifa n\u00e3o encontrada");
  }

  const { consumptionKWh } = calculateConsumption({ profile: input.energyProfile || { method: "POWER_TIME" },
    power: input.power, usageHours: input.usageHours, days: input.days, cyclesPerMonth: input.cyclesPerMonth,
    cyclesPerWeek: input.cyclesPerWeek, standbyEnabled: input.standbyEnabled });
  const cost = consumptionKWh * tariff;

  let status: ApplianceStatus = "normal";
  if (consumptionKWh > 100) {
    status = "critical";
  } else if (consumptionKWh > 50) {
    status = "warning";
  }

  return { consumptionKWh, cost, status };
};
