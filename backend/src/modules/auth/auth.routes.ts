import { Router, Response, RequestHandler } from "express";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { loginSchema, registerSchema } from "./auth.schema";
import { AuthService } from "./auth.service";
import { AUTH_COOKIE_NAME } from "../../middleware/auth-middleware";
import rateLimit from "express-rate-limit";

export const createAuthRouter = (service: AuthService, authenticate: RequestHandler) => {
  const router = Router();
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });

  const setAuthCookie = (res: Response, token: string) => {
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12,
    });
  };

  router.post("/register", loginLimit, async (req, res, next) => {
    try {
      const parsed = registerSchema.parse(req.body);
      const result = await service.register(parsed);
      setAuthCookie(res, result.token);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", loginLimit, async (req, res, next) => {
    try {
      const parsed = loginSchema.parse(req.body);
      const result = await service.login(parsed);
      setAuthCookie(res, result.token);
      res.json(result);
    } catch (err) {
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

  router.post("/logout", authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.userId && req.sessionId) await service.logout(req.userId, req.sessionId);
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
