import { Router } from "express";
import { STATE_TARIFFS } from "../../config/tariffs";
import { ApiError } from "../../middleware/error-handler";
import { calculationSchema } from "./calculation.schema";
import { calculateAppliance } from "./calculation.service";
import { env } from "../../config/env";

export const createCalculationRouter = () => {
  const router = Router();

  router.get("/tariffs", (_req, res) => {
    const fetchTariffs = async () => {
      if (!env.tariffsApiUrl) return null;
      try {
        const response = await fetch(env.tariffsApiUrl);
        if (!response.ok) return null;
        const data = await response.json();
        return data?.tariffs || data;
      } catch (err) {
        return null;
      }
    };

    fetchTariffs().then((remote) => {
      res.json({ tariffs: remote || STATE_TARIFFS, source: remote ? "remote" : "fallback" });
    });
  });

  router.post("/appliance", (req, res, next) => {
    try {
      const parsed = calculationSchema.parse(req.body);
      const result = calculateAppliance(parsed);
      res.json({ input: parsed, result });
    } catch (err) {
      if (err instanceof Error) {
        next(new ApiError(400, err.message));
        return;
      }
      next(err);
    }
  });

  return router;
};
