import { MongoClient, MongoClientOptions, Collection, Db, Document } from "mongodb";
import crypto from "crypto";
import {
  ApplianceRecord,
  FloorRecord,
  IntegrationUsageHistory,
  PropertyRecord,
  RoomRecord,
  UserRecord,
  UserSettingsRecord,
  AuthSession,
} from "../types";
import { env } from "../config/env";
import { EnergySample, toEnergyIntervals } from "../modules/energy/energy-history";
import { STATE_TARIFFS } from "../config/tariffs";
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
  tariffState?: string;
  tariffValue?: number;
  energyCollectionEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const ENERGY_SAMPLE_FIELDS = {
  _id: 0, applianceId: 1, provider: 1, deviceId: 1, capturedAt: 1, counterKWh: 1, tariffValue: 1,
  readingType: 1, startAt: 1, propertyId: 1, roomId: 1,
} as const;

export type EnergyCollectionStatus = "ok" | "no_reading" | "failed" | "rate_limited" | "gone" | "unauthorized";
export interface EnergyCollectionOutcome { status: EnergyCollectionStatus; retryAfterMs?: number; durationMs?: number; lagMs?: number }
interface EnergyQueueRow {
  key: string; userId?: string; deviceId?: string; nextAt: Date; leaseUntil: Date; leaseId?: string | null;
  failures?: number; lastSuccessAt?: Date; lastStatus?: EnergyCollectionStatus; lastIntervalMs?: number;
  lastLagMs?: number; lastDurationMs?: number | null; claimedAt?: Date; createdAt?: Date;
}

export class MongoDatabase {
  private client: MongoClient;
  private db!: Db;
  private encKey: Buffer;

  constructor(uri?: string, private dbName: string = env.mongoDbName, options?: MongoClientOptions) {
    this.client = new MongoClient(uri || env.mongoUrl, {
      maxPoolSize: 10, minPoolSize: 0, maxConnecting: 2, maxIdleTimeMS: 60000,
      waitQueueTimeoutMS: 5000, serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000, socketTimeoutMS: 10000, ...options,
    });
    this.encKey = crypto
      .createHash("sha256")
      .update(env.smartThingsTokenSecret || "wattstatus-dev-secret")
      .digest();
  }

