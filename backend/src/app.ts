import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { authenticate } from "./middleware/auth-middleware";
import { errorHandler } from "./middleware/error-handler";
import { ApplianceService } from "./modules/appliances/appliances.service";
import { createApplianceRouter } from "./modules/appliances/appliances.routes";
import { createCalculationRouter } from "./modules/calculations/calculation.routes";
import { AuthService } from "./modules/auth/auth.service";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { IntegrationManager } from "./modules/integrations/integration-manager";
import { createIntegrationRouter } from "./modules/integrations/integration.routes";
import { SmartThingsIntegration } from "./modules/integrations/providers/smartthings";
import { LgThinQIntegration } from "./modules/integrations/providers/lg-thinq";
import { PostgresDatabase } from "./storage/postgres-db";
import { env } from "./config/env";
import { createUserSettingsRouter } from "./modules/user-settings/user-settings.routes";
import { createAnalyticsRouter } from "./modules/analytics/analytics.routes";
import { MongoDatabase } from "./storage/mongo-db";

export interface AppDependencies {
  db: MongoDatabase;
  integrationManager: IntegrationManager;
}

export const createApp = ({ db, integrationManager }: AppDependencies) => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json());
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
  const applianceService = new ApplianceService(db);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      version: "v1",
      integrations: integrationManager.list(),
    });
  });

  app.use("/api/auth", createAuthRouter(authService));
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

  app.use(errorHandler);

  return app;
};

export const buildIntegrations = () => {
  const manager = new IntegrationManager();

  manager.register(new SmartThingsIntegration(env.smartThingsToken));
  manager.register(
    new LgThinQIntegration(
      env.lgClientId,
      env.lgClientSecret,
      env.lgRefreshToken
    )
  );

  return manager;
};
