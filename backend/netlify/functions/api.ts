import type { Handler, HandlerResponse } from "@netlify/functions";
import serverless from "serverless-http";
import { buildIntegrations, createApp } from "../../src/app";
import { MongoDatabase } from "../../src/storage/mongo-db";
import { getErrorFields, logger } from "../../src/logging/logger";

let serverlessApp: Promise<ReturnType<typeof serverless>> | undefined;
const initialize = () => {
  if (serverlessApp) return serverlessApp;
  serverlessApp = (async () => {
    const db = new MongoDatabase();
    await db.init();
    const integrationManager = buildIntegrations();
    const app = createApp({ db, integrationManager });

    return serverless(app, {
      basePath: "/.netlify/functions/api",
    });
  })().catch((error) => {
    serverlessApp = undefined;
    logger.error("serverless.initialization_failed", getErrorFields(error));
    throw error;
  });
  return serverlessApp;
};

export const handler: Handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    const appHandler = await initialize();
    // serverless-http's public return type is Object; its AWS adapter returns HandlerResponse.
    return await appHandler(event, context) as HandlerResponse;
  } catch {
    return { statusCode: 503, headers: { "Content-Type": "application/json", "Retry-After": "5", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Serviço temporariamente indisponível." }) };
  }
};
