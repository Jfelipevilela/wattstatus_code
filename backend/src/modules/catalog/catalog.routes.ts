import { Router } from "express";
import { MongoDatabase } from "../../storage/mongo-db";
import { ApiError } from "../../middleware/error-handler";
import { logger } from "../../logging/logger";
import { catalogIdSchema, catalogQuerySchema } from "./catalog.schema";
import { catalogSeed } from "./catalog.seed";
import { z } from "zod";
import { matchCatalog } from "./matching";

export const createCatalogRouter = (db: MongoDatabase) => {
  const router = Router();
  router.get("/match", async (req, res, next) => {
    try {
      const input = z.object({ brand: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(120),
        region: z.enum(["BR", "US"]), voltage: z.coerce.number().positive().max(1000).optional(), category: catalogIdSchema.optional() }).strict().parse(req.query);
      const result = await db.searchCatalog({ search: input.model, page: 1, limit: 48 });
      const candidates = matchCatalog(result.devices, input);
      logger.debug(candidates.length > 1 ? "catalog.device.match_ambiguous" : "catalog.device.matched", { candidateCount: candidates.length });
      res.json({ candidates, requiresConfirmation: true, truncated: result.total > 48 });
    } catch (error) { next(error); }
  });
  router.get("/", async (req, res, next) => {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const result = await db.searchCatalog(query);
      logger.info("catalog.search.completed", {
        resultCount: result.devices.length,
        page: query.page,
      });
      res.json({ ...result, categories: catalogSeed.categories });
    } catch (error) {
      next(error);
    }
  });
  router.get("/:id", async (req, res, next) => {
    try {
      const id = catalogIdSchema.parse(req.params.id);
      const device = await db.getCatalogDevice(id);
      if (!device)
        throw new ApiError(404, "Aparelho não encontrado no catálogo.");
      logger.info("catalog.device.selected", { catalogDeviceId: id });
      res.json({ device });
    } catch (error) {
      next(error);
    }
  });
  return router;
};
