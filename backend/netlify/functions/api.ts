import type { Handler, HandlerResponse } from "@netlify/functions";
import serverless from "serverless-http";
import { buildIntegrations, createApp } from "../../src/app";
import { MongoDatabase } from "../../src/storage/mongo-db";

const createServerlessApp = async () => {
  const db = new MongoDatabase();
  try {
    await db.init();
    const integrationManager = buildIntegrations();
    const app = createApp({ db, integrationManager });

    return serverless(app, { basePath: "/.netlify/functions/api" });
  } catch (err) {
    await db.close();
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
  const appHandler = await getServerlessApp();
  return await appHandler(event, context) as HandlerResponse;
};
