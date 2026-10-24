import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { RequestListener } from "node:http";

// Runs an Express app for one Web API Request and returns a streamed Response.
//
// serverless-http (used by functions/api.ts) collects the whole body before it
// returns, so server-sent events would reach the browser all at once. Netlify
// Functions v2 can return a ReadableStream: every res.write() here becomes a
// chunk the moment the app writes it. The app sees the same method, URL,
// headers, body and client IP it gets through serverless-http, so auth, CSRF,
// CORS and rate limits behave the same.
export interface StreamRequestInfo {
  request: Request;
  // Client address as the platform reports it (Netlify: context.ip).
  ip?: string;
  // Path the app should see; defaults to the request's own path.
  path?: string;
}

const MAX_BODY = 256 * 1024;

const toBuffer = (chunk: unknown, encoding?: BufferEncoding) =>
  Buffer.isBuffer(chunk) ? chunk : typeof chunk === "string" ? Buffer.from(chunk, encoding) : Buffer.from(chunk as Uint8Array);

const tooLarge = () => new Response(JSON.stringify({ error: "Requisição muito grande." }),
  { status: 413, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const runStreaming = async (app: RequestListener, { request, ip, path }: StreamRequestInfo): Promise<Response> => {
  const url = new URL(request.url);
  if (Number(request.headers.get("content-length")) > MAX_BODY) return tooLarge();
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
  if (body.length > MAX_BODY) return tooLarge();

  const socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", { value: ip ?? "127.0.0.1" });
  Object.defineProperty(socket, "encrypted", { value: url.protocol === "https:" });
  const req = new IncomingMessage(socket);
  req.method = request.method;
  req.url = `${path ?? url.pathname}${url.search}`;
  request.headers.forEach((value, name) => {
    req.headers[name] = value;
    req.rawHeaders.push(name, value);
  });
  if (body.length) req.headers["content-length"] = String(body.length);
  req.push(body.length ? body : null);
  if (body.length) req.push(null);

  const res = new ServerResponse(req);
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
    cancel() { abort(); },
  });
  const abort = () => {
    if (closed) return;
    closed = true;
    try { controller.close(); } catch { /* already cancelled */ }
    // Same signal Node gives when the browser disconnects.
    res.emit("close");
  };
  request.signal?.addEventListener("abort", abort, { once: true });

  return new Promise<Response>((resolve) => {
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      const headers = new Headers();
      for (const [name, value] of Object.entries(res.getHeaders())) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [String(value)]) headers.append(name, item);
      }
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      headers.delete("connection");
      resolve(new Response(req.method === "HEAD" || res.statusCode === 204 || res.statusCode === 304 ? null : stream,
        { status: res.statusCode, headers }));
    };
    const push = (chunk: unknown, encoding?: BufferEncoding) => {
      if (chunk === undefined || chunk === null || closed) return;
      const bytes = toBuffer(chunk, encoding);
      if (bytes.length) controller.enqueue(new Uint8Array(bytes));
    };
    res.flushHeaders = start;
    res.write = ((chunk: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
      start();
      push(chunk, typeof encoding === "string" ? encoding : undefined);
      const done = typeof encoding === "function" ? encoding : callback;
      done?.();
      return true;
    }) as ServerResponse["write"];
    res.end = ((chunk?: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
      if (typeof chunk === "function") { callback = chunk as () => void; chunk = undefined; }
      start();
      push(chunk, typeof encoding === "string" ? encoding : undefined);
      if (!closed) { closed = true; controller.close(); }
      Object.defineProperty(res, "writableEnded", { value: true, configurable: true });
      res.emit("finish");
      (typeof encoding === "function" ? encoding : callback)?.();
      return res;
    }) as ServerResponse["end"];
    app(req, res);
  });
};
