export interface DeviceSummary {
  id: string;
  name: string;
  brand: string;
  model?: string;
  room?: string;
  capabilities?: string[];
}

export interface DeviceStatus {
  id: string;
  online: boolean;
  raw: unknown;
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
  listDevices(): Promise<DeviceSummary[]>;
  getDeviceStatus(deviceId: string): Promise<DeviceStatus>;
  executeCommand(
    deviceId: string,
    command: DeviceCommand
  ): Promise<{ ok: boolean; raw?: unknown }>;
}
