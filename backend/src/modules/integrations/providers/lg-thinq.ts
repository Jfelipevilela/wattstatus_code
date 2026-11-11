import axios, { type AxiosInstance } from "axios";
import { randomUUID } from "crypto";
import { z } from "zod";
import { ApiError } from "../../../middleware/error-handler";
import type {
  DeviceCommand,
  DeviceIntegration,
  DeviceStatus,
  DeviceSummary,
} from "../types";
// ThinQ Connect credentials belong to one user. No environment/shared account fallback.
export const lgCredentialsSchema = z
  .object({
    accessToken: z.string().min(1).max(3000),
    clientId: z.string().min(1).max(200),
    apiKey: z.string().min(1).max(500),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    region: z.enum(["aic", "eic", "kic"]),
  })
  .strict();
export type LgCredentials = z.infer<typeof lgCredentialsSchema>;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export class LgThinQIntegration implements DeviceIntegration {
  id = "lg-thinq";
  name = "LG ThinQ";
  vendor = "LG";
  private client: AxiosInstance;
  constructor(private credentials: LgCredentials) {
    this.client = axios.create({
      baseURL: `https://api-${credentials.region}.lgthinq.com`,
      timeout: 3000,
    });
  }
  isConfigured() {
    return lgCredentialsSchema.safeParse(this.credentials).success;
  }
  private async request(
    method: "get" | "post",
    path: string,
    signal?: AbortSignal,
    data?: unknown,
  ) {
    if (!this.isConfigured())
      throw new ApiError(400, "LG ThinQ não configurado.");
    try {
      const response = await this.client.request({
        method,
        url: path,
        data,
        signal,
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          "x-client-id": this.credentials.clientId,
          "x-api-key": this.credentials.apiKey,
          "x-country": this.credentials.countryCode,
          "x-service-phase": "OP",
          "x-message-id": Buffer.from(
            randomUUID().replace(/-/g, ""),
            "hex",
          ).toString("base64url"),
          ...(method === "post" ? { "x-conditional-control": "true" } : {}),
        },
      });
      if (record(response.data).error) throw new Error("provider rejected");
      return record(response.data).response;
    } catch (error) {
      // Discard Axios errors, which contain authorization headers.
      if (
        signal?.aborted ||
        (axios.isAxiosError(error) && error.code === "ECONNABORTED")
      )
        throw new ApiError(
          503,
          "Tempo limite de comunicação com LG ThinQ.",
          "PROVIDER_TIMEOUT",
        );
      throw new ApiError(503, "LG ThinQ indisponível ou comando recusado.");
    }
  }
  async listDevices(signal?: AbortSignal): Promise<DeviceSummary[]> {
    const response = await this.request("get", "/devices", signal);
    if (!Array.isArray(response))
      throw new ApiError(503, "Lista LG ThinQ indisponível.");
    return response
      .map((item) => {
        const device = record(item);
        const info = record(device.deviceInfo);
        return {
          id: String(device.deviceId ?? ""),
          name: String(info.alias ?? "Aparelho LG"),
          brand: "LG",
          model:
            typeof info.modelName === "string" ? info.modelName : undefined,
        };
      })
      .filter((d) => Boolean(d.id));
  }
  async getPowerOffCommands(device: DeviceSummary, signal?: AbortSignal) {
    return this.getPowerCommands(device, signal, "POWER_OFF");
  }
  async getPowerOnCommands(device: DeviceSummary, signal?: AbortSignal) {
    return this.getPowerCommands(device, signal, "POWER_ON");
  }
  private async getPowerCommands(
    device: DeviceSummary,
    signal?: AbortSignal,
    power: "POWER_ON" | "POWER_OFF" = "POWER_OFF",
  ): Promise<DeviceCommand[]> {
    const profile = record(
      await this.request(
        "get",
        `/devices/${encodeURIComponent(device.id)}/profile`,
        signal,
      ),
    );
    const operation = record(record(profile.property).operation);
    // Use only a writable operation whose profile explicitly advertises the requested power value.
    // Other features (e.g. display or energy saving) cannot imply power control.
    const commands = Object.entries(operation).filter(([key, value]) => {
      const property = record(value);
      const values = record(property.value).w;
      return (
        /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(key) &&
        Array.isArray(property.mode) &&
        property.mode.includes("w") &&
        Array.isArray(values) &&
        values.includes(power)
      );
    });
    return commands.map(([key]) => ({
      capability: "operation",
      command: key,
      arguments: [power],
    }));
  }
  async getDeviceStatus(
    deviceId: string,
    signal?: AbortSignal,
  ): Promise<DeviceStatus> {
    const raw = await this.request(
      "get",
      `/devices/${encodeURIComponent(deviceId)}/state`,
      signal,
    );
    return {
      id: deviceId,
      online:
        record(raw).online !== false &&
        record(raw).connectionState !== "DISCONNECTED",
      raw,
    };
  }
  readPowerState(
    status: DeviceStatus,
    command: DeviceCommand,
  ): "off" | "on" | null {
    const value = record(record(status.raw).operation)[command.command];
    return value === "POWER_OFF" ? "off" : value === "POWER_ON" ? "on" : null;
  }
  async executeCommand(
    deviceId: string,
    command: DeviceCommand,
    signal?: AbortSignal,
  ) {
    if (
      command.capability !== "operation" ||
      !/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(command.command) ||
      command.arguments?.length !== 1 ||
      !["POWER_OFF", "POWER_ON"].includes(String(command.arguments[0]))
    )
      throw new ApiError(400, "Comando LG não permitido.");
    await this.request(
      "post",
      `/devices/${encodeURIComponent(deviceId)}/control`,
      signal,
      { operation: { [command.command]: command.arguments[0] } },
    );
    return { ok: true };
  }
}
