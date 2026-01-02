import axios, { AxiosInstance } from "axios";
import { ApiError } from "../../../middleware/error-handler";
import {
  DeviceCommand,
  DeviceIntegration,
  DeviceStatus,
  DeviceSummary,
} from "../types";

const BASE_URL = "https://api.lgthinq.com/v1";

export class LgThinQIntegration implements DeviceIntegration {
  id = "lg-thinq";
  name = "LG ThinQ";
  vendor = "LG";

  private client: AxiosInstance | null = null;
  private readonly mockDevices: DeviceSummary[] = [
    {
      id: "mock-lg-ac",
      name: "Ar Condicionado LG (Demo)",
      brand: "LG",
      model: "Dual Inverter",
      capabilities: ["switch", "temperature", "fanSpeed"],
    },
  ];

  constructor(
    private clientId: string,
    private clientSecret: string,
    private refreshToken: string
  ) {}

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.refreshToken);
  }

  private ensureConfigured() {
    if (!this.isConfigured()) {
      throw new ApiError(
        400,
        "LG ThinQ n\u00e3o configurado. Defina LG_CLIENT_ID, LG_CLIENT_SECRET e LG_REFRESH_TOKEN no .env."
      );
    }
  }

  private getClient() {
    if (!this.client) {
      this.client = axios.create({
        baseURL: BASE_URL,
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": this.clientId,
        },
      });
    }
    return this.client;
  }

  async listDevices(): Promise<DeviceSummary[]> {
    if (!this.isConfigured()) {
      return this.mockDevices;
    }

    try {
      const { data } = await this.getClient().get<{ items: any[] }>(
        "/devices",
        {
          headers: {
            Authorization: `Bearer ${this.refreshToken}`,
          },
        }
      );

      return (data.items || []).map((item) => ({
        id: item.deviceId || item.id,
        name: item.alias || item.name,
        brand: "LG",
        model: item.modelName,
        capabilities: item.features,
      }));
    } catch (err) {
      console.warn(
        "LG ThinQ API respondeu com erro, voltando ao modo demo.",
        err
      );
      return this.mockDevices;
    }
  }

  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    if (!this.isConfigured()) {
      return { id: deviceId, online: true, raw: { demo: true } };
    }

    this.ensureConfigured();
    const { data } = await this.getClient().get(
      `/devices/${deviceId}/status`,
      {
        headers: { Authorization: `Bearer ${this.refreshToken}` },
      }
    );

    return { id: deviceId, online: true, raw: data };
  }

  async executeCommand(
    deviceId: string,
    command: DeviceCommand
  ): Promise<{ ok: boolean; raw?: unknown }> {
    if (!this.isConfigured()) {
      return {
        ok: true,
        raw: { demo: true, executed: command, deviceId },
      };
    }

    this.ensureConfigured();
    const { data } = await this.getClient().post(
      `/devices/${deviceId}/commands`,
      command,
      { headers: { Authorization: `Bearer ${this.refreshToken}` } }
    );
    return { ok: true, raw: data };
  }
}
