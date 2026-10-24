import { z } from "zod";

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const source = z.enum(["measured", "measured_partial", "estimated", "projected", "simulated", "unavailable"]);

// Conversation state the client echoes back. Every id in it is re-checked
// against the signed-in user's data before use.
export const chatContextSchema = z.object({
  propertyId: id.optional(),
  roomId: id.optional(),
  applianceId: id.optional(),
  lastIntent: z.string().max(40).optional(),
  lastProposedHours: z.number().min(0).max(24).optional(),
  lastReductionHours: z.number().min(0).max(24).optional(),
}).strict();

// "Explicar este gráfico": the client names the chart and its filters only;
// the backend recomputes the series itself.
export const chartRequestSchema = z.object({
  kind: z.enum(["consumption_trend"]),
  propertyId: id.optional(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
}).strict();

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(600),
  context: chatContextSchema.optional(),
  conversationId: z.string().uuid().optional(),
  chart: chartRequestSchema.optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(1200),
  })).max(8).optional(),
}).strict();

export const simulateRequestSchema = z.object({
  propertyId: id,
  applianceId: id,
  proposedHours: z.number().min(0).max(24),
  daysPerMonth: z.number().int().min(1).max(31).optional(),
  rate: z.number().positive().max(10).optional(),
}).strict();

export const budgetRequestSchema = z.object({
  propertyId: id,
  target: z.number().positive().max(100000),
  protectedApplianceIds: z.array(id).max(50).optional(),
}).strict();

export const recommendationStateSchema = z.object({
  state: z.enum(["new", "viewed", "saved", "tracking", "applied", "dismissed"]),
}).strict();

export const RECOMMENDATION_KINDS = [
  "reduce_usage", "review_power", "enable_measurement", "check_device", "investigate_increase",
  "set_goal", "review_continuous", "consider_replacement",
] as const;
export const ALERT_KINDS = ["consumption_increase", "goal_risk", "forecast", "missing_reading", "persistent_anomaly"] as const;

// Only what the user sets explicitly. Nothing the model infers is saved here.
export const preferencesSchema = z.object({
  monthlyGoal: z.number().positive().max(100000).nullable().optional(),
  monthlyKWhGoal: z.number().positive().max(100000).nullable().optional(),
  primaryPropertyId: id.nullable().optional(),
  essentialApplianceIds: z.array(id).max(100).optional(),
  maxReductionPercent: z.number().int().min(10).max(50).optional(),
  minHoursByAppliance: z.record(id, z.number().min(0).max(24)).refine((value) => Object.keys(value).length <= 100).optional(),
  comfortNotes: z.string().trim().max(300).optional(),
  recommendationCategories: z.array(z.enum(RECOMMENDATION_KINDS)).max(RECOMMENDATION_KINDS.length).optional(),
  proactiveInsights: z.boolean().optional(),
  alertFrequency: z.enum(["off", "daily", "weekly"]).optional(),
  alertCategories: z.array(z.enum(ALERT_KINDS)).max(ALERT_KINDS.length).optional(),
  conversationRetentionDays: z.union([z.literal(0), z.literal(7), z.literal(30), z.literal(90)]).optional(),
}).strict();

// Models an admin may pick. Ids from the provider's current model list.
export const ALLOWED_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;
export const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  modelFast: z.enum(ALLOWED_MODELS).optional(),
  modelReasoning: z.enum(ALLOWED_MODELS).optional(),
  dailyUserBudget: z.number().int().min(0).max(1000).optional(),
  monthlyGlobalBudget: z.number().int().min(0).max(1000000).optional(),
  experimental: z.object({ chartExplain: z.boolean().optional(), alerts: z.boolean().optional(), streaming: z.boolean().optional() }).strict().optional(),
}).strict();

// Actions are discriminated and validated: the frontend only ever performs
// one of these, with these exact fields.
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open_property"), label: z.string().max(80), propertyId: id, roomId: id.optional(), applianceId: id.optional() }),
  z.object({ type: z.literal("open_simulator"), label: z.string().max(80), propertyId: id, applianceId: id, proposedHours: z.number().min(0).max(24).optional() }),
  z.object({ type: z.literal("open_page"), label: z.string().max(80), path: z.enum(["/dashboard", "/aparelhos", "/relatorios", "/anomalias", "/imoveis", "/integracoes/smartthings"]) }),
  z.object({ type: z.literal("ask"), label: z.string().max(80), message: z.string().max(200) }),
]);

export const metricSchema = z.object({
  label: z.string().max(80),
  value: z.number().finite(),
  unit: z.enum(["kWh", "R$", "%", "h", "W", "dias"]),
  source,
  coverage: z.number().min(0).max(1).optional(),
});

export const cardSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ranking"),
    title: z.string(),
    source,
    items: z.array(z.object({
      id: z.string(), label: z.string(), sublabel: z.string().nullable(), kWh: z.number(), cost: z.number(), share: z.number(),
      kind: z.enum(["appliance", "room", "property"]),
    })),
  }),
  z.object({ type: z.literal("simulation"), simulation: z.record(z.unknown()) }),
  z.object({ type: z.literal("budget"), plan: z.record(z.unknown()) }),
  z.object({ type: z.literal("forecast"), forecast: z.record(z.unknown()) }),
  z.object({ type: z.literal("recommendations"), items: z.array(z.record(z.unknown())) }),
  z.object({ type: z.literal("anomalies"), items: z.array(z.record(z.unknown())) }),
  z.object({ type: z.literal("choices"), title: z.string(), items: z.array(z.object({ id: z.string(), label: z.string(), sublabel: z.string().nullable() })) }),
  z.object({ type: z.literal("trend"), title: z.string(), points: z.array(z.object({ month: z.string(), estimatedKWh: z.number(), estimatedCost: z.number(), measuredKWh: z.number().nullable() })) }),
  z.object({ type: z.literal("comparison"), title: z.string(), source, items: z.array(z.object({ label: z.string(), value: z.number(), unit: z.enum(["kWh", "R$", "%"]) })) }),
]);

export const responseSchema = z.object({
  message: z.string().max(4000),
  intent: z.string(),
  context: chatContextSchema,
  conversationId: z.string().uuid().nullable().optional(),
  metrics: z.array(metricSchema),
  cards: z.array(cardSchema),
  limitations: z.array(z.string()),
  suggestions: z.array(z.string().max(120)).max(6),
  actions: z.array(actionSchema).max(6),
  meta: z.object({
    engine: z.string(),
    generated: z.enum(["deterministic", "llm"]),
    model: z.string().nullable(),
    latencyMs: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    estimatedCostUsd: z.number(),
  }),
});

export type ChatContext = z.infer<typeof chatContextSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type WattAIAction = z.infer<typeof actionSchema>;
export type WattAIMetric = z.infer<typeof metricSchema>;
export type WattAICard = z.infer<typeof cardSchema>;
export type WattAIResponse = z.infer<typeof responseSchema>;
