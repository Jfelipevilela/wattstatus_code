import { Router, Response } from "express";
import { AuthenticatedRequest, authenticate } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { loginSchema, registerSchema } from "./auth.schema";
import { AuthService } from "./auth.service";
import { AUTH_COOKIE_NAME } from "../../middleware/auth-middleware";
import { getErrorFields, logger, updateLogContext } from "../../logging/logger";
import { ZodError } from "zod";

export const createAuthRouter = (service: AuthService) => {
  const router = Router();

  const setAuthCookie = (res: Response, token: string) => {
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
    });
  };

  router.post("/register", async (req, res, next) => {
    try {
      const parsed = registerSchema.parse(req.body);
      const result = await service.register(parsed);
      updateLogContext({ userId: result.user.id });
      logger.info("auth.registration_succeeded");
      setAuthCookie(res, result.token);
      res.status(201).json(result);
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
      res.json(result);
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

  router.post("/logout", authenticate, async (_req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    logger.info("auth.logout_succeeded");
    res.json({ ok: true });
  });

  return router;
};
