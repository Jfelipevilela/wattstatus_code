import { Router } from "express";
import { ApiError } from "../../middleware/error-handler";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { MongoDatabase } from "../../storage/mongo-db";
import { IntegrationManager } from "./integration-manager";
import { SmartThingsIntegration } from "./providers/smartthings";
import { extractCumulativeKWh } from "../energy/energy-history";

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
        if (!req.body?.capability || !req.body?.command) {
          throw new ApiError(
            400,
            "capability e command s\u00e3o obrigat\u00f3rios"
          );
        }
        const result = await integration.executeCommand(
          req.params.deviceId,
          req.body
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
      const body = req.body;
      if (!Array.isArray(body?.usage)) {
        throw new ApiError(400, "usage deve ser um array");
      }
      await db.saveIntegrationUsage(req.userId, req.params.provider, body.usage);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
