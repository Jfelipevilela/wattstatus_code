import { MongoClient, Collection, Db } from "mongodb";
import crypto from "crypto";
import {
  ApplianceRecord,
  IntegrationUsageHistory,
  UserRecord,
  UserSettingsRecord,
  AuthSession,
} from "../types";
import { env } from "../config/env";
import { getErrorFields, logger } from "../logging/logger";
import { normalizeEmail } from "../modules/auth/auth-security";
import { ApiError } from "../middleware/error-handler";

type IntegrationTokenDoc = { userId: string; provider: string; token: string };
type IntegrationUsageDoc = {
  userId: string;
  provider: string;
  deviceId: string;
  accumulatedMs: number;
  lastOn?: string | null;
  day: string;
  updatedAt: Date;
};
type SettingsDoc = {
  userId: string;
  theme?: string;
  apps?: string[];
  historicalData?: Array<{ month: string; consumption: number; cost: number }>;
  createdAt: Date;
  updatedAt: Date;
};

export class MongoDatabase {
  private client: MongoClient;
  private db!: Db;
  private encKey: Buffer;

  constructor(uri?: string, private dbName: string = env.mongoDbName) {
    this.client = new MongoClient(uri || env.mongoUrl, {
      maxPoolSize: 10, minPoolSize: 0, maxConnecting: 2, maxIdleTimeMS: 60000,
      waitQueueTimeoutMS: 5000, serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000, socketTimeoutMS: 10000,
    });
    this.encKey = crypto
      .createHash("sha256")
      .update(env.smartThingsTokenSecret || "wattstatus-dev-secret")
      .digest();
  }

