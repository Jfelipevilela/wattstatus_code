import { Router } from "express";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import {
  applianceInputSchema,
  applianceUpdateSchema,
} from "./appliances.schema";
import { ApplianceService } from "./appliances.service";

export const createApplianceRouter = (service: ApplianceService) => {
  const router = Router();

  router.get("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const appliances = await service.list(req.userId);
      res.json({ appliances });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const parsed = applianceInputSchema.parse(req.body);
      const appliance = await service.create(req.userId, parsed);
      res.status(201).json({ appliance });
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const parsed = applianceUpdateSchema.parse(req.body);
      const updated = await service.update(req.userId, req.params.id, parsed);
      res.json({ appliance: updated });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      await service.delete(req.userId, req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
};
