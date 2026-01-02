import axios, { AxiosInstance } from "axios";
import { ApiError } from "../../../middleware/error-handler";
import {
  DeviceCommand,
  DeviceIntegration,
  DeviceStatus,
  DeviceSummary,
} from "../types";

const BASE_URL = "https://api.smartthings.com/v1";

export class SmartThingsIntegration implements DeviceIntegration {
  id = "smartthings";
  name = "Samsung SmartThings";
  vendor = "Samsung";

  private client: AxiosInstance;

  constructor(private token: string) {
    this.client = this.buildClient(token);
  }

  isConfigured() {
    return Boolean(this.token);
  }

  private buildClient(token: string) {
    return axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  setToken(token: string) {
    this.token = token;
    this.client = this.buildClient(token);
  }

  private ensureConfigured() {
    if (!this.isConfigured()) {
      throw new ApiError(
        400,
        "SmartThings n\u00e3o configurado. Defina SMARTTHINGS_TOKEN no .env."
      );
    }
  }

  async listDevices(): Promise<DeviceSummary[]> {
    this.ensureConfigured();
    const { data } = await this.client.get<{ items: any[] }>("/devices");
    return (data.items || []).map((item) => ({
      id: item.deviceId,
      name: item.label || item.name,
      brand: item.manufacturerName || "Samsung",
      model: item.modelName,
      room: item.roomName,
      capabilities: item.components?.flatMap(
        (component: any) => component.capabilities?.map((c: any) => c.id) || []
      ),
    }));
  }

  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    this.ensureConfigured();
    const { data } = await this.client.get(`/devices/${deviceId}/status`);
    return {
      id: deviceId,
      online: true,
      raw: data,
    };
  }

  async executeCommand(
    deviceId: string,
    command: DeviceCommand
  ): Promise<{ ok: boolean; raw?: unknown }> {
    this.ensureConfigured();
    const payload = {
      commands: [
        {
          component: command.component || "main",
          capability: command.capability,
          command: command.command,
          arguments: command.arguments || [],
        },
      ],
    };

    const { data } = await this.client.post(
      `/devices/${deviceId}/commands`,
      payload
    );

    return { ok: true, raw: data };
  }
}
