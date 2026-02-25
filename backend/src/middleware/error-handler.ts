import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
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
  const status =
    err instanceof ApiError
      ? err.status
      : err instanceof ZodError
      ? 400
      : 500;
  const zodMessage =
    err instanceof ZodError ? err.issues[0]?.message : null;
  const message =
    zodMessage ||
    (err instanceof Error ? err.message : "Unexpected error occurred");

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
};
