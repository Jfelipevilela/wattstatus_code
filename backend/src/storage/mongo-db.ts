import { MongoClient, Collection, Db } from "mongodb";
import crypto from "crypto";
import {
  ApplianceRecord,
  IntegrationUsageHistory,
  UserRecord,
  UserSettingsRecord,
} from "../types";
import { env } from "../config/env";
import { EnergySample, toEnergyIntervals } from "../modules/energy/energy-history";
import { STATE_TARIFFS } from "../config/tariffs";

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
  tariffState?: string;
  tariffValue?: number;
  energyCollectionEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class MongoDatabase {
  private client: MongoClient;
  private db!: Db;
  private encKey: Buffer;

  constructor(uri?: string, private dbName: string = env.mongoDbName) {
    this.client = new MongoClient(uri || env.mongoUrl);
    this.encKey = crypto
      .createHash("sha256")
      .update(env.smartThingsTokenSecret || "wattstatus-dev-secret")
      .digest();
  }

  async init() {
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    await this.db.collection("users").createIndex({ email: 1 }, { unique: true });
    await this.db.collection("appliances").createIndex({ userId: 1 });
    await this.db.collection("appliances").createIndex({ importKey: 1 }, { unique: true, partialFilterExpression: { importKey: { $exists: true } } });
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
    await this.db.collection("energy_samples").createIndex({ sampleKey: 1 }, { unique: true });
    await this.db.collection("energy_samples").createIndex({ userId: 1, capturedAt: 1, applianceId: 1 });
    await this.db.collection("energy_samples").createIndex({ userId: 1, provider: 1, deviceId: 1, capturedAt: -1 });
    await this.db.collection("sessions").createIndex({ id: 1 }, { unique: true });
    await this.db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.db.collection("appliances").createIndex({ integrationProvider: 1, id: 1 });
    await this.db.collection("energy_collection").createIndex({ key: 1 }, { unique: true });
  }

  async close() {
    await this.client.close();
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
  private energySamples(): Collection<EnergySample> {
    return this.db.collection<EnergySample>("energy_samples");
  }
  async createSession(userId: string, id: string, expiresAt: Date) {
    await this.db.collection("sessions").insertOne({ userId, id, expiresAt, createdAt: new Date() });
  }
  async hasSession(userId: string, id: string) {
    return Boolean(await this.db.collection("sessions").findOne({ userId, id, expiresAt: { $gt: new Date() } }, { projection: { _id: 1 } }));
  }
  async revokeSession(userId: string, id: string) {
    await this.db.collection("sessions").deleteOne({ userId, id });
  }

  async saveEnergySample(userId: string, provider: string, deviceId: string, counterKWh: number, capturedAt = new Date()) {
    if (!Number.isFinite(counterKWh) || counterKWh < 0 || !Number.isFinite(capturedAt.getTime())) {
      throw new Error("Invalid energy sample");
    }
    const appliance = await this.appliances().findOne({ userId, integrationProvider: provider, integrationDeviceId: deviceId });
    const settings = await this.getUserSettings(userId);
    const tariffValue = appliance?.tariffValue ?? (appliance?.tariff ? STATE_TARIFFS[appliance.tariff] : undefined) ?? settings.tariffValue ?? null;
    const sampleKey = crypto.createHash("sha256")
      .update(JSON.stringify([userId, provider, deviceId, Math.floor(capturedAt.getTime() / 60000), counterKWh]))
      .digest("hex");
    const sample: EnergySample = {
      userId, applianceId: appliance?.id ?? null, provider, deviceId, capturedAt,
      counterKWh, tariffValue, source: "iot", readingType: "cumulative",
      createdAt: new Date(), sampleKey,
    };
    await this.energySamples().updateOne({ sampleKey }, { $setOnInsert: sample }, { upsert: true });
  }

  async getEnergyHistory(userId: string, start: Date, end: Date, applianceId?: string) {
    const current = await this.energySamples().find({ userId, capturedAt: { $gte: start, $lt: end } })
      .sort({ capturedAt: 1 }).toArray();
    const keys = new Map<string, { provider: string; deviceId: string }>();
    for (const sample of current) keys.set(`${sample.provider}\u0000${sample.deviceId}`, sample);
    const preceding = await Promise.all([...keys.values()].map(({ provider, deviceId }) =>
      this.energySamples().findOne({ userId, provider, deviceId, capturedAt: { $lt: start } }, { sort: { capturedAt: -1 } })
    ));
    const intervals = toEnergyIntervals([...preceding.flatMap((item) => item ? [item] : []), ...current]);
    return intervals.filter((item) => new Date(item.endAt) >= start && new Date(item.endAt) < end && (!applianceId || item.applianceId === applianceId));
  }

  async claimEnergyCollection(now: Date, leaseMs: number) {
    const candidates = await this.appliances().find({ integrationProvider: "smartthings", integrationDeviceId: { $type: "string" } })
      .project<Pick<ApplianceRecord, "id" | "userId" | "integrationDeviceId">>({ id: 1, userId: 1, integrationDeviceId: 1, _id: 0 })
      .limit(200).toArray();
    for (const appliance of candidates) {
      const settings = await this.getUserSettings(appliance.userId);
      if (!settings.energyCollectionEnabled) continue;
      const key = `${appliance.userId}:smartthings:${appliance.integrationDeviceId}`;
      const collection = this.db.collection("energy_collection");
      try {
        const row = await collection.findOneAndUpdate(
          { key, nextAt: { $lte: now }, leaseUntil: { $lte: now } },
          { $set: { leaseUntil: new Date(now.getTime() + leaseMs) } },
          { returnDocument: "after" }
        );
        if (row) return { appliance, key };
        await collection.insertOne({ key, nextAt: new Date(0), leaseUntil: new Date(now.getTime() + leaseMs), failures: 0 });
        return { appliance, key };
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
      }
    }
    return null;
  }

  async finishEnergyCollection(key: string, now: Date, intervalMs: number, success: boolean) {
    const collection = this.db.collection("energy_collection");
    const row = await collection.findOne({ key });
    const failures = success ? 0 : Math.min(6, Number(row?.failures ?? 0) + 1);
    const delay = success ? intervalMs : Math.max(intervalMs, Math.min(6 * 3600000, 60000 * 2 ** failures));
    await collection.updateOne({ key }, { $set: { nextAt: new Date(now.getTime() + delay), leaseUntil: new Date(0), failures } });
  }

  async getUserByEmail(email: string) {
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.users().findOne({ email: { $regex: new RegExp(`^${escaped}$`, "i") } });
  }

  async getUserById(id: string) {
    return this.users().findOne({ id });
  }

  async addUser(user: UserRecord) {
    await this.users().insertOne(user);
    return user;
  }

  async listAppliances(userId: string) {
    return this.appliances().find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  async addAppliance(record: ApplianceRecord) {
    if (record.integrationProvider && record.integrationDeviceId) {
      const existing = await this.appliances().findOne({ userId: record.userId, integrationProvider: record.integrationProvider, integrationDeviceId: record.integrationDeviceId });
      if (existing) throw new Error("DEVICE_ALREADY_IMPORTED");
    }
    await this.appliances().insertOne(record);
    return record;
  }

  async updateAppliance(userId: string, record: ApplianceRecord) {
    const res = await this.appliances().findOneAndUpdate(
      { id: record.id, userId },
      { $set: record },
      { returnDocument: "after" }
    );
    return res;
  }

  async deleteAppliance(userId: string, applianceId: string) {
    const res = await this.appliances().deleteOne({ id: applianceId, userId });
    return res.deletedCount > 0;
  }

  async saveIntegrationToken(userId: string, provider: string, token: string) {
    const encrypted = this.encrypt(token);
    await this.tokens().updateOne(
      { userId, provider },
      { $set: { token: encrypted } },
      { upsert: true }
    );
  }

  async deleteIntegrationToken(userId: string, provider: string) {
    await this.tokens().deleteOne({ userId, provider });
  }

  async getIntegrationToken(userId: string, provider: string) {
    const row = await this.tokens().findOne({ userId, provider });
    if (!row?.token) return null;
    try {
      return this.decrypt(row.token);
    } catch {
      return null;
    }
  }

  async getIntegrationUsage(userId: string, provider: string) {
    const rows = await this.usage()
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
      .toArray();
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
      await bulkCurrent.execute();
      await bulkHistory.execute();
    }
  }

  async getIntegrationUsageHistory(userId: string, days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, days));
    const rows = await this.usageHistory()
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
      .toArray();
    return rows;
  }

  async getUserSettings(userId: string): Promise<UserSettingsRecord> {
    const row = await this.settings().findOne({ userId });
    if (row) {
      return {
        userId,
        theme: row.theme === "light" || row.theme === "dark" ? row.theme : "system",
        apps: Array.isArray(row.apps) ? row.apps : [],
        historicalData: row.historicalData || [],
        tariffState: row.tariffState,
        tariffValue: row.tariffValue,
        energyCollectionEnabled: row.energyCollectionEnabled === true,
        createdAt: row.createdAt?.toISOString?.() || new Date().toISOString(),
        updatedAt: row.updatedAt?.toISOString?.() || new Date().toISOString(),
      };
    }
    const now = new Date();
    await this.settings().insertOne({
      userId,
      theme: "system",
      apps: [],
      historicalData: [],
      createdAt: now,
      updatedAt: now,
    });
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
      tariffState: input.tariffState ?? existing.tariffState,
      tariffValue: input.tariffValue ?? existing.tariffValue,
      energyCollectionEnabled: input.energyCollectionEnabled ?? existing.energyCollectionEnabled,
      updatedAt: now.toISOString(),
    };
    await this.settings().updateOne(
      { userId },
      {
        $set: {
          theme: merged.theme,
          apps: merged.apps,
          historicalData: merged.historicalData,
          tariffState: merged.tariffState,
          tariffValue: merged.tariffValue,
          energyCollectionEnabled: merged.energyCollectionEnabled,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
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
