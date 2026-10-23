import { NextFunction, Response, Request } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "./error-handler";
import { MongoDatabase } from "../storage/mongo-db";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

export const AUTH_COOKIE_NAME = "wattstatus_token";

const getCookieToken = (cookieHeader?: string) => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const [name, ...rest] = part.split("=");
    if (name === AUTH_COOKIE_NAME && rest.length > 0) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return null;
};

export const createAuthenticate = (db: Pick<MongoDatabase, "hasSession">) => async (
  req: AuthenticatedRequest, _res: Response, next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;
  const cookieToken = getCookieToken(req.headers.cookie);
  const token = bearerToken || cookieToken;
  if (!token) {
    return next(new ApiError(401, "Token n\u00e3o fornecido"));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; jti?: string };
    if (!payload.sub || !payload.jti || !(await db.hasSession(payload.sub, payload.jti))) {
      return next(new ApiError(401, "Sessão inválida ou revogada"));
    }
    req.userId = payload.sub;
    req.sessionId = payload.jti;
    return next();
  } catch (err) {
    return next(new ApiError(401, "Token inv\u00e1lido ou expirado"));
  }
};
