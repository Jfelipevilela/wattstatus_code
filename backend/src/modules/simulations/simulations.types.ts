import type { CatalogDevice, CatalogSource, EnergyProfile } from "../catalog/catalog.types";

export interface SimulationUsage {
  power?: number;
  usageHours?: number;
  days?: number;
  cyclesPerMonth?: number;
  cyclesPerWeek?: number;
  standbyEnabled?: boolean;
  estimateByUsage?: boolean;
}

export interface SimulationItemInput {
  id: string;
  source: "USER_APPLIANCE" | "CATALOG";
  userApplianceId?: string;
  catalogDeviceId?: string;
  sourceFingerprint: string;
  quantity: number;
  usage?: SimulationUsage;
}

export interface SimulationItem extends SimulationItemInput {
  name: string;
  energyProfileSnapshot?: EnergyProfile;
  catalogSnapshot?: CatalogDevice;
  sourceDetails?: CatalogSource;
  defaultUsage: SimulationUsage;
  canEstimateByUsage: boolean;
  measurementContext?: {
    kind: "interval" | "cumulative";
    capturedAt: string;
    consumptionKWh?: number;
    startAt?: string;
    endAt?: string;
  };
}

export interface SimulationScenario {
  name: string;
  sourceType: "NEW" | "EXISTING_ENVIRONMENT";
  sourcePropertyId?: string;
  sourceRoomId?: string;
  environmentType?: string;
  propertyType?: "RESIDENTIAL" | "BUSINESS";
  tariffPerKwh: number;
  items: SimulationItem[];
}

export interface SimulationSources {
  properties: Array<{ id: string; name: string; type: string; tariffPerKwh: number | null }>;
  rooms: Array<{ id: string; propertyId: string; name: string; type: string }>;
  appliances: SimulationItem[];
}

export interface SimulationCalculationInput {
  sourcePropertyId?: string;
  sourceRoomId?: string;
  tariffPerKwh: number;
  items: SimulationItemInput[];
}

export interface SimulationItemResult {
  id: string;
  name: string;
  quantity: number;
  available: boolean;
  reason?: string;
  method?: EnergyProfile["method"];
  energyProfileSnapshot?: EnergyProfile;
  unitMonthlyKwh: number | null;
  monthlyKwh: number | null;
  monthlyCost: number | null;
  sharePercent: number | null;
}

export interface SimulationBaseline {
  monthlyKwh: number | null;
  monthlyCost: number | null;
  unavailableCount: number;
}

export interface SimulationCalculationResult extends SimulationBaseline {
  items: SimulationItemResult[];
  knownMonthlyKwh: number;
  knownMonthlyCost: number;
  baseline?: SimulationBaseline;
  comparison?: {
    differenceKwh: number | null;
    differenceCost: number | null;
    differencePercent: number | null;
  };
}

export interface SimulationRoomResponse {
  scenario: SimulationScenario;
  baseline: SimulationCalculationResult;
}
