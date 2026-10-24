import { MongoDatabase, EnergyCollectionOutcome } from "../../storage/mongo-db";
import { SmartThingsIntegration } from "../integrations/providers/smartthings";
import { ENERGY_CAPABILITIES, saveDeviceReading } from "./energy-history";
import { resolveAccessToken } from "../integrations/smartthings-oauth";

export type CollectionResult = {
  claimed: number; saved: number; failed: number; skipped: number;
  rateLimited: number; durationMs: number; avgDeviceMs: number;
  externalCalls: number; stoppedBy: "queue" | "budget" | "deadline" | "disabled";
};

// Hard ceilings, whatever the environment says. A scheduled Netlify function
// has a 30 s execution limit; SmartThings allows 12 status reads per minute
// per device and documents no per-token limit, so the per-user cap is what
// keeps one account from flooding its token.
export const COLLECTION_LIMITS = {
  maxDevicesPerRun: 500,
  maxConcurrency: 16,
  maxPerUserConcurrency: 4,
  maxDeadlineMs: 25000,
  requestTimeoutMs: 4000,
};

// What the collector needs from SmartThings. The light methods (one request
// each) are used when present; the full ones keep older clients working.
export type CollectorClient = {
  listEnergyDeviceIds?: (capabilities: string[]) => Promise<Set<string>>;
  listDevices?: () => Promise<Array<{ id: string; capabilities?: string[] }>>;
  getDeviceReading?: (deviceId: string) => Promise<{ raw: unknown }>;
  getDeviceStatus?: (deviceId: string) => Promise<{ raw: unknown }>;
};

export interface CollectOptions {
  enabled: boolean;
  intervalMinutes: number;
  // Devices to read in this run (budget).
  maxDevices: number;
  // Workers in flight at once, and at most this many for one user.
  concurrency?: number;
  perUserConcurrency?: number;
  deadlineMs: number;
  now?: () => Date;
  integration?: (token: string) => CollectorClient;
  // Token lookup, injectable for tests.
  token?: (userId: string) => Promise<string | null>;
  record?: boolean;
}

const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(Math.floor(value as number), max)) : fallback;

const classify = (error: unknown): EnergyCollectionOutcome => {
  const status = (error as { status?: number })?.status;
  if (status === 429) return { status: "rate_limited", retryAfterMs: (error as { retryAfterMs?: number }).retryAfterMs };
  if (status === 404) return { status: "gone" };
  if (status === 424 || status === 401 || status === 403) return { status: "unauthorized" };
  return { status: "failed" };
};

interface UserSession { client: CollectorClient; energyDevices: () => Promise<Set<string>> }

