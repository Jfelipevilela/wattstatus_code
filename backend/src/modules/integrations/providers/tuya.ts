// Tuya Cloud provider (covers white-label brands built on Tuya: Positivo, Liv,
// Elgin, Ekaza, Nova Digital...). Status is translated into the SmartThings-like
// shape consumed by normalizeDeviceState and the energy collector, so the rest
// of the backend works without Tuya-specific branches.
//
// Phase 1: provider + signing + DP mapping. Not registered in the
// IntegrationManager until per-user account linking (Tuya uid) is stored.
import axios, { AxiosInstance } from "axios";
import { ApiError } from "../../../middleware/error-handler";
import { getErrorFields, logger } from "../../../logging/logger";
import { normalizeDeviceState } from "../device-state";
import { DeviceCommand, DeviceIntegration, DeviceStatus, DeviceSummary } from "../types";
import { signTuyaRequest } from "./tuya-signer";

export const TUYA_REGIONS = {
  us: "https://openapi.tuyaus.com", // Western America (Brazil accounts)
  ueaz: "https://openapi-ueaz.tuyaus.com",
  eu: "https://openapi.tuyaeu.com",
  weaz: "https://openapi-weaz.tuyaeu.com",
  in: "https://openapi.tuyain.com",
  cn: "https://openapi.tuyacn.com",
} as const;
export type TuyaRegion = keyof typeof TUYA_REGIONS;

export const isTuyaRegion = (value: string): value is TuyaRegion =>
  Object.prototype.hasOwnProperty.call(TUYA_REGIONS, value);

const SAFE_ID = /^[A-Za-z0-9]{1,64}$/;
const SWITCH_CODES = ["switch", "switch_1", "switch_on", "switch_led"];
const POWER_CODES = ["cur_power", "power"];
const ENERGY_CODES = ["add_ele", "total_ele", "forward_energy_total"];

type TuyaEnvelope<T> = { success?: boolean; result?: T; code?: number; msg?: string };
type DpValue = { code: string; value: unknown };
type TuyaSpec = { status?: Array<{ code: string; type?: string; values?: string }> };
type TuyaDevice = {
  id?: string;
  name?: string;
  product_name?: string;
  model?: string;
  category?: string;
  online?: boolean;
  status?: DpValue[];
};

const assertId = (value: string, label: string) => {
  if (!SAFE_ID.test(value)) throw new ApiError(400, `${label} Tuya inválido`);
  return value;
};

// Tuya integer DPs carry a decimal "scale": value / 10^scale. Unit comes from the spec.
export const parseDpScales = (spec: TuyaSpec | null | undefined) => {
  const scales = new Map<string, { scale: number; unit: string | null }>();
  for (const item of spec?.status ?? []) {
    if (!item?.code || typeof item.values !== "string") continue;
    try {
      const parsed = JSON.parse(item.values) as { scale?: unknown; unit?: unknown };
      const scale = Number(parsed.scale ?? 0);
      if (!Number.isInteger(scale) || scale < 0 || scale > 6) continue;
      scales.set(item.code, { scale, unit: typeof parsed.unit === "string" ? parsed.unit : null });
    } catch {
      // Malformed spec entry: ignore, the reading stays unknown.
    }
  }
  return scales;
};

const scaled = (
  dps: DpValue[],
  codes: string[],
  scales: Map<string, { scale: number; unit: string | null }>
) => {
  for (const code of codes) {
    const dp = dps.find((item) => item.code === code);
    const meta = scales.get(code);
    // Without the spec the scale is unknown: report null instead of a wrong number.
    if (!dp || !meta || typeof dp.value !== "number" || !Number.isFinite(dp.value) || dp.value < 0) continue;
    return { value: dp.value / 10 ** meta.scale, unit: meta.unit };
  }
  return null;
};

export const findSwitchCode = (dps: DpValue[]) =>
  SWITCH_CODES.find((code) => dps.some((dp) => dp.code === code && typeof dp.value === "boolean")) ?? null;

