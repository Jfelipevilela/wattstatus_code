import { Router } from "express";
import { z } from "zod";
import { MongoDatabase } from "../../storage/mongo-db";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";

const querySchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  applianceId: z.string().uuid().optional(),
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
      res.json({ intervals });
    } catch (err) { next(err); }
  });
  return router;
};
