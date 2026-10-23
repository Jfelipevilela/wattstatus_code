export type ApplianceStatus = "normal" | "warning" | "critical";

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

export interface ApplianceRecord {
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
  // Living Energy: owning property and room. Absent on legacy records until
  // they are assigned to the user's default property.
  propertyId?: string | null;
  roomId?: string | null;
}

export interface CalculationInput {
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
  propertyId?: string | null;
  roomId?: string | null;
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

export type PropertyType = "house" | "apartment" | "commercial" | "other";

export interface PropertyRecord {
  id: string;
  userId: string;
  name: string;
  type: PropertyType;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  timezone: string;
  isPrimary: boolean;
  // Tariff used when an appliance has no tariff of its own.
  tariffState?: string | null;
  tariffValue?: number | null;
  // Set only on the property created for existing data; one per user.
  legacyDefault?: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface FloorRecord {
  id: string;
  userId: string;
  propertyId: string;
  name: string;
  level: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomLayout {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface RoomRecord {
  id: string;
  userId: string;
  propertyId: string;
  floorId: string;
  name: string;
  type: string;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  layout?: RoomLayout | null;
  createdAt: string;
  updatedAt: string;
}
