import { Router } from "express";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { MongoDatabase } from "../../storage/mongo-db";
import { z } from "zod";
import { STATE_TARIFFS } from "../../config/tariffs";

const updateSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  apps: z.array(z.enum(["smartthings", "lg-thinq"])).optional(),
  tariffState: z.string().refine((value) => Object.prototype.hasOwnProperty.call(STATE_TARIFFS, value), "Estado inválido").optional(),
  tariffValue: z.number().finite().positive().optional(),
  energyCollectionEnabled: z.boolean().optional(),
  historicalData: z
    .array(
      z.object({
        month: z.string(),
        consumption: z.number(),
        cost: z.number(),
      })
    )
    .optional(),
});

export const createUserSettingsRouter = (db: MongoDatabase) => {
  const router = Router();

  router.get("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const settings = await db.getUserSettings(req.userId);
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  router.put("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const parsed = updateSchema.parse(req.body || {});
      const settings = await db.updateUserSettings(req.userId, parsed);
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
