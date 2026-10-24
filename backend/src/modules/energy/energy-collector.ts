import { MongoDatabase } from "../../storage/mongo-db";
import { SmartThingsIntegration } from "../integrations/providers/smartthings";
import { ENERGY_CAPABILITIES, saveDeviceReading } from "./energy-history";
import { resolveAccessToken } from "../integrations/smartthings-oauth";

export type CollectionResult = { claimed: number; saved: number; failed: number; skipped: number };

export async function collectEnergy(db: MongoDatabase, options: {
  enabled: boolean; intervalMinutes: number; maxDevices: number; deadlineMs: number;
  now?: () => Date;
  integration?: (token: string) => Pick<SmartThingsIntegration, "listDevices" | "getDeviceStatus">;
}): Promise<CollectionResult> {
  const result = { claimed: 0, saved: 0, failed: 0, skipped: 0 };
  if (!options.enabled) return result;
  const now = options.now ?? (() => new Date());
  const integration = options.integration ?? ((token: string) => new SmartThingsIntegration(token, 4000));
  const stopAt = Date.now() + (Number.isFinite(options.deadlineMs) ? Math.max(0, Math.min(options.deadlineMs, 20000)) : 0);
  const intervalMs = (Number.isFinite(options.intervalMinutes) ? Math.max(5, options.intervalMinutes) : 30) * 60000;
  const maxDevices = Number.isFinite(options.maxDevices) ? Math.max(0, Math.min(Math.floor(options.maxDevices), 3)) : 0;
  // Register new or re-enabled devices (bounded page) before serving the queue.
  if (maxDevices > 0) await db.syncEnergyCollection(now());
    for (let i = 0; i < maxDevices && Date.now() < stopAt - 1000; i++) {
    const claim = await db.claimEnergyCollection(now(), 60000);
    if (!claim) break;
    result.claimed++;
    let success = false;
    try {
      const { appliance } = claim;
      const token = await resolveAccessToken(db, appliance.userId);
      if (!token) { result.skipped++; success = true; continue; }
      const client = integration(token);
      const devices = await client.listDevices();
      if (!devices.some((device) => device.id === appliance.integrationDeviceId && device.capabilities?.some((capability) => ENERGY_CAPABILITIES.includes(capability)))) {
        result.skipped++; success = true; continue;
      }
      const status = await client.getDeviceStatus(appliance.integrationDeviceId!);
      const saved = await saveDeviceReading(db, appliance.userId, "smartthings", appliance.integrationDeviceId!, status.raw, now());
      if (!saved) { result.skipped++; success = true; continue; }
      result.saved++;
      success = true;
    } catch {
      result.failed++;
    } finally {
      await db.finishEnergyCollection(claim.key, now(), intervalMs, success);
    }
  }
  return result;
}
