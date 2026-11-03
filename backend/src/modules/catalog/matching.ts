import type { CatalogDevice } from "./catalog.types";
import { identityText } from "./import/normalizer";

export interface MatchInput { brand: string; model: string; region: string; voltage?: number; category?: string; }
export function matchCatalog(rows: CatalogDevice[], input: MatchInput) {
  if (!identityText(input.brand) || !identityText(input.model)) return [];
  return rows.filter(row => row.active !== false && !row.isGeneric && row.region === input.region &&
    identityText(row.brand) === identityText(input.brand) && identityText(row.model) === identityText(input.model) &&
    (!input.category || row.category === input.category) &&
    (input.voltage === undefined || row.variant?.voltage === undefined || row.variant.voltage === input.voltage))
    .map(device => ({ device, confidence: input.voltage !== undefined && device.variant?.voltage === input.voltage ? "EXACT" : "POSSIBLE" }));
}
