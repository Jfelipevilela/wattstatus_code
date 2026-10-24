// Proves whether server-sent events reach the client progressively through
// the Netlify adapters. serverless-http (functions/api.ts) buffers the whole
// response; the streaming adapter (functions/api-stream.ts) must not.
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = process.env.JWT_SECRET || "isolated-test-secret-with-at-least-32-characters";
process.env.APP_ORIGINS = process.env.APP_ORIGINS || "http://localhost:4411";
const express = require("express");
const serverless = require("serverless-http");
const { runStreaming } = require("../dist/netlify/streaming-adapter");

const STEP_MS = 120;
const sseApp = (seen = {}) => {
  const app = express();
  app.use(express.json());
  app.post("/api/ai/chat/stream", async (req, res) => {
    seen.ip = req.ip;
    seen.body = req.body;
    seen.cookie = req.headers.cookie;
    res.on("close", () => { if (!res.writableEnded) seen.aborted = true; });
    res.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" });
    res.flushHeaders();
    for (let i = 0; i < 4; i++) {
      if (seen.aborted) return;
      res.write(`event: stage\ndata: ${JSON.stringify({ stage: i })}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, STEP_MS));
    }
    res.write(`event: response\ndata: {"ok":true}\n\n`);
    res.end();
  });
  return app;
};
const request = (init = {}) => new Request("https://wattstatus.test/api/ai/chat/stream", {
  method: "POST", headers: { "content-type": "application/json", cookie: "a=1" }, body: JSON.stringify({ message: "oi" }), ...init,
});
const readTimed = async (response) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const started = performance.now();
  const chunks = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push({ at: performance.now() - started, text: decoder.decode(value) });
  }
  return chunks;
};

test("serverless-http entrega todos os eventos de uma vez (comportamento atual de functions/api)", async () => {
  const handler = serverless(sseApp(), { basePath: "/.netlify/functions/api" });
  const started = performance.now();
  const result = await handler({
    httpMethod: "POST", path: "/api/ai/chat/stream", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "oi" }), isBase64Encoded: false, requestContext: { identity: { sourceIp: "203.0.113.9" } },
  }, {});
  const elapsed = performance.now() - started;
  // One body with every event, available only after the last write.
  assert.equal(typeof result.body, "string");
  assert.equal(result.body.match(/^event:/gm).length, 5);
  assert.ok(elapsed >= STEP_MS * 3, `body only after ${elapsed.toFixed(0)} ms`);
});

test("adaptador de streaming entrega cada evento quando é escrito", async () => {
  const seen = {};
  const response = await runStreaming(sseApp(seen), { request: request(), ip: "203.0.113.9" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  const chunks = await readTimed(response);
  const events = chunks.flatMap((chunk) => chunk.text.match(/^event: \w+/gm) ?? []);
  assert.deepEqual(events, ["event: stage", "event: stage", "event: stage", "event: stage", "event: response"]);
  // The first event arrives long before the last one.
  assert.ok(chunks.length >= 5, `${chunks.length} chunks`);
  assert.ok(chunks.at(-1).at - chunks[0].at >= STEP_MS * 3, JSON.stringify(chunks.map((c) => Math.round(c.at))));
  assert.equal(seen.ip, "203.0.113.9", "rate limits see the client address");
  assert.deepEqual(seen.body, { message: "oi" });
  assert.equal(seen.cookie, "a=1");
});

test("cancelar a requisição avisa a rota (close) e encerra o stream", async () => {
  const seen = {};
  const controller = new AbortController();
  const response = await runStreaming(sseApp(seen), { request: request({ signal: controller.signal }), ip: "203.0.113.9" });
  const reader = response.body.getReader();
  await reader.read();
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, STEP_MS * 2));
  assert.equal(seen.aborted, true);
  assert.equal((await reader.read()).done, true);
});

test("respostas comuns do app atravessam o adaptador sem mudança (401, cabeçalhos, JSON)", async () => {
  const { createApp } = require("../dist/app");
  const { logger } = require("../dist/logging/logger");
  for (const level of ["info", "warn", "error", "debug"]) logger[level] = () => {};
  const db = { consumeRateLimit: async () => ({ totalHits: 1, resetTime: new Date(Date.now() + 60000) }) };
  const app = createApp({ db, integrationManager: { get: () => null, list: () => [] } });
  const response = await runStreaming(app, {
    request: new Request("https://wattstatus.test/api/ai/chat/stream", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:4411" }, body: "{}" }),
    ip: "203.0.113.9",
  });
  assert.equal(response.status, 403, "mutation without CSRF token is refused as before");
  assert.ok((await response.json()).error);
});

test("vários Set-Cookie chegam separados e corpo acima do limite é recusado", async () => {
  const app = express();
  app.post("/api/ai/chat/stream", (req, res) => {
    res.cookie("a", "1", { httpOnly: true }).cookie("b", "2", { httpOnly: true }).json({ ok: true });
  });
  const response = await runStreaming(app, { request: request() });
  assert.equal(response.status, 200);
  assert.deepEqual(response.headers.getSetCookie().map((c) => c.split(";")[0]), ["a=1", "b=2"]);
  assert.deepEqual(await response.json(), { ok: true });

  const big = await runStreaming(app, { request: request({ body: "x".repeat(256 * 1024 + 1) }) });
  assert.equal(big.status, 413);
});
