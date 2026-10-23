import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { createAuthenticate } from "./middleware/auth-middleware";
import { errorHandler } from "./middleware/error-handler";
import { ApplianceService } from "./modules/appliances/appliances.service";
import { createApplianceRouter } from "./modules/appliances/appliances.routes";
import { createCalculationRouter } from "./modules/calculations/calculation.routes";
import { AuthService } from "./modules/auth/auth.service";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { IntegrationManager } from "./modules/integrations/integration-manager";
import { createIntegrationRouter } from "./modules/integrations/integration.routes";
import { SmartThingsIntegration } from "./modules/integrations/providers/smartthings";
import { createUserSettingsRouter } from "./modules/user-settings/user-settings.routes";
import { createAnalyticsRouter } from "./modules/analytics/analytics.routes";
import { MongoDatabase } from "./storage/mongo-db";
import { createEnergyRouter } from "./modules/energy/energy.routes";
import { ApiError } from "./middleware/error-handler";
import { env } from "./config/env";

export interface AppDependencies {
  db: MongoDatabase;
  integrationManager: IntegrationManager;
}

export const createApp = ({ db, integrationManager }: AppDependencies) => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.NODE_ENV === "production" ? [env.frontendOrigin] : [/^http:\/\/localhost:5173$/],
      credentials: true,
    })
  );
  app.use(express.json());
  app.use((req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.headers.authorization) return next();
    const origin = req.headers.origin;
    if (!origin) return req.headers.cookie ? next(new ApiError(403, "Origem obrigatória")) : next();
    try {
      const allowed = new URL(origin).host === req.headers.host || origin === env.frontendOrigin;
      return allowed ? next() : next(new ApiError(403, "Origem não permitida"));
    } catch { return next(new ApiError(403, "Origem inválida")); }
  });
  app.use(morgan("dev"));
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  const authService = new AuthService(db);
  const authenticate = createAuthenticate(db);
  const applianceService = new ApplianceService(db);

  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({
      status: "ok",
      version: "v1",
      integrations: integrationManager.list(),
    });
  });

  app.use("/api/auth", createAuthRouter(authService, authenticate));
  app.use(
    "/api/appliances",
    authenticate,
    createApplianceRouter(applianceService)
  );
  app.use("/api/calculations", authenticate, createCalculationRouter());
  app.use(
    "/api/integrations",
    authenticate,
    createIntegrationRouter(integrationManager, db)
  );
  app.use("/api/user-settings", authenticate, createUserSettingsRouter(db));
  app.use("/api/analytics", authenticate, createAnalyticsRouter(db));
  app.use("/api/energy", authenticate, createEnergyRouter(db));

  app.use(errorHandler);

  return app;
};

export const buildIntegrations = () => {
  const manager = new IntegrationManager();

  // User credentials are loaded from MongoDB for each request.
  manager.register(new SmartThingsIntegration(""));
  return manager;
};
