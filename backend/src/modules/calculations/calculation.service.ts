import { STATE_TARIFFS } from "../../config/tariffs";
import { ApiError } from "../../middleware/error-handler";
import {
  CalculationInput,
  CalculationResult,
  ApplianceStatus,
} from "../../types";

export const calculateAppliance = (
  input: CalculationInput
): CalculationResult => {
  const tariff =
    STATE_TARIFFS[input.tariff as keyof typeof STATE_TARIFFS];

  if (!tariff) {
    throw new ApiError(400, "Estado n\u00e3o selecionado ou tarifa n\u00e3o encontrada");
  }

  const baseConsumption =
    (input.power * input.usageHours * input.days) / 1000;
  const consumptionKWh =
    input.measuredConsumptionKWh && input.measuredConsumptionKWh > 0
      ? input.measuredConsumptionKWh
      : baseConsumption;
  const cost = consumptionKWh * tariff;

  let status: ApplianceStatus = "normal";
  if (consumptionKWh > 100) {
    status = "critical";
  } else if (consumptionKWh > 50) {
    status = "warning";
  }

  return { consumptionKWh, cost, status };
};
