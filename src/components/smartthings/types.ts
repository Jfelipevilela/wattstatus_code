export interface DeviceSummary {
  id: string;
  name: string;
  brand: string;
  model?: string;
  room?: string;
  capabilities?: string[];
}

// Mirrors backend/src/modules/integrations/device-state.ts. Null means the
// device did not report the reading; it is never a real zero.
export interface DeviceState {
  switch: "on" | "off" | null;
  powerW: number | null;
  powerSource: "live" | "report" | "average" | null;
  powerAt: string | null;
  energyKWh: number | null;
  temperatureC: number | null;
  humidity: number | null;
  coolingSetpointC: number | null;
  setpointRange: { min: number; max: number } | null;
  mode: string | null;
  supportedModes: string[];
  fanMode: string | null;
  supportedFanModes: string[];
  optionalMode: string | null;
  supportedOptionalModes: string[];
  volume: number | null;
  muted: boolean | null;
  channel: string | null;
  channelName: string | null;
  inputSource: string | null;
  supportedInputSources: string[];
  playback: string | null;
  updatedAt: string | null;
}

export interface DeviceStatus {
  id: string;
  online: boolean;
  raw: unknown;
  state: DeviceState;
}

export interface OverviewItem {
  device: DeviceSummary;
  status: DeviceStatus | null;
  error: string | null;
}

export type DeviceKind = "climate" | "tv" | "light" | "plug" | "other";

export const deviceKind = (capabilities: string[] = []): DeviceKind => {
  if (capabilities.includes("airConditionerMode") || capabilities.includes("thermostatCoolingSetpoint"))
    return "climate";
  if (
    capabilities.includes("tvChannel") ||
    capabilities.includes("mediaInputSource") ||
    capabilities.includes("audioVolume")
  )
    return "tv";
  if (capabilities.includes("colorControl") || capabilities.includes("switchLevel")) return "light";
  if (capabilities.includes("powerMeter") || capabilities.includes("energyMeter")) return "plug";
  return "other";
};

export const MODE_LABELS: Record<string, string> = {
  cool: "Resfriar",
  heat: "Aquecer",
  auto: "Automático",
  aIComfort: "Conforto IA",
  dry: "Desumidificar",
  fan: "Ventilar",
  wind: "Ventilar",
};

export const FAN_LABELS: Record<string, string> = {
  auto: "Auto",
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  turbo: "Turbo",
};

export const OPTIONAL_MODE_LABELS: Record<string, string> = {
  off: "Desligado",
  windFree: "WindFree",
  sleep: "Sono",
  speed: "Rápido",
  quiet: "Silencioso",
  eco: "Econômico",
  windFreeSleep: "WindFree Sono",
};

export const INPUT_LABELS: Record<string, string> = {
  digitalTv: "TV",
  dtv: "TV",
  HDMI1: "HDMI 1",
  HDMI2: "HDMI 2",
  HDMI3: "HDMI 3",
  HDMI4: "HDMI 4",
  USB: "USB",
};

export const label = (map: Record<string, string>, value: string | null) =>
  value ? map[value] ?? value.charAt(0).toUpperCase() + value.slice(1) : "—";

export const formatElapsed = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
};

const ENERGY_RELEVANT = ["switch", "powerMeter", "energyMeter", "powerConsumptionReport"];

// Hubs, phones and sensors: nothing to switch or meter.
export const isInertDevice = (capabilities: string[] = []) =>
  capabilities.length > 0 && !capabilities.some((capability) => ENERGY_RELEVANT.includes(capability));
