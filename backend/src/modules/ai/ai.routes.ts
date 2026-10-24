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
  buildReportSummary, monthPeriodFor,
} from "./ai.engine";
import { AIDataSource, ChatOptions, Orchestrator, loadSnapshot } from "./ai.orchestrator";
import { aiConfig, createProvider, AIConfig, ModelProvider } from "./ai.provider";
import {
  budgetRequestSchema, chatRequestSchema, preferencesSchema, recommendationStateSchema, simulateRequestSchema,
  settingsSchema, ALLOWED_MODELS, type ChatRequest, planRequestSchema, planActionSchema, alertStateSchema,
} from "./ai.schemas";
import type { AISettings, AIStore } from "./ai.store";
import { detectAlerts, frequencyMs } from "./ai.alerts";
import { buildSavingsPlan, planProgress } from "./ai.plans";

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
  // The app passes the MongoDatabase here; its stored collection status
  // (energyCollectionStatus) feeds measurement freshness when available.
  limits: Pick<MongoDatabase, "consumeRateLimit"> & Partial<Pick<MongoDatabase, "energyCollectionStatus">>;
  // Server-side admin grant (MongoDatabase.isAdmin). Absent means nobody is admin.
  isAdmin?: (userId: string) => Promise<boolean>;
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

export const createAIRouter = (input: AIRouterDeps) => {
  // Freshness comes from what the collector already stored for this user:
  // no SmartThings call per question, and only the signed-in user's rows.
  const collectionStatus = input.data.getCollectionStatus ?? (input.limits.energyCollectionStatus
    ? (userId: string) => input.limits.energyCollectionStatus!(userId, new Date(), Math.max(5, Number(process.env.ENERGY_COLLECTION_INTERVAL_MINUTES || 30)) * 60000)
    : undefined);
  const deps: AIRouterDeps = { ...input, data: { ...input.data, ...(collectionStatus ? { getCollectionStatus: collectionStatus } : {}) } };
  const baseConfig = deps.config ?? aiConfig();
  const baseProvider = deps.provider === undefined ? createProvider(baseConfig) : deps.provider;
  const semaphore = new Semaphore(baseConfig.maxConcurrent);
  const router = Router();

  // Separate from auth and the global limiter: a 429 here only means "wait",
  // it never touches the session.
  if (deps.limiter !== false && "consumeRateLimit" in deps.limits) {
    const limiter = createRequestLimiter(deps.limits as MongoDatabase, "ai-user", 20, 60000,
      (req) => `user:${(req as AuthenticatedRequest).userId ?? req.ip}`);
    router.use((req, res, next) => (req.method === "GET" ? next() : limiter(req, res, next)));
  }

  // Environment holds the secret and the ceiling; admin settings can switch
  // the model off, pick an allowed model or lower the budgets.
  const effective = async () => {
    const settings = await deps.store.getSettings().catch(() => ({} as AISettings));
    const config: AIConfig = {
      ...baseConfig,
      modelFast: settings.modelFast ?? baseConfig.modelFast,
      modelReasoning: settings.modelReasoning ?? baseConfig.modelReasoning,
      dailyUserBudget: settings.dailyUserBudget ?? baseConfig.dailyUserBudget,
      monthlyGlobalBudget: settings.monthlyGlobalBudget ?? baseConfig.monthlyGlobalBudget,
    };
    const provider = settings.enabled === false ? null : baseProvider;
    return { config, provider, settings };
  };

  const isAdmin = async (userId: string) => Boolean(await deps.isAdmin?.(userId).catch(() => false));
  const requireAdmin = async (userId: string) => {
    if (!(await isAdmin(userId))) throw new ApiError(403, "Acesso restrito");
  };

  const buildOrchestrator = (config: AIConfig, provider: ModelProvider | null, limited: { hit: boolean }) => new Orchestrator({
    data: deps.data,
    config,
    provider,
    preferences: (userId) => deps.store.getPreferences(userId),
    reserveModelCall: async (userId: string) => {
      const [user, global] = await Promise.all([
        deps.limits.consumeRateLimit("ai-model-user-day", userKey(userId), 86400000),
        deps.limits.consumeRateLimit("ai-model-global-month", "global", 30 * 86400000),
      ]);
      // Spend cap in USD over the calendar month, from recorded usage.
      const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
      const spent = config.monthlyCostLimitUsd > 0 ? await deps.store.costSince(monthStart).catch(() => 0) : 0;
      if (config.monthlyCostLimitUsd > 0 && spent >= config.monthlyCostLimitUsd) {
        limited.hit = true;
        logger.warn("ai.budget_exhausted", { reason: "monthly_cost" });
        return false;
      }
      if (user.totalHits > config.dailyUserBudget || global.totalHits > config.monthlyGlobalBudget) {
        limited.hit = true;
        logger.warn("ai.budget_exhausted", { reason: user.totalHits > config.dailyUserBudget ? "user_daily" : "global_monthly" });
        return false;
      }
      return true;
    },
  });
  // Token-free paths (simulate, insights, reports) never call the model.
  const orchestrator = buildOrchestrator(baseConfig, null, { hit: false });

  const record = (userId: string, feature: string, usage: Omit<Parameters<AIStore["recordUsage"]>[1], "feature"> & { limited?: boolean }) =>
    deps.store.recordUsage(userId, { feature, ...usage } as Parameters<AIStore["recordUsage"]>[1])
      .catch((error) => logger.warn("ai.usage_record_failed", { reason: error instanceof Error ? error.name : "unknown" }));

  const loadOwned = async (userId: string, propertyId: string) => {
    const loaded = await orchestrator.snapshotFor(userId, propertyId);
    if (!loaded) throw new ApiError(404, "Imóvel não encontrado");
    return loaded;
  };

  router.get("/status", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const { config, provider, settings } = await effective();
      res.json({
        enabled: true,
        generative: Boolean(provider),
        provider: provider ? config.provider : null,
        admin: await isAdmin(userId),
        experimental: settings.experimental ?? {},
        limits: { perMinute: 20, modelCallsPerDay: config.dailyUserBudget, maxToolCalls: config.maxToolCalls },
      });
    } catch (error) { next(error); }
  });

  // One chat turn. Shared by the JSON and the streaming endpoints.
  const runChat = async (userId: string, body: ChatRequest, options: ChatOptions) => {
    const { config, provider, settings } = await effective();
    // Experimental features an admin switched off fall back to plain chat.
    if (body.chart && settings.experimental?.chartExplain === false) body = { ...body, chart: undefined };
    if (settings.experimental?.streaming === false) options = { ...options, onStage: undefined };
    const acquired = provider ? semaphore.tryAcquire() : false;
    const limited = { hit: false };
    try {
      const run = buildOrchestrator(config, acquired ? provider : null, limited);
      const { response, usage } = await run.chat(userId, body, options);
      if (provider && !acquired) response.limitations.push("IA muito requisitada agora: resposta gerada pelo motor de cálculo.");
      const preferences = await deps.store.getPreferences(userId);
      const retention = preferences.conversationRetentionDays ?? 30;
      if (retention > 0) {
        response.conversationId = await deps.store.appendConversation(userId, body.conversationId ?? null, retention, response.context.propertyId ?? null, [
          { role: "user", content: body.message },
          { role: "assistant", content: response.message, response },
        ]).catch(() => null);
      }
      void record(userId, body.chart ? "chart" : "chat", { ...usage, limited: limited.hit });
      logger.info("ai.chat", { intent: usage.intent, generated: usage.generated, latencyMs: usage.latencyMs, tokens: usage.inputTokens + usage.outputTokens, guard: usage.guardViolations?.length ?? 0 });
      return response;
    } finally {
      if (acquired) semaphore.release();
    }
  };

  router.post("/chat", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const body = chatRequestSchema.parse(req.body);
      const controller = new AbortController();
      res.on("close", () => { if (!res.writableEnded) controller.abort(); });
      res.json(await runChat(userId, body, { signal: controller.signal }));
    } catch (error) { next(error); }
  });

  // Server-sent events: progress stages first, then the validated response.
  // No model text is ever sent before it passes the guard.
  router.post("/chat/stream", async (req: AuthenticatedRequest, res, next) => {
    let started = false;
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    try {
      const userId = requireUser(req);
      const body = chatRequestSchema.parse(req.body);
      res.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
      res.flushHeaders?.();
      started = true;
      const send = (event: string, data: unknown) => {
        if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const response = await runChat(userId, body, { signal: controller.signal, onStage: (stage) => send("stage", { stage }) });
      send("response", response);
      res.end();
    } catch (error) {
      if (!started) return next(error);
      const status = error instanceof ApiError ? error.status : 500;
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ status, error: status === 500 ? "Não foi possível responder agora." : (error as Error).message })}\n\n`);
        res.end();
      }
    }
  });

  router.get("/conversations", async (req: AuthenticatedRequest, res, next) => {
    try { res.json({ conversations: await deps.store.listConversations(requireUser(req)) }); } catch (error) { next(error); }
  });
  router.get("/conversations/:id", async (req: AuthenticatedRequest, res, next) => {
    try {
      const conversation = await deps.store.getConversation(requireUser(req), z.string().uuid().parse(req.params.id));
      if (!conversation) throw new ApiError(404, "Conversa não encontrada");
      res.json({ conversation: { id: conversation.id, title: conversation.title, propertyId: conversation.propertyId, messages: conversation.messages } });
    } catch (error) { next(error); }
  });
  router.delete("/conversations/:id", async (req: AuthenticatedRequest, res, next) => {
    try {
      const ok = await deps.store.deleteConversation(requireUser(req), z.string().uuid().parse(req.params.id));
      if (!ok) throw new ApiError(404, "Conversa não encontrada");
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  // Alerts: deterministic, stored with dedupe and a per-kind minimum interval.
  // Nothing is sent anywhere; delivery needs a channel and the user's consent.
  router.get("/alerts", async (req: AuthenticatedRequest, res, next) => {
    try { res.json({ alerts: await deps.store.listAlerts(requireUser(req)) }); } catch (error) { next(error); }
  });
  router.post("/alerts/evaluate", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const [preferences, { settings }] = await Promise.all([deps.store.getPreferences(userId), effective()]);
      if (settings.experimental?.alerts === false) return res.json({ created: [], skipped: "disabled_by_admin" });
      if (!preferences.proactiveInsights || (preferences.alertFrequency ?? "off") === "off") {
        return res.json({ created: [], skipped: "consent_required" });
      }
      const [properties, dismissed] = await Promise.all([deps.data.listProperties(userId), deps.store.dismissedRecommendations(userId)]);
      const created = [];
      for (const property of properties.slice(0, 5)) {
        const loaded = await orchestrator.snapshotFor(userId, property.id);
        if (!loaded) continue;
        created.push(...await deps.store.saveAlerts(userId, detectAlerts(loaded.snapshot, preferences, new Date(), dismissed), frequencyMs(preferences.alertFrequency)));
      }
      res.json({ created });
    } catch (error) { next(error); }
  });

  // Deterministic summary for the monthly report and its PDF.
  router.get("/report-summary", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const query = z.object({
        propertyId: idSchema.optional(),
        year: z.coerce.number().int().min(2000).max(2100),
        month: z.coerce.number().int().min(1).max(12),
      }).parse(req.query);
      const [properties, appliances, preferences] = await Promise.all([
        deps.data.listProperties(userId), deps.data.listAppliances(userId), deps.store.getPreferences(userId),
      ]);
      const property = query.propertyId ? properties.find((item) => item.id === query.propertyId) : properties.find((item) => item.isPrimary) ?? properties[0];
      if (!property) throw new ApiError(404, "Imóvel não encontrado");
      const snapshot = await loadSnapshot(deps.data, userId, property, appliances, new Date(), monthPeriodFor(query.year, query.month, property.timezone || "America/Sao_Paulo"));
      const recommendations = buildRecommendations(snapshot, detectAnomalies(snapshot), {
        hasGoal: Boolean(preferences.monthlyGoal), protectedIds: preferences.essentialApplianceIds,
        minHours: preferences.minHoursByAppliance, categories: preferences.recommendationCategories,
      });
      res.json({ property: { id: property.id, name: property.name }, ...buildReportSummary(snapshot, recommendations) });
    } catch (error) { next(error); }
  });

  router.get("/admin/settings", async (req: AuthenticatedRequest, res, next) => {
    try {
      await requireAdmin(requireUser(req));
      const { config, provider, settings } = await effective();
      res.json({
        settings,
        effective: {
          generative: Boolean(provider), keyConfigured: Boolean(baseConfig.apiKey), envEnabled: baseConfig.enabled,
          modelFast: config.modelFast, modelReasoning: config.modelReasoning,
          dailyUserBudget: config.dailyUserBudget, monthlyGlobalBudget: config.monthlyGlobalBudget,
          maxConcurrent: config.maxConcurrent, smartThingsCommands: false,
        },
        allowedModels: ALLOWED_MODELS,
      });
    } catch (error) { next(error); }
  });
  router.put("/admin/settings", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      await requireAdmin(userId);
      const patch = settingsSchema.parse(req.body);
      // Budgets can be lowered from the environment ceiling, never raised.
      if (patch.dailyUserBudget !== undefined && patch.dailyUserBudget > baseConfig.dailyUserBudget) throw new ApiError(400, `Limite diário máximo: ${baseConfig.dailyUserBudget}.`);
      if (patch.monthlyGlobalBudget !== undefined && patch.monthlyGlobalBudget > baseConfig.monthlyGlobalBudget) throw new ApiError(400, `Teto mensal máximo: ${baseConfig.monthlyGlobalBudget}.`);
      const settings = await deps.store.saveSettings(patch, userKey(userId).slice(0, 16));
      logger.info("ai.settings_updated", { fields: Object.keys(patch).join(",") });
      res.json({ settings });
    } catch (error) { next(error); }
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
      res.json({ plan: planBudget(snapshot, body.target, {
        protectedIds,
        maxReduction: (preferences.maxReductionPercent ?? 30) / 100,
        minHours: preferences.minHoursByAppliance,
      }) });
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
        minHours: preferences.minHoursByAppliance, categories: preferences.recommendationCategories,
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
      const { state, feedback } = recommendationStateSchema.parse(req.body);
      const propertyId = z.object({ propertyId: idSchema.optional() }).parse(req.query).propertyId;
      let expectedMonthlyKWh: number | null = null;
      // Ownership: the recommendation must exist for one of the user's properties.
      const loaded = await orchestrator.snapshotFor(userId, propertyId);
      if (!loaded) throw new ApiError(404, "Imóvel não encontrado");
      const anomalies = detectAnomalies(loaded.snapshot);
      const match = [
        ...buildRecommendations(loaded.snapshot, anomalies, { hasGoal: Boolean(loaded.preferences.monthlyGoal) }),
        ...buildRecommendations(loaded.snapshot, anomalies, { roomIds: loaded.snapshot.rooms.map((room) => room.id) }),
      ].find((item) => item.id === id);
      if (!match) throw new ApiError(404, "Recomendação não encontrada");
      if (feedback) await deps.store.setRecommendationFeedback(userId, id, feedback);
      if (!state) return res.json({ ok: true, id, feedback });
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

  // Alert history: read, dismissed (cancelled) or back to new.
  router.patch("/alerts/:key", async (req: AuthenticatedRequest, res, next) => {
    try {
      const key = z.string().min(3).max(200).regex(/^[a-z_]+:[A-Za-z0-9_:.-]+$/).parse(req.params.key);
      const { state } = alertStateSchema.parse(req.body);
      if (!(await deps.store.setAlertState(requireUser(req), key, state))) throw new ApiError(404, "Alerta não encontrado");
      res.json({ ok: true, key, state });
    } catch (error) { next(error); }
  });

  // Savings plans: computed on the server from the target, saved, tracked.
  router.post("/plans", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const body = planRequestSchema.parse(req.body);
      const { snapshot, preferences } = await loadOwned(userId, body.propertyId);
      const plan = buildSavingsPlan(snapshot, body.target, {
        protectedIds: [...(body.protectedApplianceIds ?? []), ...(preferences.essentialApplianceIds ?? [])],
        maxReduction: (preferences.maxReductionPercent ?? 30) / 100,
        minHours: preferences.minHoursByAppliance,
        statedCurrent: body.statedCurrent ?? null,
      });
      if (!plan.actions.length) throw new ApiError(409, "Não há mudanças possíveis para salvar neste plano.");
      res.status(201).json({ plan: await deps.store.savePlan(userId, plan) });
    } catch (error) { next(error); }
  });
  router.get("/plans", async (req: AuthenticatedRequest, res, next) => {
    try { res.json({ plans: await deps.store.listPlans(requireUser(req)) }); } catch (error) { next(error); }
  });
  router.get("/plans/:id", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const plan = await deps.store.getPlan(userId, z.string().uuid().parse(req.params.id));
      if (!plan) throw new ApiError(404, "Plano não encontrado");
      const loaded = await orchestrator.snapshotFor(userId, plan.propertyId);
      res.json({ plan, progress: loaded ? planProgress(plan, loaded.snapshot) : [] });
    } catch (error) { next(error); }
  });
  router.patch("/plans/:id/actions/:applianceId", async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireUser(req);
      const { status } = planActionSchema.parse(req.body);
      const plan = await deps.store.setPlanAction(userId, z.string().uuid().parse(req.params.id), idSchema.parse(req.params.applianceId), status);
      if (!plan) throw new ApiError(404, "Plano ou ação não encontrados");
      res.json({ plan });
    } catch (error) { next(error); }
  });
  router.delete("/plans/:id", async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!(await deps.store.deletePlan(requireUser(req), z.string().uuid().parse(req.params.id)))) throw new ApiError(404, "Plano não encontrado");
      res.json({ ok: true });
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
      await requireAdmin(requireUser(req));
      const days = z.coerce.number().int().min(1).max(90).default(30).parse(req.query.days);
      const { config, provider } = await effective();
      res.json({
        usage: await deps.store.usageSummary(new Date(Date.now() - days * 86400000)),
        config: { generative: Boolean(provider), modelFast: config.modelFast, modelReasoning: config.modelReasoning, dailyUserBudget: config.dailyUserBudget, monthlyGlobalBudget: config.monthlyGlobalBudget, maxConcurrent: config.maxConcurrent, smartThingsCommands: false },
      });
    } catch (error) { next(error); }
  });

  return router;
};
