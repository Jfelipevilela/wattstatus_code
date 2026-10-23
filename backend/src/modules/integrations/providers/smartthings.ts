import axios, { AxiosInstance } from "axios";
import { ApiError } from "../../../middleware/error-handler";
import {
  DeviceCommand,
  DeviceIntegration,
  DeviceStatus,
  DeviceSummary,
} from "../types";

const BASE_URL = "https://api.smartthings.com/v1";
type SmartThingsDevice = {
  deviceId: string; label?: string; name: string; manufacturerName?: string;
  modelName?: string; roomName?: string;
  components?: Array<{ capabilities?: Array<{ id: string }> }>;
};

export class SmartThingsIntegration implements DeviceIntegration {
  id = "smartthings";
  name = "Samsung SmartThings";
  vendor = "Samsung";

  private client: AxiosInstance;

  constructor(private token: string, timeoutMs = 10000) {
    this.client = this.buildClient(token, timeoutMs);
  }

  isConfigured() {
    return Boolean(this.token);
  }

  private buildClient(token: string, timeoutMs: number) {
    const client = axios.create({
      baseURL: BASE_URL,
      timeout: timeoutMs,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    client.interceptors.response.use((response) => response, (error: unknown) => {
      if (!axios.isAxiosError(error)) throw new ApiError(503, "SmartThings indisponível");
      const status = error.response?.status;
      if (status === 401 || status === 403) throw new ApiError(401, "Token SmartThings inválido ou sem permissão");
      if (status === 404) throw new ApiError(404, "Dispositivo SmartThings não encontrado");
      if (status === 429) throw new ApiError(429, "Limite de chamadas SmartThings atingido");
      throw new ApiError(503, "SmartThings indisponível. Tente novamente.");
    });
    return client;
  }

  private ensureConfigured() {
    if (!this.isConfigured()) {
      throw new ApiError(
        400,
        "SmartThings n\u00e3o configurado. Salve seu token."
      );
    }
  }

  async listDevices(): Promise<DeviceSummary[]> {
    this.ensureConfigured();
    const { data } = await this.client.get<{ items: SmartThingsDevice[] }>("/devices");
    return (data.items || []).map((item) => ({
      id: item.deviceId,
      name: item.label || item.name,
      brand: item.manufacturerName || "Samsung",
      model: item.modelName,
      room: item.roomName,
      capabilities: item.components?.flatMap(
        (component) => component.capabilities?.map((c) => c.id) || []
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