  private async operation<T>(
    type: "query" | "persistence",
    operation: string,
    action: () => Promise<T>
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await action();
      logger.debug(`mongodb.${type}_succeeded`, {
        operation,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      logger.error(`mongodb.${type}_failed`, {
        operation,
        durationMs: Date.now() - startedAt,
        ...getErrorFields(error),
      });
      throw error;
    }
  }

  async init() {
    const startedAt = Date.now();
    logger.info("mongodb.connection_started", { database: this.dbName });
    try {
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      await this.db.collection("users").createIndex({ email: 1 }, { unique: true });
      // Legacy records stay untouched; new records enforce canonical uniqueness atomically.
      await this.db.collection("users").createIndex({ emailCanonical: 1 }, {
        unique: true, partialFilterExpression: { emailCanonical: { $type: "string" } },
      });
      await this.db.collection("users").createIndex({ email: 1 }, {
        name: "users_email_lookup", collation: { locale: "en", strength: 2 },
      });
      await this.db.collection("users").createIndex({ id: 1 }, { unique: true });
      await this.db.collection("auth_sessions").createIndex({ id: 1 }, { unique: true });
      await this.db.collection("auth_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await this.db.collection("auth_limits").createIndex({ key: 1 }, { unique: true });
      await this.db.collection("auth_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await this.db.collection("appliances").createIndex({ userId: 1 });
      await this.db.collection("integration_tokens").createIndex({ userId: 1, provider: 1 }, { unique: true });
      await this.db.collection("integration_usage").createIndex(
        { userId: 1, provider: 1, deviceId: 1 },
        { unique: true }
      );
      await this.db.collection("integration_usage_history").createIndex(
        { userId: 1, provider: 1, deviceId: 1, day: 1 },
        { unique: true }
      );
      await this.db.collection("user_settings").createIndex({ userId: 1 }, { unique: true });
      logger.info("mongodb.connection_succeeded", {
        database: this.dbName,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      logger.error("mongodb.connection_failed", {
        database: this.dbName,
        durationMs: Date.now() - startedAt,
        ...getErrorFields(error),
      });
      await this.client.close().catch(() => undefined);
      throw error;
    }
  }

  private users(): Collection<UserRecord> {
    return this.db.collection<UserRecord>("users");
  }
  private appliances(): Collection<ApplianceRecord> {
    return this.db.collection<ApplianceRecord>("appliances");
  }
  private tokens(): Collection<IntegrationTokenDoc> {
    return this.db.collection<IntegrationTokenDoc>("integration_tokens");
  }
  private usage(): Collection<IntegrationUsageDoc> {
    return this.db.collection<IntegrationUsageDoc>("integration_usage");
  }
  private usageHistory(): Collection<IntegrationUsageDoc> {
    return this.db.collection<IntegrationUsageDoc>("integration_usage_history");
  }
  private settings(): Collection<SettingsDoc> {
    return this.db.collection<SettingsDoc>("user_settings");
  }

  async getUserByEmail(email: string) {
    return this.operation("query", "users.getByEmail", async () => {
      const users = await this.users().find({ email: normalizeEmail(email) }, {
        collation: { locale: "en", strength: 2 },
      }).limit(2).maxTimeMS(3000).toArray();
      if (users.length > 1) {
        logger.error("auth.ambiguous_identity", { reason: "duplicate_identity" });
        throw new ApiError(401, "Não foi possível validar as credenciais.");
      }
      return users[0] || null;
    });
  }

  async getUserById(id: string) {
    return this.operation("query", "users.getById", () => this.users().findOne({ id }));
  }

  async addUser(user: UserRecord) {
    await this.operation("persistence", "users.insert", () => this.users().insertOne(user));
    return user;
  }

  async updatePasswordHash(id: string, previousHash: string, passwordHash: string) {
    await this.operation("persistence", "users.upgradePassword", () =>
      this.users().updateOne({ id, passwordHash: previousHash }, { $set: { passwordHash } })
    );
  }

  async addSession(session: AuthSession) {
    await this.operation("persistence", "sessions.insert", () =>
      this.db.collection<AuthSession>("auth_sessions").insertOne(session)
    );
  }

  async getSession(id: string) {
    return this.operation("query", "sessions.get", () =>
      this.db.collection<AuthSession>("auth_sessions").findOne({ id, expiresAt: { $gt: new Date() } })
    );
  }

  async deleteSession(id: string) {
    await this.operation("persistence", "sessions.delete", () =>
      this.db.collection<AuthSession>("auth_sessions").deleteOne({ id })
    );
  }

  async consumeRateLimit(scope: string, identity: string, windowMs: number) {
    const start = Math.floor(Date.now() / windowMs) * windowMs;
    const key = `${scope}:${start}:${identity}`;
    const expiresAt = new Date(start + windowMs);
    const collection = this.db.collection<{ key: string; hits: number; expiresAt: Date }>("auth_limits");
    let row;
    try {
      row = await collection.findOneAndUpdate({ key }, {
        $inc: { hits: 1 }, $setOnInsert: { expiresAt },
      }, { upsert: true, returnDocument: "after", maxTimeMS: 3000 });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      row = await collection.findOneAndUpdate({ key }, { $inc: { hits: 1 } }, {
        returnDocument: "after", maxTimeMS: 3000,
      });
    }
    if (!row) throw new Error("Rate limit persistence failed");
    return { totalHits: row.hits, resetTime: expiresAt };
  }

  async listAppliances(userId: string) {
    return this.operation("query", "appliances.list", () =>
      this.appliances().find({ userId }).sort({ createdAt: -1 }).toArray()
    );
  }

  async addAppliance(record: ApplianceRecord) {
    await this.operation("persistence", "appliances.insert", () => this.appliances().insertOne(record));
    return record;
  }

  async updateAppliance(userId: string, record: ApplianceRecord) {
    const res = await this.operation("persistence", "appliances.update", () => this.appliances().findOneAndUpdate(
      { id: record.id, userId },
      { $set: record },
      { returnDocument: "after" }
    ));
    return res;
  }

  async deleteAppliance(userId: string, applianceId: string) {
    const res = await this.operation("persistence", "appliances.delete", () =>
      this.appliances().deleteOne({ id: applianceId, userId })
    );
    return res.deletedCount > 0;
  }

  async saveIntegrationToken(userId: string, provider: string, token: string) {
    const encrypted = this.encrypt(token);
    await this.operation("persistence", "integrationTokens.upsert", () => this.tokens().updateOne(
      { userId, provider },
      { $set: { token: encrypted } },
      { upsert: true }
    ));
  }

  async deleteIntegrationToken(userId: string, provider: string) {
    await this.operation("persistence", "integrationTokens.delete", () =>
      this.tokens().deleteOne({ userId, provider })
    );
  }

  async getIntegrationToken(userId: string, provider: string) {
    const row = await this.operation("query", "integrationTokens.get", () =>
      this.tokens().findOne({ userId, provider })
    );
    if (!row?.token) return null;
    try {
      return this.decrypt(row.token);
    } catch {
      return null;
    }
  }

  async getIntegrationUsage(userId: string, provider: string) {
    const rows = await this.operation("query", "integrationUsage.list", () =>
      this.usage()
        .find({ userId, provider })
        .project<IntegrationUsageHistory>({
          userId: 1,
          provider: 1,
          deviceId: 1,
          accumulatedMs: 1,
          lastOn: 1,
          day: 1,
          updatedAt: 1,
          _id: 0,
        })
        .toArray()
    );
    return rows;
  }

  async saveIntegrationUsage(
    userId: string,
    provider: string,
    usages: Array<{ deviceId: string; accumulatedMs: number; lastOn?: string | null; day: string }>
  ) {
    const bulkCurrent = this.usage().initializeUnorderedBulkOp();
    const bulkHistory = this.usageHistory().initializeUnorderedBulkOp();

    usages.forEach((usage) => {
      bulkCurrent
        .find({ userId, provider, deviceId: usage.deviceId })
        .upsert()
        .update({
          $set: {
            accumulatedMs: usage.accumulatedMs,
            lastOn: usage.lastOn ?? null,
            day: usage.day,
            updatedAt: new Date(),
          },
        });

      bulkHistory
        .find({ userId, provider, deviceId: usage.deviceId, day: usage.day })
        .upsert()
        .update({
          $set: {
            accumulatedMs: usage.accumulatedMs,
            lastOn: usage.lastOn ?? null,
            updatedAt: new Date(),
          },
        });
    });

    if (usages.length > 0) {
      await this.operation("persistence", "integrationUsage.upsert", async () => {
        await bulkCurrent.execute();
        await bulkHistory.execute();
      });
    }
  }

  async getIntegrationUsageHistory(userId: string, days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, days));
    const rows = await this.operation("query", "integrationUsageHistory.list", () =>
      this.usageHistory()
        .find({ userId, updatedAt: { $gte: since } })
        .project<IntegrationUsageHistory>({
          userId: 1,
          provider: 1,
          deviceId: 1,
          day: 1,
          accumulatedMs: 1,
          lastOn: 1,
          _id: 0,
        })
        .toArray()
    );
    return rows;
  }

  async getUserSettings(userId: string): Promise<UserSettingsRecord> {
    const row = await this.operation("query", "userSettings.get", () =>
      this.settings().findOne({ userId })
    );
    if (row) {
      return {
        userId,
        theme: (row.theme as UserSettingsRecord["theme"]) || "system",
        apps: Array.isArray(row.apps) ? row.apps : [],
        historicalData: row.historicalData || [],
        createdAt: row.createdAt?.toISOString?.() || new Date().toISOString(),
        updatedAt: row.updatedAt?.toISOString?.() || new Date().toISOString(),
      };
    }
    const now = new Date();
    await this.operation("persistence", "userSettings.insertDefault", () =>
      this.settings().insertOne({
        userId,
        theme: "system",
        apps: [],
        historicalData: [],
        createdAt: now,
        updatedAt: now,
      })
    );
    return {
      userId,
      theme: "system",
      apps: [],
      historicalData: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async updateUserSettings(userId: string, input: Partial<UserSettingsRecord>) {
    const existing = await this.getUserSettings(userId);
    const now = new Date();
    const merged: UserSettingsRecord = {
      ...existing,
      ...input,
      userId,
      apps: input.apps ?? existing.apps ?? [],
      historicalData: input.historicalData ?? existing.historicalData ?? [],
      updatedAt: now.toISOString(),
    };
    await this.operation("persistence", "userSettings.update", () =>
      this.settings().updateOne(
        { userId },
        {
          $set: {
            theme: merged.theme,
            apps: merged.apps,
            historicalData: merged.historicalData,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      )
    );
    return merged;
  }

  private encrypt(plain: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encKey, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
  }

  private decrypt(encoded: string) {
    const buf = Buffer.from(encoded, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encKey, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  }
}
