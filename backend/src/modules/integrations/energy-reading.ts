export const extractCumulativeKWh = (raw: unknown): number | null => {
  if (!raw || typeof raw !== "object") return null;
  const components = (raw as Record<string, unknown>).components;
  if (!components || typeof components !== "object") return null;
  const main = (components as Record<string, unknown>).main;
  if (!main || typeof main !== "object") return null;
  const meter = (main as Record<string, unknown>).energyMeter;
  if (!meter || typeof meter !== "object") return null;
  const energy = (meter as Record<string, unknown>).energy;
  if (!energy || typeof energy !== "object") return null;
  const { value, unit } = energy as Record<string, unknown>;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (unit === "kWh") return value;
  if (unit === "Wh") return value / 1000;
  return null;
};

type Report = { energy?: unknown; deltaEnergy?: unknown; start?: unknown; end?: unknown };

const readReport = (raw: unknown): Report | null => {
  const main = (raw as { components?: { main?: Record<string, unknown> } } | null)?.components?.main;
  const value = (main?.powerConsumptionReport as { powerConsumption?: { value?: unknown } } | undefined)
    ?.powerConsumption?.value;
  return value && typeof value === "object" ? (value as Report) : null;
};

// Samsung appliances without energyMeter keep a running total in the report.
export const extractReportCumulativeKWh = (raw: unknown): number | null => {
  const energy = readReport(raw)?.energy;
  return typeof energy === "number" && Number.isFinite(energy) && energy > 0 ? energy / 1000 : null;
};

// Devices whose report has no running total (energy 0), such as Samsung TVs,
// still report the energy used in each ~15 min window.
export const extractReportDelta = (raw: unknown) => {
  const report = readReport(raw);
  if (!report) return null;
  const { deltaEnergy, start, end } = report;
  if (typeof deltaEnergy !== "number" || !Number.isFinite(deltaEnergy) || deltaEnergy < 0) return null;
  if (typeof start !== "string" || typeof end !== "string") return null;
  const startAt = new Date(start);
  const endAt = new Date(end);
  if (!(endAt.getTime() > startAt.getTime())) return null;
  return { deltaKWh: deltaEnergy / 1000, startAt, endAt };
};
