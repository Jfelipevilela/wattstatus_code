// Tuya / Smart Life routes. Mounted under /api/integrations/tuya (authenticated).
// The linked Tuya account is resolved server side from the encrypted per-user
// store (tuya-link.ts); the client never supplies a Tuya uid, so one user
// cannot read another account's devices.
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../../middleware/error-handler";
import type { AuthenticatedRequest } from "../../middleware/auth-middleware";
import type { MongoDatabase } from "../../storage/mongo-db";
import { saveDeviceReading } from "../energy/energy-history";
import { logger } from "../../logging/logger";
import { createTuyaForUser, isTuyaProjectConfigured } from "./providers/tuya-link";
import type { TuyaIntegration } from "./providers/tuya";
import type { DeviceSummary } from "./types";

const DEVICE_CACHE_TTL_MS = 60_000;
const DEVICE_CACHE_MAX_ENTRIES = 1000;
const STATUS_CONCURRENCY = 4;
const DEVICE_ID = /^[A-Za-z0-9]{1,64}$/;

// Tuya devices accept only the power switch from WattStatus for now.
const commandSchema = z
  .object({
    capability: z.literal("switch"),
    command: z.enum(["on", "off"]),
    component: z.string().max(100).optional(),
    arguments: z.array(z.never()).max(0).optional(),
  })
  .strict();

const mapLimited = async <T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

export interface TuyaRouterOptions {
  // Test seam: builds the provider for a user. Defaults to the stored per-user link.
  resolve?: (userId: string) => Promise<TuyaIntegration | null> | TuyaIntegration | null;
  projectConfigured?: () => boolean;
  limiter?: RequestHandler;
}

export const createTuyaRouter = (db: MongoDatabase, options: TuyaRouterOptions = {}) => {
  const router = Router();
  const resolve = options.resolve ?? ((userId: string) => createTuyaForUser(db, userId));
  const projectConfigured = options.projectConfigured ?? isTuyaProjectConfigured;
  if (options.limiter) router.use(options.limiter);

  const deviceCache = new Map<string, { expiresAt: number; devices: DeviceSummary[] }>();

  const requireUser = (req: AuthenticatedRequest) => {
    if (!req.userId) throw new ApiError(401, "Não autenticado");
    return req.userId;
  };

  const requireLinked = async (userId: string) => {
    if (!projectConfigured()) throw new ApiError(503, "Integração Tuya não habilitada neste servidor.");
    const integration = await resolve(userId);
    if (!integration) throw new ApiError(400, "Conta Tuya não vinculada a este usuário.");
    return integration;
  };

  const listDevices = async (userId: string, integration: TuyaIntegration, fresh = false) => {
    const cached = deviceCache.get(userId);
    if (!fresh && cached && cached.expiresAt > Date.now()) return cached.devices;
    const devices = await integration.listDevices();
    deviceCache.delete(userId);
    deviceCache.set(userId, { expiresAt: Date.now() + DEVICE_CACHE_TTL_MS, devices });
    if (deviceCache.size > DEVICE_CACHE_MAX_ENTRIES) {
      const oldest = deviceCache.keys().next().value;
      if (oldest) deviceCache.delete(oldest);
    }
    return devices;
  };

  // The device list is already scoped to the linked account; this check also
  // rejects ids that never belonged to it (and malformed ids before any call).
  const ensureOwnedDevice = async (userId: string, integration: TuyaIntegration, deviceId: string) => {
    if (!DEVICE_ID.test(deviceId)) throw new ApiError(400, "Dispositivo Tuya inválido");
    const device = (await listDevices(userId, integration)).find((item) => item.id === deviceId);
    if (!device) throw new ApiError(404, "Dispositivo não encontrado");
    return device;
  };

  const readStatus = async (userId: string, integration: TuyaIntegration, deviceId: string) => {
    const status = await integration.getDeviceStatus(deviceId);
    await saveDeviceReading(db, userId, integration.id, deviceId, status.raw);
    return status;
  };

  router.get("/status", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const configured = projectConfigured();
      const linked = configured && Boolean(await resolve(userId));
      // No uid or keys leave the server; the client only needs the state.
      res.json({ provider: "tuya", projectConfigured: configured, linked, method: linked ? "server-link" : null });
    } catch (err) {
      next(err);
    }
  });

  router.get("/devices", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const integration = await requireLinked(userId);
      res.json({ provider: "tuya", devices: await listDevices(userId, integration, true) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/overview", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const integration = await requireLinked(userId);
      const devices = await listDevices(userId, integration, req.query.cached !== "1");
      const items = await mapLimited(devices, STATUS_CONCURRENCY, async (device) => {
        try {
          const status = await readStatus(userId, integration, device.id);
          return { device, status, error: null };
        } catch (err) {
          return { device, status: null, error: err instanceof ApiError ? err.message : "Leitura indisponível" };
        }
      });
      res.json({ provider: "tuya", fetchedAt: new Date().toISOString(), items });
    } catch (err) {
      next(err);
    }
  });

  router.get("/devices/:deviceId/status", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const integration = await requireLinked(userId);
      await ensureOwnedDevice(userId, integration, req.params.deviceId);
      res.json({ provider: "tuya", status: await readStatus(userId, integration, req.params.deviceId) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/devices/:deviceId/commands", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const integration = await requireLinked(userId);
      const device = await ensureOwnedDevice(userId, integration, req.params.deviceId);
      const command = commandSchema.parse(req.body);
      if (!device.capabilities?.includes("switch")) throw new ApiError(422, "Este dispositivo não tem liga/desliga.");
      const result = await integration.executeCommand(device.id, command);
      logger.info("integration.command_sent", { provider: "tuya", command: command.command });
      res.json({ provider: "tuya", result });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
