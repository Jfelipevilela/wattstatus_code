// Persistence for the assistant: explicit preferences, recommendation states
// and usage metrics. No conversation content is stored server-side.
import type { Collection, Document } from "mongodb";
import type { AIPreferences, UsageRecord } from "./ai.orchestrator";

export type RecommendationState = "new" | "viewed" | "saved" | "tracking" | "applied" | "dismissed";
export interface RecommendationStateRecord {
  userId: string;
  recommendationId: string;
  state: RecommendationState;
  propertyId?: string | null;
  expectedMonthlyKWh?: number | null;
  appliedAt?: Date | null;
  updatedAt: Date;
}

export interface AIStore {
  getPreferences(userId: string): Promise<AIPreferences>;
  savePreferences(userId: string, patch: AIPreferences): Promise<AIPreferences>;
  listRecommendationStates(userId: string): Promise<RecommendationStateRecord[]>;
  setRecommendationState(userId: string, record: Omit<RecommendationStateRecord, "userId" | "updatedAt">): Promise<void>;
  recordUsage(userId: string, usage: UsageRecord & { feature: string }): Promise<void>;
  usageSummary(since: Date): Promise<Record<string, unknown>>;
  deleteUserData(userId: string): Promise<void>;
}

export interface CollectionProvider {
  aiCollection<T extends Document>(name: `ai_${string}`): Collection<T>;
}

const USAGE_RETENTION_DAYS = Number(process.env.AI_USAGE_RETENTION_DAYS || 90);

export class MongoAIStore implements AIStore {
  private indexes: Promise<unknown> | null = null;
  constructor(private db: CollectionProvider) {}

  private prefs() { return this.db.aiCollection<AIPreferences & { userId: string; updatedAt: Date }>("ai_user_preferences"); }
  private states() { return this.db.aiCollection<RecommendationStateRecord>("ai_recommendation_states"); }
  private usage() { return this.db.aiCollection<Document>("ai_usage_metrics"); }

  // Idempotent index creation, once per process.
  private ready() {
    this.indexes ??= Promise.all([
      this.prefs().createIndex({ userId: 1 }, { unique: true }),
      this.states().createIndex({ userId: 1, recommendationId: 1 }, { unique: true }),
      this.usage().createIndex({ createdAt: 1 }, { expireAfterSeconds: USAGE_RETENTION_DAYS * 86400 }),
      this.usage().createIndex({ userId: 1, createdAt: -1 }),
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
    for (const [key, value] of Object.entries(patch)) if (value !== undefined) set[key] = value;
    await this.prefs().updateOne({ userId }, { $set: set, $setOnInsert: { userId } }, { upsert: true });
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
    const [totals] = await this.usage().aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: null, requests: { $sum: 1 }, users: { $addToSet: "$userId" },
        inputTokens: { $sum: "$inputTokens" }, outputTokens: { $sum: "$outputTokens" },
        estimatedCostUsd: { $sum: "$estimatedCostUsd" }, avgLatencyMs: { $avg: "$latencyMs" },
        llm: { $sum: { $cond: [{ $eq: ["$generated", "llm"] }, 1, 0] } },
        errors: { $sum: { $cond: [{ $ifNull: ["$error", false] }, 1, 0] } },
      } },
      { $project: { _id: 0, requests: 1, activeUsers: { $size: "$users" }, inputTokens: 1, outputTokens: 1, estimatedCostUsd: 1, avgLatencyMs: 1, llm: 1, errors: 1 } },
    ]).toArray();
    const byIntent = await this.usage().aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { feature: "$feature", intent: "$intent" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 30 },
    ]).toArray();
    const applied = await this.states().countDocuments({ state: "applied", updatedAt: { $gte: since } });
    return { since: since.toISOString(), ...(totals ?? { requests: 0 }), byIntent, recommendationsApplied: applied };
  }
  async deleteUserData(userId: string) {
    await this.ready();
    await Promise.all([
      this.prefs().deleteOne({ userId }),
      this.states().deleteMany({ userId }),
      this.usage().deleteMany({ userId }),
    ]);
  }
}
