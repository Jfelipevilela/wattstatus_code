import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import {
  logger,
  runWithLogContext,
  updateLogContext,
} from "../logging/logger";

const validRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestLogging = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const provided = req.header("x-request-id");
  const requestId = provided && validRequestId.test(provided) ? provided : randomUUID();
  const startedAt = process.hrtime.bigint();
  const context = {
    requestId,
    method: req.method,
  };

  res.setHeader("X-Request-Id", requestId);

  runWithLogContext(context, () => {
    logger.info("http.request_started");

    res.once("finish", () => {
      updateLogContext({
        route: typeof req.route?.path === "string" ? req.route.path : "unmatched",
      });
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info("http.request_completed", {
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    res.once("close", () => {
      if (!res.writableFinished) {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        logger.warn("http.request_aborted", {
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        });
      }
    });

    next();
  });
};
