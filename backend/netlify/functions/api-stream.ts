import type { Config, Context } from "@netlify/functions";
import express from "express";
import { buildIntegrations, createApp } from "../../src/app";
import { MongoDatabase } from "../../src/storage/mongo-db";
import { getErrorFields, logger } from "../../src/logging/logger";
import { runStreaming } from "../../src/netlify/streaming-adapter";

// Streaming endpoints only. The main `api` function goes through
// serverless-http, which buffers the whole response; this one returns each
// server-sent event as it is written. Same Express app, so authentication,
// CSRF, CORS and rate limits are unchanged.
const STREAM_PATH = "/api/ai/chat/stream";

let appPromise: Promise<express.Express> | null = null;
const getApp = () => {
  appPromise ??= (async () => {
    const db = new MongoDatabase();
    try {
      await db.init();
      return createApp({ db, integrationManager: buildIntegrations() });
    } catch (err) {
      logger.error("serverless.initialization_failed", getErrorFields(err));
      await db.close().catch(() => undefined);
      throw err;
    }
  })().catch((err) => { appPromise = null; throw err; });
  return appPromise;
};

export default async (request: Request, context: Context) => {
  const path = new URL(request.url).pathname;
  if (path !== STREAM_PATH) return new Response(JSON.stringify({ error: "Recurso não encontrado" }), { status: 404 });
  try {
    return await runStreaming(await getApp(), { request, ip: context.ip, path });
  } catch {
    return new Response(JSON.stringify({ error: "Serviço temporariamente indisponível." }), {
      status: 503, headers: { "Content-Type": "application/json", "Retry-After": "5", "Cache-Control": "no-store" },
    });
  }
};

// A function with a path is routed before the /api/* rewrite in netlify.toml.
export const config: Config = { path: STREAM_PATH };
