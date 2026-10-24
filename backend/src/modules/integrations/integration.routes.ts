import { Router } from "express";
import { createHash } from "crypto";
import { ApiError } from "../../middleware/error-handler";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { MongoDatabase } from "../../storage/mongo-db";
import { IntegrationManager } from "./integration-manager";
import { SmartThingsIntegration } from "./providers/smartthings";
import { saveDeviceReading } from "../energy/energy-history";
import { validateCommand } from "./device-state";
import {
  buildAuthorizeUrl,
  createState,
  exchangeCode,
  isOAuthConfigured,
  parseStoredToken,
  resolveAccessToken,
  serializeCredentials,
  verifyState,
} from "./smartthings-oauth";
import type { DeviceSummary } from "./types";
import { z } from "zod";
import { logger } from "../../logging/logger";

const DEVICE_CACHE_TTL_MS = 60_000;
const DEVICE_CACHE_MAX_ENTRIES = 1000;
const STATUS_CONCURRENCY = 4;

const commandSchema = z.object({
  capability: z.string().min(1).max(100),
  command: z.string().min(1).max(100),
  component: z.string().min(1).max(100).optional(),
  arguments: z.array(z.union([z.string(), z.number().finite(), z.boolean()])).max(10).optional(),
});
const usageSchema = z.object({ usage: z.array(z.object({
  deviceId: z.string().min(1).max(200),
  accumulatedMs: z.number().finite().nonnegative(),
  lastOn: z.string().datetime({ offset: true }).nullable().optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})).max(200) });

const oauthCallbackSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(1024),
});

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

