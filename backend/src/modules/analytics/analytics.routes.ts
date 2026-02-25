import { Router } from "express";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { PostgresDatabase } from "../../storage/postgres-db";

export const createAnalyticsRouter = (db: PostgresDatabase) => {
  const router = Router();

  router.get("/usage", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.userId) throw new ApiError(401, "N\u00e3o autenticado");
      const history = await db.getIntegrationUsageHistory(req.userId, 8);

      const perDay = new Map<string, Record<string, number>>();
      const providerTotals = new Map<string, { minutes: number; devices: Set<string> }>();

      history.forEach((entry) => {
        const minutes = Math.round((entry.accumulatedMs || 0) / 60000);
        const dayKey = entry.day;
        const name =
          entry.applianceName ||
          `Dispositivo ${entry.deviceId.slice(0, 4).toUpperCase()}`;

        const dayRow = perDay.get(dayKey) || {};
        dayRow[name] = (dayRow[name] || 0) + minutes;
        perDay.set(dayKey, dayRow);

        const providerRow =
          providerTotals.get(entry.provider) ||
          { minutes: 0, devices: new Set<string>() };
        providerRow.minutes += minutes;
        providerRow.devices.add(entry.deviceId);
        providerTotals.set(entry.provider, providerRow);
      });

      const dailyTrend = Array.from(perDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, values]) => ({ day, values }));

      const appUsage = Array.from(providerTotals.entries()).map(
        ([provider, item]) => ({
          provider,
          minutes: item.minutes,
          devices: item.devices.size,
        })
      );

      res.json({ dailyTrend, appUsage });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
