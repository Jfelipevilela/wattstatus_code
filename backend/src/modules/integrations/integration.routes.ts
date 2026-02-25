import { Router } from "express";
import { ApiError } from "../../middleware/error-handler";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { PostgresDatabase } from "../../storage/postgres-db";
import { IntegrationManager } from "./integration-manager";

export const createIntegrationRouter = (
  manager: IntegrationManager,
  db: PostgresDatabase
) => {
  const router = Router();

  const ensureIntegrationConfigured = async (
    req: AuthenticatedRequest,
    provider: string
  ) => {
    const integration = manager.get(provider);
    if (!integration) {
      throw new ApiError(404, "Integra\u00e7\u00e3o n\u00e3o encontrada");
    }
    // Se j\u00e1 configurada, segue
    if (integration.isConfigured()) return integration;
    // Tenta carregar token salvo no banco para este usu\u00e1rio
    if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
    const savedToken = await db.getIntegrationToken(req.userId, provider);
    if (savedToken && typeof (integration as any).setToken === "function") {
      (integration as any).setToken(savedToken);
      return integration;
    }
    // sem token salvo -> erro
    throw new ApiError(
      400,
      "Integra\u00e7\u00e3o n\u00e3o configurada. Salve o token e tente novamente."
    );
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
      if (!integration) {
        throw new ApiError(404, "Integra\u00e7\u00e3o n\u00e3o encontrada");
      }
      if (typeof integration.setToken !== "function") {
        throw new ApiError(400, "Integra\u00e7\u00e3o n\u00e3o suporta token din\u00e2mico");
      }
      const token = req.body?.token || "";
      integration.setToken(token);
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
      const status = await integration.getDeviceStatus(req.params.deviceId);
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
