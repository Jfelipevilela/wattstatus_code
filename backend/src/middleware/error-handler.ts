import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { getErrorFields, logger, updateLogContext } from "../logging/logger";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string, public code?: string) {
    super(message);
    this.status = status;
  }
}

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  updateLogContext({
    route: typeof _req.route?.path === "string" ? _req.route.path : "unmatched",
  });
  const parserError = err as { type?: string };
  const parserStatus = parserError?.type === "entity.too.large" ? 413
    : parserError?.type === "entity.parse.failed" ? 400
    : parserError?.type === "encoding.unsupported" || parserError?.type === "charset.unsupported" ? 415 : null;
  const status = parserStatus || (
    err instanceof ApiError
      ? err.status
      : err instanceof ZodError
      ? 400
      : 500);
  const zodMessage =
    err instanceof ZodError ? err.issues[0]?.message : null;
  const message = parserStatus === 413 ? "Requisição muito grande."
    : parserStatus === 400 ? "JSON inválido."
    : parserStatus === 415 ? "Formato de requisição não suportado."
    : status >= 500
    ? "Erro interno do servidor"
    : zodMessage ||
      (err instanceof Error ? err.message : "Unexpected error occurred");

  if (err instanceof ZodError) {
    logger.warn("validation.request_invalid", {
      statusCode: status,
      errorCode: "ZOD_VALIDATION",
      reason: "validation_failed",
      validationIssueCount: err.issues.length,
      validationCodes: Array.from(new Set(err.issues.map((issue) => issue.code))),
    });
  } else {
    const fields = {
      statusCode: status,
      ...getErrorFields(err),
    };
    if (status >= 500) {
      logger.error("internal.request_failed", fields);
    } else {
      logger.warn("http.request_rejected", fields);
    }
  }

  if (status === 503) res.setHeader("Retry-After", "1");
  res.status(status).json({ error: message, ...(err instanceof ApiError && err.code ? { code: err.code } : {}) });
};
