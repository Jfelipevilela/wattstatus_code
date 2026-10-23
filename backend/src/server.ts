import { createApp, buildIntegrations } from "./app";
import { env } from "./config/env";
import { MongoDatabase } from "./storage/mongo-db";
import { getErrorFields, logger } from "./logging/logger";

process.on("uncaughtExceptionMonitor", (error, origin) => {
  logger.error("process.uncaught_exception", {
    origin,
    ...getErrorFields(error),
  });
});

const start = async () => {
  const db = new MongoDatabase ();
  await db.init();

  const integrationManager = buildIntegrations();
  const app = createApp({ db, integrationManager });

  app.listen(env.port, () => {
    logger.info("server.started", { port: env.port });
  });
};

start().catch((err) => {
  logger.error("server.start_failed", getErrorFields(err));
  process.exit(1);
});
