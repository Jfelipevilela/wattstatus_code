import type { Handler, HandlerResponse } from "@netlify/functions";
import serverless from "serverless-http";
import { buildIntegrations, createApp } from "../../src/app";
import { MongoDatabase } from "../../src/storage/mongo-db";
import { getErrorFields, logger } from "../../src/logging/logger";

const createServerlessApp = async () => {
  const db = new MongoDatabase();
  try {
    await db.init();
    const integrationManager = buildIntegrations();
    const app = createApp({ db, integrationManager });

    return serverless(app, { basePath: "/.netlify/functions/api" });
  } catch (err) {
    logger.error("serverless.initialization_failed", getErrorFields(err));
    await db.close().catch(() => undefined);
    throw err;
  }
};

let serverlessApp: ReturnType<typeof createServerlessApp> | null = null;
const getServerlessApp = () => {
  if (!serverlessApp) {
    serverlessApp = createServerlessApp().catch((err) => {
      serverlessApp = null;
      throw err;
    });
  }
  return serverlessApp;
};

export const handler: Handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    const appHandler = await getServerlessApp();
    // serverless-http's public return type is Object; its AWS adapter returns HandlerResponse.
    return await appHandler(event, context) as HandlerResponse;
  } catch {
    return { statusCode: 503, headers: { "Content-Type": "application/json", "Retry-After": "5", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Serviço temporariamente indisponível." }) };
  }
};
