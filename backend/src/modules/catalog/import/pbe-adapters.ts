import type { CatalogDevice } from "../catalog.types";
import { identityText } from "./normalizer";

// Category-specific rules for curated records. These are not invented spreadsheet headers.
const adapters: Record<string, (row: CatalogDevice) => boolean> = {
  GELADEIRA: row => ["REFERENCE_PERIOD", "REFERENCE_MONTHLY"].includes(row.energyProfile.method),
  "AR-CONDICIONADO": row => row.energyProfile.method === "POWER_TIME" ||
    (row.energyProfile.method === "REFERENCE_PERIOD" && row.energyProfile.period === "YEAR"),
  LAVADORA: row => row.energyProfile.method === "PER_CYCLE",
  TV: row => row.energyProfile.method === "POWER_TIME" && (row.energyProfile.typicalPowerW === undefined ||
    Boolean(row.source.metrics?.typicalPowerW && row.source.metrics.typicalPowerW !== row.source.reference)),
};
export function validatePbeCategory(row: CatalogDevice) {
  const adapter = adapters[identityText(row.subcategory)];
  if (!adapter || !adapter(row)) throw new Error("PBE_CATEGORY_OR_METRIC_UNSUPPORTED");
}
