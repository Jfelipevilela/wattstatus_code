export type EnergyProfile =
  | { method: "POWER_TIME"; typicalPowerW?: number; standbyPowerW?: number; measurementType?: "ESTIMATED" }
  | { method: "REFERENCE_MONTHLY"; referenceMonthlyKwh: number }
  | { method: "REFERENCE_PERIOD"; value: number; unit: "kWh"; period: "DAY" | "MONTH" | "YEAR"; measurementType?: "ESTIMATED"; testBasis?: string }
  | { method: "PER_CYCLE"; energyPerCycleKwh: number; measurementType?: "ESTIMATED" };

export interface CatalogSource {
  type: "PBE" | "ENERGY_STAR" | "EPREL" | "MANUFACTURER" | "WATTSTATUS_GENERIC";
  reference: string;
  verifiedAt: string;
  externalId?: string;
  registrationNumber?: string;
  sourceVersion?: string;
  retrievedAt?: string;
  lastSeenAt?: string;
  official?: boolean;
  manufacturer?: string;
  metrics?: Record<string, string>;
}
export interface CatalogDevice {
  id: string;
  category: string;
  subcategory: string;
  brand?: string;
  model?: string;
  displayName: string;
  aliases: string[];
  energyProfile: EnergyProfile;
  source: CatalogSource;
  region: string;
  verified: boolean;
  isGeneric: boolean;
  active?: boolean;
  variant?: { voltage?: number; identifier?: string };
  specifications?: Record<string, string | number>;
  sources?: CatalogSource[];
  profiles?: Array<{ profile: EnergyProfile; source: CatalogSource }>;
  equivalence?: { key: string; referenceUrl: string };
}
export interface CatalogCategory {
  id: string;
  name: string;
  icon: string;
}
export interface CatalogQuery {
  search?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  model?: string;
  region?: "BR" | "US" | "EU";
  page: number;
  limit: number;
}
export interface CatalogPage {
  devices: CatalogDevice[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
  categories: CatalogCategory[];
  brands: string[];
  subcategories: string[];
}
