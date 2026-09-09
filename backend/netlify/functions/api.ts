import type { Handler } from "@netlify/functions";
import serverless from "serverless-http";
import { buildIntegrations, createApp } from "../../src/app";
import { MongoDatabase } from "../../src/storage/mongo-db";
import { getErrorFields, logger } from "../../src/logging/logger";

const serverlessApp = (async () => {
  const db = new MongoDatabase();
  await db.init();
  const integrationManager = buildIntegrations();
  const app = createApp({ db, integrationManager });

  return serverless(app, {
    basePath: "/.netlify/functions/api",
  });
})().catch((error) => {
  logger.error("serverless.initialization_failed", getErrorFields(error));
  throw error;
});

export const handler: Handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const appHandler = await serverlessApp;
  return appHandler(event, context);
};
