import { createHash } from "crypto";
import { z } from "zod";
import { catalogDeviceSchema } from "../catalog.schema";
import { catalogSeed } from "../catalog.seed";
import type { CatalogDevice, CatalogSource } from "../catalog.types";
import { normalizeEnergyProfile } from "../reference";
import { decimal, identityText, text, normalizeRawRecord } from "./normalizer";
import { validatePbeCategory } from "./pbe-adapters";

export const manifestSchema = z.object({
  provider: z.enum(["PBE", "ENERGY_STAR", "MANUFACTURER", "WATTSTATUS_GENERIC"]),
  adapter: z.enum(["curated-v1", "curated-csv-v1", "energystar-refrigerator-csv-v1"]),
  referenceUrl: z.string().url().max(1000), sourceVersion: z.string().min(1).max(100),
  retrievedAt: z.string().datetime(), verifiedAt: z.string().datetime(),
  manufacturer: z.string().min(1).max(80).optional(),
  numberLocale: z.enum(["BR", "US"]).optional(),
}).strict().superRefine((row, ctx) => {
  const url = new URL(row.referenceUrl);
  const trusted = row.provider === "PBE" ? /(^|\.)inmetro\.gov\.br$/.test(url.hostname) || url.hostname === "www.gov.br"
    : row.provider === "ENERGY_STAR" ? /(^|\.)energystar\.gov$/.test(url.hostname) : true;
  if (url.protocol !== "https:" || url.username || url.password || !trusted ||
      (row.provider === "MANUFACTURER" && !row.manufacturer)) ctx.addIssue({ code: "custom", message: "SOURCE_INVALID" });
});
export type ImportManifest = z.infer<typeof manifestSchema>;
export interface CatalogSourceProvider {
  provider: ImportManifest["provider"];
  normalize(raw: unknown, manifest: ImportManifest): CatalogDevice;
}

