import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createAuthenticate } from "./middleware/auth-middleware";
import { errorHandler } from "./middleware/error-handler";
import { requestLogging } from "./middleware/request-logging";
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
import { createReportRouter } from "./modules/reports/report.routes";
import { PropertyService } from "./modules/properties/properties.service";
import { createPropertyRouter } from "./modules/properties/properties.routes";
import { createRequestLimiter, protectMutation } from "./middleware/security";

export interface AppDependencies {
  db: MongoDatabase;
  integrationManager: IntegrationManager;
}

export const createApp = ({ db, integrationManager }: AppDependencies) => {
  const app = express();
  const authenticate = createAuthenticate(db);
  app.set("trust proxy", env.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.allowedOrigins.includes(origin)) callback(null, true);
        else callback(new ApiError(403, "Origem não autorizada."));
      },
      credentials: true,
    })
  );
  app.use(requestLogging);
  app.use(createRequestLimiter(db, "http", 120, 60000));
  app.use(express.json({ limit: "100kb", inflate: false }));
  app.use("/api", protectMutation);

  const authService = new AuthService(db);
  const propertyService = new PropertyService(db);
  const applianceService = new ApplianceService(db, propertyService);

  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({
      status: "ok",
      version: "v1",
      integrations: integrationManager.list(),
    });
  });

  app.use("/api/auth", createAuthRouter(authService, db));
  app.use(
    "/api/appliances",
    authenticate,
    createApplianceRouter(applianceService)
  );
  app.use("/api/calculations", authenticate, createCalculationRouter());
  app.use("/api/properties", authenticate, createPropertyRouter(propertyService));
  app.use(
    "/api/integrations",
    authenticate,
    createIntegrationRouter(integrationManager, db)
  );
  app.use("/api/user-settings", authenticate, createUserSettingsRouter(db));
  app.use("/api/analytics", authenticate, createAnalyticsRouter(db));
  app.use("/api/energy", authenticate, createEnergyRouter(db));
  app.use("/api/reports", authenticate, createReportRouter());

  app.use(errorHandler);

  return app;
};

export const buildIntegrations = () => {
  const manager = new IntegrationManager();

  // User credentials are loaded from MongoDB for each request.
  manager.register(new SmartThingsIntegration(""));
  return manager;
};
