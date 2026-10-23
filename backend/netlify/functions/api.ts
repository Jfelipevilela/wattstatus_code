import type { Handler, HandlerResponse } from "@netlify/functions";
import serverless from "serverless-http";
import { buildIntegrations, createApp } from "../../src/app";
import { MongoDatabase } from "../../src/storage/mongo-db";

const serverlessApp = (async () => {
  const db = new MongoDatabase();
  await db.init();
  const integrationManager = buildIntegrations();
  const app = createApp({ db, integrationManager });

  return serverless(app, {
    basePath: "/.netlify/functions/api",
  });
})();

export const handler: Handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const appHandler = await serverlessApp;
  return await appHandler(event, context) as HandlerResponse;
};
