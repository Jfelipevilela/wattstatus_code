import type { DeviceState } from "./device-state";

export interface DeviceSummary {
  id: string;
  name: string;
  brand: string;
  model?: string;
  room?: string;
  capabilities?: string[];
  powerOffCommands?: DeviceCommand[];
}

export interface DeviceStatus {
  id: string;
  online: boolean;
  raw: unknown;
  state?: DeviceState;
}

export interface DeviceCommand {
  capability: string;
  command: string;
  arguments?: unknown[];
  component?: string;
}

export interface DeviceIntegration {
  id: string;
  name: string;
  vendor: string;
  isConfigured(): boolean;
  setToken?(token: string): void;
  // Only advertise commands that explicitly set the requested power state. All methods
  // doing I/O must honor AbortSignal; state reads must bypass local caches.
  getPowerOffCommands?(device: DeviceSummary, signal?: AbortSignal): Promise<DeviceCommand[]>;
  getPowerOnCommands?(device: DeviceSummary, signal?: AbortSignal): Promise<DeviceCommand[]>;
  readPowerState?(status: DeviceStatus, command: DeviceCommand): "on" | "off" | null;
  listDevices(signal?: AbortSignal): Promise<DeviceSummary[]>;
  getDeviceStatus(deviceId: string, signal?: AbortSignal): Promise<DeviceStatus>;
  executeCommand(
    deviceId: string,
    command: DeviceCommand,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; raw?: unknown }>;
}
