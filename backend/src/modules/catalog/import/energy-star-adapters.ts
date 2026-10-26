import type { EnergyProfile } from "../catalog.types";
import { decimal, text } from "./normalizer";

// Versioned mappings from the published CSV headers, not category-derived energy guesses.
export const energyStarAdapters = {
  "energystar-refrigerator-csv-v1": { category: "kitchen", subcategory: "Geladeira", title: "Geladeira", annual: "Annual Energy Use (kWh/yr)" },
  "energystar-freezer-csv-v1": { category: "kitchen", subcategory: "Freezer", title: "Freezer", annual: "Annual Energy Use (kWh/yr)" },
  "energystar-room-ac-csv-v1": { category: "climate", subcategory: "Ar-condicionado", title: "Ar-condicionado", annual: "Annual Energy Use (kWh/yr)" },
  "energystar-television-csv-v1": { category: "entertainment", subcategory: "TV", title: "TV", annual: "Reported Annual Energy Consumption (kWh)",
    operating: "Reported On Mode Power (per the Federal Test Procedure) (watts)", standby: "Measured Standby Mode Power (Watts)" },
  "energystar-display-csv-v1": { category: "computing", subcategory: "Monitor", title: "Monitor", annual: "Monitor Total Energy Consumption at 115 Volts (kWh/yr)",
    operating: "On Mode Power (watts)" },
} as const;
export type EnergyStarAdapter = keyof typeof energyStarAdapters;

export function normalizeEnergyStarRow(row: Record<string, string>, adapter: EnergyStarAdapter) {
  const definition = energyStarAdapters[adapter];
  for (const column of ["ENERGY STAR Unique ID", "Markets", "Brand Name", "Model Number", definition.annual,
    ...("operating" in definition ? [definition.operating] : []), ...("standby" in definition ? [definition.standby] : [])]) {
    if (!Object.prototype.hasOwnProperty.call(row, column)) throw new Error("SOURCE_COLUMNS_CHANGED");
  }
  if (!row.Markets.split(",").map(text).includes("United States")) throw new Error("US_MARKET_REQUIRED");
  const externalId = text(row["ENERGY STAR Unique ID"]);
  if (!externalId) throw new Error("EXTERNAL_ID_REQUIRED");
  const optional = (column: string) => text(row[column]) === "" ? undefined : decimal(row[column], "US");
  const annual = optional(definition.annual);
  const operating = "operating" in definition ? optional(definition.operating) : undefined;
  const standby = "standby" in definition ? optional(definition.standby) : undefined;
  if ([annual, operating, standby].some(value => value !== undefined && (value < 0 || value > 100000))) throw new Error("ENERGY_METRIC_INVALID");
  const profiles: EnergyProfile[] = [];
  if (annual !== undefined) profiles.push({ method: "REFERENCE_PERIOD", value: annual, unit: "kWh", period: "YEAR", measurementType: "ESTIMATED",
    ...(adapter === "energystar-display-csv-v1" ? { testBasis: "Referência anual ENERGY STAR em ensaio a 115 V; não identifica a tensão de alimentação do produto." } : {}) });
  if (operating !== undefined && operating > 0) profiles.push({ method: "POWER_TIME", typicalPowerW: operating,
    ...(standby === undefined ? {} : { standbyPowerW: standby }), measurementType: "ESTIMATED" });
  if (!profiles.length) profiles.push({ method: "POWER_TIME", measurementType: "ESTIMATED" });
  const specifications: Record<string, string | number> = {};
  const productType = text(row["Product Type"] || row.Type);
  if (adapter === "energystar-display-csv-v1" && !["Monitor", "Signage Display"].includes(productType)) throw new Error("DISPLAY_TYPE_UNSUPPORTED");
  if (productType) specifications.productType = productType;
  // Descriptive metadata is optional. Inconsistent values must not discard valid energy data.
  const descriptiveNumber = (key: string, column: string, maximum: number) => {
    try {
      const value = optional(column);
      if (value !== undefined && value > 0 && value <= maximum) specifications[key] = value;
    } catch { /* Missing or malformed optional source metadata is omitted. */ }
  };
  const descriptiveText = (key: string, column: string) => {
    const value = text(row[column]);
    if (value && value.length <= 200 && !/^(?:N\/A|None|Not Applicable)$/i.test(value)) specifications[key] = value;
  };
  if (adapter === "energystar-television-csv-v1" || adapter === "energystar-display-csv-v1") {
    const television = adapter === "energystar-television-csv-v1";
    descriptiveNumber("screenSizeInches", television ? "Diagonal Viewable Screen Size (in.)" : "Screen Size (inches)", 250);
    descriptiveText("displayTechnology", television ? "Display Type" : "Panel Type");
    const resolution = television
      ? `${text(row["Native Horizontal Resolution (pixels)"])} x ${text(row["Native Vertical Resolution (pixels)"])}`
      : text(row["Native Resolution (pixels)"]);
    const pixels = resolution.match(/^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i);
    if (pixels && pixels.slice(1).every(value => Number(value) > 0 && Number(value) <= 32768)) {
      specifications.nativeResolution = `${Number(pixels[1])} × ${Number(pixels[2])}`;
    }
  }
  if (adapter === "energystar-refrigerator-csv-v1" || adapter === "energystar-freezer-csv-v1") {
    descriptiveNumber("volumeFt3", "Capacity (Total Volume) (ft3)", 100);
    descriptiveText("defrostType", "Defrost Type");
  }
  if (adapter === "energystar-room-ac-csv-v1") {
    specifications.capacityBtuH = decimal(row["Cooling Capacity (Btu/hr)"], "US");
    if (specifications.capacityBtuH <= 0 || specifications.capacityBtuH > 10000000) throw new Error("CAPACITY_INVALID");
    specifications.voltageLabel = text(row["Voltage (volts)"]);
    for (const [key, column] of [["heatingMode", "Heating Mode"], ["variableSpeedCompressor", "Variable Speed Compressor"]]) {
      if (["Yes", "No"].includes(text(row[column]))) specifications[key] = text(row[column]);
    }
  }
  if (adapter === "energystar-display-csv-v1") {
    // Sleep mode isn't automatically standby for all remaining hours.
    const sleep = optional("Sleep Mode Power (watts)");
    if (sleep !== undefined) {
      if (sleep < 0 || sleep > 100000) throw new Error("SLEEP_POWER_INVALID");
      specifications.sleepPowerW = sleep;
    }
  }
  const voltage = adapter === "energystar-room-ac-csv-v1" ? optional("Voltage (volts)") : undefined;
  const subcategory = adapter === "energystar-display-csv-v1" && productType === "Signage Display" ? "Display profissional" : definition.subcategory;
  const brand = text(row["Brand Name"]), model = text(row["Model Number"]);
  return { externalId, profiles, record: { id: `es-${externalId}`, category: definition.category, subcategory,
    brand, model, displayName: `${subcategory} ${brand} ${model}`.slice(0, 160), aliases: [],
    energyProfile: profiles[0], specifications,
    ...(voltage === undefined ? {} : { variant: { voltage } }), region: "US", verified: true, isGeneric: false } };
}
