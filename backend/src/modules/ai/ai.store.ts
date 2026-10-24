// Persistence for the assistant: explicit preferences, recommendation states,
// conversations (opt-in retention), alerts, runtime settings and usage
// metrics. Every per-user query is scoped by userId.
import { randomUUID } from "crypto";
import type { Collection, Document } from "mongodb";
import type { AIPreferences, UsageRecord } from "./ai.orchestrator";
import type { AlertV2 } from "./ai.alerts";
import type { SavingsPlan, ActionStatus } from "./ai.plans";

export type RecommendationState = "new" | "viewed" | "saved" | "tracking" | "applied" | "dismissed";
export interface RecommendationStateRecord {
  userId: string;
  recommendationId: string;
  state: RecommendationState;
  propertyId?: string | null;
  expectedMonthlyKWh?: number | null;
  appliedAt?: Date | null;
  feedback?: "useful" | "not_useful" | null;
  updatedAt: Date;
}

export interface ConversationMessage { role: "user" | "assistant"; content: string; response?: unknown; at: Date }
export interface ConversationRecord {
  id: string;
  userId: string;
  title: string;
  propertyId?: string | null;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export type AlertState = "new" | "read" | "dismissed";
export interface AlertRecord extends AlertV2 {
  userId: string;
  createdAt: Date;
  state?: AlertState;
  readAt?: Date | null;
  deliveredAt?: Date | null;
  channel?: string | null;
}

export interface SavedPlan extends Omit<SavingsPlan, "actions"> {
  id: string;
  userId: string;
  actions: Array<SavingsPlan["actions"][number] & { status: ActionStatus; updatedAt?: Date }>;
  createdAt: Date;
  updatedAt: Date;
}

// Settings an admin can change at runtime. Secrets never live here.
export interface AISettings {
  enabled?: boolean;
  modelFast?: string;
  modelReasoning?: string;
  dailyUserBudget?: number;
  monthlyGlobalBudget?: number;
  experimental?: { chartExplain?: boolean; alerts?: boolean; streaming?: boolean };
  updatedAt?: Date;
  updatedBy?: string;
}

export interface AIStore {
  getPreferences(userId: string): Promise<AIPreferences>;
  savePreferences(userId: string, patch: AIPreferences): Promise<AIPreferences>;
  listRecommendationStates(userId: string): Promise<RecommendationStateRecord[]>;
  setRecommendationState(userId: string, record: Omit<RecommendationStateRecord, "userId" | "updatedAt">): Promise<void>;
  recordUsage(userId: string, usage: UsageRecord & { feature: string }): Promise<void>;
  usageSummary(since: Date): Promise<Record<string, unknown>>;
  appendConversation(userId: string, conversationId: string | null, retentionDays: number, propertyId: string | null, messages: Omit<ConversationMessage, "at">[]): Promise<string>;
  listConversations(userId: string): Promise<Array<Pick<ConversationRecord, "id" | "title" | "updatedAt" | "propertyId">>>;
  getConversation(userId: string, id: string): Promise<ConversationRecord | null>;
  deleteConversation(userId: string, id: string): Promise<boolean>;
  saveAlerts(userId: string, alerts: AlertV2[], minIntervalMs: number): Promise<AlertRecord[]>;
  listAlerts(userId: string): Promise<AlertRecord[]>;
  setAlertState(userId: string, key: string, state: AlertState): Promise<boolean>;
  markDelivered(userId: string, key: string, channel: string): Promise<void>;
  listAlertRecipients(after: string | null, limit: number): Promise<Array<{ userId: string; preferences: AIPreferences }>>;
  dismissedRecommendations(userId: string): Promise<string[]>;
  setRecommendationFeedback(userId: string, recommendationId: string, feedback: "useful" | "not_useful"): Promise<void>;
  savePlan(userId: string, plan: SavingsPlan): Promise<SavedPlan>;
  listPlans(userId: string): Promise<SavedPlan[]>;
  getPlan(userId: string, id: string): Promise<SavedPlan | null>;
  setPlanAction(userId: string, id: string, applianceId: string, status: ActionStatus): Promise<SavedPlan | null>;
  deletePlan(userId: string, id: string): Promise<boolean>;
  costSince(since: Date): Promise<number>;
  getSettings(): Promise<AISettings>;
  saveSettings(patch: AISettings, updatedBy: string): Promise<AISettings>;
  deleteUserData(userId: string): Promise<void>;
}

export interface CollectionProvider {
  aiCollection<T extends Document>(name: `ai_${string}`): Collection<T>;
}

const USAGE_RETENTION_DAYS = Number(process.env.AI_USAGE_RETENTION_DAYS || 90);
const MAX_CONVERSATION_MESSAGES = 40;
const MAX_CONVERSATIONS = 30;
const DAY = 86400000;

export class MongoAIStore implements AIStore {
  private indexes: Promise<unknown> | null = null;
  private settingsCache: { value: AISettings; at: number } | null = null;
  constructor(private db: CollectionProvider) {}

