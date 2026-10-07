import { Router, Response } from "express";
import { AuthenticatedRequest, createAuthenticate, readAuthToken, verifyAuthToken } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { loginSchema, registerSchema } from "./auth.schema";
import { AuthService } from "./auth.service";
import { AUTH_COOKIE_NAME } from "../../middleware/auth-middleware";
import { getErrorFields, logger, updateLogContext } from "../../logging/logger";
import { ZodError } from "zod";
import { MongoDatabase } from "../../storage/mongo-db";
import { cookieOptions, SESSION_SECONDS } from "./auth-security";
import { createAccountLimiter, createDistributedAccountLimiter, createRequestLimiter, issueCsrf } from "../../middleware/security";

export const createAuthRouter = (service: AuthService, db: MongoDatabase) => {
  const router = Router();
  const authenticate = createAuthenticate(db);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/csrf", issueCsrf);
  router.use(["/login", "/register"], createRequestLimiter(db, "auth-ip", 20, 15 * 60 * 1000));
  router.use("/login", createAccountLimiter(db));
  router.use("/login", createDistributedAccountLimiter(db));

  const setAuthCookie = (res: Response, token: string) => {
    res.cookie(AUTH_COOKIE_NAME, token, {
      ...cookieOptions,
      maxAge: SESSION_SECONDS * 1000,
    });
  };

  router.post("/register", async (req, res, next) => {
    try {
      const parsed = registerSchema.parse(req.body);
      const result = await service.register(parsed);
      updateLogContext({ userId: result.user.id });
      logger.info("auth.registration_succeeded");
      setAuthCookie(res, result.token);
      res.status(201).json({ user: result.user });
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) {
        logger.warn("auth.registration_refused", { reason: "registration_rejected" });
      } else if (!(err instanceof ZodError)) {
        logger.error("auth.registration_failed", getErrorFields(err));
      }
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const parsed = loginSchema.parse(req.body);
      const result = await service.login(parsed);
      updateLogContext({ userId: result.user.id });
      logger.info("auth.login_succeeded");
      setAuthCookie(res, result.token);
      res.json({ user: result.user });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logger.warn("auth.login_refused", { reason: "invalid_credentials" });
      } else if (!(err instanceof ZodError)) {
        logger.error("auth.login_failed", getErrorFields(err));
      }
      next(err);
    }
  });

  router.get("/me", authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const user = await service.me(req.userId);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.post("/logout", async (req, res, next) => {
    try {
      let sessionId: string | undefined;
      try {
        const token = readAuthToken(req);
        if (token) sessionId = verifyAuthToken(token, true).jti;
      } catch { /* Invalid/expired cookies must not prevent local logout. */ }
      if (sessionId) await db.deleteSession(sessionId);
      res.clearCookie(AUTH_COOKIE_NAME, cookieOptions);
      // Remove the cookie name used before the production __Host- migration as well.
      if (AUTH_COOKIE_NAME !== "wattstatus_token") res.clearCookie("wattstatus_token", cookieOptions);
      logger.info("auth.logout_succeeded");
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  return router;
};
