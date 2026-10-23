import { Router } from "express";
import { ApiError } from "../../middleware/error-handler";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { MongoDatabase } from "../../storage/mongo-db";
import { IntegrationManager } from "./integration-manager";
import { SmartThingsIntegration } from "./providers/smartthings";
import { extractCumulativeKWh } from "../energy/energy-history";
import { z } from "zod";

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

export const createIntegrationRouter = (
  manager: IntegrationManager,
  db: MongoDatabase
) => {
  const router = Router();

  const ensureIntegrationConfigured = async (
    req: AuthenticatedRequest,
    provider: string
  ) => {
    if (provider !== "smartthings" || !manager.get(provider)) {
      throw new ApiError(404, "Integra\u00e7\u00e3o n\u00e3o encontrada");
    }
    if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
    const savedToken = await db.getIntegrationToken(req.userId, provider);
    if (!savedToken) throw new ApiError(400, "Integra\u00e7\u00e3o n\u00e3o configurada. Salve o token e tente novamente.");
    return new SmartThingsIntegration(savedToken);
  };

  const ensureOwnedDevice = async (integration: SmartThingsIntegration, deviceId: string) => {
    const devices = await integration.listDevices();
    if (!devices.some((device) => device.id === deviceId)) {
      throw new ApiError(404, "Dispositivo n\u00e3o encontrado");
    }
  };

  router.get("/", (_req, res) => {
    res.json({ integrations: manager.list() });
  });

  router.get("/:provider/token", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const token = await db.getIntegrationToken(req.userId, req.params.provider);
      res.json({ hasToken: Boolean(token) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:provider/token", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const integration = manager.get(req.params.provider);
      if (!integration || integration.id !== "smartthings") {
        throw new ApiError(404, "Integra\u00e7\u00e3o n\u00e3o encontrada");
      }
      const token = req.body?.token;
      if (typeof token !== "string" || token.length > 4096) throw new ApiError(400, "Token inv\u00e1lido");
      if (token) {
        await db.saveIntegrationToken(req.userId, integration.id, token);
      } else {
        await db.deleteIntegrationToken(req.userId, integration.id);
      }
      res.json({ provider: integration.id, configured: Boolean(token) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:provider/devices", async (req, res, next) => {
    try {
      const integration = await ensureIntegrationConfigured(
        req as AuthenticatedRequest,
        req.params.provider
      );
      const devices = await integration.listDevices();
      res.json({ provider: integration.id, devices });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:provider/devices/:deviceId/status", async (req, res, next) => {
    try {
      const integration = await ensureIntegrationConfigured(
        req as AuthenticatedRequest,
        req.params.provider
      );
      await ensureOwnedDevice(integration, req.params.deviceId);
      const status = await integration.getDeviceStatus(req.params.deviceId);
      const counterKWh = extractCumulativeKWh(status.raw);
      if (counterKWh !== null) {
        await db.saveEnergySample((req as AuthenticatedRequest).userId!, integration.id, req.params.deviceId, counterKWh);
      }
      res.json({ provider: integration.id, status });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:provider/devices/:deviceId/commands",
    async (req, res, next) => {
      try {
        const integration = await ensureIntegrationConfigured(
          req as AuthenticatedRequest,
          req.params.provider
        );
        await ensureOwnedDevice(integration, req.params.deviceId);
        const command = commandSchema.parse(req.body);
        const result = await integration.executeCommand(
          req.params.deviceId,
          command
        );
        res.json({ provider: integration.id, result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get("/:provider/usage", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const rows = await db.getIntegrationUsage(req.userId, req.params.provider);
      res.json({ usage: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:provider/usage", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const body = usageSchema.parse(req.body);
      await db.saveIntegrationUsage(req.userId, req.params.provider, body.usage);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
