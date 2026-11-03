import type { CatalogDevice } from "./catalog.types";

// Compatibility order for the Brazilian audience, independent of energy-method evidence.
export const catalogPriority = (row: Pick<CatalogDevice, "source" | "region" | "isGeneric">) =>
  row.isGeneric || row.source.type === "WATTSTATUS_GENERIC" ? 4
    : row.region === "BR" && row.source.type === "PBE" ? 0
      : row.region === "BR" && row.source.type === "MANUFACTURER" ? 1
        : row.region === "US" ? 2 : row.region === "EU" ? 3 : 4;
