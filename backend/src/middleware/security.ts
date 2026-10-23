import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import rateLimit, { Store } from "express-rate-limit";
import { env } from "../config/env";
import { MongoDatabase } from "../storage/mongo-db";
import { logger } from "../logging/logger";
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, cookieOptions, normalizeEmail } from "../modules/auth/auth-security";
import { readCookie } from "./auth-middleware";
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
    const identity = createHmac("sha256", env.jwtSecret).update(key).digest("hex");
    return this.db.consumeRateLimit(this.prefix, identity, this.windowMs);
  }
  async decrement(_key: string) {}
  async resetKey(_key: string) {}
}
export const createRequestLimiter = (db: MongoDatabase, prefix: string, max: number, windowMs: number,
  keyGenerator?: (req: Request) => string) => rateLimit({
    store: new MongoRateLimitStore(db, prefix), windowMs, max,
    standardHeaders: true, legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (_req, res) => {
      logger.warn("security.rate_limit_exceeded", { reason: "too_many_requests", limiter: prefix });
      res.status(429).json({ error: "Muitas tentativas. Aguarde e tente novamente." });
    },
  });
export const createAccountLimiter = (db: MongoDatabase) => createRequestLimiter(db, "auth-account-ip", 10,
  15 * 60 * 1000, (req) => {
    const email = typeof req.body?.email === "string" && req.body.email.length <= 254
      ? normalizeEmail(req.body.email) : "invalid";
    return `${req.ip}:${email}`;
  });
export const createDistributedAccountLimiter = (db: MongoDatabase) => createRequestLimiter(db, "auth-account", 50,
  15 * 60 * 1000, (req) => typeof req.body?.email === "string" && req.body.email.length <= 254
    ? normalizeEmail(req.body.email) : `invalid:${req.ip}`);