export class CuratedCatalogProvider implements CatalogSourceProvider {
  constructor(public provider: ImportManifest["provider"]) {}
  normalize(raw: unknown, manifest: ImportManifest): CatalogDevice {
    if (manifest.adapter === "curated-csv-v1") {
      const row = z.record(z.string()).parse(raw);
      const columns = ["id", "category", "subcategory", "brand", "model", "displayName", "region", "method", "value", "unit", "period", "typicalPowerW", "standbyPowerW", "energyPerCycleKwh", "voltage", "capacityBtuH", "registrationNumber"];
      if (Object.keys(row).some(key => !columns.includes(key))) throw new Error("CSV_COLUMNS_UNKNOWN");
      const energyProfile = Object.fromEntries(["method", "value", "unit", "period", "typicalPowerW", "standbyPowerW", "energyPerCycleKwh"].filter(key => row[key] !== undefined && row[key] !== "").map(key => [key, row[key]]));
      return this.normalize({ id: row.id, category: row.category, subcategory: row.subcategory, brand: row.brand || undefined,
        model: row.model || undefined, displayName: row.displayName, region: row.region, aliases: [], energyProfile,
        ...(row.voltage ? { variant: { voltage: row.voltage } } : {}), ...(row.capacityBtuH ? { specifications: { capacityBtuH: row.capacityBtuH } } : {}),
        source: { type: this.provider, reference: manifest.referenceUrl, verifiedAt: manifest.verifiedAt,
          ...(row.registrationNumber ? { registrationNumber: row.registrationNumber } : {}) },
        isGeneric: this.provider === "WATTSTATUS_GENERIC", verified: this.provider !== "WATTSTATUS_GENERIC" }, { ...manifest, adapter: "curated-v1" });
    }
    // Curated v1 is the existing validated WattStatus JSON contract, not a guessed PBE spreadsheet.
    const original = catalogDeviceSchema.parse(normalizeRawRecord(raw, manifest.numberLocale || (this.provider === "PBE" ? "BR" : "US")));
    if (manifest.adapter !== "curated-v1" || original.source.type !== this.provider || manifest.provider !== this.provider)
      throw new Error("ADAPTER_PROVIDER_MISMATCH");
    if (!catalogSeed.categories.some(row => row.id === original.category)) throw new Error("CATEGORY_UNKNOWN");
    const generic = this.provider === "WATTSTATUS_GENERIC";
    if ((this.provider === "PBE" && original.region !== "BR") || (this.provider === "ENERGY_STAR" && original.region !== "US")) throw new Error("REGION_MISMATCH");
    if (!generic && (!text(original.brand) || !text(original.model))) throw new Error("MODEL_REQUIRED");
    if (this.provider === "PBE") validatePbeCategory(original);
    const externalId = original.source.externalId || original.id;
    const source: CatalogSource = { ...original.source, reference: manifest.referenceUrl,
      externalId, sourceVersion: manifest.sourceVersion, retrievedAt: manifest.retrievedAt,
      verifiedAt: manifest.verifiedAt, lastSeenAt: manifest.retrievedAt, official: !generic,
      ...(manifest.manufacturer ? { manufacturer: manifest.manufacturer } : {}),
      metrics: Object.fromEntries(Object.keys(original.energyProfile).filter(key =>
        ["value", "referenceMonthlyKwh", "typicalPowerW", "standbyPowerW", "energyPerCycleKwh"].includes(key))
        .map(key => [key === "referenceMonthlyKwh" ? "value" : key,
          (original.source.metrics as Record<string, string> | undefined)?.[key] || manifest.referenceUrl])) };
    const region = this.provider === "PBE" ? "BR" : this.provider === "ENERGY_STAR" ? "US" : original.region;
    const identity = [this.provider, externalId, identityText(original.brand), region,
      original.variant?.voltage ?? null, original.variant?.identifier ?? null];
    // Keep established seed IDs so earlier catalog links do not become dangling.
    const seedId = catalogSeed.devices.find(row => row.id === original.id && row.source.type === this.provider &&
      identityText(row.brand) === identityText(original.brand) && identityText(row.model) === identityText(original.model) &&
      row.region === region && JSON.stringify(row.variant || {}) === JSON.stringify(original.variant || {}));
    const id = seedId ? original.id : `${this.provider.toLowerCase().replace(/_/g, "-")}-${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32)}`;
    return catalogDeviceSchema.parse({ ...original, id, displayName: text(original.displayName),
      brand: text(original.brand) || undefined, model: text(original.model) || undefined,
      region: this.provider === "PBE" ? "BR" : this.provider === "ENERGY_STAR" ? "US" : original.region,
      energyProfile: normalizeEnergyProfile(original.energyProfile), source, isGeneric: generic,
      verified: !generic, active: original.active ?? true });
  }
}
export class PbeCatalogProvider extends CuratedCatalogProvider { constructor() { super("PBE"); } }
export class ManufacturerCatalogProvider extends CuratedCatalogProvider { constructor() { super("MANUFACTURER"); } }
export class GenericCatalogProvider extends CuratedCatalogProvider { constructor() { super("WATTSTATUS_GENERIC"); } }
export class EnergyStarCatalogProvider extends CuratedCatalogProvider {
  constructor() { super("ENERGY_STAR"); }
  normalize(raw: unknown, manifest: ImportManifest): CatalogDevice {
    if (manifest.adapter !== "energystar-refrigerator-csv-v1") return super.normalize(raw, manifest);
    const row = z.record(z.string()).parse(raw);
    if (!row.Markets?.split(",").map(text).includes("United States")) throw new Error("US_MARKET_REQUIRED");
    const externalId = text(row["ENERGY STAR Unique ID"]);
    if (!externalId) throw new Error("EXTERNAL_ID_REQUIRED");
    const record = { id: `es-${externalId}`, category: "kitchen", subcategory: "Geladeira",
      brand: text(row["Brand Name"]), model: text(row["Model Number"]),
      displayName: `Geladeira ${text(row["Brand Name"])} ${text(row["Model Number"])}`, aliases: [],
      energyProfile: { method: "REFERENCE_PERIOD", value: decimal(row["Annual Energy Use (kWh/yr)"], "US"), unit: "kWh", period: "YEAR", measurementType: "ESTIMATED" },
      source: { type: "ENERGY_STAR", externalId, reference: manifest.referenceUrl, verifiedAt: manifest.verifiedAt },
      region: "US", verified: true, isGeneric: false };
    return super.normalize(record, { ...manifest, adapter: "curated-v1", numberLocale: "US" });
  }
}
export const providerFor = (provider: ImportManifest["provider"]): CatalogSourceProvider => ({
  PBE: new PbeCatalogProvider(), ENERGY_STAR: new EnergyStarCatalogProvider(),
  MANUFACTURER: new ManufacturerCatalogProvider(), WATTSTATUS_GENERIC: new GenericCatalogProvider(),
})[provider];
