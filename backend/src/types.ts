export type ApplianceStatus = "normal" | "warning" | "critical";
import type { CatalogSource, EnergyProfile } from "./modules/catalog/catalog.types";

export interface ApplianceCatalogFields {
  catalogDeviceId?: string;
  origin?: "CATALOG" | "MANUAL" | "SMARTTHINGS" | "INTEGRATION";
  energyProfile?: EnergyProfile;
  source?: CatalogSource;
  cyclesPerMonth?: number;
  room?: string;
  consumptionType?: "ESTIMATED" | "METERED";
  measurement?: { method: "LIVE_MEASUREMENT"; readingType: "cumulative"; counterKWh: number; capturedAt: string };
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  emailCanonical?: string;
  termsAcceptedAt?: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface ApplianceRecord extends ApplianceCatalogFields {
  id: string;
  userId: string;
  name: string;
  power: number;
  status: ApplianceStatus;
  usageHours: number;
  days: number;
  monthlyCost: number;
  monthlyConsumption: number;
  tariff: string;
  tariffValue?: number;
  createdAt: string;
  measuredConsumptionKWh?: number | null;
  integrationProvider?: string | null;
  integrationDeviceId?: string | null;
  importKey?: string;
}

export interface CalculationInput extends Pick<ApplianceCatalogFields, "catalogDeviceId" | "energyProfile" | "cyclesPerMonth" | "room"> {
  name?: string;
  power: number;
  usageHours: number;
  days: number;
  tariff: string;
  tariffValue?: number;
  measuredConsumptionKWh?: number;
  integrationProvider?: string;
  integrationDeviceId?: string;
  createdAt?: string;
}

export interface CalculationResult {
  consumptionKWh: number;
  cost: number;
  status: ApplianceStatus;
}

export interface UserSettingsRecord {
  userId: string;
  theme: "light" | "dark" | "system";
  apps: string[];
  historicalData: Array<{ month: string; consumption: number; cost: number }>;
  tariffState?: string;
  tariffValue?: number;
  energyCollectionEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationUsageHistory {
  userId: string;
  provider: string;
  deviceId: string;
  day: string;
  accumulatedMs: number;
  lastOn?: string | null;
  applianceName?: string | null;
}