export async function collectEnergy(db: MongoDatabase, options: CollectOptions): Promise<CollectionResult> {
  const started = Date.now();
  const result: CollectionResult = { claimed: 0, saved: 0, failed: 0, skipped: 0, rateLimited: 0, durationMs: 0, avgDeviceMs: 0, externalCalls: 0, stoppedBy: "queue" };
  if (!options.enabled) return { ...result, stoppedBy: "disabled" };
  const now = options.now ?? (() => new Date());
  const integration = options.integration ?? ((token: string) => new SmartThingsIntegration(token, COLLECTION_LIMITS.requestTimeoutMs));
  const getToken = options.token ?? ((userId: string) => resolveAccessToken(db, userId));
  const stopAt = started + bounded(options.deadlineMs, 0, 0, COLLECTION_LIMITS.maxDeadlineMs);
  const intervalMs = (Number.isFinite(options.intervalMinutes) ? Math.max(5, options.intervalMinutes) : 30) * 60000;
  const budget = bounded(options.maxDevices, 0, 0, COLLECTION_LIMITS.maxDevicesPerRun);
  const concurrency = bounded(options.concurrency, 1, 1, COLLECTION_LIMITS.maxConcurrency);
  const perUser = bounded(options.perUserConcurrency, 1, 1, COLLECTION_LIMITS.maxPerUserConcurrency);
  // A claim must outlive the slowest device (token refresh + list + read at
  // their timeouts). The lease id also turns a late finish into a no-op.
  const leaseMs = Math.max(60000, 3 * COLLECTION_LIMITS.requestTimeoutMs + 10000);
  if (budget === 0) return { ...result, stoppedBy: "budget" };

  // Register new or re-enabled devices (bounded page) before serving the queue.
  await db.syncEnergyCollection(now());

  // Per run: one token, one client and one device list per user.
  const sessions = new Map<string, Promise<UserSession | null>>();
  const sessionFor = (userId: string) => {
    let session = sessions.get(userId);
    if (!session) {
      session = getToken(userId).then((token) => {
        if (!token) return null;
        const client = integration(token);
        let list: Promise<Set<string>> | null = null;
        return {
          client,
          energyDevices: () => {
            list ??= (async () => {
              result.externalCalls++;
              if (client.listEnergyDeviceIds) return client.listEnergyDeviceIds(ENERGY_CAPABILITIES);
              const devices = await client.listDevices!();
              return new Set(devices.filter((device) => device.capabilities?.some((capability) => ENERGY_CAPABILITIES.includes(capability))).map((device) => device.id));
            })();
            return list;
          },
        };
      });
      sessions.set(userId, session);
    }
    return session;
  };
  const inFlight = new Map<string, number>();
  const restingUntil = new Map<string, number>();
  let deviceMs = 0;
  let reserved = 0;
  let stop: CollectionResult["stoppedBy"] | null = null;

  const worker = async () => {
    while (!stop) {
      if (reserved >= budget) { stop = "budget"; break; }
      // Never start a device that cannot finish before the deadline.
      if (Date.now() + COLLECTION_LIMITS.requestTimeoutMs + 1500 > stopAt) { stop = "deadline"; break; }
      reserved++;
      const claimedAt = now();
      // Users at their per-user cap or resting after a 429 are skipped by the
      // claim itself, so a busy account never blocks the others.
      const busy = [...inFlight].filter(([, count]) => count >= perUser).map(([id]) => id);
      const resting = [...restingUntil].filter(([, until]) => until > Date.now()).map(([id]) => id);
      const claim = await db.claimEnergyCollection(claimedAt, leaseMs, 20, [...busy, ...resting]);
      if (!claim) {
        reserved--;
        // Rows left may belong to users busy right now: wait for their reads
        // to finish instead of ending the run, until nothing is in flight.
        if ([...inFlight.values()].some((count) => count > 0) && Date.now() + COLLECTION_LIMITS.requestTimeoutMs + 1500 <= stopAt) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          continue;
        }
        stop = "queue";
        break;
      }
      const { appliance, key, leaseId, lagMs } = claim;
      const userId = appliance.userId;
      // Another worker may have taken a slot for this user meanwhile: give the
      // device back untouched (schedule unchanged) and look again.
      if ((inFlight.get(userId) ?? 0) >= perUser) {
        reserved--;
        await db.releaseEnergyCollection(key, leaseId);
        continue;
      }
      result.claimed++;
      inFlight.set(userId, (inFlight.get(userId) ?? 0) + 1);
      const t0 = Date.now();
      let outcome: EnergyCollectionOutcome;
      try {
        const session = await sessionFor(userId);
        if (!session) {
          outcome = { status: "unauthorized" };
          result.skipped++;
        } else if (!(await session.energyDevices()).has(appliance.integrationDeviceId!)) {
          // Not an energy device (or no longer in the account): never read.
          outcome = { status: "no_reading" };
          result.skipped++;
        } else {
          result.externalCalls++;
          const read = session.client.getDeviceReading ?? session.client.getDeviceStatus!;
          const { raw } = await read.call(session.client, appliance.integrationDeviceId!);
          const saved = await saveDeviceReading(db, userId, "smartthings", appliance.integrationDeviceId!, raw, now());
          if (saved) { outcome = { status: "ok" }; result.saved++; } else { outcome = { status: "no_reading" }; result.skipped++; }
        }
      } catch (error) {
        outcome = classify(error);
        if (outcome.status === "rate_limited") {
          result.rateLimited++;
          const until = Date.now() + (outcome.retryAfterMs ?? 60000);
          restingUntil.set(userId, until);
          await db.postponeEnergyCollectionForUser(userId, now(), new Date(now().getTime() + (until - Date.now())));
        } else if (outcome.status === "unauthorized") {
          result.skipped++;
          sessions.set(userId, Promise.resolve(null));
        } else if (outcome.status === "gone") result.skipped++;
        else result.failed++;
      } finally {
        inFlight.set(userId, (inFlight.get(userId) ?? 1) - 1);
      }
      const elapsed = Date.now() - t0;
      deviceMs += elapsed;
      await db.finishEnergyCollection(key, now(), intervalMs, { ...outcome!, durationMs: elapsed, lagMs }, leaseId);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  result.durationMs = Date.now() - started;
  result.avgDeviceMs = result.claimed ? Math.round(deviceMs / result.claimed) : 0;
  result.stoppedBy = stop ?? "queue";
  if (options.record !== false) await db.recordEnergyCollectionRun({ ...result, budget, concurrency, perUser, at: now() }).catch(() => undefined);
  return result;
}
