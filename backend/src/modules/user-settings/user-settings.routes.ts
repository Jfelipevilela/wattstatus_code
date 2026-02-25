import { Router } from "express";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { PostgresDatabase } from "../../storage/postgres-db";
import { z } from "zod";

const updateSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  apps: z.array(z.enum(["smartthings", "lg-thinq"])).optional(),
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

export const createUserSettingsRouter = (db: PostgresDatabase) => {
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
