import { Router } from "express";
import { z } from "zod";
import { MongoDatabase } from "../../storage/mongo-db";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { intervalsBody } from "./energy-compact";

const querySchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  applianceId: z.string().uuid().optional(),
  format: z.literal("columns").optional(),
});

export const createEnergyRouter = (db: MongoDatabase) => {
  const router = Router();
  router.get("/history", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "Não autenticado");
      const query = querySchema.parse(req.query);
      const start = new Date(query.start);
      const end = new Date(query.end);
      const span = end.getTime() - start.getTime();
      if (span <= 0 || span > 366 * 86400000) throw new ApiError(400, "Período inválido");
      const intervals = await db.getEnergyHistory(req.userId, start, end, query.applianceId);
      res.json({ intervals: intervalsBody(intervals, query.format) });
    } catch (err) { next(err); }
  });
  // Freshness of the signed-in user's readings, per device: recent, delayed,
  // missing, disabled or error. Contract for the UI and WattStatus AI
  // (docs/COLETA_ENERGIA.md § Contrato).
  const intervalMs = () => Math.max(5, Number(process.env.ENERGY_COLLECTION_INTERVAL_MINUTES || 30)) * 60000;
  router.get("/collection-status", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "Não autenticado");
      res.json(await db.energyCollectionStatus(req.userId, new Date(), intervalMs()));
    } catch (err) { next(err); }
  });
  // Queue health for operators only (server-side admin grant, see isAdmin).
  router.get("/collection-stats", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "Não autenticado");
      if (!(await db.isAdmin(req.userId))) throw new ApiError(403, "Acesso restrito");
      res.json(await db.energyCollectionStats(new Date(), intervalMs()));
    } catch (err) { next(err); }
  });
  return router;
};
