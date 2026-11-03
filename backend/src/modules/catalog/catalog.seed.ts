import data from "./data/catalog.json";
import { catalogSeedSchema } from "./catalog.schema";

// Validated once at startup; adding providers does not change user appliance contracts.
export const catalogSeed = catalogSeedSchema.parse(data);