  private prefs() { return this.db.aiCollection<AIPreferences & { userId: string; updatedAt: Date }>("ai_user_preferences"); }
  private states() { return this.db.aiCollection<RecommendationStateRecord>("ai_recommendation_states"); }
  private usage() { return this.db.aiCollection<Document>("ai_usage_metrics"); }
  private conversations() { return this.db.aiCollection<ConversationRecord>("ai_conversations"); }
  private alerts() { return this.db.aiCollection<AlertRecord>("ai_alerts"); }
  private settings() { return this.db.aiCollection<AISettings & { key: string }>("ai_settings"); }
  private plans() { return this.db.aiCollection<SavedPlan>("ai_savings_plans"); }
  private costCache: { since: number; value: number; at: number } | null = null;

  // Idempotent index creation, once per process.
  ready() {
    this.indexes ??= Promise.all([
      this.prefs().createIndex({ userId: 1 }, { unique: true }),
      this.states().createIndex({ userId: 1, recommendationId: 1 }, { unique: true }),
      this.usage().createIndex({ createdAt: 1 }, { expireAfterSeconds: USAGE_RETENTION_DAYS * 86400 }),
      this.usage().createIndex({ userId: 1, createdAt: -1 }),
      this.conversations().createIndex({ id: 1 }, { unique: true }),
      this.conversations().createIndex({ userId: 1, updatedAt: -1 }),
      this.conversations().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.alerts().createIndex({ userId: 1, key: 1 }, { unique: true }),
      this.alerts().createIndex({ userId: 1, kind: 1, createdAt: -1 }),
      this.alerts().createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 }),
      this.settings().createIndex({ key: 1 }, { unique: true }),
      this.plans().createIndex({ id: 1 }, { unique: true }),
      this.plans().createIndex({ userId: 1, createdAt: -1 }),
      this.prefs().createIndex({ proactiveInsights: 1, userId: 1 }),
    ]).catch((error) => { this.indexes = null; throw error; });
    return this.indexes;
  }

  async getPreferences(userId: string): Promise<AIPreferences> {
    await this.ready();
    const row = await this.prefs().findOne({ userId }, { projection: { _id: 0, userId: 0, updatedAt: 0 } });
    return (row as AIPreferences | null) ?? {};
  }
  async savePreferences(userId: string, patch: AIPreferences) {
    await this.ready();
    const set: Record<string, unknown> = { updatedAt: new Date() };
    const unset: Record<string, ""> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) unset[key] = "";
      else if (value !== undefined) set[key] = value;
    }
    await this.prefs().updateOne({ userId }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $setOnInsert: { userId } }, { upsert: true });
    return this.getPreferences(userId);
  }
  async listRecommendationStates(userId: string) {
    await this.ready();
    return this.states().find({ userId }, { projection: { _id: 0 } }).limit(500).toArray() as Promise<RecommendationStateRecord[]>;
  }
  async setRecommendationState(userId: string, record: Omit<RecommendationStateRecord, "userId" | "updatedAt">) {
    await this.ready();
    await this.states().updateOne(
      { userId, recommendationId: record.recommendationId },
      { $set: { ...record, userId, updatedAt: new Date() } },
      { upsert: true },
    );
  }
  async recordUsage(userId: string, usage: UsageRecord & { feature: string }) {
    await this.ready();
    await this.usage().insertOne({ ...usage, userId, createdAt: new Date() });
  }
  async usageSummary(since: Date) {
    await this.ready();
    const match = { $match: { createdAt: { $gte: since } } };
    const [totals] = await this.usage().aggregate([
      match,
      { $group: {
        _id: null, requests: { $sum: 1 }, users: { $addToSet: "$userId" },
        inputTokens: { $sum: "$inputTokens" }, outputTokens: { $sum: "$outputTokens" },
        estimatedCostUsd: { $sum: "$estimatedCostUsd" }, avgLatencyMs: { $avg: "$latencyMs" },
        latencies: { $push: "$latencyMs" },
        llm: { $sum: { $cond: [{ $eq: ["$generated", "llm"] }, 1, 0] } },
        errors: { $sum: { $cond: [{ $ifNull: ["$error", false] }, 1, 0] } },
        limited: { $sum: { $cond: [{ $eq: ["$limited", true] }, 1, 0] } },
        guardRejected: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$guardViolations", []] } }, 0] }, 1, 0] } },
      } },
      { $project: {
        _id: 0, requests: 1, activeUsers: { $size: "$users" }, inputTokens: 1, outputTokens: 1, estimatedCostUsd: 1,
        avgLatencyMs: 1, llm: 1, errors: 1, limited: 1, guardRejected: 1,
        p95LatencyMs: { $arrayElemAt: [{ $sortArray: { input: "$latencies", sortBy: 1 } }, { $floor: { $multiply: [0.95, { $size: "$latencies" }] } }] },
      } },
    ]).toArray();
    const [byFeature, byModel] = await Promise.all([
      this.usage().aggregate([match, { $group: { _id: { feature: "$feature", intent: "$intent" }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 30 }]).toArray(),
      this.usage().aggregate([match, { $match: { model: { $ne: null } } }, { $group: { _id: "$model", count: { $sum: 1 }, costUsd: { $sum: "$estimatedCostUsd" } } }, { $sort: { count: -1 } }]).toArray(),
    ]);
    const applied = await this.states().countDocuments({ state: "applied", updatedAt: { $gte: since } });
    return { since: since.toISOString(), requests: 0, ...(totals ?? {}), byFeature, byModel, recommendationsApplied: applied };
  }

  async appendConversation(userId: string, conversationId: string | null, retentionDays: number, propertyId: string | null, messages: Omit<ConversationMessage, "at">[]) {
    await this.ready();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + retentionDays * DAY);
    const stamped = messages.map((item) => ({ ...item, at: now }));
    if (conversationId) {
      const updated = await this.conversations().updateOne(
        { id: conversationId, userId },
        { $push: { messages: { $each: stamped, $slice: -MAX_CONVERSATION_MESSAGES } }, $set: { updatedAt: now, expiresAt } },
      );
      if (updated.matchedCount) return conversationId;
    }
    const id = randomUUID();
    const first = messages.find((item) => item.role === "user")?.content ?? "Conversa";
    await this.conversations().insertOne({ id, userId, title: first.slice(0, 80), propertyId, messages: stamped, createdAt: now, updatedAt: now, expiresAt });
    // Keep only the most recent conversations per user.
    const old = await this.conversations().find({ userId }, { projection: { _id: 0, id: 1 } }).sort({ updatedAt: -1 }).skip(MAX_CONVERSATIONS).toArray();
    if (old.length) await this.conversations().deleteMany({ userId, id: { $in: old.map((item) => item.id) } });
    return id;
  }
  async listConversations(userId: string) {
    await this.ready();
    return this.conversations().find({ userId }, { projection: { _id: 0, id: 1, title: 1, updatedAt: 1, propertyId: 1 } })
      .sort({ updatedAt: -1 }).limit(MAX_CONVERSATIONS).toArray() as Promise<Array<Pick<ConversationRecord, "id" | "title" | "updatedAt" | "propertyId">>>;
  }
  async getConversation(userId: string, id: string) {
    await this.ready();
    return this.conversations().findOne({ id, userId }, { projection: { _id: 0 } }) as Promise<ConversationRecord | null>;
  }
  async deleteConversation(userId: string, id: string) {
    await this.ready();
    return (await this.conversations().deleteOne({ id, userId })).deletedCount > 0;
  }

  // Inserts new alerts only: the same key never repeats, and the same kind
  // waits at least minIntervalMs since the last one.
  async saveAlerts(userId: string, alerts: AlertV2[], minIntervalMs: number) {
    await this.ready();
    const created: AlertRecord[] = [];
    for (const alert of alerts) {
      const recent = await this.alerts().findOne({ userId, kind: alert.kind, createdAt: { $gte: new Date(Date.now() - minIntervalMs) } });
      if (recent) continue;
      const record: AlertRecord = { ...alert, userId, createdAt: new Date(), state: "new", readAt: null, deliveredAt: null, channel: null };
      try {
        await this.alerts().insertOne(record);
        created.push(record);
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    return created;
  }
  async listAlerts(userId: string) {
    await this.ready();
    return this.alerts().find({ userId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(50).toArray() as Promise<AlertRecord[]>;
  }

  async setAlertState(userId: string, key: string, state: AlertState) {
    await this.ready();
    const result = await this.alerts().updateOne({ userId, key }, { $set: { state, ...(state !== "new" ? { readAt: new Date() } : {}) } });
    return result.matchedCount > 0;
  }
  async markDelivered(userId: string, key: string, channel: string) {
    await this.ready();
    await this.alerts().updateOne({ userId, key }, { $set: { deliveredAt: new Date(), channel } });
  }
  // Users who consented, in userId order, for the scheduler.
  async listAlertRecipients(after: string | null, limit: number) {
    await this.ready();
    const rows = await this.prefs().find({ proactiveInsights: true, ...(after ? { userId: { $gt: after } } : {}) }, { projection: { _id: 0, updatedAt: 0 } })
      .sort({ userId: 1 }).limit(Math.min(500, limit)).toArray();
    return rows.map(({ userId, ...preferences }) => ({ userId, preferences: preferences as AIPreferences }));
  }
  async dismissedRecommendations(userId: string) {
    await this.ready();
    const rows = await this.states().find({ userId, state: { $in: ["dismissed", "applied"] } }, { projection: { _id: 0, recommendationId: 1 } }).limit(500).toArray();
    return rows.map((row) => row.recommendationId);
  }
  async setRecommendationFeedback(userId: string, recommendationId: string, feedback: "useful" | "not_useful") {
    await this.ready();
    await this.states().updateOne(
      { userId, recommendationId },
      { $set: { feedback, updatedAt: new Date() }, $setOnInsert: { userId, recommendationId, state: "viewed" } },
      { upsert: true },
    );
  }

  async savePlan(userId: string, plan: SavingsPlan) {
    await this.ready();
    const now = new Date();
    const saved: SavedPlan = { ...plan, id: randomUUID(), userId, actions: plan.actions.map((action) => ({ ...action, status: "pending" as const })), createdAt: now, updatedAt: now };
    await this.plans().insertOne(saved);
    const old = await this.plans().find({ userId }, { projection: { _id: 0, id: 1 } }).sort({ createdAt: -1 }).skip(20).toArray();
    if (old.length) await this.plans().deleteMany({ userId, id: { $in: old.map((item) => item.id) } });
    const { _id, ...clean } = saved as SavedPlan & { _id?: unknown };
    return clean as SavedPlan;
  }
  async listPlans(userId: string) {
    await this.ready();
    return this.plans().find({ userId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(20).toArray() as Promise<SavedPlan[]>;
  }
  async getPlan(userId: string, id: string) {
    await this.ready();
    return this.plans().findOne({ userId, id }, { projection: { _id: 0 } }) as Promise<SavedPlan | null>;
  }
  async setPlanAction(userId: string, id: string, applianceId: string, status: ActionStatus) {
    await this.ready();
    const now = new Date();
    const result = await this.plans().updateOne(
      { userId, id, "actions.applianceId": applianceId },
      { $set: { "actions.$.status": status, "actions.$.updatedAt": now, updatedAt: now } },
    );
    return result.matchedCount ? this.getPlan(userId, id) : null;
  }
  async deletePlan(userId: string, id: string) {
    await this.ready();
    return (await this.plans().deleteOne({ userId, id })).deletedCount > 0;
  }
  // Estimated model spend since a date, cached for a minute.
  async costSince(since: Date) {
    if (this.costCache && this.costCache.since === since.getTime() && Date.now() - this.costCache.at < 60000) return this.costCache.value;
    await this.ready();
    const [row] = await this.usage().aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: null, cost: { $sum: "$estimatedCostUsd" } } }]).toArray();
    const value = Number(row?.cost ?? 0);
    this.costCache = { since: since.getTime(), value, at: Date.now() };
    return value;
  }

  async getSettings() {
    if (this.settingsCache && Date.now() - this.settingsCache.at < 30000) return this.settingsCache.value;
    await this.ready();
    const row = await this.settings().findOne({ key: "global" }, { projection: { _id: 0, key: 0 } });
    const value = (row as AISettings | null) ?? {};
    this.settingsCache = { value, at: Date.now() };
    return value;
  }
  async saveSettings(patch: AISettings, updatedBy: string) {
    await this.ready();
    const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy };
    for (const [key, value] of Object.entries(patch)) if (value !== undefined) set[key] = value;
    await this.settings().updateOne({ key: "global" }, { $set: set, $setOnInsert: { key: "global" } }, { upsert: true });
    this.settingsCache = null;
    return this.getSettings();
  }

  async deleteUserData(userId: string) {
    await this.ready();
    await Promise.all([
      this.prefs().deleteOne({ userId }),
      this.states().deleteMany({ userId }),
      this.usage().deleteMany({ userId }),
      this.conversations().deleteMany({ userId }),
      this.alerts().deleteMany({ userId }),
      this.plans().deleteMany({ userId }),
    ]);
  }
}
