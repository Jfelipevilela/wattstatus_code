import { Router } from "express";
import { z } from "zod";
import { logger } from "../../logging/logger";

const reportEventSchema = z.object({
  event: z.enum([
    "generation_started",
    "generation_completed",
    "generation_failed",
    "export_started",
    "export_completed",
    "export_failed",
  ]),
  itemCount: z.number().int().min(0).max(10000).optional(),
  durationMs: z.number().min(0).max(3_600_000).optional(),
});

export const createReportRouter = () => {
  const router = Router();

  router.post("/events", (req, res, next) => {
    try {
      const payload = reportEventSchema.parse(req.body);
      const level = payload.event.endsWith("_failed") ? "error" : "info";
      logger[level](`report.${payload.event}`, {
        reportType: "monthly_energy_pdf",
        itemCount: payload.itemCount,
        durationMs: payload.durationMs,
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
};
