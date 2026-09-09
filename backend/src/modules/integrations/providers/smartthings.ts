import axios, { AxiosInstance } from "axios";
import { ApiError } from "../../../middleware/error-handler";
import {
  DeviceCommand,
  DeviceIntegration,
  DeviceStatus,
  DeviceSummary,
} from "../types";
import { getErrorFields, logger } from "../../../logging/logger";

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
  components?: Array<{
    capabilities?: Array<{ id: string }>;
  }>;
}

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
    const startedAt = Date.now();
    logger.info("smartthings.devices_query_started");
    try {
      const { data } = await this.client.get<{ items: SmartThingsDevice[] }>("/devices");
      const devices = (data.items || []).map((item) => ({
        id: item.deviceId,
        name: item.label || item.name,
        brand: item.manufacturerName || "Samsung",
        model: item.modelName,
        room: item.roomName,
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

  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    this.ensureConfigured();
    const startedAt = Date.now();
    const logDeviceId = safeDeviceId(deviceId);
    logger.info("smartthings.device_status_query_started", { deviceId: logDeviceId });
    try {
      const { data } = await this.client.get(`/devices/${deviceId}/status`);
      logger.info("smartthings.device_status_query_succeeded", {
        deviceId: logDeviceId,
        durationMs: Date.now() - startedAt,
      });
      return {
        id: deviceId,
        online: true,
        raw: data,
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

  async executeCommand(
    deviceId: string,
    command: DeviceCommand
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
        `/devices/${deviceId}/commands`,
        payload
      );
      logger.info("smartthings.device_command_succeeded", {
        deviceId: logDeviceId,
        command: logCommand,
        durationMs: Date.now() - startedAt,
      });
      return { ok: true, raw: data };
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
