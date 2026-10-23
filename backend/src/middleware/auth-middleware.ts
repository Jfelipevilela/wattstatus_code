import { NextFunction, Response, Request } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "./error-handler";
import { logger, updateLogContext } from "../logging/logger";
import { MongoDatabase } from "../storage/mongo-db";
import { AUTH_COOKIE_NAME, JWT_AUDIENCE, JWT_ISSUER } from "../modules/auth/auth-security";

export { AUTH_COOKIE_NAME } from "../modules/auth/auth-security";
export interface AuthenticatedRequest extends Request { userId?: string; sessionId?: string; }

export const readCookie = (req: Request, name: string) => {
  const values = (req.headers.cookie || "").split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length > 1) throw new ApiError(401, "Cookie de sessão inválido.");
  if (!values.length) return null;
  try { return decodeURIComponent(values[0].slice(name.length + 1)); }
  catch { throw new ApiError(401, "Cookie de sessão inválido."); }
};
export const readAuthToken = (req: Request) => {
  const header = req.headers.authorization;
  if (header && !/^Bearer [^\s]+$/.test(header)) throw new ApiError(401, "Token inválido.");
  const bearer = header?.slice(7);
  const cookie = readCookie(req, AUTH_COOKIE_NAME);
  if (bearer && cookie && bearer !== cookie) throw new ApiError(401, "Credenciais de sessão conflitantes.");
  const token = bearer || cookie;
  if (token && token.length > 4096) throw new ApiError(401, "Token inválido.");
  return token;
};
export const verifyAuthToken = (token: string, ignoreExpiration = false) => {
  const payload = jwt.verify(token, env.jwtSecret, {
    algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE, ignoreExpiration,
  });
  if (typeof payload === "string" || typeof payload.sub !== "string" || !payload.sub ||
      typeof payload.jti !== "string" || !payload.jti || typeof payload.exp !== "number" ||
      payload.purpose !== "access") throw new ApiError(401, "Token inválido.");
  return payload as JwtPayload & { sub: string; jti: string; exp: number };
};
export const createAuthenticate = (db: MongoDatabase) => async (
  req: AuthenticatedRequest, _res: Response, next: NextFunction
) => {
  try {
    const token = readAuthToken(req);
    if (!token) {
      logger.warn("auth.unauthorized_access", { reason: "missing_token" });
      throw new ApiError(401, "Token não fornecido");
    }
    let payload;
    try { payload = verifyAuthToken(token); }
    catch (error) {
      logger.warn(error instanceof jwt.TokenExpiredError ? "auth.token_expired" : "auth.token_invalid", {
        reason: error instanceof jwt.TokenExpiredError ? "expired_token" : "invalid_token",
      });
      throw new ApiError(401, "Token inválido ou expirado");
    }
    const session = await db.getSession(payload.jti);
    if (!session || session.userId !== payload.sub || !await db.getUserById(payload.sub)) {
      throw new ApiError(401, "Sessão encerrada ou inválida.");
    }
    req.userId = payload.sub;
    req.sessionId = payload.jti;
    updateLogContext({ userId: payload.sub });
    next();
  } catch (error) { next(error); }
};