// Translate Tuya DPs into the SmartThings-like "components.main" payload.
export const tuyaStatusToRaw = (
  dps: DpValue[],
  scales: Map<string, { scale: number; unit: string | null }>,
  at = new Date().toISOString()
) => {
  const main: Record<string, unknown> = {};
  const switchCode = findSwitchCode(dps);
  if (switchCode) {
    const on = dps.find((dp) => dp.code === switchCode)?.value === true;
    main.switch = { switch: { value: on ? "on" : "off", timestamp: at } };
  }
  const power = scaled(dps, POWER_CODES, scales);
  if (power && (power.unit === null || power.unit === "W")) {
    main.powerMeter = { power: { value: power.value, unit: "W", timestamp: at } };
  }
  const energy = scaled(dps, ENERGY_CODES, scales);
  if (energy && (energy.unit === "kWh" || energy.unit === "kW·h" || energy.unit === "Wh")) {
    const kwh = energy.unit === "Wh" ? energy.value / 1000 : energy.value;
    main.energyMeter = { energy: { value: kwh, unit: "kWh", timestamp: at } };
  }
  return { components: { main }, tuya: { dps } };
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export interface TuyaOptions {
  region?: TuyaRegion;
  timeoutMs?: number;
  http?: AxiosInstance;
}

export class TuyaIntegration implements DeviceIntegration {
  id = "tuya";
  name = "Tuya / Smart Life";
  vendor = "Tuya";

  private http: AxiosInstance;
  private scaleCache = new Map<string, Map<string, { scale: number; unit: string | null }>>();

  constructor(
    private accessId: string,
    private accessSecret: string,
    private uid: string,
    options: TuyaOptions = {}
  ) {
    const region = options.region ?? "us";
    this.http = options.http ?? axios.create({ baseURL: TUYA_REGIONS[region], timeout: options.timeoutMs ?? 10000 });
  }

  isConfigured() {
    return Boolean(this.accessId && this.accessSecret && this.uid);
  }

  // The linked Tuya user id (from the Smart Life QR authorization).
  setToken(uid: string) {
    this.uid = uid;
  }

  private ensureConfigured() {
    if (!this.isConfigured()) throw new ApiError(400, "Conta Tuya não vinculada.");
    assertId(this.uid, "Usuário");
  }

  private async send<T>(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, string | number>; body?: unknown; accessToken?: string; signal?: AbortSignal } = {}
  ): Promise<T> {
    const body = options.body === undefined ? "" : JSON.stringify(options.body);
    const { url, headers } = signTuyaRequest({
      clientId: this.accessId,
      secret: this.accessSecret,
      method,
      path,
      query: options.query,
      body,
      accessToken: options.accessToken,
    });
    let data: TuyaEnvelope<T>;
    try {
      const response = await this.http.request<TuyaEnvelope<T>>({
        method,
        url,
        data: body || undefined,
        signal: options.signal,
        headers: { ...headers, "Content-Type": "application/json" },
      });
      data = response.data;
    } catch (error) {
      logger.warn("tuya.request_failed", { path, ...getErrorFields(error) });
      throw new ApiError(503, "Tuya indisponível. Tente novamente.");
    }
    if (!data?.success) {
      // 1010/1011: token expired/invalid -> drop the cache so the next call renews it.
      if (data?.code === 1010 || data?.code === 1011) tokenCache.delete(this.accessId);
      logger.warn("tuya.api_error", { path, code: data?.code });
      if (data?.code === 1106 || data?.code === 2017) throw new ApiError(403, "Sem permissão para este dispositivo Tuya");
      if (data?.code === 2008 || data?.code === 1108) throw new ApiError(404, "Dispositivo Tuya não encontrado");
      throw new ApiError(502, "Tuya recusou a solicitação");
    }
    return data.result as T;
  }

  private async accessToken(signal?: AbortSignal) {
    const cached = tokenCache.get(this.accessId);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const result = await this.send<{ access_token: string; expire_time: number }>("GET", "/v1.0/token", {
      query: { grant_type: 1 },
      signal,
    });
    if (!result?.access_token) throw new ApiError(503, "Tuya não retornou token");
    tokenCache.set(this.accessId, {
      token: result.access_token,
      expiresAt: Date.now() + Math.max(60, Number(result.expire_time) || 0) * 1000,
    });
    return result.access_token;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown, signal?: AbortSignal) {
    return this.send<T>(method, path, { body, signal, accessToken: await this.accessToken(signal) });
  }

  private async scales(deviceId: string, signal?: AbortSignal) {
    const cached = this.scaleCache.get(deviceId);
    if (cached) return cached;
    const spec = await this.call<TuyaSpec>("GET", `/v1.0/devices/${deviceId}/specifications`, undefined, signal).catch(() => null);
    const parsed = parseDpScales(spec);
    if (spec) this.scaleCache.set(deviceId, parsed);
    return parsed;
  }

  async listDevices(signal?: AbortSignal): Promise<DeviceSummary[]> {
    this.ensureConfigured();
    const devices = await this.call<TuyaDevice[]>("GET", `/v1.0/users/${this.uid}/devices`, undefined, signal);
    return (Array.isArray(devices) ? devices : [])
      .filter((device): device is TuyaDevice & { id: string } => typeof device.id === "string" && SAFE_ID.test(device.id))
      .map((device) => {
        const dps = Array.isArray(device.status) ? device.status : [];
        const capabilities: string[] = [];
        if (findSwitchCode(dps)) capabilities.push("switch");
        if (dps.some((dp) => POWER_CODES.includes(dp.code))) capabilities.push("powerMeter");
        if (dps.some((dp) => ENERGY_CODES.includes(dp.code))) capabilities.push("energyMeter");
        return {
          id: device.id,
          name: device.name || device.product_name || "Dispositivo Tuya",
          brand: "Tuya",
          model: device.model || device.product_name || device.category,
          capabilities,
        };
      });
  }

  async getDeviceStatus(deviceId: string, signal?: AbortSignal): Promise<DeviceStatus> {
    this.ensureConfigured();
    assertId(deviceId, "Dispositivo");
    const [device, dps, scales] = await Promise.all([
      this.call<TuyaDevice>("GET", `/v1.0/devices/${deviceId}`, undefined, signal),
      this.call<DpValue[]>("GET", `/v1.0/devices/${deviceId}/status`, undefined, signal),
      this.scales(deviceId, signal),
    ]);
    const raw = tuyaStatusToRaw(Array.isArray(dps) ? dps : [], scales);
    return { id: deviceId, online: device?.online !== false, raw, state: normalizeDeviceState(raw) };
  }

  // Only plugs/switches with a boolean switch DP are advertised as power-off capable.
  async getPowerOffCommands(device: DeviceSummary): Promise<DeviceCommand[]> {
    return device.capabilities?.includes("switch") ? [{ capability: "switch", command: "off" }] : [];
  }

  async executeCommand(deviceId: string, command: DeviceCommand, signal?: AbortSignal) {
    this.ensureConfigured();
    assertId(deviceId, "Dispositivo");
    if (command.capability !== "switch" || (command.command !== "on" && command.command !== "off")) {
      throw new ApiError(400, "Comando não suportado para Tuya");
    }
    const dps = await this.call<DpValue[]>("GET", `/v1.0/devices/${deviceId}/status`, undefined, signal);
    const code = findSwitchCode(Array.isArray(dps) ? dps : []);
    if (!code) throw new ApiError(422, "Dispositivo Tuya sem liga/desliga");
    const result = await this.call<boolean>("POST", `/v1.0/devices/${deviceId}/commands`, {
      commands: [{ code, value: command.command === "on" }],
    }, signal);
    return { ok: result === true };
  }
}

// Test hook: tokens are cached per project across instances.
export const resetTuyaTokenCache = () => tokenCache.clear();
