import { ApiError } from "../../middleware/error-handler";
import type { EnergyProfile } from "../catalog/catalog.types";
import { referenceMonthly } from "../catalog/reference";

type Estimate = {
  profile: EnergyProfile;
  power: number;
  usageHours: number;
  days: number;
  cyclesPerMonth?: number;
};
type Measurement = {
  profile: { method: "LIVE_MEASUREMENT" };
  counterStartKwh: number;
  counterEndKwh: number;
  startAt: Date;
  endAt: Date;
};
const bounded = (value: number | undefined, max: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= max;

export const calculateConsumption = (input: Estimate | Measurement) => {
  if ("counterStartKwh" in input) {
    if (
      input.profile.method !== "LIVE_MEASUREMENT" ||
      !(input.startAt instanceof Date) ||
      !(input.endAt instanceof Date) ||
      !bounded(input.counterStartKwh, Number.MAX_SAFE_INTEGER) ||
      !bounded(input.counterEndKwh, Number.MAX_SAFE_INTEGER) ||
      input.counterEndKwh < input.counterStartKwh ||
      !Number.isFinite(input.startAt.getTime()) ||
      !Number.isFinite(input.endAt.getTime()) ||
      input.endAt <= input.startAt
    ) {
      throw new ApiError(400, "Intervalo de medição inválido.");
    }
    return {
      consumptionKWh: input.counterEndKwh - input.counterStartKwh,
      consumptionType: "METERED" as const,
    };
  }
  if (
    !bounded(input.days, 31) ||
    !Number.isInteger(input.days) ||
    input.days < 1 ||
    !bounded(input.usageHours, 24) ||
    !bounded(input.power, 100000)
  ) {
    throw new ApiError(400, "Parâmetros de uso inválidos.");
  }
  let consumptionKWh: number;
  switch (input.profile.method) {
    case "REFERENCE_PERIOD":
      if (!bounded(input.profile.value, 100000) || input.profile.unit !== "kWh" || !["DAY", "MONTH", "YEAR"].includes(input.profile.period))
        throw new ApiError(400, "Referência de período inválida.");
      consumptionKWh = referenceMonthly(input.profile);
      break;
    case "POWER_TIME":
      if (input.power <= 0)
        throw new ApiError(400, "Informe a potência do aparelho.");
      consumptionKWh = (input.power * input.usageHours * input.days) / 1000;
      break;
    case "REFERENCE_MONTHLY":
      if (!bounded(input.profile.referenceMonthlyKwh, 100000))
        throw new ApiError(400, "Referência mensal inválida.");
      // Label reference is a complete standardized month; do not scale by user hours/days.
      consumptionKWh = input.profile.referenceMonthlyKwh;
      break;
    case "PER_CYCLE":
      if (
        !bounded(input.profile.energyPerCycleKwh, 10000) ||
        !bounded(input.cyclesPerMonth, 1000) ||
        !Number.isInteger(input.cyclesPerMonth)
      ) {
        throw new ApiError(400, "Informe de 0 a 1000 ciclos por mês.");
      }
      consumptionKWh = input.profile.energyPerCycleKwh * input.cyclesPerMonth!;
      break;
    default:
      throw new ApiError(400, "Método de consumo inválido.");
  }
  return { consumptionKWh, consumptionType: "ESTIMATED" as const };
};
