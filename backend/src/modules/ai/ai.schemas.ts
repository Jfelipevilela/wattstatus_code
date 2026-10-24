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

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(600),
  context: chatContextSchema.optional(),
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

export const preferencesSchema = z.object({
  monthlyGoal: z.number().positive().max(100000).nullable().optional(),
  primaryPropertyId: id.nullable().optional(),
  essentialApplianceIds: z.array(id).max(100).optional(),
  proactiveInsights: z.boolean().optional(),
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
]);

export const responseSchema = z.object({
  message: z.string().max(4000),
  intent: z.string(),
  context: chatContextSchema,
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
