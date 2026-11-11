import axios, { AxiosInstance } from "axios";
import { ApiError } from "../../../middleware/error-handler";
import {
  DeviceCommand,
  DeviceIntegration,
  DeviceStatus,
  DeviceSummary,
} from "../types";
import { getErrorFields, logger } from "../../../logging/logger";
import { normalizeDeviceState, readComponentSwitch } from "../device-state";

const BASE_URL = "https://api.smartthings.com/v1";
const safeDeviceId = (deviceId: string) =>
  /^[A-Za-z0-9._:-]{1,128}$/.test(deviceId) ? deviceId : "invalid_device_id";
const safeCommand = (command: string) =>
  command === "on" || command === "off" ? command : "other";

interface SmartThingsDevice {
  deviceId: string;
  label?: string;
  name: string;
  manufacturerName?: string;
  modelName?: string;
  roomName?: string;
  roomId?: string;
  locationId?: string;
  components?: Array<{
    id?: string;
    capabilities?: Array<{ id: string }>;
  }>;
}

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
      if (error.code === "ECONNABORTED" || error.code === "ERR_CANCELED") throw new ApiError(503, "Tempo limite de comunicação com SmartThings.", "PROVIDER_TIMEOUT");
      const status = error.response?.status;
      if (status === 401 || status === 403) throw new ApiError(424, "Token SmartThings inválido ou sem permissão");
      if (status === 404) throw new ApiError(404, "Dispositivo SmartThings não encontrado");
      if (status === 429) {
        // X-RateLimit-Reset: seconds until the window resets (SmartThings docs).
        const reset = Number(error.response?.headers?.["x-ratelimit-reset"] ?? error.response?.headers?.["retry-after"]);
        const limited = new ApiError(429, "Limite de chamadas SmartThings atingido") as ApiError & { retryAfterMs?: number };
        if (Number.isFinite(reset) && reset > 0) limited.retryAfterMs = Math.min(reset, 3600) * 1000;
        throw limited;
      }
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

  async listDevices(signal?: AbortSignal): Promise<DeviceSummary[]> {
    this.ensureConfigured();
    const startedAt = Date.now();
    logger.info("smartthings.devices_query_started");
    try {
      const { data } = await this.client.get<{ items: SmartThingsDevice[] }>("/devices", { signal });
      const rooms = await this.loadRoomNames(data.items || [], signal);
      const devices = (data.items || []).map((item) => ({
        id: item.deviceId,
        name: item.label || item.name,
        brand: item.manufacturerName || "Samsung",
        model: item.modelName,
        room: item.roomName || (item.roomId ? rooms.get(item.roomId) : undefined),
        powerOffCommands: item.components?.filter(c => c.id && c.capabilities?.some(cap => cap.id === "switch"))
          .map(c => ({ capability: "switch", command: "off", component: c.id })) ?? [],
        capabilities: item.components?.flatMap(
          (component) => component.capabilities?.map((capability) => capability.id) || []
        ),
      }));
      logger.info("smartthings.devices_query_succeeded", {
        durationMs: Date.now() - startedAt,
        deviceCount: devices.length,
      });
      return devices;
    } catch (error) {
      logger.error("smartthings.devices_query_failed", {
        durationMs: Date.now() - startedAt,
        ...getErrorFields(error),
      });
      throw error;
    }
  }

  // Devices only carry a roomId; names come from the locations API. Needs the
  // r:locations:* scope, so a failure just leaves the room blank.
  private async loadRoomNames(items: SmartThingsDevice[], signal?: AbortSignal) {
    const rooms = new Map<string, string>();
    const locations = [...new Set(items.filter((item) => item.roomId && item.locationId).map((item) => item.locationId!))];
    await Promise.all(
      locations.map(async (locationId) => {
        try {
          const { data } = await this.client.get<{ items?: Array<{ roomId?: string; name?: string }> }>(
            `/locations/${encodeURIComponent(locationId)}/rooms`, { signal }
          );
          for (const room of data?.items || []) {
            if (room.roomId && room.name) rooms.set(room.roomId, room.name);
          }
        } catch {
          // Room names are optional.
        }
      })
    );
    return rooms;
  }

  async getDeviceStatus(deviceId: string, signal?: AbortSignal): Promise<DeviceStatus> {
    this.ensureConfigured();
    const startedAt = Date.now();
    const logDeviceId = safeDeviceId(deviceId);
    logger.info("smartthings.device_status_query_started", { deviceId: logDeviceId });
    try {
      const [{ data }, health] = await Promise.all([
        this.client.get(`/devices/${encodeURIComponent(deviceId)}/status`, { signal }),
        // Health is best effort: a failure here must not hide the readings.
        this.client
          .get<{ state?: string }>(`/devices/${encodeURIComponent(deviceId)}/health`, { signal })
          .then((response) => response?.data?.state)
          .catch(() => undefined),
      ]);
      logger.info("smartthings.device_status_query_succeeded", {
        deviceId: logDeviceId,
        durationMs: Date.now() - startedAt,
      });
      return {
        id: deviceId,
        // The status call succeeded, so treat an unknown health state as online.
        online: health !== "OFFLINE",
        raw: data,
        state: normalizeDeviceState(data),
      };
    } catch (error) {
      const errorFields = getErrorFields(error);
      logger.error("smartthings.device_status_query_failed", {
        deviceId: logDeviceId,
        durationMs: Date.now() - startedAt,
        ...errorFields,
      });
      logger.error("smartthings.consumption_query_failed", {
        deviceId: logDeviceId,
        durationMs: Date.now() - startedAt,
        ...errorFields,
      });
      throw error;
    }
  }

  // Device ids with an energy capability, from one /devices call (no room
  // names), for the scheduled collector: once per user per run.
  async listEnergyDeviceIds(capabilities: string[]): Promise<Set<string>> {
    this.ensureConfigured();
    const { data } = await this.client.get<{ items: SmartThingsDevice[] }>("/devices");
    return new Set((data.items || [])
      .filter((item) => item.components?.some((component) => component.capabilities?.some((capability) => capabilities.includes(capability.id))))
      .map((item) => item.deviceId));
  }

  // Scheduled collection only needs the raw status: one request per reading,
  // no device list, no health call, no room names.
  async getDeviceReading(deviceId: string, signal?: AbortSignal): Promise<{ raw: unknown }> {
    this.ensureConfigured();
    const { data } = await this.client.get(`/devices/${encodeURIComponent(deviceId)}/status`, { signal });
    return { raw: data };
  }

  async getPowerOffCommands(device: DeviceSummary): Promise<DeviceCommand[]> {
    return device.powerOffCommands ?? [];
  }

  async getPowerOnCommands(device: DeviceSummary): Promise<DeviceCommand[]> {
    return (device.powerOffCommands ?? []).map(command => ({ ...command, command: "on" }));
  }

  readPowerState(status: DeviceStatus, command: DeviceCommand) {
    return readComponentSwitch(status.raw, command.component ?? "main");
  }

  async executeCommand(
    deviceId: string,
    command: DeviceCommand,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; raw?: unknown }> {
    this.ensureConfigured();
    const startedAt = Date.now();
    const logDeviceId = safeDeviceId(deviceId);
    const logCommand = safeCommand(command.command);
    logger.info("smartthings.device_command_started", {
      deviceId: logDeviceId,
      command: logCommand,
    });
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

    try {
      const { data } = await this.client.post(
        `/devices/${encodeURIComponent(deviceId)}/commands`,
        payload, { signal }
      );
      logger.info("smartthings.device_command_succeeded", {
        deviceId: logDeviceId,
        command: logCommand,
        durationMs: Date.now() - startedAt,
      });
      const results = data?.results;
      const rejected = Array.isArray(results) && results.some((r: { status?: string }) =>
        r.status && !["ACCEPTED", "COMPLETED"].includes(r.status));
      return { ok: !rejected, raw: data };
    } catch (error) {
      logger.error("smartthings.device_command_failed", {
        deviceId: logDeviceId,
        command: logCommand,
        durationMs: Date.now() - startedAt,
        ...getErrorFields(error),
      });
      throw error;
    }
  }
}
