import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import rateLimit, { Store } from "express-rate-limit";
import { env } from "../config/env";
import { MongoDatabase } from "../storage/mongo-db";
import { logger } from "../logging/logger";
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, cookieOptions, normalizeEmail } from "../modules/auth/auth-security";
import { readAuthToken, readCookie, verifyAuthToken } from "./auth-middleware";
import { ApiError } from "./error-handler";

const csrfKey = createHmac("sha256", env.jwtSecret).update("wattstatus-csrf-v1").digest();
const sessionBinding = (req: Request) => createHash("sha256")
  .update(readCookie(req, AUTH_COOKIE_NAME) || "anonymous").digest("hex");
export const issueCsrf = (req: Request, res: Response, next: NextFunction) => {
  try {
    const csrfToken = jwt.sign({ binding: sessionBinding(req), purpose: "csrf" }, csrfKey, {
      algorithm: "HS256", expiresIn: "2h", audience: "wattstatus-csrf", jwtid: randomUUID(),
    });
    res.cookie(CSRF_COOKIE_NAME, csrfToken, { ...cookieOptions, maxAge: 2 * 60 * 60 * 1000 });
    res.json({ csrfToken });
  } catch (error) { next(error); }
};
export const protectMutation = (req: Request, _res: Response, next: NextFunction) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!req.is("application/json")) return next(new ApiError(415, "Envie a requisição em JSON."));
  // Cookie-authenticated mutations always require CSRF; Bearer-only clients are explicit.
  if (req.headers.authorization && !req.headers.cookie && !req.headers.origin) return next();
  try {
    const token = req.header("x-csrf-token");
    const cookie = readCookie(req, CSRF_COOKIE_NAME);
    if (!token || token.length > 4096 || !cookie || token.length !== cookie.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(cookie))) throw new Error("invalid csrf");
    const payload = jwt.verify(token, csrfKey, { algorithms: ["HS256"], audience: "wattstatus-csrf" });
    if (typeof payload === "string" || payload.purpose !== "csrf" || payload.binding !== sessionBinding(req)) {
      throw new Error("invalid binding");
    }
    next();
  } catch {
    logger.warn("security.csrf_refused", { reason: "csrf_validation_failed" });
    next(new ApiError(403, "Recarregue a sessão e tente novamente.", "CSRF_INVALID"));
  }
};
export class MongoRateLimitStore implements Store {
  localKeys = false;
  private windowMs = 60000;
  constructor(private db: MongoDatabase, public prefix: string) {}
  init(options: { windowMs: number }) { this.windowMs = options.windowMs; }
  increment(key: string) {
    const identity = createHmac("sha256", env.jwtSecret).update(key || "unknown-client").digest("hex");
    return this.db.consumeRateLimit(this.prefix, identity, this.windowMs);
  }
  async decrement(_key: string) {}
  async resetKey(_key: string) {}
}
const clientIp = (req: Request) => req.ip || req.socket?.remoteAddress || "unknown-client";
export const createRequestLimiter = (db: MongoDatabase, prefix: string, max: number, windowMs: number,
  keyGenerator?: (req: Request) => string) => rateLimit({
    store: new MongoRateLimitStore(db, prefix), windowMs, max,
    standardHeaders: true, legacyHeaders: false,
    keyGenerator: keyGenerator || clientIp,
    handler: (_req, res) => {
      logger.warn("security.rate_limit_exceeded", { reason: "too_many_requests", limiter: prefix });
      res.status(429).json({ error: "Muitas tentativas. Aguarde e tente novamente." });
    },
  });
export const createAccountLimiter = (db: MongoDatabase) => createRequestLimiter(db, "auth-account-ip", 10,
  15 * 60 * 1000, (req) => {
    const email = typeof req.body?.email === "string" && req.body.email.length <= 254
      ? normalizeEmail(req.body.email) : "invalid";
    return `${clientIp(req)}:${email}`;
  });
export const createDistributedAccountLimiter = (db: MongoDatabase) => createRequestLimiter(db, "auth-account", 50,
  15 * 60 * 1000, (req) => typeof req.body?.email === "string" && req.body.email.length <= 254
    ? normalizeEmail(req.body.email) : `invalid:${clientIp(req)}`);

// Global API limiter.
// - Anonymous traffic: 120 requests/min per IP (unchanged).
// - Signed-in traffic: 300 requests/min per session, so several people behind
//   one NAT (office, school, mobile carrier) no longer share one 120/min bucket,
//   plus an IP ceiling that caps how many sessions one address can drive.
// The session is identified by a locally verified JWT (signature, issuer,
// audience, expiry); a forged or expired token falls back to the IP bucket.
// Both counters are consumed in one round trip pair, in parallel.
export const HTTP_LIMITS = { anonymousPerIp: 120, perSession: 300, authenticatedPerIp: 1200, windowMs: 60000 };
const sessionKey = (req: Request) => {
  try {
    const token = readAuthToken(req);
    return token ? verifyAuthToken(token).jti : null;
  } catch {
    return null;
  }
};
const hmacKey = (key: string) => createHmac("sha256", env.jwtSecret).update(key).digest("hex");
export const createHttpLimiter = (db: MongoDatabase, limits = HTTP_LIMITS) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = clientIp(req);
      const session = sessionKey(req);
      const checks: Array<Promise<{ totalHits: number; resetTime: Date; max: number }>> = session
        ? [
            db.consumeRateLimit("http-session", hmacKey(session), limits.windowMs).then((row) => ({ ...row, max: limits.perSession })),
            db.consumeRateLimit("http-ip-auth", hmacKey(ip), limits.windowMs).then((row) => ({ ...row, max: limits.authenticatedPerIp })),
          ]
        : [db.consumeRateLimit("http", hmacKey(ip), limits.windowMs).then((row) => ({ ...row, max: limits.anonymousPerIp }))];
      const rows = await Promise.all(checks);
      const primary = rows[0];
      res.setHeader("RateLimit-Limit", String(primary.max));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, primary.max - primary.totalHits)));
      const exceeded = rows.find((row) => row.totalHits > row.max);
      if (!exceeded) return next();
      const retryAfter = Math.max(1, Math.ceil((exceeded.resetTime.getTime() - Date.now()) / 1000));
      logger.warn("security.rate_limit_exceeded", { reason: "too_many_requests", limiter: session ? "http-session" : "http" });
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Muitas requisições em pouco tempo. Aguarde alguns segundos e tente novamente.", code: "RATE_LIMITED" });
    } catch (error) { next(error); }
  };