export const createIntegrationRouter = (
  manager: IntegrationManager,
  db: MongoDatabase
) => {
  const router = Router();

  // Short-lived device list per user and token. Ownership checks reuse it, so a
  // status read or command costs one SmartThings request instead of two.
  const deviceCache = new Map<string, { expiresAt: number; devices: DeviceSummary[] }>();
  const cacheKey = (userId: string, token: string) =>
    `${userId}:${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
  const clearDeviceCache = (userId: string) => {
    for (const key of deviceCache.keys()) {
      if (key.startsWith(`${userId}:`)) deviceCache.delete(key);
    }
  };

  const ensureIntegrationConfigured = async (
    req: AuthenticatedRequest,
    provider: string
  ) => {
    if (provider !== "smartthings" || !manager.get(provider)) {
      throw new ApiError(404, "Integração não encontrada");
    }
    if (!req.userId) throw new ApiError(401, "Não autenticado");
    const savedToken = await resolveAccessToken(db, req.userId);
    if (!savedToken) throw new ApiError(400, "Integração não configurada. Salve o token e tente novamente.");
    return { integration: new SmartThingsIntegration(savedToken), token: savedToken };
  };

  const listDevices = async (
    userId: string,
    { integration, token }: { integration: SmartThingsIntegration; token: string },
    fresh = false
  ) => {
    const key = cacheKey(userId, token);
    const cached = deviceCache.get(key);
    if (!fresh && cached && cached.expiresAt > Date.now()) return cached.devices;
    const devices = await integration.listDevices();
    deviceCache.delete(key);
    deviceCache.set(key, { expiresAt: Date.now() + DEVICE_CACHE_TTL_MS, devices });
    if (deviceCache.size > DEVICE_CACHE_MAX_ENTRIES) {
      const oldest = deviceCache.keys().next().value;
      if (oldest) deviceCache.delete(oldest);
    }
    return devices;
  };

  const ensureOwnedDevice = async (
    userId: string,
    configured: { integration: SmartThingsIntegration; token: string },
    deviceId: string
  ) => {
    const device = (await listDevices(userId, configured)).find((item) => item.id === deviceId);
    if (!device) throw new ApiError(404, "Dispositivo não encontrado");
    return device;
  };

  const readStatus = async (userId: string, integration: SmartThingsIntegration, deviceId: string) => {
    const status = await integration.getDeviceStatus(deviceId);
    await saveDeviceReading(db, userId, integration.id, deviceId, status.raw);
    return status;
  };

  router.get("/", (_req, res) => {
    res.json({ integrations: manager.list() });
  });

  router.get("/:provider/token", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "Não autenticado");
      const token = await db.getIntegrationToken(req.userId, req.params.provider);
      res.json({
        hasToken: Boolean(token),
        method: token ? parseStoredToken(token).kind : null,
        oauthAvailable: req.params.provider === "smartthings" && isOAuthConfigured(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:provider/token", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "Não autenticado");
      const integration = manager.get(req.params.provider);
      if (!integration || integration.id !== "smartthings") {
        throw new ApiError(404, "Integração não encontrada");
      }
      const token = typeof req.body?.token === "string" ? req.body.token.trim() : req.body?.token;
      if (typeof token !== "string" || token.length > 4096) throw new ApiError(400, "Token inválido");
      clearDeviceCache(req.userId);
      if (token) {
        try {
          await new SmartThingsIntegration(token, 8000).listDevices();
        } catch (err) {
          // Only a definitive rejection blocks saving; a SmartThings outage should not.
          if (err instanceof ApiError && err.status === 424) {
            throw new ApiError(400, "A SmartThings recusou este token. Gere um novo e tente novamente.");
          }
        }
        await db.saveIntegrationToken(req.userId, integration.id, token);
        logger.info("integration.token_saved", { provider: integration.id });
      } else {
        await db.deleteIntegrationToken(req.userId, integration.id);
        logger.info("integration.token_removed", { provider: integration.id });
      }
      res.json({ provider: integration.id, configured: Boolean(token) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:provider/oauth/start", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "Não autenticado");
      if (req.params.provider !== "smartthings" || !isOAuthConfigured()) {
        throw new ApiError(404, "Login Samsung indisponível");
      }
      res.json({ url: buildAuthorizeUrl(createState(req.userId)) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:provider/oauth/callback", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "Não autenticado");
      if (req.params.provider !== "smartthings" || !isOAuthConfigured()) {
        throw new ApiError(404, "Login Samsung indisponível");
      }
      const body = oauthCallbackSchema.parse(req.body);
      if (!verifyState(body.state, req.userId)) {
        throw new ApiError(400, "Sessão de login expirada. Tente conectar novamente.");
      }
      const credentials = await exchangeCode(body.code);
      clearDeviceCache(req.userId);
      await db.saveIntegrationToken(req.userId, "smartthings", serializeCredentials(credentials));
      logger.info("integration.oauth_connected", { provider: "smartthings" });
      res.json({ provider: "smartthings", configured: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:provider/devices", async (req: AuthenticatedRequest, res, next) => {
    try {
      const configured = await ensureIntegrationConfigured(req, req.params.provider);
      const devices = await listDevices(req.userId!, configured, true);
      res.json({ provider: configured.integration.id, devices });
    } catch (err) {
      next(err);
    }
  });

  // One round trip for the device screen: the device list plus every status,
  // read with bounded concurrency. A failing device reports its own error
  // instead of failing the whole response.
  router.get("/:provider/overview", async (req: AuthenticatedRequest, res, next) => {
    try {
      const configured = await ensureIntegrationConfigured(req, req.params.provider);
      // Background polls (?cached=1) may reuse the short-lived device list;
      // statuses below are always read live.
      const devices = await listDevices(req.userId!, configured, req.query.cached !== "1");
      const items = await mapLimited(devices, STATUS_CONCURRENCY, async (device) => {
        try {
          const status = await readStatus(req.userId!, configured.integration, device.id);
          return { device, status, error: null };
        } catch (err) {
          return {
            device,
            status: null,
            error: err instanceof ApiError ? err.message : "Leitura indisponível",
          };
        }
      });
      res.json({ provider: configured.integration.id, fetchedAt: new Date().toISOString(), items });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:provider/devices/:deviceId/status", async (req: AuthenticatedRequest, res, next) => {
    try {
      const configured = await ensureIntegrationConfigured(req, req.params.provider);
      await ensureOwnedDevice(req.userId!, configured, req.params.deviceId);
      const status = await readStatus(req.userId!, configured.integration, req.params.deviceId);
      res.json({ provider: configured.integration.id, status });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:provider/devices/:deviceId/commands",
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const configured = await ensureIntegrationConfigured(req, req.params.provider);
        const device = await ensureOwnedDevice(req.userId!, configured, req.params.deviceId);
        const command = commandSchema.parse(req.body);
        const invalid = validateCommand(
          command.capability,
          command.command,
          command.arguments ?? [],
          device.capabilities
        );
        if (invalid) throw new ApiError(400, invalid);
        const result = await configured.integration.executeCommand(
          req.params.deviceId,
          command
        );
        res.json({ provider: configured.integration.id, result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get("/:provider/usage", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "Não autenticado");
      const rows = await db.getIntegrationUsage(req.userId, req.params.provider);
      res.json({ usage: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:provider/usage", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "Não autenticado");
      const body = usageSchema.parse(req.body);
      await db.saveIntegrationUsage(req.userId, req.params.provider, body.usage);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
