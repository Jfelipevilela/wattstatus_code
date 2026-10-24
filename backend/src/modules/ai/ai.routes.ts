import { createHmac } from "crypto";
import { Response, Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { createRequestLimiter } from "../../middleware/security";
import { logger } from "../../logging/logger";
import type { MongoDatabase } from "../../storage/mongo-db";
import {
  buildRecommendations, detectAnomalies, evaluateApplied, forecastMonth, measuredSource, planBudget,
  simulateForAppliance, simulateUsage, comparePeriods, money, kwh, measuredAveragePower, brlRate,
} from "./ai.engine";
import { AIDataSource, Orchestrator } from "./ai.orchestrator";
import { aiConfig, createProvider, AIConfig, ModelProvider } from "./ai.provider";
import {
  budgetRequestSchema, chatRequestSchema, preferencesSchema, recommendationStateSchema, simulateRequestSchema,
} from "./ai.schemas";
import type { AIStore } from "./ai.store";

const userKey = (userId: string) => createHmac("sha256", env.jwtSecret).update(`ai:${userId}`).digest("hex");

// In-process concurrency cap for model calls; requests over it get the
// deterministic answer instead of waiting.
export class Semaphore {
  private active = 0;
  constructor(private max: number) {}
  tryAcquire() {
    if (this.active >= this.max) return false;
    this.active++;
    return true;
  }
  release() { this.active = Math.max(0, this.active - 1); }
}

export interface AIRouterDeps {
  data: AIDataSource;
  store: AIStore;
  limits: Pick<MongoDatabase, "consumeRateLimit">;
  getUserEmail?: (userId: string) => Promise<string | null>;
  config?: AIConfig;
  provider?: ModelProvider | null;
  limiter?: boolean;
}

const requireUser = (req: AuthenticatedRequest) => {
  if (!req.userId) throw new ApiError(401, "Não autenticado");
  return req.userId;
};
const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const recommendationId = z.string().min(3).max(200).regex(/^[a-z_]+:[A-Za-z0-9_:.-]+$/);

export const createAIRouter = (deps: AIRouterDeps) => {
  const config = deps.config ?? aiConfig();
  const provider = deps.provider === undefined ? createProvider(config) : deps.provider;
  const semaphore = new Semaphore(config.maxConcurrent);
  const router = Router();

  // Separate from auth and the global limiter: a 429 here only means "wait",
  // it never touches the session.
  if (deps.limiter !== false && "consumeRateLimit" in deps.limits) {
    const limiter = createRequestLimiter(deps.limits as MongoDatabase, "ai-user", 20, 60000,
      (req) => `user:${(req as AuthenticatedRequest).userId ?? req.ip}`);
    router.use((req, res, next) => (req.method === "GET" ? next() : limiter(req, res, next)));
  }

  const reserveModelCall = async (userId: string) => {
    const [user, global] = await Promise.all([
      deps.limits.consumeRateLimit("ai-model-user-day", userKey(userId), 86400000),
      deps.limits.consumeRateLimit("ai-model-global-month", "global", 30 * 86400000),
    ]);
    if (user.totalHits > config.dailyUserBudget || global.totalHits > config.monthlyGlobalBudget) {
      logger.warn("ai.budget_exhausted", { reason: user.totalHits > config.dailyUserBudget ? "user_daily" : "global_monthly" });
      return false;
    }
    return true;
  };

  const orchestrator = new Orchestrator({
    data: deps.data,
    config,
    provider,
    reserveModelCall,
    preferences: (userId) => deps.store.getPreferences(userId),
  });

  const record = (userId: string, feature: string, usage: Parameters<AIStore["recordUsage"]>[1] | Omit<Parameters<AIStore["recordUsage"]>[1], "feature">) =>
    deps.store.recordUsage(userId, { feature, ...usage } as Parameters<AIStore["recordUsage"]>[1])
      .catch((error) => logger.warn("ai.usage_record_failed", { reason: error instanceof Error ? error.name : "unknown" }));

  const loadOwned = async (userId: string, propertyId: string) => {
    const loaded = await orchestrator.snapshotFor(userId, propertyId);
    if (!loaded) throw new ApiError(404, "Imóvel não encontrado");
    return loaded;
  };

  router.get("/status", (_req, res) => {
    res.json({
      enabled: true,
      generative: Boolean(provider),
      provider: provider ? config.provider : null,
      limits: { perMinute: 20, modelCallsPerDay: config.dailyUserBudget, maxToolCalls: config.maxToolCalls },
    });
  });

  router.post("/chat", async (req: AuthenticatedRequest, res, next) => {
    const userId = requireUser(req);
    let acquired = false;
    try {
      const body = chatRequestSchema.parse(req.body);
      acquired = semaphore.tryAcquire();
      const run = acquired ? orchestrator : new Orchestrator({ data: deps.data, config, provider: null, preferences: (id) => deps.store.getPreferences(id) });
      const { response, usage } = await run.chat(userId, body);
      if (!acquired && provider) response.limitations.push("IA muito requisitada agora: resposta gerada pelo motor de cálculo.");
      void record(userId, "chat", usage);
      logger.info("ai.chat", { intent: usage.intent, generated: usage.generated, latencyMs: usage.latencyMs, tokens: usage.inputTokens + usage.outputTokens });
      res.json(response);
    } catch (error) {
      next(error);
    } finally {
      if (acquired) semaphore.release();
    }
  });

  // Deterministic; the simulator sliders call this without spending tokens.
  router.post("/simulate", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const body = simulateRequestSchema.parse(req.body);
      const { snapshot } = await loadOwned(userId, body.propertyId);
      const item = snapshot.appliances.find((entry) => entry.id === body.applianceId);
      if (!item) throw new ApiError(404, "Aparelho não encontrado");
      const simulation = body.daysPerMonth || body.rate
        ? simulateUsage({
          power: item.power, currentHours: item.usageHours, proposedHours: body.proposedHours,
          daysPerMonth: body.daysPerMonth ?? item.days, rate: body.rate ?? item.rate, cyclic: item.cyclic,
          measuredAveragePowerW: measuredAveragePower(item, snapshot.period.daysElapsed),
          applianceId: item.id, applianceName: item.name,
        })
        : simulateForAppliance(item, body.proposedHours, snapshot.period.daysElapsed);
      res.json({
        appliance: { id: item.id, name: item.name, roomId: item.roomId, roomName: item.roomName, power: item.power, usageHours: item.usageHours, days: item.days, rate: item.rate, cyclic: item.cyclic, measured: item.measuredKWh !== null },
        simulation,
      });
    } catch (error) { next(error); }
  });

  router.post("/budget", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const body = budgetRequestSchema.parse(req.body);
      const { snapshot, preferences } = await loadOwned(userId, body.propertyId);
      const protectedIds = [...(body.protectedApplianceIds ?? []), ...(preferences.essentialApplianceIds ?? [])];
      res.json({ plan: planBudget(snapshot, body.target, protectedIds) });
    } catch (error) { next(error); }
  });

  // Proactive, token-free analysis for the dashboard and property pages.
  router.get("/insights", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const propertyId = req.query.propertyId ? idSchema.parse(req.query.propertyId) : undefined;
      const loaded = await orchestrator.snapshotFor(userId, propertyId);
      if (!loaded) return res.json({ property: null, insights: [], recommendations: [] });
      const { snapshot, preferences } = loaded;
      const anomalies = detectAnomalies(snapshot);
      const states = new Map((await deps.store.listRecommendationStates(userId)).map((row) => [row.recommendationId, row]));
      const recommendations = buildRecommendations(snapshot, anomalies, {
        hasGoal: Boolean(preferences.monthlyGoal), protectedIds: preferences.essentialApplianceIds,
      }).map((item) => {
        const state = states.get(item.id);
        const tracking = state?.state === "applied" && state.appliedAt
          ? evaluateApplied(new Date(state.appliedAt), [...snapshot.previousDaily, ...snapshot.daily], state.expectedMonthlyKWh ?? null)
          : null;
        return { ...item, state: state?.state ?? "new", appliedAt: state?.appliedAt ?? null, tracking };
      });
      const forecast = forecastMonth(snapshot);
      const top = snapshot.appliances[0];
      const topRoom = snapshot.rooms.find((room) => room.applianceCount > 0);
      const insights: Array<{ id: string; kind: string; title: string; detail: string; source: string; applianceId?: string; roomId?: string }> = [];
      if (top && top.estimatedCost > 0) {
        insights.push({ id: `top:${top.id}`, kind: "top_consumer", title: `${top.name} é o maior custo estimado`, detail: `R$ ${brlRate(money(top.estimatedCost))} por mês, ${Math.round(top.share * 100)}% do imóvel.`, source: "estimated", applianceId: top.id, roomId: top.roomId ?? undefined });
      }
      if (topRoom) {
        insights.push({ id: `room:${topRoom.id}`, kind: "top_room", title: `${topRoom.name} é o ambiente mais caro`, detail: `R$ ${brlRate(money(topRoom.estimatedCost))} por mês, ${Math.round(topRoom.share * 100)}% do imóvel.`, source: "estimated", roomId: topRoom.id });
      }
      if (forecast.status === "ok" && forecast.cost !== null) {
        const over = preferences.monthlyGoal && forecast.cost > preferences.monthlyGoal;
        insights.push({ id: `forecast:${snapshot.period.start.slice(0, 7)}`, kind: over ? "goal_risk" : "forecast", title: over ? "Previsão acima da meta mensal" : "Previsão do mês", detail: `Cerca de R$ ${Math.round(forecast.cost)}${over ? `, acima da meta de R$ ${preferences.monthlyGoal}` : ""}.`, source: forecast.source });
      }
      const comparison = comparePeriods(snapshot);
      if (comparison.status === "ok" && comparison.change !== null && Math.abs(comparison.change) >= 0.1) {
        insights.push({ id: `trend:${snapshot.period.start.slice(0, 7)}`, kind: comparison.change > 0 ? "increase" : "improvement", title: comparison.change > 0 ? "Consumo medido em alta" : "Consumo medido em queda", detail: `Média diária ${Math.round(Math.abs(comparison.change) * 100)}% ${comparison.change > 0 ? "acima" : "abaixo"} do mês passado (${kwh(comparison.currentPerDay!)} kWh/dia).`, source: comparison.source });
      }
      for (const anomaly of anomalies.slice(0, 2)) insights.push({ id: anomaly.id, kind: anomaly.kind, title: anomaly.title, detail: anomaly.detail, source: anomaly.kind === "measurement_gap" ? "unavailable" : "measured", applianceId: anomaly.applianceId });
      res.json({
        property: snapshot.property,
        period: snapshot.period,
        totals: { ...snapshot.totals, estimatedCost: money(snapshot.totals.estimatedCost), source: measuredSource(snapshot) },
        forecast,
        insights,
        anomalies,
        recommendations: recommendations.filter((item) => item.state !== "dismissed").slice(0, 8),
        preferences,
      });
    } catch (error) { next(error); }
  });

  router.patch("/recommendations/:id", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const id = recommendationId.parse(req.params.id);
      const { state } = recommendationStateSchema.parse(req.body);
      const propertyId = z.object({ propertyId: idSchema.optional() }).parse(req.query).propertyId;
      let expectedMonthlyKWh: number | null = null;
      // Ownership: the recommendation must exist for one of the user's properties.
      const loaded = await orchestrator.snapshotFor(userId, propertyId);
      if (!loaded) throw new ApiError(404, "Imóvel não encontrado");
      const match = buildRecommendations(loaded.snapshot, detectAnomalies(loaded.snapshot), { hasGoal: Boolean(loaded.preferences.monthlyGoal) })
        .find((item) => item.id === id);
      if (!match) throw new ApiError(404, "Recomendação não encontrada");
      if (match.applianceId && match.kind === "reduce_usage") {
        const item = loaded.snapshot.appliances.find((entry) => entry.id === match.applianceId);
        if (item) expectedMonthlyKWh = simulateForAppliance(item, item.usageHours - 1, loaded.snapshot.period.daysElapsed).savings.monthlyKWh;
      }
      await deps.store.setRecommendationState(userId, {
        recommendationId: id, state, propertyId: loaded.snapshot.property.id,
        expectedMonthlyKWh, appliedAt: state === "applied" ? new Date() : null,
      });
      res.json({ ok: true, id, state });
    } catch (error) { next(error); }
  });

  router.get("/preferences", async (req: AuthenticatedRequest, res: Response, next) => {
    try { res.json({ preferences: await deps.store.getPreferences(requireUser(req)) }); } catch (error) { next(error); }
  });
  router.put("/preferences", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const patch = preferencesSchema.parse(req.body);
      if (patch.primaryPropertyId || patch.essentialApplianceIds?.length) {
        const [properties, appliances] = await Promise.all([deps.data.listProperties(userId), deps.data.listAppliances(userId)]);
        if (patch.primaryPropertyId && !properties.some((item) => item.id === patch.primaryPropertyId)) throw new ApiError(404, "Imóvel não encontrado");
        const own = new Set(appliances.map((item) => item.id));
        if (patch.essentialApplianceIds?.some((id) => !own.has(id))) throw new ApiError(404, "Aparelho não encontrado");
      }
      res.json({ preferences: await deps.store.savePreferences(userId, patch) });
    } catch (error) { next(error); }
  });
  router.delete("/data", async (req: AuthenticatedRequest, res, next) => {
    try {
      await deps.store.deleteUserData(requireUser(req));
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  // Aggregated cost and quality metrics. Never exposes conversation content.
  router.get("/admin/usage", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const admins = (process.env.AI_ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
      const email = (await deps.getUserEmail?.(userId))?.toLowerCase();
      if (!email || !admins.includes(email)) throw new ApiError(403, "Acesso restrito");
      const days = z.coerce.number().int().min(1).max(90).default(30).parse(req.query.days);
      res.json({
        usage: await deps.store.usageSummary(new Date(Date.now() - days * 86400000)),
        config: { generative: Boolean(provider), modelFast: config.modelFast, modelReasoning: config.modelReasoning, dailyUserBudget: config.dailyUserBudget, monthlyGlobalBudget: config.monthlyGlobalBudget, maxConcurrent: config.maxConcurrent, smartThingsCommands: false },
      });
    } catch (error) { next(error); }
  });

  return router;
};