  private async operation<T>(type: "query" | "persistence", operation: string, action: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await action();
      logger.debug(`mongodb.${type}_succeeded`, { operation, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logger.error(`mongodb.${type}_failed`, { operation, durationMs: Date.now() - startedAt, ...getErrorFields(error) });
      throw error;
    }
  }

  async init(createIndexes = true) {
    const startedAt = Date.now();
    logger.info("mongodb.connection_started", { database: this.dbName });
    try {
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      if (!createIndexes) return;
    // Index builds are idempotent but each is a round trip; on a cold
    // serverless start doing them one by one dominated init time. Collections
    // build in parallel, indexes of one collection keep their order.
    const indexes: Array<[string, () => Promise<string>]> = [
      ["users", () => this.db.collection("users").createIndex({ email: 1 }, { unique: true })],
      ["admin_grants", () => this.db.collection("admin_grants").createIndex({ userId: 1 }, { unique: true })],
      ["users", () => this.db.collection("users").createIndex({ emailCanonical: 1 }, {
      unique: true, partialFilterExpression: { emailCanonical: { $type: "string" } },
    })],
      ["users", () => this.db.collection("users").createIndex({ email: 1 }, {
      name: "users_email_lookup", collation: { locale: "en", strength: 2 },
    })],
      ["users", () => this.db.collection("users").createIndex({ id: 1 }, { unique: true })],
      ["auth_sessions", () => this.db.collection("auth_sessions").createIndex({ id: 1 }, { unique: true })],
      ["auth_sessions", () => this.db.collection("auth_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })],
      ["auth_limits", () => this.db.collection("auth_limits").createIndex({ key: 1 }, { unique: true })],
      ["auth_limits", () => this.db.collection("auth_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })],
      ["appliances", () => this.db.collection("appliances").createIndex({ userId: 1 })],
      ["appliances", () => this.db.collection("appliances").createIndex({ importKey: 1 }, { unique: true, partialFilterExpression: { importKey: { $exists: true } } })],
      ["integration_tokens", () => this.db.collection("integration_tokens").createIndex({ userId: 1, provider: 1 }, { unique: true })],
      ["integration_usage", () => this.db.collection("integration_usage").createIndex(
      { userId: 1, provider: 1, deviceId: 1 },
      { unique: true }
    )],
      ["integration_usage_history", () => this.db.collection("integration_usage_history").createIndex(
      { userId: 1, provider: 1, deviceId: 1, day: 1 },
      { unique: true }
    )],
      ["user_settings", () => this.db.collection("user_settings").createIndex({ userId: 1 }, { unique: true })],
      ["energy_samples", () => this.db.collection("energy_samples").createIndex({ sampleKey: 1 }, { unique: true })],
      ["energy_samples", () => this.db.collection("energy_samples").createIndex({ userId: 1, capturedAt: 1, applianceId: 1 })],
      ["energy_samples", () => this.db.collection("energy_samples").createIndex({ userId: 1, provider: 1, deviceId: 1, capturedAt: -1 })],
      ["sessions", () => this.db.collection("sessions").createIndex({ id: 1 }, { unique: true })],
      ["sessions", () => this.db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })],
      ["appliances", () => this.db.collection("appliances").createIndex({ integrationProvider: 1, id: 1 })],
      ["energy_collection", () => this.db.collection("energy_collection").createIndex({ key: 1 }, { unique: true })],
      // Queue order for claimEnergyCollection: most overdue first.
      ["energy_collection", () => this.db.collection("energy_collection").createIndex({ nextAt: 1, key: 1 })],
      ["energy_collection", () => this.db.collection("energy_collection").createIndex({ userId: 1, nextAt: 1 })],
      ["energy_collection_runs", () => this.db.collection("energy_collection_runs").createIndex({ at: 1 }, { expireAfterSeconds: 30 * 86400 })],
      // Opted-in users for syncEnergyCollection.
      ["user_settings", () => this.db.collection("user_settings").createIndex({ energyCollectionEnabled: 1, userId: 1 }, { partialFilterExpression: { energyCollectionEnabled: true } })],
      ["properties", () => this.db.collection("properties").createIndex({ id: 1 }, { unique: true })],
      ["properties", () => this.db.collection("properties").createIndex({ userId: 1, archivedAt: 1 })],
      // At most one default property per user, even under concurrent first access.
      ["properties", () => this.db.collection("properties").createIndex(
      { userId: 1 },
      { unique: true, name: "one_legacy_default_per_user", partialFilterExpression: { legacyDefault: true } }
    )],
      ["property_floors", () => this.db.collection("property_floors").createIndex({ id: 1 }, { unique: true })],
      ["property_floors", () => this.db.collection("property_floors").createIndex({ userId: 1, propertyId: 1 })],
      ["property_rooms", () => this.db.collection("property_rooms").createIndex({ id: 1 }, { unique: true })],
      ["property_rooms", () => this.db.collection("property_rooms").createIndex({ userId: 1, propertyId: 1, floorId: 1 })],
      ["appliances", () => this.db.collection("appliances").createIndex({ userId: 1, propertyId: 1, roomId: 1 })],
      ["energy_samples", () => this.db.collection("energy_samples").createIndex({ userId: 1, propertyId: 1, capturedAt: 1 })],
    ];
    const byCollection = new Map<string, Array<() => Promise<string>>>();
    for (const [name, build] of indexes) byCollection.set(name, [...(byCollection.get(name) ?? []), build]);
    await Promise.all([...byCollection.values()].map(async (builds) => {
      for (const build of builds) await build();
    }));
      logger.info("mongodb.connection_succeeded", { database: this.dbName, durationMs: Date.now() - startedAt });
    } catch (error) {
      logger.error("mongodb.connection_failed", { database: this.dbName, durationMs: Date.now() - startedAt, ...getErrorFields(error) });
      await this.client.close().catch(() => undefined);
      throw error;
    }
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
  private properties(): Collection<PropertyRecord> {
    return this.db.collection<PropertyRecord>("properties");
  }
  private floors(): Collection<FloorRecord> {
    return this.db.collection<FloorRecord>("property_floors");
  }
  private rooms(): Collection<RoomRecord> {
    return this.db.collection<RoomRecord>("property_rooms");
  }
  private energySamples(): Collection<EnergySample> {
    return this.db.collection<EnergySample>("energy_samples");
  }
  // Collections owned by the AI module (preferences, recommendation states,
  // usage metrics). Every query on them is scoped by userId in MongoAIStore.
  aiCollection<T extends Document>(name: `ai_${string}`) {
    return this.db.collection<T>(name);
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
      propertyId: appliance?.propertyId ?? null, roomId: appliance?.roomId ?? null,
      createdAt: new Date(), sampleKey,
    };
    await this.energySamples().updateOne({ sampleKey }, { $setOnInsert: sample }, { upsert: true });
  }

  async saveEnergyDelta(userId: string, provider: string, deviceId: string, deltaKWh: number, startAt: Date, endAt: Date) {
    if (!Number.isFinite(deltaKWh) || deltaKWh < 0 || !(endAt.getTime() > startAt.getTime())) {
      throw new Error("Invalid energy delta");
    }
    const appliance = await this.appliances().findOne({ userId, integrationProvider: provider, integrationDeviceId: deviceId });
    const settings = await this.getUserSettings(userId);
    const tariffValue = appliance?.tariffValue ?? (appliance?.tariff ? STATE_TARIFFS[appliance.tariff] : undefined) ?? settings.tariffValue ?? null;
    // One document per report window, so re-reading the same report is a no-op.
    const sampleKey = crypto.createHash("sha256")
      .update(JSON.stringify([userId, provider, deviceId, "delta", startAt.getTime(), endAt.getTime()]))
      .digest("hex");
    const sample: EnergySample = {
      userId, applianceId: appliance?.id ?? null, provider, deviceId, capturedAt: endAt, startAt,
      counterKWh: deltaKWh, tariffValue, source: "iot", readingType: "delta",
      propertyId: appliance?.propertyId ?? null, roomId: appliance?.roomId ?? null,
      createdAt: new Date(), sampleKey,
    };
    await this.energySamples().updateOne({ sampleKey }, { $setOnInsert: sample }, { upsert: true });
  }

  async getEnergyHistory(userId: string, start: Date, end: Date, applianceId?: string) {
    // Only the fields the interval builder reads: skips _id, userId, the
    // 64-char sampleKey and createdAt on every document of the period.
    const current = await this.energySamples().find({ userId, capturedAt: { $gte: start, $lt: end } },
      { projection: ENERGY_SAMPLE_FIELDS })
      .sort({ capturedAt: 1 }).toArray();
    const keys = new Map<string, { provider: string; deviceId: string }>();
    for (const sample of current) keys.set(`${sample.provider}\u0000${sample.deviceId}`, sample);
    const preceding = await Promise.all([...keys.values()].map(({ provider, deviceId }) =>
      this.energySamples().findOne({ userId, provider, deviceId, readingType: { $ne: "delta" }, capturedAt: { $lt: start } },
        { sort: { capturedAt: -1 }, projection: ENERGY_SAMPLE_FIELDS })
    ));
    const intervals = toEnergyIntervals([...preceding.flatMap((item) => item ? [item] : []), ...current]);
    return intervals.filter((item) => new Date(item.endAt) >= start && new Date(item.endAt) < end && (!applianceId || item.applianceId === applianceId));
  }

  // Living Energy: properties, floors and rooms. Every query is scoped by userId.
  private clean<T extends object>(doc: T | null) {
    if (!doc) return null;
    const { _id, ...rest } = doc as T & { _id?: unknown };
    void _id;
    return rest as T;
  }

  async listProperties(userId: string) {
    const rows = await this.operation("query", "properties.list", () =>
      this.properties().find({ userId }).sort({ isPrimary: -1, createdAt: 1 }).toArray()
    );
    return rows.map((row) => this.clean(row)!);
  }

  async insertProperty(record: PropertyRecord) {
    // The default property gets a deterministic _id, which MongoDB always keeps
    // unique, so concurrent first visits cannot create two even if the
    // secondary unique index is missing.
    const doc = record.legacyDefault ? { ...record, _id: `legacy-default:${record.userId}` } : { ...record };
    await this.operation("persistence", "properties.insert", () =>
      this.db.collection("properties").insertOne(doc as unknown as Record<string, unknown>)
    );
  }

  async updateProperty(userId: string, id: string, patch: Partial<PropertyRecord>) {
    const { id: _ignoredId, userId: _ignoredUser, ...safe } = patch;
    void _ignoredId; void _ignoredUser;
    const row = await this.operation("persistence", "properties.update", () =>
      this.properties().findOneAndUpdate({ id, userId }, { $set: safe }, { returnDocument: "after" })
    );
    return this.clean(row);
  }

  async setPrimaryProperty(userId: string, id: string) {
    await this.operation("persistence", "properties.setPrimary", async () => {
      await this.properties().updateMany({ userId, id: { $ne: id } }, { $set: { isPrimary: false } });
      await this.properties().updateOne({ userId, id }, { $set: { isPrimary: true } });
    });
  }

  async deleteProperty(userId: string, id: string) {
    const res = await this.operation("persistence", "properties.delete", () => this.properties().deleteOne({ userId, id }));
    return res.deletedCount > 0;
  }

  async listFloors(userId: string, propertyId: string) {
    const rows = await this.operation("query", "floors.list", () => this.floors().find({ userId, propertyId }).toArray());
    return rows.map((row) => this.clean(row)!);
  }

  async insertFloor(record: FloorRecord) {
    await this.operation("persistence", "floors.insert", () => this.floors().insertOne({ ...record }));
  }

  async updateFloor(userId: string, id: string, patch: Partial<FloorRecord>) {
    const { id: _a, userId: _b, propertyId: _c, ...safe } = patch;
    void _a; void _b; void _c;
    const row = await this.operation("persistence", "floors.update", () =>
      this.floors().findOneAndUpdate({ id, userId }, { $set: safe }, { returnDocument: "after" })
    );
    return this.clean(row);
  }

  async deleteFloors(userId: string, propertyId: string, floorId?: string) {
    await this.operation("persistence", "floors.delete", () =>
      this.floors().deleteMany({ userId, propertyId, ...(floorId ? { id: floorId } : {}) })
    );
  }

  async listRooms(userId: string, propertyId: string) {
    const rows = await this.operation("query", "rooms.list", () => this.rooms().find({ userId, propertyId }).toArray());
    return rows.map((row) => this.clean(row)!);
  }

  async insertRoom(record: RoomRecord) {
    await this.operation("persistence", "rooms.insert", () => this.rooms().insertOne({ ...record }));
  }

  async updateRoom(userId: string, id: string, patch: Partial<RoomRecord>) {
    const { id: _a, userId: _b, propertyId: _c, ...safe } = patch;
    void _a; void _b; void _c;
    const row = await this.operation("persistence", "rooms.update", () =>
      this.rooms().findOneAndUpdate({ id, userId }, { $set: safe }, { returnDocument: "after" })
    );
    return this.clean(row);
  }

  async deleteRooms(userId: string, propertyId: string, roomId?: string) {
    await this.operation("persistence", "rooms.delete", () =>
      this.rooms().deleteMany({ userId, propertyId, ...(roomId ? { id: roomId } : {}) })
    );
  }

  async countRoomsByProperty(userId: string) {
    const rows = await this.operation("query", "rooms.countByProperty", () =>
      this.rooms().aggregate<{ _id: string; count: number }>([
        { $match: { userId } },
        { $group: { _id: "$propertyId", count: { $sum: 1 } } },
      ]).toArray()
    );
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  async moveAppliances(
    userId: string,
    filter: { propertyId?: string | null; roomId?: string },
    target: { propertyId: string; roomId: string | null }
  ) {
    const query: Record<string, unknown> = { userId };
    if (filter.propertyId === null) query.propertyId = { $in: [null] };
    else if (filter.propertyId) query.propertyId = filter.propertyId;
    if (filter.roomId) query.roomId = filter.roomId;
    const res = await this.operation("persistence", "appliances.move", () =>
      this.appliances().updateMany(query, { $set: target })
    );
    return res.modifiedCount;
  }

  // Scheduled collection is a queue in `energy_collection`: one row per
  // opted-in SmartThings device, served oldest `nextAt` first. Rows are
  // registered by syncEnergyCollection; a claim is one atomic
  // findOneAndUpdate, so concurrent runs never take the same device, and a
  // failing device only pushes its own `nextAt` back.
  //
  // Registers devices that have no queue row yet, a page per call. The page
  // cursor (by appliance `_id`) wraps around, so every eligible device is
  // registered within ceil(devices / pageSize) runs, however many there are.
  async syncEnergyCollection(now: Date, pageSize = 500) {
    const enabled = await this.settings().find({ energyCollectionEnabled: true })
      .project<{ userId: string }>({ userId: 1, _id: 0 }).toArray();
    if (!enabled.length) return { scanned: 0, registered: 0 };
    const meta = this.db.collection<{ _id: string; after: unknown }>("energy_collection_meta");
    const cursor = await meta.findOne({ _id: "sync" });
    const filter = {
      userId: { $in: enabled.map((row) => row.userId) },
      integrationProvider: "smartthings", integrationDeviceId: { $type: "string" },
    };
    const page = await this.appliances().find({ ...filter, ...(cursor?.after ? { _id: { $gt: cursor.after } } : {}) } as never)
      .project<{ _id: unknown; userId: string; integrationDeviceId: string }>({ _id: 1, userId: 1, integrationDeviceId: 1 })
      .sort({ _id: 1 }).limit(pageSize).toArray();
    let registered = 0;
    if (page.length) {
      const result = await this.db.collection("energy_collection").bulkWrite(page.map((row) => {
        const key = `${row.userId}:smartthings:${row.integrationDeviceId}`;
        return {
          updateOne: {
            filter: { key },
            // New devices are due at once; existing rows keep their schedule.
            update: { $setOnInsert: { key, userId: row.userId, deviceId: row.integrationDeviceId, nextAt: new Date(0), leaseUntil: new Date(0), failures: 0, createdAt: now } },
            upsert: true,
          },
        };
      }), { ordered: false });
      registered = result.upsertedCount;
    }
    // A short page means the end was reached: start over next time.
    await meta.updateOne({ _id: "sync" }, { $set: { after: page.length === pageSize ? page[page.length - 1]._id : null, at: now } }, { upsert: true });
    return { scanned: page.length, registered };
  }

  // Takes the most overdue device whose lease is free. Rows whose device was
  // removed or whose owner turned collection off are dropped on the way (a
  // later sync re-registers them if collection is turned back on).
  async claimEnergyCollection(now: Date, leaseMs: number, maxSkips = 20, excludeUserIds: string[] = []) {
    const queue = this.db.collection<EnergyQueueRow>("energy_collection");
    for (let skipped = 0; skipped <= maxSkips; skipped++) {
      // A lease id makes the claim ownable: a late finish from a worker whose
      // lease expired (and was re-claimed) is ignored.
      const leaseId = crypto.randomUUID();
      const row = await queue.findOneAndUpdate(
        { nextAt: { $lte: now }, leaseUntil: { $lte: now }, ...(excludeUserIds.length ? { userId: { $nin: excludeUserIds } } : {}) },
        { $set: { leaseUntil: new Date(now.getTime() + leaseMs), leaseId, claimedAt: now } },
        { sort: { nextAt: 1, key: 1 }, returnDocument: "after", projection: { _id: 0 } },
      );
      if (!row) return null;
      // Rows written before the queue fields existed only have `key`.
      const [userId, , ...rest] = row.key.split(":");
      const deviceId = row.deviceId ?? rest.join(":");
      const [settings, appliance] = await Promise.all([
        this.settings().findOne({ userId: row.userId ?? userId }, { projection: { energyCollectionEnabled: 1, _id: 0 } }),
        this.appliances().findOne(
          { userId: row.userId ?? userId, integrationProvider: "smartthings", integrationDeviceId: deviceId },
          { projection: { id: 1, userId: 1, integrationDeviceId: 1, _id: 0 } },
        ),
      ]);
      if (settings?.energyCollectionEnabled === true && appliance) {
        return {
          appliance: appliance as Pick<ApplianceRecord, "id" | "userId" | "integrationDeviceId">,
          key: row.key, leaseId,
          // How late the device was when served (queue lag).
          // A device never collected is due since it was registered, not since 1970.
          lagMs: Math.max(0, now.getTime() - Math.max(new Date(row.nextAt).getTime(), row.createdAt ? new Date(row.createdAt).getTime() : 0)),
          neverCollected: !row.lastSuccessAt,
        };
      }
      await queue.deleteOne({ key: row.key, leaseId });
    }
    return null;
  }

  // Outcome of one claimed device. `success` keeps the old boolean form.
  async finishEnergyCollection(key: string, now: Date, intervalMs: number, outcome: boolean | EnergyCollectionOutcome, leaseId?: string) {
    const result: EnergyCollectionOutcome = typeof outcome === "boolean" ? { status: outcome ? "ok" : "failed" } : outcome;
    const queue = this.db.collection<EnergyQueueRow>("energy_collection");
    const row = await queue.findOne({ key }, { projection: { failures: 1, lastSuccessAt: 1, leaseId: 1, _id: 0 } });
    if (!row || (leaseId && row.leaseId && row.leaseId !== leaseId)) return false;
    const ok = result.status === "ok" || result.status === "no_reading";
    const failures = ok ? 0 : result.status === "rate_limited" ? Number(row.failures ?? 0) : Math.min(6, Number(row.failures ?? 0) + 1);
    let delay: number;
    if (ok) delay = intervalMs;
    else if (result.status === "rate_limited") delay = Math.max(60000, Math.min(3600000, result.retryAfterMs ?? 60000));
    else if (result.status === "gone") delay = 24 * 3600000;
    else if (result.status === "unauthorized") delay = 6 * 3600000;
    else delay = Math.max(intervalMs, Math.min(6 * 3600000, 60000 * 2 ** failures));
    const set: Record<string, unknown> = {
      nextAt: new Date(now.getTime() + delay), leaseUntil: new Date(0), leaseId: null, failures,
      lastAttemptAt: now, lastStatus: result.status, lastDurationMs: result.durationMs ?? null,
      ...(typeof result.lagMs === "number" ? { lastLagMs: result.lagMs } : {}),
    };
    if (result.status === "ok") {
      set.lastSuccessAt = now;
      if (row.lastSuccessAt) set.lastIntervalMs = now.getTime() - new Date(row.lastSuccessAt).getTime();
    }
    const updated = await queue.updateOne({ key, ...(leaseId ? { leaseId } : {}) }, { $set: set });
    return updated.matchedCount > 0;
  }

  // Gives a claimed device back without touching its schedule.
  async releaseEnergyCollection(key: string, leaseId: string) {
    await this.db.collection<EnergyQueueRow>("energy_collection").updateOne({ key, leaseId }, { $set: { leaseUntil: new Date(0), leaseId: null } });
  }

  // After a 429 for one account: move its due devices past the reset, so no
  // run spends calls on a token that is resting.
  async postponeEnergyCollectionForUser(userId: string, now: Date, until: Date) {
    const result = await this.db.collection<EnergyQueueRow>("energy_collection").updateMany(
      { userId, nextAt: { $lt: until }, leaseUntil: { $lte: now } },
      { $set: { nextAt: until, lastStatus: "rate_limited" } },
    );
    return result.modifiedCount;
  }

  async recordEnergyCollectionRun(summary: Record<string, unknown>) {
    await this.db.collection("energy_collection_runs").insertOne({ ...summary, at: summary.at instanceof Date ? summary.at : new Date() });
  }

  // Queue health for operators: is capacity keeping up with the interval?
  async energyCollectionStats(now: Date, intervalMs: number) {
    const queue = this.db.collection<EnergyQueueRow>("energy_collection");
    const [totals] = await queue.aggregate([
      { $set: { dueSince: { $max: ["$nextAt", { $ifNull: ["$createdAt", "$nextAt"] }] } } },
      { $group: {
        _id: null,
        queued: { $sum: 1 },
        due: { $sum: { $cond: [{ $lte: ["$nextAt", now] }, 1, 0] } },
        // Waiting more than one interval past their due time.
        late: { $sum: { $cond: [{ $and: [{ $lte: ["$nextAt", now] }, { $lte: ["$dueSince", new Date(now.getTime() - intervalMs)] }] }, 1, 0] } },
        neverCollected: { $sum: { $cond: [{ $ifNull: ["$lastSuccessAt", false] }, 0, 1] } },
        // Last good reading older than two intervals (never-read rows counted apart).
        stale: { $sum: { $cond: [{ $and: [{ $ifNull: ["$lastSuccessAt", false] }, { $lt: ["$lastSuccessAt", new Date(now.getTime() - 2 * intervalMs)] }] }, 1, 0] } },
        failing: { $sum: { $cond: [{ $gte: ["$failures", 3] }, 1, 0] } },
        oldestDue: { $min: { $cond: [{ $lte: ["$nextAt", now] }, "$dueSince", null] } },
        avgIntervalMs: { $avg: "$lastIntervalMs" },
        avgLagMs: { $avg: "$lastLagMs" },
        avgDurationMs: { $avg: "$lastDurationMs" },
      } },
    ]).toArray();
    const runs = await this.db.collection("energy_collection_runs").find({ at: { $gte: new Date(now.getTime() - 3600000) } }, { projection: { _id: 0 } }).toArray();
    const lastHour = runs.reduce<{ runs: number; claimed: number; saved: number; failed: number; rateLimited: number }>((sum, run) => ({
      runs: sum.runs + 1, claimed: sum.claimed + Number(run.claimed ?? 0), saved: sum.saved + Number(run.saved ?? 0),
      failed: sum.failed + Number(run.failed ?? 0), rateLimited: sum.rateLimited + Number(run.rateLimited ?? 0),
    }), { runs: 0, claimed: 0, saved: 0, failed: 0, rateLimited: 0 });
    const queued = Number(totals?.queued ?? 0);
    const neededPerHour = intervalMs > 0 ? Math.ceil(queued * 3600000 / intervalMs) : 0;
    return {
      at: now.toISOString(), intervalMs, queued,
      due: Number(totals?.due ?? 0), late: Number(totals?.late ?? 0), stale: Number(totals?.stale ?? 0),
      neverCollected: Number(totals?.neverCollected ?? 0), failing: Number(totals?.failing ?? 0),
      oldestDueAgeMs: totals?.oldestDue ? now.getTime() - new Date(totals.oldestDue).getTime() : 0,
      avgIntervalMs: totals?.avgIntervalMs ?? null, avgLagMs: totals?.avgLagMs ?? null, avgDurationMs: totals?.avgDurationMs ?? null,
      lastHour, neededPerHour,
      // Devices waiting more than one interval past due: capacity is not keeping
      // up (processing fewer than neededPerHour is fine when little is due).
      capacityShort: Number(totals?.late ?? 0) > 0
        || (totals?.oldestDue ? now.getTime() - new Date(totals.oldestDue).getTime() > intervalMs / 2 : false)
        || (typeof totals?.avgIntervalMs === "number" && totals.avgIntervalMs > 1.25 * intervalMs),
    };
  }

  // Per-device freshness for one user, for the UI and the AI (see docs/COLETA_ENERGIA.md).
  async energyCollectionStatus(userId: string, now: Date, intervalMs: number) {
    const [settings, appliances, rows] = await Promise.all([
      this.settings().findOne({ userId }, { projection: { energyCollectionEnabled: 1, _id: 0 } }),
      this.appliances().find({ userId, integrationProvider: "smartthings", integrationDeviceId: { $type: "string" } }, { projection: { id: 1, integrationDeviceId: 1, _id: 0 } }).toArray(),
      this.db.collection<EnergyQueueRow>("energy_collection").find({ userId }, { projection: { _id: 0 } }).toArray(),
    ]);
    const enabled = settings?.energyCollectionEnabled === true;
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return {
      enabled, intervalMs,
      devices: appliances.map((appliance) => {
        const row = byKey.get(`${userId}:smartthings:${appliance.integrationDeviceId}`);
        const last = row?.lastSuccessAt ? new Date(row.lastSuccessAt) : null;
        const age = last ? now.getTime() - last.getTime() : null;
        let state: "recent" | "delayed" | "missing" | "disabled" | "error";
        if (!enabled) state = "disabled";
        else if (row && (row.lastStatus === "unauthorized" || row.lastStatus === "gone" || Number(row.failures ?? 0) >= 3)) state = "error";
        else if (!last) state = "missing";
        else state = age! <= 2 * intervalMs ? "recent" : "delayed";
        return {
          applianceId: appliance.id, state, lastReadingAt: last?.toISOString() ?? null, ageMs: age,
          nextAt: row?.nextAt ? new Date(row.nextAt).toISOString() : null,
          lastStatus: row?.lastStatus ?? null, failures: Number(row?.failures ?? 0),
        };
      }),
    };
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

  // Administrative privilege is a server-side grant tied to the user id. It is
  // written only by scripts/admin-grant.cjs with direct database access; no
  // HTTP route writes it, and an e-mail address alone never grants it
  // (registration does not verify e-mail ownership).
  async isAdmin(userId: string) {
    if (!userId) return false;
    const grant = await this.operation("query", "admin_grants.get", () =>
      this.db.collection("admin_grants").findOne({ userId, revokedAt: null }, { projection: { _id: 1 } }));
    return Boolean(grant);
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
    if (record.integrationProvider && record.integrationDeviceId) {
      const existing = await this.appliances().findOne({ userId: record.userId, integrationProvider: record.integrationProvider, integrationDeviceId: record.integrationDeviceId });
      if (existing) throw new Error("DEVICE_ALREADY_IMPORTED");
    }
    await this.appliances().insertOne(record);
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
    const now = new Date();
    const row = await this.settings().findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, theme: "system", apps: [], historicalData: [], createdAt: now, updatedAt: now } },
      { upsert: true, returnDocument: "after" }
    );
    return {
      userId,
      theme: row?.theme === "light" || row?.theme === "dark" ? row.theme : "system",
      apps: Array.isArray(row?.apps) ? row.apps : [],
      historicalData: row?.historicalData || [],
      tariffState: row?.tariffState,
      tariffValue: row?.tariffValue,
      energyCollectionEnabled: row?.energyCollectionEnabled === true,
      createdAt: row?.createdAt?.toISOString?.() || now.toISOString(),
      updatedAt: row?.updatedAt?.toISOString?.() || now.toISOString(),
    };
  }

  async updateUserSettings(userId: string, input: Partial<UserSettingsRecord>) {
    const now = new Date();
    const fields = ["theme", "apps", "historicalData", "tariffState", "tariffValue", "energyCollectionEnabled"] as const;
    const updates: Partial<SettingsDoc> = { updatedAt: now };
    for (const field of fields) {
      if (input[field] !== undefined) (updates as Record<string, unknown>)[field] = input[field];
    }
    await this.settings().updateOne(
      { userId },
      {
        $set: updates,
        $setOnInsert: { userId, createdAt: now },
      },
      { upsert: true }
    );
    return this.getUserSettings(userId);
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
